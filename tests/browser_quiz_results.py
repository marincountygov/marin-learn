#!/usr/bin/env python3
"""Quiz results card: icon, quiz name, grade / percent, pass and fail colors, and Share."""
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


def finish_quiz(page, base_url: str, correct: set[str], answer_correctly: bool) -> None:
    page.goto(f"{base_url}?set=marinos-foundations&view=quiz&resource=marinos-foundations-quiz", wait_until="networkidle")
    for _ in range(30):
        inputs = page.locator(".quiz-options-group input")
        values = [inputs.nth(i).get_attribute("value") for i in range(inputs.count())]
        if answer_correctly:
            for i, value in enumerate(values):
                if value in correct:
                    inputs.nth(i).check(force=True)
        else:
            inputs.nth(next(i for i, value in enumerate(values) if value not in correct)).check(force=True)
        if page.locator("#check-item-btn").count():
            page.click("#check-item-btn")
        if page.locator("#submit-quiz").count():
            page.click("#submit-quiz")
            break
        page.click("#next-q")
    page.locator(".quiz-results-hero").wait_for()


def run() -> None:
    import json
    from playwright.sync_api import sync_playwright

    graph = json.loads((ROOT / "learning/marinos-foundations/learning.json").read_text(encoding="utf-8"))
    correct = {ref["@id"] for node in graph["@graph"] for ref in node.get("marin:correctResponse", [])}

    with serve() as base_url, sync_playwright() as playwright:
        executable = (shutil.which("chromium") or shutil.which("chromium-browser")
                      or shutil.which("google-chrome"))
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            context = browser.new_context(viewport={"width": 1000, "height": 900})
            context.grant_permissions(["clipboard-read", "clipboard-write"], origin=base_url.rstrip("/"))
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            finish_quiz(page, base_url, correct, True)
            hero = page.locator(".quiz-results-hero.passed")
            require(hero.count() == 1, "Passing run should show the passed card")
            require(page.locator(".quiz-top-bar").count() == 0, "Results should not repeat the quiz title box")
            require(hero.locator(".quiz-results-icon svg").count() == 1, "Results icon is missing")
            require(hero.locator("h2").inner_text() == "You passed the MarinOS 101 quiz!", "Result should be one line with the quiz name")
            require(hero.locator(".quiz-percentage-score").inner_text() == "A / 100%", "Grade and percent should read 'A / 100%'")
            page.click("#share-results")
            page.locator("#share-status", has_text="Results copied.").wait_for()
            require(page.locator("#share-status").inner_text() == "Results copied.", "Share did not report success")
            shared = page.evaluate("navigator.clipboard.readText()")
            require(shared == f"I passed the MarinOS 101 quiz! \U0001F389\nA / 100%\n\nTake the MarinOS 101 course:\n{base_url}?set=marinos-foundations",
                    f"Shared text is wrong: {shared!r}")

            finish_quiz(page, base_url, correct, False)
            require(page.locator(".quiz-score-meta").count() == 0, "The points line should be gone")
            require(page.locator(".quiz-results-hero.failed h2").inner_text() == "You did not pass the MarinOS 101 quiz.", "Failed heading is wrong")
            require(errors == [], f"Page errors: {errors}")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Quiz results: PASS")
