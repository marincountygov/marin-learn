#!/usr/bin/env python3
"""Exercise the browser PowerPoint export workflow.

Default mode serves the exact checked-in application and CSP over HTTP. The optional
``--in-memory`` mode inlines the same source graph for restricted test environments
that block all browser navigation; it still runs real Chromium PPTX generation, but
leaves same-origin runtime loading and deployed CSP enforcement to the default mode.
"""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager, nullcontext
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
import re
import shutil
from threading import Thread
import time
from urllib.parse import urlsplit
import zipfile

from html_fixture import remove_from_html

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


def configure(context, base_url: str | None) -> tuple[list[str], list[str]]:
    problems: list[str] = []
    requests: list[str] = []
    context.set_default_timeout(30_000)
    context.set_default_navigation_timeout(30_000)

    def route_request(route) -> None:
        url = route.request.url
        requests.append(url)
        if base_url and url.startswith(base_url):
            if url.endswith("/vendor/pptxgenjs/pptxgen.bundle.js"):
                time.sleep(0.25)
            route.continue_()
            return
        if url == "https://marincountygov.github.io/marin-os/catalog.json":
            route.fulfill(status=200, content_type="application/json", body="[]",
                          headers={"Access-Control-Allow-Origin": "*"})
            return
        if url.endswith("/marin-os/data/lighthouse.json") or url.endswith("/marin-os/data/tech.json"):
            route.fulfill(status=200, content_type="application/json", body="{}",
                          headers={"Access-Control-Allow-Origin": "*"})
            return
        if url.startswith("https://api.github.com/"):
            route.fulfill(status=200, content_type="application/json", body="[]",
                          headers={"Access-Control-Allow-Origin": "*"})
            return
        route.abort()

    context.route("**/*", route_request)

    def watch_page(page) -> None:
        page.on("pageerror", lambda error: problems.append(str(error)))
        page.on(
            "console",
            lambda message: problems.append(f"console {message.type}: {message.text}")
            if message.type == "error" else None,
        )

    context.on("page", watch_page)
    return problems, requests


def data_module(source: str) -> str:
    encoded = base64.b64encode(source.encode("utf-8")).decode("ascii")
    return f"data:text/javascript;base64,{encoded}"


def inline_module(path: Path, cache: dict[Path, str] | None = None) -> str:
    cache = {} if cache is None else cache
    path = path.resolve()
    path.relative_to(ROOT.resolve())
    if path in cache:
        return cache[path]

    if path == (ROOT / "js/storage.js").resolve():
        source = """
          let record = null;
          export async function saveWorkspace(pkg) {
            record = {key: 'current', savedAt: new Date().toISOString(), pkg};
            return record;
          }
          export async function loadWorkspace() { return record; }
          export async function clearWorkspace() { record = null; }
        """
    elif path == (ROOT / "js/pptx/runtime-browser.js").resolve():
        source = """
          export const PPTXGENJS_VERSION = '4.0.0';
          export const JSZIP_VERSION = '3.10.1';
          export const PPTX_RUNTIME_URL = 'in-memory-reviewed-runtime';
          export function runtimeFromGlobal(globalObject = globalThis) {
            const PptxGenJS = globalObject?.PptxGenJS;
            const JSZip = globalObject?.JSZip;
            if (typeof PptxGenJS !== 'function' || typeof JSZip !== 'function') return null;
            return {PptxGenJS, JSZip, source: 'in-memory-reviewed-runtime'};
          }
          export async function loadBrowserPptxRuntime() {
            const runtime = runtimeFromGlobal(globalThis);
            if (!runtime) throw new Error('The in-memory browser test has not installed the reviewed runtime.');
            return runtime;
          }
        """
    else:
        source = path.read_text(encoding="utf-8")

    def replace_import(match):
        target = (path.parent / match.group("target")).resolve()
        if target.suffix not in {".js", ".mjs"}:
            raise ValueError(f"Unexpected module import: {target}")
        return f"{match.group('prefix')}{match.group('quote')}{inline_module(target, cache)}{match.group('quote')}"

    source = re.sub(
        r"(?P<prefix>\bfrom\s*)(?P<quote>['\"])(?P<target>\.{1,2}/[^'\"]+)(?P=quote)",
        replace_import,
        source,
    )
    uri = data_module(source)
    cache[path] = uri
    return uri


def inline_editor_html() -> str:
    html = (ROOT / "editor/index.html").read_text(encoding="utf-8")
    html = remove_from_html(html, "csp", "scripts", "stylesheets")

    shell_css = (ROOT / "vendor/marinos/marinos.css").read_text(encoding="utf-8")
    manifest = json.loads((ROOT / "vendor/marinos/manifest.json").read_text(encoding="utf-8"))
    for relative in manifest.get("fontPathContract", []):
        font_path = (ROOT / "vendor/marinos" / relative).resolve()
        mime = "font/woff2" if font_path.suffix == ".woff2" else "font/ttf"
        encoded = base64.b64encode(font_path.read_bytes()).decode("ascii")
        shell_css = shell_css.replace(relative, f"data:{mime};base64,{encoded}")
    app_css = (ROOT / "editor/assets/app.css").read_text(encoding="utf-8")
    return html.replace("</head>", f"<style>{shell_css}</style><style>{app_css}</style></head>")


def open_editor(context, base_url: str | None, in_memory: bool):
    page = context.new_page()
    if not in_memory:
        page.goto(f"{base_url}editor/", wait_until="networkidle")
    else:
        page.set_content(inline_editor_html())
        entry = inline_module(ROOT / "editor/assets/app.js")
        page.evaluate("""async entry => {
          await import(entry);
          document.dispatchEvent(new Event('DOMContentLoaded'));
          await new Promise(resolve => setTimeout(resolve, 50));
        }""", entry)
    page.locator("#welcome-view").wait_for(state="visible")
    return page


def test_empty_state(context, base_url: str | None, in_memory: bool) -> None:
    page = open_editor(context, base_url, in_memory)
    page.locator("#btn-new-project").click()
    page.locator("#new-proj-title").fill("PowerPoint empty-state fixture")
    page.locator("#btn-submit-create").click()
    page.locator("#workspace-view").wait_for(state="visible")
    page.locator("#tab-button-export").click()

    require(page.get_by_role("region", name="Download PowerPoint").count() == 1,
            "PowerPoint export section is missing its accessible region name")
    require(page.locator("#pptx-export-empty").is_visible(),
            "PowerPoint empty state is not visible for a project without decks")
    require(page.locator("#pptx-export-controls").is_hidden(),
            "PowerPoint controls should be hidden when no deck exists")
    require(page.locator("#btn-export-pptx").is_disabled(),
            "PowerPoint download should be disabled when no deck exists")

    page.get_by_role("button", name="Open Slides").focus()
    page.keyboard.press("Enter")
    require(page.locator("#tab-slides").is_visible(),
            "Open Slide Decks did not navigate to the slide-deck tab")
    require(page.locator("#tab-slides").evaluate("element => document.activeElement === element"),
            "Slide-deck tab panel did not receive focus")
    page.close()


def validate_download(path: Path) -> None:
    require(path.stat().st_size > 20_000, "Downloaded PowerPoint is unexpectedly small")
    with zipfile.ZipFile(path) as archive:
        names = set(archive.namelist())
        for required in ("[Content_Types].xml", "ppt/presentation.xml", "docProps/core.xml"):
            require(required in names, f"Downloaded PowerPoint is missing {required}")
        slides = sorted(name for name in names if name.startswith("ppt/slides/slide") and name.endswith(".xml"))
        notes = sorted(name for name in names if name.startswith("ppt/notesSlides/notesSlide") and name.endswith(".xml"))
        require(len(slides) == 7, f"Expected 7 PowerPoint slides, found {len(slides)}")
        require(len(notes) == 7, f"Expected 7 PowerPoint notes parts, found {len(notes)}")
        core = archive.read("docProps/core.xml").decode("utf-8")
        require("<dc:language>en-US</dc:language>" in core,
                "PowerPoint core properties are missing the expected language")


def test_generation_and_diagnostics(context, base_url: str | None, requests: list[str], in_memory: bool) -> None:
    page = open_editor(context, base_url, in_memory)
    page.locator("#file-import-zip").set_input_files(str(ROOT / "tests" / "fixtures" / "reference-package" / "marinos-foundations.zip"))
    page.locator("#workspace-view").wait_for(state="visible")

    require(page.evaluate("typeof window.PptxGenJS") == "undefined",
            "PptxGenJS global exists before PowerPoint generation")

    page.locator("#tab-button-export").click()
    page.locator("#pptx-export-results .app-alert").wait_for(state="visible")
    require(page.get_by_role("region", name="Download PowerPoint").count() == 1,
            "PowerPoint export section is missing its accessible region name")
    require(page.get_by_role("combobox", name="Slides").count() == 1,
            "PowerPoint deck selector is missing its accessible name")
    require(page.get_by_role("button", name="Download PowerPoint").count() == 1,
            "PowerPoint download button is missing its accessible name")
    require(page.locator("#pptx-presentation-select option").count() == 1,
            "Imported package should expose one PowerPoint deck option")
    require(page.locator("#pptx-presentation-select").input_value() == "urn:uuid:10000000-0000-4000-8000-000000000067",
            "Imported slide deck was not selected")
    require(page.locator("#pptx-export-results .app-alert--warning").count() == 1,
            "Expected nonblocking layout warnings before PowerPoint export")
    require(page.locator("#btn-export-pptx").is_enabled(),
            "Nonblocking warnings should not disable PowerPoint download")
    require(page.evaluate("typeof window.PptxGenJS") == "undefined",
            "PptxGenJS should remain unloaded after preflight")
    if not in_memory:
        require(page.locator('script[data-marin-pptx-runtime]').count() == 0,
                "PptxGenJS script loaded before generation")

    page.set_viewport_size({"width": 390, "height": 844})
    overflow = page.locator("#pptx-export-section").evaluate(
        "element => ({client: element.clientWidth, scroll: element.scrollWidth})"
    )
    require(overflow["scroll"] <= overflow["client"] + 1,
            f"PowerPoint export controls overflow at a narrow viewport: {overflow}")
    page.set_viewport_size({"width": 1280, "height": 720})

    if in_memory:
        page.add_script_tag(content=(ROOT / "vendor/pptxgenjs/pptxgen.bundle.js").read_text(encoding="utf-8"))
        require(page.evaluate("typeof window.PptxGenJS") == "function",
                "In-memory test could not install the reviewed PptxGenJS runtime")

    package_before = page.evaluate("JSON.stringify(window.__currentPkg)")
    save_status_before = page.locator("#workspace-status-badge").inner_text()

    with page.expect_download(timeout=120_000) as download_info:
        page.locator("#btn-export-pptx").click()
        page.wait_for_function(
            "document.querySelector('#pptx-export-section')?.getAttribute('aria-busy') === 'true'"
        )
        require(page.locator("#btn-export-pptx").is_disabled(),
                "PowerPoint download should be disabled during generation")
        require(page.locator("#pptx-presentation-select").is_disabled(),
                "PowerPoint deck selection should be disabled during generation")
        require(page.locator("#btn-export-pptx").get_attribute("aria-disabled") == "true",
                "PowerPoint download did not expose its disabled state")
        require(page.locator("#btn-export-pptx").inner_text() == "Creating PowerPoint...",
                "PowerPoint busy label is missing")
    download = download_info.value
    require(download.suggested_filename == "marinos-foundations-slides.pptx",
            f"Unexpected PowerPoint filename: {download.suggested_filename}")
    validate_download(Path(download.path()))

    page.locator("#pptx-export-results .app-alert--success").wait_for(state="visible")
    require(page.locator("#pptx-export-section").get_attribute("aria-busy") == "false",
            "PowerPoint section stayed busy after download")
    require(page.locator("#btn-export-pptx").is_enabled(),
            "PowerPoint download did not re-enable after success")
    require(page.locator("#pptx-presentation-select").is_enabled(),
            "PowerPoint deck selection did not re-enable after success")
    require(page.locator("#btn-export-pptx").get_attribute("aria-disabled") == "false",
            "PowerPoint download retained a stale disabled state")
    require(page.locator("#btn-export-pptx").evaluate("element => document.activeElement === element"),
            "Focus did not return to the PowerPoint download button")
    require(page.locator("#editor-status-message").get_by_text(
        "PowerPoint downloaded. It was generated in this browser and was not added to the learning package.",
        exact=True,
    ).is_visible(), "PowerPoint success message is missing")
    require(page.evaluate("JSON.stringify(window.__currentPkg)") == package_before,
            "PowerPoint generation mutated the in-memory learning package")
    require(page.locator("#workspace-status-badge").inner_text() == save_status_before,
            "PowerPoint generation changed the local-save status")

    if not in_memory:
        require(page.locator('script[data-marin-pptx-runtime]').count() == 1,
                "The reviewed PptxGenJS runtime should load exactly once")
        runtime_requests = [url for url in requests if url.endswith("/vendor/pptxgenjs/pptxgen.bundle.js")]
        expected = f"{base_url}vendor/pptxgenjs/pptxgen.bundle.js"
        require(runtime_requests == [expected], f"Unexpected PowerPoint runtime requests: {runtime_requests}")
        require(not any("cdn" in url.lower() and "pptx" in url.lower() for url in requests),
                "PowerPoint generation attempted to use a CDN")

    page.locator("#btn-run-validation").click()
    page.evaluate("""() => {
      const pkg = window.__currentPkg;
      const graph = pkg.graphDocument['@graph'];
      const deck = graph.find(object => object['@type']?.includes('marin:Presentation'));
      const slideIds = deck['marin:slideSequence'].itemListElement
        .sort((a, b) => Number(a.position) - Number(b.position))
        .map(entry => entry.item['@id']);
      const slides = slideIds.map(id => graph.find(object => object['@id'] === id));
      slides[1].name = slides[0].name;
    }""")
    page.locator("#tab-button-overview").click()
    page.locator("#tab-button-export").click()
    page.locator("#pptx-export-results .app-alert--danger").wait_for(state="visible")
    require(page.locator("#btn-export-pptx").is_disabled(),
            "Blocking PowerPoint diagnostics did not disable download")
    require(page.locator('[data-pptx-diagnostic-code="pptx-slide-title-duplicate"]').count() == 1,
            "Duplicate slide title diagnostic is missing")
    fix = page.locator('[data-pptx-diagnostic-code="pptx-slide-title-duplicate"] .btn-fix-diagnostic')
    require(fix.is_visible(), "PowerPoint diagnostic does not provide a Fix action")
    fix.click()
    require(page.locator("#tab-slides").is_visible(),
            "PowerPoint Fix action did not return to Slide Decks")
    page.close()


def test_internal_failure(context, base_url: str | None, in_memory: bool) -> None:
    if not in_memory:
        return
    page = open_editor(context, base_url, in_memory)
    downloads = []
    page.on("download", lambda download: downloads.append(download.suggested_filename))
    page.locator("#file-import-zip").set_input_files(str(ROOT / "tests" / "fixtures" / "reference-package" / "marinos-foundations.zip"))
    page.locator("#workspace-view").wait_for(state="visible")
    page.locator("#tab-button-export").click()
    page.locator("#pptx-export-results .app-alert--warning").wait_for(state="visible")
    package_before = page.evaluate("JSON.stringify(window.__currentPkg)")

    page.locator("#btn-export-pptx").click()
    failure = page.locator("#pptx-export-results .app-alert--danger")
    failure.wait_for(state="visible")
    require(failure.get_by_role("heading", name="PowerPoint could not be created").count() == 1,
            "Internal PowerPoint failure heading is missing")
    require(failure.locator(".btn-fix-diagnostic").count() == 0,
            "Internal PowerPoint failure should not expose an authoring Fix action")
    require(page.locator("#btn-export-pptx").is_enabled(),
            "PowerPoint retry should be available after an internal failure")
    require(page.locator("#pptx-export-section").get_attribute("aria-busy") == "false",
            "PowerPoint section stayed busy after an internal failure")
    heading = failure.locator("[data-pptx-result-heading]")
    require(heading.evaluate("element => document.activeElement === element"),
            "Focus did not move to the internal PowerPoint failure heading")
    require(page.locator("#editor-status-message").get_by_text(
        "The PowerPoint file could not be created. Your learning project was not changed.",
        exact=True,
    ).is_visible(), "Internal PowerPoint failure status is missing")
    require(not downloads, f"Internal PowerPoint failure produced an unexpected download: {downloads}")
    require(page.evaluate("JSON.stringify(window.__currentPkg)") == package_before,
            "Internal PowerPoint failure mutated the in-memory learning package")
    page.close()


def run(in_memory: bool = False) -> None:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as error:
        raise RuntimeError("Browser tests require Playwright for this Python interpreter.") from error

    server_context = nullcontext(None) if in_memory else serve()
    with server_context as base_url, sync_playwright() as playwright:
        executable = (shutil.which("chromium") or shutil.which("chromium-browser")
                      or shutil.which("google-chrome"))
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            context = browser.new_context(accept_downloads=True, viewport={"width": 1280, "height": 720})
            problems, requests = configure(context, base_url)
            test_empty_state(context, base_url, in_memory)
            test_generation_and_diagnostics(context, base_url, requests, in_memory)
            test_internal_failure(context, base_url, in_memory)
            require(not problems, f"Browser errors: {problems}")
            context.close()
        finally:
            browser.close()


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--in-memory",
        action="store_true",
        help="inline the application for browser environments that block all navigation",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    run(in_memory=args.in_memory)
    suffix = " (in-memory mode)" if args.in_memory else ""
    print(f"PowerPoint browser export test: PASS{suffix}")
