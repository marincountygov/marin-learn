import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createExampleNotePackage, EXAMPLE_NOTE_IDS } from '../examples/example-note.js';
import { MAX_QUIZ_QUESTIONS, NOTE_SECTIONS } from '../js/core/constants.js';
import { getObject, getObjects } from '../js/core/model.js';
import { applyNoteQuiz } from '../js/core/note-quiz.js';
import { importLearningPackage } from '../js/core/package.js';
import { validateJsonSchema } from '../js/core/schema-validator.js';
import { validatePackage } from '../js/core/validate.js';
import { buildQuizForPackage } from '../scripts/build_note_quiz.mjs';
import { buildDeckForPackage, uuid5 } from '../scripts/build_note_deck.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const makeId = (key) => uuid5(`test/${key}`);
const codes = (result, severity) => result[severity].map((entry) => entry.code);

const COURSES = [
  ['county-leaders-guide-to-data', 'source/quizzes/data-101.json', 'Data 101 — quiz'],
  ['county-leaders-guide-to-schemas', 'source/quizzes/schema-101.json', 'Schema 101 — quiz']
];
// Sections a quiz covers; the rest (overview, stories, examples, mantras, sources) are not quizzable.
const QUIZZED = ['whyItMatters', 'problem', 'solution', 'keyTerms', 'dosAndDonts', 'questions', 'checklist'];

async function load(slug) {
  const imported = await importLearningPackage(new Uint8Array(await readFile(path.join(ROOT, 'packages', `${slug}.zip`))));
  return imported.pkg || imported;
}

function questionsOf(pkg) {
  const [quiz] = getObjects(pkg, 'marin:Assessment');
  return quiz['marin:itemSequence'].itemListElement.map((entry) => getObject(pkg, entry.item['@id']));
}

const optionsOf = (pkg, question) => question['marin:options'].itemListElement.map((entry) => getObject(pkg, entry.item['@id']));

for (const [slug, sourceFile, quizName] of COURSES) {
  test(`${quizName}: ten questions, tied to Note sections, with the planned mix`, async () => {
    const pkg = await load(slug);
    const result = validatePackage(pkg);
    assert.deepEqual(result.errors.map((entry) => entry.message), []);
    assert.deepEqual(result.warnings.map((entry) => entry.message), [], 'no coverage, reading-level, or other warnings');

    const [quiz] = getObjects(pkg, 'marin:Assessment');
    assert.equal(quiz.name, quizName);
    assert.deepEqual(quiz.isBasedOn, [{ '@id': getObjects(pkg, 'marin:Note')[0]['@id'] }]);
    assert.deepEqual(quiz['marin:selectionPolicy'], { mode: 'all', shuffle: true });
    assert.equal(quiz['marin:scoringPolicy'].passingPercent, 70);
    const questions = questionsOf(pkg);
    assert.equal(questions.length, 10);
    assert.ok(questions.length <= MAX_QUIZ_QUESTIONS);

    const mix = questions.reduce((counts, question) => ({ ...counts, [question['marin:interactionType']]: (counts[question['marin:interactionType']] || 0) + 1 }), {});
    assert.deepEqual(mix, { 'single-select': 8, 'true-false': 2 }, 'no multiple-choice (select all) questions');

    const sectionOf = (question) => getObject(pkg, question.isBasedOn[0]['@id']);
    const perSection = {};
    for (const question of questions) {
      assert.equal(question.isBasedOn.length, 1, 'one source section per question');
      const section = sectionOf(question);
      assert.ok(section['@type'].includes('marin:NoteSection'));
      perSection[section['marin:sectionType']] = (perSection[section['marin:sectionType']] || 0) + 1;
    }
    assert.deepEqual(perSection, { whyItMatters: 1, problem: 1, solution: 1, keyTerms: 3, dosAndDonts: 2, questions: 1, checklist: 1 });
    for (const type of QUIZZED) assert.ok(perSection[type], `${type} is covered`);
  });

  test(`${quizName}: every question is well formed`, async () => {
    const pkg = await load(slug);
    const questions = questionsOf(pkg);
    const texts = new Set();
    const singlePositions = [];
    for (const question of questions) {
      assert.ok(!texts.has(question.text), `duplicate question: ${question.text}`);
      texts.add(question.text);
      assert.ok(question['marin:hint'], 'every question has a hint');
      const label = NOTE_SECTIONS.find((rule) => rule.type === getObject(pkg, question.isBasedOn[0]['@id'])['marin:sectionType']).label.toLowerCase();
      assert.ok(question['marin:explanation'].toLowerCase().includes(label.replace('’', "'")) || question['marin:explanation'].toLowerCase().includes(label), `the explanation names the section “${label}”`);

      // Questions are about the topic, not about the notes.
      const asked = [question.text, question['marin:hint'], ...optionsOf(pkg, question).map((option) => option.text)].join(' | ');
      assert.doesNotMatch(asked, /\bnotes?\b|\bsections?\b/i, `a question, hint, or choice refers to the notes: ${asked}`);

      const options = optionsOf(pkg, question);
      const optionTexts = options.map((option) => option.text);
      assert.equal(new Set(optionTexts).size, options.length, 'no duplicate answer choices');
      assert.ok(!optionTexts.some((text) => /all of the above|none of the above/i.test(text)), 'no catch-all choices');
      const correct = question['marin:correctResponse'].map((reference) => reference['@id']);
      const type = question['marin:interactionType'];
      if (type === 'single-select') {
        assert.equal(options.length, 4);
        assert.equal(correct.length, 1);
        singlePositions.push(options.findIndex((option) => option['@id'] === correct[0]));
      } else {
        assert.deepEqual(optionTexts, ['True', 'False']);
      }
    }
    // The right answer should not sit in the same place every time.
    const counts = [0, 1, 2, 3].map((position) => singlePositions.filter((value) => value === position).length);
    assert.ok(Math.max(...counts) <= 3, `correct answers by position: ${counts}`);
    assert.ok(counts.filter(Boolean).length >= 3, `correct answers use at least three positions: ${counts}`);
    const answers = questions.filter((question) => question['marin:interactionType'] === 'true-false')
      .map((question) => getObject(pkg, question['marin:correctResponse'][0]['@id']).text);
    assert.deepEqual([...answers].sort(), ['False', 'True'], 'one true and one false answer');
  });

  test(`${quizName}: the old course content is gone and nothing refers to it`, async () => {
    const pkg = await load(slug);
    const types = new Set(pkg.graphDocument['@graph'].flatMap((object) => object['@type']));
    for (const gone of ['marin:ContentUnit', 'marin:LearningMaterial', 'marin:Section', 'DefinedTermSet', 'DefinedTerm']) assert.ok(!types.has(gone), gone);
    assert.deepEqual(Object.keys(pkg.contentFiles), []);
    assert.equal(getObjects(pkg, 'marin:LearningSet')[0].isBasedOn, undefined);
  });
}

test('a quiz of more than 10 questions is refused by the schema, the validator, and the builder', () => {
  const pkg = createExampleNotePackage();
  const quiz = getObject(pkg, EXAMPLE_NOTE_IDS.assessment);
  const entries = quiz['marin:itemSequence'].itemListElement;
  for (let position = 2; position <= 11; position += 1) entries.push({ ...entries[0], position });
  assert.ok(validateJsonSchema(pkg.graphDocument).length > 0, 'the schema rejects 11 questions');
  assert.ok(codes(validatePackage(pkg), 'errors').includes('quiz-too-many-questions'));

  const eleven = { name: 'Q', identifier: 'q-quiz', abstract: 'x', passingPercent: 70, grades: [{ name: 'F', minPercent: 0, message: 'm' }],
    questions: Array.from({ length: 11 }, (_, i) => ({ section: 'overview', type: 'true-false', text: `Q${i}`, answer: true, hint: 'h', explanation: 'e' })) };
  assert.throws(() => applyNoteQuiz(pkg.graphDocument, { source: eleven, makeId }), /at most 10/);
});

test('the quiz limit constant matches the schema', async () => {
  const schema = JSON.parse(await readFile(path.join(ROOT, 'schema', 'marin-learn-v1.schema.json'), 'utf8'));
  assert.equal(schema.$defs.assessmentItemSequence.properties.itemListElement.maxItems, MAX_QUIZ_QUESTIONS);
});

test('a random pick from a quiz of 10 or fewer is a warning; Note-sourced questions need no objective', () => {
  const pkg = createExampleNotePackage();
  getObject(pkg, EXAMPLE_NOTE_IDS.assessment)['marin:selectionPolicy'] = { mode: 'random', count: 1, shuffle: true };
  const result = validatePackage(pkg);
  assert.ok(codes(result, 'warnings').includes('selection-redundant'));
  assert.ok(!codes(result, 'warnings').includes('question-no-objective'));
});

test('a question that is too hard to read gets a writing warning', () => {
  const pkg = createExampleNotePackage();
  const question = getObject(pkg, EXAMPLE_NOTE_IDS.question);
  question.text = 'Notwithstanding considerable organizational heterogeneity, which interdepartmental governance methodology most appropriately operationalizes comprehensive information stewardship across jurisdictional boundaries?';
  assert.ok(codes(validatePackage(pkg), 'warnings').includes('question-reading-level'));
});

test('the quiz and deck builders together are repeatable, and the published packages are what they produce', async () => {
  for (const [slug, sourceFile] of COURSES) {
    const title = slug.endsWith('data') ? 'Data 101' : 'Schema 101';
    const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-quiz-'));
    const copy = path.join(temp, `${slug}.zip`);
    await copyFile(path.join(ROOT, 'packages', `${slug}.zip`), copy);
    const rebuild = async () => {
      await buildQuizForPackage(copy, path.join(ROOT, sourceFile));
      await buildDeckForPackage(copy, { abstract: `Slides for walking a team through ${title}.` });
      return readFile(copy);
    };
    const once = await rebuild();
    assert.deepEqual(await rebuild(), once, `${slug}: building twice changes nothing`);
    assert.deepEqual(await readFile(path.join(ROOT, 'packages', `${slug}.zip`)), once, `${slug}: the published package is what the builders produce`);
  }
});

test('the package check script reports no problems for the published courses and refuses a broken one', async () => {
  const { checkPackage } = await import('../scripts/validate_package.mjs');
  for (const [slug] of COURSES) {
    const result = await checkPackage(path.join(ROOT, 'packages', `${slug}.zip`));
    assert.deepEqual([result.errors.length, result.warnings.length], [0, 0], slug);
  }
  const legacy = await checkPackage(path.join(ROOT, 'archive', 'county-leaders-guide-to-data-with-old-quiz-2026-10-15.zip'));
  assert.ok(legacy.errors.some((entry) => entry.code === 'quiz-too-many-questions'), 'the old 16-question quiz is refused');
});
