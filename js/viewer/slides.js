// Marin Learn - Slide Deck Viewer
import { loadLearningSetGraph } from '../core/graph.js';
import { buildPresentationModel } from '../core/presentation.js';
import { escapeHtml } from '../core/utils.js';
import { renderSlideCanvasInnerHtml, renderSpeakerNotesHtml } from '../renderers/slides-html.js';
import { courseIconSvg } from './course-card.js';
import { breadcrumbHtml, wireBreadcrumb } from './breadcrumb.js';

export async function renderSlideViewer(container, setSlug, resourceSlug, catalogItems, onNavigate) {
  container.innerHTML = '<div class="catalog-status" aria-live="polite">Loading Marin Learn…</div>';

  const catalogEntry = catalogItems.find((item) => item.identifier === setSlug);
  if (!catalogEntry) {
    renderError(container, 'Course not found.', setSlug, onNavigate);
    return;
  }

  try {
    const graphData = await loadLearningSetGraph(catalogEntry.graphUrl);
    const presentation = selectPresentation(graphData.presentations, resourceSlug);

    if (!presentation) {
      renderError(container, 'No presentation found in this course.', setSlug, onNavigate);
      return;
    }

    const markdownCache = new Map();
    const model = await buildPresentationModel({
      graphDocument: graphData.raw,
      presentationId: presentation['@id'],
      getMarkdown: async ({ path }) => {
        if (!path) return null;
        if (!markdownCache.has(path)) {
          const request = fetch(`learning/${setSlug}/${path}`, { cache: 'no-cache' })
            .then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status} for ${path}`);
              return response.text();
            });
          markdownCache.set(path, request);
        }
        return markdownCache.get(path);
      }
    });

    const slides = model.slides;
    if (!slides.length) {
      renderError(container, 'Presentation contains no slides.', setSlug, onNavigate);
      return;
    }

    // Title slide: the course icon above the title, and a description below it. The
    // description is the abstract of the Note the deck is based on, else the course's.
    const basedOn = (presentation.isBasedOn || []).map((ref) => graphData.byId.get(ref?.['@id'])).find(Boolean);
    const titleExtras = {
      iconHtml: courseIconSvg(setSlug),
      description: basedOn?.abstract || catalogEntry.abstract || ''
    };

    const footer = { iconHtml: courseIconSvg(setSlug), title: basedOn?.name || catalogEntry.name };

    const markdownOptions = createMarkdownOptions(graphData, setSlug);
    let currentIndex = 0;
    let showNotes = false;

    // Build the persistent shell once so fullscreen state survives slide changes.
    container.innerHTML = `
      ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: catalogEntry.name, route: { set: setSlug } }, { label: 'Deck' }])}
      <div class="slides-viewer-container" role="region" aria-label="Deck">
        <header class="slides-top-bar">
          <div class="slides-title-info">
            <span class="slides-pres-name">${escapeHtml(model.presentation.name)}</span>
            <span id="slides-counter" class="slides-counter">Slide 1 of ${slides.length}</span>
          </div>
          <div class="slides-top-actions">
            <button id="toggle-notes" class="secondary outline" aria-pressed="false">Speaker Notes</button>
            <button id="toggle-fullscreen" class="secondary outline">Fullscreen</button>
          </div>
        </header>

        <div class="slide-canvas-wrapper">
          <div id="slide-canvas-el" class="slide-canvas" role="region" aria-labelledby="slide-title-el"></div>
        </div>

        <footer class="slides-control-bar">
          <button id="prev-slide" class="secondary">&larr; Previous</button>
          <div class="slides-keyboard-hint">Use Left/Right arrow keys or click slide canvas to navigate</div>
          <button id="next-slide" class="primary">Next &rarr;</button>
        </footer>

        <div id="slides-notes-container"></div>
      </div>`;

    const counter = container.querySelector('#slides-counter');
    const canvasEl = container.querySelector('#slide-canvas-el');
    const prevBtn = container.querySelector('#prev-slide');
    const nextBtn = container.querySelector('#next-slide');
    const notesBtn = container.querySelector('#toggle-notes');
    const notesContainer = container.querySelector('#slides-notes-container');

    function updateSlide() {
      const slide = slides[currentIndex];
      counter.textContent = `Slide ${currentIndex + 1} of ${slides.length}`;

      canvasEl.className = `slide-canvas slide-layout--${slide.layout}`;
      canvasEl.innerHTML = renderSlideCanvasInnerHtml(slide, {
        titleId: 'slide-title-el',
        titleExtras,
        footer,
        markdownOptions,
        missingAbstractText: 'No short summary is available for this content block.'
      });

      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === slides.length - 1;

      notesBtn.classList.toggle('active', showNotes);
      notesBtn.setAttribute('aria-pressed', showNotes ? 'true' : 'false');

      if (showNotes) {
        notesContainer.innerHTML = `
          <aside class="slides-notes-panel" aria-label="Speaker notes">
            <header class="slides-notes-header">
              <h4>Speaker Notes (Slide ${currentIndex + 1})</h4>
              <button id="close-notes" class="link-button">Close Notes</button>
            </header>
            <div class="slides-notes-body">
              ${renderSpeakerNotesHtml(slide, {
                markdownOptions,
                emptyNotesHtml: '<p class="text-muted">No speaker notes provided for this slide.</p>'
              })}
            </div>
          </aside>`;
        notesContainer.querySelector('#close-notes')?.addEventListener('click', () => {
          showNotes = false;
          updateSlide();
        });
      } else {
        notesContainer.innerHTML = '';
      }
    }

    wireBreadcrumb(container, onNavigate);

    prevBtn.addEventListener('click', () => {
      if (currentIndex > 0) {
        currentIndex -= 1;
        updateSlide();
      }
    });

    nextBtn.addEventListener('click', () => {
      if (currentIndex < slides.length - 1) {
        currentIndex += 1;
        updateSlide();
      }
    });

    notesBtn.addEventListener('click', () => {
      showNotes = !showNotes;
      updateSlide();
    });

    container.querySelector('#toggle-fullscreen')?.addEventListener('click', () => {
      const wrapper = container.querySelector('.slides-viewer-container');
      if (!document.fullscreenElement) {
        wrapper?.requestFullscreen?.();
      } else {
        document.exitFullscreen?.();
      }
    });

    canvasEl.addEventListener('click', (event) => {
      if (event.target.closest('a, button')) return;
      const rect = canvasEl.getBoundingClientRect();
      const clickX = event.clientX - rect.left;
      if (clickX < rect.width / 3) {
        if (currentIndex > 0) {
          currentIndex -= 1;
          updateSlide();
        }
      } else if (currentIndex < slides.length - 1) {
        currentIndex += 1;
        updateSlide();
      }
    });

    function handleKeyDown(event) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault();
        if (currentIndex < slides.length - 1) {
          currentIndex += 1;
          updateSlide();
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault();
        if (currentIndex > 0) {
          currentIndex -= 1;
          updateSlide();
        }
      } else if (event.key === 'Home') {
        event.preventDefault();
        currentIndex = 0;
        updateSlide();
      } else if (event.key === 'End') {
        event.preventDefault();
        currentIndex = slides.length - 1;
        updateSlide();
      }
    }

    if (window._slideKeyHandler) {
      window.removeEventListener('keydown', window._slideKeyHandler);
    }
    window._slideKeyHandler = handleKeyDown;
    window.addEventListener('keydown', handleKeyDown);

    updateSlide();
  } catch (error) {
    renderError(container, error.message || 'Failed to load presentation.', setSlug, onNavigate);
  }
}

function selectPresentation(presentations, resourceSlug) {
  if (resourceSlug) {
    const selected = presentations.find((presentation) => (
      presentation.identifier === resourceSlug ||
      presentation['@id'] === resourceSlug ||
      presentation['@id'] === `urn:uuid:${resourceSlug}`
    ));
    if (selected) return selected;
  }
  return presentations[0] || null;
}

function createMarkdownOptions(graphData, setSlug) {
  return {
    resolveRef: (uuid) => {
      const target = graphData.byId.get(`urn:uuid:${uuid}`) || graphData.byId.get(uuid);
      return target
        ? `?set=${encodeURIComponent(graphData.learningSet.identifier)}&view=read&resource=${encodeURIComponent(target.identifier || uuid)}`
        : false;
    },
    resolveAsset: (uuid) => {
      const asset = graphData.byId.get(`urn:uuid:${uuid}`) || graphData.byId.get(uuid);
      return asset?.contentUrl ? `learning/${encodeURIComponent(setSlug)}/${asset.contentUrl}` : null;
    }
  };
}

function renderError(container, message, setSlug, onNavigate) {
  container.innerHTML = `
    <div class="catalog-error-box">
      ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: 'Error' }])}
      <h3>Deck error</h3>
      <p>${escapeHtml(message)}</p>
    </div>`;
  wireBreadcrumb(container, onNavigate);
}
