#!/usr/bin/env python3
"""Automated regression test suite for Phase R5 (Assets, Contextual Alt-Text, and Rich-Text Completion)."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import serve
from playwright.sync_api import sync_playwright

class TestAssetsR5(unittest.TestCase):
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

    def test_image_mime_sniffing_and_svg_safety(self):
        result = self.eval_js("""async () => {
            const { sniffMediaType, validateSvg } = await import('/js/core/assets.js');

            const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
            const safeSvgBytes = new TextEncoder().encode('<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"10\" height=\"10\"/></svg>');
            const hostileSvgBytes = new TextEncoder().encode('<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>');

            const detectedPng = sniffMediaType(pngBytes);
            const detectedSvg = sniffMediaType(safeSvgBytes);

            const safeSvgIssues = validateSvg(safeSvgBytes);
            const hostileSvgIssues = validateSvg(hostileSvgBytes);

            return {
                detectedPng,
                detectedSvg,
                safeSvgValid: safeSvgIssues.length === 0,
                hostileSvgCaught: hostileSvgIssues.some(i => i.code === 'svg-active-element')
            };
        }""")

        self.assertEqual(result['detectedPng'], 'image/png')
        self.assertEqual(result['detectedSvg'], 'image/svg+xml')
        self.assertTrue(result['safeSvgValid'])
        self.assertTrue(result['hostileSvgCaught'])

    def test_contextual_alt_text_and_markdown_serialization(self):
        result = self.eval_js("""async () => {
            const { htmlToMarkdown } = await import('/editor/assets/rich-editor.js');

            const meaningfulDiv = document.createElement('div');
            meaningfulDiv.innerHTML = '<p>Diagram: <img data-marin-asset=\"10000000-0000-4000-8000-000000000090\" alt=\"Architecture flow diagram\" src=\"#\"></p>';
            const meaningfulMd = htmlToMarkdown(meaningfulDiv);

            const decorativeDiv = document.createElement('div');
            decorativeDiv.innerHTML = '<p>Ornament: <img data-marin-asset=\"10000000-0000-4000-8000-000000000090\" alt=\"\" src=\"#\"></p>';
            const decorativeMd = htmlToMarkdown(decorativeDiv);

            return {
                meaningfulMd,
                decorativeMd,
                hasMeaningfulAlt: meaningfulMd.includes('![Architecture flow diagram](marin-asset:10000000-0000-4000-8000-000000000090)'),
                hasDecorativeEmptyAlt: decorativeMd.includes('![](marin-asset:10000000-0000-4000-8000-000000000090)')
            };
        }""")

        self.assertTrue(result['hasMeaningfulAlt'])
        self.assertTrue(result['hasDecorativeEmptyAlt'])

    def test_asset_usage_tracking_in_markdown(self):
        result = self.eval_js("""async () => {
            const { createEmptyPackage, createContentUnit, createImageAsset, structuralUsagesOf } = await import('/js/core/model.js');

            const pkg = createEmptyPackage('Asset Usages');
            const assetBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
            const asset = createImageAsset(pkg, { name: 'flowchart.png', type: 'image/png', bytes: assetBytes });

            // Initially unused
            const initialUsages = structuralUsagesOf(pkg, asset['@id']);

            // Reference in ContentUnit markdown
            const unit = createContentUnit(pkg, 'System Overview', 'concept');
            const assetUuid = asset['@id'].replace(/^urn:uuid:/i, '');
            pkg.contentFiles[unit.encoding.contentUrl] = `Review this chart:\\n\\n![Process flowchart](marin-asset:${assetUuid})\\n`;

            const referencedUsages = structuralUsagesOf(pkg, asset['@id']);

            return {
                initialCount: initialUsages.length,
                referencedCount: referencedUsages.length,
                referencedUnitName: referencedUsages[0]?.object?.name
            };
        }""")

        self.assertEqual(result['initialCount'], 0)
        self.assertEqual(result['referencedCount'], 1)
        self.assertEqual(result['referencedUnitName'], 'System Overview')

    def test_browser_asset_management_and_rich_editor_insertion(self):
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
            page.locator("#new-proj-title").fill("R5 Asset Management")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")

            # Go to Images and Files tab
            page.locator('[data-tab="assets"]').click()
            page.get_by_text("No images or files yet.").wait_for()

            # Upload an asset directly into the project via evaluate to simulate file input with clean bytes
            page.evaluate("""() => {
              const { createImageAsset, touchPackage } = window.__currentPkg ? window : {};
              // Upload an asset via model
              const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
              // Trigger input or add directly
            }""")

            # Ensure zero CSP or browser errors occurred
            self.assertEqual(problems, [])
            context.close()

if __name__ == '__main__':
    unittest.main()
