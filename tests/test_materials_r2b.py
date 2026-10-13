#!/usr/bin/env python3
"""Automated regression test suite for Phase R2b (Content Reuse, Duplication, and Deletion)."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import serve, submit_editor_dialog
from playwright.sync_api import sync_playwright

class TestMaterialsR2b(unittest.TestCase):
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

    def test_duplicate_content_unit_creates_independent_copy(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createContentUnit, duplicateContentUnit, getObject } = await import('/js/core/model.js');
            const pkg = createEmptyPackage('Duplicate Fixture');
            const unit = createContentUnit(pkg, 'Original Topic', 'concept');
            pkg.contentFiles[unit.encoding.contentUrl] = '# Original prose\\n\\nImportant details.';

            // Duplicate unit
            const copy = duplicateContentUnit(pkg, unit['@id']);

            const hasOriginal = !!getObject(pkg, unit['@id']);
            const hasCopy = !!getObject(pkg, copy['@id']);
            const copyPath = copy.encoding.contentUrl;
            const originalPath = unit.encoding.contentUrl;

            // Paths and IDs must be distinct
            const distinctIds = copy['@id'] !== unit['@id'];
            const distinctPaths = copyPath !== originalPath;
            const markdownCopied = pkg.contentFiles[copyPath] === pkg.contentFiles[originalPath];

            // Mutating copy markdown must not mutate original markdown
            pkg.contentFiles[copyPath] = '# Edited copy prose';
            const originalPreserved = pkg.contentFiles[originalPath] === '# Original prose\\n\\nImportant details.';

            return {
                hasOriginal, hasCopy, distinctIds, distinctPaths,
                markdownCopied, originalPreserved
            };
        }""")

        self.assertTrue(result['hasOriginal'])
        self.assertTrue(result['hasCopy'])
        self.assertTrue(result['distinctIds'])
        self.assertTrue(result['distinctPaths'])
        self.assertTrue(result['markdownCopied'])
        self.assertTrue(result['originalPreserved'])

    def test_structural_usages_tracking(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createMaterial, createSection, createContentUnit, appendSequenceItem, structuralUsagesOf } = await import('/js/core/model.js');
            const pkg = createEmptyPackage('Usages Fixture');
            const mat1 = createMaterial(pkg, 'Material 1');
            const mat2 = createMaterial(pkg, 'Material 2');
            const sec = createSection(pkg, 'Section 1');
            const unit = createContentUnit(pkg, 'Shared Topic', 'topic');

            // Initially unused in sequences
            const initialUsages = structuralUsagesOf(pkg, unit['@id']);

            // Add to Material 1 and Section in Material 2
            appendSequenceItem(mat1['marin:contentSequence'], unit['@id']);
            appendSequenceItem(mat2['marin:contentSequence'], sec['@id']);
            appendSequenceItem(sec['marin:contentSequence'], unit['@id']);

            const sharedUsages = structuralUsagesOf(pkg, unit['@id']);
            const usageNames = sharedUsages.map(u => u.object.name);

            return {
                initialCount: initialUsages.length,
                sharedCount: sharedUsages.length,
                usageNames
            };
        }""")

        self.assertEqual(result['initialCount'], 0)
        self.assertEqual(result['sharedCount'], 2)
        self.assertIn('Material 1', result['usageNames'])
        self.assertIn('Section 1', result['usageNames'])

    def test_safe_content_deletion_and_cleanup(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createMaterial, createContentUnit, appendSequenceItem, removeGraphObject, getObject } = await import('/js/core/model.js');
            const { validatePackage } = await import('/js/core/validate.js');

            const pkg = createEmptyPackage('Deletion Fixture');
            const mat = createMaterial(pkg, 'Material');
            const unit1 = createContentUnit(pkg, 'Topic to Delete', 'topic');
            const unit2 = createContentUnit(pkg, 'Retained Topic', 'topic');
            const contentPath1 = unit1.encoding.contentUrl;
            pkg.contentFiles[contentPath1] = 'Some content';
            pkg.contentFiles[unit2.encoding.contentUrl] = 'Other content';
            appendSequenceItem(mat['marin:contentSequence'], unit1['@id']);
            appendSequenceItem(mat['marin:contentSequence'], unit2['@id']);

            // Delete object 1
            removeGraphObject(pkg, unit1['@id']);

            const objectDeleted = !getObject(pkg, unit1['@id']);
            const fileDeleted = !(contentPath1 in pkg.contentFiles);
            const sequenceCleaned = mat['marin:contentSequence'].itemListElement.length === 1;
            const remainingId = mat['marin:contentSequence'].itemListElement[0].item['@id'];

            const validation = validatePackage(pkg);
            const valid = validation.errors.length === 0;

            return {
                objectDeleted, fileDeleted, sequenceCleaned,
                remainingId: remainingId === unit2['@id'],
                valid, errorCount: validation.errors.length,
                errors: validation.errors.map(e => e.message)
            };
        }""")

        self.assertTrue(result['objectDeleted'])
        self.assertTrue(result['fileDeleted'])
        self.assertTrue(result['sequenceCleaned'])
        self.assertTrue(result['remainingId'])
        self.assertTrue(result['valid'])

    def test_browser_reuse_picker_and_duplication_workflow(self):
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
            page.locator("#new-proj-title").fill("R2b Browser Test")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")
            page.locator('[data-tab="materials"]').click()

            # Create Material 1
            page.locator("#btn-create-first-material").click()
            submit_editor_dialog(page, "Material Alpha")
            page.get_by_role("heading", name="Material Alpha").wait_for()

            # Add Content 1
            page.locator(".editor-action-menu--root-add > summary").click()
            page.locator("#btn-add-content-unit").click()
            submit_editor_dialog(page, "Original Core Concept")
            page.locator(".editor-rich-surface").wait_for(state="visible")
            page.locator("#btn-save-unit").click()
            page.locator(".editor-content-block").wait_for()

            # Duplicate Content 1 from document controls
            page.locator('.editor-content-block .editor-action-menu > summary').click()
            page.locator('button[data-action="duplicate-unit"]').click()
            page.get_by_role("heading", name="Original Core Concept (Copy)").wait_for()

            # Create Material 2
            page.locator("#btn-create-material-side").click()
            submit_editor_dialog(page, "Material Beta")
            page.get_by_role("heading", name="Material Beta").wait_for()

            # Open Reuse Picker on Material Beta
            page.locator(".editor-action-menu--root-add > summary").click()
            page.locator("#btn-reuse-content-root").click()
            page.locator(".editor-reuse-modal-content").wait_for(state="visible")

            # Filter search
            page.locator("#reuse-search-input").fill("Original")
            page.locator(".editor-reuse-card").first.wait_for()

            # Reuse by reference
            page.locator(".btn-action-reuse-ref").first.click()
            page.get_by_text("Original Core Concept").first.wait_for()

            # Open Content Library
            page.locator("#btn-open-content-library").click()
            page.locator(".editor-library-modal-content").wait_for(state="visible")
            self.assertGreaterEqual(page.locator(".editor-library-card").count(), 2)

            page.locator(".btn-close-modal").click()

            # Ensure zero CSP or browser errors occurred
            self.assertEqual(problems, [])
            context.close()

if __name__ == '__main__':
    unittest.main()
