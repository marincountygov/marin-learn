import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeMarkdown,
  extractMarkdownReferences,
  parseMarkdown,
  renderMarkdown,
  serializeMarkdown,
  validateMarkdown
} from '../js/core/markdown.js';

const uuid = '10000000-0000-4000-8000-000000000090';

test('canonical Markdown normalizes line endings, list markers, and final newline', () => {
  const input = '* First  \r\n* Second\r\n\r\n';
  assert.equal(canonicalizeMarkdown(input), '- First\n- Second\n');
});

test('the supported Markdown profile parses and renders core structures', () => {
  const markdown = `## Heading\n\nA **strong** statement with [a link](https://example.org).\n\n| Term | Meaning |\n| --- | --- |\n| One | First |\n\n\`\`\`js\nconst value = 1;\n\`\`\`\n`;
  const ast = parseMarkdown(markdown);
  assert.ok(ast.some((node) => node.type === 'heading'));
  assert.ok(ast.some((node) => node.type === 'table'));
  assert.ok(ast.some((node) => node.type === 'codeBlock'));
  const html = renderMarkdown(markdown);
  assert.match(html, /<h2>Heading<\/h2>/);
  assert.match(html, /<table>/);
  assert.match(html, /<pre><code/);
});

test('Markdown validation rejects raw HTML and H1 headings', () => {
  const diagnostics = validateMarkdown('# Top level\n\n<script>alert(1)</script>\n');
  assert.ok(diagnostics.some((item) => item.code === 'markdown-h1'));
  assert.ok(diagnostics.some((item) => item.code === 'markdown-raw-html'));
});

test('stable Marin references are extracted and validated', () => {
  const markdown = `See [the source](marin-ref:${uuid}).\n\n![Flow](marin-asset:${uuid})\n`;
  const refs = extractMarkdownReferences(markdown);
  assert.deepEqual(refs.refs, [uuid]);
  assert.deepEqual(refs.assets, [uuid]);
  const diagnostics = validateMarkdown(markdown, {
    hasRef: (value) => value === uuid,
    hasAsset: (value) => value === uuid
  });
  assert.equal(diagnostics.filter((item) => item.severity === 'error').length, 0);
});

test('a table cell keeps a literal backslash and a literal pipe through a save and reload', () => {
  const ast = parseMarkdown('| Path | Choice |\n| --- | --- |\n| C:\\\\data\\\\ | a\\|b |\n');
  const once = canonicalizeMarkdown(serializeMarkdown(ast));
  assert.match(once, /\| C:\\\\data\\\\ \| a\\\|b \|/);
  assert.equal(canonicalizeMarkdown(serializeMarkdown(parseMarkdown(once))), once, 'a second save changes nothing');
  const table = parseMarkdown(once).find((node) => node.type === 'table');
  assert.equal(table.rows.length, 1);
  assert.equal(table.rows[0].length, 2, 'the pipe stays inside its cell');
});

// A list ends at the first block that is not indented under its last item (CommonMark list rules, docs/MARKDOWN.md "Unordered lists").
// Before this, everything after a list was taken into the list's last item: a table, a code block, a heading, a paragraph.
const kinds = (markdown) => parseMarkdown(markdown).map((node) => node.type);

test('a table, code block, heading, paragraph or quotation after a list is its own block, not part of the last item', () => {
  assert.deepEqual(kinds('- First\n- Second\n\n| Role | Duty |\n| --- | --- |\n| Director | Approval |\n'), ['list', 'table']);
  assert.deepEqual(kinds('1. one\n2. two\n\n```python\nprint(1)\n```\n'), ['list', 'codeBlock']);
  assert.deepEqual(kinds('- a\n- b\n\n## A heading\n\nA paragraph after.\n'), ['list', 'heading', 'paragraph']);
  assert.deepEqual(kinds('- a\n- b\n\n> A quotation\n'), ['list', 'blockquote']);
  assert.deepEqual(kinds('- a\n- b\n\nA paragraph after.\n'), ['list', 'paragraph']);
  const [list] = parseMarkdown('- First\n- Second\n\n| Role | Duty |\n| --- | --- |\n| Director | Approval |\n');
  assert.equal(list.items.length, 2);
  assert.deepEqual(list.items[1].map((block) => block.type), ['paragraph'], 'the last item holds only its own text');
});

test('a block that starts at the margin ends the list even with no blank line before it', () => {
  assert.deepEqual(kinds('- a\n- b\n## Heading\n'), ['list', 'heading']);
  assert.deepEqual(kinds('- a\n- b\n```\ncode\n```\n'), ['list', 'codeBlock']);
  assert.deepEqual(kinds('- a\n- b\n> quote\n'), ['list', 'blockquote']);
  assert.deepEqual(kinds('- a\n- b\n| H | I |\n| --- | --- |\n| 1 | 2 |\n'), ['list', 'table']);
});

test('indented content still belongs to its list item: paragraphs, nested lists, code and tables', () => {
  const item = (markdown) => parseMarkdown(markdown)[0].items[0].map((block) => block.type);
  assert.deepEqual(item('- item\n\n  second paragraph of the item\n- next\n'), ['paragraph', 'paragraph']);
  assert.deepEqual(item('- parent\n  - nested\n\n  still the parent\n'), ['paragraph', 'list', 'paragraph']);
  assert.deepEqual(item('1. step\n\n   ```\n   code in the step\n   ```\n2. next\n'), ['paragraph', 'codeBlock']);
  assert.deepEqual(item('- item\n\n  | A | B |\n  | --- | --- |\n  | 1 | 2 |\n'), ['paragraph', 'table']);
  assert.equal(parseMarkdown('- one\n\n- two\n\n- three\n')[0].items.length, 3, 'a loose list is still one list');
  assert.deepEqual(kinds('- a\n  - b\n    - c\n\nafter\n'), ['list', 'paragraph']);
});

test('a list followed by a table survives a save: canonical Markdown, then parsed again, is the same two blocks', () => {
  const input = '- First\n- Second\n\n| Role | Duty |\n| --- | --- |\n| Director | Approval |\n';
  const once = canonicalizeMarkdown(input);
  assert.deepEqual(kinds(once), ['list', 'table']);
  assert.equal(canonicalizeMarkdown(once), once);
  assert.match(renderMarkdown(input), /^<ul><li><p>First<\/p><\/li><li><p>Second<\/p><\/li><\/ul><div class="table-scroll"/);
});
