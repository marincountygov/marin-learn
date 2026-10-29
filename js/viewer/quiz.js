// Marin Learn - Quiz Viewer and Assessment Engine (Phase 7)
import { actionIcon } from './action-icons.js';
import { copyText } from './clipboard.js';
import { loadLearningSetGraph, hasType } from '../core/graph.js';
import { parseMarkdownToHtml } from '../core/markdown.js';
import { breadcrumbHtml, wireBreadcrumb } from './breadcrumb.js';

export async function renderQuizViewer(container, setSlug, resourceSlug, catalogItems, onNavigate) {
  container.innerHTML = '<div class="catalog-status" aria-live="polite">Loading Marin Learn…</div>';

  const catalogEntry = catalogItems.find(item => item.identifier === setSlug);
  if (!catalogEntry) {
    renderError(container, 'Course not found.', setSlug, onNavigate);
    return;
  }

  try {
    const graphData = await loadLearningSetGraph(catalogEntry.graphUrl);

    let assessment = null;
    if (resourceSlug) {
      assessment = graphData.assessments.find(a => a.identifier === resourceSlug || a['@id'] === resourceSlug || a['@id'] === `urn:uuid:${resourceSlug}`);
    }
    if (!assessment && graphData.assessments.length > 0) {
      assessment = graphData.assessments[0];
    }

    if (!assessment) {
      renderError(container, 'No assessment found in this course.', setSlug, onNavigate);
      return;
    }

    // Extract all items from itemSequence
    const allItems = [];
    const itemSeq = assessment['marin:itemSequence'];
    if (itemSeq && itemSeq.itemListElement) {
      itemSeq.itemListElement.forEach(li => {
        const ref = li.item && li.item['@id'];
        if (!ref) return;
        const itemObj = graphData.byId.get(ref);
        if (itemObj && hasType(itemObj, 'AssessmentItem')) {
          allItems.push({
            obj: itemObj,
            weight: li['marin:weight'] !== undefined ? Number(li['marin:weight']) : 1
          });
        }
      });
    }

    if (allItems.length === 0) {
      renderError(container, 'Assessment contains no questions.', setSlug, onNavigate);
      return;
    }

    // Apply selection policy
    const selectionPolicy = assessment['marin:selectionPolicy'] || { mode: 'all' };
    let selectedItems = [...allItems];

    if (selectionPolicy.mode === 'random') {
      const count = Math.min(selectionPolicy.count || allItems.length, allItems.length);
      // Simple stable pseudo-random or shuffled subset for attempt
      const shuffled = [...allItems].sort(() => Math.random() - 0.5);
      selectedItems = shuffled.slice(0, count);
    }

    if (selectionPolicy.shuffle) {
      selectedItems.sort(() => Math.random() - 0.5);
    }

    // Prepare attempt items with shuffled options
    const attemptItems = selectedItems.map(({ obj, weight }) => {
      const optList = obj['marin:options'] && obj['marin:options'].itemListElement;
      let options = [];
      if (optList) {
        optList.forEach(li => {
          const oRef = li.item && li.item['@id'];
          if (oRef) {
            const optObj = graphData.byId.get(oRef);
            if (optObj) options.push(optObj);
          }
        });
      }

      if (obj['marin:shuffleOptions']) {
        options.sort(() => Math.random() - 0.5);
      }

      return {
        id: obj['@id'],
        identifier: obj.identifier,
        text: obj.text || obj.name,
        interactionType: obj['marin:interactionType'] || 'single-select',
        options,
        correctResponse: new Set((obj['marin:correctResponse'] || []).map(r => r['@id'])),
        explanation: obj['marin:explanation'],
        hint: obj['marin:hint'],
        isBasedOn: obj['isBasedOn'],
        weight
      };
    });

    // Attempt state
    let currentIndex = 0;
    const userAnswers = new Map(); // itemId -> Set of selected option IDs
    const checkedItems = new Set(); // itemIds submitted in after-item mode
    let isSubmitted = false;

    function renderQuizView() {
      if (isSubmitted) {
        renderResultsView();
        return;
      }

      const item = attemptItems[currentIndex];
      const selectedSet = userAnswers.get(item.id) || new Set();
      const feedbackPolicy = assessment['marin:feedbackPolicy'] || { timing: 'after-assessment' };
      const isChecked = checkedItems.has(item.id);

      let optionsHtml = '';
      item.options.forEach((opt, oIdx) => {
        const optId = opt['@id'];
        const isCheckedOpt = selectedSet.has(optId);
        const inputType = item.interactionType === 'multiple-select' ? 'checkbox' : 'radio';
        const inputName = `question-${item.id}`;

        let optFeedbackHtml = '';
        if (isChecked && feedbackPolicy.showOptionFeedback && opt.text) {
          // If option has individual feedback
        }

        optionsHtml += `
          <label class="quiz-option-label ${isCheckedOpt ? 'selected' : ''}">
            <input type="${inputType}" name="${inputName}" value="${escapeHtml(optId)}" ${isCheckedOpt ? 'checked' : ''} ${isChecked ? 'disabled' : ''}>
            <div class="quiz-option-text">${parseMarkdownToHtml(opt.text || opt.name || '', graphData)}</div>
          </label>
        `;
      });

      let hintHtml = '';
      if (item.hint) {
        hintHtml = `
          <details class="quiz-hint-details">
            <summary>Reveal Hint</summary>
            <div class="quiz-hint-body">${parseMarkdownToHtml(item.hint, graphData)}</div>
          </details>
        `;
      }

      let itemFeedbackHtml = '';
      if (isChecked && feedbackPolicy.timing === 'after-item') {
        const isCorrect = setEquals(selectedSet, item.correctResponse);
        itemFeedbackHtml = `
          <div class="quiz-item-feedback ${isCorrect ? 'correct' : 'incorrect'}">
            <p><strong>${isCorrect ? 'Correct!' : 'Incorrect.'}</strong></p>
            ${feedbackPolicy.showExplanation && item.explanation ? `<div class="quiz-explanation">${parseMarkdownToHtml(item.explanation, graphData)}</div>` : ''}
          </div>
        `;
      }

      const hasAnswer = selectedSet.size > 0;

      container.innerHTML = `
        ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: catalogEntry.name, route: { set: setSlug } }, { label: 'Quiz' }])}
        <div class="quiz-viewer-container" role="region" aria-label="Assessment Quiz">
          <header class="quiz-top-bar">
            <div class="quiz-title-info">
              <span class="quiz-name">${escapeHtml(assessment.name)}</span>
              <span class="quiz-counter">Question ${currentIndex + 1} of ${attemptItems.length}</span>
            </div>
            <div class="quiz-progress-indicator">
              <progress value="${currentIndex + 1}" max="${attemptItems.length}"></progress>
            </div>
          </header>

          <main class="quiz-main-card">
            <div class="quiz-question-header">
              <h2>Question ${currentIndex + 1}</h2>
              <span class="app-badge quiz-weight-badge">${item.weight} point${item.weight === 1 ? '' : 's'}</span>
            </div>

            <div class="quiz-question-prompt">
              ${parseMarkdownToHtml(item.text, graphData)}
            </div>

            <div class="quiz-options-group" role="group" aria-label="Answer options">
              ${optionsHtml}
            </div>

            ${hintHtml}
            ${itemFeedbackHtml}

            <div class="quiz-nav-actions">
              ${feedbackPolicy.timing === 'after-item' && !isChecked ? `
                <button id="check-item-btn" class="primary">Check Answer</button>
              ` : ''}

              <div class="quiz-step-buttons">
                <div class="action-group action-group--spaced" role="group" aria-label="Change question">
                  <button type="button" id="prev-q" class="action-button" aria-label="Previous question" title="Previous question" ${currentIndex === 0 ? 'disabled' : ''}>${actionIcon('arrow-left')}</button>
                  ${currentIndex < attemptItems.length - 1 ? `
                    <button type="button" id="next-q" class="action-button" aria-label="Next question" title="Next question" ${!hasAnswer ? 'disabled' : ''}>${actionIcon('arrow-right')}</button>
                  ` : ''}
                </div>
                ${currentIndex < attemptItems.length - 1 ? '' : `
                  <button id="submit-quiz" class="primary" ${!hasAnswer ? 'disabled' : ''}>Finish Quiz</button>
                `}
              </div>
            </div>
          </main>
        </div>
      `;

      // Bind events
      wireBreadcrumb(container, onNavigate);

      container.querySelectorAll(`input[name="question-${item.id}"]`).forEach(input => {
        input.addEventListener('change', (e) => {
          if (isChecked) return;
          let set = userAnswers.get(item.id) || new Set();
          const optId = e.target.value;
          if (item.interactionType === 'multiple-select') {
            if (e.target.checked) set.add(optId);
            else set.delete(optId);
          } else {
            set = new Set([optId]);
          }
          userAnswers.set(item.id, set);
          const nextBtn = document.getElementById('next-q') || document.getElementById('submit-quiz');
          if (nextBtn) {
            nextBtn.disabled = set.size === 0;
          }
        });
      });

      const checkBtn = document.getElementById('check-item-btn');
      if (checkBtn) {
        checkBtn.addEventListener('click', () => {
          checkedItems.add(item.id);
          renderQuizView();
        });
      }

      const prevBtn = document.getElementById('prev-q');
      if (prevBtn) {
        prevBtn.addEventListener('click', () => {
          if (currentIndex > 0) {
            currentIndex--;
            renderQuizView();
          }
        });
      }

      const nextBtn = document.getElementById('next-q');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          if (currentIndex < attemptItems.length - 1) {
            currentIndex++;
            renderQuizView();
          }
        });
      }

      const submitBtn = document.getElementById('submit-quiz');
      if (submitBtn) {
        submitBtn.addEventListener('click', () => {
          isSubmitted = true;
          renderQuizView();
        });
      }
    }

    function renderResultsView() {
      let earnedPoints = 0;
      let totalPoints = 0;
      const reviewDetails = [];

      attemptItems.forEach((item, idx) => {
        totalPoints += item.weight;
        const userSet = userAnswers.get(item.id) || new Set();
        const isCorrect = setEquals(userSet, item.correctResponse);
        if (isCorrect) earnedPoints += item.weight;

        // Resolve source link material if available
        let sourceMaterialName = null;
        let sourceSection = null;
        if (item.isBasedOn && item.isBasedOn.length > 0) {
          const srcObj = graphData.byId.get(item.isBasedOn[0]['@id']);
          if (srcObj) sourceMaterialName = srcObj.name;
          // A question based on a Note section links back to that section of the notes.
          if (srcObj && hasType(srcObj, 'NoteSection') && graphData.notes[0]) {
            sourceSection = { name: srcObj.name, type: srcObj['marin:sectionType'], note: graphData.notes[0].identifier };
          }
        }

        reviewDetails.push({
          index: idx + 1,
          item,
          userSet,
          isCorrect,
          sourceMaterialName,
          sourceSection
        });
      });

      const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
      const scoringPolicy = assessment['marin:scoringPolicy'] || {};
      const passingPercent = scoringPolicy.passingPercent !== undefined ? scoringPolicy.passingPercent : 70;
      const passed = percentage >= passingPercent;

      // "Data 101 — quiz" reads as "Data 101 quiz" in a sentence.
      const quizTitle = assessment.name.replace(/\s+\u2014\s+/, ' ');

      // Grade scale band resolution
      let gradeName = passed ? 'Pass' : 'Needs Review';
      let gradeMessage = passed ? 'You successfully passed this assessment.' : 'Review the learning materials and try again.';
      
      const gradeScaleRef = scoringPolicy.gradeScale && scoringPolicy.gradeScale['@id'];
      const gradeScaleObj = gradeScaleRef ? graphData.byId.get(gradeScaleRef) : graphData.gradeScales?.[0];
      if (gradeScaleObj && gradeScaleObj['marin:gradeBands']) {
        const bands = [...gradeScaleObj['marin:gradeBands']].sort((a, b) => b.minPercent - a.minPercent);
        for (const band of bands) {
          if (percentage >= (band.minPercent || 0)) {
            gradeName = band.name;
            gradeMessage = band['marin:message'] || gradeMessage;
            break;
          }
        }
      }

      let reviewDetailsHtml = '';
      reviewDetails.forEach(({ index, item, userSet, isCorrect, sourceMaterialName, sourceSection }) => {
        let optsHtml = '';
        item.options.forEach(opt => {
          const optId = opt['@id'];
          const userSel = userSet.has(optId);
          const correctSel = item.correctResponse.has(optId);
          let statusLabel = '';
          let statusClass = '';
          if (correctSel && userSel) {
            statusClass = 'is-correct-selected';
            statusLabel = '✓ Your correct choice';
          } else if (correctSel) {
            statusClass = 'is-correct';
            statusLabel = '✓ Correct choice';
          } else if (userSel) {
            statusClass = 'is-incorrect';
            statusLabel = '✗ Your choice';
          }
          optsHtml += `
            <div class="review-option-row ${statusClass}">
              <span class="review-status-tag">${statusLabel}</span>
              <div class="review-option-content">${parseMarkdownToHtml(opt.text || opt.name || '', graphData)}</div>
            </div>
          `;
        });

        reviewDetailsHtml += `
          <div class="review-card ${isCorrect ? 'review-card--correct' : 'review-card--incorrect'}">
            <div class="review-card-header">
              <h4>Q${index}: ${escapeHtml(item.text)}</h4>
              <span class="app-badge ${isCorrect ? 'badge--success' : 'badge--error'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
            </div>
            <div class="review-options-grid">${optsHtml}</div>
            ${item.explanation ? `<div class="quiz-explanation"><strong>Explanation:</strong> ${parseMarkdownToHtml(item.explanation, graphData)}</div>` : ''}
            ${sourceSection ? `<div class="quiz-source-link"><strong>Source:</strong> ${sectionLink(sourceSection, setSlug)}</div>` : sourceMaterialName ? `<div class="quiz-source-link"><strong>Source:</strong> ${escapeHtml(sourceMaterialName)}</div>` : ''}
          </div>
        `;
      });

      // Sections to review: the Note sections behind the questions that were missed.
      const missed = new Map();
      reviewDetails.filter(detail => !detail.isCorrect && detail.sourceSection).forEach(detail => missed.set(detail.sourceSection.type, detail.sourceSection));
      const reviewSectionsHtml = missed.size ? `
            <section class="quiz-sections-to-review" aria-labelledby="sections-to-review-heading">
              <h3 id="sections-to-review-heading">Sections to review</h3>
              <ul>${[...missed.values()].map(section => `<li>${sectionLink(section, setSlug)}</li>`).join('')}</ul>
            </section>` : '';

      container.innerHTML = `
        ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: catalogEntry.name, route: { set: setSlug } }, { label: 'Quiz' }])}
        <div class="quiz-viewer-container" role="region" aria-label="Quiz results">
          <main class="quiz-main-card">
            <div class="quiz-results-hero ${passed ? 'passed' : 'failed'}">
              ${passed ? `<span class="quiz-results-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10"/><path d="m22 13-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17"/><path d="m11 2 .33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7"/><path d="M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z"/></svg></span>` : ''}
              <h2>${passed ? `You passed the ${escapeHtml(quizTitle)}!` : `You did not pass the ${escapeHtml(quizTitle)}.`}</h2>
              <p class="quiz-score-display"><span class="quiz-percentage-score">${escapeHtml(gradeName)} / ${percentage}%</span></p>
              <p class="quiz-grade-message">${escapeHtml(gradeMessage)}</p>
            </div>

            <div class="quiz-share">
              <div class="action-group" role="group" aria-label="Share"><button type="button" id="share-results" class="action-button" aria-label="Share results" title="Share"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/></svg></button></div>
              <p id="share-status" class="quiz-share-status" role="status" aria-live="polite"></p>
            </div>

            ${reviewSectionsHtml}

            <section class="quiz-review-section">
              <h3>Quiz review</h3>
              <div class="quiz-review-list">
                ${reviewDetailsHtml}
              </div>
            </section>

            <div class="quiz-results-actions">
              <div class="action-group" role="group" aria-label="After the quiz"><button type="button" id="restart-attempt" class="action-button" aria-label="Retake quiz" title="Retake quiz">${actionIcon('rotate-ccw')}</button>
              <button type="button" id="return-landing" class="action-button" aria-label="Return to course" title="Return to course">${actionIcon('corner-up-left')}</button></div>
            </div>

          </main>
        </div>
      `;

      wireBreadcrumb(container, onNavigate);
      wireSectionLinks(container, setSlug, onNavigate);
      document.getElementById('share-results').addEventListener('click', async () => {
        const courseUrl = new URL(window.location.href);
        courseUrl.search = new URLSearchParams({ set: setSlug }).toString();
        courseUrl.hash = '';
        // Plain text for chat and email. The party popper is the real emoji character (U+1F389),
        // because chat tools such as Teams do not turn pasted :shortcodes: into emoji.
        const text = [
          passed ? `I passed the ${quizTitle}! \u{1F389}` : `I did not pass the ${quizTitle}.`,
          `${gradeName} / ${percentage}%`,
          '',
          `Take the ${catalogEntry.name} course:`,
          courseUrl.toString()
        ].join('\n');
        const status = document.getElementById('share-status');
        status.textContent = (await copyText(text))
          ? 'Results copied.'
          : 'Could not copy. Select and copy the results by hand.';
      });
      document.getElementById('return-landing').addEventListener('click', () => {
        onNavigate({ set: setSlug, view: null, resource: null });
      });
      document.getElementById('restart-attempt').addEventListener('click', () => {
        renderQuizViewer(container, setSlug, resourceSlug, catalogItems, onNavigate);
      });
    }

    renderQuizView();

  } catch (err) {
    renderError(container, err.message || 'Failed to load assessment.', setSlug, onNavigate);
  }
}

// A real link to a section of the notes, so it works with open-in-new-tab. Ordinary
// clicks stay in the app (see wireSectionLinks).
function sectionLink(section, setSlug) {
  const query = new URLSearchParams({ set: setSlug, view: 'read', resource: section.note }).toString();
  return `<a href="?${escapeHtml(query)}#note-${escapeHtml(section.type)}" class="quiz-section-link" data-section-link data-section-type="${escapeHtml(section.type)}" data-note="${escapeHtml(section.note)}">${escapeHtml(section.name)}</a>`;
}

function wireSectionLinks(container, setSlug, onNavigate) {
  container.querySelectorAll('[data-section-link]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate({ set: setSlug, view: 'read', resource: link.dataset.note, hash: `note-${link.dataset.sectionType}` });
    });
  });
}

function setEquals(setA, setB) {
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

function renderError(container, message, setSlug, onNavigate) {
  container.innerHTML = `
    <div class="catalog-error-box">
      ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: 'Error' }])}
      <h3>Quiz error</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  wireBreadcrumb(container, onNavigate);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[tag] || tag));
}
