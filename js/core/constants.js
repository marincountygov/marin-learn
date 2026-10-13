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

export const APP_VERSION = '0.1.0';
export const EDITOR_STORAGE_VERSION = 1;
export const MAX_SECTION_DEPTH = 3;
export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_ENTRY_BYTES = 25 * 1024 * 1024;
export const MAX_ZIP_RATIO = 100;
