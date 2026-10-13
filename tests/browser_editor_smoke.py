#!/usr/bin/env python3
"""Smoke-test the Marin Learn editor's repaired core workflows."""
from __future__ import annotations

from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
from threading import Thread
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def submit_editor_dialog(page, value: str, *, field_name: str = "value", press_enter: bool = False) -> None:
    """Fill and submit the shared native editor dialog."""
    dialog = page.locator("#editor-shared-dialog")
    dialog.wait_for(state="visible")
    field = dialog.locator(f'[name="{field_name}"]')
    field.fill(value)
    if press_enter:
        field.press("Enter")
    else:
        dialog.locator("[data-editor-dialog-submit]").click()
    dialog.wait_for(state="hidden")


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
    context.set_default_timeout(10_000)
    context.set_default_navigation_timeout(15_000)

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


def tab_navigation_appearance(page) -> dict:
    """Return layout and overflow details for the primary editor tab list."""
    return page.locator(".editor-nav-tabs").evaluate("""tablist => {
      const style = getComputedStyle(tablist);
      const active = tablist.querySelector('.editor-tab-btn.active');
      const activeStyle = getComputedStyle(active);
      const activeRule = getComputedStyle(active, '::after');
      return {
        display: style.display,
        columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clientWidth: tablist.clientWidth,
        scrollWidth: tablist.scrollWidth,
        clientHeight: tablist.clientHeight,
        scrollHeight: tablist.scrollHeight,
        tabDisplay: activeStyle.display,
        tabAlignItems: activeStyle.alignItems,
        tabJustifyContent: activeStyle.justifyContent,
        tabBorderRadius: activeStyle.borderRadius,
        activeRuleHeight: activeRule.height,
        activeRuleBorderRadius: activeRule.borderRadius
      };
    }""")


def require_tab_navigation(page, expected_columns: int, label: str) -> None:
    """Assert that editor tabs reflow without either-axis scrolling."""
    appearance = tab_navigation_appearance(page)
    require(appearance["display"] == "grid",
            f"{label} tab list should use a responsive grid: {appearance}")
    require(appearance["columns"] == expected_columns,
            f"{label} tab list should have {expected_columns} columns: {appearance}")
    require(appearance["overflowX"] == "visible" and appearance["overflowY"] == "visible",
            f"{label} tab list should not create a scroll container: {appearance}")
    require(appearance["scrollWidth"] <= appearance["clientWidth"] + 1,
            f"{label} tab list overflows horizontally: {appearance}")
    require(appearance["scrollHeight"] <= appearance["clientHeight"] + 1,
            f"{label} tab list overflows vertically: {appearance}")
    require(appearance["tabDisplay"] == "flex"
            and appearance["tabAlignItems"] == "center"
            and appearance["tabJustifyContent"] == "center",
            f"{label} tab labels should be centered in both axes: {appearance}")
    require(appearance["tabBorderRadius"] == "0px"
            and appearance["activeRuleBorderRadius"] == "0px",
            f"{label} active underline should have square ends: {appearance}")
    require(appearance["activeRuleHeight"] == "3px",
            f"{label} active underline should remain visible: {appearance}")


def sidebar_appearance(page, panel_id: str) -> dict:
    """Return the computed visual contract for an authoring resource sidebar."""
    return page.locator(f"#{panel_id} .editor-materials-sidebar").evaluate("""sidebar => {
      const style = getComputedStyle(sidebar);
      const heading = sidebar.querySelector('h4');
      const active = sidebar.querySelector('.editor-subnav-btn.active');
      const action = sidebar.querySelector('.editor-sidebar-action');
      const headingStyle = getComputedStyle(heading);
      const activeStyle = getComputedStyle(active);
      const actionStyle = getComputedStyle(action);
      return {
        position: style.position,
        appearance: {
          backgroundColor: style.backgroundColor,
          borderTopStyle: style.borderTopStyle,
          borderTopWidth: style.borderTopWidth,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          paddingTop: style.paddingTop,
          paddingRight: style.paddingRight,
          paddingBottom: style.paddingBottom,
          paddingLeft: style.paddingLeft,
          headingColor: headingStyle.color,
          headingFontSize: headingStyle.fontSize,
          headingLetterSpacing: headingStyle.letterSpacing,
          headingTextTransform: headingStyle.textTransform,
          activeBackgroundColor: activeStyle.backgroundColor,
          activeColor: activeStyle.color,
          activeBorderInlineStartColor: activeStyle.borderInlineStartColor,
          activeBorderRadius: activeStyle.borderRadius,
          actionBackgroundColor: actionStyle.backgroundColor,
          actionColor: actionStyle.color,
          actionBorderTopStyle: actionStyle.borderTopStyle,
          actionBorderRadius: actionStyle.borderRadius
        }
      };
    }""")


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
            context = browser.new_context(accept_downloads=True)
            problems = configure(context, base_url)
            page = context.new_page()
            page.goto(f"{base_url}editor/", wait_until="networkidle")
            require(page.locator(".app-icon svg path").count() == 6,
                    "Marin Learn Authoring notebook-pen icon did not render")

            require(page.locator("#welcome-view").is_visible(), "Welcome view is not visible")
            require(not page.locator("#workspace-view").is_visible(), "Workspace should be hidden initially")
            require(not page.locator("#create-form-container").is_visible(), "Create form should be hidden initially")

            page.locator("#btn-new-project").click()
            require(page.locator("#create-form-container").is_visible(), "Create form did not open")
            page.locator("#new-proj-title").fill("Editor Smoke Test")
            page.locator("#new-proj-desc").fill("A browser workflow fixture.")
            page.locator("#btn-submit-create").click()
            page.locator("#workspace-view").wait_for(state="visible")
            require(not page.locator("#welcome-view").is_visible(), "Welcome view stayed visible")

            page.set_viewport_size({"width": 1280, "height": 720})
            require_tab_navigation(page, 6, "Desktop")
            page.set_viewport_size({"width": 760, "height": 720})
            require_tab_navigation(page, 3, "Narrow")
            page.set_viewport_size({"width": 390, "height": 844})
            require_tab_navigation(page, 2, "Small-screen")
            page.set_viewport_size({"width": 1280, "height": 720})

            # Each panel is named by its tab; avoid redundant visible headings, and
            # focus the labeled panel after activation (including on small screens).
            for name in ("overview", "materials", "quizzes", "slides", "assets", "export"):
                page.locator(f'#tab-button-{name}').click()
                panel = page.locator(f'#tab-{name}')
                require(panel.locator(":scope > h3").count() == 0,
                        f"{name} tab should not repeat its label as a visible heading")
                require(panel.get_attribute("aria-labelledby") == f"tab-button-{name}",
                        f"{name} panel should retain its accessible tab label")
                require(panel.get_attribute("tabindex") == "-1",
                        f"{name} panel must be programmatically focusable")
                require(panel.evaluate("element => document.activeElement === element"),
                        f"{name} tab activation should focus the labeled panel")
            require(page.locator("#tab-overview > .editor-intro-text").count() == 0,
                    "Overview should not repeat introductory text above its task cards")
            page.locator('[data-tab="materials"]').click()
            page.locator("#btn-create-first-material").click()
            submit_editor_dialog(page, "Employee Orientation")
            page.get_by_role("heading", name="Employee Orientation").wait_for()

            page.locator(".editor-action-menu--root-add > summary").click()
            require(page.locator("#btn-add-content-unit").is_visible(), "Root Add menu did not open")
            page.locator("#btn-add-content-unit").click()
            submit_editor_dialog(page, "Welcome to the County")
            page.locator(".editor-rich-surface").wait_for(state="visible")
            page.locator("#unit-abstract").fill("A short welcome for new employees.")
            page.locator(".editor-rich-surface").evaluate("""element => {
              element.innerHTML = '<p>Welcome to County service.</p><h2>What to know</h2><ul><li>Public service matters.</li></ul>';
              element.dispatchEvent(new InputEvent('input', {bubbles: true, inputType: 'insertText'}));
            }""")
            page.locator("#btn-save-unit").click()
            page.get_by_text("A short welcome for new employees.", exact=False).wait_for()
            require(page.locator(".editor-content-block .editor-primary-item-action").is_visible(),
                    "Edit action should remain visible on a content item")
            content_more = page.locator(".editor-content-block .editor-action-menu > summary").first
            require(content_more.is_visible(),
                    "More actions disclosure should remain visible on a content item")
            require("Welcome to the County" in (content_more.get_attribute("aria-label") or ""),
                    "More actions disclosure needs a contextual accessible name")
            content_more.click()
            duplicate_action = page.locator('button[data-action="duplicate-unit"]').first
            require(duplicate_action.is_visible(), "Content More menu did not open")
            page.keyboard.press("Escape")
            require(not duplicate_action.is_visible(), "Escape did not close the content More menu")
            require(content_more.evaluate("element => document.activeElement === element"),
                    "Escape did not return focus to the content More disclosure")

            page.locator('[data-tab="export"]').click()
            page.locator("#btn-run-validation").click()
            require(page.locator("#validation-results .app-alert--danger").count() == 0,
                    "New valid content produced blocking validation errors")
            require(page.get_by_role("heading", name="No issues found", exact=True).is_visible(),
                    "Valid project status did not show the success heading")
            require(page.get_by_text("This learning package has no blocking errors or warnings.", exact=True).is_visible(),
                    "Valid project status did not show the no-issues message")

            with page.expect_download() as download_info:
                page.locator("#btn-export-zip").click()
            download = download_info.value
            output = Path(download.path())
            with zipfile.ZipFile(output) as archive:
                names = set(archive.namelist())
                require("learning.json" in names, "Export is missing learning.json")
                content_names = sorted(name for name in names if name.startswith("content/") and name.endswith(".md"))
                require(len(content_names) == 1, f"Expected one Markdown file, got {content_names}")
                markdown = archive.read(content_names[0]).decode("utf-8")
                require("Welcome to County service." in markdown, "Edited Markdown was not exported")
                graph = json.loads(archive.read("learning.json"))
                types = [value for obj in graph["@graph"] for value in obj.get("@type", [])]
                require("marin:LearningMaterial" in types, "Material is missing from the graph")
                require("marin:ContentUnit" in types, "ContentUnit is missing from the graph")
            context.close()

            context = browser.new_context(accept_downloads=True)
            problems.extend(configure(context, base_url))
            page = context.new_page()
            page.goto(f"{base_url}editor/", wait_until="networkidle")
            page.locator("#file-import-zip").set_input_files(str(ROOT / "packages" / "marinos-foundations.zip"))
            page.locator("#workspace-view").wait_for(state="visible")
            page.locator('[data-tab="materials"]').click()
            page.get_by_text("MarinOS Foundations", exact=True).wait_for()
            materials_sidebar = sidebar_appearance(page, "tab-materials")
            require(materials_sidebar["position"] == "sticky",
                    f"Reading Materials sidebar should be sticky: {materials_sidebar}")

            shared_card = page.locator('.editor-content-block').filter(has_text='The Marin App Shell').first
            shared_card.locator('button[data-action="edit-unit"]').click()
            page.locator('.editor-shared-prompt-content').wait_for(state='visible')
            usage_labels = page.locator('.editor-usage-list li').all_text_contents()
            require(any('(Section)' in label for label in usage_labels),
                    f"Shared prompt is missing the Section label: {usage_labels}")
            require(any('(Question)' in label for label in usage_labels),
                    f"Shared prompt is missing the Question label: {usage_labels}")
            require(any('(Slide)' in label for label in usage_labels),
                    f"Shared prompt is missing the Slide label: {usage_labels}")
            require(not any('marin:' in label for label in usage_labels),
                    f"Shared prompt exposed schema type names: {usage_labels}")
            page.locator('#btn-choice-cancel').click()

            page.locator('[data-tab="quizzes"]').click()
            require(page.locator("#quizzes-list-container .editor-item-card").count() >= 1,
                    "Imported quiz was not found")
            quiz_sidebar = sidebar_appearance(page, "tab-quizzes")
            require(quiz_sidebar["position"] == "static",
                    f"Quiz sidebar should not be sticky: {quiz_sidebar}")
            require(quiz_sidebar["appearance"] == materials_sidebar["appearance"],
                    f"Quiz sidebar differs from Reading Materials: {quiz_sidebar} != {materials_sidebar}")
            require(page.locator("#tab-quizzes .editor-subnav-icon").count() == 0,
                    "Quiz navigation should not add a decorative icon absent from Reading Materials")
            require(page.locator("#btn-create-quiz-side.editor-sidebar-action").count() == 1,
                    "Quiz add action should use the shared sidebar action treatment")

            page.locator('[data-tab="slides"]').click()
            require(page.locator("#slides-list-container .editor-item-card").count() >= 1,
                    "Imported slide deck was not found")
            slide_sidebar = sidebar_appearance(page, "tab-slides")
            require(slide_sidebar["position"] == "static",
                    f"Slide Deck sidebar should not be sticky: {slide_sidebar}")
            require(slide_sidebar["appearance"] == materials_sidebar["appearance"],
                    f"Slide Deck sidebar differs from Reading Materials: {slide_sidebar} != {materials_sidebar}")
            require(page.locator("#tab-slides .editor-subnav-icon").count() == 0,
                    "Slide Deck navigation should not add a decorative icon absent from Reading Materials")
            require(page.locator("#btn-create-deck-side.editor-sidebar-action").count() == 1,
                    "Slide Deck add action should use the shared sidebar action treatment")

            require(not problems, f"Browser errors: {problems}")
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Editor browser smoke test: PASS")
