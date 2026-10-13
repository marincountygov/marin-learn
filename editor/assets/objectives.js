// Marin Learn Authoring - Learning Objectives Module (Phase R2c)
import { TYPES } from '../../js/core/constants.js';
import {
  canSetObjectiveParent,
  createObjective,
  deleteObjective,
  getObject,
  getObjects,
  getObjectiveUsages,
  touchPackage
} from '../../js/core/model.js';
import { asArray, escapeHtml, ref, slugify } from '../../js/core/utils.js';

export function showObjectivesManager(container, { getPkg, persistWorkspace, showMessage, dialogs, onUpdate }) {
  const pkg = getPkg();
  if (!pkg) return;

  const modalHost = document.getElementById('editor-modal-root') || container;

  function renderList() {
    const objectives = getObjects(pkg, TYPES.OBJECTIVE);
    if (!objectives.length) {
      return '<p class="text-muted editor-empty-notice">No learning objectives defined yet. Add goals below.</p>';
    }

    // Build hierarchical tree: roots (no parent) and their children
    const roots = objectives.filter((o) => !o['marin:parentObjective']?.['@id']);
    const childrenMap = new Map();
    objectives.forEach((o) => {
      const parentId = o['marin:parentObjective']?.['@id'];
      if (parentId) {
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId).push(o);
      }
    });

    function renderNode(obj, depth = 0) {
      const usages = getObjectiveUsages(pkg, obj['@id']);
      const hasChildren = childrenMap.has(obj['@id']);
      const children = childrenMap.get(obj['@id']) || [];

      // Parent selector options (avoid cycles)
      const otherObjectives = objectives.filter((o) => o['@id'] !== obj['@id'] && canSetObjectiveParent(pkg, obj['@id'], o['@id']));
      const parentOptions = otherObjectives.map((o) => `
        <option value="${escapeHtml(o['@id'])}" ${obj['marin:parentObjective']?.['@id'] === o['@id'] ? 'selected' : ''}>${escapeHtml(o.name)}</option>
      `).join('');

      const teachingNames = usages.taughtBy.map((t) => escapeHtml(t.name)).join(', ');
      const assessingNames = usages.assessedBy.map((a) => escapeHtml(a.name || a.text || 'Question')).join(', ');

      let html = `
        <div class="editor-objective-item" data-obj-id="${escapeHtml(obj['@id'])}" data-depth="${depth}">
          <div class="editor-obj-main">
            <div class="editor-obj-title-row">
              <span class="editor-level-tag">${depth === 0 ? 'Goal' : 'Sub-goal'}</span>
              <h5 class="editor-obj-name">${escapeHtml(obj.name)}</h5>
            </div>
            <div class="editor-obj-meta">
              <span class="editor-usage-tag">Taught by ${usages.taughtBy.length} · Assessed by ${usages.assessedBy.length}</span>
              ${teachingNames ? `<div class="editor-obj-usage-detail"><strong>Taught:</strong> ${teachingNames}</div>` : ''}
              ${assessingNames ? `<div class="editor-obj-usage-detail"><strong>Assessed:</strong> ${assessingNames}</div>` : ''}
            </div>
          </div>
          <div class="editor-obj-controls">
            <label class="editor-obj-parent-label">
              <span class="visually-hidden">Parent goal</span>
              <select class="editor-obj-parent-select" data-id="${escapeHtml(obj['@id'])}" aria-label="Parent goal for ${escapeHtml(obj.name)}">
                <option value="">(None - Top-level goal)</option>
                ${parentOptions}
              </select>
            </label>
            <button type="button" class="secondary outline btn-sm btn-rename-obj" data-id="${escapeHtml(obj['@id'])}">Rename</button>
            <button type="button" class="secondary outline btn-sm btn-remove btn-del-obj" data-id="${escapeHtml(obj['@id'])}">Delete</button>
          </div>
        </div>`;

      if (hasChildren) {
        html += `<div class="editor-nested-objectives">${children.map((c) => renderNode(c, depth + 1)).join('')}</div>`;
      }
      return html;
    }

    // Render roots first, then any orphaned nodes whose parent wasn't found
    const renderedIds = new Set();
    let result = roots.map((r) => {
      renderedIds.add(r['@id']);
      return renderNode(r, 0);
    }).join('');

    const unrendered = objectives.filter((o) => !renderedIds.has(o['@id']));
    if (unrendered.length) {
      result += unrendered.map((u) => renderNode(u, 0)).join('');
    }
    return result;
  }

  modalHost.innerHTML = `
    <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="obj-modal-title">
      <div class="editor-preview-content editor-obj-modal-content">
        <header class="editor-preview-header">
          <div>
            <span class="app-badge badge--level">Learning Goals</span>
            <h2 id="obj-modal-title">Learning Objectives</h2>
          </div>
          <button type="button" class="secondary outline btn-close-modal" aria-label="Close objectives">Close</button>
        </header>
        <div class="editor-modal-body">
          <p class="text-muted">Learning objectives describe what someone should know or be able to do. You can organize goals hierarchically and link them to reading content and quizzes.</p>
          <div class="editor-obj-toolbar">
            <button type="button" id="btn-add-new-objective" class="primary">+ Add learning objective</button>
          </div>
          <div class="editor-obj-list-container">
            ${renderList()}
          </div>
        </div>
      </div>
    </div>`;

  const closeModal = () => {
    modalHost.innerHTML = '';
    onUpdate?.();
  };

  modalHost.querySelector('.btn-close-modal')?.addEventListener('click', closeModal);
  modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('editor-preview-modal')) closeModal();
  });

  function bindEvents() {
    const listContainer = modalHost.querySelector('.editor-obj-list-container');
    if (!listContainer) return;

    modalHost.querySelector('#btn-add-new-objective')?.addEventListener('click', async () => {
      const name = await dialogs.requestText({
        title: 'Add learning objective',
        description: 'Start with an action verb, such as “Explain core principles.”',
        label: 'Objective title',
        value: 'New learning objective',
        requiredMessage: 'Enter an objective title.',
        submitLabel: 'Add objective'
      });
      if (!name) return;
      const objective = createObjective(pkg, name);
      touchPackage(pkg);
      await persistWorkspace();
      listContainer.innerHTML = renderList();
      bindEvents();
      listContainer.querySelector(`[data-obj-id="${CSS.escape(objective['@id'])}"] .btn-rename-obj`)?.focus();
      showMessage(`Created objective "${name}".`, 'success', { focus: false });
    });

    listContainer.querySelectorAll('.editor-obj-parent-select').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const objId = sel.dataset.id;
        const parentId = sel.value || null;
        const obj = getObject(pkg, objId);
        if (!obj) return;

        if (parentId) {
          if (!canSetObjectiveParent(pkg, objId, parentId)) {
            showMessage('Cannot set parent: would create a circular dependency.', 'error');
            listContainer.innerHTML = renderList();
            bindEvents();
            return;
          }
          obj['marin:parentObjective'] = ref(parentId);
        } else {
          delete obj['marin:parentObjective'];
        }

        touchPackage(pkg);
        await persistWorkspace();
        listContainer.innerHTML = renderList();
        bindEvents();
        showMessage('Updated objective hierarchy.', 'success');
      });
    });

    listContainer.querySelectorAll('.btn-rename-obj').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const objId = btn.dataset.id;
        const obj = getObject(pkg, objId);
        if (!obj) return;
        const newName = await dialogs.requestText({
          title: 'Rename learning objective',
          label: 'Objective title',
          value: obj.name,
          requiredMessage: 'Enter an objective title.',
          submitLabel: 'Rename'
        });
        if (!newName || newName === obj.name) return;
        obj.name = newName;
        obj.identifier = slugify(newName, 'objective');
        touchPackage(pkg);
        await persistWorkspace();
        listContainer.innerHTML = renderList();
        bindEvents();
        listContainer.querySelector(`[data-obj-id="${CSS.escape(objId)}"] .btn-rename-obj`)?.focus();
        showMessage('Renamed learning objective.', 'success', { focus: false });
      });
    });

    listContainer.querySelectorAll('.btn-del-obj').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const objId = btn.dataset.id;
        const obj = getObject(pkg, objId);
        if (!obj) return;

        const usages = getObjectiveUsages(pkg, objId);
        const total = usages.taughtBy.length + usages.assessedBy.length;
        const description = total > 0
          ? `“${obj.name}” is associated with ${usages.taughtBy.length} content block(s) and ${usages.assessedBy.length} question(s).\n\nDeleting the objective also removes those associations.`
          : `Delete “${obj.name}” from this project?`;
        const confirmed = await dialogs.confirmAction({
          title: 'Delete learning objective?',
          description,
          submitLabel: 'Delete objective',
          destructive: true
        });
        if (!confirmed) return;

        const objectiveIds = getObjects(pkg, TYPES.OBJECTIVE).map((objective) => objective['@id']);
        const deletedIndex = objectiveIds.indexOf(objId);
        const nextObjectiveId = objectiveIds[deletedIndex + 1] || objectiveIds[deletedIndex - 1] || null;

        deleteObjective(pkg, objId);
        touchPackage(pkg);
        await persistWorkspace();
        listContainer.innerHTML = renderList();
        bindEvents();
        if (nextObjectiveId) {
          listContainer.querySelector(`[data-obj-id="${CSS.escape(nextObjectiveId)}"] .btn-rename-obj`)?.focus();
        } else {
          modalHost.querySelector('#btn-add-new-objective')?.focus();
        }
        showMessage(`Deleted objective "${obj.name}".`, 'success', { focus: false });
      });
    });
  }

  bindEvents();
}

export function renderObjectiveCheckboxes(pkg, currentAssociatedIds = []) {
  const objectives = getObjects(pkg, TYPES.OBJECTIVE);
  if (!objectives.length) {
    return '<p class="text-muted editor-help-text">No learning objectives in this project yet.</p>';
  }

  const selectedSet = new Set(currentAssociatedIds);
  return `
    <div class="editor-obj-picker-group">
      ${objectives.map((o) => `
        <label class="editor-obj-checkbox-label">
          <input type="checkbox" name="associated-objective" value="${escapeHtml(o['@id'])}" ${selectedSet.has(o['@id']) ? 'checked' : ''}>
          <span>${escapeHtml(o.name)}</span>
        </label>
      `).join('')}
    </div>`;
}
