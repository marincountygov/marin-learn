import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createExampleNotePackage, EXAMPLE_NOTE_IDS } from '../examples/example-note.js';
import { noteSectionMarkdown } from '../js/core/note-markdown.js';
import { buildPresentationModel } from '../js/core/presentation.js';
import { getObject } from '../js/core/model.js';
import { createZip } from '../js/core/zip.js';
import { applyNoteDeck } from '../js/core/note-deck.js';
import { renderSlideCanvasInnerHtml } from '../js/renderers/slides-html.js';
import { generatePptxArtifacts } from '../scripts/generate_pptx.mjs';

const section = (pkg, type) => getObject(pkg, EXAMPLE_NOTE_IDS.sections[type]);

test('every Note section becomes Markdown the slide pipeline can show', () => {
  const pkg = createExampleNotePackage();
  const expected = {
    overview: /^Plain language helps/,
    whyItMatters: /^- People can use a service/,
    problem: /^Many notices and forms/,
    solution: /^Write in plain language\./,
    userStories: /^- As a resident/,
    keyTerms: /^- \*\*Plain language:\*\* /,
    dosAndDonts: /^\| Do \| Don’t \|\n\| --- \| --- \|\n\| Lead with/,
    questions: /^1\. Who is the reader\?/,
    examples: /^\*\*Sample record\*\*[^]*- \[Sample example one\]\(https:\/\/example\.gov\/one\)/,
    checklist: /^- The first sentence/,
    mantras: /^- Say it simply\./,
    learnMore: /^- \[Federal Data Strategy principles\]\(https:\/\/strategy\.data\.gov\/principles\/\)/
  };
  for (const [type, pattern] of Object.entries(expected)) {
    assert.match(noteSectionMarkdown(section(pkg, type)), pattern, type);
  }
});

test('code samples become fenced Markdown blocks before the links, and a range leaves them out', () => {
  const pkg = createExampleNotePackage();
  const markdown = noteSectionMarkdown(section(pkg, 'examples'));
  assert.match(markdown, /^\*\*Sample record\*\*\n\n```json\n\{\n  "requestId": "SR-1042"[^]*```\n\n- \[Sample example one\]/);
  assert.doesNotMatch(noteSectionMarkdown(section(pkg, 'examples'), { first: 1, last: 2 }), /```/);
  section(pkg, 'examples')['marin:code'][0].code = 'a ``` b';
  assert.match(noteSectionMarkdown(section(pkg, 'examples')), /````json\na ``` b\n````/);
});

test('an item range shows only part of a section and keeps list numbers', () => {
  const pkg = createExampleNotePackage();
  const markdown = noteSectionMarkdown(section(pkg, 'questions'), { first: 3, last: 4 });
  assert.equal(markdown, '3. Which words might they not know?\n4. What is the one main point?');
  assert.equal(noteSectionMarkdown(section(pkg, 'keyTerms'), { first: 1, last: 3 }).split('\n').length, 3);
});

test('special characters in Note text cannot become Markdown formatting', () => {
  const pkg = createExampleNotePackage();
  section(pkg, 'mantras')['marin:items'][0] = 'Use *stars* and [brackets] and | pipes';
  const markdown = noteSectionMarkdown(section(pkg, 'mantras'));
  assert.equal(markdown.split('\n')[0], '- Use \\*stars\\* and \\[brackets\\] and \\| pipes');
});

test('a slide that points at a Note section renders it, and a title-only entry renders its heading', async () => {
  const pkg = createExampleNotePackage();
  const model = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  assert.deepEqual(model.diagnostics, []);
  const html = renderSlideCanvasInnerHtml(model.slides[0]);
  assert.match(html, /Key terms/);
  assert.match(html, /<strong>Plain language:<\/strong>/);
  assert.match(html, /Reading level/);
  assert.doesNotMatch(html, /Jargon/, 'the range 1 to 3 hides term 4 onward');

  getObject(pkg, EXAMPLE_NOTE_IDS.slide)['marin:contentSequence'].itemListElement[0]['marin:displayMode'] = 'title';
  const titleOnly = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  assert.match(renderSlideCanvasInnerHtml(titleOnly.slides[0]), /<h3>Key terms<\/h3>/);
});

test('a deck slide that shows an Examples section with code exports to PowerPoint', async () => {
  const pkg = createExampleNotePackage();
  const id = 'urn:uuid:20000000-0000-4000-8000-000000000099';
  pkg.graphDocument['@graph'].push({
    '@id': id, '@type': ['CreativeWork', 'marin:Slide'], identifier: 'sample-code-slide', name: 'Examples', 'marin:layout': 'content',
    'marin:contentSequence': { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: { '@id': EXAMPLE_NOTE_IDS.sections.examples }, 'marin:displayMode': 'full' }] }
  });
  const deck = getObject(pkg, EXAMPLE_NOTE_IDS.presentation);
  deck['marin:slideSequence'].itemListElement.push({ '@type': 'ListItem', position: 2, item: { '@id': id } });
  const model = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  assert.match(renderSlideCanvasInnerHtml(model.slides[1]), /<pre><code[^>]*>[^]*requestId/);
  const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-note-code-pptx-'));
  const zipPath = path.join(temp, 'sample-note-course.zip');
  await writeFile(zipPath, createZip([{ name: 'learning.json', data: JSON.stringify(pkg.graphDocument) }]));
  const { summary } = await generatePptxArtifacts({ inputs: [zipPath], outputDir: path.join(temp, 'review') });
  assert.equal(summary.status, 'pass', JSON.stringify(summary.failures));
  assert.equal(summary.artifacts[0].slideCount, 2);
});

test('a Note section alone on a slide has no repeated heading; beside another it labels its column', async () => {
  const pkg = createExampleNotePackage();
  const model = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  assert.equal(model.slides[0].content[0].unit.kind, 'note-section');
  assert.doesNotMatch(renderSlideCanvasInnerHtml(model.slides[0]), /<h4>/, 'one section on a slide: the slide title is enough');

  const id = 'urn:uuid:20000000-0000-4000-8000-000000000098';
  pkg.graphDocument['@graph'].push({
    '@id': id, '@type': ['CreativeWork', 'marin:Slide'], identifier: 'sample-split', name: 'Two sections', 'marin:layout': 'split',
    'marin:contentSequence': { '@type': 'ItemList', itemListElement: [
      { '@type': 'ListItem', position: 1, item: { '@id': EXAMPLE_NOTE_IDS.sections.problem }, 'marin:displayMode': 'full' },
      { '@type': 'ListItem', position: 2, item: { '@id': EXAMPLE_NOTE_IDS.sections.solution }, 'marin:displayMode': 'full' }] }
  });
  getObject(pkg, EXAMPLE_NOTE_IDS.presentation)['marin:slideSequence'].itemListElement.push({ '@type': 'ListItem', position: 2, item: { '@id': id } });
  const split = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  const html = renderSlideCanvasInnerHtml(split.slides[1]);
  assert.match(html, /<h4>Problem<\/h4>/);
  assert.match(html, /<h4>Solution<\/h4>/);
});

test('every slide but the title slide can show a footer with the course icon and title', async () => {
  const pkg = createExampleNotePackage();
  const model = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  const footer = { iconHtml: '<svg viewBox="0 0 24 24"></svg>', title: 'Plain language 101' };
  const title = renderSlideCanvasInnerHtml({ ...model.slides[0], layout: 'title' }, { footer });
  assert.doesNotMatch(title, /slide-footer/, 'the title slide has no footer');
  const content = renderSlideCanvasInnerHtml(model.slides[0], { footer });
  assert.match(content, /<footer class="slide-footer"><span class="slide-footer-icon" aria-hidden="true"><svg[^>]*><\/svg><\/span><span>Plain language 101<\/span><\/footer>/);
  assert.doesNotMatch(renderSlideCanvasInnerHtml(model.slides[0]), /slide-footer/, 'no footer unless the caller asks');
});

test('a title slide can show an icon above the title and a description below it', async () => {
  const pkg = createExampleNotePackage();
  const model = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  const title = { ...model.slides[0], layout: 'title', name: 'Plain language 101' };
  const html = renderSlideCanvasInnerHtml(title, { titleExtras: { iconHtml: '<svg viewBox="0 0 24 24"></svg>', description: 'Write so your reader understands.' } });
  assert.ok(html.indexOf('slide-title-icon') < html.indexOf('<h2'), 'icon comes before the title');
  assert.ok(html.indexOf('<h2') < html.indexOf('slide-title-description'), 'description comes after the title');
  assert.doesNotMatch(renderSlideCanvasInnerHtml({ ...title, layout: 'content' }, { titleExtras: { description: 'x' } }), /slide-title-description/, 'only title slides get extras');
});

test('the deck is named "<title> — slides"', async () => {
  const pkg = createExampleNotePackage();
  applyNoteDeck(pkg.graphDocument, { noteId: EXAMPLE_NOTE_IDS.note, presentationId: EXAMPLE_NOTE_IDS.presentation, name: 'Plain language 101 \u2014 slides', makeId: (key) => `urn:uuid:30000000-0000-4000-8000-${String(key.length).padStart(12, '0')}` });
  assert.equal(getObject(pkg, EXAMPLE_NOTE_IDS.presentation).name, 'Plain language 101 \u2014 slides');
});

test('a deck built from a Note exports to PowerPoint', async () => {
  const pkg = createExampleNotePackage();
  const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-note-pptx-'));
  const zipPath = path.join(temp, 'sample-note-course.zip');
  await writeFile(zipPath, createZip([{ name: 'learning.json', data: JSON.stringify(pkg.graphDocument) }]));
  const { summary } = await generatePptxArtifacts({ inputs: [zipPath], outputDir: path.join(temp, 'review') });
  assert.equal(summary.status, 'pass', JSON.stringify(summary.failures));
  assert.equal(summary.artifacts[0].slideCount, 1);
});
