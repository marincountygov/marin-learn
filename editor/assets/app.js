import { isSupportedImageType, sniffMediaType, validateAssetBytes } from '../../js/core/assets.js';
import { TYPES } from '../../js/core/constants.js';
import { markdownToPlainText } from '../../js/core/markdown.js';
import {
  appendSequenceItem,
  createContentUnit,
  createEmptyPackage,
  createImageAsset,
  createMaterial,
  getObject,
  getObjects,
  graph,
  hasType,
  rootLearningSet,
  touchPackage
} from '../../js/core/model.js';
import { exportLearningPackage, importLearningPackage, PackageImportError } from '../../js/core/package.js';
import { escapeHtml, downloadBlob, slugify, asArray } from '../../js/core/utils.js';
import { validatePackage } from '../../js/core/validate.js';
import { loadWorkspace, saveWorkspace } from '../../js/storage.js';
import { createMarkdownEditor } from './rich-editor.js';
import { createMaterialsModule } from './materials.js';
import { createQuizzesModule } from './quizzes.js';
import { createSlidesModule } from './slides.js';
import { createAssetsModule } from './assets.js';
import { showObjectivesManager } from './objectives.js';
import { createPptxExportModule } from './pptx-export.js';
import { createEditorDialogs } from './dialogs.js';

document.addEventListener('DOMContentLoaded', async () => {
  let currentPkg = null;
  let tabsInitialized = false;
  const editorDialogs = createEditorDialogs();

  const editorAppRoot = document.getElementById('editor-app-root');
  const welcomeView = document.getElementById('welcome-view');
  const workspaceView = document.getElementById('workspace-view');
  const recoveryNotice = document.getElementById('recovery-notice');
  const recoveryTitle = document.getElementById('recovery-title');
  const createFormContainer = document.getElementById('create-form-container');
  const statusBadge = document.getElementById('workspace-status-badge');

  // Pico styles file-picker labels through role="button". Delegate keyboard
  // activation so dynamically rendered modal pickers receive the same behavior.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const label = event.target.closest?.('label[role="button"]');
    if (!label || !editorAppRoot?.contains(label)) return;
    const input = label.querySelector('input[type="file"]');
    if (!input || input.disabled) return;
    event.preventDefault();
    input.click();
  });

  function updateOverviewObjectivesSummary() {
    const summaryEl = document.getElementById('overview-goals-summary');
    if (!summaryEl || !currentPkg) return;
    const objectives = getObjects(currentPkg, TYPES.OBJECTIVE);
    if (!objectives.length) {
      summaryEl.textContent = 'Learning goals are optional when starting out, but helpful for organizing content and quizzes.';
    } else {
      summaryEl.textContent = `${objectives.length} learning objective${objectives.length === 1 ? '' : 's'} defined for this project.`;
    }
  }

  document.getElementById('btn-manage-objectives-overview')?.addEventListener('click', () => {
    showObjectivesManager(document.getElementById('start'), {
      getPkg: () => currentPkg,
      persistWorkspace,
      showMessage,
      dialogs: editorDialogs,
      onUpdate: () => {
        updateOverviewObjectivesSummary();
      }
    });
  });

  const materialsModule = createMaterialsModule({
    getPkg: () => currentPkg,
    persistWorkspace,
    showMessage,
    dialogs: editorDialogs
  });

  try {
    const saved = await loadWorkspace();
    if (saved?.pkg) {
      currentPkg = saved.pkg;
      const learningSet = rootLearningSet(currentPkg);
      recoveryTitle.textContent = learningSet?.name || 'Untitled Project';
      recoveryNotice.classList.remove('editor-hidden');
    }
  } catch (error) {
    console.error('Failed to load local workspace:', error);
  }

  document.getElementById('btn-recover').addEventListener('click', () => {
    if (currentPkg) enterWorkspace();
  });

  document.getElementById('btn-new-project').addEventListener('click', () => {
    document.getElementById('btn-new-project').classList.add('editor-hidden');
    document.getElementById('file-import-zip').parentElement.classList.add('editor-hidden');
    recoveryNotice.classList.add('editor-hidden');
    createFormContainer.classList.remove('editor-hidden');
    document.getElementById('new-proj-title').focus();
  });

  document.getElementById('btn-cancel-create').addEventListener('click', () => {
    createFormContainer.classList.add('editor-hidden');
    document.getElementById('btn-new-project').classList.remove('editor-hidden');
    document.getElementById('file-import-zip').parentElement.classList.remove('editor-hidden');
    if (currentPkg) recoveryNotice.classList.remove('editor-hidden');
  });

  document.getElementById('btn-submit-create').addEventListener('click', async () => {
    const titleInput = document.getElementById('new-proj-title');
    const descriptionInput = document.getElementById('new-proj-desc');
    const title = titleInput.value.trim();
    if (!title) {
      showMessage('Enter a project title.', 'error');
      titleInput.focus();
      return;
    }
    currentPkg = createEmptyPackage(title, descriptionInput.value.trim());
    await persistWorkspace();
    enterWorkspace();
  });

  document.getElementById('file-import-zip').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setStatus('Opening package…');
      const result = await importLearningPackage(await file.arrayBuffer(), { filename: file.name });
      currentPkg = result.pkg;
      materialsModule.setActiveMaterialId(null);
      quizzesModule.setActiveQuizId(null);
      slidesModule.setActiveDeckId(null);
      await persistWorkspace();
      enterWorkspace();
      if (result.validation.warnings.length) {
        showMessage(`Package opened with ${result.validation.warnings.length} warning(s). Review the project before downloading it again.`, 'warning');
      }
    } catch (error) {
      const diagnostics = error instanceof PackageImportError ? error.validation?.diagnostics || [] : [];
      const detail = diagnostics.slice(0, 5).map((item) => item.message).join('\n');
      showMessage(`The learning package could not be opened.${detail ? `\n\n${detail}` : ` ${error.message}`}`, 'error');
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('proj-name').addEventListener('input', (event) => {
    if (!currentPkg) return;
    const learningSet = rootLearningSet(currentPkg);
    if (!learningSet) return;
    learningSet.identifier = slugify(event.target.value, 'learning-project');
    document.getElementById('proj-identifier').value = learningSet.identifier;
  });

  document.getElementById('btn-save-overview').addEventListener('click', async () => {
    const learningSet = rootLearningSet(currentPkg);
    if (!learningSet) return;
    learningSet.name = document.getElementById('proj-name').value.trim() || learningSet.name;
    learningSet.identifier = slugify(document.getElementById('proj-identifier').value, 'learning-project');
    learningSet.abstract = document.getElementById('proj-abstract').value.trim() || undefined;
    learningSet.educationalLevel = document.getElementById('proj-level').value;
    learningSet.creativeWorkStatus = document.getElementById('proj-status').value;
    touchPackage(currentPkg);
    await persistWorkspace();
    updateWorkspaceHeader();
    showMessage('Project details saved.', 'success');
  });

  document.getElementById('btn-add-material')?.addEventListener('click', createNewMaterial);

  document.getElementById('file-add-asset').addEventListener('change', async (event) => {
    const file = event.target.files?.[0];
    if (!file || !currentPkg) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detectedType = sniffMediaType(bytes);
      if (!isSupportedImageType(detectedType)) throw new Error('Only PNG, JPEG, GIF, WebP, and safe SVG images are supported in this phase.');
      const issues = validateAssetBytes(bytes, detectedType, file.name);
      const errors = issues.filter((issue) => issue.severity === 'error');
      if (errors.length) throw new Error(errors.map((issue) => issue.message).join(' '));
      createImageAsset(currentPkg, { name: file.name, type: detectedType, bytes });
      await persistWorkspace();
      renderAssetsTab();
      showMessage('Image added to this learning project.', 'success');
    } catch (error) {
      showMessage(`The image could not be added. ${error.message}`, 'error');
    } finally {
      event.target.value = '';
    }
  });

  document.getElementById('btn-run-validation').addEventListener('click', renderValidationResults);

  document.getElementById('btn-export-zip').addEventListener('click', async () => {
    if (!currentPkg) return;
    try {
      const validation = validatePackage(currentPkg);
      if (!validation.valid) {
        activateTab('export');
        renderValidationResults();
        showMessage('Fix the blocking issues before downloading the learning package.', 'error');
        return;
      }
      const result = await exportLearningPackage(currentPkg);
      const learningSet = rootLearningSet(currentPkg);
      const filename = `${learningSet?.identifier || 'learning-set'}.zip`;
      downloadBlob(new Blob([result.bytes], { type: 'application/zip' }), filename);
      showMessage('Learning package downloaded. This does not publish it to the catalog.', 'success');
    } catch (error) {
      showMessage(`The learning package could not be downloaded. ${error.message}`, 'error');
    }
  });

  function enterWorkspace() {
    welcomeView.classList.add('editor-hidden');
    workspaceView.classList.remove('editor-hidden');
    initializeTabs();
    updateWorkspaceHeader();
    populateOverview();
    updateOverviewObjectivesSummary();
    renderMaterialsTab();
    renderQuizzesTab();
    renderSlidesTab();
    renderAssetsTab();
    activateTab('overview', { focus: false });
  }

  function initializeTabs() {
    if (tabsInitialized) return;
    tabsInitialized = true;
    const buttons = [...document.querySelectorAll('.editor-tab-btn')];
    buttons.forEach((button, index) => {
      button.addEventListener('click', () => activateTab(button.dataset.tab));
      button.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        let nextIndex = index;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + buttons.length) % buttons.length;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % buttons.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = buttons.length - 1;
        buttons[nextIndex].focus();
        activateTab(buttons[nextIndex].dataset.tab, { focus: false });
      });
    });

    document.querySelectorAll('.editor-task-card').forEach((button) => {
      button.addEventListener('click', () => activateTab(button.dataset.gototab));
    });
  }

  function activateTab(tabName, options = {}) {
    const focus = options.focus !== false;
    document.querySelectorAll('.editor-tab-btn').forEach((button) => {
      const selected = button.dataset.tab === tabName;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll('.editor-tab-content').forEach((panel) => {
      const selected = panel.id === `tab-${tabName}`;
      panel.classList.toggle('editor-hidden', !selected);
      panel.hidden = !selected;
    });
    if (tabName === 'materials') renderMaterialsTab();
    else if (tabName === 'quizzes') renderQuizzesTab();
    else if (tabName === 'slides') renderSlidesTab();
    else if (tabName === 'assets') renderAssetsTab();
    else if (tabName === 'export') void pptxExportModule.render();
    if (focus) document.getElementById(`tab-${tabName}`)?.focus();
  }

  function updateWorkspaceHeader() {
    const learningSet = rootLearningSet(currentPkg);
    document.getElementById('workspace-project-title').textContent = learningSet?.name || 'Learning Project';
  }

  function populateOverview() {
    const learningSet = rootLearningSet(currentPkg);
    if (!learningSet) return;
    document.getElementById('proj-name').value = learningSet.name || '';
    document.getElementById('proj-identifier').value = learningSet.identifier || '';
    document.getElementById('proj-abstract').value = learningSet.abstract || learningSet.description || '';
    document.getElementById('proj-level').value = learningSet.educationalLevel || 'introductory';
    document.getElementById('proj-status').value = learningSet.creativeWorkStatus || 'draft';
  }

  function renderMaterialsTab() {
    if (!currentPkg) return;
    const materials = getObjects(currentPkg, TYPES.MATERIAL);
    const container = document.getElementById('materials-list-container');
    materialsModule.render(container);
  }

  const quizzesModule = createQuizzesModule({
    getPkg: () => currentPkg,
    persistWorkspace,
    showMessage,
    dialogs: editorDialogs
  });

  function renderQuizzesTab() {
    if (!currentPkg) return;
    const quizzes = getObjects(currentPkg, TYPES.ASSESSMENT);
    const container = document.getElementById('quizzes-list-container');
    quizzesModule.render(container);
  }

  const slidesModule = createSlidesModule({
    getPkg: () => currentPkg,
    persistWorkspace,
    showMessage,
    dialogs: editorDialogs
  });

  const pptxExportModule = createPptxExportModule({
    getPkg: () => currentPkg,
    getPreferredPresentationId: () => slidesModule.getActiveDeckId(),
    showMessage,
    onOpenSlides: () => activateTab('slides'),
    onFixDiagnostic: (diagnostic) => {
      if (diagnostic?.presentationId) slidesModule.setActiveDeckId(diagnostic.presentationId);
      if (diagnostic?.slideId) {
        navigateToFix('slides', diagnostic.slideId);
        return;
      }
      activateTab('slides');
    }
  });

  function renderSlidesTab() {
    if (!currentPkg) return;
    const presentations = getObjects(currentPkg, TYPES.PRESENTATION);
    const container = document.getElementById('slides-list-container');
    slidesModule.render(container);
  }

  const assetsModule = createAssetsModule({
    getPkg: () => currentPkg,
    persistWorkspace,
    showMessage,
    dialogs: editorDialogs
  });

  function renderAssetsTab() {
    if (!currentPkg) return;
    const assets = graph(currentPkg).filter((object) => hasType(object, TYPES.IMAGE));
    const container = document.getElementById('assets-list-container');
    assetsModule.render(container);
  }

  function renderValidationResults() {
    if (!currentPkg) return;
    const result = validatePackage(currentPkg);
    window.__lastValidation = result;
    window.__currentPkg = currentPkg;
    const container = document.getElementById('validation-results');
    if (!result.errors.length && !result.warnings.length) {
      container.innerHTML = '<div class="app-alert app-alert--success"><h4>No issues found</h4><p>This learning package has no blocking errors or warnings.</p></div>';
      return;
    }
    container.innerHTML = [
      result.errors.length ? diagnosticGroup('Things to fix (blocking errors)', result.errors, 'error') : '',
      result.warnings.length ? diagnosticGroup('Worth reviewing (warnings)', result.warnings, 'warning') : ''
    ].join('');

    container.querySelectorAll('.btn-fix-diagnostic').forEach((btn) => {
      btn.addEventListener('click', () => {
        const route = btn.dataset.route;
        const targetId = btn.dataset.targetId;
        navigateToFix(route, targetId);
      });
    });
  }

  function diagnosticGroup(title, items, severity) {
    const listHtml = items.map((item) => {
      const targetLabel = item.objectName ? `<strong>${escapeHtml(item.objectName)}:</strong> ` : '';
      const canFix = item.route && item.route !== 'validation';
      return `
        <li class="editor-diagnostic-item">
          <div class="editor-diag-body">
            ${targetLabel}<span>${escapeHtml(item.message)}</span>
            ${item.field ? `<span class="text-muted editor-diag-field"> &middot; Field: ${escapeHtml(item.field)}</span>` : ''}
          </div>
          ${canFix ? `<button type="button" class="secondary outline btn-sm btn-fix-diagnostic" data-route="${escapeHtml(item.route)}" data-target-id="${escapeHtml(item.objectId || '')}">Fix</button>` : ''}
        </li>`;
    }).join('');

    return `
      <div class="app-alert app-alert--${severity}">
        <h4>${title}</h4>
        <ul class="editor-diagnostic-list">${listHtml}</ul>
      </div>`;
  }

  function navigateToFix(route, targetId) {
    if (route === 'overview') {
      activateTab('overview');
      document.getElementById('proj-name')?.focus();
      return;
    }
    if (route === 'objectives') {
      showObjectivesManager(document.getElementById('start'), {
        getPkg: () => currentPkg,
        persistWorkspace,
        showMessage,
        dialogs: editorDialogs,
        onUpdate: () => updateOverviewObjectivesSummary()
      });
      return;
    }
    if (route === 'materials' || route === 'content') {
      activateTab('materials');
      if (targetId) {
        const mat = findMaterialContainingItem(currentPkg, targetId);
        if (mat) {
          materialsModule.setActiveMaterialId(mat['@id']);
          renderMaterialsTab();
        }
        const el = document.querySelector(`[data-unit-card="${CSS.escape(targetId)}"]`) ||
                   document.querySelector(`[data-section-id="${CSS.escape(targetId)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
        el?.querySelector('button')?.focus();
      }
      return;
    }
    if (route === 'quizzes') {
      activateTab('quizzes');
      if (targetId) {
        const quiz = findQuizContainingItem(currentPkg, targetId);
        if (quiz) {
          quizzesModule.setActiveQuizId(quiz['@id']);
          renderQuizzesTab();
        }
        const el = document.querySelector(`[data-question-card="${CSS.escape(targetId)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
        el?.querySelector('button')?.focus();
      }
      return;
    }
    if (route === 'slides') {
      activateTab('slides');
      if (targetId) {
        const deck = findDeckContainingItem(currentPkg, targetId);
        if (deck) {
          slidesModule.setActiveDeckId(deck['@id']);
          renderSlidesTab();
        }
        const el = document.querySelector(`[data-slide-card="${CSS.escape(targetId)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
        el?.querySelector('button')?.focus();
      }
      return;
    }
    if (route === 'assets') {
      activateTab('assets');
      if (targetId) {
        const el = document.querySelector(`[data-asset-id="${CSS.escape(targetId)}"]`);
        el?.scrollIntoView({ block: 'nearest' });
        el?.querySelector('button')?.focus();
      }
      return;
    }
  }

  function findMaterialContainingItem(pkg, id) {
    for (const mat of getObjects(pkg, TYPES.MATERIAL)) {
      if (mat['@id'] === id) return mat;
      if (hasItemInSequence(pkg, mat, id)) return mat;
    }
    return getObjects(pkg, TYPES.MATERIAL)[0] || null;
  }

  function hasItemInSequence(pkg, container, id) {
    const entries = asArray(container?.['marin:contentSequence']?.itemListElement);
    for (const e of entries) {
      if (e.item?.['@id'] === id) return true;
      const child = getObject(pkg, e.item?.['@id']);
      if (child && hasType(child, TYPES.SECTION) && hasItemInSequence(pkg, child, id)) return true;
    }
    return false;
  }

  function findQuizContainingItem(pkg, id) {
    for (const quiz of getObjects(pkg, TYPES.ASSESSMENT)) {
      if (quiz['@id'] === id) return quiz;
      const entries = asArray(quiz?.['marin:itemSequence']?.itemListElement);
      if (entries.some((e) => e.item?.['@id'] === id)) return quiz;
    }
    return getObjects(pkg, TYPES.ASSESSMENT)[0] || null;
  }

  function findDeckContainingItem(pkg, id) {
    for (const deck of getObjects(pkg, TYPES.PRESENTATION)) {
      if (deck['@id'] === id) return deck;
      const entries = asArray(deck?.['marin:slideSequence']?.itemListElement);
      if (entries.some((e) => e.item?.['@id'] === id)) return deck;
    }
    return getObjects(pkg, TYPES.PRESENTATION)[0] || null;
  }

  async function persistWorkspace() {
    if (!currentPkg) return;
    setStatus('Saving…');
    await saveWorkspace(currentPkg);
    setStatus('Saved in this browser');
  }

  function setStatus(message) {
    statusBadge.textContent = message;
  }

  function showMessage(message, severity = 'information', options = {}) {
    const region = document.getElementById('editor-status-message');
    if (!region) return;

    const normalizedOptions = options && typeof options === 'object' ? options : {};
    const severityClass = severity === 'success'
      ? 'app-alert--success'
      : severity === 'warning'
        ? 'app-alert--warning'
        : severity === 'error'
          ? 'app-alert--danger'
          : '';

    region.className = `app-alert ${severityClass}`.trim();
    region.replaceChildren();

    const text = document.createElement('span');
    text.className = 'editor-status-text';
    text.textContent = message;
    region.append(text);

    const action = normalizedOptions.action;
    if (action?.label && typeof action.onClick === 'function') {
      region.classList.add('editor-status-with-action');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary outline editor-status-action';
      button.textContent = action.label;
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await action.onClick();
        } catch (error) {
          console.error('Status action failed:', error);
          showMessage('The action could not be completed. Your latest saved work was not changed.', 'error');
        }
      });
      region.append(button);
    }

    region.classList.remove('editor-hidden');
    if (normalizedOptions.focus !== false) region.focus();
  }

  function humanize(value) {
    return String(value).split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }
});
