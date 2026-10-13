// Marin Learn - Quiz Viewer and Assessment Engine (Phase 7)
import { loadLearningSetGraph, hasType } from '../core/graph.js';
import { parseMarkdownToHtml } from '../core/markdown.js';

export async function renderQuizViewer(container, setSlug, resourceSlug, catalogItems, onNavigate) {
  container.innerHTML = '<div class="catalog-status" aria-live="polite">Loading assessment...</div>';

  const catalogEntry = catalogItems.find(item => item.identifier === setSlug);
  if (!catalogEntry) {
    renderError(container, 'Learning set not found.', setSlug, onNavigate);
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
      renderError(container, 'No assessment found in this learning set.', setSlug, onNavigate);
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
        <div class="quiz-viewer-container" role="region" aria-label="Assessment Quiz">
          <header class="quiz-top-bar">
            <button id="back-to-landing" class="link-button">&larr; Learning Set Landing</button>
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
                <button id="prev-q" class="secondary outline" ${currentIndex === 0 ? 'disabled' : ''}>&larr; Previous</button>
                ${currentIndex < attemptItems.length - 1 ? `
                  <button id="next-q" class="primary" ${!hasAnswer ? 'disabled' : ''}>Next &rarr;</button>
                ` : `
                  <button id="submit-quiz" class="primary" ${!hasAnswer ? 'disabled' : ''}>Finish Quiz</button>
                `}
              </div>
            </div>
          </main>
        </div>
      `;

      // Bind events
      document.getElementById('back-to-landing').addEventListener('click', () => {
        onNavigate({ set: setSlug, view: null, resource: null });
      });

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
        if (item.isBasedOn && item.isBasedOn.length > 0) {
          const srcObj = graphData.byId.get(item.isBasedOn[0]['@id']);
          if (srcObj) sourceMaterialName = srcObj.name;
        }

        reviewDetails.push({
          index: idx + 1,
          item,
          userSet,
          isCorrect,
          sourceMaterialName
        });
      });

      const percentage = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
      const scoringPolicy = assessment['marin:scoringPolicy'] || {};
      const passingPercent = scoringPolicy.passingPercent !== undefined ? scoringPolicy.passingPercent : 70;
      const passed = percentage >= passingPercent;

      // Grade scale band resolution
      let gradeName = passed ? 'Pass' : 'Needs Review';
      let gradeMessage = passed ? 'You successfully passed this assessment.' : 'Review the learning materials and try again.';
      
      const gradeScaleRef = scoringPolicy.gradeScale && scoringPolicy.gradeScale['@id'];
      const gradeScaleObj = gradeScaleRef ? graphData.byId.get(gradeScaleRef) : graphData.gradeScales[0];
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
      reviewDetails.forEach(({ index, item, userSet, isCorrect, sourceMaterialName }) => {
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
            ${sourceMaterialName ? `<div class="quiz-source-link"><strong>Source:</strong> ${escapeHtml(sourceMaterialName)}</div>` : ''}
          </div>
        `;
      });

      container.innerHTML = `
        <div class="quiz-viewer-container" role="region" aria-label="Assessment Results">
          <header class="quiz-top-bar">
            <button id="back-to-landing" class="link-button">&larr; Learning Set Landing</button>
            <div class="quiz-title-info">
              <span class="quiz-name">${escapeHtml(assessment.name)}</span>
              <span class="quiz-counter">Assessment Results</span>
            </div>
          </header>

          <main class="quiz-main-card">
            <div class="quiz-results-hero ${passed ? 'passed' : 'failed'}">
              <h2>${passed ? 'Assessment Passed' : 'Assessment Not Passed'}</h2>
              <div class="quiz-score-display">
                <span class="quiz-grade-badge">Grade: ${escapeHtml(gradeName)}</span>
                <span class="quiz-percentage-score">${percentage}%</span>
              </div>
              <p class="quiz-score-meta">You earned ${earnedPoints} out of ${totalPoints} possible points (Passing threshold: ${passingPercent}%)</p>
              <p class="quiz-grade-message">${escapeHtml(gradeMessage)}</p>
            </div>

            <section class="quiz-review-section">
              <h3>Question Review</h3>
              <div class="quiz-review-list">
                ${reviewDetailsHtml}
              </div>
            </section>

            <div class="quiz-results-actions">
              <button id="restart-attempt" class="primary">Retake Assessment (New Attempt)</button>
              <button id="return-landing" class="secondary outline">Return to Learning Set</button>
            </div>
          </main>
        </div>
      `;

      document.getElementById('back-to-landing').addEventListener('click', () => {
        onNavigate({ set: setSlug, view: null, resource: null });
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
      <h3>Quiz Viewer Error</h3>
      <p>${escapeHtml(message)}</p>
      <button id="back-to-set" class="primary">Back to Learning Set</button>
    </div>
  `;
  document.getElementById('back-to-set').addEventListener('click', () => {
    onNavigate({ set: setSlug, view: null, resource: null });
  });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[tag] || tag));
}
