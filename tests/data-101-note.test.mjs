import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { NOTE_SECTIONS } from '../js/core/constants.js';
import { importLearningPackage } from '../js/core/package.js';
import { getObjects } from '../js/core/model.js';
import { validatePackage } from '../js/core/validate.js';

async function load() {
  const imported = await importLearningPackage(new Uint8Array(await readFile(new URL('../packages/county-leaders-guide-to-data.zip', import.meta.url))));
  return imported.pkg || imported;
}

test('Data 101 has a published Note that passes every rule', async () => {
  const pkg = await load();
  const result = validatePackage(pkg);
  assert.deepEqual(result.errors.map((entry) => entry.message), []);
  const [note] = getObjects(pkg, 'marin:Note');
  assert.equal(note.name, 'Data 101');
  assert.equal(note.creativeWorkStatus, 'published');
});

test('Data 101 has no Examples until the owner supplies some, and no invented citations', async () => {
  const pkg = await load();
  const types = getObjects(pkg, 'marin:NoteSection').map((section) => section['marin:sectionType']);
  assert.ok(!types.includes('examples'));
  assert.deepEqual(types, NOTE_SECTIONS.map((rule) => rule.type).filter((type) => type !== 'examples'));
  const learnMore = getObjects(pkg, 'marin:NoteSection').find((section) => section['marin:sectionType'] === 'learnMore');
  assert.deepEqual(learnMore['marin:items'].map((item) => item.url), [
    'https://strategy.data.gov/principles/',
    'https://www.gov.uk/government/publications/the-government-data-quality-framework',
    'https://www.gov.uk/government/publications/data-ethics-framework',
    'https://www.gov.uk/government/publications/data-sharing-governance-framework',
    'https://www.gov.uk/government/collections/data-standards-authority'
  ]);
});

test('Data 101 reads at grade 6 or lower, with no writing warnings', async () => {
  const pkg = await load();
  const advice = validatePackage(pkg).warnings.filter((entry) => entry.stage === 'Writing');
  assert.deepEqual(advice.map((entry) => entry.message), []);
});

test('the Data 101 deck and quiz still resolve after the Note was added', async () => {
  const pkg = await load();
  const result = validatePackage(pkg);
  assert.ok(!result.diagnostics.some((entry) => entry.code === 'unresolved-reference' || entry.code === 'wrong-reference-type'));
  assert.equal(getObjects(pkg, 'marin:Presentation').length, 1);
  assert.equal(getObjects(pkg, 'marin:Assessment').length, 1);
});
