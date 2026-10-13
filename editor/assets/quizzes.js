// Marin Learn Authoring - Full Quiz Authoring Module (Phase R3)
import { TYPES } from '../../js/core/constants.js';
import { renderMarkdown } from '../../js/core/markdown.js';
import {
  addToAssessment,
  appendSequenceItem,
  createAssessment,
  createAssessmentItem,
  createResponseOption,
  deleteObjective,
  duplicateAssessment,
  duplicateAssessmentItem,
  getObject,
  getObjects,
  hasType,
  insertSequenceItem,
  moveSequenceItem,
  ref,
  removeGraphObject,
  removeSequenceItem,
  sequenceItems,
  setSequence,
  structuralUsagesOf,
  touchPackage
} from '../../js/core/model.js';
import { asArray, escapeHtml, slugify, uuidUrn } from '../../js/core/utils.js';
import { renderObjectiveCheckboxes } from './objectives.js';
import { moveItemAtIndex, restoreItemList, snapshotItemList } from './reorder.js';
import { createPointerSortable } from '../../vendor/marin-sortable/marin-sortable.js';

export function createQuizzesModule({ getPkg, persistWorkspace, showMessage, dialogs }) {
  let activeQuizId = null;
  let activeEditingItemId = null;
  let focusedItemId = null;
  let questionSortable = null;
  let choiceSortable = null;

  function render(container) {
    if (!container) return;
    const pkg = getPkg();
    if (!pkg) return;

    questionSortable?.destroy();
    questionSortable = null;
    choiceSortable?.destroy();
    choiceSortable = null;

    const quizzes = getObjects(pkg, TYPES.ASSESSMENT);
    if (!quizzes.length) {
      container.innerHTML = `
        <div class="editor-empty-state">
          <p class="text-muted editor-empty-text">No quizzes yet. Add a few questions to help learners check their understanding.</p>
          <button id="btn-create-first-quiz" class="primary" type="button">Create quiz</button>
        </div>`;
      container.querySelector('#btn-create-first-quiz')?.addEventListener('click', () => createNewQuiz(container));
      return;
    }

    if (!activeQuizId || !quizzes.some((q) => q['@id'] === activeQuizId)) {
      activeQuizId = quizzes[0]['@id'];
    }
    const activeQuiz = getObject(pkg, activeQuizId);

    const navigation = quizzes.map((q) => `
      <button type="button" class="editor-subnav-btn ${q['@id'] === activeQuizId ? 'active' : ''}"
        data-quiz-id="${escapeHtml(q['@id'])}" aria-pressed="${q['@id'] === activeQuizId}">
        ${escapeHtml(q.name)}
      </button>`).join('');

    const entries = sequenceItems(activeQuiz, 'marin:itemSequence');
    const questionsHtml = entries.map((entry, index) => renderQuestionCard(entry, index, activeQuiz, entries.length)).join('');

    container.innerHTML = `
      <div class="editor-materials-layout">
        <aside class="editor-materials-sidebar" aria-label="Quizzes list">
          <h4>Quizzes</h4>
          <div class="editor-subnav-list">${navigation}</div>
          <div class="editor-sidebar-actions">
            <button id="btn-create-quiz-side" type="button" class="editor-sidebar-action"><span aria-hidden="true">+</span> Add quiz</button>
          </div>
        </aside>

        <div class="editor-materials-main">
          <header class="editor-material-header">
            <div class="editor-material-title-row">
              <h3>${escapeHtml(activeQuiz?.name || 'Quiz')}</h3>
              <div class="editor-header-actions">
                <button type="button" id="btn-rename-quiz" class="secondary outline btn-sm">Rename</button>
                <button type="button" id="btn-duplicate-quiz" class="secondary outline btn-sm">Duplicate quiz</button>
                <button type="button" id="btn-quiz-settings" class="secondary outline btn-sm">Settings & Policies</button>
                <button type="button" id="btn-preview-quiz" class="secondary outline btn-sm">Preview quiz</button>
                <button type="button" id="btn-delete-quiz" class="secondary outline btn-sm btn-remove">Delete quiz</button>
              </div>
            </div>
            ${activeQuiz?.abstract ? `<p class="editor-material-abstract">${escapeHtml(activeQuiz.abstract)}</p>` : ''}
            <div class="editor-quiz-policy-summary text-muted">
              <span><strong>Selection:</strong> ${activeQuiz?.['marin:selectionPolicy']?.mode === 'random' ? `Random (${activeQuiz['marin:selectionPolicy'].count || entries.length} questions)` : `All ${entries.length} question(s)`}</span>
              <span> &middot; <strong>Feedback:</strong> ${formatFeedbackTiming(activeQuiz?.['marin:feedbackPolicy']?.timing)}</span>
              ${activeQuiz?.['marin:scoringPolicy']?.passingPercent !== undefined ? `<span> &middot; <strong>Pass mark:</strong> ${activeQuiz['marin:scoringPolicy'].passingPercent}%</span>` : ''}
            </div>
          </header>

          <section class="editor-material-sequence" aria-label="Quiz questions">
            <div class="editor-sequence-header">
              <h4>Questions (${entries.length})</h4>
              <span class="text-muted editor-help-text">Drag a question by its handle, or use the Up and Down buttons. Expand a question to edit choices, hints, and feedback.</span>
            </div>
            <div class="editor-sequence-tree editor-question-sortable-list" data-sort-container-id="${escapeHtml(activeQuiz['@id'])}">
              ${questionsHtml || '<p class="text-muted" data-sortable-empty-notice>This quiz has no questions yet. Click "Add question" below to get started.</p>'}
            </div>
          </section>

          <div class="editor-material-toolbar">
            <button id="btn-add-question" type="button" class="primary">+ Add question</button>
            <button id="btn-reuse-question" type="button" class="secondary outline">Reuse question</button>
          </div>
        </div>
      </div>
      <div id="quiz-modal-container"></div>`;

    bindEvents(container);
    mountQuizSortables(container, activeQuiz);
    restoreFocus(container);
  }

  function renderQuestionCard(entry, index, quiz, count) {
    const pkg = getPkg();
    const item = getObject(pkg, entry.item?.['@id']);
    if (!item) return `<div class="app-alert app-alert--danger">Question ${index + 1} cannot be found.</div>`;

    const itemId = item['@id'];
    const isFirst = index === 0;
    const isLast = index === count - 1;
    const isEditing = itemId === activeEditingItemId;
    const weight = entry['marin:weight'] !== undefined ? Number(entry['marin:weight']) : 1;
    const interactionType = item['marin:interactionType'] || 'single-select';

    const options = sequenceItems(item, 'marin:options');
    const correctIds = new Set(asArray(item['marin:correctResponse']).map((r) => r?.['@id']));

    if (isEditing) {
      return renderQuestionEditForm(item, entry, weight, index);
    }

    const optionsSummaryHtml = options.map((optEntry) => {
      const opt = getObject(pkg, optEntry.item?.['@id']);
      if (!opt) return '';
      const isCorrect = correctIds.has(opt['@id']);
      return `
        <li class="editor-quiz-opt-preview ${isCorrect ? 'is-correct-opt' : ''}">
          <span class="editor-opt-marker">${isCorrect ? '&#10003;' : '&#9675;'}</span>
          <span class="editor-opt-text">${escapeHtml(opt.text || opt.name || 'Choice')}</span>
          ${isCorrect ? '<span class="app-badge badge--level badge--success-subtle">Correct</span>' : ''}
        </li>`;
    }).join('');

    return `
      <article class="editor-quiz-question-card editor-item-card editor-question-sortable-item" data-question-card="${escapeHtml(itemId)}" data-sort-item-id="${escapeHtml(itemId)}" aria-labelledby="q-title-${escapeHtml(itemId)}">
        <header class="editor-block-header">
          <div class="editor-item-heading">
            ${renderDragHandle(`question ${index + 1}: ${item.text || item.name || 'Question prompt'}`, 'editor-question-drag-handle', Boolean(activeEditingItemId))}
            <div class="editor-block-title-wrap">
            <div class="editor-block-badge-row">
              <span class="app-badge badge--level">${escapeHtml(formatInteractionType(interactionType))}</span>
              <span class="editor-weight-tag">${weight} point${weight === 1 ? '' : 's'}</span>
              ${item['marin:shuffleOptions'] ? '<span class="app-badge badge--level" title="Option choices will be randomized">&#128256; Shuffled</span>' : ''}
            </div>
              <h5 id="q-title-${escapeHtml(itemId)}">${index + 1}. ${escapeHtml(item.text || item.name || 'Question prompt')}</h5>
            </div>
          </div>
          <div class="editor-item-actions" role="toolbar" aria-label="Question actions for Question ${index + 1}">
            <button type="button" class="secondary outline btn-sm" data-action="edit-question" data-id="${escapeHtml(itemId)}">Edit</button>
            <button type="button" class="secondary outline btn-sm" data-action="duplicate-question" data-id="${escapeHtml(itemId)}" title="Duplicate question">Duplicate</button>
            <button type="button" class="secondary outline btn-sm" data-action="move-q-up" data-id="${escapeHtml(itemId)}" ${isFirst ? 'disabled aria-disabled="true"' : ''} title="Move question up">&#8593; Up</button>
            <button type="button" class="secondary outline btn-sm" data-action="move-q-down" data-id="${escapeHtml(itemId)}" ${isLast ? 'disabled aria-disabled="true"' : ''} title="Move question down">&#8595; Down</button>
            <button type="button" class="secondary outline btn-sm btn-remove" data-action="remove-question" data-id="${escapeHtml(itemId)}" title="Remove from this quiz">Remove</button>
          </div>
        </header>
        <div class="editor-quiz-options-summary">
          <ul class="editor-opt-preview-list">${optionsSummaryHtml}</ul>
        </div>
      </article>`;
  }

  function renderQuestionEditForm(item, entry, weight, index) {
    const pkg = getPkg();
    const itemId = item['@id'];
    const options = sequenceItems(item, 'marin:options');
    const correctIds = new Set(asArray(item['marin:correctResponse']).map((r) => r?.['@id']));
    const interactionType = item['marin:interactionType'] || 'single-select';

    const optionsFieldsHtml = options.map((optEntry, optIdx) => {
      const opt = getObject(pkg, optEntry.item?.['@id']);
      if (!opt) return '';
      const isCorrect = correctIds.has(opt['@id']);
      const isRadio = interactionType !== 'multiple-select';
      const isTrueFalse = interactionType === 'true-false';
      const choiceLabel = opt.text || `Choice ${optIdx + 1}`;

      return `
        <div class="editor-opt-row editor-choice-sortable-item" data-opt-id="${escapeHtml(opt['@id'])}" data-sort-item-id="${escapeHtml(opt['@id'])}">
          ${isTrueFalse ? '' : renderDragHandle(`answer choice ${optIdx + 1}: ${choiceLabel}`, 'editor-choice-drag-handle')}
          <label class="editor-opt-correct-label">
            <input type="${isRadio ? 'radio' : 'checkbox'}" name="correct-choice-${escapeHtml(itemId)}" value="${escapeHtml(opt['@id'])}" ${isCorrect ? 'checked' : ''} aria-label="Mark choice ${optIdx + 1} as correct">
            <span class="editor-correct-tag">${isCorrect ? 'Correct' : 'Mark correct'}</span>
          </label>
          <input type="text" class="editor-opt-text-input" value="${escapeHtml(opt.text || '')}" placeholder="Choice ${optIdx + 1} text" ${isTrueFalse ? 'readonly' : ''}>
          ${isTrueFalse ? '' : `
            <div class="editor-choice-actions" role="toolbar" aria-label="Answer choice ${optIdx + 1} actions">
              <button type="button" class="secondary outline btn-sm editor-choice-move" data-choice-action="move-up" data-opt-id="${escapeHtml(opt['@id'])}" aria-label="Move answer choice ${optIdx + 1} up" title="Move choice up" ${optIdx === 0 ? 'disabled aria-disabled="true"' : ''}>&#8593;</button>
              <button type="button" class="secondary outline btn-sm editor-choice-move" data-choice-action="move-down" data-opt-id="${escapeHtml(opt['@id'])}" aria-label="Move answer choice ${optIdx + 1} down" title="Move choice down" ${optIdx === options.length - 1 ? 'disabled aria-disabled="true"' : ''}>&#8595;</button>
              ${options.length > 2 ? `<button type="button" class="secondary outline btn-sm btn-remove btn-del-opt" data-opt-id="${escapeHtml(opt['@id'])}" title="Delete choice">Remove</button>` : ''}
            </div>`}
        </div>`;
    }).join('');

    return `
      <article class="editor-quiz-question-card editor-item-card editor-question-sortable-item is-editing" data-question-card="${escapeHtml(itemId)}" data-sort-item-id="${escapeHtml(itemId)}">
        <div class="editor-question-form">
          <h4>Edit Question ${index + 1}</h4>
          <label class="editor-label">
            Question prompt *
            <textarea id="q-edit-text" rows="2" placeholder="Ask a clear question…">${escapeHtml(item.text || '')}</textarea>
          </label>
          <div class="grid">
            <label class="editor-label">
              Question type
              <select id="q-edit-type">
                <option value="single-select" ${interactionType === 'single-select' ? 'selected' : ''}>Single-select (one correct answer)</option>
                <option value="multiple-select" ${interactionType === 'multiple-select' ? 'selected' : ''}>Multiple-select (choose all that apply)</option>
                <option value="true-false" ${interactionType === 'true-false' ? 'selected' : ''}>True / False</option>
              </select>
            </label>
            <label class="editor-label">
              Points / Weight
              <input type="number" id="q-edit-weight" min="1" max="100" value="${weight}">
            </label>
          </div>

          <div class="editor-choices-manager">
            <div class="editor-choices-header">
              <div>
                <label class="editor-label">Answer choices (mark all that apply as correct):</label>
                <span class="editor-help-text">${interactionType === 'true-false'
                  ? 'True and False stay in this order.'
                  : 'Drag a choice by its handle, or use the arrow buttons.'}</span>
              </div>
              ${interactionType !== 'true-false' ? `<button type="button" id="btn-add-choice" class="secondary outline btn-sm">+ Add choice</button>` : ''}
            </div>
            <div class="editor-choices-list editor-choice-sortable-list" data-sort-container-id="${escapeHtml(itemId)}">${optionsFieldsHtml}</div>
          </div>

          <div class="grid">
            <label class="editor-label">
              Explanation (shown after answer review)
              <input type="text" id="q-edit-explanation" value="${escapeHtml(item['marin:explanation'] || '')}" placeholder="Why this answer is correct…">
            </label>
            <label class="editor-label">
              Hint (optional hint revealed on request)
              <input type="text" id="q-edit-hint" value="${escapeHtml(item['marin:hint'] || '')}" placeholder="Helpful hint without giving away answer…">
            </label>
          </div>

          <label class="editor-checkbox-label">
            <input type="checkbox" id="q-edit-shuffle" ${item['marin:shuffleOptions'] ? 'checked' : ''}>
            <span>Shuffle answer choice order during attempt</span>
          </label>

          <div class="editor-objectives-field">
            <label class="editor-label">Associated learning goals (optional):</label>
            <div class="editor-obj-checkboxes-container">
              ${renderObjectiveCheckboxes(pkg, asArray(item.assesses).map((e) => e?.['@id']).filter(Boolean))}
            </div>
          </div>

          <details class="editor-advanced-details">
            <summary>Technical Details</summary>
            <div class="editor-advanced-body">
              <p><strong>Question ID:</strong> <code>${escapeHtml(item['@id'])}</code></p>
              <p><strong>Identifier Slug:</strong> <code>${escapeHtml(item.identifier)}</code></p>
              <pre class="editor-json-preview"><code>${escapeHtml(JSON.stringify(item, null, 2))}</code></pre>
            </div>
          </details>

          <div class="editor-form-actions">
            <button type="button" id="btn-save-question" class="primary">Save question</button>
            <button type="button" id="btn-cancel-question" class="secondary outline">Cancel</button>
          </div>
        </div>
      </article>`;
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

  function mountQuizSortables(container, quiz) {
    const root = container.querySelector('.editor-materials-main');
    if (root && quiz && !activeEditingItemId) {
      questionSortable = createPointerSortable(root, {
        listSelector: '.editor-question-sortable-list',
        itemSelector: '.editor-question-sortable-item',
        handleSelector: '.editor-question-drag-handle',
        getItemId: (item) => item?.dataset.sortItemId || '',
        getContainerId: (list) => list?.dataset.sortContainerId || '',
        canDrop: ({ sourceContainerId, targetContainerId }) => (
          sourceContainerId === quiz['@id'] && targetContainerId === quiz['@id']
        ),
        getDropLabel: ({ targetIndex }) => `Move question to position ${targetIndex + 1}`,
        onHandleActivate: () => {
          showMessage('Drag this handle to reorder the question, or use its Up and Down buttons.', 'information', { focus: false });
        },
        onDrop: (payload) => applyQuestionDrop(payload, container, quiz),
        onError: (_error, payload) => {
          focusedItemId = payload?.itemId || null;
          render(container);
          showMessage('The question could not be moved. The previous order was restored.', 'error', { focus: false });
        }
      });
    }

    const item = activeEditingItemId ? getObject(getPkg(), activeEditingItemId) : null;
    const choiceRoot = container.querySelector('.editor-choices-manager');
    if (choiceRoot && item && item['marin:interactionType'] !== 'true-false') {
      choiceSortable = createPointerSortable(choiceRoot, {
        listSelector: '.editor-choice-sortable-list',
        itemSelector: '.editor-choice-sortable-item',
        handleSelector: '.editor-choice-drag-handle',
        getItemId: (row) => row?.dataset.sortItemId || '',
        getContainerId: (list) => list?.dataset.sortContainerId || '',
        canDrop: ({ sourceContainerId, targetContainerId }) => (
          sourceContainerId === item['@id'] && targetContainerId === item['@id']
        ),
        getDropLabel: ({ targetIndex }) => `Move answer choice to position ${targetIndex + 1}`,
        onHandleActivate: () => {
          showMessage('Drag this handle to reorder the answer choice, or use its arrow buttons.', 'information', { focus: false });
        },
        onDrop: (payload) => applyChoiceMove(item, payload.itemId, payload.targetIndex, container, {
          focus: 'handle',
          sourceIndex: payload.sourceIndex
        }),
        onError: (_error, payload) => {
          syncChoiceRowsToModel(container, item);
          refreshChoiceOrderLabels(container);
          focusChoiceControl(container, payload?.itemId || '', 'handle');
          showMessage('The answer choice could not be moved. The previous order was restored.', 'error', { focus: false });
        }
      });
    }
  }

  async function applyQuestionDrop(payload, container, quiz) {
    const pkg = getPkg();
    const item = getObject(pkg, payload.itemId);
    const list = quiz?.['marin:itemSequence'];
    if (!item || !list) {
      focusedItemId = payload.itemId;
      render(container);
      showMessage('The question could not be moved.', 'warning', { focus: false });
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
      showMessage(`The question could not be moved. ${error.message}`, 'error', { focus: false });
      return;
    }

    const after = snapshotItemList(list);
    focusedItemId = payload.itemId;
    render(container);
    showMessage(`Moved question "${item.text || item.name || 'Question'}" to position ${result.targetIndex + 1}.`, 'success', {
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
          showMessage('Question move undone.', 'success', { focus: false });
        }
      }
    });
  }

  function syncChoiceRowsToModel(container, item) {
    const list = container.querySelector('.editor-choice-sortable-list');
    if (!list || !item) return;
    for (const entry of sequenceItems(item, 'marin:options')) {
      const optionId = entry.item?.['@id'];
      if (!optionId) continue;
      const row = list.querySelector(`[data-sort-item-id="${CSS.escape(optionId)}"]`);
      if (row) list.append(row);
    }
  }

  function refreshChoiceOrderLabels(container) {
    const rows = [...container.querySelectorAll('.editor-choice-sortable-list > .editor-choice-sortable-item')];
    rows.forEach((row, index) => {
      const position = index + 1;
      const textInput = row.querySelector('.editor-opt-text-input');
      const label = textInput?.value.trim() || `Choice ${position}`;
      if (textInput) textInput.placeholder = `Choice ${position} text`;

      const correctInput = row.querySelector('.editor-opt-correct-label input');
      if (correctInput) correctInput.setAttribute('aria-label', `Mark choice ${position} as correct`);

      const handle = row.querySelector('.editor-choice-drag-handle');
      if (handle) {
        const dragLabel = `Drag to reorder answer choice ${position}: ${label}`;
        handle.setAttribute('aria-label', dragLabel);
        handle.title = dragLabel;
      }

      const actions = row.querySelector('.editor-choice-actions');
      if (actions) actions.setAttribute('aria-label', `Answer choice ${position} actions`);
      const up = row.querySelector('[data-choice-action="move-up"]');
      const down = row.querySelector('[data-choice-action="move-down"]');
      if (up) {
        up.setAttribute('aria-label', `Move answer choice ${position} up`);
        up.disabled = index === 0;
        up.setAttribute('aria-disabled', String(index === 0));
      }
      if (down) {
        down.setAttribute('aria-label', `Move answer choice ${position} down`);
        down.disabled = index === rows.length - 1;
        down.setAttribute('aria-disabled', String(index === rows.length - 1));
      }
    });
  }

  function focusChoiceControl(container, optionId, preference = 'handle') {
    const row = container.querySelector(`[data-sort-item-id="${CSS.escape(optionId)}"]`);
    const selector = preference === 'move-up'
      ? '[data-choice-action="move-up"]'
      : preference === 'move-down'
        ? '[data-choice-action="move-down"]'
        : '.editor-choice-drag-handle';
    const preferred = row?.querySelector(selector);
    const control = preferred && !preferred.disabled
      ? preferred
      : row?.querySelector('.editor-choice-drag-handle:not(:disabled), button:not(:disabled), input:not(:disabled)');
    control?.focus({ preventScroll: true });
  }

  async function applyChoiceMove(
    item,
    optionId,
    targetIndex,
    container,
    { focus = 'handle', sourceIndex = null } = {}
  ) {
    const pkg = getPkg();
    const list = item?.['marin:options'];
    const option = getObject(pkg, optionId);
    if (!list || !option || item['marin:interactionType'] === 'true-false') {
      syncChoiceRowsToModel(container, item);
      refreshChoiceOrderLabels(container);
      return;
    }

    const resolvedSourceIndex = Number.isInteger(sourceIndex)
      ? sourceIndex
      : sequenceItems(item, 'marin:options')
        .findIndex((entry) => entry.item?.['@id'] === optionId);
    const before = snapshotItemList(list);
    const result = moveItemAtIndex(list, resolvedSourceIndex, targetIndex, optionId);
    if (!result.moved) {
      syncChoiceRowsToModel(container, item);
      refreshChoiceOrderLabels(container);
      focusChoiceControl(container, optionId, focus);
      return;
    }

    syncChoiceRowsToModel(container, item);
    refreshChoiceOrderLabels(container);

    try {
      touchPackage(pkg);
      await persistWorkspace();
    } catch (error) {
      restoreItemList(list, before);
      syncChoiceRowsToModel(container, item);
      refreshChoiceOrderLabels(container);
      focusChoiceControl(container, optionId, focus);
      showMessage(`The answer choice could not be moved. ${error.message}`, 'error', { focus: false });
      return;
    }

    const after = snapshotItemList(list);
    const row = container.querySelector(`[data-sort-item-id="${CSS.escape(optionId)}"]`);
    const currentLabel = row?.querySelector('.editor-opt-text-input')?.value.trim() || option.text || 'Answer choice';
    focusChoiceControl(container, optionId, focus);
    showMessage(`Moved "${currentLabel}" to answer choice position ${result.targetIndex + 1}.`, 'success', {
      focus: false,
      action: {
        label: 'Undo move',
        onClick: async () => {
          restoreItemList(list, before);
          syncChoiceRowsToModel(container, item);
          refreshChoiceOrderLabels(container);
          try {
            touchPackage(pkg);
            await persistWorkspace();
          } catch (error) {
            restoreItemList(list, after);
            syncChoiceRowsToModel(container, item);
            refreshChoiceOrderLabels(container);
            focusChoiceControl(container, optionId, focus);
            throw error;
          }
          showMessage('Answer choice move undone.', 'success', { focus: false });
          focusChoiceControl(container, optionId, focus);
        }
      }
    });
  }

  function bindEvents(container) {
    container.querySelectorAll('[data-quiz-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeQuizId = btn.dataset.quizId;
        activeEditingItemId = null;
        render(container);
      });
    });

    container.querySelector('#btn-create-quiz-side')?.addEventListener('click', () => createNewQuiz(container));

    container.querySelector('#btn-rename-quiz')?.addEventListener('click', async () => {
      const pkg = getPkg();
      const quiz = getObject(pkg, activeQuizId);
      if (!quiz) return;
      const newTitle = await dialogs.requestText({
        title: 'Rename quiz',
        label: 'Quiz title',
        value: quiz.name,
        requiredMessage: 'Enter a quiz title.',
        submitLabel: 'Rename'
      });
      if (!newTitle || newTitle === quiz.name) return;
      quiz.name = newTitle;
      quiz.identifier = slugify(newTitle, 'quiz');
      focusedItemId = quiz['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Quiz renamed.', 'success', { focus: false });
    });

    container.querySelector('#btn-duplicate-quiz')?.addEventListener('click', async () => {
      const pkg = getPkg();
      const duplicate = duplicateAssessment(pkg, activeQuizId);
      if (!duplicate) return;
      activeQuizId = duplicate['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage(`Duplicated quiz as "${duplicate.name}".`, 'success');
    });

    container.querySelector('#btn-quiz-settings')?.addEventListener('click', () => {
      showQuizSettingsModal(container);
    });

    container.querySelector('#btn-preview-quiz')?.addEventListener('click', () => {
      showQuizPreviewModal(container);
    });

    container.querySelector('#btn-delete-quiz')?.addEventListener('click', async () => {
      const pkg = getPkg();
      const quiz = getObject(pkg, activeQuizId);
      if (!quiz) return;
      const confirmed = await dialogs.confirmAction({
        title: 'Delete quiz?',
        description: `Delete “${quiz.name}” from this project? Existing question records are not deleted.`,
        submitLabel: 'Delete quiz',
        destructive: true
      });
      if (!confirmed) return;

      const quizIds = getObjects(pkg, TYPES.ASSESSMENT).map((candidate) => candidate['@id']);
      const deletedIndex = quizIds.indexOf(activeQuizId);
      const nextQuizId = quizIds[deletedIndex + 1] || quizIds[deletedIndex - 1] || null;
      removeGraphObject(pkg, activeQuizId);
      activeQuizId = nextQuizId;
      focusedItemId = nextQuizId;
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      if (!nextQuizId) container.querySelector('#btn-create-first-quiz')?.focus();
      showMessage('Quiz deleted.', 'success', { focus: false });
    });

    container.querySelector('#btn-add-question')?.addEventListener('click', () => {
      const pkg = getPkg();
      const quiz = getObject(pkg, activeQuizId);
      if (!quiz) return;
      const item = createAssessmentItem(pkg, 'single-select', 'New question prompt');
      addToAssessment(quiz, item['@id'], 1);
      activeEditingItemId = item['@id'];
      focusedItemId = item['@id'];
      touchPackage(pkg);
      persistWorkspace().then(() => render(container));
    });

    container.querySelector('#btn-reuse-question')?.addEventListener('click', () => {
      showReuseQuestionModal(container);
    });

    // Action handlers on questions
    container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        handleQuestionAction(action, id, container);
      });
    });

    // Form buttons inside active editing question
    if (activeEditingItemId) {
      bindQuestionFormEvents(container);
    }
  }

  function bindQuestionFormEvents(container) {
    const pkg = getPkg();
    const quiz = getObject(pkg, activeQuizId);
    const item = getObject(pkg, activeEditingItemId);
    if (!item) return;

    container.querySelector('#btn-cancel-question')?.addEventListener('click', () => {
      activeEditingItemId = null;
      render(container);
    });

    container.querySelector('#q-edit-type')?.addEventListener('change', (e) => {
      const newType = e.target.value;
      item['marin:interactionType'] = newType;
      if (newType === 'true-false') {
        const trueOpt = createResponseOption(pkg, 'True', 'true');
        const falseOpt = createResponseOption(pkg, 'False', 'false');
        setSequence(item['marin:options'], [trueOpt['@id'], falseOpt['@id']]);
        item['marin:correctResponse'] = [ref(trueOpt['@id'])];
      } else {
        const options = sequenceItems(item, 'marin:options');
        if (options.length < 2) {
          const opt1 = createResponseOption(pkg, 'First choice');
          const opt2 = createResponseOption(pkg, 'Second choice');
          setSequence(item['marin:options'], [opt1['@id'], opt2['@id']]);
          item['marin:correctResponse'] = [ref(opt1['@id'])];
        }
      }
      render(container);
    });

    container.querySelector('#btn-add-choice')?.addEventListener('click', () => {
      const count = sequenceItems(item, 'marin:options').length + 1;
      const newOpt = createResponseOption(pkg, `Choice ${count}`);
      appendSequenceItem(item['marin:options'], newOpt['@id']);
      render(container);
    });

    container.querySelectorAll('[data-choice-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const optionId = button.dataset.optId;
        const entries = sequenceItems(item, 'marin:options');
        const currentIndex = entries.findIndex((candidate) => candidate.item?.['@id'] === optionId);
        if (currentIndex < 0) return;
        const direction = button.dataset.choiceAction;
        const targetIndex = direction === 'move-up' ? currentIndex - 1 : currentIndex + 1;
        await applyChoiceMove(item, optionId, targetIndex, container, {
          focus: direction,
          sourceIndex: currentIndex
        });
      });
    });

    container.querySelectorAll('.btn-del-opt').forEach((delBtn) => {
      delBtn.addEventListener('click', () => {
        const optId = delBtn.dataset.optId;
        const options = sequenceItems(item, 'marin:options');
        const idx = options.findIndex((e) => e.item?.['@id'] === optId);
        if (idx !== -1) {
          removeSequenceItem(item['marin:options'], idx);
          item['marin:correctResponse'] = asArray(item['marin:correctResponse']).filter((r) => r?.['@id'] !== optId);
          render(container);
        }
      });
    });

    container.querySelector('#btn-save-question')?.addEventListener('click', async () => {
      const prompt = container.querySelector('#q-edit-text').value.trim();
      if (!prompt) {
        showMessage('Enter a question prompt.', 'error');
        container.querySelector('#q-edit-text').focus();
        return;
      }

      item.text = prompt;
      item.name = prompt;
      item.identifier = slugify(prompt, 'question');
      item['marin:interactionType'] = container.querySelector('#q-edit-type').value;

      const weight = parseInt(container.querySelector('#q-edit-weight').value, 10) || 1;
      const quizEntry = quiz['marin:itemSequence']?.itemListElement?.find((e) => e.item?.['@id'] === item['@id']);
      if (quizEntry) quizEntry['marin:weight'] = weight;

      // Update option texts
      container.querySelectorAll('.editor-opt-row').forEach((row) => {
        const optId = row.dataset.optId;
        const optText = row.querySelector('.editor-opt-text-input')?.value.trim();
        const opt = getObject(pkg, optId);
        if (opt && optText) opt.text = optText;
      });

      // Update correct responses
      const checkedBoxes = [...container.querySelectorAll(`input[name="correct-choice-${item['@id']}"]:checked`)];
      if (!checkedBoxes.length) {
        showMessage('Please mark at least one correct answer choice.', 'warning');
      }
      item['marin:correctResponse'] = checkedBoxes.map((cb) => ref(cb.value));

      item['marin:explanation'] = container.querySelector('#q-edit-explanation').value.trim() || undefined;
      item['marin:hint'] = container.querySelector('#q-edit-hint').value.trim() || undefined;
      item['marin:shuffleOptions'] = container.querySelector('#q-edit-shuffle').checked;

      // Associated learning objectives
      const checkedGoals = [...container.querySelectorAll('input[name="associated-objective"]:checked')].map((cb) => ref(cb.value));
      if (checkedGoals.length) item.assesses = checkedGoals;
      else delete item.assesses;

      touchPackage(pkg);
      await persistWorkspace();
      activeEditingItemId = null;
      render(container);
      showMessage('Question saved.', 'success');
    });
  }

  async function handleQuestionAction(action, id, container) {
    const pkg = getPkg();
    const quiz = getObject(pkg, activeQuizId);
    if (!quiz) return;

    if (action === 'edit-question') {
      activeEditingItemId = id;
      render(container);
      container.querySelector(`[data-question-card="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }

    if (action === 'duplicate-question') {
      const duplicate = duplicateAssessmentItem(pkg, id);
      if (!duplicate) return;
      addToAssessment(quiz, duplicate['@id'], 1);
      focusedItemId = duplicate['@id'];
      touchPackage(pkg);
      await persistWorkspace();
      render(container);
      showMessage('Duplicated question as new independent question.', 'success');
      return;
    }

    if (action === 'move-q-up' || action === 'move-q-down') {
      const items = sequenceItems(quiz, 'marin:itemSequence');
      const idx = items.findIndex((e) => e.item?.['@id'] === id);
      if (idx !== -1) {
        const delta = action === 'move-q-up' ? -1 : 1;
        if (moveSequenceItem(quiz['marin:itemSequence'], idx, delta)) {
          focusedItemId = id;
          touchPackage(pkg);
          await persistWorkspace();
          render(container);
        }
      }
      return;
    }

    if (action === 'remove-question') {
      const items = sequenceItems(quiz, 'marin:itemSequence');
      const idx = items.findIndex((e) => e.item?.['@id'] === id);
      if (idx !== -1) {
        removeSequenceItem(quiz['marin:itemSequence'], idx);
        touchPackage(pkg);
        await persistWorkspace();
        render(container);
        showMessage('Removed question from quiz.', 'success');
      }
      return;
    }
  }

  async function createNewQuiz(container) {
    const pkg = getPkg();
    if (!pkg) return;
    const title = await dialogs.requestText({
      title: 'Create quiz',
      label: 'Quiz title',
      value: 'New Quiz',
      requiredMessage: 'Enter a quiz title.',
      submitLabel: 'Create'
    });
    if (!title) return;
    const quiz = createAssessment(pkg, title);
    activeQuizId = quiz['@id'];
    activeEditingItemId = null;
    focusedItemId = quiz['@id'];
    await persistWorkspace();
    render(container);
  }

  function showQuizSettingsModal(container) {
    const pkg = getPkg();
    const quiz = getObject(pkg, activeQuizId);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!quiz || !modalHost) return;

    const selPolicy = quiz['marin:selectionPolicy'] || { mode: 'all', shuffle: false };
    const feedPolicy = quiz['marin:feedbackPolicy'] || { timing: 'after-assessment', showCorrectResponses: true, showOptionFeedback: true, showExplanation: true };
    const scorePolicy = quiz['marin:scoringPolicy'] || { method: 'weighted-sum' };

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-settings-title">
        <div class="editor-preview-content editor-settings-modal-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Quiz Settings</span>
              <h2 id="quiz-settings-title">${escapeHtml(quiz.name)} — Settings</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close settings">Close</button>
          </header>
          <div class="editor-modal-body">
            <div class="grid">
              <label>Quiz title
                <input type="text" id="setting-quiz-name" value="${escapeHtml(quiz.name)}">
              </label>
              <label>Question selection mode
                <select id="setting-quiz-mode">
                  <option value="all" ${selPolicy.mode === 'all' ? 'selected' : ''}>Show all questions</option>
                  <option value="random" ${selPolicy.mode === 'random' ? 'selected' : ''}>Random question sample</option>
                </select>
              </label>
            </div>
            <div class="grid">
              <label>Questions count (if random sample)
                <input type="number" id="setting-quiz-count" min="1" value="${selPolicy.count || 5}">
              </label>
              <label>Passing threshold percentage (0–100, optional)
                <input type="number" id="setting-quiz-pass" min="0" max="100" value="${scorePolicy.passingPercent !== undefined ? scorePolicy.passingPercent : 70}">
              </label>
            </div>
            <label>Feedback timing
              <select id="setting-quiz-timing">
                <option value="after-assessment" ${feedPolicy.timing === 'after-assessment' ? 'selected' : ''}>After assessment (review results after submission)</option>
                <option value="after-item" ${feedPolicy.timing === 'after-item' ? 'selected' : ''}>After each question (immediate check & lock)</option>
                <option value="none" ${feedPolicy.timing === 'none' ? 'selected' : ''}>Score summary only (no detailed question review)</option>
              </select>
            </label>
            <div class="editor-checkbox-group">
              <label class="editor-checkbox-label">
                <input type="checkbox" id="setting-quiz-shuffle-q" ${selPolicy.shuffle ? 'checked' : ''}>
                <span>Shuffle question order for each attempt</span>
              </label>
              <label class="editor-checkbox-label">
                <input type="checkbox" id="setting-quiz-show-correct" ${feedPolicy.showCorrectResponses !== false ? 'checked' : ''}>
                <span>Reveal correct answers in final results</span>
              </label>
              <label class="editor-checkbox-label">
                <input type="checkbox" id="setting-quiz-show-exp" ${feedPolicy.showExplanation !== false ? 'checked' : ''}>
                <span>Show explanations in final review</span>
              </label>
            </div>
            <details class="editor-advanced-details">
              <summary>Technical Details</summary>
              <div class="editor-advanced-body">
                <p><strong>Quiz ID:</strong> <code>${escapeHtml(quiz['@id'])}</code></p>
                <p><strong>Identifier Slug:</strong> <code>${escapeHtml(quiz.identifier)}</code></p>
                <pre class="editor-json-preview"><code>${escapeHtml(JSON.stringify(quiz, null, 2))}</code></pre>
              </div>
            </details>
            <div class="editor-form-actions">
              <button type="button" id="btn-save-quiz-settings" class="primary">Save settings</button>
              <button type="button" class="secondary outline btn-close-modal">Cancel</button>
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('#btn-quiz-settings')?.focus();
    };

    modalHost.querySelectorAll('.btn-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });

    modalHost.querySelector('#btn-save-quiz-settings')?.addEventListener('click', async () => {
      const name = modalHost.querySelector('#setting-quiz-name').value.trim();
      if (!name) {
        showMessage('Enter a quiz title.', 'error');
        return;
      }
      quiz.name = name;
      quiz.identifier = slugify(name, 'quiz');

      const mode = modalHost.querySelector('#setting-quiz-mode').value;
      const count = parseInt(modalHost.querySelector('#setting-quiz-count').value, 10) || 5;
      const shuffle = modalHost.querySelector('#setting-quiz-shuffle-q').checked;
      if (mode === 'random') {
        quiz['marin:selectionPolicy'] = { mode: 'random', count, shuffle };
      } else {
        quiz['marin:selectionPolicy'] = { mode: 'all', shuffle };
      }

      const timing = modalHost.querySelector('#setting-quiz-timing').value;
      const showCorrect = modalHost.querySelector('#setting-quiz-show-correct').checked;
      const showExp = modalHost.querySelector('#setting-quiz-show-exp').checked;
      quiz['marin:feedbackPolicy'] = { timing, showCorrectResponses: showCorrect, showOptionFeedback: true, showExplanation: showExp };

      const pass = parseInt(modalHost.querySelector('#setting-quiz-pass').value, 10);
      quiz['marin:scoringPolicy'] = { method: 'weighted-sum', passingPercent: isNaN(pass) ? undefined : pass };

      touchPackage(pkg);
      await persistWorkspace();
      closeModal();
      render(container);
      showMessage('Quiz policies saved.', 'success');
    });

    modalHost.querySelector('#setting-quiz-name')?.focus();
  }

  function showReuseQuestionModal(container) {
    const pkg = getPkg();
    const quiz = getObject(pkg, activeQuizId);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!quiz || !modalHost) return;

    const allQuestions = getObjects(pkg, TYPES.ASSESSMENT_ITEM);
    const currentQuestionIds = new Set(sequenceItems(quiz, 'marin:itemSequence').map((e) => e.item?.['@id']));

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="reuse-q-title">
        <div class="editor-preview-content editor-reuse-modal-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Question Bank</span>
              <h2 id="reuse-q-title">Reuse Existing Question</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close question chooser">Close</button>
          </header>
          <div class="editor-modal-body">
            <p class="text-muted">Choose an existing question from this project to include in "${escapeHtml(quiz.name)}".</p>
            <div class="editor-reuse-list-container">
              ${allQuestions.map((q) => {
                const inThisQuiz = currentQuestionIds.has(q['@id']);
                return `
                  <div class="editor-reuse-card">
                    <div class="editor-reuse-card-info">
                      <div class="editor-reuse-card-badges">
                        <span class="app-badge badge--level">${escapeHtml(formatInteractionType(q['marin:interactionType']))}</span>
                        ${inThisQuiz ? '<span class="editor-usage-tag">Already in this quiz</span>' : ''}
                      </div>
                      <h5>${escapeHtml(q.text || q.name || 'Question')}</h5>
                    </div>
                    <div class="editor-reuse-card-actions">
                      <button type="button" class="primary btn-sm btn-reuse-q-ref" data-q-id="${escapeHtml(q['@id'])}" ${inThisQuiz ? 'disabled' : ''}>Reuse</button>
                      <button type="button" class="secondary outline btn-sm btn-reuse-q-dup" data-q-id="${escapeHtml(q['@id'])}">Duplicate & Use</button>
                    </div>
                  </div>`;
              }).join('') || '<p class="text-muted">No questions found in this project.</p>'}
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('#btn-reuse-question')?.focus();
    };

    modalHost.querySelectorAll('.btn-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });

    modalHost.querySelectorAll('.btn-reuse-q-ref').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const qId = btn.dataset.qId;
        addToAssessment(quiz, qId, 1);
        focusedItemId = qId;
        touchPackage(pkg);
        await persistWorkspace();
        closeModal();
        render(container);
        showMessage('Question reused by reference.', 'success');
      });
    });

    modalHost.querySelectorAll('.btn-reuse-q-dup').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const qId = btn.dataset.qId;
        const duplicate = duplicateAssessmentItem(pkg, qId);
        if (!duplicate) return;
        addToAssessment(quiz, duplicate['@id'], 1);
        focusedItemId = duplicate['@id'];
        touchPackage(pkg);
        await persistWorkspace();
        closeModal();
        render(container);
        showMessage('Duplicated and added question.', 'success');
      });
    });
  }

  function showQuizPreviewModal(container) {
    const pkg = getPkg();
    const quiz = getObject(pkg, activeQuizId);
    const modalHost = document.getElementById('editor-modal-root') || container;
    if (!quiz || !modalHost) return;

    const entries = sequenceItems(quiz, 'marin:itemSequence');

    modalHost.innerHTML = `
      <div class="editor-preview-modal" role="dialog" aria-modal="true" aria-labelledby="preview-quiz-title">
        <div class="editor-preview-content">
          <header class="editor-preview-header">
            <div>
              <span class="app-badge badge--level">Quiz Preview</span>
              <h2 id="preview-quiz-title">${escapeHtml(quiz.name)}</h2>
            </div>
            <button type="button" class="secondary outline btn-close-modal" aria-label="Close preview">Close</button>
          </header>
          <div class="editor-preview-body">
            <p class="text-muted">Preview of all questions in this quiz. In the learner viewer, question selection and feedback policies are applied during the attempt.</p>
            <div class="editor-preview-questions-list">
              ${entries.map((entry, idx) => {
                const item = getObject(pkg, entry.item?.['@id']);
                if (!item) return '';
                const opts = sequenceItems(item, 'marin:options');
                const correctSet = new Set(asArray(item['marin:correctResponse']).map((r) => r?.['@id']));
                const weight = entry['marin:weight'] !== undefined ? Number(entry['marin:weight']) : 1;
                return `
                  <div class="quiz-preview-item">
                    <h4>Question ${idx + 1} (${weight} pt${weight === 1 ? '' : 's'}): ${escapeHtml(item.text || item.name || '')}</h4>
                    <ul class="quiz-preview-opts">
                      ${opts.map((oe) => {
                        const opt = getObject(pkg, oe.item?.['@id']);
                        if (!opt) return '';
                        const isC = correctSet.has(opt['@id']);
                        return `<li>${isC ? '<strong>[Correct]</strong> ' : '[ ] '}${escapeHtml(opt.text || '')}</li>`;
                      }).join('')}
                    </ul>
                    ${item['marin:explanation'] ? `<p class="quiz-preview-exp"><strong>Explanation:</strong> ${escapeHtml(item['marin:explanation'])}</p>` : ''}
                    ${item['marin:hint'] ? `<p class="quiz-preview-hint"><strong>Hint:</strong> ${escapeHtml(item['marin:hint'])}</p>` : ''}
                  </div>`;
              }).join('') || '<p class="text-muted">No questions in this quiz.</p>'}
            </div>
          </div>
        </div>
      </div>`;

    const closeModal = () => {
      modalHost.innerHTML = '';
      container.querySelector('#btn-preview-quiz')?.focus();
    };

    modalHost.querySelectorAll('.btn-close-modal').forEach((btn) => btn.addEventListener('click', closeModal));
    modalHost.querySelector('.editor-preview-modal')?.addEventListener('click', (e) => {
      if (e.target.classList.contains('editor-preview-modal')) closeModal();
    });
  }

  function restoreFocus(container) {
    if (!focusedItemId) return;
    const card = container.querySelector(`[data-question-card="${CSS.escape(focusedItemId)}"]`);
    const el = card?.querySelector('.editor-question-drag-handle:not(:disabled)') ||
               card?.querySelector('h5') ||
               container.querySelector(`[data-id="${CSS.escape(focusedItemId)}"]`) ||
               container.querySelector(`[data-quiz-id="${CSS.escape(focusedItemId)}"]`);
    if (el) {
      if (el.tabIndex < 0) el.tabIndex = -1;
      el.focus();
    }
    focusedItemId = null;
  }

  function formatInteractionType(type) {
    if (type === 'multiple-select') return 'Multiple-select';
    if (type === 'true-false') return 'True / False';
    return 'Single-select';
  }

  function formatFeedbackTiming(timing) {
    if (timing === 'after-item') return 'After each question';
    if (timing === 'none') return 'Summary score only';
    return 'After submission';
  }

  function humanize(val) {
    return String(val).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  return {
    render,
    getActiveQuizId: () => activeQuizId,
    setActiveQuizId: (id) => { activeQuizId = id; }
  };
}
