// Marin Learn Authoring - browser PowerPoint export controller
import { TYPES } from '../../js/core/constants.js';
import { getObjects, sequenceItems } from '../../js/core/model.js';
import { downloadBlob as downloadBrowserBlob } from '../../js/core/utils.js';
import {
  analyzePresentationForPptx,
  exportPresentationToPptx,
  pptxBytesToBlob
} from '../../js/pptx/index.js';
import { PptxExportError, pptxDiagnostic } from '../../js/pptx/errors.js';

const POWERPOINT_LABEL = 'Download PowerPoint';
const POWERPOINT_BUSY_LABEL = 'Creating PowerPoint...';

export function choosePptxPresentationId(presentations, selectedId = null, preferredId = null) {
  const ids = new Set((presentations || []).map((presentation) => presentation?.['@id']).filter(Boolean));
  if (selectedId && ids.has(selectedId)) return selectedId;
  if (preferredId && ids.has(preferredId)) return preferredId;
  return presentations?.[0]?.['@id'] || null;
}

export function pptxDiagnosticContext(diagnostic = {}) {
  const position = Number(diagnostic.slidePosition);
  const title = String(diagnostic.slideTitle || '').trim();
  if (Number.isFinite(position) && position > 0 && title) return `Slide ${position}: ${title}`;
  if (Number.isFinite(position) && position > 0) return `Slide ${position}`;
  if (title) return title;
  return '';
}

export function pptxDiagnosticDisplayMessage(diagnostic = {}) {
  const original = String(diagnostic.message || 'Review this slides issue.').trim();
  const title = String(diagnostic.slideTitle || '').trim();
  const position = Number(diagnostic.slidePosition);
  let message = original;

  if (title) {
    const titlePrefix = `Slide title “${title}” `;
    const slidePrefix = `Slide “${title}” `;
    const splitPrefix = `A split column on slide “${title}” `;
    if (message.startsWith(titlePrefix)) {
      message = `The title ${message.slice(titlePrefix.length)}`;
    } else if (message.startsWith(slidePrefix)) {
      message = sentenceCase(message.slice(slidePrefix.length));
    } else if (message.startsWith(splitPrefix)) {
      message = `A split column ${message.slice(splitPrefix.length)}`;
    }
  }

  if (Number.isFinite(position) && position > 0) {
    const positionPrefix = `Slide ${position} `;
    if (message.startsWith(positionPrefix)) message = sentenceCase(message.slice(positionPrefix.length));
  }

  return message || original;
}

export function createPptxExportModule({
  getPkg,
  getPreferredPresentationId = () => null,
  showMessage,
  onOpenSlides = () => {},
  onFixDiagnostic = () => {},
  analyzePresentation = analyzePresentationForPptx,
  exportPresentation = exportPresentationToPptx,
  bytesToBlob = pptxBytesToBlob,
  downloadBlob = downloadBrowserBlob
}) {
  const section = document.getElementById('pptx-export-section');
  const emptyState = document.getElementById('pptx-export-empty');
  const controls = document.getElementById('pptx-export-controls');
  const select = document.getElementById('pptx-presentation-select');
  const button = document.getElementById('btn-export-pptx');
  const results = document.getElementById('pptx-export-results');
  const openSlidesButton = document.getElementById('btn-pptx-open-slides');

  let selectedPresentationId = null;
  let lastPreflight = null;
  let operationToken = 0;
  let exporting = false;

  select?.addEventListener('change', () => {
    selectedPresentationId = select.value || null;
    void refreshPreflight();
  });
  button?.addEventListener('click', () => void downloadSelectedPresentation());
  openSlidesButton?.addEventListener('click', () => onOpenSlides());

  async function render() {
    if (exporting) return;
    const pkg = getPkg?.();
    const presentations = pkg ? getObjects(pkg, TYPES.PRESENTATION) : [];
    selectedPresentationId = choosePptxPresentationId(
      presentations,
      selectedPresentationId,
      getPreferredPresentationId?.()
    );
    renderPresentationOptions(presentations);

    const hasPresentations = presentations.length > 0;
    emptyState?.classList.toggle('editor-hidden', hasPresentations);
    controls?.classList.toggle('editor-hidden', !hasPresentations);
    results?.replaceChildren();
    lastPreflight = null;

    if (!hasPresentations) {
      operationToken += 1;
      setSectionBusy(false);
      setButtonAvailability(false);
      return;
    }

    await refreshPreflight();
  }

  async function refreshPreflight({ focusOnFailure = false } = {}) {
    const pkg = getPkg?.();
    const presentationId = selectedPresentationId;
    if (!pkg || !presentationId || exporting) return null;

    const token = ++operationToken;
    lastPreflight = null;
    setSectionBusy(true);
    setButtonAvailability(false);
    renderProgress('Checking whether these slides are ready for PowerPoint...');

    let preflight;
    try {
      preflight = await analyzePresentation(pkg, presentationId);
    } catch (error) {
      preflight = {
        status: 'fail',
        errors: [pptxDiagnostic(
          'error',
          'pptx-preflight-unavailable',
          'Marin Learn could not check these slides for PowerPoint export.',
          { cause: error?.message || String(error), presentationId }
        )],
        warnings: []
      };
    }

    if (token !== operationToken) return null;
    lastPreflight = preflight;
    setSectionBusy(false);
    renderPreflight(preflight);
    setButtonAvailability(preflight.status === 'pass');
    if (focusOnFailure && preflight.status !== 'pass') focusResultHeading();
    return preflight;
  }

  async function downloadSelectedPresentation() {
    const pkg = getPkg?.();
    const presentationId = selectedPresentationId;
    if (!pkg || !presentationId || exporting) return;

    const token = ++operationToken;
    exporting = true;
    setSectionBusy(true);
    setButtonAvailability(false);
    if (button) button.textContent = POWERPOINT_BUSY_LABEL;
    renderProgress('Creating and checking the PowerPoint file...');
    showMessage?.('Creating the PowerPoint file in this browser...', 'information', { focus: false });

    let focusAfter = button;
    try {
      const result = await exportPresentation(pkg, presentationId);
      if (token !== operationToken) return;
      downloadBlob(bytesToBlob(result.bytes), result.filename);
      lastPreflight = {
        status: 'pass',
        errors: [],
        warnings: result.warnings || []
      };
      renderDownloadSuccess(result);
      showMessage?.('PowerPoint downloaded. It was generated in this browser and was not added to the learning package.', 'success', { focus: false });
    } catch (error) {
      if (token !== operationToken) return;
      const authoringFailure = error instanceof PptxExportError && error.code === 'pptx-preflight-failed';
      const diagnostics = normalizeExportDiagnostics(error, presentationId, authoringFailure);
      if (authoringFailure) {
        lastPreflight = { status: 'fail', errors: diagnostics, warnings: [] };
        renderPreflight(lastPreflight);
        showMessage?.('Fix the PowerPoint issues before downloading these slides.', 'error', { focus: false });
      } else {
        renderInternalFailure(diagnostics);
        showMessage?.('The PowerPoint file could not be created. Your learning project was not changed.', 'error', { focus: false });
      }
      focusAfter = results?.querySelector('[data-pptx-result-heading]') || results;
    } finally {
      if (token === operationToken) {
        exporting = false;
        setSectionBusy(false);
        if (button) button.textContent = POWERPOINT_LABEL;
        setButtonAvailability(lastPreflight?.status === 'pass');
        requestAnimationFrame(() => focusAfter?.focus());
      }
    }
  }

  function renderPresentationOptions(presentations) {
    if (!select) return;
    const options = presentations.map((presentation) => {
      const option = document.createElement('option');
      option.value = presentation['@id'];
      const slideCount = sequenceItems(presentation, 'marin:slideSequence').length;
      option.textContent = `${presentation.name || presentation.identifier || 'Untitled slides'} - ${slideCount} slide${slideCount === 1 ? '' : 's'}`;
      return option;
    });
    select.replaceChildren(...options);
    select.value = selectedPresentationId || '';
  }

  function renderProgress(message) {
    if (!results) return;
    const paragraph = document.createElement('p');
    paragraph.className = 'editor-pptx-progress';
    paragraph.textContent = message;
    results.replaceChildren(paragraph);
  }

  function renderPreflight(preflight) {
    if (!results) return;
    const fragments = [];
    if (preflight.status === 'pass' && !preflight.warnings?.length) {
      fragments.push(createStatusAlert(
        'success',
        'Ready to download',
        'The selected slides passed the PowerPoint checks.'
      ));
    } else if (preflight.status === 'pass') {
      fragments.push(createDiagnosticAlert(
        'warning',
        'Ready with items to review',
        'PowerPoint can be created, but review these items.',
        preflight.warnings || []
      ));
    } else {
      fragments.push(createDiagnosticAlert(
        'danger',
        'PowerPoint is not ready',
        'Fix these slides issues before downloading PowerPoint.',
        preflight.errors || []
      ));
      if (preflight.warnings?.length) {
        fragments.push(createDiagnosticAlert(
          'warning',
          'Additional items to review',
          '',
          preflight.warnings
        ));
      }
    }
    results.replaceChildren(...fragments);
  }

  function renderDownloadSuccess(result) {
    if (!results) return;
    const fragments = [createStatusAlert(
      'success',
      'PowerPoint downloaded',
      `${result.filename} was generated and checked in this browser.`
    )];
    if (result.warnings?.length) {
      fragments.push(createDiagnosticAlert(
        'warning',
        'Items to review in PowerPoint',
        'These nonblocking items remain relevant to the downloaded file.',
        result.warnings
      ));
    }
    results.replaceChildren(...fragments);
  }

  function renderInternalFailure(diagnostics) {
    if (!results) return;
    results.replaceChildren(createDiagnosticAlert(
      'danger',
      'PowerPoint could not be created',
      'The export stopped before a file was downloaded. Try again after reloading Marin Learn. If the problem continues, report it to the Marin Learn maintainers.',
      diagnostics,
      { allowFix: false }
    ));
  }

  function createStatusAlert(severity, title, message) {
    const alert = document.createElement('div');
    alert.className = `app-alert app-alert--${severity}`;
    const heading = document.createElement('h5');
    heading.dataset.pptxResultHeading = '';
    heading.tabIndex = -1;
    heading.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = message;
    alert.append(heading, paragraph);
    return alert;
  }

  function createDiagnosticAlert(severity, title, intro, diagnostics, { allowFix = true } = {}) {
    const alert = document.createElement('div');
    alert.className = `app-alert app-alert--${severity}`;
    const heading = document.createElement('h5');
    heading.dataset.pptxResultHeading = '';
    heading.tabIndex = -1;
    heading.textContent = title;
    alert.append(heading);
    if (intro) {
      const paragraph = document.createElement('p');
      paragraph.textContent = intro;
      alert.append(paragraph);
    }

    const list = document.createElement('ul');
    list.className = 'editor-diagnostic-list';
    for (const diagnostic of diagnostics || []) {
      const item = document.createElement('li');
      item.className = 'editor-diagnostic-item';
      item.dataset.pptxDiagnosticCode = diagnostic.code || 'pptx-diagnostic';
      const body = document.createElement('div');
      body.className = 'editor-diag-body';
      const context = pptxDiagnosticContext(diagnostic);
      if (context) {
        const strong = document.createElement('strong');
        strong.textContent = `${context}: `;
        body.append(strong);
      }
      const message = document.createElement('span');
      message.textContent = pptxDiagnosticDisplayMessage(diagnostic);
      body.append(message);
      item.append(body);

      if (allowFix && canFixDiagnostic(diagnostic)) {
        const fix = document.createElement('button');
        fix.type = 'button';
        fix.className = 'secondary outline btn-sm btn-fix-diagnostic';
        fix.textContent = 'Fix';
        fix.addEventListener('click', () => onFixDiagnostic(diagnostic));
        item.append(fix);
      }
      list.append(item);
    }
    alert.append(list);
    return alert;
  }

  function setSectionBusy(isBusy) {
    section?.setAttribute('aria-busy', String(Boolean(isBusy)));
    if (select) select.disabled = Boolean(isBusy);
  }

  function setButtonAvailability(isAvailable) {
    if (!button) return;
    button.disabled = !isAvailable || exporting;
    button.setAttribute('aria-disabled', String(button.disabled));
  }

  function focusResultHeading() {
    (results?.querySelector('[data-pptx-result-heading]') || results)?.focus();
  }

  return {
    render,
    refreshPreflight,
    getSelectedPresentationId: () => selectedPresentationId,
    setSelectedPresentationId: (id) => { selectedPresentationId = id || null; }
  };
}

function sentenceCase(value) {
  const text = String(value || '').trimStart();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

function canFixDiagnostic(diagnostic) {
  return Boolean(diagnostic?.slideId || diagnostic?.presentationId);
}

function normalizeExportDiagnostics(error, presentationId, authoringFailure) {
  const diagnostics = Array.isArray(error?.details?.diagnostics) ? error.details.diagnostics : [];
  if (diagnostics.length) return diagnostics;
  return [pptxDiagnostic(
    'error',
    authoringFailure ? 'pptx-preflight-failed' : 'pptx-export-failed',
    authoringFailure
      ? 'The selected slides did not pass the PowerPoint checks.'
      : 'Marin Learn stopped the export because the generated file did not pass its checks.',
    { presentationId }
  )];
}
