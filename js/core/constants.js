export const SCHEMA_VERSION = '1.0.0';
export const SCHEMA_URL = 'https://marincountygov.github.io/marin-learn/schema/v1/marin-learn-v1.schema.json';
export const MARIN_NAMESPACE = 'https://marincountygov.github.io/marin-learn/ns#';
export const JSONLD_CONTEXT = ['https://schema.org', { marin: MARIN_NAMESPACE }];

export const TYPES = Object.freeze({
  LEARNING_SET: 'marin:LearningSet',
  DEFINED_TERM_SET: 'DefinedTermSet',
  OBJECTIVE: 'DefinedTerm',
  AUDIENCE: 'EducationalAudience',
  CONTENT_UNIT: 'marin:ContentUnit',
  MATERIAL: 'marin:LearningMaterial',
  NOTE: 'marin:Note',
  NOTE_SECTION: 'marin:NoteSection',
  SECTION: 'marin:Section',
  ASSESSMENT: 'marin:Assessment',
  ASSESSMENT_ITEM: 'marin:AssessmentItem',
  RESPONSE_OPTION: 'marin:ResponseOption',
  GRADE_SCALE: 'marin:GradeScale',
  PRESENTATION: 'marin:Presentation',
  SLIDE: 'marin:Slide',
  IMAGE: 'ImageObject',
  MEDIA: 'MediaObject'
});

export const CONTENT_TYPES = Object.freeze([
  'topic', 'overview', 'concept', 'procedure', 'reference',
  'example', 'key-points', 'summary', 'note', 'warning'
]);

export const MATERIAL_TYPES = Object.freeze(['reading', 'guide', 'lesson', 'handout', 'reference']);
export const QUESTION_TYPES = Object.freeze(['single-select', 'multiple-select', 'true-false']);
export const SLIDE_LAYOUTS = Object.freeze(['title', 'section', 'content', 'split', 'media', 'quote']);
export const SLIDE_DISPLAY_MODES = Object.freeze(['full', 'abstract', 'title']);
export const STATUSES = Object.freeze(['draft', 'review', 'published', 'retired']);
export const EDUCATIONAL_LEVELS = Object.freeze(['introductory', 'intermediate', 'advanced']);
export const FEEDBACK_TIMINGS = Object.freeze(['after-item', 'after-assessment', 'none']);
export const SELECTION_MODES = Object.freeze(['all', 'random']);

export const IMAGE_TYPES = Object.freeze({
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg'
});

export const TYPE_LABELS = Object.freeze({
  [TYPES.LEARNING_SET]: 'Learning set',
  [TYPES.DEFINED_TERM_SET]: 'Objective set',
  [TYPES.OBJECTIVE]: 'Learning objective',
  [TYPES.AUDIENCE]: 'Audience',
  [TYPES.CONTENT_UNIT]: 'Content unit',
  [TYPES.MATERIAL]: 'Learning material',
  [TYPES.NOTE]: 'Note',
  [TYPES.NOTE_SECTION]: 'Note section',
  [TYPES.SECTION]: 'Section',
  [TYPES.ASSESSMENT]: 'Quiz',
  [TYPES.ASSESSMENT_ITEM]: 'Question',
  [TYPES.RESPONSE_OPTION]: 'Answer option',
  [TYPES.GRADE_SCALE]: 'Grade scale',
  [TYPES.PRESENTATION]: 'Slide deck',
  [TYPES.SLIDE]: 'Slide',
  [TYPES.IMAGE]: 'Image',
  [TYPES.MEDIA]: 'Media asset'
});

// The twelve Note sections, in required reading order. The Note's title is the
// thirteenth part. Limits count characters (code points) including spaces and must
// match schema/marin-learn-v1.schema.json (a test keeps them in step).
// min/max are item counts; `text` sections (overview, problem, solution) hold plain text up to textMax; item limits are
// per field. `required: false` sections are hidden when empty.
export const NOTE_SECTIONS = Object.freeze([
  { type: 'overview', label: 'Overview', required: true, text: true, textMax: 600 },
  { type: 'whyItMatters', label: 'Why it matters', required: true, min: 3, max: 5, itemMax: 150 },
  { type: 'problem', label: 'Problem', required: true, text: true, textMax: 300 },
  { type: 'solution', label: 'Solution', required: true, text: true, textMax: 300 },
  { type: 'userStories', label: 'User stories', required: true, min: 3, max: 4, itemMax: 200 },
  { type: 'keyTerms', label: 'Key terms', required: true, min: 6, max: 10, fields: { term: 50, definition: 120 } },
  { type: 'dosAndDonts', label: 'Do\u2019s and don\u2019ts', required: true, min: 4, max: 6, fields: { do: 100, dont: 100 } },
  { type: 'questions', label: 'Questions to ask', required: true, min: 5, max: 8, itemMax: 150 },
  { type: 'examples', label: 'Examples', required: false, min: 1, max: 6, fields: { title: 100 }, link: true, code: { max: 3, titleMax: 100, languageMax: 20, codeMax: 1500 } },
  { type: 'checklist', label: 'Checklist', required: true, min: 5, max: 8, itemMax: 125 },
  { type: 'mantras', label: 'Mantras', required: true, min: 3, max: 5, itemMax: 60 },
  { type: 'learnMore', label: 'Sources', required: false, min: 1, max: 5, fields: { title: 100 }, link: true }
]);
// A quiz has at most this many questions. The JSON Schema enforces it too.
export const MAX_QUIZ_QUESTIONS = 10;
export const NOTE_TITLE_MAX = 60;
export const NOTE_ABSTRACT_MAX = 120;
export const NOTE_TARGET_GRADE = 6;

export const APP_VERSION = '0.1.0';
export const EDITOR_STORAGE_VERSION = 1;
export const MAX_SECTION_DEPTH = 3;
export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_ENTRY_BYTES = 25 * 1024 * 1024;
export const MAX_ZIP_RATIO = 100;
