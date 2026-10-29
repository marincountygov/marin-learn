#!/usr/bin/env python3
"""Notes in the viewer: the page, copy and share, the checklist, the course card, the deck, and quiz sources."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tests" / "helpers"))
from sample_note_site import serve  # noqa: E402

NOTE = "?set=sample-note-course&view=read&resource=plain-language-101"
SECTIONS = ["Overview", "Why it matters", "Problem", "Solution", "User stories", "Key terms", "Do’s and don’ts",
            "Questions to ask", "Examples", "Checklist", "Mantras", "Sources"]


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def read_html(page) -> str:
    """Read the HTML flavor of the clipboard. Chromium sometimes says the data changed; retry."""
    for attempt in range(5):
        try:
            return page.evaluate("""async () => {
                const items = await navigator.clipboard.read();
                const blob = await items[0].getType('text/html');
                return await blob.text();
            }""")
        except Exception:
            if attempt == 4:
                raise
            page.wait_for_timeout(200)
    return ""


def run() -> None:
    from playwright.sync_api import sync_playwright

    with serve() as base, sync_playwright() as playwright:
        executable = (shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome"))
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            context = browser.new_context(viewport={"width": 1200, "height": 900})
            context.grant_permissions(["clipboard-read", "clipboard-write"], origin=base.rstrip("/"))
            page = context.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda error: errors.append(str(error)))

            # The course shows one Notes card, Slides, and a Quiz.
            page.goto(f"{base}?set=sample-note-course", wait_until="networkidle")
            require(page.locator(".landing-resource-card h3").all_text_contents() == ["Notes", "Slides", "Quiz"],
                    "A course with a Note shows Notes, Slides, and Quiz")
            page.locator(".landing-resource-card h3 a", has_text="Notes").click()
            page.locator("h1", has_text="Plain language 101 notes").wait_for()

            # An old link that names the old reading material opens the Note instead.
            page.goto(f"{base}?set=sample-note-course&view=read&resource=old-reading-material", wait_until="networkidle")
            page.locator("h1", has_text="Plain language 101 notes").wait_for()
            page.goto(f"{base}?set=sample-note-course", wait_until="networkidle")
            page.locator(".landing-resource-card h3 a", has_text="Notes").click()
            page.locator("h1", has_text="Plain language 101 notes").wait_for()

            # Header, breadcrumb, reading time, and the twelve sections in order.
            require(page.locator(".viewer-breadcrumb:visible a").all_text_contents() == ["Catalog", "Sample note course"], "Breadcrumb is wrong")
            require("min read" in page.locator(".note-meta").inner_text(), "Reading time is missing")
            require(page.locator(".note-meta .app-badge").count() == 0 and page.locator(".note-header a.app-badge").count() == 0,
                    "No Note badge, and no theme badges in the header")
            require(page.locator("#note-themes .catalog-card-meta a.app-badge").all_text_contents() == ["Data"], "The course's theme badges sit in a Themes box")
            require(page.locator("#note-themes .catalog-card-meta a.app-badge").first.get_attribute("href") == "?theme=data", "Theme badge should link to its theme page")
            require(page.locator("#note-themes h2").inner_text() == "Themes", "The box is headed Themes")
            require(page.evaluate("document.querySelector('#note-themes').getBoundingClientRect().top >= document.querySelector('.note-section--learnMore').getBoundingClientRect().bottom"),
                    "The Themes box belongs below Sources")
            require(page.locator(".note-main > .catalog-card-meta").count() == 0, "No loose theme badges outside the box")
            require(page.locator(".note-section h2").all_text_contents() == SECTIONS + ["Themes"], "Sections are missing or out of order")
            require(page.locator(".reader-toc a").all_text_contents() == SECTIONS + ["Themes"], "On this page list is wrong")
            require(page.locator("main main").count() == 0, "There must be one main landmark")
            require(page.locator("dl.note-terms dt").count() == 6, "Key terms should be a definition list")
            require(page.locator(".note-pair").count() == 4 and page.locator(".note-do .note-pair-label").first.inner_text() == "Do",
                    "Do and don't pairs should be labeled with text")
            require(page.locator(".note-section--questions ul li").count() == 5 and page.locator(".note-section ol").count() == 0,
                    "Questions should be a bulleted list")
            require(page.locator(".note-section--mantras ul li").count() == 3, "Mantras should be a list")
            require(page.locator(".note-section-header, [data-copy-section]").count() == 0, "No copy button per section")
            order = page.evaluate("""() => [...document.querySelectorAll('.note-actions > .action-group > button, .note-actions > .menu > button')].map((b) => [b.getAttribute('aria-label'), b.textContent.trim(), b.hasAttribute('title'), !!b.querySelector('svg')])""")
            require([o[0] for o in order] == ["Copy link", "Copy note, choose a format", "Print note"], f"The buttons are in the standard order, once, above the note: {order}")
            require(all(o[1] == "" and o[2] and o[3] for o in order), f"Copy link, Copy and Print are icon-only with a title: {order}")
            require(page.locator("[data-note-action]").count() == 2 and page.locator(".note-actions--bottom, #note-status-bottom").count() == 0, "No buttons below the note")
            require(page.locator(".reader-next .app-card p").all_text_contents() == ["Go through the Plain language 101 slides.", "Take the Plain language 101 quiz."],
                    "Slides and Quiz cards need a description from context")
            require(page.locator(".note-section--examples a").first.get_attribute("href") == "https://example.gov/one", "Example link is wrong")
            require(page.locator("#download-pdf").count() == 0, "No PDF button")
            require(page.locator(".reader-next h3").all_text_contents() == ["Slides", "Quiz"], "Slides and Quiz cards belong below the note")

            # On this page: the link for the section being read is bold and marked current.
            def active() -> str:
                return page.locator(".reader-toc a[aria-current='location']").inner_text()
            require(active() == "Overview", "Overview should be current at the top")
            page.locator("#note-mantras").scroll_into_view_if_needed()
            page.evaluate("document.getElementById('note-mantras').scrollIntoView({block: 'start'})")
            page.wait_for_timeout(300)
            require(active() == "Mantras", f"Mantras should be current when it is at the top, got {active()}")
            require(page.locator(".reader-toc a[aria-current='location']").evaluate("el => getComputedStyle(el).fontWeight") in ("700", "bold"), "The current link should be bold")
            require(page.locator(".reader-toc a[aria-current]").count() == 1, "Only one link is current")
            page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)")
            page.wait_for_timeout(300)
            require(active() == "Themes", f"The last section should be current at the bottom, got {active()}")
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(300)
            require(active() == "Overview", "Overview should be current again at the top")

            # Examples: links, then a Code subsection with a focusable, copyable code block.
            require(page.locator(".note-section--examples h3").all_text_contents() == ["Code"], "Examples needs a Code subsection")
            require(page.locator(".note-section--examples ul a").count() == 3, "Example links stay")
            pre = page.locator(".note-section--examples pre")
            require(pre.get_attribute("tabindex") == "0" and pre.get_attribute("role") == "region", "Code must be keyboard reachable")
            require('"requestId": "SR-1042"' in pre.inner_text(), "Code text is missing")
            page.click(".note-code-copy")
            page.locator(".note-code-status", has_text="Code copied").wait_for()
            require(page.evaluate("navigator.clipboard.readText()") == '{\n  "requestId": "SR-1042",\n  "status": "new"\n}', "Copy code copied the wrong text")

            # Copy link, then copy the whole note as Text, HTML and Markdown.
            page.click("[data-note-action=share]")
            page.locator("#note-status", has_text="Link copied").wait_for()
            require(page.evaluate("navigator.clipboard.readText()") == f"{base}{NOTE}", "Copy link copied the wrong link")
            page.click("button[aria-controls=note-copy-panel]")
            require(page.locator("#note-copy-panel button").all_text_contents() == ["Text", "HTML", "Markdown"], "Copy lists Text, HTML and Markdown")
            page.click("#note-copy-panel [data-copy-format=text]")
            page.locator("#note-status", has_text="Copied rich text").wait_for()
            whole = read_html(page)
            copied = page.evaluate("navigator.clipboard.readText()")
            require(copied.startswith("Plain language 101 notes") and "Key terms" in copied and "- Do: Lead with what the reader needs." in copied,
                    f"Copied text is wrong: {copied[:120]!r}")
            require("<h1>Plain language 101 notes</h1>" in whole, "Copied HTML should start with the title")
            require('<table border="1"' in whole and 'href="https://strategy.data.gov/principles/"' in whole and "class=" not in whole,
                    "Pasted HTML should use plain tables, absolute links, and no classes")
            page.click("button[aria-controls=note-copy-panel]")
            page.click("#note-copy-panel [data-copy-format=html]")
            page.locator("#note-status", has_text="Copied HTML").wait_for()
            require(page.evaluate("navigator.clipboard.readText()").startswith("<h1>Plain language 101 notes</h1>"), "Copy HTML copies the source")
            page.click("button[aria-controls=note-copy-panel]")
            page.click("#note-copy-panel [data-copy-format=markdown]")
            page.locator("#note-status", has_text="Copied Markdown").wait_for()
            markdown = page.evaluate("navigator.clipboard.readText()")
            require(markdown.startswith("# Plain language 101 notes\n\n") and "## Key terms\n\n- **" in markdown and "| Do | Don’t |" in markdown and "](https://" in markdown, f"Copy Markdown: {markdown[:160]!r}")

            # Checklist: boxes work from the keyboard, nothing is saved, and the old help text is gone.
            boxes = page.locator("[data-check-index]")
            require(boxes.count() == 5, "Checklist needs five boxes")
            boxes.nth(0).focus()
            page.keyboard.press("Space")
            require(boxes.nth(0).is_checked(), "Space should check a box")
            size = boxes.first.bounding_box()
            require(size["width"] >= 24 and size["height"] >= 24, "Checkboxes need a 24px target")
            require(page.locator("#clear-checklist").count() == 0 and "saved in this browser" not in page.inner_text(".note-main"),
                    "No saved-in-this-browser text or Clear button")
            page.reload(wait_until="networkidle")
            require(not any(page.locator("[data-check-index]").nth(i).is_checked() for i in range(5)), "Checked items must not be saved")
            require("completed" not in page.inner_text(".note-main").lower(), "Nothing should imply formal completion")

            # Layout: the right-hand list on desktop, no sideways scroll on a phone.
            toc = page.locator(".reader-sidebar").bounding_box()
            main = page.locator(".reader-main").bounding_box()
            require(toc["x"] > main["x"], "On this page should be in the right column")
            phone = browser.new_context(viewport={"width": 390, "height": 800}).new_page()
            phone.goto(f"{base}{NOTE}", wait_until="networkidle")
            require(phone.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), "Note scrolls sideways on a phone")

            # Deck: slides show Note sections, with the item range.
            page.goto(f"{base}?set=sample-note-course&view=slides&resource=sample-deck", wait_until="networkidle")
            page.locator("#slide-canvas-el h2", has_text="Key terms").wait_for()
            require("Plain language" in page.locator("#slide-canvas-el").inner_text() and "Jargon" not in page.locator("#slide-canvas-el").inner_text(),
                    "The slide should show items 1 to 3 of the Key terms section")

            # Quiz: the result names the Note section the question came from.
            page.goto(f"{base}?set=sample-note-course&view=quiz&resource=sample-quiz", wait_until="networkidle")
            page.locator(".quiz-options-group input").first.check(force=True)
            page.locator("#submit-quiz:not([disabled])").click()
            page.locator(".quiz-results-hero").wait_for()
            require("Key terms" in page.locator(".quiz-source-link").inner_text(), "Quiz source should name the Note section")
            require(errors == [], f"Page errors: {errors}")
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Notes viewer: PASS")
