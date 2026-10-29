import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { NOTE_SECTIONS } from '../js/core/constants.js';
import { importLearningPackage } from '../js/core/package.js';
import { getObjects } from '../js/core/model.js';
import { validatePackage } from '../js/core/validate.js';
import { validateJsonSchema } from '../js/core/schema-validator.js';

async function load() {
  const imported = await importLearningPackage(new Uint8Array(await readFile(new URL('../packages/county-leaders-guide-to-schemas.zip', import.meta.url))));
  return imported.pkg || imported;
}

test('Schema 101 has a published Note that passes every rule, with no writing warnings', async () => {
  const pkg = await load();
  const result = validatePackage(pkg);
  assert.deepEqual(result.errors.map((entry) => entry.message), []);
  assert.deepEqual(result.warnings.filter((entry) => entry.stage === 'Writing').map((entry) => entry.message), []);
  const [note] = getObjects(pkg, 'marin:Note');
  assert.equal(note.name, 'Schema 101');
  assert.equal(note.creativeWorkStatus, 'published');
  const [course] = getObjects(pkg, 'marin:LearningSet');
  assert.equal(course.name, 'Schema 101');
});

test('Schema 101 uses all twelve sections, the owner-supplied example, and only the two named sources', async () => {
  const pkg = await load();
  const sections = getObjects(pkg, 'marin:NoteSection');
  assert.deepEqual(sections.map((section) => section['marin:sectionType']), NOTE_SECTIONS.map((rule) => rule.type));
  const urls = (type) => sections.find((section) => section['marin:sectionType'] === type)['marin:items'].map((item) => item.url);
  assert.deepEqual(urls('examples'), ['https://en.wikipedia.org/wiki/JSON#Metadata_and_schema']);
  assert.deepEqual(urls('learnMore'), ['https://schema.org/', 'https://en.wikipedia.org/wiki/Database_schema']);
});

test('the Schema 101 code samples are real: the sample record follows the sample schema', async () => {
  const pkg = await load();
  const examples = getObjects(pkg, 'marin:NoteSection').find((section) => section['marin:sectionType'] === 'examples');
  const [schemaSample, recordSample] = examples['marin:code'];
  assert.equal(examples['marin:code'].length, 2);
  const schema = JSON.parse(schemaSample.code);
  const record = JSON.parse(recordSample.code);
  assert.deepEqual(validateJsonSchema(record, schema), []);
  assert.ok(validateJsonSchema({ ...record, status: 'bogus' }, schema).length > 0, 'a bad status is rejected');
  assert.ok(validateJsonSchema({ ...record, extra: 1 }, schema).length > 0, 'an extra field is rejected');
  const { requestId, ...missing } = record;
  assert.ok(validateJsonSchema(missing, schema).length > 0, 'a missing required field is rejected');
});

test('the catalog lists API 101, Data 101, Engage Marin 101 and Schema 101 only; MarinOS 101 is gone from Marin Learn', async () => {
  const catalog = JSON.parse(await readFile(new URL('../catalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(catalog.items.map((item) => item.identifier), ['county-leaders-guide-to-apis', 'county-leaders-guide-to-data', 'engage-marin-101', 'county-leaders-guide-to-schemas']);
  assert.ok(!catalog.items.some((item) => item.hidden), 'nothing is hidden');
  await assert.rejects(readFile(new URL('../packages/marinos-foundations.zip', import.meta.url)));
  await assert.rejects(readFile(new URL('../learning/marinos-foundations/learning.json', import.meta.url)));
});
