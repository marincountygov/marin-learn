#!/usr/bin/env python3
"""Exercise the course page's Notes, Slides, and Quiz cards in light/dark modes.

Uses the actual published learning-set graph, viewer module, and bundled theme.
The offline fixture does not replace the normal end-to-end HTTP browser tests.
"""
from __future__ import annotations

import argparse
import base64
import json
from pathlib import Path
import shutil
import sys

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests"))
from browser_smoke import inline_module  # noqa: E402


def run(screenshots: Path | None = None) -> None:
    manifest = json.loads((ROOT / "vendor/marinos/manifest.json").read_text(encoding="utf-8"))
    shell_css = (ROOT / "vendor/marinos/marinos.css").read_text(encoding="utf-8")
    for relative in manifest["fontPathContract"]:
        font = (ROOT / "vendor/marinos" / relative).read_bytes()
        mime = "font/woff2" if relative.endswith(".woff2") else "font/ttf"
        shell_css = shell_css.replace(relative, f"data:{mime};base64,{base64.b64encode(font).decode('ascii')}")
    css = shell_css + "\n" + (ROOT / "assets/app.css").read_text(encoding="utf-8")
    graph = json.loads((ROOT / "learning/county-leaders-guide-to-data/learning.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))["items"]
    resource_types = {'Note', 'Presentation', 'Assessment'}
    count = 0
    for obj in graph['@graph']:
        types = obj.get('@type') or []
        if isinstance(types, str):
            types = [types]
        if any(value.rsplit(':', 1)[-1] in resource_types for value in types):
            count += 1
    if screenshots:
        screenshots.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        executable = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            for width, theme in ((1440, "light"), (1440, "dark"), (390, "light"), (390, "dark")):
                context = browser.new_context(viewport={"width": width, "height": 900}, color_scheme=theme)
                page = context.new_page()
                errors: list[str] = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                # App Shell provides page width/padding through .container.
                page.set_content(f'<html data-theme="{theme}"><head><style>{css}</style></head>'
                                 '<body><main class="container" id="view"></main></body></html>')
                page.evaluate("""async ([moduleUrl, learningGraph, catalogEntries]) => {
                    window.__navigation = [];
                    window.fetch = async () => new Response(JSON.stringify(learningGraph), {
                        status: 200, headers: {'Content-Type': 'application/json'}
                    });
                    const { renderLandingPage } = await import(moduleUrl);
                    await renderLandingPage(document.getElementById('view'),
                        'county-leaders-guide-to-data', catalogEntries,
                        route => window.__navigation.push(route));
                }""", [inline_module(ROOT / 'js/viewer/landing.js'), graph, catalog])

                cards = page.locator('.landing-resource-card')
                assert cards.count() == count, f'Expected {count} resource cards, found {cards.count()}'
                assert page.locator('.landing-resource-grid.catalog-grid > article.app-card').count() == count
                assert page.locator('.landing-section, .resource-list').count() == 0
                assert page.locator('#landing-resources-heading').count() == 0, 'Resource heading should be gone'
                assert page.locator('header.landing-header > h2').inner_text() == 'Data 101'
                assert page.locator('.viewer-breadcrumb a').all_text_contents() == ['Catalog']
                assert page.locator('.viewer-breadcrumb [aria-current="page"]').inner_text() == 'Data 101'
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'overflow at {width}px'

                links = page.locator('.landing-resource-card h3 > a.resource-action')
                assert links.count() == count
                assert all(link.get_attribute('href').startswith('?set=county-leaders-guide-to-data&view=')
                           for link in links.all())
                assert all(link.get_attribute('aria-label') for link in links.all())
                assert page.locator('.landing-resource-card .app-badge').count() == 0, 'Cards must not show type badges'
                assert page.locator('.landing-resource-card h3').all_text_contents() == ['Notes', 'Slides', 'Quiz']
                assert page.locator('.landing-resource-card .app-card__icon svg').count() == count
                assert links.all_text_contents() == ['Notes', 'Slides', 'Quiz']
                if screenshots:
                    page.screenshot(path=str(screenshots / f'landing-{theme}-{width}.png'), full_page=True)
                links.first.click()
                assert page.evaluate('window.__navigation.at(-1).view') == 'read', 'Notes link did not open the notes'
                links.first.focus()
                assert links.first.evaluate('(el) => el === document.activeElement'), 'Card link cannot be focused'
                assert not errors, f'{theme}/{width}: {errors}'
                context.close()
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    run(args.screenshots)
    print('Course page cards (light/dark, desktop/mobile): PASS')
