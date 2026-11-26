#!/usr/bin/env python3
"""Catalog filter: the home page has the shell's filter column (search and Themes, from filters.json and catalog.json),
and no page you open from it has one. Needs Playwright for Python. Set AXE_CORE to axe.min.js for the accessibility scan.
Run: python3 tests/browser_catalog_filter.py"""
from __future__ import annotations

import json
import os
from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / "catalog.json").read_text(encoding="utf-8"))
AXE = os.environ.get("AXE_CORE")
PANEL = "#catalog-filter-panel"
NO_FILTER = "[data-filter-column], .search-sidebar, .filter-toggle, #catalog-search"



def wait_until(page, expression, timeout=10000):
    """Poll with evaluate. wait_for_function evaluates a string in the page, which the page's Content Security Policy (no
    unsafe-eval) refuses when the browser is not set to bypass it; evaluate is not affected."""
    waited = 0
    while waited <= timeout:
        if page.evaluate(f"() => Boolean({expression})"):
            return
        page.wait_for_timeout(100)
        waited += 100
    raise AssertionError(f"Timed out waiting for: {expression}")

def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args) -> None:
        pass


@contextmanager
def serve():
    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()


def cards(page):
    return page.locator("#catalog-grid .course-card h3").all_text_contents()


def run() -> None:
    from playwright.sync_api import sync_playwright

    with serve() as base, sync_playwright() as playwright:
        executable = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            for scheme in ("light", "dark"):
                context = browser.new_context(color_scheme=scheme, viewport={"width": 1200, "height": 900}, bypass_csp=bool(AXE))
                page = context.new_page()
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto(base, wait_until="networkidle")
                page.wait_for_selector(f"{PANEL} #theme-facet", state="attached")
                wait_until(page, "document.getElementById('catalog-status').textContent.includes('results')")

                # The column is the shell's: its words come from filters.json, its choices from catalog.json.
                require(page.inner_text(f"{PANEL}-title") == "Filter" and page.inner_text(f"{PANEL} .search-input-field label") == "Search", "Title and search label")
                require(page.locator(f"{PANEL} [placeholder]").count() == 0, "No placeholders")
                require(page.inner_text("#theme-facet legend") == "Themes" and page.inner_text("#theme-summary") == "All themes", "The group shows its name and its All text")
                page.click("#theme-summary")
                # Themes are checkboxes (several at once), listed from the courses in catalog.json, each with its course count.
                everything = [i["name"] for i in CATALOG["items"]]
                counts = {}
                for item in CATALOG["items"]:
                    for theme in item.get("themes") or []:
                        counts[theme] = counts.get(theme, 0) + 1
                shown = page.eval_on_selector_all("#theme-options li", "els => els.map(e => e.textContent.trim().replace(/\\s+/g, ' '))")
                require(sorted(shown) == sorted(f"{name} ({n})" for name, n in counts.items()), f"Themes come from the courses, with counts: {shown}")
                require(page.locator("#theme-facet select").count() == 0, "Themes are not a drop-down")
                require(sorted(cards(page)) == sorted(everything), "Every course shows to begin with")
                require(page.inner_text("#catalog-status").startswith(f"{len(everything)} results"), page.inner_text("#catalog-status"))

                # One theme, then a second: the list widens (a course with either theme), the address and counts follow.
                page.check("#theme-options input[value='Data']")
                want = sorted(i["name"] for i in CATALOG["items"] if "Data" in (i.get("themes") or []))
                require(sorted(cards(page)) == want and "themes=Data" in page.url, f"A theme filters the courses: {cards(page)} {page.url}")
                page.check("#theme-options input[value='Community engagement']")
                union = sorted(i["name"] for i in CATALOG["items"] if {"Data", "Community engagement"} & set(i.get("themes") or []))
                require(sorted(cards(page)) == union, f"Two themes show a course with either: {cards(page)}")
                require(page.inner_text("#theme-summary") == "2 selected" and page.url.count("themes=") == 2, f"The summary and address follow: {page.url}")
                page.uncheck("#theme-options input[value='Data']")
                page.uncheck("#theme-options input[value='Community engagement']")
                # Search narrows the counts, and nothing matching offers Reset.
                page.fill("#catalog-search", "zzzz")
                wait_until(page, "document.getElementById('catalog-status').textContent.startsWith('No results.')")
                require(page.locator("#catalog-status button", has_text="Reset filters").count() == 1, "Nothing matching offers Reset filters")
                page.click("#catalog-status button")
                wait_until(page, "document.getElementById('catalog-grid').children.length === %d" % len(everything))
                require("q=" not in page.url and "themes=" not in page.url, f"Reset clears the address: {page.url}")

                # The catalog home has no row of theme badges above the heading, and the Help section has a top border.
                require(page.locator("#themes, #theme-badges").count() == 0, "No theme badges above the Catalog heading")
                require(page.evaluate("getComputedStyle(document.getElementById('support')).borderTopWidth") == "1px", "The Help section has a border on top")

                # Opening a course, a note, the slides, a quiz or a theme page leaves the filter behind, and Back brings it
                # back with what was typed.
                page.fill("#catalog-search", "api")
                wait_until(page, "document.getElementById('catalog-grid').children.length === 1")
                page.locator("#catalog-grid .course-card a").first.click()
                page.wait_for_selector(".landing-page")
                require(page.locator(NO_FILTER).count() == 0, "A course page has no filter")
                require("q=" not in page.url, f"A course page's address carries no filter: {page.url}")
                for link in page.locator(".landing-resources a").all():
                    href = link.get_attribute("href")
                    page.goto(base + href.lstrip("/"), wait_until="networkidle")
                    page.wait_for_timeout(300)
                    require(page.locator(NO_FILTER).count() == 0, f"{href} has no filter")
                    page.go_back(wait_until="networkidle")
                    page.wait_for_selector(".landing-page")
                page.goto(base + "?theme=data", wait_until="networkidle")
                require(page.locator(NO_FILTER).count() == 0, "A theme page has no filter")
                page.goto(base + "?q=api", wait_until="networkidle")
                page.wait_for_selector(f"{PANEL} #theme-facet", state="attached")
                require(page.input_value("#catalog-search") == "api" and cards(page) == ["API 101"], "An address with a search restores it")
                page.go_back(wait_until="networkidle")

                if AXE:
                    page.goto(base, wait_until="networkidle")
                    page.wait_for_selector(f"{PANEL} #theme-facet", state="attached")
                    page.add_script_tag(path=AXE)
                    result = page.evaluate("axe.run(document.querySelector('main'), { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })")
                    found = [f"{v['id']}: {v['help']}" for v in result["violations"]]
                    require(not found, f"axe-core ({scheme}): {found}")
                require(not errors, f"No JavaScript errors: {errors}")
                context.close()
        finally:
            browser.close()
    print("Marin Learn catalog filter (light and dark): PASS" + ("" if AXE else " (axe-core scan skipped)"))


if __name__ == "__main__":
    try:
        run()
    except AssertionError as error:
        print(f"ERROR: {error}")
        raise SystemExit(1)
