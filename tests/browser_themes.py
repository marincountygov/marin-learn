#!/usr/bin/env python3
"""Theme pages: badges on course cards and course pages link to a page listing that theme's courses."""
from __future__ import annotations

from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]


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
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def run() -> None:
    from playwright.sync_api import sync_playwright

    with serve() as base_url, sync_playwright() as playwright:
        executable = (shutil.which("chromium") or shutil.which("chromium-browser")
                      or shutil.which("google-chrome"))
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            page = browser.new_context(viewport={"width": 1200, "height": 900}).new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            # Course page badge -> theme page.
            page.goto(f"{base_url}?set=county-leaders-guide-to-schemas", wait_until="networkidle")
            badges = page.locator(".landing-themes a.app-badge")
            require(badges.all_text_contents() == ["Data", "Buying and vendors"], "Course page theme badges are wrong")
            require(page.locator(".landing-header a.app-badge").count() == 0, "Theme badges belong below the cards, not in the header")
            require(page.evaluate("document.querySelector('.landing-themes').getBoundingClientRect().top > document.querySelector('.landing-resources').getBoundingClientRect().bottom - 1"),
                    "Theme badges should sit below the Notes, Slides, and Quiz cards")
            badges.nth(1).click()
            page.locator("h2", has_text="Buying and vendors").wait_for()
            require(page.url.endswith("?theme=buying-and-vendors"), "Badge did not open its theme page")
            require(page.locator(".viewer-breadcrumb:visible a").all_text_contents() == ["Catalog"], "Theme breadcrumb is wrong")
            require(page.locator(".landing-page .course-card h3").all_text_contents() == ["Schema 101"],
                    "Theme page lists the wrong courses")

            # The homepage has no row of theme badges (the Themes filter in the column does that job); a theme page
            # is reached from a course page's badges, or by its address.
            page.goto(base_url, wait_until="networkidle")
            require(page.locator("#themes, #theme-badges").count() == 0, "The homepage should not show a row of theme badges")
            require(page.locator("#catalog-grid a.app-badge").count() == 0, "Course cards should not show theme badges")
            page.goto(f"{base_url}?theme=ai", wait_until="networkidle")
            page.locator("h2", has_text="AI").first.wait_for()
            page.goto(f"{base_url}?theme=data", wait_until="networkidle")
            page.locator("h2", has_text="Data").first.wait_for()
            require(page.locator(".landing-page .course-card h3").all_text_contents() == ["API 101", "Data 101", "Schema 101"],
                    "Data theme should list API 101, Data 101 and Schema 101")

            # The catalog lists API 101, Data 101, Engage Marin 101 and Schema 101 only; MarinOS 101 is no longer in Marin Learn.
            page.goto(base_url, wait_until="networkidle")
            require(page.locator("#catalog-grid .course-card h3").all_text_contents() == ["API 101", "Data 101", "Engage Marin 101", "Schema 101"],
                    "The catalog should list API 101, Data 101, Engage Marin 101 and Schema 101 only")
            page.goto(f"{base_url}?theme=community-engagement", wait_until="networkidle")
            page.locator("h2", has_text="Community engagement").first.wait_for()
            require(page.locator(".landing-page .course-card h3").all_text_contents() == ["Engage Marin 101"], "The Community engagement theme lists Engage Marin 101")
            page.goto(f"{base_url}?theme=digital-services", wait_until="networkidle")
            require(page.locator(".landing-page .course-card h3").all_text_contents() == ["API 101"], "Digital services lists API 101")
            page.goto(f"{base_url}?set=marinos-foundations", wait_until="networkidle")
            page.locator("h3", has_text="Course not found").wait_for()

            # Themes without courses and unknown themes.
            page.goto(f"{base_url}?theme=ai", wait_until="networkidle")
            require("No courses in this theme yet." in page.locator(".landing-page").inner_text(), "Empty theme message missing")
            page.goto(f"{base_url}?theme=nope", wait_until="networkidle")
            require(page.locator("h3", has_text="Theme not found").count() == 1, "Unknown theme should say so")
            require(errors == [], f"Page errors: {errors}")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Theme pages: PASS")
