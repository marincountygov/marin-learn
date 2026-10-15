#!/usr/bin/env python3
"""Verify shared slide semantics and multi-content preservation in real Chromium."""
from __future__ import annotations

from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
# The editor test opens a deck with a hand-built two-entry split slide. The published Data 101 deck
# is now built from the Note, so the editor test keeps a copy of the earlier package as a fixture.
PACKAGE = ROOT / "tests" / "fixtures" / "legacy-deck" / "county-leaders-guide-to-data.zip"

SLIDE_ID = "urn:uuid:a6295366-688e-5f6a-a7fd-f492748fe01d"
UNIT_FILES = "urn:uuid:527b26a7-f4d0-55fd-bfbb-0b06552267c3"
UNIT_MECHANICS = "urn:uuid:6cfb870f-a230-51e9-be5e-4752de1d7f40"
SLIDE_TITLE = "Files preserve records. Data reveals patterns."


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


def stored_slide_entries(page) -> list[dict]:
    return page.evaluate(
        """async ({slideId}) => {
          const storageUrl = new URL('../js/storage.js', location.href).href;
          const {loadWorkspace} = await import(storageUrl);
          const record = await loadWorkspace();
          const slide = record?.pkg?.graphDocument?.['@graph']
            ?.find(candidate => candidate?.['@id'] === slideId);
          return [...(slide?.['marin:contentSequence']?.itemListElement || [])]
            .sort((a, b) => Number(a.position) - Number(b.position))
            .map(entry => ({
              position: entry.position,
              itemId: entry.item?.['@id'],
              displayMode: entry['marin:displayMode']
            }));
        }""",
        {"slideId": SLIDE_ID},
    )


def test_editor(page, base_url: str) -> None:
    page.goto(f"{base_url}editor/", wait_until="networkidle")
    page.locator("#file-import-zip").set_input_files(str(PACKAGE))
    page.locator("#workspace-view").wait_for(state="visible")
    page.locator('[data-tab="slides"]').click()

    card = page.locator(f'[data-slide-card="{SLIDE_ID}"]')
    card.locator(f'button[data-action="edit-slide"][data-id="{SLIDE_ID}"]').click()
    rows = card.locator("[data-slide-content-entry]")
    require(rows.count() == 2, "The existing two-entry split slide did not open with both content rows")
    require(rows.nth(0).locator("[data-slide-content-unit]").input_value() == UNIT_FILES,
            "The first content reference was not loaded")
    require(rows.nth(1).locator("[data-slide-content-unit]").input_value() == UNIT_MECHANICS,
            "The second content reference was not loaded")
    require(rows.nth(0).locator("[data-slide-content-mode]").input_value() == "abstract",
            "The first display mode was not loaded")
    require(rows.nth(1).locator("[data-slide-content-mode]").input_value() == "title",
            "The second display mode was not loaded")

    notes = card.locator("#s-edit-notes")
    notes.fill("PPTX-0 preservation test notes.")

    card.locator("#btn-add-slide-content").click()
    require(rows.count() == 3, "Add content block did not create a third editable row")
    rows.nth(2).locator('[data-slide-content-action="remove"]').click()
    require(rows.count() == 2, "Remove content block did not restore the two-row form")
    require(notes.input_value() == "PPTX-0 preservation test notes.",
            "Adding and removing a content row discarded unsaved speaker notes")

    rows.nth(1).locator('[data-slide-content-action="move-up"]').click()
    require(rows.nth(0).locator("[data-slide-content-unit]").input_value() == UNIT_MECHANICS,
            "Move up did not reorder the content rows")
    require(notes.input_value() == "PPTX-0 preservation test notes.",
            "Reordering content rows discarded unsaved speaker notes")

    card.locator("#btn-save-slide").click()
    page.get_by_text(f"Slide 3: {SLIDE_TITLE}", exact=True).wait_for()

    stored = stored_slide_entries(page)
    require(stored == [
        {"position": 1, "itemId": UNIT_MECHANICS, "displayMode": "title"},
        {"position": 2, "itemId": UNIT_FILES, "displayMode": "abstract"},
    ], f"Saved content sequence was not preserved and renumbered: {stored}")

    page.locator("#btn-preview-deck").click()
    page.locator(".editor-preview-modal").wait_for(state="visible")
    page.locator("#btn-preview-next-s").click()
    page.locator("#btn-preview-next-s").click()
    page.get_by_role("heading", name=SLIDE_TITLE, exact=True).wait_for()
    preview_items = page.locator(".editor-preview-modal .slide-content-item")
    require(preview_items.count() == 2, "Editor preview did not render both content blocks")
    require("How County data works" in preview_items.nth(0).inner_text(),
            "Editor preview did not use the saved content order")
    page.locator(".btn-close-modal").click()

    card = page.locator(f'[data-slide-card="{SLIDE_ID}"]')
    card.locator(f'button[data-action="edit-slide"][data-id="{SLIDE_ID}"]').click()
    rows = card.locator("[data-slide-content-entry]")
    require(rows.count() == 2, "Saved multi-content slide did not reopen with both rows")
    rows.nth(0).locator('[data-slide-content-action="remove"]').click()
    card.locator("#btn-cancel-slide").click()
    require(len(stored_slide_entries(page)) == 2, "Canceling an edit mutated the stored content sequence")

    page.locator('[data-tab="export"]').click()
    page.locator("#btn-run-validation").click()
    require(page.locator("#validation-results .app-alert--danger").count() == 0,
            "The edited multi-content slide introduced a validation error")


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
            editor_page = context.new_page()
            test_editor(editor_page, base_url)
            viewer_page = context.new_page()
            test_public_viewer(viewer_page, base_url)
            require(problems == [], f"Browser errors were reported: {problems}")
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()
