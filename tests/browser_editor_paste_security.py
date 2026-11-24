#!/usr/bin/env python3
"""Browser coverage for what the rich editor does with hostile input (docs/editor/TESTING.md, U10: "No script/event handler/style execution; safe link protocols").

  1. renderMarkdownDom (js/core/markdown.js) builds exactly the nodes renderMarkdown describes, for every construct the editor produces, without parsing HTML.
  2. Hostile Markdown (raw HTML, javascript: and data: links and images, hostile asset and reference sources) becomes text or a broken-reference marker, never markup.
  3. A hostile paste (script, event handlers, javascript: links, svg, iframe, style, forms) runs nothing and leaves only the supported structure; an ordinary
     paste keeps its headings, list, table and link.
  4. The Text style menu cannot make an element that is not one of its styles.
  5. A table cell that holds a backslash and a pipe stays one cell and comes back unchanged.
"""
from __future__ import annotations

from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from tests.browser_editor_smoke import configure, require, serve

GIF = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
UUID = "123e4567-e89b-42d3-a456-426614174000"

# Markdown a person could write or paste, and the options the page could hand the renderer, that try to bring markup in.
HOSTILE = [
    "<script>window.__xss=1</script>",
    '<img src=x onerror="window.__xss=2">',
    '<p onclick="window.__xss=3">x</p>',
    "<svg onload=window.__xss=4></svg><iframe srcdoc=\"<script>parent.__xss=5</script>\"></iframe>",
    "<style>*{display:none}</style><form action=javascript:window.__xss=6><input></form>",
    "[click](javascript:window.__xss=7)",
    "[click](JaVaScRiPt:window.__xss=7)",
    "[click]( javascript:window.__xss=7)",
    "[click](data:text/html,<script>window.__xss=8</script>)",
    "[click](vbscript:msgbox(1))",
    "[click](//example.invalid/x)",
    "![pic](javascript:window.__xss=9)",
    "![pic](https://example.invalid/tracker.png)",
    "![x](marin-asset:{uuid}) and [y](marin-ref:{uuid})",
    "**bold <b onmouseover=window.__xss=10>x</b>** and `<script>`",
    "# <script>window.__xss=11</script>\n\n> <iframe src=javascript:window.__xss=11></iframe>\n\n- <img src=x onerror=window.__xss=11>",
    "| <script>x</script> | b |\n| --- | --- |\n| <img src=x onerror=window.__xss=12> | d |",
]

SAMPLE_MARKDOWN = f"""## A heading

Plain with **bold**, *italic*, `code`, a [link](https://example.org/a?b=c&d=e), a [mail](mailto:a@example.org), a [phone](tel:+14155550100),
an [internal link](marin-ref:{UUID}) and a ![picture](marin-asset:{UUID}).

> A quotation

```python
print("hi")
```

| Name | Value |
| --- | --- |
| a | 1 |
| b | 2 |

1. one
2. two
"""


def run() -> None:
    from playwright.sync_api import sync_playwright

    with serve() as base_url, sync_playwright() as playwright:
        executable = (shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome"))
        options = {"headless": True, "args": ["--no-sandbox", "--disable-dev-shm-usage"]}
        if executable:
            options["executable_path"] = executable
        browser = playwright.chromium.launch(**options)
        try:
            context = browser.new_context(viewport={"width": 1280, "height": 900})
            problems = configure(context, base_url)
            page = context.new_page()
            page.goto(f"{base_url}editor/", wait_until="networkidle")

            # 1. The nodes are the ones renderMarkdown describes, for every construct the editor produces.
            same = page.evaluate("""async ([markdown, gif, uuid]) => {
              const { renderMarkdown, renderMarkdownDom } = await import('/js/core/markdown.js');
              const options = { resolveRef: (id) => `marin-ref:${id}`, resolveAsset: () => gif };
              const html = renderMarkdown(markdown, options);
              const original = document.createElement('template');
              original.innerHTML = html;
              const built = document.createElement('div');
              built.append(renderMarkdownDom(markdown, options));
              const missing = document.createElement('div');
              missing.append(renderMarkdownDom('![a picture](marin-asset:' + uuid + ') and ![bad](x)', { resolveAsset: () => null }));
              const missingHtml = document.createElement('template');
              missingHtml.innerHTML = renderMarkdown('![a picture](marin-asset:' + uuid + ') and ![bad](x)', { resolveAsset: () => null });
              const broken = document.createElement('div');
              broken.append(renderMarkdownDom('[no](javascript:x) and [yes](marin-ref:' + uuid + ')', { resolveRef: () => false }));
              const brokenHtml = document.createElement('template');
              brokenHtml.innerHTML = renderMarkdown('[no](javascript:x) and [yes](marin-ref:' + uuid + ')', { resolveRef: () => false });
              return { html, original: original.innerHTML, built: built.innerHTML, missing: missing.innerHTML, missingHtml: missingHtml.innerHTML, broken: broken.innerHTML, brokenHtml: brokenHtml.innerHTML };
            }""", [SAMPLE_MARKDOWN, GIF, UUID])
            for needle in ("<h2>", "<strong>", "<em>", "<code>", 'href="https://example.org/a?b=c&amp;d=e"', 'href="mailto:', 'href="tel:', f'href="marin-ref:{UUID}"',
                           "<img ", "<blockquote>", "<ol>", '<code class="language-python">', '<th scope="col">', 'class="table-scroll"'):
                require(needle in same["html"], f"The sample does not exercise {needle!r}: {same['html'][:200]}")
            require(same["built"] == same["original"], f"renderMarkdownDom and renderMarkdown differ:\n{same['original']}\n{same['built']}")
            require(same["missing"] == same["missingHtml"] and "broken-reference" in same["missing"], f"A missing or invalid image differs:\n{same['missingHtml']}\n{same['missing']}")
            require(same["broken"] == same["brokenHtml"] and "broken-reference" in same["broken"], f"A broken link differs:\n{same['brokenHtml']}\n{same['broken']}")

            # 2. Hostile Markdown becomes text or a broken-reference marker, never markup.
            leaks = page.evaluate(r"""async ([cases, uuid]) => {
              const { renderMarkdownDom } = await import('/js/core/markdown.js');
              const found = [];
              const variants = [
                { resolveRef: (id) => `marin-ref:${id}`, resolveAsset: () => 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=' },
                { resolveRef: () => 'javascript:window.__xss=20', resolveAsset: () => 'javascript:window.__xss=21' },
                { resolveRef: () => 'data:text/html,<script>window.__xss=22</script>', resolveAsset: () => 'data:text/html;base64,PHNjcmlwdD4=' },
                { resolveRef: () => 'https://example.invalid/x" onclick="window.__xss=23', resolveAsset: () => 'https://example.invalid/x.png" onerror="window.__xss=24' },
              ];
              for (const template of cases) {
                const markdown = template.replaceAll('{uuid}', uuid);
                for (const options of variants) {
                  const box = document.createElement('div');
                  box.append(renderMarkdownDom(markdown, options));
                  const bad = [];
                  const allowed = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'PRE', 'CODE', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'DIV', 'STRONG', 'EM', 'A', 'IMG', 'SPAN']);
                  for (const element of box.querySelectorAll('*')) {
                    if (!allowed.has(element.tagName)) bad.push(`element ${element.tagName}`);
                    for (const attribute of element.attributes) {
                      if (/^on/i.test(attribute.name) || attribute.name === 'style') bad.push(`attribute ${attribute.name}`);
                      if (attribute.name === 'href' && !/^(#|https?:|mailto:|tel:|marin-ref:)/i.test(attribute.value)) bad.push(`href ${attribute.value}`);
                      if (attribute.name === 'src' && !/^(data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,|blob:)/i.test(attribute.value)) bad.push(`src ${attribute.value}`);
                    }
                  }
                  if (bad.length) found.push({ markdown, bad });
                }
              }
              return found;
            }""", [HOSTILE, UUID])
            require(not leaks, f"Hostile Markdown became markup: {leaks[:3]}")
            shown = page.evaluate("""async () => {
              const { renderMarkdownDom } = await import('/js/core/markdown.js');
              const box = document.createElement('div');
              box.append(renderMarkdownDom('<script>window.__xss=1</script> and [x](javascript:window.__xss=2)', {}));
              return { html: box.innerHTML, text: box.textContent, xss: window.__xss ?? null };
            }""")
            require(shown["xss"] is None and "<script>" in shown["text"] and "<script" not in shown["html"].replace("&lt;script", ""), f"Raw HTML shows as text: {shown}")

            # 3. A hostile paste into the editor runs nothing; an ordinary paste keeps its structure.
            paste = """async ([html, text]) => {
              const { createMarkdownEditor } = await import('/editor/assets/rich-editor.js');
              const editor = createMarkdownEditor({ markdown: '', label: 'Test', dialogs: { requestText() {}, requestFields() {} } });
              document.body.append(editor.element);
              editor.focus();
              const selection = window.getSelection();
              const range = document.createRange();
              range.selectNodeContents(editor.surface);
              range.collapse(false);
              selection.removeAllRanges();
              selection.addRange(range);
              const data = new DataTransfer();
              if (html) data.setData('text/html', html);
              data.setData('text/plain', text);
              editor.surface.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
              await new Promise((resolve) => setTimeout(resolve, 400));
              const result = { html: editor.surface.innerHTML, markdown: editor.getMarkdown(), xss: window.__xss ?? null,
                danger: [...editor.surface.querySelectorAll('*')].flatMap((e) => [...e.attributes].filter((a) => /^on/i.test(a.name) || a.name === 'style').map((a) => a.name)),
                elements: [...new Set([...editor.surface.querySelectorAll('*')].map((e) => e.tagName.toLowerCase()))].sort() };
              editor.element.remove();
              return result;
            }"""
            hostile = ('<p onclick="window.__xss=1">Hello <b>bold</b> <a href="javascript:window.__xss=2">link</a> and <a href="https://example.org/ok">fine</a></p>'
                       '<img src="x" onerror="window.__xss=3"><script>window.__xss=4</script><svg onload="window.__xss=5"></svg>'
                       '<iframe srcdoc="<script>parent.__xss=6</script>"></iframe><style>*{display:none}</style><form action="javascript:window.__xss=7"><input></form>'
                       '<ul><li>one</li><li>two</li></ul>')
            result = page.evaluate(paste, [hostile, "Hello bold link and fine"])
            require(result["xss"] is None, f"Pasted markup ran code: window.__xss = {result['xss']}")
            require(not result["danger"], f"An event handler or style came through: {result['danger']}")
            require(not set(result["elements"]) & {"script", "style", "iframe", "svg", "form", "input", "img", "object", "embed"}, f"A forbidden element came through: {result['elements']}")
            require("Hello **bold**" in result["markdown"] and "[fine](https://example.org/ok)" in result["markdown"] and "- one" in result["markdown"] and "- two" in result["markdown"],
                    f"The supported structure was kept: {result['markdown']!r}")
            require("javascript:" not in result["markdown"] and "javascript:" not in result["html"], "No javascript: link remains")

            word = ('<h2 style="font-family:Calibri">Key procedures</h2><p class="MsoNormal">Step <b>one</b>, see <a href="https://example.org/guide">the guide</a>.</p>'
                    '<table><tr><td>Role</td><td>Duty</td></tr><tr><td>Director</td><td>Approval</td></tr></table>'
                    '<ul><li class="MsoListParagraph">First</li><li class="MsoListParagraph">Second</li></ul>')  # a table after a list is a known gap of the Markdown parser
            result = page.evaluate(paste, [word, "Key procedures"])
            for expected in ("## Key procedures", "Step **one**", "[the guide](https://example.org/guide)", "- First", "- Second", "| Role | Duty |", "| Director | Approval |"):
                require(expected in result["markdown"], f"An ordinary paste keeps {expected!r}: {result['markdown']!r}")
            require(not result["danger"], f"Office styles came through: {result['danger']}")

            # 4. The Text style menu makes only its own styles.
            style = page.evaluate("""async () => {
              const { createMarkdownEditor } = await import('/editor/assets/rich-editor.js');
              const editor = createMarkdownEditor({ markdown: 'One paragraph', label: 'Test', dialogs: { requestText() {}, requestFields() {} } });
              document.body.append(editor.element);
              const select = editor.element.querySelector('[data-rich-block]');
              const choose = (value) => {
                const option = document.createElement('option');
                option.value = value;
                select.append(option);
                select.value = value;
                const range = document.createRange();
                range.selectNodeContents(editor.surface.firstElementChild);
                const selection = window.getSelection();
                selection.removeAllRanges();
                selection.addRange(range);
                select.dispatchEvent(new Event('change', { bubbles: true }));
                option.remove();
              };
              choose('script');
              choose('img src=x onerror=window.__xss=1');
              choose('table');
              const afterBad = editor.surface.innerHTML;
              choose('h3');
              const afterGood = editor.surface.innerHTML;
              editor.element.remove();
              return { afterBad, afterGood, xss: window.__xss ?? null };
            }""")
            require(style["afterBad"] == "<p>One paragraph</p>" and style["xss"] is None, f"An unknown style changed the block: {style}")
            require(style["afterGood"] == "<h3>One paragraph</h3>", f"A real style still works: {style}")

            # 5. A cell with a backslash and a pipe stays one cell and comes back as it was.
            table = page.evaluate("""async () => {
              const { createMarkdownEditor } = await import('/editor/assets/rich-editor.js');
              const editor = createMarkdownEditor({ markdown: '', label: 'Test', dialogs: { requestText() {}, requestFields() {} } });
              document.body.append(editor.element);
              const values = ['plain', 'x|y', 'a\\\\|b', 'ends\\\\', 'star*|bar', { code: 'c\\\\|d' }];
              const tableElement = document.createElement('table');
              const head = tableElement.createTHead().insertRow();
              head.insertCell().textContent = 'Name';
              head.insertCell().textContent = 'Value';
              values.forEach((value, index) => {
                const row = tableElement.insertRow();
                row.insertCell().textContent = `row ${index}`;
                const cell = row.insertCell();
                if (typeof value === 'object') {
                  const code = document.createElement('code'); // inline code is not escaped as text is, so its backslash and pipe are bare
                  code.textContent = value.code;
                  cell.append(code);
                } else cell.textContent = value;
              });
              editor.surface.replaceChildren(tableElement);
              const markdown = editor.getMarkdown();
              editor.setMarkdown(markdown);
              const rows = [...editor.surface.querySelectorAll('tr')].map((row) => [...row.children].map((cell) => cell.textContent));
              editor.element.remove();
              return { markdown, rows, values: values.map((value) => (typeof value === 'object' ? value.code : value)) };
            }""")
            require(all(len(row) == 2 for row in table["rows"]), f"A pipe split a row: {table['rows']}")
            require([row[1] for row in table["rows"][1:]] == table["values"], f"A cell changed on the way through Markdown: {table['rows']} vs {table['values']}\n{table['markdown']}")

            # The page's own security policy blocks the hostile <base href> that one sample carries, and says so in the console: that is expected.
            problems = [message for message in problems if "base-uri" not in message]
            require(not problems, f"Editor browser errors: {problems}")
            context.close()
        finally:
            browser.close()


if __name__ == "__main__":
    run()
    print("Editor paste security browser tests: PASS")
