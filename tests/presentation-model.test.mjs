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
  setSlideContentSequence
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

test('setSlideContentSequence preserves original ListItem data while reordering and renumbering', () => {
  const pkg = createEmptyPackage('Slide editing fixture');
  const first = createContentUnit(pkg, 'First unit', 'concept');
  const second = createContentUnit(pkg, 'Second unit', 'concept');
  const slide = createSlide(pkg, 'Editable split slide', 'split');
  addContentToSlide(slide, first['@id'], 'abstract');
  addContentToSlide(slide, second['@id'], 'title');
  slide['marin:contentSequence'].itemListElement[0].name = 'Preserve first entry data';
  slide['marin:contentSequence'].itemListElement[1].name = 'Preserve second entry data';

  setSlideContentSequence(slide, [
    { itemId: second['@id'], displayMode: 'full', sourceIndex: 1 },
    { itemId: first['@id'], displayMode: 'title', sourceIndex: 0 }
  ]);

  const entries = slide['marin:contentSequence'].itemListElement;
  assert.deepEqual(entries.map((entry) => entry.position), [1, 2]);
  assert.deepEqual(entries.map((entry) => entry.item['@id']), [second['@id'], first['@id']]);
  assert.deepEqual(entries.map((entry) => entry['marin:displayMode']), ['full', 'title']);
  assert.deepEqual(entries.map((entry) => entry.name), ['Preserve second entry data', 'Preserve first entry data']);
});

test('setSlideContentSequence removes the property for content-free title and section slides', () => {
  const pkg = createEmptyPackage('Content-free structural slides fixture');
  const deck = createPresentation(pkg, 'Structural slides deck');
  const unit = createContentUnit(pkg, 'Optional supporting unit', 'overview');
  pkg.contentFiles[unit.encoding.contentUrl] = 'Optional supporting content.';
  const titleSlide = createSlide(pkg, 'Title slide', 'title');
  const sectionSlide = createSlide(pkg, 'Section slide', 'section');
  addContentToSlide(titleSlide, unit['@id'], 'title');
  addContentToSlide(sectionSlide, unit['@id'], 'title');
  addSlideToPresentation(deck, titleSlide['@id']);
  addSlideToPresentation(deck, sectionSlide['@id']);

  const titleResult = setSlideContentSequence(titleSlide, []);
  const sectionResult = setSlideContentSequence(sectionSlide, []);
  const validation = validatePackage(pkg);

  assert.equal(titleResult, null);
  assert.equal(sectionResult, null);
  assert.equal(Object.hasOwn(titleSlide, 'marin:contentSequence'), false);
  assert.equal(Object.hasOwn(sectionSlide, 'marin:contentSequence'), false);
  assert.deepEqual(validation.errors, []);
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

test('a real multi-entry split slide survives editing and package export/reimport', async () => {
  const bytes = await readFile(join(ROOT, 'packages', 'county-leaders-guide-to-data.zip'));
  const imported = await importLearningPackage(bytes, { filename: 'county-leaders-guide-to-data.zip' });
  const graph = imported.pkg.graphDocument['@graph'];
  const slide = graph.find((object) => (
    object?.['@type']?.includes('marin:Slide') &&
    object?.['marin:layout'] === 'split' &&
    object?.['marin:contentSequence']?.itemListElement?.length === 2
  ));
  assert.ok(slide, 'expected a two-entry split slide in the fixture');

  const original = [...slide['marin:contentSequence'].itemListElement]
    .sort((a, b) => a.position - b.position);
  setSlideContentSequence(slide, [
    {
      itemId: original[1].item['@id'],
      displayMode: original[1]['marin:displayMode'],
      sourceIndex: 1
    },
    {
      itemId: original[0].item['@id'],
      displayMode: original[0]['marin:displayMode'],
      sourceIndex: 0
    }
  ]);

  const exported = await exportLearningPackage(imported.pkg);
  const reopened = await importLearningPackage(exported.bytes, { filename: 'round-trip.zip' });
  const reopenedSlide = reopened.pkg.graphDocument['@graph']
    .find((object) => object?.['@id'] === slide['@id']);
  const reopenedEntries = reopenedSlide['marin:contentSequence'].itemListElement;

  assert.deepEqual(reopenedEntries.map((entry) => entry.position), [1, 2]);
  assert.deepEqual(
    reopenedEntries.map((entry) => entry.item['@id']),
    [original[1].item['@id'], original[0].item['@id']]
  );
  assert.deepEqual(
    reopenedEntries.map((entry) => entry['marin:displayMode']),
    [original[1]['marin:displayMode'], original[0]['marin:displayMode']]
  );
  assert.equal(reopened.validation.errors.length, 0);
});
