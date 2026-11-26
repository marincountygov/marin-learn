#!/usr/bin/env python3
"""Verify that the public viewer renders a two-entry split slide in canonical order, in real Chromium."""
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


def configure(context, base_url: str) -> list[str]:
    problems: list[str] = []
    context.set_default_timeout(12_000)
    context.set_default_navigation_timeout(20_000)

    def intercept(route) -> None:
        url = route.request.url
        if url.startswith(base_url):
            route.continue_()
        elif url == "https://marincountygov.github.io/marin-os/catalog.json":
            route.fulfill(status=200, content_type="application/json", body="[]",
                          headers={"Access-Control-Allow-Origin": "*"})
        elif url.startswith("https://api.github.com/"):
            route.fulfill(status=200, content_type="application/json", body="[]",
                          headers={"Access-Control-Allow-Origin": "*"})
        else:
            route.abort()

    context.route("**/*", intercept)
    context.on("page", lambda page: (
        page.on("pageerror", lambda error: problems.append(str(error))),
        page.on("console", lambda message: problems.append(f"console {message.type}: {message.text}")
                if message.type == "error" else None),
    ))
    return problems


def test_public_viewer(page, base_url: str) -> None:
    """The published Data 101 deck: its Problem and solution slide is a two-entry split slide."""
    page.goto(f"{base_url}?set=county-leaders-guide-to-data&view=slides", wait_until="networkidle")
    page.get_by_role("heading", name="Data 101", exact=True).wait_for()
    for _ in range(4):
        page.locator("#next-slide").click()
    page.get_by_role("heading", name="Problem and solution", exact=True).wait_for()

    canvas = page.locator("#slide-canvas-el")
    require("slide-layout--split" in (canvas.get_attribute("class") or ""),
            "The public viewer did not apply the split layout")
    items = canvas.locator(".slide-content-item")
    require(items.count() == 2, "The public viewer did not render both canonical content entries")
    require("Problem" in items.nth(0).inner_text() and "Solution" in items.nth(1).inner_text(),
            "The public viewer did not preserve canonical content order")
    columns = canvas.locator(".slide-body").evaluate(
        "element => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length"
    )
    require(columns == 2, f"The split layout did not render as two columns at desktop width: {columns}")


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
            context = browser.new_context(viewport={"width": 1440, "height": 1100})
            problems = configure(context, base_url)
            viewer_page = context.new_page()
            test_public_viewer(viewer_page, base_url)
            require(problems == [], f"Browser errors were reported: {problems}")
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()
