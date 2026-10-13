// Marin Learn Authoring - Reading Materials & Content Reuse Module (Phases R2a & R2b)
import { TYPE_LABELS, TYPES } from '../../js/core/constants.js';
import { renderMarkdown } from '../../js/core/markdown.js';
import {
  appendSequenceItem,
  canNestSection,
  createContentUnit,
  createMaterial,
  createSection,
  duplicateContentUnit,
  findParentContainer,
  getObject,
  getObjects,
  hasType,
  insertSequenceItem,
  moveSequenceItem,
  objectPrimaryType,
  removeGraphObject,
  removeSequenceItem,
  sequenceItems,
  structuralUsagesOf,
  touchPackage,
  transferSequenceItem
} from '../../js/core/model.js';
import { escapeHtml, ref, slugify, asArray } from '../../js/core/utils.js';
import { createMarkdownEditor } from './rich-editor.js';
import { renderObjectiveCheckboxes } from './objectives.js';
import { bytesToDataUri, showImageInsertModal } from './assets.js';
import { restoreItemList, snapshotItemList, transferItemAtIndex } from './reorder.js';
import { createPointerSortable } from '../../vendor/marin-sortable/marin-sortable.js';

export function createMaterialsModule({ getPkg, persistWorkspace, showMessage, dialogs }) {
  let activeMaterialId = null;
  let activeUnitId = null;
  let activeMarkdownEditor = null;
  let focusedItemId = null;
  let actionMenuAbortController = null;
  let readingSortable = null;

  function render(container) {
    if (!container) return;
    const pkg = getPkg();
    if (!pkg) return;

    activeMarkdownEditor?.destroy();
    activeMarkdownEditor = null;
    readingSortable?.destroy();
    readingSortable = null;
    actionMenuAbortController?.abort();
    actionMenuAbortController = null;

    const materials = getObjects(pkg, TYPES.MATERIAL);
    if (!materials.length) {
      container.innerHTML = `
        <div class="editor-empty-state">
          <p class="text-muted editor-empty-text">No reading materials yet. Start with a topic your learners need to understand.</p>
          <button id="btn-create-first-material" class="primary" type="button">Create reading material</button>
        </div>`;
      container.querySelector('#btn-create-first-material')?.addEventListener('click', () => createNewMaterial(container));
      return;
    }

    if (!materials.some((m) => m['@id'] === activeMaterialId)) {
      activeMaterialId = materials[0]['@id'];
    }
    const activeMaterial = getObject(pkg, activeMaterialId);

    const navigation = materials.map((m) => `
      <button type="button" class="editor-subnav-btn ${m['@id'] === activeMaterialId ? 'active' : ''}"
        data-material-id="${escapeHtml(m['@id'])}" aria-pressed="${m['@id'] === activeMaterialId}">
        ${escapeHtml(m.name)}
      </button>`).join('');

    const entries = sequenceItems(activeMaterial, 'marin:contentSequence');
    const contentHtml = entries.map((entry, index) => renderEntry(entry, index, activeMaterial, entries.length, 1)).join('');

    const materialMenu = renderActionMenu({
      label: 'More',
      className: 'editor-action-menu--material',
      ariaLabel: `More actions for ${activeMaterial?.name || 'reading material'}`,
      items: `
        <button type="button" id="btn-rename-material">Rename material</button>
        <button type="button" id="btn-material-settings">Settings and goals</button>`
    });

    const rootAddMenu = renderActionMenu({
      label: 'Add',
      ariaLabel: 'Add to document content',
      className: 'editor-action-menu--add editor-action-menu--root-add',
      items: `
        <button id="btn-add-content-unit" type="button">Add content</button>
        <button id="btn-add-section-root" type="button">Add section</button>
        <button id="btn-reuse-content-root" type="button">Reuse existing content</button>`
    });

    container.innerHTML = `
      <div class="editor-materials-layout editor-materials-layout--reading">
        <aside class="editor-materials-sidebar" aria-label="Reading materials">
          <h4>Materials</h4>
          <div class="editor-subnav-list">${navigation}</div>
          <div class="editor-sidebar-actions">
            <button id="btn-create-material-side" type="button" class="editor-sidebar-action"><span aria-hidden="true">+</span> Add material</button>
            <button id="btn-open-content-library" type="button" class="editor-sidebar-action">Content library</button>
          </div>
        </aside>

        <div class="editor-materials-main">
          <header class="editor-material-header">
            <div class="editor-material-title-row">
              <h3>${escapeHtml(activeMaterial?.name || 'Reading material')}</h3>
              <div class="editor-header-actions">
                <button type="button" id="btn-preview-material" class="editor-compact-control">Preview</button>
                ${materialMenu}
              </div>
            </div>
            ${activeMaterial?.abstract ? `<p class="editor-material-abstract">${escapeHtml(activeMaterial.abstract)}</p>` : ''}
          </header>

          <section class="editor-material-sequence" aria-label="Document content">
            <div class="editor-sequence-header">
              <div class="editor-sequence-heading">
                <h4>Document content</h4>
                <span class="editor-help-text">Organized in reading order. Drag an item by its handle, or use its More menu to move it without dragging.</span>
              </div>
              ${rootAddMenu}
            </div>
            <div class="editor-sequence-tree editor-reading-sortable-list" data-sort-container-id="${escapeHtml(activeMaterial['@id'])}" data-sort-container-kind="material">
              ${contentHtml || '<p class="text-muted editor-empty-document-notice" data-sortable-empty-notice>This material has no content yet. Use Add to get started.</p>'}
            </div>
          </section>
        </div>
      </div>`;

    bindEvents(container);
    mountActiveUnitEditor(container);
    mountReadingSortable(container, activeMaterial);
    restoreFocus(container);
  }

  function renderEntry(entry, index, parentContainer, siblingCount, depth) {
    const pkg = getPkg();
    const object = getObject(pkg, entry.item?.['@id']);
    if (!object) return `<div class="app-alert app-alert--danger">Content ${index + 1} cannot be found.</div>`;

    const itemId = object['@id'];
    const isFirst = index === 0;
    const isLast = index === siblingCount - 1;
    const isInsideSection = depth > 1;

    if (hasType(object, TYPES.SECTION)) {
      const nestedEntries = sequenceItems(object, 'marin:contentSequence');
      const canHaveSubsection = depth < 3;
      const canMoveIn = canMoveIntoSiblingSection(object, parentContainer, index);
      const sectionName = escapeHtml(object.name);

      const addItems = `
        <button type="button" data-action="add-content-to-section" data-id="${escapeHtml(itemId)}">Add content</button>
        ${canHaveSubsection
          ? `<button type="button" class="btn-add-subsection" data-action="add-subsection" data-id="${escapeHtml(itemId)}">Add subsection</button>`
          : '<button type="button" disabled aria-disabled="true">Add subsection (maximum depth reached)</button>'}
        <button type="button" data-action="reuse-content-to-section" data-id="${escapeHtml(itemId)}">Reuse existing content</button>`;

      const moreItems = `
        <button type="button" data-action="rename-section" data-id="${escapeHtml(itemId)}">Rename section</button>
        <button type="button" data-action="move-up" data-id="${escapeHtml(itemId)}" ${isFirst ? 'disabled aria-disabled="true"' : ''}>Move up</button>
        <button type="button" data-action="move-down" data-id="${escapeHtml(itemId)}" ${isLast ? 'disabled aria-disabled="true"' : ''}>Move down</button>
        ${canMoveIn.allowed ? `<button type="button" data-action="move-into" data-id="${escapeHtml(itemId)}">Move into another section</button>` : ''}
        ${isInsideSection ? `<button type="button" data-action="move-out" data-id="${escapeHtml(itemId)}">Move out one level</button>` : ''}
        <button type="button" class="editor-menu-danger editor-menu-separated" data-action="remove-item" data-id="${escapeHtml(itemId)}">Remove from this material</button>`;

      return `
        <section class="editor-document-section editor-reading-sortable-item" data-section-id="${escapeHtml(itemId)}" data-sort-item-id="${escapeHtml(itemId)}" data-sort-item-kind="section" data-depth="${depth}" aria-labelledby="section-title-${escapeHtml(itemId)}">
          <header class="editor-section-header">
            <div class="editor-item-heading">
              ${renderDragHandle(`section ${object.name}`, 'editor-reading-drag-handle', Boolean(activeUnitId))}
              <div class="editor-section-title-wrap">
                <span class="editor-level-tag">Level ${depth} section</span>
                <h5 id="section-title-${escapeHtml(itemId)}">${sectionName}</h5>
              </div>
            </div>
            <div class="editor-item-actions">
              ${renderActionMenu({
                label: 'Add',
                ariaLabel: `Add to section ${object.name}`,
                className: 'editor-action-menu--add',
                items: addItems
              })}
              ${renderActionMenu({
                label: 'More',
                ariaLabel: `More actions for section ${object.name}`,
                items: moreItems
              })}
            </div>
          </header>
          <div class="editor-document-section-content editor-reading-sortable-list" data-sort-container-id="${escapeHtml(itemId)}" data-sort-container-kind="section">
            ${nestedEntries.map((child, childIndex) => renderEntry(child, childIndex, object, nestedEntries.length, depth + 1)).join('') || '<p class="editor-empty-section-notice" data-sortable-empty-notice>This section has no content yet. Use Add to get started.</p>'}
          </div>
        </section>`;
    }

    if (hasType(object, TYPES.CONTENT_UNIT)) {
      const path = object.encoding?.contentUrl;
      const markdown = pkg.contentFiles[path] || '';
      const preview = summarizeMarkdown(markdown);
      const editing = object['@id'] === activeUnitId;
      const canMoveIn = canMoveIntoSiblingSection(object, parentContainer, index);
      const usages = structuralUsagesOf(pkg, itemId);
      const isShared = usages.length > 1;
      const unitName = escapeHtml(object.name);
      const summary = object.abstract || preview || 'No content written yet.';
      const summaryClass = object.abstract || preview ? '' : ' is-empty';

      const moreItems = `
        <button type="button" data-action="duplicate-unit" data-id="${escapeHtml(itemId)}">Duplicate as new content</button>
        <button type="button" data-action="move-up" data-id="${escapeHtml(itemId)}" ${isFirst ? 'disabled aria-disabled="true"' : ''}>Move up</button>
        <button type="button" data-action="move-down" data-id="${escapeHtml(itemId)}" ${isLast ? 'disabled aria-disabled="true"' : ''}>Move down</button>
        ${canMoveIn.allowed ? `<button type="button" data-action="move-into" data-id="${escapeHtml(itemId)}">Move into a section</button>` : ''}
        ${isInsideSection ? `<button type="button" data-action="move-out" data-id="${escapeHtml(itemId)}">Move out one level</button>` : ''}
        <button type="button" class="editor-menu-danger editor-menu-separated" data-action="remove-item" data-id="${escapeHtml(itemId)}">Remove from this material</button>`;

      return `
        <article class="editor-content-block editor-reading-sortable-item ${editing ? 'is-editing' : ''}" data-unit-card="${escapeHtml(itemId)}" data-sort-item-id="${escapeHtml(itemId)}" data-sort-item-kind="content" data-depth="${depth}" aria-labelledby="unit-title-${escapeHtml(itemId)}">
          <header class="editor-block-header">
            <div class="editor-item-heading">
              ${editing ? '' : renderDragHandle(`content ${object.name}`, 'editor-reading-drag-handle', Boolean(activeUnitId))}
              <div class="editor-block-title-wrap">
                <div class="editor-block-meta">
                  <span>${escapeHtml(humanize(object.learningResourceType || 'concept'))}</span>
                  ${isShared ? `<span aria-hidden="true">&middot;</span><span title="Used in ${usages.length} places">Shared in ${usages.length} places</span>` : ''}
                </div>
                <h5 id="unit-title-${escapeHtml(itemId)}">${unitName}</h5>
                ${editing ? '' : `<p class="editor-block-summary${summaryClass}">${escapeHtml(summary)}</p>`}
              </div>
            </div>
            <div class="editor-item-actions">
              ${editing ? '<span class="editor-editing-status">Editing</span>' : `<button type="button" class="editor-compact-control editor-primary-item-action" data-action="edit-unit" data-id="${escapeHtml(itemId)}" aria-label="Edit content ${unitName}">Edit</button>`}
              ${renderActionMenu({
                label: 'More',
                ariaLabel: `More actions for content ${object.name}`,
                items: moreItems
              })}
            </div>
          </header>
          ${editing ? '<div data-editor-host></div>' : ''}
        </article>`;
    }

    return '';
  }

  function renderActionMenu({ label, ariaLabel, items, className = '' }) {
    return `
      <details class="editor-action-menu ${className}">
        <summary class="editor-compact-control" aria-label="${escapeHtml(ariaLabel)}">
          <span>${escapeHtml(label)}</span>
          <span class="editor-menu-chevron" aria-hidden="true">&#9662;</span>
        </summary>
        <div class="editor-action-menu-panel">
          ${items}
        </div>
      </details>`;
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

  function captureMaterialSequences(pkg, material) {
    const snapshots = [];
    const visited = new Set();

    function visit(container) {
      if (!container?.['@id'] || visited.has(container['@id'])) return;
      visited.add(container['@id']);
      snapshots.push({
        id: container['@id'],
        sequence: snapshotItemList(container['marin:contentSequence'])
      });

      for (const entry of sequenceItems(container, 'marin:contentSequence')) {
        const child = getObject(pkg, entry.item?.['@id']);
        if (child && hasType(child, TYPES.SECTION)) visit(child);
      }
    }

    visit(material);
    return snapshots;
  }

  function restoreMaterialSequences(pkg, snapshots) {
    for (const snapshot of snapshots) {
      const container = getObject(pkg, snapshot.id);
      if (!container) continue;
      container['marin:contentSequence'] ||= { '@type': 'ItemList', itemListElement: [] };
      restoreItemList(container['marin:contentSequence'], snapshot.sequence);
    }
  }

  function readingDropLabel(targetContainer, targetIndex = 0, sourceContainerId = '') {
    const position = Number(targetIndex) + 1;
    if (!targetContainer || targetContainer['@id'] === activeMaterialId) {
      return sourceContainerId === activeMaterialId
        ? `Move to document position ${position}`
        : `Move to document level, position ${position}`;
    }
    const sectionName = targetContainer.name || 'section';
    return sourceContainerId === targetContainer['@id']
      ? `Move within ${sectionName} to position ${position}`
      : `Move inside ${sectionName}, position ${position}`;
  }

  function readingDropAllowed(pkg, material, itemId, targetContainerId) {
    const item = getObject(pkg, itemId);
    const target = getObject(pkg, targetContainerId);
    if (!item || !target) return { allowed: false };
    if (target['@id'] !== material['@id'] && !hasType(target, TYPES.SECTION)) return { allowed: false };

    if (hasType(item, TYPES.SECTION) && !canNestSection(pkg, material, itemId, targetContainerId)) {
      return { allowed: false };
    }

    return { allowed: true, label: readingDropLabel(target) };
  }

  function mountReadingSortable(container, material) {
    const root = container.querySelector('.editor-materials-main');
    if (!root || !material || activeUnitId) return;

    readingSortable = createPointerSortable(root, {
      listSelector: '.editor-reading-sortable-list',
      itemSelector: '.editor-reading-sortable-item',
      handleSelector: '.editor-reading-drag-handle',
      getItemId: (item) => item?.dataset.sortItemId || '',
      getContainerId: (list) => list?.dataset.sortContainerId || '',
      getItemDropRect: (item) => (
        item.querySelector(':scope > .editor-section-header, :scope > .editor-block-header')?.getBoundingClientRect()
        || item.getBoundingClientRect()
      ),
      canDrop: ({ itemId, sourceContainerId, targetContainerId, targetIndex }) => {
        const decision = readingDropAllowed(getPkg(), material, itemId, targetContainerId);
        return {
          ...decision,
          label: decision.allowed
            ? readingDropLabel(
              getObject(getPkg(), targetContainerId),
              targetIndex,
              sourceContainerId
            )
            : undefined
        };
      },
      getDropLabel: ({ sourceContainerId, targetContainerId, targetIndex }) => readingDropLabel(
        getObject(getPkg(), targetContainerId),
        targetIndex,
        sourceContainerId
      ),
      onStart: () => {
        container.querySelectorAll('.editor-action-menu[open]').forEach((menu) => { menu.open = false; });
      },
      onHandleActivate: () => {
        showMessage('Use the More menu commands to move this item without dragging.', 'information', { focus: false });
      },
      onCancel: ({ reason }) => {
        if (reason === 'invalid') {
          showMessage('That item cannot be moved there. Sections can be nested up to three levels.', 'warning', { focus: false });
        }
      },
      onDrop: (payload) => applyReadingDrop(payload, container, material),
      onError: (_error, payload) => {
        focusedItemId = payload?.itemId || null;
        render(container);
        showMessage('The item could not be moved. The previous reading order was restored.', 'error', { focus: false });
      }
    });
  }

  async function applyReadingDrop(payload, container, material) {
    const pkg = getPkg();
    const item = getObject(pkg, payload.itemId);
    const sourceContainer = getObject(pkg, payload.sourceContainerId);
    const targetContainer = getObject(pkg, payload.targetContainerId);
    const snapshots = captureMaterialSequences(pkg, material);
    const reachableContainerIds = new Set(snapshots.map((snapshot) => snapshot.id));

    if (!item
        || !sourceContainer
        || !targetContainer
        || !reachableContainerIds.has(sourceContainer['@id'])
        || !reachableContainerIds.has(targetContainer['@id'])
        || !readingDropAllowed(pkg, material, payload.itemId, payload.targetContainerId).allowed) {
      focusedItemId = payload.itemId;
      render(container);
      showMessage('The item could not be moved to that location.', 'warning', { focus: false });
      return;
    }

    const sameContainer = sourceContainer['@id'] === targetContainer['@id'];
    const result = transferItemAtIndex(
      sourceContainer['marin:contentSequence'],
      targetContainer['marin:contentSequence'],
      payload.sourceIndex,
      payload.targetIndex,
      payload.itemId
    );

    if (!result.moved) {
      focusedItemId = payload.itemId;
      render(container);
      return;
    }

    try {
      touchPackage(pkg);
      await persistWorkspace();
    } catch (error) {
      restoreMaterialSequences(pkg, snapshots);
      focusedItemId = payload.itemId;
      render(container);
      showMessage(`The item could not be moved. ${error.message}`, 'error', { focus: false });
      return;
    }

    const movedSnapshots = captureMaterialSequences(pkg, material);
    focusedItemId = payload.itemId;
    render(container);

    const destination = targetContainer['@id'] === material['@id']
      ? 'document level'
      : `section "${targetContainer.name}"`;
    const message = sameContainer
      ? `Moved "${item.name}" to position ${result.targetIndex + 1}.`
      : targetContainer['@id'] === material['@id']
        ? `Moved "${item.name}" to document level.`
        : `Moved "${item.name}" into ${destination}.`;

    showMessage(message, 'success', {
      focus: false,
      action: {
        label: 'Undo move',
        onClick: async () => {
          restoreMaterialSequences(pkg, snapshots);
          try {
            touchPackage(pkg);
            await persistWorkspace();
          } catch (error) {
            restoreMaterialSequences(pkg, movedSnapshots);
            focusedItemId = payload.itemId;
            render(container);
            throw error;
          }
          focusedItemId = payload.itemId;
          render(container);
          showMessage(`Move of "${item.name}" undone.`, 'success', { focus: false });
        }
      }
    });
  }

  function summarizeMarkdown(markdown, limit = 180) {
    const text = String(markdown || '')
      .replace(/```[\s\S]*?```/g, ' Code example ')
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+[.)])\s+/gm, '')
      .replace(/[*_~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length <= limit) return text;
    return `${text.slice(0, limit).trimEnd()}…`;
  }

  function canMoveIntoSiblingSection(item, parentContainer, index) {
    const pkg = getPkg();
    const entries = sequenceItems(parentContainer, 'marin:contentSequence');
    const isSec = hasType(item, TYPES.SECTION);
    const activeMat = getObject(pkg, activeMaterialId);

    const siblingSections = [];
    entries.forEach((e, i) => {
      if (i === index) return;
      const sibling = getObject(pkg, e.item?.['@id']);
      if (sibling && hasType(sibling, TYPES.SECTION)) {
        if (!isSec || canNestSection(pkg, activeMat, item['@id'], sibling['@id'])) {
          siblingSections.push({ sibling, index: i });
        }
      }
    });

    return {
      allowed: siblingSections.length > 0,
      siblings: siblingSections
    };
  }

  function bindEvents(container) {
    bindActionMenus(container);

    container.querySelectorAll('[data-material-id]').forEach((button) => {
      button.addEventListener('click', () => {
        activeMaterialId = button.dataset.materialId;
        activeUnitId = null;
        render(container);
      });
    });

    container.querySelector('#btn-create-material-side')?.addEventListener('click', () => createNewMaterial(container));
    container.querySelector('#btn-open-content-library')?.addEventListener('click', () => showContentLibrary(container));

    bindMenuAction(container.querySelector('#btn-rename-material'), async () => {
      const pkg = getPkg();
      const material = getObject(pkg, activeMaterialId);
      if (!material) return;
      const newTitle = await dialogs.requestText({
        title: 'Rename reading material',
        label: 'Reading material title',
        value: material.name,
        requiredMessage: 'Enter a reading material title.',
        submitLabel: 'Rename'
      });
      if (!newTitle || newTitle === material.name) return;
      material.name = newTitle;
      material.identifier = slugify(newTitle, 'material');
      focusedItemId = material['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Reading material renamed.', 'success', { focus: false });
    });

    bindMenuAction(container.querySelector('#btn-material-settings'), () => {
      showMaterialSettingsModal(container);
    });

    container.querySelector('#btn-preview-material')?.addEventListener('click', () => {
      showMaterialPreview(container);
    });

    bindMenuAction(container.querySelector('#btn-add-section-root'), () => {
      return addSection(container, null);
    });

    bindMenuAction(container.querySelector('#btn-add-content-unit'), () => {
      const pkg = getPkg();
      const material = getObject(pkg, activeMaterialId);
      return addContentUnit(container, material);
    });

    bindMenuAction(container.querySelector('#btn-reuse-content-root'), () => {
      const pkg = getPkg();
      const material = getObject(pkg, activeMaterialId);
      showReusePicker(container, material);
    });

    container.querySelectorAll('[data-action]').forEach((button) => {
      bindMenuAction(button, () => {
        const action = button.dataset.action;
        const id = button.dataset.id;
        return handleAction(action, id, container);
      });
    });
  }

  function bindActionMenus(container) {
    actionMenuAbortController?.abort();
    actionMenuAbortController = new AbortController();
    const { signal } = actionMenuAbortController;

    container.querySelectorAll('.editor-action-menu').forEach((menu) => {
      menu.addEventListener('toggle', () => {
        if (!menu.open) return;
        container.querySelectorAll('.editor-action-menu[open]').forEach((otherMenu) => {
          if (otherMenu !== menu) otherMenu.open = false;
        });
      });

      menu.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !menu.open) return;
        event.preventDefault();
        menu.open = false;
        menu.querySelector('summary')?.focus();
      });
    });

    document.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.editor-action-menu')) return;
      container.querySelectorAll('.editor-action-menu[open]').forEach((menu) => {
        menu.open = false;
      });
    }, { signal });
  }

  function bindMenuAction(button, callback) {
    if (!button) return;
    button.addEventListener('click', async () => {
      const menu = button.closest('.editor-action-menu');
      const summary = menu?.querySelector('summary');
      if (menu) menu.open = false;

      await callback();

      if (menu?.isConnected && !document.querySelector('.editor-preview-modal')) {
        summary?.focus();
      }
    });
  }

  async function handleAction(action, id, container) {
    const pkg = getPkg();
    const material = getObject(pkg, activeMaterialId);
    if (!material) return;

    if (action === 'edit-unit') {
      const usages = structuralUsagesOf(pkg, id);
      if (usages.length > 1) {
        showSharedEditPrompt(id, container, () => {
          activeUnitId = id;
          focusedItemId = id;
          render(container);
          container.querySelector(`[data-unit-card="${CSS.escape(activeUnitId)}"]`)?.scrollIntoView({ block: 'nearest' });
        });
        return;
      }
      activeUnitId = id;
      focusedItemId = id;
      render(container);
      container.querySelector(`[data-unit-card="${CSS.escape(activeUnitId)}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (action === 'duplicate-unit') {
      const duplicate = duplicateContentUnit(pkg, id);
      if (!duplicate) return;
      const parentInfo = findParentContainer(pkg, material, id);
      if (parentInfo) {
        insertSequenceItem(parentInfo.sequence, parentInfo.index + 1, duplicate['@id']);
      }
      focusedItemId = duplicate['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage(`Duplicated as new content "${duplicate.name}".`, 'success');
      return;
    }

    if (action === 'add-subsection') {
      const parentSection = getObject(pkg, id);
      await addSection(container, parentSection);
      return;
    }

    if (action === 'add-content-to-section') {
      const parentSection = getObject(pkg, id);
      await addContentUnit(container, parentSection);
      return;
    }

    if (action === 'reuse-content-to-section') {
      const parentSection = getObject(pkg, id);
      showReusePicker(container, parentSection);
      return;
    }

    if (action === 'rename-section') {
      const section = getObject(pkg, id);
      if (!section) return;
      const newTitle = await dialogs.requestText({
        title: 'Rename section',
        label: 'Section title',
        value: section.name,
        requiredMessage: 'Enter a section title.',
        submitLabel: 'Rename'
      });
      if (!newTitle || newTitle === section.name) return;
      section.name = newTitle;
      section.identifier = slugify(newTitle, 'section');
      focusedItemId = id;
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Section renamed.', 'success', { focus: false });
      return;
    }

    if (action === 'move-up' || action === 'move-down') {
      const parentInfo = findParentContainer(pkg, material, id);
      if (!parentInfo) return;
      const delta = action === 'move-up' ? -1 : 1;
      if (moveSequenceItem(parentInfo.sequence, parentInfo.index, delta)) {
        focusedItemId = id;
        touchPackage(pkg);
        await persistWorkspace();
        render(container);
      }
      return;
    }

    if (action === 'move-out') {
      const parentInfo = findParentContainer(pkg, material, id);
      if (!parentInfo || parentInfo.depth === 0) return;
      const grandParentInfo = findParentContainer(pkg, material, parentInfo.container['@id']);
      if (!grandParentInfo) return;

      transferSequenceItem(parentInfo.sequence, grandParentInfo.sequence, parentInfo.index, grandParentInfo.index + 1);
      focusedItemId = id;
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Moved item out to parent container.', 'success');
      return;
    }

    if (action === 'move-into') {
      const parentInfo = findParentContainer(pkg, material, id);
      if (!parentInfo) return;
      const item = getObject(pkg, id);
      const canMove = canMoveIntoSiblingSection(item, parentInfo.container, parentInfo.index);
      if (!canMove.allowed) {
        showMessage('No eligible sibling section to move into.', 'warning');
        return;
      }

      let targetSection = canMove.siblings[0].sibling;
      if (canMove.siblings.length > 1) {
        const targetId = await dialogs.requestChoice({
          title: 'Move into a section',
          description: 'Choose the section that should contain this item.',
          label: 'Destination section',
          value: targetSection['@id'],
          options: canMove.siblings.map(({ sibling }) => ({
            value: sibling['@id'],
            label: sibling.name
          })),
          requiredMessage: 'Choose a destination section.',
          submitLabel: 'Move'
        });
        if (!targetId) return;
        targetSection = canMove.siblings.find(({ sibling }) => sibling['@id'] === targetId)?.sibling;
        if (!targetSection) return;
      }

      transferSequenceItem(parentInfo.sequence, targetSection['marin:contentSequence'], parentInfo.index, -1);
      focusedItemId = id;
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage(`Moved into section "${targetSection.name}".`, 'success', { focus: false });
      return;
    }

    if (action === 'remove-item') {
      const parentInfo = findParentContainer(pkg, material, id);
      if (!parentInfo) return;
      removeSequenceItem(parentInfo.sequence, parentInfo.index);
      focusedItemId = parentInfo.container?.['@id'] || activeMaterialId;
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Removed item from this reading material.', 'success');
      return;
    }
  }

  async function createNewMaterial(container) {
    const pkg = getPkg();
    if (!pkg) return;
    const title = await dialogs.requestText({
      title: 'Create reading material',
      label: 'Reading material title',
      value: 'New Reading Material',
      requiredMessage: 'Enter a reading material title.',
      submitLabel: 'Create'
    });
    if (!title) return;
    const material = createMaterial(pkg, title);
    material.abstract = undefined;
    activeMaterialId = material['@id'];
    activeUnitId = null;
    focusedItemId = material['@id'];
    await persistWorkspace();
    render(container);
  }

  async function addSection(container, parentSection) {
    const pkg = getPkg();
    const material = getObject(pkg, activeMaterialId);
    if (!material) return;

    const label = parentSection ? 'Subsection title' : 'Section title';
    const defaultTitle = parentSection ? 'New Subsection' : 'New Section';
    const title = await dialogs.requestText({
      title: parentSection ? 'Create subsection' : 'Create section',
      label,
      value: defaultTitle,
      requiredMessage: `Enter a ${parentSection ? 'subsection' : 'section'} title.`,
      submitLabel: 'Create'
    });
    if (!title) return;

    const section = createSection(pkg, title);
    if (parentSection) {
      appendSequenceItem(parentSection['marin:contentSequence'], section['@id']);
    } else {
      appendSequenceItem(material['marin:contentSequence'], section['@id']);
    }

    focusedItemId = section['@id'];
    touchPackage(pkg);
    await persistWorkspace();
    render(container);
    showMessage(`Created ${parentSection ? 'subsection' : 'section'} "${title}".`, 'success', { focus: false });
  }

  async function addContentUnit(container, parentContainer) {
    const pkg = getPkg();
    if (!parentContainer) return;
    const title = await dialogs.requestText({
      title: 'Create content block',
      label: 'Content title',
      value: 'New Topic',
      requiredMessage: 'Enter a content title.',
      submitLabel: 'Create'
    });
    if (!title) return;

    const unit = createContentUnit(pkg, title, 'topic');
    appendSequenceItem(parentContainer['marin:contentSequence'], unit['@id']);
    touchPackage(pkg);
    activeUnitId = unit['@id'];
    focusedItemId = unit['@id'];
    await persistWorkspace();
    render(container);
  }

  function showReusePicker(container, targetContainer) {
    const pkg = getPkg();
    const units = getObjects(pkg, TYPES.CONTENT_UNIT);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!modalHost) return;

    function renderPickerList(filterText = '', filterType = '') {
      const q = filterText.toLowerCase().trim();
      const filtered = units.filter((u) => {
        const matchesQuery = !q || (u.name || '').toLowerCase().includes(q) || (u.abstract || '').toLowerCase().includes(q);
        const matchesType = !filterType || u.learningResourceType === filterType;
        return matchesQuery && matchesType;
      });

      if (!filtered.length) {
        return '<p class="text-muted editor-empty-notice">No matching content found in project.</p>';
      }

      return filtered.map((u) => {
        const usages = structuralUsagesOf(pkg, u['@id']);
        return `
          <div class="editor-reuse-card">
            <div class="editor-reuse-card-info">
              <div class="editor-reuse-card-badges">
                <span class="app-badge badge--level">${escapeHtml(humanize(u.learningResourceType || 'concept'))}</span>
                <span class="editor-usage-tag">${usages.length} place(s)</span>
              </div>
              <h5>${escapeHtml(u.name)}</h5>
              <p class="editor-reuse-card-abstract">${escapeHtml(u.abstract || 'No summary')}</p>
            </div>
            <div class="editor-reuse-card-actions">
              <button type="button" class="primary btn-sm btn-action-reuse-ref" data-unit-id="${escapeHtml(u['@id'])}">Reuse</button>
              <button type="button" class="secondary outline btn-sm btn-action-reuse-dup" data-unit-id="${escapeHtml(u['@id'])}">Duplicate & Use</button>
            </div>
          </div>`;
      }).join('');
    }

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="reuse-modal-title">
        <div class="editor-preview-content editor-reuse-modal-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Content Library</span>
              <h2 id="reuse-modal-title">Reuse Existing Content</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close reuse chooser">Close</button>
          </header>
          <div class="editor-modal-body">
            <p class="text-muted">Select an existing content block to reuse in this material. Reusing shares the content canonical source; duplicating makes a separate independent copy.</p>
            <div class="editor-reuse-controls">
              <input type="search" id="reuse-search-input" placeholder="Search by title or summary…" aria-label="Search content">
              <select id="reuse-type-filter" aria-label="Filter by type">
                <option value="">All content types</option>
                ${['topic', 'overview', 'concept', 'procedure', 'reference', 'example', 'key-points', 'summary', 'note', 'warning']
                  .map((t) => `<option value="${t}">${humanize(t)}</option>`).join('')}
              </select>
            </div>
            <div class="editor-reuse-list-container">
              ${renderPickerList()}
            </div>
          </div>
        </div>
      </div>`;

    const searchInput = modalHost.querySelector('#reuse-search-input');
    const typeFilter = modalHost.querySelector('#reuse-type-filter');
    const listContainer = modalHost.querySelector('.editor-reuse-list-container');

    const updateList = () => {
      listContainer.innerHTML = renderPickerList(searchInput.value, typeFilter.value);
      bindPickerActions();
    };

    searchInput?.addEventListener('input', updateList);
    typeFilter?.addEventListener('change', updateList);

    const closeModal = () => {
      modalHost.innerHTML = '';
      const returnTarget = hasType(targetContainer, TYPES.SECTION)
        ? container.querySelector(`[data-section-id="${CSS.escape(targetContainer['@id'])}"] .editor-action-menu--add > summary`)
        : container.querySelector('.editor-action-menu--root-add > summary');
      returnTarget?.focus();
    };

    modalHost.querySelector('.btn-close-modal')?.addEventListener('click', closeModal);
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });

    function bindPickerActions() {
      listContainer.querySelectorAll('.btn-action-reuse-ref').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uId = btn.dataset.unitId;
          appendSequenceItem(targetContainer['marin:contentSequence'], uId);
          focusedItemId = uId;
          touchPackage(pkg);
          await persistWorkspace();
          closeModal();
          render(container);
          showMessage('Content reused by reference.', 'success');
        });
      });

      listContainer.querySelectorAll('.btn-action-reuse-dup').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uId = btn.dataset.unitId;
          const duplicate = duplicateContentUnit(pkg, uId);
          if (!duplicate) return;
          appendSequenceItem(targetContainer['marin:contentSequence'], duplicate['@id']);
          focusedItemId = duplicate['@id'];
          touchPackage(pkg);
          await persistWorkspace();
          closeModal();
          render(container);
          showMessage(`Duplicated and added as "${duplicate.name}".`, 'success');
        });
      });
    }

    bindPickerActions();
    searchInput?.focus();
  }

  function showSharedEditPrompt(unitId, container, onEditEverywhere) {
    const pkg = getPkg();
    const unit = getObject(pkg, unitId);
    const usages = structuralUsagesOf(pkg, unitId);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!unit || !modalHost) return;

    const usageNames = usages.map(({ object }) => {
      const usageName = object.name || object.text || 'Unnamed';
      return `<li>${escapeHtml(usageName)} <span class="text-muted">(${escapeHtml(usageTypeLabel(object))})</span></li>`;
    }).join('');

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="shared-edit-title">
        <div class="editor-preview-content editor-shared-prompt-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--warning">Shared Content</span>
              <h3 id="shared-edit-title">This content is used in more than one place</h3>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Cancel">Close</button>
          </header>
          <div class="editor-modal-body">
            <p>Changes to "<strong>${escapeHtml(unit.name)}</strong>" will also appear in ${usages.length} other resources:</p>
            <ul class="editor-usage-list">${usageNames}</ul>
            <p>What would you like to do?</p>
            <div class="editor-shared-prompt-actions">
              <button type="button" class="primary" id="btn-choice-edit-everywhere">Edit everywhere</button>
              <button type="button" class="secondary" id="btn-choice-make-copy">Make a separate copy</button>
              <button type="button" class="secondary outline" id="btn-choice-cancel">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector(`[data-unit-card="${CSS.escape(unitId)}"] button`)?.focus();
    };

    modalHost.querySelector('.btn-close-modal')?.addEventListener('click', closeModal);
    modalHost.querySelector('#btn-choice-cancel')?.addEventListener('click', closeModal);

    modalHost.querySelector('#btn-choice-edit-everywhere')?.addEventListener('click', () => {
      closeModal();
      onEditEverywhere();
    });

    modalHost.querySelector('#btn-choice-make-copy')?.addEventListener('click', async () => {
      const duplicate = duplicateContentUnit(pkg, unitId);
      if (!duplicate) return;
      const material = getObject(pkg, activeMaterialId);
      const parentInfo = findParentContainer(pkg, material, unitId);
      if (parentInfo) {
        const entry = parentInfo.sequence.itemListElement[parentInfo.index];
        entry.item = ref(duplicate['@id']);
      }
      activeUnitId = duplicate['@id'];
      focusedItemId = duplicate['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      closeModal();
      render(container);
      showMessage(`Created separate copy "${duplicate.name}".`, 'success');
    });

    modalHost.querySelector('#btn-choice-edit-everywhere')?.focus();
  }

  function showContentLibrary(container) {
    const pkg = getPkg();
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!modalHost) return;

    function renderLibraryCards() {
      const units = getObjects(pkg, TYPES.CONTENT_UNIT);
      if (!units.length) {
        return '<p class="text-muted editor-empty-notice">No content blocks in this project.</p>';
      }

      return units.map((u) => {
        const usages = structuralUsagesOf(pkg, u['@id']);
        const usageDesc = usages.length
          ? usages.map((use) => escapeHtml(use.object.name || 'Resource')).join(', ')
          : '<span class="text-muted">Unused in materials or slides</span>';

        return `
          <div class="editor-library-card" data-lib-card="${escapeHtml(u['@id'])}">
            <div class="editor-library-card-info">
              <div class="editor-reuse-card-badges">
                <span class="app-badge badge--level">${escapeHtml(humanize(u.learningResourceType || 'concept'))}</span>
                <span class="editor-usage-tag">${usages.length} usage(s)</span>
              </div>
              <h5>${escapeHtml(u.name)}</h5>
              ${u.abstract ? `<p class="editor-reuse-card-abstract">${escapeHtml(u.abstract)}</p>` : ''}
              <div class="editor-library-usages"><strong>Where used:</strong> ${usageDesc}</div>
            </div>
            <div class="editor-library-card-actions">
              <button type="button" class="secondary outline btn-sm btn-lib-dup" data-id="${escapeHtml(u['@id'])}">Duplicate as new</button>
              <button type="button" class="secondary outline btn-sm btn-remove btn-lib-del" data-id="${escapeHtml(u['@id'])}">Delete from project</button>
            </div>
          </div>`;
      }).join('');
    }

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="lib-modal-title">
        <div class="editor-preview-content editor-library-modal-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Project Content</span>
              <h2 id="lib-modal-title">Content Library</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close content library">Close</button>
          </header>
          <div class="editor-modal-body">
            <p class="text-muted">Manage all reusable content blocks in this learning project. Deleting a content block permanently removes it and its Markdown file.</p>
            <div class="editor-library-list-container">
              ${renderLibraryCards()}
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('#btn-open-content-library')?.focus();
    };

    modalHost.querySelector('.btn-close-modal')?.addEventListener('click', closeModal);
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });

    function bindLibraryActions() {
      modalHost.querySelectorAll('.btn-lib-dup').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uId = btn.dataset.id;
          const duplicate = duplicateContentUnit(pkg, uId);
          if (!duplicate) return;
          touchPackage(pkg);
          await persistWorkspace();
          modalHost.querySelector('.editor-library-list-container').innerHTML = renderLibraryCards();
          bindLibraryActions();
          showMessage(`Duplicated as "${duplicate.name}".`, 'success');
        });
      });

      modalHost.querySelectorAll('.btn-lib-del').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const uId = btn.dataset.id;
          const unit = getObject(pkg, uId);
          if (!unit) return;
          const usages = structuralUsagesOf(pkg, uId);

          let description;
          if (usages.length > 0) {
            const usageNames = usages.map((u) => u.object.name || 'Resource').join(', ');
            description = `“${unit.name}” is currently used in ${usages.length} place(s):\n${usageNames}\n\nDeleting it permanently removes the content block and its Markdown file.`;
          } else {
            description = `Delete “${unit.name}” permanently from this project? This also removes its Markdown file.`;
          }

          const confirmed = await dialogs.confirmAction({
            title: 'Delete content block?',
            description,
            submitLabel: 'Delete content block',
            destructive: true
          });
          if (!confirmed) return;

          removeGraphObject(pkg, uId);
          touchPackage(pkg);
          await persistWorkspace();
          modalHost.querySelector('.editor-library-list-container').innerHTML = renderLibraryCards();
          bindLibraryActions();
          render(container);
          const nextLibraryAction = modalHost.querySelector('.editor-library-list-container button') ||
            modalHost.querySelector('.btn-close-modal');
          nextLibraryAction?.focus();
          showMessage(`Deleted "${unit.name}" from project.`, 'success', { focus: false });
        });
      });
    }

    bindLibraryActions();
  }

  function mountActiveUnitEditor(container) {
    if (!activeUnitId) return;
    const pkg = getPkg();
    const unit = getObject(pkg, activeUnitId);
    const host = container.querySelector('[data-editor-host]');
    if (!unit || !host) return;

    const path = unit.encoding?.contentUrl;
    host.innerHTML = `
      <div class="editor-content-form">
        <div class="grid">
          <label>Content title<input id="unit-title" type="text" value="${escapeHtml(unit.name || '')}"></label>
          <label>Content type
            <select id="unit-type">
              ${['topic', 'overview', 'concept', 'procedure', 'reference', 'example', 'key-points', 'summary', 'note', 'warning']
                .map((t) => `<option value="${t}" ${unit.learningResourceType === t ? 'selected' : ''}>${humanize(t)}</option>`).join('')}
            </select>
          </label>
        </div>
        <label>Short summary <span class="editor-help-inline">Recommended; often used on presentation slides.</span>
          <textarea id="unit-abstract" rows="2">${escapeHtml(unit.abstract || '')}</textarea>
        </label>
        <div class="editor-objectives-field">
          <label class="editor-label">Learning goals taught by this block (optional):</label>
          <div class="editor-obj-checkboxes-container">
            ${renderObjectiveCheckboxes(pkg, asArray(unit.teaches).map((e) => e?.['@id']).filter(Boolean))}
          </div>
        </div>
        <div id="unit-rich-editor"></div>
        <div class="editor-form-actions">
          <button type="button" id="btn-save-unit" class="primary">Save content</button>
          <button type="button" id="btn-cancel-unit" class="secondary outline">Cancel</button>
        </div>
        <details class="editor-advanced-details">
          <summary>Advanced & Technical Details</summary>
          <div class="editor-advanced-body">
            <p><strong>Object ID:</strong> <code>${escapeHtml(unit['@id'])}</code></p>
            <p><strong>Identifier Slug:</strong> <code>${escapeHtml(unit.identifier)}</code></p>
            <p><strong>File Location:</strong> <code>${escapeHtml(path)}</code></p>
            <pre class="editor-json-preview"><code>${escapeHtml(JSON.stringify(unit, null, 2))}</code></pre>
          </div>
        </details>
      </div>`;

    activeMarkdownEditor = createMarkdownEditor({
      markdown: pkg.contentFiles[path] || '',
      label: `${unit.name || 'Content'} body`,
      dialogs,
      renderOptions: {
        resolveRef: (uuid) => `marin-ref:${uuid}`,
        resolveAsset: (uuid) => {
          const assetObj = getObject(pkg, `urn:uuid:${uuid}`);
          if (assetObj) {
            const fileData = pkg.assetFiles[assetObj.contentUrl];
            if (fileData?.bytes && fileData.type) {
              return bytesToDataUri(fileData.bytes, fileData.type);
            }
          }
          return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
        },
        onSelectImage: (callback) => showImageInsertModal(container, { getPkg, persistWorkspace, showMessage, onInsert: callback })
      }
    });

    host.querySelector('#unit-rich-editor').append(activeMarkdownEditor.element);
    host.querySelector('#btn-cancel-unit').addEventListener('click', () => {
      activeUnitId = null;
      render(container);
    });

    host.querySelector('#btn-save-unit').addEventListener('click', async () => {
      const title = host.querySelector('#unit-title').value.trim();
      const markdown = activeMarkdownEditor.getMarkdown();
      if (!title) {
        showMessage('Enter a content title.', 'error');
        host.querySelector('#unit-title').focus();
        return;
      }
      if (!markdown.trim()) {
        showMessage('Write some content before saving this block.', 'error');
        activeMarkdownEditor.focus();
        return;
      }
      unit.name = title;
      unit.abstract = host.querySelector('#unit-abstract').value.trim() || undefined;
      unit.learningResourceType = host.querySelector('#unit-type').value;
      const checkedObjs = [...host.querySelectorAll('input[name="associated-objective"]:checked')].map((i) => ref(i.value));
      if (checkedObjs.length) unit.teaches = checkedObjs;
      else delete unit.teaches;
      pkg.contentFiles[path] = markdown;
      touchPackage(pkg);
      await persistWorkspace();
      activeUnitId = null;
      render(container);
      showMessage('Content saved.', 'success');
    });

    queueMicrotask(() => activeMarkdownEditor.focus());
  }

  function showMaterialSettingsModal(container) {
    const pkg = getPkg();
    const material = getObject(pkg, activeMaterialId);
    if (!material) return;

    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!modalHost) return;

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="mat-settings-title">
        <div class="editor-preview-content editor-settings-modal-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Material Settings</span>
              <h2 id="mat-settings-title">${escapeHtml(material.name)} — Settings</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close settings">Close</button>
          </header>
          <div class="editor-modal-body">
            <div class="grid">
              <label>Material title
                <input type="text" id="setting-mat-title" value="${escapeHtml(material.name)}">
              </label>
              <label>Estimated duration <span class="editor-help-inline">e.g. 15 minutes</span>
                <input type="text" id="setting-mat-duration" value="${escapeHtml(material.timeRequired || '')}" placeholder="PT15M">
              </label>
            </div>
            <label>Short summary / description
              <textarea id="setting-mat-abstract" rows="2">${escapeHtml(material.abstract || '')}</textarea>
            </label>
            <div class="editor-objectives-field">
              <label class="editor-label">Learning objectives taught by this material:</label>
              <div class="editor-obj-checkboxes-container">
                ${renderObjectiveCheckboxes(pkg, asArray(material.teaches).map((e) => e?.['@id']).filter(Boolean))}
              </div>
            </div>
            <details class="editor-advanced-details">
              <summary>Advanced & Technical Details</summary>
              <div class="editor-advanced-body">
                <p><strong>Object ID:</strong> <code>${escapeHtml(material['@id'])}</code></p>
                <p><strong>Identifier Slug:</strong> <code>${escapeHtml(material.identifier)}</code></p>
                <pre class="editor-json-preview"><code>${escapeHtml(JSON.stringify(material, null, 2))}</code></pre>
              </div>
            </details>
            <div class="editor-form-actions">
              <button type="button" id="btn-save-mat-settings" class="primary">Save settings</button>
              <button type="button" class="secondary outline btn-close-modal">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('.editor-action-menu--material > summary')?.focus();
    };

    modalHost.querySelectorAll('.btn-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });

    modalHost.querySelector('#btn-save-mat-settings')?.addEventListener('click', async () => {
      const newTitle = modalHost.querySelector('#setting-mat-title').value.trim();
      if (!newTitle) {
        showMessage('Enter a material title.', 'error');
        return;
      }
      material.name = newTitle;
      material.identifier = slugify(newTitle, 'material');
      material.abstract = modalHost.querySelector('#setting-mat-abstract').value.trim() || undefined;
      const duration = modalHost.querySelector('#setting-mat-duration').value.trim();
      material.timeRequired = duration || undefined;

      const checkedObjs = [...modalHost.querySelectorAll('input[name="associated-objective"]:checked')].map((i) => ref(i.value));
      if (checkedObjs.length) material.teaches = checkedObjs;
      else delete material.teaches;

      touchPackage(pkg);
      await persistWorkspace();
      closeModal();
      render(container);
      showMessage('Material settings updated.', 'success');
    });

    modalHost.querySelector('#setting-mat-title')?.focus();
  }

  function showMaterialPreview(container) {
    const pkg = getPkg();
    const material = getObject(pkg, activeMaterialId);
    if (!material) return;

    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!modalHost) return;

    function buildPreviewHtml(owner, depth = 1) {
      const entries = sequenceItems(owner, 'marin:contentSequence');
      return entries.map((entry) => {
        const object = getObject(pkg, entry.item?.['@id']);
        if (!object) return '';
        if (hasType(object, TYPES.SECTION)) {
          const headingTag = depth === 1 ? 'h2' : depth === 2 ? 'h3' : 'h4';
          return `
            <section class="preview-section depth-${depth}">
              <${headingTag}>${escapeHtml(object.name)}</${headingTag}>
              ${buildPreviewHtml(object, depth + 1)}
            </section>`;
        }
        if (hasType(object, TYPES.CONTENT_UNIT)) {
          const path = object.encoding?.contentUrl;
          const md = pkg.contentFiles[path] || '';
          return `
            <article class="preview-unit">
              <h3>${escapeHtml(object.name)}</h3>
              ${object.abstract ? `<p class="preview-abstract"><em>${escapeHtml(object.abstract)}</em></p>` : ''}
              <div class="preview-body">${renderMarkdown(md)}</div>
            </article>`;
        }
        return '';
      }).join('');
    }

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-doc-title">
        <div class="editor-preview-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Reading Material Preview</span>
              <h2 id="preview-doc-title">${escapeHtml(material.name)}</h2>
            </div>
            <button type="button" class="secondary outline btn-close-preview" aria-label="Close preview">Close</button>
          </header>
          ${material.abstract ? `<p class="preview-doc-abstract"><strong>Overview:</strong> ${escapeHtml(material.abstract)}</p>` : ''}
          <div class="editor-preview-body">
            ${buildPreviewHtml(material, 1) || '<p class="text-muted">No content in this reading material.</p>'}
          </div>
        </div>
      </div>`;

    const closeBtn = modalHost.querySelector('.btn-close-preview');
    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('#btn-preview-material')?.focus();
    };
    closeBtn?.addEventListener('click', closeModal);
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeModal();
        window.removeEventListener('keydown', handleEsc);
      }
    };
    window.addEventListener('keydown', handleEsc);
    closeBtn?.focus();
  }

  function restoreFocus(container) {
    if (!focusedItemId) return;
    const escapedId = CSS.escape(focusedItemId);
    const item = container.querySelector(`[data-unit-card="${escapedId}"]`) ||
                 container.querySelector(`[data-section-id="${escapedId}"]`);
    const el = item?.querySelector('.editor-drag-handle:not(:disabled)') ||
               item?.querySelector('.editor-primary-item-action') ||
               item?.querySelector('h5') ||
               container.querySelector(`[data-material-id="${escapedId}"]`);
    if (el) {
      if (el.tabIndex < 0) el.tabIndex = -1;
      el.focus();
    }
    focusedItemId = null;
  }

  function usageTypeLabel(object) {
    const primaryType = objectPrimaryType(object);
    if (TYPE_LABELS[primaryType]) return TYPE_LABELS[primaryType];

    const localType = String(primaryType || 'Resource').replace(/^.*:/, '');
    return localType
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  function humanize(value) {
    return String(value).split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  }

  return {
    render,
    getActiveMaterialId: () => activeMaterialId,
    setActiveMaterialId: (id) => { activeMaterialId = id; }
  };
}
