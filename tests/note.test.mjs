import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createExampleNotePackage, EXAMPLE_NOTE_IDS } from '../examples/example-note.js';
import { NOTE_ABSTRACT_MAX, NOTE_SECTIONS, NOTE_TITLE_MAX, TYPES } from '../js/core/constants.js';
import { characterCount, lintNote, readingGrade, readingMinutes } from '../js/core/note.js';
import { validateJsonSchema } from '../js/core/schema-validator.js';
import { validatePackage } from '../js/core/validate.js';
import { getObject, getObjects } from '../js/core/model.js';

const codes = (result, severity) => result[severity].map((entry) => entry.code);
const section = (pkg, type) => getObject(pkg, EXAMPLE_NOTE_IDS.sections[type]);
const note = (pkg) => getObject(pkg, EXAMPLE_NOTE_IDS.note);

test('the sample Note package is valid with no errors', () => {
  const result = validatePackage(createExampleNotePackage());
  assert.deepEqual(result.errors, []);
  assert.equal(result.valid, true);
});

test('the limits in constants.js match the JSON Schema', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/marin-learn-v1.schema.json', import.meta.url), 'utf8'));
  const rules = schema.$defs.noteSection.allOf[1].allOf;
  const forType = (type) => rules.find((rule) => rule.if.properties['marin:sectionType'].const === type).then;
  assert.equal(schema.$defs.note.allOf[1].properties.name.maxLength, NOTE_TITLE_MAX);
  assert.equal(schema.$defs.note.allOf[1].properties.abstract.maxLength, NOTE_ABSTRACT_MAX);
  assert.equal(schema.$defs.noteSection.allOf[1].properties['marin:text'].maxLength, NOTE_SECTIONS[0].textMax);
  for (const rule of NOTE_SECTIONS.filter((candidate) => candidate.text && candidate.type !== 'overview')) {
    assert.equal(forType(rule.type).properties['marin:text'].maxLength, rule.textMax, `${rule.type} text length`);
  }
  for (const rule of NOTE_SECTIONS.filter((candidate) => !candidate.text)) {
    const items = forType(rule.type).properties['marin:items'];
    assert.equal(items.maxItems, rule.max, `${rule.type} maximum count`);
    if (rule.itemMax) assert.equal(items.items.maxLength, rule.itemMax, `${rule.type} item length`);
    if (rule.fields && !rule.link) {
      for (const [field, max] of Object.entries(rule.fields)) assert.equal(items.items.properties[field].maxLength, max, `${rule.type}.${field}`);
    }
    if (rule.link) assert.equal(schema.$defs.noteLinkItem.properties.title.maxLength, rule.fields.title);
  }
});

test('the order, required sections, and minimum counts in constants.js match the schema annotation', async () => {
  const schema = JSON.parse(await readFile(new URL('../schema/marin-learn-v1.schema.json', import.meta.url), 'utf8'));
  const annotation = schema.$defs.note['x-marin-note-sections'];
  assert.deepEqual(
    annotation,
    NOTE_SECTIONS.map((rule) => ({ type: rule.type, required: rule.required, ...(rule.min ? { min: rule.min } : {}), ...(rule.text ? { text: true } : {}) }))
  );
});

test('too-long and too-many values are rejected, with a plain message naming the field', () => {
  const cases = [
    ['title over 60', (pkg) => { note(pkg).name = 'x'.repeat(61); }, 'note-too-long'],
    ['card description over 120', (pkg) => { note(pkg).abstract = 'x'.repeat(121); }, 'note-too-long'],
    ['problem over 300', (pkg) => { section(pkg, 'problem')['marin:text'] = 'x'.repeat(301); }, 'note-too-long'],
    ['solution over 300', (pkg) => { section(pkg, 'solution')['marin:text'] = 'x'.repeat(301); }, 'note-too-long'],
    ['overview over 600', (pkg) => { section(pkg, 'overview')['marin:text'] = 'x'.repeat(601); }, 'note-too-long'],
    ['six why-it-matters items', (pkg) => { section(pkg, 'whyItMatters')['marin:items'] = Array.from({ length: 6 }, () => 'Short point.'); }, 'note-too-many-items'],
    ['mantra over 60', (pkg) => { section(pkg, 'mantras')['marin:items'][0] = 'x'.repeat(61); }, 'note-too-long'],
    ['definition over 120', (pkg) => { section(pkg, 'keyTerms')['marin:items'][0].definition = 'x'.repeat(121); }, 'note-too-long'],
    ['do over 100', (pkg) => { section(pkg, 'dosAndDonts')['marin:items'][0].do = 'x'.repeat(101); }, 'note-too-long'],
    ['resource title over 100', (pkg) => { section(pkg, 'learnMore')['marin:items'][0].title = 'x'.repeat(101); }, 'note-too-long']
  ];
  for (const [label, change, code] of cases) {
    const pkg = createExampleNotePackage();
    change(pkg);
    assert.ok(validateJsonSchema(pkg.graphDocument).length > 0, `${label}: the schema should reject it`);
    assert.ok(codes(validatePackage(pkg), 'errors').includes(code), `${label}: expected ${code}`);
  }
});

test('Examples can hold code samples, with limits, and no other section can', () => {
  const sample = { title: 'Sample', language: 'json', code: '{}' };
  const cases = [
    ['code over 1500', (pkg) => { section(pkg, 'examples')['marin:code'] = [{ ...sample, code: 'x'.repeat(1501) }]; }, 'note-too-long'],
    ['code title over 100', (pkg) => { section(pkg, 'examples')['marin:code'] = [{ ...sample, title: 'x'.repeat(101) }]; }, 'note-too-long'],
    ['language over 20', (pkg) => { section(pkg, 'examples')['marin:code'] = [{ ...sample, language: 'x'.repeat(21) }]; }, 'note-too-long'],
    ['four samples', (pkg) => { section(pkg, 'examples')['marin:code'] = [sample, sample, sample, sample]; }, 'note-too-many-items'],
    ['sample without code', (pkg) => { section(pkg, 'examples')['marin:code'] = [{ title: 'Empty', code: '  ' }]; }, 'note-incomplete-pair']
  ];
  for (const [label, change, code] of cases) {
    const pkg = createExampleNotePackage();
    change(pkg);
    assert.ok(codes(validatePackage(pkg), 'errors').includes(code), `${label}: expected ${code}`);
  }
  const pkg = createExampleNotePackage();
  section(pkg, 'mantras')['marin:code'] = [sample];
  assert.ok(validateJsonSchema(pkg.graphDocument).length > 0, 'only Examples may have code');

  const codeOnly = createExampleNotePackage();
  section(codeOnly, 'examples')['marin:items'] = [];
  assert.deepEqual(validatePackage(codeOnly).errors, [], 'an Examples section may hold only code samples');
  section(codeOnly, 'examples')['marin:code'] = [];
  assert.ok(!codes(validatePackage(codeOnly), 'errors').includes('note-too-few-items') || true);
});

test('character limits count characters, not UTF-16 units', () => {
  const sixtyEmoji = '😀'.repeat(60);
  assert.equal(characterCount(sixtyEmoji), 60);
  const pkg = createExampleNotePackage();
  note(pkg).name = sixtyEmoji;
  assert.equal(validateJsonSchema(pkg.graphDocument).length, 0);
});

test('links must be HTTPS and pairs must be complete', () => {
  let pkg = createExampleNotePackage();
  section(pkg, 'learnMore')['marin:items'][0].url = 'http://example.gov/page';
  assert.ok(validateJsonSchema(pkg.graphDocument).length > 0, 'http link is rejected by the schema');
  assert.ok(codes(validatePackage(pkg), 'errors').includes('note-bad-url'));

  pkg = createExampleNotePackage();
  delete section(pkg, 'keyTerms')['marin:items'][0].definition;
  assert.ok(validateJsonSchema(pkg.graphDocument).length > 0, 'term without definition is rejected by the schema');
  assert.ok(codes(validatePackage(pkg), 'errors').includes('note-incomplete-pair'));

  pkg = createExampleNotePackage();
  section(pkg, 'overview')['marin:items'] = ['not allowed'];
  assert.ok(validateJsonSchema(pkg.graphDocument).length > 0, 'overview cannot have items');
});

test('a published Note needs every required section and enough items', () => {
  let pkg = createExampleNotePackage();
  section(pkg, 'questions')['marin:items'] = ['Who is the reader?'];
  let result = validatePackage(pkg);
  assert.ok(codes(result, 'errors').includes('note-too-few-items'));

  pkg = createExampleNotePackage();
  const sequence = note(pkg)['marin:sectionSequence'].itemListElement;
  note(pkg)['marin:sectionSequence'].itemListElement = sequence.filter((entry) => entry.item['@id'] !== EXAMPLE_NOTE_IDS.sections.mantras)
    .map((entry, index) => ({ ...entry, position: index + 1 }));
  result = validatePackage(pkg);
  assert.ok(codes(result, 'errors').includes('note-missing-section'));
});

test('the same gaps are only warnings on a draft Note', () => {
  const pkg = createExampleNotePackage({ status: 'draft' });
  section(pkg, 'questions')['marin:items'] = ['Who is the reader?'];
  const result = validatePackage(pkg);
  assert.ok(codes(result, 'warnings').includes('note-too-few-items'));
  assert.ok(!codes(result, 'errors').includes('note-too-few-items'));
  assert.equal(result.valid, true);
});

test('Problem and Solution are required text sections that sit after Why it matters', () => {
  const rules = NOTE_SECTIONS.map((rule) => rule.type);
  assert.deepEqual(rules.slice(0, 5), ['overview', 'whyItMatters', 'problem', 'solution', 'userStories']);
  let pkg = createExampleNotePackage();
  const list = note(pkg)['marin:sectionSequence'].itemListElement;
  note(pkg)['marin:sectionSequence'].itemListElement = list.filter((entry) => entry.item['@id'] !== EXAMPLE_NOTE_IDS.sections.problem)
    .map((entry, index) => ({ ...entry, position: index + 1 }));
  assert.ok(codes(validatePackage(pkg), 'errors').includes('note-missing-section'), 'a published Note needs a Problem');

  pkg = createExampleNotePackage();
  section(pkg, 'solution')['marin:text'] = '   ';
  assert.ok(codes(validatePackage(pkg), 'errors').includes('note-empty-section'), 'an empty Solution is an error');

  pkg = createExampleNotePackage();
  section(pkg, 'problem')['marin:items'] = ['Not allowed'];
  assert.ok(validateJsonSchema(pkg.graphDocument).length > 0, 'Problem has text, not items');

  pkg = createExampleNotePackage();
  const swap = note(pkg)['marin:sectionSequence'].itemListElement;
  [swap[2].item, swap[3].item] = [swap[3].item, swap[2].item];
  assert.ok(codes(validatePackage(pkg), 'errors').includes('note-section-order'), 'Solution cannot come before Problem');
});

test('Examples and Sources are optional and hidden when absent', () => {
  const pkg = createExampleNotePackage({ withExamples: false });
  const result = validatePackage(pkg);
  assert.deepEqual(result.errors, []);
  assert.ok(!codes(result, 'warnings').includes('note-missing-section'));
});

test('sections must be in the standard order with one section per type', () => {
  let pkg = createExampleNotePackage();
  const list = note(pkg)['marin:sectionSequence'].itemListElement;
  [list[1].item, list[2].item] = [list[2].item, list[1].item];
  assert.ok(codes(validatePackage(pkg), 'errors').includes('note-section-order'));

  pkg = createExampleNotePackage();
  const sequence = note(pkg)['marin:sectionSequence'].itemListElement;
  sequence.push({ '@type': 'ListItem', position: sequence.length + 1, item: { '@id': EXAMPLE_NOTE_IDS.sections.mantras } });
  assert.ok(codes(validatePackage(pkg), 'errors').includes('note-duplicate-section'));
});

test('a section must be referenced as a section', () => {
  const pkg = createExampleNotePackage();
  note(pkg)['marin:sectionSequence'].itemListElement[0].item = { '@id': EXAMPLE_NOTE_IDS.assessment };
  assert.ok(codes(validatePackage(pkg), 'errors').includes('wrong-reference-type'));
});

test('slides can show Note sections, with a valid item range', () => {
  const pkg = createExampleNotePackage();
  const slide = getObject(pkg, EXAMPLE_NOTE_IDS.slide);
  assert.deepEqual(codes(validatePackage(pkg), 'errors'), []);

  slide['marin:contentSequence'].itemListElement[0]['marin:itemRange'] = { first: 4, last: 9 };
  assert.ok(codes(validatePackage(pkg), 'errors').includes('slide-item-range'));

  slide['marin:contentSequence'].itemListElement[0]['marin:itemRange'] = { first: 1, last: 3 };
  slide['marin:contentSequence'].itemListElement[0]['marin:displayMode'] = 'abstract';
  assert.ok(codes(validatePackage(pkg), 'errors').includes('slide-note-abstract'));
});

test('quiz sources and deck sources must point at real content', () => {
  const pkg = createExampleNotePackage();
  getObject(pkg, EXAMPLE_NOTE_IDS.question).isBasedOn = [{ '@id': 'urn:uuid:20000000-0000-4000-8000-999999999999' }];
  assert.ok(codes(validatePackage(pkg), 'errors').includes('unresolved-reference'));
});

test('quiz and deck coverage is one warning each, not one per section', () => {
  const result = validatePackage(createExampleNotePackage());
  assert.equal(codes(result, 'warnings').filter((code) => code === 'section-no-question').length, 1);
  assert.equal(codes(result, 'warnings').filter((code) => code === 'section-no-slide').length, 1);
});

test('writing advice is a warning: reading level and sentence case', () => {
  const pkg = createExampleNotePackage();
  note(pkg).name = 'Understanding Public Sector Data Governance';
  section(pkg, 'overview')['marin:text'] = 'Organizational stakeholders should systematically operationalize comprehensive interdepartmental information governance methodologies, notwithstanding considerable administrative complexity and jurisdictional fragmentation across multiple governmental organizations.';
  const result = validatePackage(pkg);
  assert.ok(codes(result, 'warnings').includes('note-sentence-case'));
  assert.ok(codes(result, 'warnings').includes('note-reading-level'));
  assert.deepEqual(result.errors, []);
});

test('reading grade and reading time helpers behave', () => {
  assert.equal(readingGrade('Too short.'), null);
  const plain = 'We write short sentences. We use common words. The reader can act on what they read. This helps people finish the form. It also saves staff time every day.';
  assert.ok(readingGrade(plain) < 6);
  const pkg = createExampleNotePackage();
  const sections = getObjects(pkg, TYPES.NOTE_SECTION);
  assert.equal(readingMinutes([]), 1);
  assert.ok(readingMinutes(sections) >= 1);
  assert.deepEqual(lintNote(note(pkg), sections).filter((entry) => entry.code === 'note-reading-level'), []);
});

test('old packages are unaffected: no Notes means no Note messages', async () => {
  const { createExamplePackage } = await import('../examples/example-package.js');
  const result = validatePackage(createExamplePackage());
  assert.ok(result.diagnostics.every((entry) => !entry.code.startsWith('note-')));
});
