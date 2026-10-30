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
