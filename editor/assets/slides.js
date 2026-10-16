// Marin Learn Authoring - Slide Deck Authoring Module
import { SLIDE_DISPLAY_MODES, SLIDE_LAYOUTS, TYPES } from '../../js/core/constants.js';
import {
  buildPresentationModel,
  DEFAULT_SLIDE_DISPLAY_MODE,
  setSlideContentSequence
} from '../../js/core/presentation.js';
import { renderSlideCanvasInnerHtml, renderSpeakerNotesHtml } from '../../js/renderers/slides-html.js';
import {
  addSlideToPresentation,
  createPresentation,
  createSlide,
  duplicatePresentation,
  duplicateSlide,
  getObject,
  getObjects,
  moveSequenceItem,
  ref,
  removeGraphObject,
  removeSequenceItem,
  sequenceItems,
  touchPackage
} from '../../js/core/model.js';
import { escapeHtml, slugify } from '../../js/core/utils.js';
import { bytesToDataUri } from './assets.js';
import { moveItemAtIndex, restoreItemList, snapshotItemList } from './reorder.js';
import { createPointerSortable } from '../../vendor/marin-sortable/marin-sortable.js';

export function createSlidesModule({ getPkg, persistWorkspace, showMessage, dialogs }) {
  let activeDeckId = null;
  let activeEditingSlideId = null;
  let focusedItemId = null;
  let slideSortable = null;

  function render(container) {
    if (!container) return;
    const pkg = getPkg();
    if (!pkg) return;

    slideSortable?.destroy();
    slideSortable = null;

    const decks = getObjects(pkg, TYPES.PRESENTATION);
    if (!decks.length) {
      container.innerHTML = `
        <div class="editor-empty-state">
          <p class="text-muted editor-empty-text">Turn your reading materials into a presentation without rewriting the content.</p>
          <button id="btn-create-first-deck" class="primary" type="button">Create slides</button>
        </div>`;
      container.querySelector('#btn-create-first-deck')?.addEventListener('click', () => createNewDeck(container));
      return;
    }

    if (!activeDeckId || !decks.some((d) => d['@id'] === activeDeckId)) {
      activeDeckId = decks[0]['@id'];
    }
    const activeDeck = getObject(pkg, activeDeckId);

    const navigation = decks.map((d) => `
      <button type="button" class="editor-subnav-btn ${d['@id'] === activeDeckId ? 'active' : ''}"
        data-deck-id="${escapeHtml(d['@id'])}" aria-pressed="${d['@id'] === activeDeckId}">
        ${escapeHtml(d.name)}
      </button>`).join('');

    const entries = sequenceItems(activeDeck, 'marin:slideSequence');
    const slidesHtml = entries.map((entry, index) => renderSlideCard(entry, index, activeDeck, entries.length)).join('');

    // Reading material link
    let basedOnDesc = '';
    const basedOnRef = activeDeck?.isBasedOn?.[0]?.['@id'];
    if (basedOnRef) {
      const mat = getObject(pkg, basedOnRef);
      if (mat) basedOnDesc = `<span> &middot; <strong>Based on:</strong> ${escapeHtml(mat.name)}</span>`;
    }

    container.innerHTML = `
      <div class="editor-materials-layout">
        <aside class="editor-materials-sidebar" aria-label="Slides list">
          <h4>Slides</h4>
          <div class="editor-subnav-list">${navigation}</div>
          <div class="editor-sidebar-actions">
            <button id="btn-create-deck-side" type="button" class="editor-sidebar-action"><span aria-hidden="true">+</span> Add slides</button>
          </div>
        </aside>

        <div class="editor-materials-main">
          <header class="editor-material-header">
            <div class="editor-material-title-row">
              <h3>${escapeHtml(activeDeck?.name || 'Slides')}</h3>
              <div class="editor-header-actions">
                <button type="button" id="btn-rename-deck" class="secondary outline btn-sm">Rename</button>
                <button type="button" id="btn-duplicate-deck" class="secondary outline btn-sm">Duplicate slides</button>
                <button type="button" id="btn-deck-settings" class="secondary outline btn-sm">Settings</button>
                <button type="button" id="btn-preview-deck" class="secondary outline btn-sm">Preview presentation</button>
                <button type="button" id="btn-delete-deck" class="secondary outline btn-sm btn-remove">Delete slides</button>
              </div>
            </div>
            ${activeDeck?.abstract ? `<p class="editor-material-abstract">${escapeHtml(activeDeck.abstract)}</p>` : ''}
            <div class="editor-quiz-policy-summary text-muted">
              <span><strong>Slides:</strong> ${entries.length} slide(s)</span>
              ${basedOnDesc}
            </div>
          </header>

          <section class="editor-material-sequence" aria-label="Slides in this set">
            <div class="editor-sequence-header">
              <h4>Slides (${entries.length})</h4>
              <span class="text-muted editor-help-text">Drag a slide by its handle, or use the Up and Down buttons. Expand a slide to edit layout, content reference, and presenter notes.</span>
            </div>
            <div class="editor-sequence-tree editor-slide-sortable-list" data-sort-container-id="${escapeHtml(activeDeck['@id'])}">
              ${slidesHtml || '<p class="text-muted" data-sortable-empty-notice>There are no slides yet. Click "Add slide" below to get started.</p>'}
            </div>
          </section>

          <div class="editor-material-toolbar">
            <button id="btn-add-slide" type="button" class="primary">+ Add slide</button>
          </div>
        </div>
      </div>
      <div id="deck-modal-container"></div>`;

    bindEvents(container);
    mountSlideSortable(container, activeDeck);
    restoreFocus(container);
  }

  function renderSlideCard(entry, index, deck, count) {
    const pkg = getPkg();
    const slide = getObject(pkg, entry.item?.['@id']);
    if (!slide) return `<div class="app-alert app-alert--danger">Slide ${index + 1} cannot be found.</div>`;

    const slideId = slide['@id'];
    const isFirst = index === 0;
    const isLast = index === count - 1;
    const isEditing = slideId === activeEditingSlideId;
    const layout = slide['marin:layout'] || 'content';

    if (isEditing) {
      return renderSlideEditForm(slide, index);
    }

    // Summarize every referenced content block rather than only the first one.
    const contentEntries = sequenceItems(slide, 'marin:contentSequence');
    let contentSummary = '<p class="text-muted editor-slide-content-desc">No content referenced.</p>';
    let warningBanner = '';

    if (contentEntries.length) {
      const warnings = [];
      const items = contentEntries.map((contentEntry, contentIndex) => {
        const unit = getObject(pkg, contentEntry.item?.['@id']);
        const mode = contentEntry['marin:displayMode'] ?? DEFAULT_SLIDE_DISPLAY_MODE;
        if (!unit) {
          warnings.push(`Content block ${contentIndex + 1} cannot be found.`);
          return `
            <li class="editor-slide-referenced-info">
              <span class="app-badge badge--level">${escapeHtml(formatDisplayMode(mode))}</span>
              <strong>Missing referenced content</strong>
            </li>`;
        }
        if (mode === 'abstract' && !unit.abstract) {
          warnings.push(`Content block “${unit.name}” has no short summary for this slide.`);
        }
        return `
          <li class="editor-slide-referenced-info">
            <span class="app-badge badge--level">${escapeHtml(formatDisplayMode(mode))}</span>
            <strong>${escapeHtml(unit.name)}</strong>
            ${mode === 'abstract' && unit.abstract ? `<p class="editor-slide-preview-text">"${escapeHtml(unit.abstract)}"</p>` : ''}
          </li>`;
      }).join('');
      contentSummary = `<ol class="editor-slide-referenced-list" aria-label="Referenced content blocks">${items}</ol>`;
      warningBanner = warnings.map((warning) => (
        `<div class="app-alert app-alert--warning editor-slide-warning"><strong>Review needed:</strong> ${escapeHtml(warning)}</div>`
      )).join('');
    }

    return `
      <article class="editor-quiz-question-card editor-item-card editor-slide-sortable-item" data-slide-card="${escapeHtml(slideId)}" data-sort-item-id="${escapeHtml(slideId)}" aria-labelledby="slide-title-${escapeHtml(slideId)}">
        <header class="editor-block-header">
          <div class="editor-item-heading">
            ${renderDragHandle(`slide ${index + 1}: ${slide.name || 'Untitled slide'}`, 'editor-slide-drag-handle', Boolean(activeEditingSlideId))}
            <div class="editor-block-title-wrap">
            <div class="editor-block-badge-row">
              <span class="app-badge badge--level">${escapeHtml(formatLayout(layout))}</span>
              ${slide['marin:speakerNotes'] ? '<span class="app-badge badge--level" title="Speaker notes present">&#128221; Notes</span>' : ''}
            </div>
              <h5 id="slide-title-${escapeHtml(slideId)}">Slide ${index + 1}: ${escapeHtml(slide.name || 'Untitled slide')}</h5>
            </div>
          </div>
          <div class="editor-item-actions" role="toolbar" aria-label="Slide actions for Slide ${index + 1}">
            <button type="button" class="secondary outline btn-sm" data-action="edit-slide" data-id="${escapeHtml(slideId)}">Edit</button>
            <button type="button" class="secondary outline btn-sm" data-action="duplicate-slide" data-id="${escapeHtml(slideId)}" title="Duplicate slide">Duplicate</button>
            <button type="button" class="secondary outline btn-sm" data-action="move-s-up" data-id="${escapeHtml(slideId)}" ${isFirst ? 'disabled aria-disabled="true"' : ''} title="Move slide up">&#8593; Up</button>
            <button type="button" class="secondary outline btn-sm" data-action="move-s-down" data-id="${escapeHtml(slideId)}" ${isLast ? 'disabled aria-disabled="true"' : ''} title="Move slide down">&#8595; Down</button>
            <button type="button" class="secondary outline btn-sm btn-remove" data-action="remove-slide" data-id="${escapeHtml(slideId)}" title="Remove slide from these slides">Remove</button>
          </div>
        </header>
        <div class="editor-slide-card-body">
          ${contentSummary}
          ${warningBanner}
        </div>
      </article>`;
  }

  function renderSlideEditForm(slide, index) {
    const pkg = getPkg();
    const slideId = slide['@id'];
    const layout = slide['marin:layout'] || 'content';
    const contentEntries = sequenceItems(slide, 'marin:contentSequence');
    const allUnits = getObjects(pkg, TYPES.CONTENT_UNIT);
    const contentRowsHtml = contentEntries
      .map((entry, entryIndex) => renderSlideContentEntryRow(entry, entryIndex, allUnits, entryIndex, contentEntries.length))
      .join('');

    return `
      <article class="editor-quiz-question-card editor-item-card editor-slide-sortable-item is-editing" data-slide-card="${escapeHtml(slideId)}" data-sort-item-id="${escapeHtml(slideId)}">
        <div class="editor-question-form">
          <h4>Edit Slide ${index + 1}</h4>
          <div class="grid">
            <label class="editor-label">
              Slide title *
              <input type="text" id="s-edit-title" value="${escapeHtml(slide.name || '')}" placeholder="Heading for this slide">
            </label>
            <label class="editor-label">
              Slide layout
              <select id="s-edit-layout">
                ${SLIDE_LAYOUTS.map((item) => `<option value="${item}" ${item === layout ? 'selected' : ''}>${formatLayout(item)}</option>`).join('')}
              </select>
            </label>
          </div>

          <section class="editor-slide-content-manager" aria-labelledby="slide-content-manager-title">
            <div class="editor-slide-content-manager-header">
              <div>
                <h5 id="slide-content-manager-title">Content blocks</h5>
                <p id="slide-content-manager-help" class="editor-help-text">Add one or more existing content blocks, choose how each is shown, and arrange them in slide order.</p>
              </div>
              <button type="button" id="btn-add-slide-content" class="secondary outline btn-sm">+ Add content block</button>
            </div>
            <div id="s-edit-content-list" class="editor-slide-content-list" aria-describedby="slide-content-manager-help">
              ${contentRowsHtml || '<p class="text-muted editor-slide-content-empty" data-slide-content-empty>No content blocks selected. A title or section slide may omit content.</p>'}
            </div>
          </section>

          <label class="editor-label">
            Speaker notes (optional presenter notes; not shown on the slide)
            <textarea id="s-edit-notes" rows="3" placeholder="Notes for the presenter…">${escapeHtml(slide['marin:speakerNotes'] || '')}</textarea>
          </label>

          <details class="editor-advanced-details">
            <summary>Technical Details</summary>
            <div class="editor-advanced-body">
              <p><strong>Slide ID:</strong> <code>${escapeHtml(slide['@id'])}</code></p>
              <p><strong>Identifier Slug:</strong> <code>${escapeHtml(slide.identifier)}</code></p>
              <pre class="editor-json-preview"><code>${escapeHtml(JSON.stringify(slide, null, 2))}</code></pre>
            </div>
          </details>

          <div class="editor-form-actions">
            <button type="button" id="btn-save-slide" class="primary">Save slide</button>
            <button type="button" id="btn-cancel-slide" class="secondary outline">Cancel</button>
          </div>
        </div>
      </article>`;
  }

  function renderSlideContentEntryRow(entry, index, allUnits, sourceIndex = -1, total = 1) {
    const currentUnitId = entry?.item?.['@id'] || '';
    const currentMode = entry
      ? (entry['marin:displayMode'] ?? DEFAULT_SLIDE_DISPLAY_MODE)
      : 'abstract';
    const hasCurrentUnit = allUnits.some((unit) => unit['@id'] === currentUnitId);
    const missingOption = currentUnitId && !hasCurrentUnit
      ? `<option value="${escapeHtml(currentUnitId)}" selected>(Missing referenced content)</option>`
      : '';
    const unitOptions = allUnits.map((unit) => `
      <option value="${escapeHtml(unit['@id'])}" ${unit['@id'] === currentUnitId ? 'selected' : ''}>${escapeHtml(unit.name)} (${escapeHtml(unit.learningResourceType || 'concept')})</option>`).join('');
    const modeOptions = SLIDE_DISPLAY_MODES.map((mode) => (
      `<option value="${mode}" ${mode === currentMode ? 'selected' : ''}>${escapeHtml(formatDisplayMode(mode))}${mode === 'abstract' ? ' (recommended for slides)' : ''}</option>`
    )).join('');

    return `
      <fieldset class="editor-slide-content-entry" data-slide-content-entry data-source-index="${sourceIndex}">
        <legend>Content block ${index + 1}</legend>
        <div class="editor-slide-content-entry-grid">
          <label class="editor-label">
            Content block to show
            <select data-slide-content-unit>
              <option value="">Choose content…</option>
              ${missingOption}
              ${unitOptions}
            </select>
          </label>
          <label class="editor-label">
            Display mode
            <select data-slide-content-mode>${modeOptions}</select>
          </label>
        </div>
        <div class="editor-slide-content-actions" role="toolbar" aria-label="Content block ${index + 1} actions">
          <button type="button" class="secondary outline btn-sm" data-slide-content-action="move-up" aria-label="Move content block ${index + 1} up" ${index === 0 ? 'disabled aria-disabled="true"' : ''}>&#8593; Up</button>
          <button type="button" class="secondary outline btn-sm" data-slide-content-action="move-down" aria-label="Move content block ${index + 1} down" ${index === total - 1 ? 'disabled aria-disabled="true"' : ''}>&#8595; Down</button>
          <button type="button" class="secondary outline btn-sm btn-remove" data-slide-content-action="remove" aria-label="Remove content block ${index + 1}">Remove</button>
        </div>
      </fieldset>`;
  }

  function renderDragHandle(label, className = '', disabled = false) {
    const actionLabel = disabled
      ? `Finish editing before reordering ${label}`
      : `Drag to reorder ${label}`;
    return `
      <button type="button" class="editor-drag-handle ${className}" data-sortable-handle
        aria-label="${escapeHtml(actionLabel)}" title="${escapeHtml(actionLabel)}"
        ${disabled ? 'disabled aria-disabled="true"' : ''}>
        <span class="editor-drag-grip" aria-hidden="true"></span>
      </button>`;
  }

  function mountSlideSortable(container, deck) {
    const root = container.querySelector('.editor-materials-main');
    if (!root || !deck || activeEditingSlideId) return;

    slideSortable = createPointerSortable(root, {
      listSelector: '.editor-slide-sortable-list',
      itemSelector: '.editor-slide-sortable-item',
      handleSelector: '.editor-slide-drag-handle',
      getItemId: (item) => item?.dataset.sortItemId || '',
      getContainerId: (list) => list?.dataset.sortContainerId || '',
      canDrop: ({ sourceContainerId, targetContainerId }) => (
        sourceContainerId === deck['@id'] && targetContainerId === deck['@id']
      ),
      getDropLabel: ({ targetIndex }) => `Move slide to position ${targetIndex + 1}`,
      onHandleActivate: () => {
        showMessage('Drag this handle to reorder the slide, or use its Up and Down buttons.', 'information', { focus: false });
      },
      onDrop: (payload) => applySlideDrop(payload, container, deck),
      onError: (_error, payload) => {
        focusedItemId = payload?.itemId || null;
        render(container);
        showMessage('The slide could not be moved. The previous order was restored.', 'error', { focus: false });
      }
    });
  }

  async function applySlideDrop(payload, container, deck) {
    const pkg = getPkg();
    const slide = getObject(pkg, payload.itemId);
    const list = deck?.['marin:slideSequence'];
    if (!slide || !list) {
      focusedItemId = payload.itemId;
      render(container);
      showMessage('The slide could not be moved.', 'warning', { focus: false });
      return;
    }

    const before = snapshotItemList(list);
    const result = moveItemAtIndex(list, payload.sourceIndex, payload.targetIndex, payload.itemId);
    if (!result.moved) {
      focusedItemId = payload.itemId;
      render(container);
      return;
    }

    try {
      touchPackage(pkg);
      await persistWorkspace();
    } catch (error) {
      restoreItemList(list, before);
      focusedItemId = payload.itemId;
      render(container);
      showMessage(`The slide could not be moved. ${error.message}`, 'error', { focus: false });
      return;
    }

    const after = snapshotItemList(list);
    focusedItemId = payload.itemId;
    render(container);
    showMessage(`Moved slide "${slide.name || 'Untitled slide'}" to position ${result.targetIndex + 1}.`, 'success', {
      focus: false,
      action: {
        label: 'Undo move',
        onClick: async () => {
          restoreItemList(list, before);
          try {
            touchPackage(pkg);
            await persistWorkspace();
          } catch (error) {
            restoreItemList(list, after);
            focusedItemId = payload.itemId;
            render(container);
            throw error;
          }
          focusedItemId = payload.itemId;
          render(container);
          showMessage('Slide move undone.', 'success', { focus: false });
        }
      }
    });
  }

  function bindEvents(container) {
    container.querySelectorAll('[data-deck-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeDeckId = btn.dataset.deckId;
        activeEditingSlideId = null;
        render(container);
      });
    });

    container.querySelector('#btn-create-deck-side')?.addEventListener('click', () => createNewDeck(container));

    container.querySelector('#btn-rename-deck')?.addEventListener('click', async () => {
      const pkg = getPkg();
      const deck = getObject(pkg, activeDeckId);
      if (!deck) return;
      const newTitle = await dialogs.requestText({
        title: 'Rename slides',
        label: 'Slides title',
        value: deck.name,
        requiredMessage: 'Enter a title for the slides.',
        submitLabel: 'Rename'
      });
      if (!newTitle || newTitle === deck.name) return;
      deck.name = newTitle;
      deck.identifier = slugify(newTitle, 'deck');
      focusedItemId = deck['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Slides renamed.', 'success', { focus: false });
    });

    container.querySelector('#btn-duplicate-deck')?.addEventListener('click', async () => {
      const pkg = getPkg();
      const duplicate = duplicatePresentation(pkg, activeDeckId);
      if (!duplicate) return;
      activeDeckId = duplicate['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage(`Duplicated slides as "${duplicate.name}".`, 'success');
    });

    container.querySelector('#btn-deck-settings')?.addEventListener('click', () => {
      showDeckSettingsModal(container);
    });

    container.querySelector('#btn-preview-deck')?.addEventListener('click', () => {
      void showDeckPreviewModal(container);
    });

    container.querySelector('#btn-delete-deck')?.addEventListener('click', async () => {
      const pkg = getPkg();
      const deck = getObject(pkg, activeDeckId);
      if (!deck) return;
      const confirmed = await dialogs.confirmAction({
        title: 'Delete slides?',
        description: `Delete “${deck.name}” from this project? Existing slide records are not deleted.`,
        submitLabel: 'Delete slides',
        destructive: true
      });
      if (!confirmed) return;

      const deckIds = getObjects(pkg, TYPES.PRESENTATION).map((candidate) => candidate['@id']);
      const deletedIndex = deckIds.indexOf(activeDeckId);
      const nextDeckId = deckIds[deletedIndex + 1] || deckIds[deletedIndex - 1] || null;
      removeGraphObject(pkg, activeDeckId);
      activeDeckId = nextDeckId;
      focusedItemId = nextDeckId;
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      if (!nextDeckId) container.querySelector('#btn-create-first-deck')?.focus();
      showMessage('Slides deleted.', 'success', { focus: false });
    });

    container.querySelector('#btn-add-slide')?.addEventListener('click', () => {
      const pkg = getPkg();
      const deck = getObject(pkg, activeDeckId);
      if (!deck) return;
      const slide = createSlide(pkg, 'New slide', 'content');
      addSlideToPresentation(deck, slide['@id']);
      activeEditingSlideId = slide['@id'];
      focusedItemId = slide['@id'];
      touchPackage(pkg);
      persistWorkspace().then(() => render(container));
    });

    // Action buttons on slides
    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        handleSlideAction(action, id, container);
      });
    });

    // Form events for active slide editing
    if (activeEditingSlideId) {
      bindSlideFormEvents(container);
    }
  }

  function bindSlideFormEvents(container) {
    const pkg = getPkg();
    const slide = getObject(pkg, activeEditingSlideId);
    if (!slide) return;

    bindSlideContentEntryControls(container);

    container.querySelector('#btn-cancel-slide')?.addEventListener('click', () => {
      activeEditingSlideId = null;
      render(container);
    });

    container.querySelector('#btn-save-slide')?.addEventListener('click', async () => {
      const titleInput = container.querySelector('#s-edit-title');
      const title = titleInput.value.trim();
      if (!title) {
        showMessage('Enter a slide title.', 'error');
        titleInput.focus();
        return;
      }

      const rows = [...container.querySelectorAll('[data-slide-content-entry]')];
      const contentRows = [];
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const unitSelect = row.querySelector('[data-slide-content-unit]');
        const modeSelect = row.querySelector('[data-slide-content-mode]');
        const itemId = unitSelect?.value || '';
        if (!itemId) {
          showMessage(`Choose content for content block ${index + 1}, or remove that row.`, 'error');
          unitSelect?.focus();
          return;
        }
        contentRows.push({
          itemId,
          displayMode: modeSelect?.value || 'abstract',
          sourceIndex: Number(row.dataset.sourceIndex)
        });
      }

      const layoutSelect = container.querySelector('#s-edit-layout');
      const layout = layoutSelect?.value || 'content';
      if (!contentRows.length && !['title', 'section'].includes(layout)) {
        showMessage('Add at least one content block, or choose the Title slide or Section divider layout.', 'error');
        container.querySelector('#btn-add-slide-content')?.focus();
        return;
      }

      try {
        setSlideContentSequence(slide, contentRows);
      } catch (error) {
        showMessage(error.message || 'The slide content could not be saved.', 'error');
        return;
      }

      slide.name = title;
      slide.identifier = slugify(title, 'slide');
      slide['marin:layout'] = layout;

      const notes = container.querySelector('#s-edit-notes').value.trim();
      if (notes) slide['marin:speakerNotes'] = notes;
      else delete slide['marin:speakerNotes'];

      touchPackage(pkg);
      await persistWorkspace();
      activeEditingSlideId = null;
      render(container);
      showMessage('Slide saved.', 'success');
    });
  }

  function bindSlideContentEntryControls(container) {
    const list = container.querySelector('#s-edit-content-list');
    const addButton = container.querySelector('#btn-add-slide-content');
    if (!list || !addButton) return;

    const allUnits = getObjects(getPkg(), TYPES.CONTENT_UNIT);

    addButton.addEventListener('click', () => {
      list.querySelector('[data-slide-content-empty]')?.remove();
      const rowCount = list.querySelectorAll('[data-slide-content-entry]').length;
      list.insertAdjacentHTML(
        'beforeend',
        renderSlideContentEntryRow(null, rowCount, allUnits, -1, rowCount + 1)
      );
      refreshSlideContentEntryControls(list);
      list.querySelector('[data-slide-content-entry]:last-of-type [data-slide-content-unit]')?.focus();
    });

    list.addEventListener('click', (event) => {
      const button = event.target.closest('[data-slide-content-action]');
      if (!button || !list.contains(button)) return;
      const row = button.closest('[data-slide-content-entry]');
      if (!row) return;

      const action = button.dataset.slideContentAction;
      if (action === 'move-up') {
        const previous = row.previousElementSibling;
        if (previous?.matches('[data-slide-content-entry]')) {
          list.insertBefore(row, previous);
          refreshSlideContentEntryControls(list);
          row.querySelector('[data-slide-content-action="move-up"]')?.focus();
        }
      } else if (action === 'move-down') {
        const next = row.nextElementSibling;
        if (next?.matches('[data-slide-content-entry]')) {
          list.insertBefore(next, row);
          refreshSlideContentEntryControls(list);
          row.querySelector('[data-slide-content-action="move-down"]')?.focus();
        }
      } else if (action === 'remove') {
        const nextFocus = row.nextElementSibling?.querySelector?.('[data-slide-content-unit]') ||
          row.previousElementSibling?.querySelector?.('[data-slide-content-unit]') ||
          addButton;
        row.remove();
        refreshSlideContentEntryControls(list);
        nextFocus?.focus();
      }
    });

    refreshSlideContentEntryControls(list);
  }

  function refreshSlideContentEntryControls(list) {
    const rows = [...list.querySelectorAll('[data-slide-content-entry]')];
    list.querySelector('[data-slide-content-empty]')?.remove();
    if (!rows.length) {
      list.insertAdjacentHTML(
        'beforeend',
        '<p class="text-muted editor-slide-content-empty" data-slide-content-empty>No content blocks selected. A title or section slide may omit content.</p>'
      );
      return;
    }

    rows.forEach((row, index) => {
      const position = index + 1;
      const legend = row.querySelector('legend');
      if (legend) legend.textContent = `Content block ${position}`;
      const actions = row.querySelector('.editor-slide-content-actions');
      if (actions) actions.setAttribute('aria-label', `Content block ${position} actions`);

      const up = row.querySelector('[data-slide-content-action="move-up"]');
      const down = row.querySelector('[data-slide-content-action="move-down"]');
      const remove = row.querySelector('[data-slide-content-action="remove"]');
      if (up) {
        up.disabled = index === 0;
        up.setAttribute('aria-disabled', String(index === 0));
        up.setAttribute('aria-label', `Move content block ${position} up`);
      }
      if (down) {
        down.disabled = index === rows.length - 1;
        down.setAttribute('aria-disabled', String(index === rows.length - 1));
        down.setAttribute('aria-label', `Move content block ${position} down`);
      }
      remove?.setAttribute('aria-label', `Remove content block ${position}`);
    });
  }

  async function handleSlideAction(action, id, container) {
    const pkg = getPkg();
    const deck = getObject(pkg, activeDeckId);
    if (!deck) return;

    if (action === 'edit-slide') {
      activeEditingSlideId = id;
      render(container);
      container.querySelector(`[data-slide-card="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (action === 'duplicate-slide') {
      const duplicate = duplicateSlide(pkg, id);
      if (!duplicate) return;
      addSlideToPresentation(deck, duplicate['@id']);
      focusedItemId = duplicate['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Duplicated slide.', 'success');
      return;
    }

    if (action === 'move-s-up' || action === 'move-s-down') {
      const items = sequenceItems(deck, 'marin:slideSequence');
      const idx = items.findIndex((e) => e.item?.['@id'] === id);
      if (idx !== -1) {
        const delta = action === 'move-s-up' ? -1 : 1;
        if (moveSequenceItem(deck['marin:slideSequence'], idx, delta)) {
          focusedItemId = id;
          touchPackage(pkg);
          await persistWorkspace();
          render(container);
        }
      }
      return;
    }

    if (action === 'remove-slide') {
      const items = sequenceItems(deck, 'marin:slideSequence');
      const idx = items.findIndex((e) => e.item?.['@id'] === id);
      if (idx !== -1) {
        removeSequenceItem(deck['marin:slideSequence'], idx);
        touchPackage(pkg);
        await persistWorkspace();
        render(container);
        showMessage('Removed slide from these slides.', 'success');
      }
      return;
    }
  }

  async function createNewDeck(container) {
    const pkg = getPkg();
    if (!pkg) return;
    const title = await dialogs.requestText({
      title: 'Create slides',
      label: 'Slides title',
      value: 'New Slides',
      requiredMessage: 'Enter a title for the slides.',
      submitLabel: 'Create'
    });
    if (!title) return;
    const deck = createPresentation(pkg, title);
    activeDeckId = deck['@id'];
    activeEditingSlideId = null;
    focusedItemId = deck['@id'];
    await persistWorkspace();
    render(container);
  }

  function showDeckSettingsModal(container) {
    const pkg = getPkg();
    const deck = getObject(pkg, activeDeckId);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!deck || !modalHost) return;

    const materials = getObjects(pkg, TYPES.MATERIAL);
    const currentMatRef = deck.isBasedOn?.[0]?.['@id'] || '';

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="deck-settings-title">
        <div class="editor-preview-content editor-settings-modal-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Slides Settings</span>
              <h2 id="deck-settings-title">${escapeHtml(deck.name)} — Settings</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close settings">Close</button>
          </header>
          <div class="editor-modal-body">
            <div class="grid">
              <label>Slides title
                <input type="text" id="setting-deck-name" value="${escapeHtml(deck.name)}">
              </label>
              <label>Associated Reading Material (optional)
                <select id="setting-deck-material">
                  <option value="">(None)</option>
                  ${materials.map((m) => `<option value="${escapeHtml(m['@id'])}" ${m['@id'] === currentMatRef ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}
                </select>
              </label>
            </div>
            <label>Short summary / description (optional)
              <textarea id="setting-deck-abstract" rows="2">${escapeHtml(deck.abstract || '')}</textarea>
            </label>
            <details class="editor-advanced-details">
              <summary>Technical Details</summary>
              <div class="editor-advanced-body">
                <p><strong>Slides ID:</strong> <code>${escapeHtml(deck['@id'])}</code></p>
                <p><strong>Identifier Slug:</strong> <code>${escapeHtml(deck.identifier)}</code></p>
                <pre class="editor-json-preview"><code>${escapeHtml(JSON.stringify(deck, null, 2))}</code></pre>
              </div>
            </details>
            <div class="editor-form-actions">
              <button type="button" id="btn-save-deck-settings" class="primary">Save settings</button>
              <button type="button" class="secondary outline btn-close-modal">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('#btn-deck-settings')?.focus();
    };

    modalHost.querySelectorAll('.btn-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });

    modalHost.querySelector('#btn-save-deck-settings')?.addEventListener('click', async () => {
      const name = modalHost.querySelector('#setting-deck-name').value.trim();
      if (!name) {
        showMessage('Enter a title for the slides.', 'error');
        return;
      }
      deck.name = name;
      deck.identifier = slugify(name, 'deck');
      deck.abstract = modalHost.querySelector('#setting-deck-abstract').value.trim() || undefined;

      const matId = modalHost.querySelector('#setting-deck-material').value;
      if (matId) deck.isBasedOn = [ref(matId)];
      else delete deck.isBasedOn;

      touchPackage(pkg);
      await persistWorkspace();
      closeModal();
      render(container);
      showMessage('Slides settings saved.', 'success');
    });

    modalHost.querySelector('#setting-deck-name')?.focus();
  }

  async function showDeckPreviewModal(container) {
    const pkg = getPkg();
    const deck = getObject(pkg, activeDeckId);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!deck || !modalHost) return;

    modalHost.innerHTML = '<div class="catalog-status" aria-live="polite">Preparing slides preview...</div>';

    let model;
    try {
      model = await buildPresentationModel({
        graphDocument: pkg.graphDocument,
        presentationId: deck['@id'],
        getMarkdown: ({ path }) => (path && Object.hasOwn(pkg.contentFiles, path) ? pkg.contentFiles[path] : null)
      });
    } catch (error) {
      modalHost.innerHTML = '';
      showMessage(error.message || 'The slides preview could not be prepared.', 'error');
      return;
    }

    const slides = model.slides;
    if (!slides.length) {
      modalHost.innerHTML = '';
      showMessage('These slides are empty, so there is nothing to preview.', 'warning');
      return;
    }

    const markdownOptions = createEditorPreviewMarkdownOptions(pkg);
    let currentIndex = 0;

    function renderSlideCanvas() {
      const slide = slides[currentIndex];
      const notesHtml = renderSpeakerNotesHtml(slide, { markdownOptions });
      return `
        <div class="slides-viewer-container" role="region" aria-label="Slides preview">
          <div class="slide-canvas-wrapper">
            <div class="slide-canvas slide-layout--${escapeHtml(slide.layout)}" aria-label="Slide ${currentIndex + 1}: ${escapeHtml(slide.name || 'Untitled slide')}">
              ${renderSlideCanvasInnerHtml(slide, {
                markdownOptions,
                missingAbstractText: '(No short summary defined for this block)'
              })}
            </div>
          </div>
          <div class="slides-control-bar">
            <button type="button" id="btn-preview-prev-s" class="secondary" ${currentIndex === 0 ? 'disabled' : ''}>&larr; Previous</button>
            <div class="slides-counter">Slide ${currentIndex + 1} of ${slides.length}</div>
            <button type="button" id="btn-preview-next-s" class="primary" ${currentIndex === slides.length - 1 ? 'disabled' : ''}>Next &rarr;</button>
          </div>
          ${notesHtml ? `
            <div class="slides-notes-panel">
              <h5>Presenter Notes</h5>
              <div>${notesHtml}</div>
            </div>` : ''}
        </div>`;
    }

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-deck-title">
        <div class="editor-preview-content editor-deck-preview-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Slides Preview</span>
              <h2 id="preview-deck-title">${escapeHtml(model.presentation.name)}</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close preview">Close</button>
          </header>
          <div class="editor-preview-body" id="deck-canvas-mount">
            ${renderSlideCanvas()}
          </div>
        </div>
      </div>`;

    function updatePreviewView() {
      const mount = modalHost.querySelector('#deck-canvas-mount');
      if (mount) {
        mount.innerHTML = renderSlideCanvas();
        bindCanvasButtons();
      }
    }

    function bindCanvasButtons() {
      modalHost.querySelector('#btn-preview-prev-s')?.addEventListener('click', () => {
        if (currentIndex > 0) {
          currentIndex -= 1;
          updatePreviewView();
        }
      });
      modalHost.querySelector('#btn-preview-next-s')?.addEventListener('click', () => {
        if (currentIndex < slides.length - 1) {
          currentIndex += 1;
          updatePreviewView();
        }
      });
    }

    bindCanvasButtons();

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('#btn-preview-deck')?.focus();
    };

    modalHost.querySelectorAll('.btn-close-modal').forEach((button) => button.addEventListener('click', closeModal));
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (event) => {
      if (event.target.classList.contains('editor-preview-modal')) closeModal();
    });
  }

  function createEditorPreviewMarkdownOptions(pkg) {
    return {
      resolveRef: (uuid) => getObject(pkg, `urn:uuid:${uuid}`) ? `#ref=${uuid}` : false,
      resolveAsset: (uuid) => {
        const asset = getObject(pkg, `urn:uuid:${uuid}`);
        const file = asset?.contentUrl ? pkg.assetFiles[asset.contentUrl] : null;
        return file?.bytes && file?.type ? bytesToDataUri(file.bytes, file.type) : null;
      }
    };
  }

  function restoreFocus(container) {
    if (!focusedItemId) return;
    const card = container.querySelector(`[data-slide-card="${CSS.escape(focusedItemId)}"]`);
    const el = card?.querySelector('.editor-slide-drag-handle:not(:disabled)') ||
               card?.querySelector('h5') ||
               container.querySelector(`[data-id="${CSS.escape(focusedItemId)}"]`) ||
               container.querySelector(`[data-deck-id="${CSS.escape(focusedItemId)}"]`);
    if (el) {
      if (el.tabIndex < 0) el.tabIndex = -1;
      el.focus();
    }
    focusedItemId = null;
  }

  function formatLayout(layout) {
    const map = {
      title: 'Title slide',
      section: 'Section divider',
      content: 'Standard content',
      split: 'Two-column split',
      media: 'Media highlight',
      quote: 'Featured quotation'
    };
    return map[layout] || humanize(layout);
  }

  function formatDisplayMode(mode) {
    const map = {
      abstract: 'Short summary',
      full: 'Full content',
      title: 'Title only'
    };
    return map[mode] || humanize(mode);
  }

  function humanize(val) {
    return String(val).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return {
    render,
    getActiveDeckId: () => activeDeckId,
    setActiveDeckId: (id) => { activeDeckId = id; }
  };
}
