import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createExampleNotePackage, EXAMPLE_NOTE_IDS } from '../examples/example-note.js';
import { applyNoteDeck, chunkItems, planNoteDeck } from '../js/core/note-deck.js';
import { getObject, getObjects } from '../js/core/model.js';
import { importLearningPackage } from '../js/core/package.js';
import { buildPresentationModel } from '../js/core/presentation.js';
import { validatePackage } from '../js/core/validate.js';
import { buildDeckForPackage, uuid5 } from '../scripts/build_note_deck.mjs';
import { generatePptxArtifacts } from '../scripts/generate_pptx.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const makeId = (key) => uuid5(`test/${key}`);

function deckFor(pkg, options = {}) {
  const slides = applyNoteDeck(pkg.graphDocument, { noteId: EXAMPLE_NOTE_IDS.note, presentationId: EXAMPLE_NOTE_IDS.presentation, makeId, options });
  return slides;
}

// Every item of every section must appear on exactly one slide.
function coverage(pkg) {
  const seen = new Map();
  for (const slide of getObjects(pkg, 'marin:Slide')) {
    for (const entry of slide['marin:contentSequence']?.itemListElement || []) {
      const section = getObject(pkg, entry.item['@id']);
      const items = section['marin:items'] || [];
      const samples = section['marin:code'] || [];
      const key = (kind, index) => `${section['marin:sectionType']}/${kind}${index}`;
      if (typeof section['marin:text'] === 'string') { seen.set(key('text', 0), (seen.get(key('text', 0)) || 0) + 1); continue; }
      const hasCodeRange = Boolean(entry['marin:codeRange']);
      const itemRange = entry['marin:itemRange'];
      if (!hasCodeRange || itemRange) {
        const first = itemRange ? itemRange.first : 1;
        const last = itemRange ? itemRange.last : items.length;
        for (let i = first; i <= last; i += 1) seen.set(key('item', i), (seen.get(key('item', i)) || 0) + 1);
      }
      if (hasCodeRange || (!itemRange && samples.length)) {
        const range = entry['marin:codeRange'] || { first: 1, last: samples.length };
        for (let i = range.first; i <= range.last; i += 1) seen.set(key('code', i), (seen.get(key('code', i)) || 0) + 1);
      }
    }
  }
  return seen;
}

function expectedKeys(pkg) {
  const keys = [];
  for (const section of getObjects(pkg, 'marin:NoteSection')) {
    const type = section['marin:sectionType'];
    if (typeof section['marin:text'] === 'string') keys.push(`${type}/text0`);
    for (let i = 1; i <= (section['marin:items'] || []).length; i += 1) keys.push(`${type}/item${i}`);
    for (let i = 1; i <= (section['marin:code'] || []).length; i += 1) keys.push(`${type}/code${i}`);
  }
  return keys;
}

test('chunkItems splits by words and by item cap, and always accepts the first item', () => {
  const ten = Array.from({ length: 10 }, () => 'one two three four five');           // 5 words each
  assert.deepEqual(chunkItems(ten, 45, 6), [{ first: 1, last: 5 }, { first: 6, last: 10 }], 'cap of 6 makes two slides, spread evenly');
  assert.deepEqual(chunkItems(ten, 12, 6), [1, 3, 5, 7, 9].map((first) => ({ first, last: first + 1 })), '12 words fits two 5-word items');
  assert.deepEqual(chunkItems(Array.from({ length: 7 }, () => 'one two three'), 45, 4), [{ first: 1, last: 4 }, { first: 5, last: 7 }], 'seven items on two slides: 4 and 3, not 4 and 3 by accident');
  assert.deepEqual(chunkItems(Array.from({ length: 5 }, () => 'one two three'), 45, 4), [{ first: 1, last: 3 }, { first: 4, last: 5 }], 'five items with a cap of 4: 3 and 2, not 4 and 1');
  assert.deepEqual(chunkItems(['a '.repeat(80)], 45, 6), [{ first: 1, last: 1 }], 'one long item still gets a slide');
  assert.deepEqual(chunkItems([], 45, 6), []);
});

test('a deck plan follows the rules: title first, Problem and Solution together, no empty sections', () => {
  const pkg = createExampleNotePackage();
  const slides = deckFor(pkg);
  const names = slides.map((slide) => slide.name);
  assert.equal(names[0], 'Plain language 101');
  assert.equal(slides[0]['marin:layout'], 'title');
  assert.equal(slides[0]['marin:contentSequence'], undefined);
  assert.ok(names.includes('Problem and solution'));
  assert.ok(!names.includes('Problem') && !names.includes('Solution'));
  assert.equal(slides.find((slide) => slide.name === 'Problem and solution')['marin:layout'], 'split');
  assert.equal(slides.find((slide) => slide.name === 'Mantras')['marin:layout'], 'content');
  assert.equal(names.at(-1), 'Sources');
  assert.deepEqual(slides.filter((slide) => slide['marin:layout'] === 'split').length, 1);
  assert.ok(names.some((name) => /^Key terms \(1 of \d\)$/.test(name)), 'split sections say which part');
});

test('the checklist, user stories, and questions are always one slide each, even over the word budget', () => {
  const pkg = createExampleNotePackage();
  const slides = deckFor(pkg, { wordBudget: 5 });
  for (const name of ['Checklist', 'User stories', 'Questions to ask']) {
    assert.equal(slides.filter((slide) => slide.name.startsWith(name)).length, 1, name);
    assert.equal(slides.find((slide) => slide.name.startsWith(name)).name, name);
  }
  assert.ok(slides.filter((slide) => /^Do’s/.test(slide.name)).length > 1, 'other sections still split');
  const seen = coverage(pkg);
  for (const key of expectedKeys(pkg)) assert.equal(seen.get(key), 1, `${key} should appear once`);
});

test('key terms use at most three slides, spread evenly, however many words they have', () => {
  const nine = Array.from({ length: 9 }, () => 'a term and a long definition with many words in it, more than enough words');
  assert.deepEqual(chunkItems(nine, 20, 4, 3), [{ first: 1, last: 3 }, { first: 4, last: 6 }, { first: 7, last: 9 }]);
  assert.deepEqual(chunkItems(nine.slice(0, 10).concat('x'), 20, 4, 3).length, 3);
  assert.deepEqual(chunkItems(['a b', 'c d'], 45, 4, 3), [{ first: 1, last: 2 }], 'short lists stay on one slide');
  const pkg = createExampleNotePackage();
  const slides = deckFor(pkg, { wordBudget: 10 });
  assert.equal(slides.filter((slide) => /^Key terms/.test(slide.name)).length, 3);
});

test('every Note item, text block, and code sample is on exactly one slide', () => {
  const pkg = createExampleNotePackage();
  deckFor(pkg);
  const seen = coverage(pkg);
  for (const key of expectedKeys(pkg)) assert.equal(seen.get(key), 1, `${key} should appear once`);
  assert.equal(seen.size, expectedKeys(pkg).length, 'nothing else is shown');
});

test('the deck builds the same way every time and can be rebuilt over itself', () => {
  const first = createExampleNotePackage();
  const second = createExampleNotePackage();
  deckFor(first);
  deckFor(second);
  assert.deepEqual(first.graphDocument, second.graphDocument);
  deckFor(first);
  assert.deepEqual(first.graphDocument, second.graphDocument, 'rebuilding over an existing deck changes nothing');
});

test('the built deck validates, shows Note sections by reference, and has no coverage warnings', async () => {
  const pkg = createExampleNotePackage();
  deckFor(pkg);
  const result = validatePackage(pkg);
  assert.deepEqual(result.errors.map((entry) => entry.message), []);
  assert.ok(!result.warnings.some((entry) => entry.code === 'section-no-slide'));
  const deck = getObject(pkg, EXAMPLE_NOTE_IDS.presentation);
  assert.deepEqual(deck.isBasedOn, [{ '@id': EXAMPLE_NOTE_IDS.note }]);
  const model = await buildPresentationModel({ graphDocument: pkg.graphDocument });
  assert.deepEqual(model.diagnostics, []);
});

test('a longer word budget gives fewer slides', () => {
  const tight = createExampleNotePackage();
  const loose = createExampleNotePackage();
  const a = deckFor(tight, { wordBudget: 20 }).length;
  const b = deckFor(loose, { wordBudget: 80 }).length;
  assert.ok(a > b, `${a} slides at 20 words, ${b} at 80`);
});

for (const [zip, title, slideCount] of [['county-leaders-guide-to-data', 'Data 101', 16], ['county-leaders-guide-to-schemas', 'Schema 101', 19]]) {
  test(`${title}: the published deck is built from the Note, covers it once, and exports to PowerPoint`, async () => {
    const file = path.join(ROOT, 'packages', `${zip}.zip`);
    const { pkg } = await importLearningPackage(new Uint8Array(await readFile(file)));
    const result = validatePackage(pkg);
    assert.deepEqual(result.errors.map((entry) => entry.message), []);
    assert.ok(!result.warnings.some((entry) => /section-no-slide|unused-slide/.test(entry.code)), 'no coverage or unused-slide warnings');
    const [deck] = getObjects(pkg, 'marin:Presentation');
    assert.equal(deck['marin:slideSequence'].itemListElement.length, slideCount);
    const [note] = getObjects(pkg, 'marin:Note');
    assert.deepEqual(deck.isBasedOn, [{ '@id': note['@id'] }]);
    const seen = coverage(pkg);
    for (const key of expectedKeys(pkg)) assert.equal(seen.get(key), 1, `${key} should appear once`);

    const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-deck-'));
    const { summary } = await generatePptxArtifacts({ inputs: [file], outputDir: path.join(temp, 'review') });
    assert.equal(summary.status, 'pass', JSON.stringify(summary.failures));
    assert.equal(summary.artifacts[0].slideCount, slideCount);
  });
}

test('the build script gives identical bytes when run twice', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-deck-build-'));
  const copy = path.join(temp, 'data.zip');
  await copyFile(path.join(ROOT, 'packages', 'county-leaders-guide-to-data.zip'), copy);
  await buildDeckForPackage(copy);
  const once = await readFile(copy);
  await buildDeckForPackage(copy);
  assert.deepEqual(await readFile(copy), once);
  assert.deepEqual(await readFile(path.join(ROOT, 'packages', 'county-leaders-guide-to-data.zip')), once, 'the published package is what the script produces');
});
