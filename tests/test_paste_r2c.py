#!/usr/bin/env python3
"""Automated test suite for Phase R2c (Learning Objectives, Advanced Settings, and Office Paste Fixtures)."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import serve, submit_editor_dialog
from playwright.sync_api import sync_playwright

class TestR2c(unittest.TestCase):
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

    def test_objectives_creation_hierarchy_and_cycles(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createObjective, canSetObjectiveParent, getObjectiveUsages, createContentUnit, ref } = await import('/js/core/model.js');
            const { validatePackage } = await import('/js/core/validate.js');

            const pkg = createEmptyPackage('Objectives Fixture');
            const objA = createObjective(pkg, 'Goal A');
            const objB = createObjective(pkg, 'Goal B', objA['@id']); // B child of A
            const objC = createObjective(pkg, 'Goal C', objB['@id']); // C child of B

            // Hierarchy verification
            const parentOfB = objB['marin:parentObjective']?.['@id'] === objA['@id'];
            const parentOfC = objC['marin:parentObjective']?.['@id'] === objB['@id'];

            // Cycle checks
            const canMakeAChildOfC = canSetObjectiveParent(pkg, objA['@id'], objC['@id']); // A -> C -> B -> A cycle
            const canMakeAChildOfSelf = canSetObjectiveParent(pkg, objA['@id'], objA['@id']);
            const canMakeIndependentChild = canSetObjectiveParent(pkg, objB['@id'], null);

            // Associate with content unit
            const unit = createContentUnit(pkg, 'Teaches Goal C', 'concept');
            pkg.contentFiles[unit.encoding.contentUrl] = 'Goal C content body';
            unit.teaches = [ref(objC['@id'])];
            const usages = getObjectiveUsages(pkg, objC['@id']);

            const val = validatePackage(pkg);
            const valid = val.errors.length === 0;

            return {
                parentOfB, parentOfC, canMakeAChildOfC, canMakeAChildOfSelf, canMakeIndependentChild,
                taughtCount: usages.taughtBy.length,
                valid, errors: val.errors.map(e => e.message)
            };
        }""")

        self.assertTrue(result['parentOfB'])
        self.assertTrue(result['parentOfC'])
        self.assertFalse(result['canMakeAChildOfC'], "Cycle detection must block A -> C -> B -> A")
        self.assertFalse(result['canMakeAChildOfSelf'], "Cycle detection must block self-parenting")
        self.assertTrue(result['canMakeIndependentChild'])
        self.assertEqual(result['taughtCount'], 1)
        self.assertTrue(result['valid'], f"Validation errors: {result['errors']}")

    def test_word_html_paste_normalization(self):
        result = self.eval_js("""async () => {
            const { htmlToMarkdown } = await import('/editor/assets/rich-editor.js');
            const wordHtml = `
              <p class="MsoNormal" style="margin-bottom:0in;line-height:normal;font-size:11pt;font-family:Calibri,sans-serif;color:#000000">
                Welcome to <b>County of Marin</b> operational policy.
              </p>
              <h2 style="font-size:14pt;font-family:Calibri;color:#1F497D">Key Procedures</h2>
              <ul style="margin-top:0in" type="disc">
                <li class="MsoListParagraph" style="margin-left:0in;mso-list:l0 level1 lfo1">Step 1: Check requirements</li>
                <li class="MsoListParagraph" style="margin-left:0in;mso-list:l0 level1 lfo1">Step 2: Submit documentation</li>
              </ul>
              <table class="MsoTableGrid" border="1" cellspacing="0" cellpadding="0" style="border-collapse:collapse">
                <tr><td width="200"><p class="MsoNormal">Role</p></td><td width="200"><p class="MsoNormal">Duty</p></td></tr>
                <tr><td width="200"><p class="MsoNormal">Director</p></td><td width="200"><p class="MsoNormal">Approval</p></td></tr>
              </table>
            `;

            const doc = new DOMParser().parseFromString(wordHtml, 'text/html');
            const markdown = htmlToMarkdown(doc.body);

            return {
                markdown,
                hasBold: markdown.includes('**County of Marin**'),
                hasHeading: markdown.includes('## Key Procedures'),
                hasList: markdown.includes('- Step 1: Check requirements'),
                hasTable: markdown.includes('| Role | Duty |'),
                noMso: !markdown.includes('Mso') && !markdown.includes('Calibri')
            };
        }""")

        self.assertTrue(result['hasBold'], "Word bold must be converted to **bold**")
        self.assertTrue(result['hasHeading'], "Word H2 must be converted to ## Heading")
        self.assertTrue(result['hasList'], "Word list must be converted to - bullet list")
        self.assertTrue(result['hasTable'], "Word table must be converted to GFM pipe table")
        self.assertTrue(result['noMso'], "Mso classes and font families must be stripped")

    def test_google_docs_html_paste_normalization(self):
        result = self.eval_js("""async () => {
            const { htmlToMarkdown } = await import('/editor/assets/rich-editor.js');
            const docsHtml = `
              <b style="font-weight:normal;" id="docs-internal-guid-12345678-abcd">
                <p style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;">
                  <span style="font-size:11pt;font-family:Arial;color:#000000;font-weight:700;">Google Docs Heading Concept</span>
                </p>
                <ol style="margin-top:0;margin-bottom:0;padding-inline-start:48px;">
                  <li style="font-size:11pt;font-family:Arial;color:#000000;"><span style="font-size:11pt;">First milestone</span></li>
                  <li style="font-size:11pt;font-family:Arial;color:#000000;"><span style="font-size:11pt;">Second milestone</span></li>
                </ol>
                <p style="line-height:1.38;"><a href="https://example.gov/resource">Resource Link</a></p>
              </b>
            `;

            const doc = new DOMParser().parseFromString(docsHtml, 'text/html');
            const markdown = htmlToMarkdown(doc.body);

            return {
                markdown,
                hasTitle: markdown.includes('Google Docs Heading Concept'),
                hasNumberedList: markdown.includes('1. First milestone'),
                hasLink: markdown.includes('[Resource Link](https://example.gov/resource)'),
                noGoogleSpans: !markdown.includes('docs-internal-guid') && !markdown.includes('font-family')
            };
        }""")

        self.assertTrue(result['hasTitle'])
        self.assertTrue(result['hasNumberedList'])
        self.assertTrue(result['hasLink'])
        self.assertTrue(result['noGoogleSpans'])

    def test_untrusted_web_html_sanitization(self):
        result = self.eval_js("""async () => {
            const { htmlToMarkdown } = await import('/editor/assets/rich-editor.js');
            const hostileHtml = `
              <p>Safe introductory paragraph.</p>
              <script>alert("xss")</script>
              <div onclick="evil()">Clickable div</div>
              <iframe src="https://evil.com"></iframe>
              <p style="background: red; color: blue;">Styled paragraph text.</p>
              <a href="javascript:alert(1)">Malicious link</a>
            `;

            const doc = new DOMParser().parseFromString(hostileHtml, 'text/html');
            const markdown = htmlToMarkdown(doc.body);

            return {
                markdown,
                hasSafeText: markdown.includes('Safe introductory paragraph.'),
                hasStyledText: markdown.includes('Styled paragraph text.'),
                noScript: !markdown.includes('alert') && !markdown.includes('<script>'),
                noOnClick: !markdown.includes('onclick') && !markdown.includes('evil'),
                noIframe: !markdown.includes('iframe'),
                noJavascriptUrl: !markdown.includes('javascript:')
            };
        }""")

        self.assertTrue(result['hasSafeText'])
        self.assertTrue(result['hasStyledText'])
        self.assertTrue(result['noScript'])
        self.assertTrue(result['noOnClick'])
        self.assertTrue(result['noIframe'])
        self.assertTrue(result['noJavascriptUrl'])

    def test_browser_objectives_and_material_settings_workflow(self):
        with serve() as base_url:
            context = self.browser.new_context(viewport={"width": 1280, "height": 900})
            problems = []
            context.on("page", lambda p: (
                p.on("pageerror", lambda err: problems.append(str(err))),
                p.on("console", lambda msg: problems.append(msg.text) if msg.type == "error" else None)
            ))
            page = context.new_page()
            page.on("pageerror", lambda err: print("PAGE ERROR:", err))
            page.on("console", lambda msg: print(f"CONSOLE [{msg.type}]: {msg.text}"))
            page.goto(f"{base_url}editor/", wait_until="networkidle")

            # Create project
            btn = page.locator("#btn-new-project")
            btn.wait_for(state="visible")
            btn.click()
            page.locator("#create-form-container").wait_for(state="visible")
            page.locator("#new-proj-title").fill("R2c Goals & Settings")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")

            # Manage objectives from overview
            page.locator("#btn-manage-objectives-overview").click()
            page.locator(".editor-obj-modal-content").wait_for(state="visible")

            page.locator("#btn-add-new-objective").click()
            submit_editor_dialog(page, "Understand MarinOS Security")
            page.get_by_role("heading", name="Understand MarinOS Security").wait_for()

            page.locator(".btn-close-modal").click()

            # Go to materials tab
            page.locator('[data-tab="materials"]').click()
            page.locator("#btn-create-first-material").click()
            submit_editor_dialog(page, "Security Overview")
            page.get_by_role("heading", name="Security Overview").wait_for()

            # Open Material settings
            page.locator(".editor-action-menu--material > summary").click()
            page.locator("#btn-material-settings").click()
            page.locator(".editor-settings-modal-content").wait_for(state="visible")

            # Check objective
            page.locator('input[name="associated-objective"]').first.check()
            page.locator("#setting-mat-duration").fill("PT20M")
            page.locator("#btn-save-mat-settings").click()

            # Ensure zero CSP or browser errors occurred
            self.assertEqual(problems, [])
            context.close()

if __name__ == '__main__':
    unittest.main()
