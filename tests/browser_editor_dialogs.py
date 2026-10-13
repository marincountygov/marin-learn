#!/usr/bin/env python3
"""Browser coverage for the Marin Learn shared native editor dialog system."""
from __future__ import annotations

from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import configure, require, serve, submit_editor_dialog


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
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            problems = configure(context, base_url)
            page = context.new_page()
            page.goto(f"{base_url}editor/", wait_until="networkidle")

            page.locator("#btn-new-project").click()
            page.locator("#new-proj-title").fill("Editor Dialog Test")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")
            page.locator('[data-tab="materials"]').click()

            # Required text validation, accessible error association, and Enter submission.
            opener = page.locator("#btn-create-first-material")
            opener.click()
            dialog = page.locator("#editor-shared-dialog")
            dialog.wait_for(state="visible")
            require(dialog.evaluate("element => element.tagName") == "DIALOG",
                    "Shared interaction is not a native dialog element")
            require(dialog.locator("form").count() == 1,
                    "Shared native dialog does not contain one normal form")
            require(dialog.evaluate("element => element.matches(':modal')"),
                    "Shared dialog was not opened with showModal()")
            labelled_by = dialog.get_attribute("aria-labelledby")
            require(bool(labelled_by), "Dialog has no aria-labelledby relationship")
            require(page.locator(f"#{labelled_by}").inner_text() == "Create reading material",
                    "Dialog accessible heading does not describe the operation")

            title_input = dialog.locator('[name="value"]')
            require(title_input.evaluate("element => document.activeElement === element"),
                    "Primary text input did not receive focus")
            title_input.fill("   ")
            dialog.locator("[data-editor-dialog-submit]").click()
            require(dialog.is_visible(), "Whitespace-only value incorrectly closed the dialog")
            require(title_input.get_attribute("aria-invalid") == "true",
                    "Invalid field did not expose aria-invalid")
            error_id = title_input.get_attribute("aria-errormessage")
            require(bool(error_id), "Invalid field has no aria-errormessage target")
            error = page.locator(f"#{error_id}")
            require(error.is_visible() and "Enter a reading material title" in error.inner_text(),
                    "Required field did not show the expected inline validation message")
            described_by = (title_input.get_attribute("aria-describedby") or "").split()
            require(error_id in described_by,
                    "Inline validation message is not associated through aria-describedby")

            title_input.fill("Dialog Material")
            title_input.press("Enter")
            dialog.wait_for(state="hidden")
            page.get_by_role("heading", name="Dialog Material").wait_for()
            require(page.locator('[data-material-id][aria-pressed="true"]').evaluate(
                    "element => document.activeElement === element"),
                    "Successful creation did not move focus to the created material")

            # Escape cancellation leaves state unchanged and returns focus to the invoker.
            add_material = page.locator("#btn-create-material-side")
            add_material.click()
            dialog.wait_for(state="visible")
            require(dialog.locator('[name="value"]').evaluate(
                    "element => document.activeElement === element"),
                    "Text dialog did not focus its input on reuse")
            page.keyboard.press("Escape")
            dialog.wait_for(state="hidden")
            require(page.locator('[data-material-id]').count() == 1,
                    "Escape created a material instead of cancelling")
            require(add_material.evaluate("element => document.activeElement === element"),
                    "Escape did not return focus to the opening control")

            # The reusable component resets state between uses.
            add_material.click()
            dialog.wait_for(state="visible")
            require(not dialog.locator(".editor-dialog-field-error").is_visible(),
                    "Dialog reused a stale validation message")
            require(dialog.locator('[name="value"]').input_value() == "New Reading Material",
                    "Dialog did not reset its field value")
            dialog.locator("[data-editor-dialog-cancel]").click()
            dialog.wait_for(state="hidden")

            # Destructive confirmation focuses the safe action and never deletes on cancel.
            page.locator('[data-tab="quizzes"]').click()
            page.locator("#btn-create-first-quiz").click()
            submit_editor_dialog(page, "Dialog Quiz")
            page.locator("#btn-delete-quiz").click()
            dialog.wait_for(state="visible")
            cancel_button = dialog.locator("[data-editor-dialog-cancel]")
            require(cancel_button.evaluate("element => document.activeElement === element"),
                    "Destructive confirmation did not focus the safe Cancel action")
            require(dialog.locator("[data-editor-dialog-submit]").inner_text() == "Delete quiz",
                    "Destructive confirmation uses a generic action label")
            page.keyboard.press("Escape")
            dialog.wait_for(state="hidden")
            require(page.get_by_role("heading", name="Dialog Quiz").is_visible(),
                    "Escape deleted the quiz")
            require(page.locator("#btn-delete-quiz").evaluate(
                    "element => document.activeElement === element"),
                    "Destructive cancellation did not return focus to the Delete button")

            page.locator("#btn-delete-quiz").click()
            dialog.wait_for(state="visible")
            cancel_button.click()
            dialog.wait_for(state="hidden")
            require(page.get_by_role("heading", name="Dialog Quiz").is_visible(),
                    "Visible Cancel deleted the quiz")

            page.locator("#btn-delete-quiz").click()
            dialog.wait_for(state="visible")
            dialog.locator("[data-editor-dialog-submit]").click()
            dialog.wait_for(state="hidden")
            page.locator("#btn-create-first-quiz").wait_for(state="visible")

            # Acknowledgement mode uses the same shared dialog without a Cancel action.
            page.evaluate("""async () => {
              const { createEditorDialogs } = await import('./assets/dialogs.js');
              const api = createEditorDialogs();
              window.__dialogMessageComplete = false;
              window.__dialogBusySettled = false;
              api.showMessage({
                title: 'Dialog message',
                description: 'Informational acknowledgement test.',
                submitLabel: 'OK'
              }).then(() => { window.__dialogMessageComplete = true; });
              api.requestText({ title: 'Should not open', label: 'Value' }).then((value) => {
                window.__dialogBusyValue = value;
                window.__dialogBusySettled = true;
              });
            }""")
            dialog.wait_for(state="visible")
            page.wait_for_function("window.__dialogBusySettled === true")
            require(page.evaluate("window.__dialogBusyValue") is None,
                    "Concurrent dialog request did not resolve deterministically as cancelled")
            require(dialog.locator("[data-editor-dialog-cancel]").is_hidden(),
                    "Acknowledgement dialog exposed an unnecessary Cancel action")
            dialog.locator("[data-editor-dialog-submit]").click()
            dialog.wait_for(state="hidden")
            page.wait_for_function("window.__dialogMessageComplete === true")

            # Native modal containment and narrow-viewport reflow.
            page.locator('[data-tab="materials"]').click()
            page.locator("#btn-create-material-side").click()
            dialog.wait_for(state="visible")
            for _ in range(8):
                page.keyboard.press("Tab")
                focus_state = dialog.evaluate("""element => ({
                  inside: element.contains(document.activeElement),
                  onDocument: [document.body, document.documentElement].includes(document.activeElement),
                  onBackgroundControl: document.activeElement === document.querySelector('#btn-create-material-side')
                })""")
                require(not focus_state["onBackgroundControl"],
                        "Tab moved focus to the editor control behind the modal dialog")
                require(focus_state["inside"] or focus_state["onDocument"],
                        f"Tab moved focus to unexpected background content: {focus_state}")
            page.set_viewport_size({"width": 360, "height": 640})
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
                    f"Dialog does not reflow within the narrow viewport: {geometry}")
            require(geometry["top"] >= 0 and geometry["bottom"] <= geometry["viewportHeight"] + 1,
                    f"Dialog is clipped vertically in the narrow viewport: {geometry}")
            require(not geometry["horizontalOverflow"],
                    f"Dialog form has horizontal overflow: {geometry}")
            page.keyboard.press("Escape")
            dialog.wait_for(state="hidden")

            # Token-based styling remains resolved in dark mode.
            page.emulate_media(color_scheme="dark")
            page.locator("#btn-create-material-side").click()
            dialog.wait_for(state="visible")
            appearance = dialog.evaluate("""element => {
              const style = getComputedStyle(element);
              return { background: style.backgroundColor, color: style.color };
            }""")
            require(appearance["background"] not in ("rgba(0, 0, 0, 0)", "transparent"),
                    f"Dark-mode dialog background is transparent: {appearance}")
            require(appearance["background"] != appearance["color"],
                    f"Dark-mode dialog text and background resolve identically: {appearance}")
            page.keyboard.press("Escape")

            require(not problems, f"Editor dialog browser errors: {problems}")
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Editor dialog browser tests: PASS")
