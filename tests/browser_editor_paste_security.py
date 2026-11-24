#!/usr/bin/env python3
"""Browser coverage for what the rich editor does with hostile input (docs/editor/TESTING.md, U10: "No script/event handler/style execution; safe link protocols").

  1. safeFragment (editor/assets/safe-html.js) leaves what the editor really produces exactly as it is, and builds nothing from what it should not.
  2. A hostile paste (script, event handlers, javascript: links, svg, iframe, style, forms) runs nothing and leaves only the supported structure; an ordinary
     paste keeps its headings, list, table and link.
  3. The Text style menu cannot make an element that is not one of its styles.
  4. A table cell that holds a backslash and a pipe stays one cell and comes back unchanged.
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

HOSTILE = [
    '<p onclick="window.__xss=1">x</p>',
    '<a href="javascript:window.__xss=2">x</a>',
    '<a href=" JaVaScRiPt:window.__xss=2">x</a>',
    '<a href="data:text/html,<script>window.__xss=2</script>">x</a>',
    '<a href="vbscript:msgbox(1)">x</a>',
    '<img src="x" onerror="window.__xss=3">',
    '<img src="javascript:window.__xss=3">',
    '<img src="data:text/html;base64,PHNjcmlwdD4=">',
    '<script>window.__xss=4</script>',
    '<<script>script>window.__xss=4</script>',
    '<svg onload="window.__xss=5"><script>window.__xss=5</script></svg>',
    '<math><mi xlink:href="javascript:window.__xss=5">x</mi></math>',
    '<iframe srcdoc="<script>parent.__xss=6</script>"></iframe>',
    '<object data="javascript:window.__xss=6"></object><embed src="javascript:window.__xss=6">',
    '<style>*{display:none}</style><p style="position:fixed;inset:0">x</p>',
    '<form action="javascript:window.__xss=7"><input name="a"><button>go</button></form>',
    '<link rel="stylesheet" href="https://example.invalid/x.css"><meta http-equiv="refresh" content="0;url=javascript:window.__xss=7"><base href="https://example.invalid/">',
    '<p class="x" id="y" data-evil="1" title="t" onmouseover="window.__xss=8">x</p>',
    '<details open ontoggle="window.__xss=9"><summary>x</summary></details>',
    '<template><script>window.__xss=10</script></template>',
    '<table onclick="window.__xss=11"><tr onclick="window.__xss=11"><td onclick="window.__xss=11">x</td></tr></table>',
    '<span class="broken-reference" onclick="window.__xss=12" title="ok">x</span>',
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

            # 1. What the editor produces passes through unchanged, and nothing listed as hostile does.
            same = page.evaluate("""async ([markdown, gif, uuid]) => {
              const { renderMarkdown } = await import('/js/core/markdown.js');
              const { safeFragment } = await import('/editor/assets/safe-html.js');
              const html = renderMarkdown(markdown, { resolveRef: (id) => `marin-ref:${id}`, resolveAsset: () => gif });
              const original = document.createElement('template');
              original.innerHTML = html;
              const clean = document.createElement('div');
              clean.append(safeFragment(html));
              return { html, original: original.innerHTML, clean: clean.innerHTML };
            }""", [SAMPLE_MARKDOWN, GIF, UUID])
            for needle in ("<h2>", "<strong>", "<em>", "<code>", 'href="https://example.org/a?b=c&amp;d=e"', 'href="mailto:', 'href="tel:', f'href="marin-ref:{UUID}"',
                           "<img ", "<blockquote>", "<ol>", '<code class="language-python">', '<th scope="col">', 'class="table-scroll"'):
                require(needle in same["html"], f"The sample does not exercise {needle!r}: {same['html'][:200]}")
            require(same["clean"] == same["original"], f"The sanitizer changed what the editor produces:\n{same['original']}\n{same['clean']}")

            leaks = page.evaluate("""async (cases) => {
              const { safeFragment } = await import('/editor/assets/safe-html.js');
              const found = [];
              for (const html of cases) {
                const box = document.createElement('div');
                box.append(safeFragment(html));
                const bad = [];
                if (box.querySelector('script, style, iframe, object, embed, svg, math, form, input, button, link, meta, base, template, details')) bad.push('element');
                for (const element of box.querySelectorAll('*')) {
                  for (const attribute of element.attributes) {
                    if (/^on/i.test(attribute.name) || ['style', 'id', 'srcdoc', 'data-evil', 'action', 'formaction'].includes(attribute.name)) bad.push(`attribute ${attribute.name}`);
                    if (/^\\s*(javascript|vbscript):/i.test(attribute.value) || /^\\s*data:text/i.test(attribute.value)) bad.push(`value ${attribute.value}`);
                  }
                }
                if (box.querySelector('a[href^="javascript" i], a[href^=" javascript" i]')) bad.push('javascript link');
                if (bad.length) found.push({ html, bad });
              }
              return found;
            }""", HOSTILE)
            require(not leaks, f"Hostile markup survived safeFragment: {leaks}")

            kept = page.evaluate("""async () => {
              const { safeFragment } = await import('/editor/assets/safe-html.js');
              const box = document.createElement('div');
              box.append(safeFragment('<p onclick="x()">Keep <a href="javascript:x()">this</a> text</p><img src="x" onerror="x()"><span class="broken-reference" onclick="x()" title="ok">gone</span>'));
              return box.innerHTML;
            }""")
            require(kept == '<p>Keep <a>this</a> text</p><span class="broken-reference" title="ok">gone</span>', f"The words stay and the danger goes: {kept!r}")

            # 2. A hostile paste into the editor runs nothing; an ordinary paste keeps its structure.
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

            # 3. The Text style menu makes only its own styles.
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

            # 4. A cell with a backslash and a pipe stays one cell and comes back as it was.
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
