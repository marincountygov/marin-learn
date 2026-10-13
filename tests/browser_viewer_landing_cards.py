#!/usr/bin/env python3
"""Exercise the learning-set overview's catalog-style cards in light/dark modes.

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
    graph = json.loads((ROOT / "learning/marinos-foundations/learning.json").read_text(encoding="utf-8"))
    catalog = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))["items"]
    resource_types = {'LearningMaterial', 'Presentation', 'Assessment'}
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
                        'marinos-foundations', catalogEntries,
                        route => window.__navigation.push(route));
                }""", [inline_module(ROOT / 'js/viewer/landing.js'), graph, catalog])

                cards = page.locator('.landing-resource-card')
                assert cards.count() == count, f'Expected {count} resource cards, found {cards.count()}'
                assert page.locator('.landing-resource-grid.catalog-grid > article.catalog-card').count() == count
                assert page.locator('.landing-section, .resource-list').count() == 0
                assert page.locator('.landing-resources h3').inner_text().startswith('Learning resources')
                assert page.locator('header.landing-header > h2').inner_text() == 'MarinOS Foundations'
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), f'overflow at {width}px'

                links = page.locator('.landing-resource-card a.resource-action')
                assert links.count() == count
                assert all(link.get_attribute('href').startswith('?set=marinos-foundations&view=')
                           for link in links.all())
                assert all(link.get_attribute('aria-label') for link in links.all())
                assert page.locator('.landing-resource-card .badge--resource').all_text_contents() == [
                    'Reading material', 'Slide presentation', 'Quiz'
                ]
                if screenshots:
                    page.screenshot(path=str(screenshots / f'landing-{theme}-{width}.png'), full_page=True)
                # The card's header is also a hit target, because the footer
                # link is stretched to cover the entire article.
                header_rect = cards.first.locator('header').bounding_box()
                assert header_rect, 'Card header is not visible'
                page.mouse.click(header_rect['x'] + header_rect['width'] / 2,
                                 header_rect['y'] + header_rect['height'] / 2)
                assert page.evaluate('window.__navigation.at(-1).view') == 'read', 'Card body was not clickable'
                links.first.focus()
                assert links.first.evaluate('(el) => el === document.activeElement'), 'Card link cannot be focused'
                assert page.locator('.landing-resource-card').first.evaluate(
                    "el => getComputedStyle(el).outlineColor !== 'rgba(0, 0, 0, 0)'"), 'No card focus outline'
                assert not errors, f'{theme}/{width}: {errors}'
                context.close()
        finally:
            browser.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--screenshots', type=Path)
    args = parser.parse_args()
    run(args.screenshots)
    print('Learning-set overview cards (light/dark, desktop/mobile): PASS')
