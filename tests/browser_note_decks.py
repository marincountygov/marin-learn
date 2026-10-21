#!/usr/bin/env python3
"""Decks built from Notes: walk every slide of the Data 101 and Schema 101 decks."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
DECKS = {
    "county-leaders-guide-to-data": ("Data 101", 16, False),
    "county-leaders-guide-to-schemas": ("Schema 101", 19, True),
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def log_message(self, *args) -> None:
        pass


def run() -> None:
    from playwright.sync_api import sync_playwright

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    Thread(target=server.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{server.server_port}/"
    try:
        with sync_playwright() as playwright:
            executable = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
            options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
            if executable:
                options["executable_path"] = executable
            browser = playwright.chromium.launch(**options)
            try:
                for slug, (title, count, has_code) in DECKS.items():
                    for width in (1200, 390):
                        page = browser.new_context(viewport={"width": width, "height": 900}).new_page()
                        errors: list[str] = []
                        page.on("pageerror", lambda error: errors.append(str(error)))
                        page.goto(f"{base}?set={slug}&view=slides", wait_until="networkidle")
                        page.locator("#slide-canvas-el h2").wait_for()
                        total = int(page.inner_text("#slides-counter").split(" of ")[1])
                        require(total == count, f"{title}: expected {count} slides, found {total}")
                        require(page.locator(".viewer-breadcrumb:visible a").all_text_contents() == ["Catalog", title], f"{title}: breadcrumb is wrong")
                        require(page.locator(".reader-next .resource-action").all_text_contents() == ["Notes", "Quiz"], f"{title}: Notes and Quiz cards belong below the slides")
                        require(page.evaluate("document.querySelector('.reader-next').getBoundingClientRect().top >= document.querySelector('.slides-viewer-container').getBoundingClientRect().bottom"),
                                f"{title}: the cards sit below the slides")
                        titles = []
                        canvas = page.locator("#slide-canvas-el")
                        info = page.locator(".slides-title-info")
                        require(info.inner_text().split("\n")[0] == f"{title} \u2014 slides", f"{title}: slides name is {info.inner_text()!r}")
                        require(info.evaluate("e => getComputedStyle(e).textAlign") == "left" and info.evaluate("e => getComputedStyle(e).alignItems") == "flex-start",
                                f"{title}: the deck name and slide count should be left aligned")
                        require(canvas.locator(".slide-footer").count() == 0, f"{title}: the title slide has no footer")
                        require(canvas.locator(".slide-title-icon svg").count() == 1, f"{title}: the title slide needs the course icon")
                        require(canvas.locator(".slide-title-description").inner_text().strip() != "", f"{title}: the title slide needs a description")
                        order = canvas.evaluate("c => [...c.querySelectorAll('.slide-title-icon, h2, .slide-title-description')].map(e => e.tagName === 'H2' ? 'title' : e.className)")
                        require(order == ["slide-title-icon", "title", "slide-title-description"], f"{title}: icon, title, description order is {order}")
                        require(canvas.evaluate("c => getComputedStyle(c).backgroundImage") == "none", f"{title}: the title slide should have no gradient")
                        centered = canvas.evaluate("""c => {
                            const box = c.getBoundingClientRect();
                            const parts = [...c.querySelectorAll('.slide-title-icon, h2, .slide-title-description')].map(e => e.getBoundingClientRect());
                            const top = Math.min(...parts.map(p => p.top)), bottom = Math.max(...parts.map(p => p.bottom));
                            const left = Math.min(...parts.map(p => p.left)), right = Math.max(...parts.map(p => p.right));
                            return [Math.abs((top + bottom) / 2 - (box.top + box.bottom) / 2), Math.abs((left + right) / 2 - (box.left + box.right) / 2)];
                        }""")
                        require(centered[0] < 12 and centered[1] < 12, f"{title}: the title slide content should be centered, off by {centered}")
                        saw_code = saw_table = saw_split = False
                        for index in range(total):
                            titles.append(canvas.locator("h2").inner_text())
                            if index > 0 and canvas.locator(".slide-content-item").count() == 1:
                                require(canvas.locator(".slide-content-item h4").count() == 0, f"{title}: slide {index + 1} repeats its title as a heading")
                            require(canvas.evaluate("c => c.scrollWidth <= c.clientWidth + 2"), f"{title}: slide {index + 1} scrolls sideways at {width}px")
                            saw_code = saw_code or canvas.locator("pre code").count() > 0
                            saw_table = saw_table or canvas.locator("table").count() > 0
                            saw_split = saw_split or canvas.locator(".slide-content-item").count() == 2
                            if index > 0:
                                footer = canvas.locator(".slide-footer")
                                require(footer.count() == 1 and footer.inner_text().strip() == title and footer.locator("svg").count() == 1,
                                        f"{title}: slide {index + 1} needs a footer with the course icon and title")
                            if index < total - 1:
                                page.click("#next-slide")
                        require(titles[0] == title and titles[-1] == "Sources", f"{title}: first and last slides are {titles[0]!r} and {titles[-1]!r}")
                        require(len(set(titles)) == len(titles), f"{title}: slide titles must be unique")
                        require(saw_table and saw_split, f"{title}: the Do/Don't table and the Problem and solution split should show")
                        require(saw_code == has_code, f"{title}: code slides expected={has_code}, found={saw_code}")
                        require(errors == [], f"{title}: page errors {errors}")
                        page.context.close()
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    run()
    print("Note decks: PASS")
