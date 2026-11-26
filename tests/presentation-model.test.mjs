import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  addContentToSlide,
  addSlideToPresentation,
  createContentUnit,
  createEmptyPackage,
  createPresentation,
  createSlide
} from '../js/core/model.js';
import { exportLearningPackage, importLearningPackage } from '../js/core/package.js';
import {
  buildPresentationModel,
  DEFAULT_SLIDE_DISPLAY_MODE,
} from '../js/core/presentation.js';
import { validatePackage } from '../js/core/validate.js';
import {
  renderSlideCanvasInnerHtml,
  renderSpeakerNotesHtml
} from '../js/renderers/slides-html.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function addBody(pkg, unit, markdown) {
  pkg.contentFiles[unit.encoding.contentUrl] = markdown;
  return unit;
}

test('the shared presentation model preserves authored order and applies the schema display-mode default', async () => {
  const pkg = createEmptyPackage('Presentation model fixture');
  const deck = createPresentation(pkg, 'Shared model deck');
  const fullUnit = addBody(pkg, createContentUnit(pkg, 'Full unit', 'concept'), 'Full **Markdown** body.');
  const summaryUnit = addBody(pkg, createContentUnit(pkg, 'Summary unit', 'summary'), 'Body that should not be loaded.');
  summaryUnit.abstract = 'Short authored summary.';

  const slide = createSlide(pkg, 'Ordered split slide', 'split');
  slide['marin:speakerNotes'] = 'Remember the **sequence**.';
  addContentToSlide(slide, fullUnit['@id'], 'full');
  addContentToSlide(slide, summaryUnit['@id'], 'abstract');
  delete slide['marin:contentSequence'].itemListElement[0]['marin:displayMode'];
  slide['marin:contentSequence'].itemListElement.reverse();
  addSlideToPresentation(deck, slide['@id']);

  const loadedPaths = [];
  const model = await buildPresentationModel({
    graphDocument: pkg.graphDocument,
    presentationId: deck['@id'],
    getMarkdown: ({ path }) => {
      loadedPaths.push(path);
      return pkg.contentFiles[path];
    }
  });

  assert.equal(model.diagnostics.length, 0);
  assert.equal(model.slides.length, 1);
  assert.deepEqual(model.slides[0].content.map((entry) => entry.unit.id), [fullUnit['@id'], summaryUnit['@id']]);
  assert.equal(model.slides[0].content[0].displayMode, DEFAULT_SLIDE_DISPLAY_MODE);
  assert.equal(model.slides[0].content[0].displayMode, 'full');
  assert.equal(model.slides[0].content[0].markdownStatus, 'loaded');
  assert.equal(model.slides[0].content[1].markdownStatus, 'not-required');
  assert.deepEqual(loadedPaths, [fullUnit.encoding.contentUrl]);
  assert.equal(model.slides[0].speakerNotesAst[0].type, 'paragraph');
});

test('the shared HTML renderer handles all display modes and speaker notes from the resolved model', async () => {
  const pkg = createEmptyPackage('Shared renderer fixture');
  const deck = createPresentation(pkg, 'Renderer deck');
  const titleUnit = addBody(pkg, createContentUnit(pkg, 'Title unit', 'topic'), 'Unused.');
  const summaryUnit = addBody(pkg, createContentUnit(pkg, 'Summary unit', 'summary'), 'Unused.');
  summaryUnit.abstract = 'Concise summary.';
  const fullUnit = addBody(pkg, createContentUnit(pkg, 'Full unit', 'procedure'), '- First\n- Second');
  const slide = createSlide(pkg, 'Renderer slide', 'content');
  addContentToSlide(slide, titleUnit['@id'], 'title');
  addContentToSlide(slide, summaryUnit['@id'], 'abstract');
  addContentToSlide(slide, fullUnit['@id'], 'full');
  slide['marin:speakerNotes'] = 'Presenter **note**.';
  addSlideToPresentation(deck, slide['@id']);

  const model = await buildPresentationModel({
    graphDocument: pkg.graphDocument,
    presentationId: deck['@id'],
    getMarkdown: ({ path }) => pkg.contentFiles[path]
  });
  const html = renderSlideCanvasInnerHtml(model.slides[0], { titleId: 'shared-title' });
  const notes = renderSpeakerNotesHtml(model.slides[0]);

  assert.match(html, /id="shared-title"/);
  assert.match(html, /slide-content--title/);
  assert.match(html, /slide-content--abstract/);
  assert.match(html, /slide-content--full/);
  assert.match(html, /<ul>/);
  assert.match(notes, /<strong>note<\/strong>/);
});

test('the shared presentation model reports unresolved slide and content references', async () => {
  const pkg = createEmptyPackage('Broken presentation fixture');
  const deck = createPresentation(pkg, 'Broken deck');
  deck['marin:slideSequence'].itemListElement.push({
    '@type': 'ListItem',
    position: 1,
    item: { '@id': 'urn:uuid:ffffffff-ffff-4fff-8fff-ffffffffffff' }
  });

  const model = await buildPresentationModel({ graphDocument: pkg.graphDocument, presentationId: deck['@id'] });
  assert.equal(model.slides.length, 0);
  assert.deepEqual(model.diagnostics.map((item) => item.code), ['slide-reference-unresolved']);
});

test('all published presentation fixtures resolve through the shared model without semantic loss', async () => {
  const learningRoot = join(ROOT, 'learning');
  const setSlugs = (await readdir(learningRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const layouts = new Set();
  const modes = new Set();
  let presentationCount = 0;

  for (const setSlug of setSlugs) {
    const setRoot = join(learningRoot, setSlug);
    const graphDocument = JSON.parse(await readFile(join(setRoot, 'learning.json'), 'utf8'));
    const presentations = graphDocument['@graph'].filter((object) => object?.['@type']?.includes('marin:Presentation'));
    for (const presentation of presentations) {
      presentationCount += 1;
      const model = await buildPresentationModel({
        graphDocument,
        presentationId: presentation['@id'],
        getMarkdown: ({ path }) => readFile(join(setRoot, path), 'utf8')
      });
      const sourceSlideCount = presentation['marin:slideSequence'].itemListElement.length;
      assert.equal(model.slides.length, sourceSlideCount, `${setSlug}: slide count changed`);
      assert.deepEqual(model.diagnostics, [], `${setSlug}: shared-model diagnostics`);
      for (const slide of model.slides) {
        layouts.add(slide.layout);
        for (const entry of slide.content) modes.add(entry.displayMode);
      }
    }
  }

  assert.ok(presentationCount >= 2);
  // The Note decks use only the title, content, and split layouts. The others are covered by
  // the PowerPoint release fixture (tests/fixtures/pptx-release).
  assert.deepEqual([...layouts].sort(), ['content', 'split', 'title']);
  // Short-summary and title-only entries are covered by the PowerPoint release fixture.
  assert.deepEqual([...modes].sort(), ['full']);
});

