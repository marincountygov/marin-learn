#!/usr/bin/env python3
"""Automated regression test suite for Phase R3 (Full Quiz Authoring)."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import serve, submit_editor_dialog
from playwright.sync_api import sync_playwright

class TestQuizzesR3(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def eval_js(self, script: str):
        with serve() as base_url:
            context = self.browser.new_context()
            page = context.new_page()
            page.goto(f"{base_url}editor/", wait_until="networkidle")
            result = page.evaluate(script)
            context.close()
            return result

    def test_quiz_question_interaction_types_and_correctness(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createAssessment, createAssessmentItem, createResponseOption, addToAssessment, setSequence, ref, getObject } = await import('/js/core/model.js');
            const { validatePackage } = await import('/js/core/validate.js');

            const pkg = createEmptyPackage('Quiz Interaction Types');
            const quiz = createAssessment(pkg, 'Core Knowledge Check');

            // 1. Single-select question
            const qSingle = createAssessmentItem(pkg, 'single-select', 'What is the primary role of the App Shell?');
            addToAssessment(quiz, qSingle['@id'], 2);

            // 2. Multiple-select question
            const qMulti = createAssessmentItem(pkg, 'multiple-select', 'Select all valid MarinOS quality goals:');
            const opt1 = createResponseOption(pkg, 'Accessibility');
            const opt2 = createResponseOption(pkg, 'Security');
            const opt3 = createResponseOption(pkg, 'Flashy animations');
            setSequence(qMulti['marin:options'], [opt1['@id'], opt2['@id'], opt3['@id']]);
            qMulti['marin:correctResponse'] = [ref(opt1['@id']), ref(opt2['@id'])];
            addToAssessment(quiz, qMulti['@id'], 3);

            // 3. True-false question
            const qTf = createAssessmentItem(pkg, 'true-false', 'True or false: Quizzes should reference canonical content.');
            addToAssessment(quiz, qTf['@id'], 1);

            // Validation check
            const validation = validatePackage(pkg);

            return {
                singleType: qSingle['marin:interactionType'],
                multiType: qMulti['marin:interactionType'],
                tfType: qTf['marin:interactionType'],
                singleCorrectCount: qSingle['marin:correctResponse'].length,
                multiCorrectCount: qMulti['marin:correctResponse'].length,
                tfCorrectCount: qTf['marin:correctResponse'].length,
                valid: validation.errors.length === 0,
                errorCount: validation.errors.length,
                errors: validation.errors.map(e => e.message)
            };
        }""")

        self.assertEqual(result['singleType'], 'single-select')
        self.assertEqual(result['multiType'], 'multiple-select')
        self.assertEqual(result['tfType'], 'true-false')
        self.assertEqual(result['singleCorrectCount'], 1)
        self.assertEqual(result['multiCorrectCount'], 2)
        self.assertEqual(result['tfCorrectCount'], 1)
        self.assertTrue(result['valid'], f"Validation errors: {result['errors']}")

    def test_quiz_duplication_and_question_duplication(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createAssessment, createAssessmentItem, duplicateAssessment, duplicateAssessmentItem, addToAssessment, getObject } = await import('/js/core/model.js');

            const pkg = createEmptyPackage('Duplicate Quiz Fixture');
            const quiz = createAssessment(pkg, 'Original Quiz');
            const q = createAssessmentItem(pkg, 'single-select', 'Sample Question');
            addToAssessment(quiz, q['@id'], 1);

            // Duplicate question independently
            const qCopy = duplicateAssessmentItem(pkg, q['@id']);
            const distinctQIds = qCopy['@id'] !== q['@id'];
            const distinctOptions = qCopy['marin:options'].itemListElement[0].item['@id'] !== q['marin:options'].itemListElement[0].item['@id'];

            // Duplicate entire quiz
            const quizCopy = duplicateAssessment(pkg, quiz['@id']);
            const distinctQuizIds = quizCopy['@id'] !== quiz['@id'];

            return { distinctQIds, distinctOptions, distinctQuizIds };
        }""")

        self.assertTrue(result['distinctQIds'])
        self.assertTrue(result['distinctOptions'])
        self.assertTrue(result['distinctQuizIds'])

    def test_quiz_policies_configuration(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createAssessment, createAssessmentItem, addToAssessment } = await import('/js/core/model.js');
            const { validatePackage } = await import('/js/core/validate.js');

            const pkg = createEmptyPackage('Quiz Policies Fixture');
            const quiz = createAssessment(pkg, 'Configured Assessment');

            for (let i = 1; i <= 5; i++) {
                const item = createAssessmentItem(pkg, 'single-select', `Question ${i}`);
                addToAssessment(quiz, item['@id'], 1);
            }

            // Configure policies
            quiz['marin:selectionPolicy'] = { mode: 'random', count: 3, shuffle: true };
            quiz['marin:feedbackPolicy'] = {
                timing: 'after-item',
                showCorrectResponses: true,
                showOptionFeedback: true,
                showExplanation: true
            };
            quiz['marin:scoringPolicy'] = {
                method: 'weighted-sum',
                passingPercent: 80
            };

            const val = validatePackage(pkg);
            return {
                mode: quiz['marin:selectionPolicy'].mode,
                count: quiz['marin:selectionPolicy'].count,
                timing: quiz['marin:feedbackPolicy'].timing,
                passingPercent: quiz['marin:scoringPolicy'].passingPercent,
                valid: val.errors.length === 0,
                errorCount: val.errors.length
            };
        }""")

        self.assertEqual(result['mode'], 'random')
        self.assertEqual(result['count'], 3)
        self.assertEqual(result['timing'], 'after-item')
        self.assertEqual(result['passingPercent'], 80)
        self.assertTrue(result['valid'])

    def test_browser_quiz_authoring_and_preview_workflow(self):
        with serve() as base_url:
            context = self.browser.new_context(viewport={"width": 1280, "height": 900})
            problems = []
            context.on("page", lambda p: (
                p.on("pageerror", lambda err: problems.append(str(err))),
                p.on("console", lambda msg: problems.append(msg.text) if msg.type == "error" else None)
            ))
            page = context.new_page()
            page.goto(f"{base_url}editor/", wait_until="networkidle")

            # Create project
            page.locator("#btn-new-project").click()
            page.locator("#new-proj-title").fill("R3 Full Quiz Test")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")

            # Switch to Quizzes tab
            page.locator('[data-tab="quizzes"]').click()

            # Create first quiz
            page.locator("#btn-create-first-quiz").click()
            submit_editor_dialog(page, "Certification Quiz")
            page.get_by_role("heading", name="Certification Quiz").wait_for()

            # Add a question
            page.locator("#btn-add-question").click()
            page.locator(".editor-question-form").wait_for(state="visible")

            # Fill question details
            page.locator("#q-edit-text").fill("Which standard applies to MarinOS web interfaces?")
            page.locator(".editor-opt-text-input").first.fill("WCAG 2.2 AA")
            page.locator('.editor-opt-row input[type="radio"]').first.check()
            page.locator("#q-edit-explanation").fill("MarinOS mandates WCAG 2.2 AA compliance by default.")

            # Save question
            page.locator("#btn-save-question").click()
            page.get_by_text("Which standard applies to MarinOS web interfaces?").wait_for()

            # Open Quiz Settings modal
            page.locator("#btn-quiz-settings").click()
            page.locator(".editor-settings-modal-content").wait_for(state="visible")
            page.locator("#setting-quiz-pass").fill("85")
            page.locator("#btn-save-quiz-settings").click()

            # Open Quiz Preview modal
            page.locator("#btn-preview-quiz").click()
            page.locator(".editor-preview-modal").wait_for(state="visible")
            page.get_by_text("Preview of all questions in this quiz.").wait_for()
            page.locator(".btn-close-modal").click()

            # Run validation on export tab
            page.locator('[data-tab="export"]').click()
            page.locator("#btn-run-validation").click()
            self.assertEqual(page.locator("#validation-results .app-alert--danger").count(), 0)

            # Ensure zero CSP or browser errors occurred
            self.assertEqual(problems, [])
            context.close()

if __name__ == '__main__':
    unittest.main()
