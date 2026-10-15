// Marin Learn - Build a quiz from a Note.
//
// A quiz is at most 10 questions. Each question points at the Note section it
// tests, so the quiz stays tied to the Note. The question text is authored (see
// source/quizzes/*.json); this module turns that source into graph objects.
import { MAX_QUIZ_QUESTIONS } from './constants.js';
import { ref } from './utils.js';

const LEGACY_TYPES = [
  'marin:ContentUnit', 'marin:Section', 'marin:LearningMaterial', 'DefinedTermSet', 'DefinedTerm',
  'marin:Assessment', 'marin:AssessmentItem', 'marin:ResponseOption', 'marin:GradeScale'
];
const kebab = (text) => text.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
const typesOf = (object) => (Array.isArray(object['@type']) ? object['@type'] : [object['@type']]);

// Questions and answer choices as graph objects. `makeId(key)` returns a stable urn:uuid.
export function buildQuiz(source, { note, sectionIdByType, makeId }) {
  if (source.questions.length > MAX_QUIZ_QUESTIONS) throw new Error(`A quiz has at most ${MAX_QUIZ_QUESTIONS} questions; the source has ${source.questions.length}.`);
  const objects = [];
  const scale = {
    '@id': makeId('grades'),
    '@type': ['marin:GradeScale'],
    identifier: `${source.identifier.replace(/-quiz$/, '')}-grades`,
    name: `${source.name} grades`,
    'marin:gradeBands': source.grades.map((band) => ({ name: band.name, minPercent: band.minPercent, 'marin:message': band.message }))
  };
  objects.push(scale);

  const questionIds = source.questions.map((question, index) => {
    const number = String(index + 1).padStart(2, '0');
    const sectionId = sectionIdByType[question.section];
    if (!sectionId) throw new Error(`Question ${index + 1} names the section “${question.section}”, which the Note does not have.`);
    const options = question.type === 'true-false'
      ? [{ id: 'true', text: 'True', correct: question.answer === true }, { id: 'false', text: 'False', correct: question.answer === false }]
      : question.options.map((option, position) => ({ id: String.fromCharCode(97 + position), text: option.text, correct: Boolean(option.correct) }));
    const optionObjects = options.map((option) => ({
      '@id': makeId(`q${number}/${option.id}`),
      '@type': ['CreativeWork', 'marin:ResponseOption'],
      identifier: question.type === 'true-false' ? option.id : `q${number}-${option.id}`,
      text: option.text
    }));
    const item = {
      '@id': makeId(`q${number}`),
      '@type': ['CreativeWork', 'marin:AssessmentItem'],
      identifier: `q${number}-${kebab(question.section)}`,
      name: question.text,
      text: question.text,
      isBasedOn: [ref(sectionId)],
      'marin:interactionType': question.type,
      'marin:options': { '@type': 'ItemList', itemListElement: optionObjects.map((object, position) => ({ '@type': 'ListItem', position: position + 1, item: ref(object['@id']) })) },
      'marin:correctResponse': optionObjects.filter((_, position) => options[position].correct).map((object) => ref(object['@id'])),
      'marin:hint': question.hint,
      'marin:explanation': question.explanation,
      'marin:shuffleOptions': question.type !== 'true-false'
    };
    objects.push(item, ...optionObjects);
    return item['@id'];
  });

  const assessment = {
    '@id': makeId('quiz'),
    '@type': ['LearningResource', 'marin:Assessment'],
    identifier: source.identifier,
    name: source.name,
    abstract: source.abstract,
    learningResourceType: 'quiz',
    educationalUse: ['assessment'],
    interactivityType: 'active',
    isBasedOn: [ref(note['@id'])],
    'marin:itemSequence': { '@type': 'ItemList', itemListElement: questionIds.map((id, index) => ({ '@type': 'ListItem', position: index + 1, item: ref(id), 'marin:weight': 1 })) },
    'marin:selectionPolicy': { mode: 'all', shuffle: true },
    'marin:scoringPolicy': { method: 'weighted-sum', passingPercent: source.passingPercent, gradeScale: ref(scale['@id']) },
    'marin:feedbackPolicy': { timing: 'after-assessment', showCorrectResponses: true, showOptionFeedback: true, showExplanation: true }
  };
  objects.push(assessment);
  return { objects, assessmentId: assessment['@id'] };
}

// Replace a package's quiz with one built from the Note, and drop the earlier course
// content (reading material, content blocks, objectives) that the old quiz was based on.
// Edits graphDocument in place.
export function applyNoteQuiz(graphDocument, { source, makeId }) {
  const graph = graphDocument['@graph'];
  const note = graph.find((object) => typesOf(object).includes('marin:Note'));
  if (!note) throw new Error('The package has no Note.');
  const sectionIdByType = Object.fromEntries(
    graph.filter((object) => typesOf(object).includes('marin:NoteSection')).map((section) => [section['marin:sectionType'], section['@id']])
  );
  const { objects } = buildQuiz(source, { note, sectionIdByType, makeId });
  const kept = graph.filter((object) => !typesOf(object).some((type) => LEGACY_TYPES.includes(type)));
  graph.splice(0, graph.length, ...kept, ...objects);

  const deck = graph.find((object) => typesOf(object).includes('marin:Presentation'));
  if (deck) deck.isBasedOn = [ref(note['@id'])];

  const root = graph.find((object) => typesOf(object).includes('marin:LearningSet'));
  if (root) {
    if (source.courseDescription) root.description = source.courseDescription;
    delete root.isBasedOn; // the earlier guide is no longer the source
    root.hasPart = graph.filter((object) => object['@id'] !== root['@id']).map((object) => ref(object['@id']));
  }
  return objects;
}
