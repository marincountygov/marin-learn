#!/usr/bin/env python3
"""Automated regression test suite for Phase R4 (Full Slide Deck Authoring)."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import serve, submit_editor_dialog
from playwright.sync_api import sync_playwright

class TestSlidesR4(unittest.TestCase):
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

    def test_slide_layouts_display_modes_and_abstract_validation(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createPresentation, createSlide, addSlideToPresentation, addContentToSlide, createContentUnit } = await import('/js/core/model.js');
            const { validatePackage } = await import('/js/core/validate.js');

            const pkg = createEmptyPackage('Slide Layouts Fixture');
            const deck = createPresentation(pkg, 'Overview Deck');

            // Unit with abstract
            const unitWithAbstract = createContentUnit(pkg, 'Unit With Summary', 'concept');
            unitWithAbstract.abstract = 'Concise concept summary.';
            pkg.contentFiles[unitWithAbstract.encoding.contentUrl] = 'Full body content.';

            // Unit without abstract
            const unitNoAbstract = createContentUnit(pkg, 'Unit Without Summary', 'topic');
            delete unitNoAbstract.abstract;
            pkg.contentFiles[unitNoAbstract.encoding.contentUrl] = 'Body content only.';

            // Create 6 slides with different layouts
            const sTitle = createSlide(pkg, 'Title Slide', 'title');
            const sSec = createSlide(pkg, 'Section Divider', 'section');
            const sContent = createSlide(pkg, 'Content Slide', 'content');
            const sSplit = createSlide(pkg, 'Split Slide', 'split');
            const sMedia = createSlide(pkg, 'Media Slide', 'media');
            const sQuote = createSlide(pkg, 'Quote Slide', 'quote');

            // Reference content with different display modes
            addContentToSlide(sContent, unitWithAbstract['@id'], 'abstract'); // Valid
            addContentToSlide(sSplit, unitWithAbstract['@id'], 'full'); // Valid
            addContentToSlide(sMedia, unitNoAbstract['@id'], 'title'); // Valid

            addSlideToPresentation(deck, sTitle['@id']);
            addSlideToPresentation(deck, sSec['@id']);
            addSlideToPresentation(deck, sContent['@id']);
            addSlideToPresentation(deck, sSplit['@id']);
            addSlideToPresentation(deck, sMedia['@id']);
            addSlideToPresentation(deck, sQuote['@id']);

            // Initial validation: should be valid
            const val1 = validatePackage(pkg);
            const validInitially = val1.errors.length === 0;

            // Now test rule: if displayMode is abstract on unit without abstract -> MUST fail
            addContentToSlide(sQuote, unitNoAbstract['@id'], 'abstract');
            const val2 = validatePackage(pkg);
            const abstractErrors = val2.errors.filter(e => e.code === 'slide-missing-abstract');

            return {
                validInitially,
                initErrors: val1.errors.map(e => e.message),
                hasAbstractError: abstractErrors.length === 1,
                errorMessage: abstractErrors[0]?.message
            };
        }""")

        self.assertTrue(result['validInitially'])
        self.assertTrue(result['hasAbstractError'])
        self.assertIn("has no abstract", result['errorMessage'])

    def test_slide_deck_and_slide_duplication(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createPresentation, createSlide, addSlideToPresentation, duplicatePresentation, duplicateSlide, getObject } = await import('/js/core/model.js');

            const pkg = createEmptyPackage('Duplicate Decks Fixture');
            const deck = createPresentation(pkg, 'Master Presentation');
            const slide = createSlide(pkg, 'Key Takeaways', 'content');
            slide['marin:speakerNotes'] = 'Remember to highlight governance.';
            addSlideToPresentation(deck, slide['@id']);

            // Duplicate slide
            const slideCopy = duplicateSlide(pkg, slide['@id']);
            const distinctSlideIds = slideCopy['@id'] !== slide['@id'];
            const notesCopied = slideCopy['marin:speakerNotes'] === 'Remember to highlight governance.';

            // Duplicate presentation
            const deckCopy = duplicatePresentation(pkg, deck['@id']);
            const distinctDeckIds = deckCopy['@id'] !== deck['@id'];

            return { distinctSlideIds, notesCopied, distinctDeckIds };
        }""")

        self.assertTrue(result['distinctSlideIds'])
        self.assertTrue(result['notesCopied'])
        self.assertTrue(result['distinctDeckIds'])

    def test_browser_slide_deck_authoring_and_preview_workflow(self):
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
            page.locator("#new-proj-title").fill("R4 Slide Deck Test")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")

            # Switch to Slide Decks tab
            page.locator('[data-tab="slides"]').click()

            # Create first slide deck
            page.locator("#btn-create-first-deck").click()
            submit_editor_dialog(page, "Executive Presentation")
            page.get_by_role("heading", name="Executive Presentation").wait_for()

            # Add a slide
            page.locator("#btn-add-slide").click()
            page.locator(".editor-question-form").wait_for(state="visible")

            # Fill slide details
            page.locator("#s-edit-title").fill("1. Welcome & Purpose")
            page.locator("#s-edit-layout").select_option("title")
            page.locator("#s-edit-notes").fill("Introduce the session objectives and agenda.")

            # Save slide
            page.locator("#btn-save-slide").click()
            page.get_by_text("Slide 1: 1. Welcome & Purpose").wait_for()

            # Open Deck Settings modal
            page.locator("#btn-deck-settings").click()
            page.locator(".editor-settings-modal-content").wait_for(state="visible")
            page.locator("#setting-deck-abstract").fill("High-level presentation for county leadership.")
            page.locator("#btn-save-deck-settings").click()

            # Open Presentation 16:9 Preview modal
            page.locator("#btn-preview-deck").click()
            page.locator(".editor-preview-modal").wait_for(state="visible")
            page.get_by_role("heading", name="1. Welcome & Purpose", exact=True).wait_for()
            page.get_by_role("heading", name="Presenter Notes").wait_for()
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
