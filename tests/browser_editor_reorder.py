#!/usr/bin/env python3
"""Exercise pointer reordering and its keyboard-operable alternatives in /editor/."""
from __future__ import annotations

from contextlib import contextmanager
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "tests" / "fixtures" / "reference-package" / "marinos-foundations.zip"

MATERIAL_ID = "urn:uuid:10000000-0000-4000-8000-000000000022"
SECTION_FOUNDATIONS = "urn:uuid:10000000-0000-4000-8000-000000000020"
SECTION_PRACTICE = "urn:uuid:10000000-0000-4000-8000-000000000021"
UNIT_OVERVIEW = "urn:uuid:10000000-0000-4000-8000-000000000010"
UNIT_CORE = "urn:uuid:10000000-0000-4000-8000-000000000011"
UNIT_SHELL = "urn:uuid:10000000-0000-4000-8000-000000000012"
UNIT_SINGLE_SOURCE = "urn:uuid:10000000-0000-4000-8000-000000000013"

QUIZ_ID = "urn:uuid:10000000-0000-4000-8000-000000000031"
QUESTION_ONE = "urn:uuid:10000000-0000-4000-8000-000000000040"
QUESTION_TWO = "urn:uuid:10000000-0000-4000-8000-000000000041"
QUESTION_TRUE_FALSE = "urn:uuid:10000000-0000-4000-8000-000000000047"
CHOICE_ONE = "urn:uuid:10000000-0000-4000-8000-000000000100"
CHOICE_TWO = "urn:uuid:10000000-0000-4000-8000-000000000101"
CHOICE_FOUR = "urn:uuid:10000000-0000-4000-8000-000000000103"

DECK_ID = "urn:uuid:10000000-0000-4000-8000-000000000067"
SLIDE_ONE = "urn:uuid:10000000-0000-4000-8000-000000000060"
SLIDE_TWO = "urn:uuid:10000000-0000-4000-8000-000000000061"


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


def import_fixture(page, base_url: str) -> None:
    page.goto(f"{base_url}editor/", wait_until="networkidle")
    page.locator("#file-import-zip").set_input_files(str(PACKAGE))
    page.locator("#workspace-view").wait_for(state="visible")


def stored_sequence(page, object_id: str, property_name: str) -> list[str]:
    return page.evaluate(
        """async ({objectId, propertyName}) => {
          const storageUrl = new URL('../js/storage.js', location.href).href;
          const {loadWorkspace} = await import(storageUrl);
          const record = await loadWorkspace();
          const object = record?.pkg?.graphDocument?.['@graph']
            ?.find(candidate => candidate?.['@id'] === objectId);
          return [...(object?.[propertyName]?.itemListElement || [])]
            .sort((a, b) => Number(a.position) - Number(b.position))
            .map(entry => entry.item?.['@id'])
            .filter(Boolean);
        }""",
        {"objectId": object_id, "propertyName": property_name},
    )


def direct_item_ids(locator) -> list[str]:
    return locator.locator(":scope > [data-sort-item-id]").evaluate_all(
        "items => items.map(item => item.dataset.sortItemId)"
    )


def require_no_horizontal_overflow(page, label: str) -> None:
    dimensions = page.evaluate(
        "() => ({scrollWidth: document.documentElement.scrollWidth, innerWidth})"
    )
    require(
        dimensions["scrollWidth"] <= dimensions["innerWidth"] + 1,
        f"{label} has horizontal overflow: {dimensions}",
    )


def drag_to(page, source_handle, target_surface, *, target_y_ratio: float = 0.18) -> None:
    """Drag a handle to a point on a target item/list and verify the insertion cue."""
    target_surface.scroll_into_view_if_needed()
    source_handle.scroll_into_view_if_needed()
    page.wait_for_timeout(75)

    source_box = source_handle.bounding_box()
    require(source_box is not None, "Drag source is not rendered")

    start_x = source_box["x"] + source_box["width"] / 2
    start_y = source_box["y"] + source_box["height"] / 2

    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(start_x + 10, start_y + 10, steps=3)
    page.wait_for_timeout(75)

    # The source list can contract after the dragged item becomes a ghost.
    # Resolve the target geometry only after drag mode has started.
    target_box = target_surface.bounding_box()
    require(target_box is not None, "Drag target is not rendered")
    target_x = target_box["x"] + min(max(target_box["width"] * 0.5, 8), target_box["width"] - 8)
    target_y = target_box["y"] + min(
        max(target_box["height"] * target_y_ratio, 4),
        target_box["height"] - 4,
    )
    page.mouse.move(target_x, target_y, steps=18)
    page.wait_for_timeout(100)

    placeholder = page.locator(".editor-drag-placeholder")
    require(placeholder.count() == 1, "Dragging did not produce an insertion indicator")
    require(bool(placeholder.get_attribute("data-drop-label")),
            "Insertion indicator does not identify the drop result")

    page.mouse.up()
    page.locator("#editor-status-message .editor-status-action").wait_for(state="visible")


def undo_last_move(page) -> None:
    page.locator("#editor-status-message .editor-status-action").click()
    page.locator("#editor-status-message .editor-status-text").filter(has_text="undone").wait_for()


def test_reading_materials(page) -> None:
    page.locator('[data-tab="materials"]').click()
    root_list = page.locator(
        f'.editor-reading-sortable-list[data-sort-container-id="{MATERIAL_ID}"]'
    )
    foundations_list = page.locator(
        f'.editor-reading-sortable-list[data-sort-container-id="{SECTION_FOUNDATIONS}"]'
    )
    practice_list = page.locator(
        f'.editor-reading-sortable-list[data-sort-container-id="{SECTION_PRACTICE}"]'
    )

    require(direct_item_ids(root_list) == [SECTION_FOUNDATIONS, SECTION_PRACTICE],
            "Reading-material root order is not the fixture order")
    require(direct_item_ids(foundations_list)[:3] == [UNIT_OVERVIEW, UNIT_CORE, UNIT_SHELL],
            "Foundations content order is not the fixture order")

    core_item = page.locator(
        f'.editor-reading-sortable-item[data-sort-item-id="{UNIT_CORE}"]'
    )
    core_handle = core_item.locator(":scope > .editor-block-header .editor-reading-drag-handle")
    require("Drag to reorder content Core principles" in (core_handle.get_attribute("aria-label") or ""),
            "Reading content drag handle lacks a contextual accessible name")

    # Move content out of its section to document level, immediately before the second section.
    practice_header = page.locator(
        f'.editor-reading-sortable-item[data-sort-item-id="{SECTION_PRACTICE}"]'
        " > .editor-section-header"
    )
    drag_to(page, core_handle, practice_header, target_y_ratio=0.08)
    actual_root = direct_item_ids(root_list)
    require(actual_root == [SECTION_FOUNDATIONS, UNIT_CORE, SECTION_PRACTICE],
            f"Content was not moved out to document level: root={actual_root}, practice={direct_item_ids(practice_list)}, foundations={direct_item_ids(foundations_list)}, status={page.locator('#editor-status-message').inner_text()}")
    require(stored_sequence(page, MATERIAL_ID, "marin:contentSequence")
            == [SECTION_FOUNDATIONS, UNIT_CORE, SECTION_PRACTICE],
            "Document-level content move was not saved")
    undo_last_move(page)
    require(direct_item_ids(root_list) == [SECTION_FOUNDATIONS, SECTION_PRACTICE],
            "Undo did not restore the document-level order")
    require(direct_item_ids(foundations_list)[:3] == [UNIT_OVERVIEW, UNIT_CORE, UNIT_SHELL],
            "Undo did not restore content to its original section")

    # Move content between sections.
    core_handle = page.locator(
        f'.editor-reading-sortable-item[data-sort-item-id="{UNIT_CORE}"]'
        " > .editor-block-header .editor-reading-drag-handle"
    )
    practice_first_header = page.locator(
        f'.editor-reading-sortable-item[data-sort-item-id="{UNIT_SINGLE_SOURCE}"]'
        " > .editor-block-header"
    )
    drag_to(page, core_handle, practice_first_header, target_y_ratio=0.08)
    require(direct_item_ids(practice_list)[0] == UNIT_CORE,
            "Content was not moved between sections")
    require(stored_sequence(page, SECTION_PRACTICE, "marin:contentSequence")[0] == UNIT_CORE,
            "Cross-section content move was not saved")
    undo_last_move(page)
    require(UNIT_CORE not in direct_item_ids(practice_list),
            "Undo left moved content in the destination section")

    # Nest a section inside another section; the same mechanism enforces depth and cycle rules.
    practice_handle = page.locator(
        f'.editor-reading-sortable-item[data-sort-item-id="{SECTION_PRACTICE}"]'
        " > .editor-section-header .editor-reading-drag-handle"
    )
    shell_header = page.locator(
        f'.editor-reading-sortable-item[data-sort-item-id="{UNIT_SHELL}"]'
        " > .editor-block-header"
    )
    drag_to(page, practice_handle, shell_header, target_y_ratio=0.82)
    require(direct_item_ids(root_list) == [SECTION_FOUNDATIONS],
            "Nested section remained at document level")
    require(direct_item_ids(foundations_list)[-1] == SECTION_PRACTICE,
            "Section was not nested inside the destination section")
    require(stored_sequence(page, SECTION_FOUNDATIONS, "marin:contentSequence")[-1]
            == SECTION_PRACTICE, "Nested section move was not saved")
    undo_last_move(page)
    require(direct_item_ids(root_list) == [SECTION_FOUNDATIONS, SECTION_PRACTICE],
            "Undo did not restore a nested section to document level")

    # The keyboard-operable structural commands remain available.
    core_more = page.locator(
        f'.editor-reading-sortable-item[data-sort-item-id="{UNIT_CORE}"]'
        " .editor-action-menu > summary"
    )
    core_more.click()
    require(page.locator(
        f'button[data-action="move-up"][data-id="{UNIT_CORE}"]'
    ).count() == 1, "Reading-item Move up command was removed")
    require(page.locator(
        f'button[data-action="move-out"][data-id="{UNIT_CORE}"]'
    ).count() == 1, "Reading-item Move out command was removed")
    page.keyboard.press("Escape")

    # Editing one content unit disables outer structural dragging until the edit is complete.
    page.locator(
        f'button[data-action="edit-unit"][data-id="{UNIT_CORE}"]'
    ).click()
    page.locator("#btn-choice-edit-everywhere").click()
    require(page.locator(".editor-reading-drag-handle:not(:disabled)").count() == 0,
            "Reading-material drag handles stayed active during content editing")
    page.locator("#btn-cancel-unit").click()


def test_quizzes(page) -> None:
    page.locator('[data-tab="quizzes"]').click()
    question_list = page.locator(
        f'.editor-question-sortable-list[data-sort-container-id="{QUIZ_ID}"]'
    )
    initial_questions = direct_item_ids(question_list)
    require(initial_questions[:2] == [QUESTION_ONE, QUESTION_TWO],
            "Quiz question order is not the fixture order")

    question_two = page.locator(
        f'.editor-question-sortable-item[data-sort-item-id="{QUESTION_TWO}"]'
    )
    question_two_handle = question_two.locator(
        ":scope > .editor-block-header .editor-question-drag-handle"
    )
    question_one_header = page.locator(
        f'.editor-question-sortable-item[data-sort-item-id="{QUESTION_ONE}"]'
        " > .editor-block-header"
    )
    require("Drag to reorder question 2" in (question_two_handle.get_attribute("aria-label") or ""),
            "Question drag handle lacks a contextual accessible name")
    drag_to(page, question_two_handle, question_one_header, target_y_ratio=0.08)
    require(direct_item_ids(question_list)[:2] == [QUESTION_TWO, QUESTION_ONE],
            "Question drag did not update assessment order")
    require(stored_sequence(page, QUIZ_ID, "marin:itemSequence")[:2]
            == [QUESTION_TWO, QUESTION_ONE], "Question drag was not saved")
    require(page.locator(
        f'button[data-action="move-q-down"][data-id="{QUESTION_TWO}"]'
    ).count() == 1, "Question Up/Down controls were removed")
    undo_last_move(page)
    require(direct_item_ids(question_list) == initial_questions,
            "Question undo did not restore the original order")

    # Answer-choice dragging operates inside the edit form and preserves unsaved form values.
    page.locator(
        f'button[data-action="edit-question"][data-id="{QUESTION_ONE}"]'
    ).click()
    require(page.locator(".editor-question-drag-handle:not(:disabled)").count() == 0,
            "Question drag handles stayed active while a question was being edited")
    require(page.locator(".editor-choice-drag-handle:not(:disabled)").count() > 0,
            "Editable answer choices do not expose drag handles")
    prompt = page.locator("#q-edit-text")
    prompt.fill("Unsaved question text must survive choice reordering")
    choice_list = page.locator(
        f'.editor-choice-sortable-list[data-sort-container-id="{QUESTION_ONE}"]'
    )
    initial_choices = direct_item_ids(choice_list)
    require(initial_choices[0] == CHOICE_ONE and initial_choices[-1] == CHOICE_FOUR,
            "Answer-choice order is not the fixture order")

    choice_four_handle = page.locator(
        f'.editor-choice-sortable-item[data-sort-item-id="{CHOICE_FOUR}"]'
        " > .editor-choice-drag-handle"
    )
    choice_one_row = page.locator(
        f'.editor-choice-sortable-item[data-sort-item-id="{CHOICE_ONE}"]'
    )
    drag_to(page, choice_four_handle, choice_one_row, target_y_ratio=0.08)
    require(direct_item_ids(choice_list)[0] == CHOICE_FOUR,
            "Answer choice was not moved to the first position")
    require(stored_sequence(page, QUESTION_ONE, "marin:options")[0] == CHOICE_FOUR,
            "Answer-choice drag was not saved")
    require(prompt.input_value() == "Unsaved question text must survive choice reordering",
            "Choice reordering discarded unsaved question text")
    require(page.locator('[data-choice-action="move-up"]').count() == len(initial_choices),
            "Keyboard-operable answer-choice move controls are missing")
    undo_last_move(page)
    require(direct_item_ids(choice_list) == initial_choices,
            "Answer-choice undo did not restore the original order")
    require(prompt.input_value() == "Unsaved question text must survive choice reordering",
            "Answer-choice undo discarded unsaved question text")

    # The explicit move controls remain a fully operable keyboard alternative.
    choice_two_up = page.locator(
        f'.editor-choice-sortable-item[data-sort-item-id="{CHOICE_TWO}"] '
        '[data-choice-action="move-up"]'
    )
    choice_two_up.focus()
    page.keyboard.press("Enter")
    page.locator("#editor-status-message .editor-status-action").wait_for(state="visible")
    require(direct_item_ids(choice_list)[:2] == [CHOICE_TWO, CHOICE_ONE],
            "Keyboard answer-choice move did not update the order")
    require(prompt.input_value() == "Unsaved question text must survive choice reordering",
            "Keyboard answer-choice move discarded unsaved question text")
    undo_last_move(page)
    require(direct_item_ids(choice_list) == initial_choices,
            "Keyboard answer-choice undo did not restore the original order")
    page.locator("#btn-cancel-question").click()

    # True/false order is intentionally fixed.
    page.locator(
        f'button[data-action="edit-question"][data-id="{QUESTION_TRUE_FALSE}"]'
    ).click()
    require(page.locator(".editor-choice-drag-handle").count() == 0,
            "True/false choices unexpectedly have drag handles")
    require(page.locator("[data-choice-action]").count() == 0,
            "True/false choices unexpectedly have move controls")
    require(page.get_by_text("True and False stay in this order.", exact=True).is_visible(),
            "True/false fixed-order explanation is missing")
    page.locator("#btn-cancel-question").click()


def test_slides(page) -> None:
    page.locator('[data-tab="slides"]').click()
    slide_list = page.locator(
        f'.editor-slide-sortable-list[data-sort-container-id="{DECK_ID}"]'
    )
    initial_slides = direct_item_ids(slide_list)
    require(initial_slides[:2] == [SLIDE_ONE, SLIDE_TWO],
            "Slide order is not the fixture order")

    slide_two_handle = page.locator(
        f'.editor-slide-sortable-item[data-sort-item-id="{SLIDE_TWO}"]'
        " > .editor-block-header .editor-slide-drag-handle"
    )
    slide_one_header = page.locator(
        f'.editor-slide-sortable-item[data-sort-item-id="{SLIDE_ONE}"]'
        " > .editor-block-header"
    )
    require("Drag to reorder slide 2" in (slide_two_handle.get_attribute("aria-label") or ""),
            "Slide drag handle lacks a contextual accessible name")
    drag_to(page, slide_two_handle, slide_one_header, target_y_ratio=0.08)
    require(direct_item_ids(slide_list)[:2] == [SLIDE_TWO, SLIDE_ONE],
            "Slide drag did not update presentation order")
    require(stored_sequence(page, DECK_ID, "marin:slideSequence")[:2]
            == [SLIDE_TWO, SLIDE_ONE], "Slide drag was not saved")
    require(page.locator(
        f'button[data-action="move-s-down"][data-id="{SLIDE_TWO}"]'
    ).count() == 1, "Slide Up/Down controls were removed")
    undo_last_move(page)
    require(direct_item_ids(slide_list) == initial_slides,
            "Slide undo did not restore the original order")

    page.locator(
        f'button[data-action="edit-slide"][data-id="{SLIDE_ONE}"]'
    ).click()
    require(page.locator(".editor-slide-drag-handle:not(:disabled)").count() == 0,
            "Slide drag handles stayed active while a slide was being edited")
    page.locator("#btn-cancel-slide").click()


def run() -> None:
    from playwright.sync_api import sync_playwright

    with serve() as base_url, sync_playwright() as playwright:
        executable = (shutil.which("chromium") or shutil.which("chromium-browser")
                      or shutil.which("google-chrome"))
        options = {
            "headless": True,
            "args": ["--no-sandbox", "--disable-dev-shm-usage"],
        }
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            context = browser.new_context(
                viewport={"width": 1600, "height": 2200},
                color_scheme="light",
            )
            problems = configure(context, base_url)
            page = context.new_page()
            import_fixture(page, base_url)

            test_reading_materials(page)
            test_quizzes(page)
            test_slides(page)

            require(not problems, f"Browser errors: {problems}")
            context.close()

            # Reflow and dark-mode regression pass for the new handles and choice actions.
            mobile_context = browser.new_context(
                viewport={"width": 390, "height": 844},
                color_scheme="dark",
            )
            mobile_problems = configure(mobile_context, base_url)
            mobile_page = mobile_context.new_page()
            import_fixture(mobile_page, base_url)
            mobile_page.locator('[data-tab="materials"]').click()
            require_no_horizontal_overflow(mobile_page, "Reading Materials at 390 CSS pixels")
            mobile_page.locator('[data-tab="quizzes"]').click()
            mobile_page.locator(
                f'button[data-action="edit-question"][data-id="{QUESTION_ONE}"]'
            ).click()
            require_no_horizontal_overflow(mobile_page, "Quiz choice editor at 390 CSS pixels")
            mobile_page.locator("#btn-cancel-question").click()
            mobile_page.locator('[data-tab="slides"]').click()
            require_no_horizontal_overflow(mobile_page, "Slides at 390 CSS pixels")
            require(not mobile_problems, f"Mobile/dark browser errors: {mobile_problems}")
            mobile_context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Editor reorder browser test: PASS")
