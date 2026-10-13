#!/usr/bin/env python3
"""Automated regression test suite for Phase R6 (Guided Repair and Validation Navigation)."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import serve, submit_editor_dialog
from playwright.sync_api import sync_playwright

class TestValidationR6(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(headless=True)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def test_browser_guided_repair_workflow(self):
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
            page.locator("#new-proj-title").fill("Guided Repair Test")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")

            # Create a material with content unit that will trigger warnings (no objective, no duration)
            page.locator('[data-tab="materials"]').click()
            page.locator("#btn-create-first-material").click()
            submit_editor_dialog(page, "Operational Procedures")
            page.get_by_role("heading", name="Operational Procedures").wait_for()

            page.locator(".editor-action-menu--root-add > summary").click()
            page.locator("#btn-add-content-unit").click()
            submit_editor_dialog(page, "Procedure Checklist")
            page.locator(".editor-rich-surface").wait_for(state="visible")
            page.locator("#btn-save-unit").click()
            page.locator(".editor-content-block").first.wait_for()

            # Go to Review and Download tab and run validation
            page.locator('[data-tab="export"]').click()
            page.locator("#btn-run-validation").click()
            page.locator(".editor-diagnostic-item").first.wait_for()

            # Verify diagnostic grouping and fix buttons
            self.assertGreaterEqual(page.locator(".btn-fix-diagnostic").count(), 1)

            # Click Fix on first diagnostic (navigates to materials tab or objectives)
            fix_btn = page.locator(".btn-fix-diagnostic").first
            fix_btn.click()

            # Verify navigation occurred to active tab
            self.assertTrue(page.locator("#tab-materials").is_visible() or page.locator(".editor-preview-modal").is_visible())

            # Ensure zero CSP or browser errors occurred
            self.assertEqual(problems, [])
            context.close()

if __name__ == '__main__':
    unittest.main()
