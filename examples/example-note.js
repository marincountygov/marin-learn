// A small, valid Note package for tests and for building the Note viewer.
// The topic and text are sample content only. They are not published Marin Learn content.
import { JSONLD_CONTEXT, SCHEMA_VERSION } from '../js/core/constants.js';
import { ref } from '../js/core/utils.js';

const id = (number) => `urn:uuid:20000000-0000-4000-8000-${String(number).padStart(12, '0')}`;

export const EXAMPLE_NOTE_IDS = Object.freeze({
  set: id(1), note: id(2), assessment: id(40), question: id(41), presentation: id(50), slide: id(51),
  sections: {
    overview: id(10), whyItMatters: id(11), problem: id(20), solution: id(21), userStories: id(12), keyTerms: id(13), dosAndDonts: id(14),
    questions: id(15), examples: id(16), checklist: id(17), mantras: id(18), learnMore: id(19)
  }
});

const SECTIONS = [
  ['overview', 'Overview', { 'marin:text': 'Plain language helps people find what they need and act on it. This sample note shows the Note format. Write short sentences. Use common words. Say what you want the reader to do.' }],
  ['whyItMatters', 'Why it matters', { 'marin:items': ['People can use a service only if they understand it.', 'Clear writing saves staff time on follow-up calls.', 'Plain words make public information fair for everyone.'] }],
  ['problem', 'Problem', { 'marin:text': 'Many notices and forms are hard to read. People miss what they need to do, and staff spend time answering the same questions.' }],
  ['solution', 'Solution', { 'marin:text': 'Write in plain language. Lead with the action, use short sentences and common words, and test the text with a real reader.' }],
  ['userStories', 'User stories', { 'marin:items': ['As a resident, I want a short form so I can finish it on my phone.', 'As a manager, I want clear emails so my team knows the next step.', 'As a clerk, I want simple notices so fewer people call with questions.'] }],
  ['keyTerms', 'Key terms', { 'marin:items': [
    { term: 'Plain language', definition: 'Writing your reader can understand the first time they read it.' },
    { term: 'Active voice', definition: 'A sentence where the doer comes first: "The clerk reviews the form."' },
    { term: 'Reading level', definition: 'The school grade a person needs to read a text with ease.' },
    { term: 'Jargon', definition: 'Words only insiders know.' },
    { term: 'Call to action', definition: 'The one thing you want the reader to do next.' },
    { term: 'Sentence case', definition: 'Capitalize the first word and proper names only.' }] }],
  ['dosAndDonts', 'Do’s and don’ts', { 'marin:items': [
    { do: 'Lead with what the reader needs.', dont: 'Bury the main point in the last paragraph.' },
    { do: 'Use short sentences.', dont: 'Pack three ideas into one sentence.' },
    { do: 'Explain any term you must use.', dont: 'Assume everyone knows your acronyms.' },
    { do: 'Test with a real reader.', dont: 'Guess what will make sense.' }] }],
  ['questions', 'Questions to ask', { 'marin:items': ['Who is the reader?', 'What do they need to do?', 'Which words might they not know?', 'What is the one main point?', 'How will we know it worked?'] }],
  ['examples', 'Examples', { 'marin:items': [
    { title: 'Sample example one', url: 'https://example.gov/one' },
    { title: 'Sample example two', url: 'https://example.gov/two' },
    { title: 'Sample example three', url: 'https://example.gov/three' }],
    'marin:code': [{ title: 'Sample record', language: 'json', code: '{\n  "requestId": "SR-1042",\n  "status": "new"\n}' }] }],
  ['checklist', 'Checklist', { 'marin:items': ['The first sentence says what the reader should do.', 'Sentences are short.', 'Every unusual term is explained.', 'Headings use sentence case.', 'A person outside the team has read it.'] }],
  ['mantras', 'Mantras', { 'marin:items': ['Say it simply.', 'Lead with the action.', 'Write for the reader.'] }],
  ['learnMore', 'Sources', { 'marin:items': [{ title: 'Federal Data Strategy principles', url: 'https://strategy.data.gov/principles/' }] }]
];

export function createExampleNotePackage({ status = 'published', withExamples = true } = {}) {
  const sections = SECTIONS
    .filter(([type]) => withExamples || type !== 'examples')
    .map(([type, name, body]) => ({
      '@id': EXAMPLE_NOTE_IDS.sections[type],
      '@type': ['CreativeWork', 'marin:NoteSection'],
      identifier: `sample-${type.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`,
      name,
      'marin:sectionType': type,
      ...structuredClone(body)
    }));

  const objects = [
    {
      '@id': EXAMPLE_NOTE_IDS.set,
      '@type': ['LearningResource', 'marin:LearningSet'],
      identifier: 'sample-note-course',
      name: 'Sample note course',
      abstract: 'A sample course used to test Notes.',
      schemaVersion: SCHEMA_VERSION,
      inLanguage: 'en-US',
      version: '1.0.0',
      dateCreated: '2026-10-14',
      dateModified: '2026-10-14',
      creativeWorkStatus: status,
      educationalLevel: 'introductory',
      'marin:startResource': ref(EXAMPLE_NOTE_IDS.note)
    },
    {
      '@id': EXAMPLE_NOTE_IDS.note,
      '@type': ['LearningResource', 'marin:Note'],
      identifier: 'plain-language-101',
      name: 'Plain language 101',
      abstract: 'Write so your reader understands the first time.',
      inLanguage: 'en-US',
      creativeWorkStatus: status,
      audience: [{ '@type': 'EducationalAudience', audienceType: 'County executives and staff', educationalRole: 'learner' }],
      'marin:sectionSequence': {
        '@type': 'ItemList',
        itemListElement: sections.map((section, index) => ({ '@type': 'ListItem', position: index + 1, item: ref(section['@id']) }))
      }
    },
    ...sections,
    {
      '@id': EXAMPLE_NOTE_IDS.question,
      '@type': ['CreativeWork', 'marin:AssessmentItem'],
      identifier: 'sample-question',
      text: 'Which sentence uses the active voice?',
      isBasedOn: [ref(EXAMPLE_NOTE_IDS.sections.keyTerms)],
      'marin:interactionType': 'single-select',
      'marin:options': { '@type': 'ItemList', itemListElement: [
        { '@type': 'ListItem', position: 1, item: ref(id(42)) },
        { '@type': 'ListItem', position: 2, item: ref(id(43)) }] },
      'marin:correctResponse': [ref(id(42))]
    },
    { '@id': id(42), '@type': ['CreativeWork', 'marin:ResponseOption'], identifier: 'sample-option-a', text: 'The clerk reviews the form.' },
    { '@id': id(43), '@type': ['CreativeWork', 'marin:ResponseOption'], identifier: 'sample-option-b', text: 'The form is reviewed by the clerk.' },
    {
      '@id': EXAMPLE_NOTE_IDS.assessment,
      '@type': ['LearningResource', 'marin:Assessment'],
      identifier: 'sample-quiz',
      name: 'Plain language 101 quiz',
      learningResourceType: 'quiz',
      interactivityType: 'active',
      isBasedOn: [ref(EXAMPLE_NOTE_IDS.note)],
      'marin:itemSequence': { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: ref(EXAMPLE_NOTE_IDS.question) }] },
      'marin:selectionPolicy': { mode: 'all', shuffle: false },
      'marin:scoringPolicy': { method: 'weighted-sum', passingPercent: 70 },
      'marin:feedbackPolicy': { timing: 'after-assessment', showCorrectResponses: true, showOptionFeedback: true, showExplanation: true }
    },
    {
      '@id': EXAMPLE_NOTE_IDS.slide,
      '@type': ['CreativeWork', 'marin:Slide'],
      identifier: 'sample-slide',
      name: 'Key terms',
      'marin:layout': 'content',
      'marin:contentSequence': { '@type': 'ItemList', itemListElement: [
        { '@type': 'ListItem', position: 1, item: ref(EXAMPLE_NOTE_IDS.sections.keyTerms), 'marin:displayMode': 'full', 'marin:itemRange': { first: 1, last: 3 } }] }
    },
    {
      '@id': EXAMPLE_NOTE_IDS.presentation,
      '@type': ['PresentationDigitalDocument', 'marin:Presentation'],
      identifier: 'sample-deck',
      name: 'Plain language 101 slides',
      learningResourceType: 'presentation',
      isBasedOn: [ref(EXAMPLE_NOTE_IDS.note)],
      'marin:slideSequence': { '@type': 'ItemList', itemListElement: [{ '@type': 'ListItem', position: 1, item: ref(EXAMPLE_NOTE_IDS.slide) }] }
    }
  ];

  const root = objects[0];
  root.hasPart = objects.slice(1).map((object) => ref(object['@id']));

  return {
    editorStateVersion: 1,
    graphDocument: { '@context': structuredClone(JSONLD_CONTEXT), '@graph': objects },
    contentFiles: {},
    assetFiles: {},
    packageWarnings: [],
    packageName: 'sample-note-course.zip'
  };
}
