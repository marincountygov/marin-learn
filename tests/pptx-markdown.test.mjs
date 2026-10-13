import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMarkdown } from '../js/core/markdown.js';
import {
  inlineRuns,
  markdownAstToPlainText,
  planMarkdownBlocks
} from '../js/pptx/markdown.js';

test('PowerPoint plain-text conversion preserves nested list order without duplicating nested content', () => {
  const ast = parseMarkdown([
    '1. Parent item',
    '   - Nested item',
    '2. Second item'
  ].join('\n'));
  const text = markdownAstToPlainText(ast);

  assert.equal(text, '1. Parent item\n  • Nested item\n2. Second item');
  assert.equal((text.match(/Nested item/g) || []).length, 1);
});

test('PowerPoint rich-text runs keep external links interactive and internal references non-interactive', () => {
  const ast = parseMarkdown('[County website](https://www.marincounty.gov/) and [another lesson](marin-ref:11111111-1111-4111-8111-111111111111).');
  const paragraph = ast[0];
  const runs = inlineRuns(paragraph.children);
  const external = runs.find((run) => run.text.startsWith('County website'));
  const internal = runs.find((run) => run.text.startsWith('another lesson'));

  assert.equal(external.text, 'County website');
  assert.deepEqual(external.options.hyperlink, { url: 'https://www.marincounty.gov/' });
  assert.equal(internal.options.hyperlink, undefined);
  assert.equal(internal.options.italic, true);
});


test('PowerPoint rich-text conversion keeps trailing punctuation with the preceding styled run', () => {
  const ast = parseMarkdown('Visit the [County website](https://www.marincounty.gov/).');
  const runs = inlineRuns(ast[0].children);
  const link = runs.find((run) => run.options.hyperlink);

  assert.equal(link.text, 'County website.');
  assert.equal(runs.some((run) => run.text === '.'), false);
});

test('PowerPoint Markdown planning keeps authored font sizes and reports deterministic overflow', () => {
  const ast = parseMarkdown('A paragraph that needs predictable fixed-size layout.');
  const plan = planMarkdownBlocks(ast, { width: 4, maxHeight: 0.05 });

  assert.equal(plan.blocks[0].fontSize, 18);
  assert.equal(plan.fits, false);
  assert.ok(plan.overflow > 0);
});
