#!/usr/bin/env python3
"""Isolated browser checks for the shared editor dialog component.

This test exercises the production component source in an about:blank document. It
removes only the ES-module ``export`` keyword so the factory can be called from the
isolated page; the function body is otherwise unchanged. Full editor integration is
covered by ``browser_editor_dialogs.py``.
"""
from __future__ import annotations

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run() -> None:
    from playwright.sync_api import sync_playwright

    source = (ROOT / "editor/assets/dialogs.js").read_text(encoding="utf-8")
    source = source.replace(
        "export function createEditorDialogs",
        "function createEditorDialogs",
        1,
    )
    source += "\nwindow.createEditorDialogs = createEditorDialogs;\n"

    tokens = """
:root {
  --pico-card-background-color: white;
  --pico-card-sectioning-background-color: rgb(245 245 245);
  --app-table-row-hover: rgb(248 248 248);
  --pico-card-border-color: rgb(160 160 160);
  --pico-form-element-border-color: rgb(100 100 100);
  --pico-color: black;
  --pico-muted-color: rgb(80 80 80);
  --pico-primary: rgb(64 44 110);
  --app-accent-on-tint: rgb(38 24 70);
  --pico-primary-focus: rgb(64 44 110 / 0.25);
  --app-success: rgb(0 110 65);
  --app-warning: rgb(170 105 0);
  --app-danger: rgb(180 45 35);
  --app-danger-text: rgb(125 35 25);
  --pico-border-radius: 0.4rem;
  --pico-outline-width: 2px;
}
@media (prefers-color-scheme: dark) {
  :root {
    --pico-card-background-color: rgb(28 30 34);
    --pico-card-sectioning-background-color: rgb(36 38 43);
    --app-table-row-hover: rgb(42 44 50);
    --pico-card-border-color: rgb(110 110 110);
    --pico-form-element-border-color: rgb(150 150 150);
    --pico-color: rgb(245 245 245);
    --pico-muted-color: rgb(190 190 190);
    --pico-primary: rgb(190 165 255);
    --app-accent-on-tint: rgb(245 240 255);
    --pico-primary-focus: rgb(190 165 255 / 0.3);
    --app-success: rgb(115 220 160);
    --app-warning: rgb(245 190 90);
    --app-danger: rgb(190 65 55);
    --app-danger-text: rgb(255 180 170);
  }
}
"""
    css = tokens + (ROOT / "editor/assets/app.css").read_text(encoding="utf-8")

    with sync_playwright() as playwright:
        executable = (shutil.which("chromium") or shutil.which("chromium-browser")
                      or shutil.which("google-chrome"))
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            page = browser.new_page(viewport={"width": 360, "height": 640})
            page_errors: list[str] = []
            page.on("pageerror", lambda error: page_errors.append(str(error)))
            page.set_content(
                '<!doctype html><html><head></head><body><main id="main">'
                '<button id="opener">Open</button></main></body></html>'
            )
            page.add_style_tag(content=css)
            page.add_script_tag(content=source)
            page.evaluate("window.dialogs = createEditorDialogs()")

            # Required text validation, trimming, Enter submission, and focus return.
            page.evaluate("""() => {
              const opener = document.querySelector('#opener');
              opener.addEventListener('click', () => {
                dialogs.requestText({
                  title: 'Create item',
                  label: 'Item title',
                  value: '',
                  requiredMessage: 'Enter an item title.',
                  submitLabel: 'Create'
                }).then((value) => { window.textResult = value; });
              }, { once: true });
            }""")
            page.locator("#opener").click()
            dialog = page.locator("#editor-shared-dialog")
            dialog.wait_for(state="visible")
            require(dialog.evaluate("element => element.tagName") == "DIALOG",
                    "Component did not create a native dialog")
            require(dialog.evaluate("element => element.matches(':modal')"),
                    "Component did not use showModal()")
            require(dialog.locator("form").count() == 1,
                    "Dialog does not contain exactly one form")
            require(page.get_by_role("dialog", name="Create item").count() == 1,
                    "Dialog does not expose its visible heading as an accessible name")

            text_input = dialog.locator('[name="value"]')
            require(text_input.evaluate("element => document.activeElement === element"),
                    "Primary text field did not receive focus")
            require(text_input.evaluate("element => element.matches(':required')"),
                    "Required text field did not expose native required state")
            for _ in range(6):
                page.keyboard.press("Tab")
                focus_state = dialog.evaluate("""element => ({
                  inside: element.contains(document.activeElement),
                  onDocument: [document.body, document.documentElement].includes(document.activeElement),
                  onBackgroundControl: document.activeElement === document.querySelector('#opener')
                })""")
                require(not focus_state["onBackgroundControl"],
                        "Tab moved focus to an interactive control behind the modal dialog")
                require(focus_state["inside"] or focus_state["onDocument"],
                        f"Tab moved focus to unexpected background content: {focus_state}")
            text_input.focus()
            text_input.fill("   ")
            dialog.locator("[data-editor-dialog-submit]").click()
            require(dialog.is_visible(), "Whitespace-only input closed the dialog")
            require(text_input.get_attribute("aria-invalid") == "true",
                    "Invalid text field did not expose aria-invalid")
            error_id = text_input.get_attribute("aria-errormessage")
            require(bool(error_id) and page.locator(f"#{error_id}").is_visible(),
                    "Inline error is missing or not associated")
            text_input.fill("  Valid title  ")
            text_input.press("Enter")
            dialog.wait_for(state="hidden")
            page.wait_for_function("window.textResult === 'Valid title'")
            require(page.locator("#opener").evaluate(
                    "element => document.activeElement === element"),
                    "Closing did not return focus to the opener")

            # Multiple fields preserve validation and parse numbers.
            page.evaluate("""() => {
              dialogs.requestFields({
                title: 'Table size',
                submitLabel: 'Insert table',
                fields: [
                  { name: 'rows', label: 'Rows', type: 'number', value: '2',
                    required: true, integer: true, min: 1, max: 10,
                    parse: Number, select: true },
                  { name: 'columns', label: 'Columns', type: 'number', value: '2',
                    required: true, integer: true, min: 1, max: 8,
                    parse: Number }
                ]
              }).then((value) => { window.fieldsResult = value; });
            }""")
            dialog.wait_for(state="visible")
            page.locator('[name="rows"]').fill("11")
            dialog.locator("[data-editor-dialog-submit]").click()
            require(dialog.is_visible(), "Out-of-range number closed the dialog")
            page.locator('[name="rows"]').fill("3")
            page.locator('[name="columns"]').fill("4")
            dialog.locator("[data-editor-dialog-submit]").click()
            dialog.wait_for(state="hidden")
            page.wait_for_function(
                "window.fieldsResult?.rows === 3 && window.fieldsResult?.columns === 4"
            )

            # Choice values and state reset between uses.
            page.evaluate("""() => {
              dialogs.requestChoice({
                title: 'Move item',
                label: 'Destination',
                options: [
                  { value: 'a', label: 'Alpha' },
                  { value: 'b', label: 'Beta' }
                ]
              }).then((value) => { window.choiceResult = value; });
            }""")
            dialog.wait_for(state="visible")
            require(not dialog.locator(".editor-dialog-field-error").is_visible(),
                    "A reused dialog retained stale validation")
            page.locator('select[name="value"]').select_option("b")
            dialog.locator("[data-editor-dialog-submit]").click()
            dialog.wait_for(state="hidden")
            page.wait_for_function("window.choiceResult === 'b'")

            # Destructive confirmation focuses Cancel and Escape resolves false.
            page.evaluate("""() => {
              dialogs.confirmAction({
                title: 'Delete item?',
                description: 'Delete the selected item?',
                submitLabel: 'Delete item',
                destructive: true
              }).then((value) => { window.confirmResult = value; });
            }""")
            dialog.wait_for(state="visible")
            cancel = dialog.locator("[data-editor-dialog-cancel]")
            require(cancel.evaluate("element => document.activeElement === element"),
                    "Destructive confirmation did not focus Cancel")
            page.keyboard.press("Escape")
            dialog.wait_for(state="hidden")
            page.wait_for_function("window.confirmResult === false")

            # Message mode and concurrent invocation are deterministic.
            page.evaluate("""() => {
              dialogs.showMessage({ title: 'Notice', description: 'Done.' })
                .then(() => { window.messageDone = true; });
              dialogs.requestText({ title: 'Blocked', label: 'Blocked' })
                .then((value) => {
                  window.busyValue = value;
                  window.busyDone = true;
                });
            }""")
            dialog.wait_for(state="visible")
            page.wait_for_function("window.busyDone === true")
            require(page.evaluate("window.busyValue") is None,
                    "Concurrent request did not resolve as cancelled")
            require(dialog.locator("[data-editor-dialog-cancel]").is_hidden(),
                    "Acknowledgement mode exposed a Cancel action")
            dialog.locator("[data-editor-dialog-submit]").click()
            dialog.wait_for(state="hidden")
            page.wait_for_function("window.messageDone === true")

            # Narrow viewport stays within the viewport without horizontal overflow.
            page.evaluate("""() => {
              dialogs.requestText({ title: 'Narrow dialog', label: 'Title', value: 'Reset' })
                .then((value) => { window.narrowResult = value; });
            }""")
            dialog.wait_for(state="visible")
            geometry = dialog.evaluate("""element => {
              const rect = element.getBoundingClientRect();
              const form = element.querySelector('form');
              return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
                viewportWidth: innerWidth,
                viewportHeight: innerHeight,
                horizontalOverflow: form.scrollWidth > form.clientWidth + 1
              };
            }""")
            require(geometry["left"] >= 0 and geometry["right"] <= geometry["viewportWidth"] + 1,
                    f"Dialog exceeded the narrow viewport: {geometry}")
            require(geometry["top"] >= 0 and geometry["bottom"] <= geometry["viewportHeight"] + 1,
                    f"Dialog was vertically clipped: {geometry}")
            require(not geometry["horizontalOverflow"],
                    f"Dialog form introduced horizontal overflow: {geometry}")
            page.keyboard.press("Escape")
            dialog.wait_for(state="hidden")

            # Token-driven dialog colors resolve in dark mode without transparent surfaces.
            page.emulate_media(color_scheme="dark")
            page.evaluate("""() => {
              dialogs.showMessage({ title: 'Dark mode notice', description: 'Dark mode check.' })
                .then(() => { window.darkMessageDone = true; });
            }""")
            dialog.wait_for(state="visible")
            appearance = dialog.evaluate("""element => {
              const style = getComputedStyle(element);
              return { background: style.backgroundColor, color: style.color };
            }""")
            require(appearance["background"] not in ("rgba(0, 0, 0, 0)", "transparent"),
                    f"Dark-mode dialog background is transparent: {appearance}")
            require(appearance["background"] != appearance["color"],
                    f"Dark-mode dialog text and background resolve identically: {appearance}")
            dialog.locator("[data-editor-dialog-submit]").click()
            dialog.wait_for(state="hidden")
            page.wait_for_function("window.darkMessageDone === true")

            require(not page_errors, f"Dialog component page errors: {page_errors}")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Editor dialog component browser tests: PASS")
