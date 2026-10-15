import { MAX_QUIZ_QUESTIONS, MAX_SECTION_DEPTH, NOTE_ABSTRACT_MAX, NOTE_TARGET_GRADE, NOTE_SECTIONS, NOTE_TITLE_MAX, TYPES, TYPE_LABELS } from './constants.js';
import { characterCount, lintNote, readingGrade } from './note.js';
import { validateAssetBytes } from './assets.js';
import { extractMarkdownReferences, validateMarkdown } from './markdown.js';
import {
  cleanUndefined,
  getObject,
  getObjects,
  graph,
  hasType,
  objectCategory,
  objectPrimaryType,
  rootLearningSet,
  sequenceItems
} from './model.js';
import { validateJsonSchema } from './schema-validator.js';
import { asArray, isUuidUrn, uuidFromUrn } from './utils.js';

export function validatePackage(pkg) {
  const diagnostics = [];
  const add = (severity, stage, code, message, details = {}) => diagnostics.push({ severity, stage, code, message, ...details });
  if (!pkg?.graphDocument) {
    add('error', 'Structure', 'missing-graph-document', 'The editor state does not contain a graph document.');
    return summarize(diagnostics);
  }

  cleanUndefined(pkg.graphDocument);

  for (const issue of validateJsonSchema(pkg.graphDocument)) {
    add('error', 'Schema', `schema-${issue.keyword}`, issue.message, { path: issue.path });
  }

  const objects = graph(pkg);
  const byId = new Map();
  for (const object of objects) {
    const id = object?.['@id'];
    if (!id) continue;
    if (byId.has(id)) add('error', 'Graph', 'duplicate-id', `Duplicate object identity: ${id}.`, objectDetails(object));
    else byId.set(id, object);
    if (isUuidUrn(id) && /[A-F]/.test(id)) add('warning', 'Graph', 'uuid-casing', `UUID should use lowercase hexadecimal: ${id}.`, objectDetails(object));
  }

  const identifiers = new Map();
  for (const object of objects) {
    if (!object.identifier) continue;
    // The stable true/false option identifiers are intentionally reused by each
    // true/false AssessmentItem. All other identifiers remain category-unique.
    if (hasType(object, TYPES.RESPONSE_OPTION) && ['true', 'false'].includes(object.identifier)) continue;
    const key = `${objectCategory(object)}::${object.identifier}`;
    if (identifiers.has(key)) add('error', 'Graph', 'duplicate-identifier', `Identifier “${object.identifier}” is duplicated within ${typeName(object)} objects.`, objectDetails(object));
    else identifiers.set(key, object['@id']);
  }

  const resolve = (reference, owner, property, allowed = null, required = true) => {
    const id = reference?.['@id'];
    if (!id) {
      if (required) add('error', 'Graph', 'invalid-reference', `${property} does not contain an @id reference.`, objectDetails(owner, property));
      return null;
    }
    const target = byId.get(id);
    if (!target) {
      add('error', 'Graph', 'unresolved-reference', `${property} references missing object ${id}.`, objectDetails(owner, property));
      return null;
    }
    if (allowed && !allowed.some((type) => hasType(target, type))) {
      add('error', 'Graph', 'wrong-reference-type', `${property} must reference ${allowed.map((type) => TYPE_LABELS[type] || type).join(' or ')}, not ${typeName(target)}.`, objectDetails(owner, property));
      return null;
    }
    return target;
  };

  const root = rootLearningSet(pkg);
  if (root?.['marin:startResource']) resolve(root['marin:startResource'], root, 'marin:startResource', [TYPES.NOTE, TYPES.MATERIAL, TYPES.ASSESSMENT, TYPES.PRESENTATION]);

  for (const object of objects) {
    for (const property of ['teaches', 'assesses', 'competencyRequired']) {
      for (const reference of asArray(object[property])) resolve(reference, object, property, [TYPES.OBJECTIVE]);
    }
    for (const reference of asArray(object.hasPart)) resolve(reference, object, 'hasPart');
  }

  validateObjectives(pkg, resolve, add);
  validateContent(pkg, byId, add);
  validateMaterials(pkg, resolve, add);
  validateNotes(pkg, resolve, add);
  validateAssessments(pkg, resolve, add);
  validatePresentations(pkg, resolve, add);
  validateAssets(pkg, add);
  validateReachability(pkg, add);

  diagnostics.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.stage.localeCompare(b.stage) || a.message.localeCompare(b.message));
  return summarize(diagnostics);
}

function validateObjectives(pkg, resolve, add) {
  const sets = getObjects(pkg, TYPES.DEFINED_TERM_SET);
  for (const set of sets) {
    for (const reference of asArray(set.hasDefinedTerm)) resolve(reference, set, 'hasDefinedTerm', [TYPES.OBJECTIVE]);
  }
  const objectives = getObjects(pkg, TYPES.OBJECTIVE);
  for (const objective of objectives) {
    resolve(objective.inDefinedTermSet, objective, 'inDefinedTermSet', [TYPES.DEFINED_TERM_SET]);
    if (objective['marin:parentObjective']) resolve(objective['marin:parentObjective'], objective, 'marin:parentObjective', [TYPES.OBJECTIVE]);
  }
  const parents = new Map(objectives.map((objective) => [objective['@id'], objective['marin:parentObjective']?.['@id']]).filter(([, parent]) => parent));
  for (const objective of objectives) {
    const seen = new Set([objective['@id']]);
    let current = parents.get(objective['@id']);
    while (current) {
      if (seen.has(current)) {
        add('error', 'Semantics', 'objective-cycle', `Objective hierarchy contains a cycle involving “${objective.name}”.`, objectDetails(objective, 'marin:parentObjective'));
        break;
      }
      seen.add(current);
      current = parents.get(current);
    }
  }
  const assessed = new Set(getObjects(pkg, TYPES.ASSESSMENT_ITEM).flatMap((item) => asArray(item.assesses).map((reference) => reference['@id'])));
  for (const objective of objectives) {
    if (!assessed.has(objective['@id'])) add('warning', 'Semantics', 'objective-not-assessed', `Learning objective “${objective.name}” is not assessed by any question.`, objectDetails(objective));
  }
}

function validateContent(pkg, byId, add) {
  const contentUnits = getObjects(pkg, TYPES.CONTENT_UNIT);
  const referencedPaths = new Map();
  const hasRef = (uuid) => byId.has(`urn:uuid:${uuid}`);
  const imageIds = new Set(getObjects(pkg, TYPES.IMAGE).map((asset) => uuidFromUrn(asset['@id'])));
  const hasAsset = (uuid) => imageIds.has(uuid);

  for (const unit of contentUnits) {
    const path = unit.encoding?.contentUrl;
    if (!path) continue;
    if (referencedPaths.has(path)) add('error', 'Structure', 'shared-content-file', `ContentUnits “${referencedPaths.get(path).name}” and “${unit.name}” reference the same Markdown file ${path}.`, objectDetails(unit, 'encoding.contentUrl'));
    else referencedPaths.set(path, unit);
    if (!Object.prototype.hasOwnProperty.call(pkg.contentFiles, path)) {
      add('error', 'Structure', 'missing-content-file', `ContentUnit “${unit.name}” references missing file ${path}.`, objectDetails(unit, 'encoding.contentUrl'));
      continue;
    }
    const markdown = pkg.contentFiles[path];
    if (!String(markdown).trim()) add('error', 'Markdown', 'empty-content-file', `ContentUnit “${unit.name}” has an empty Markdown body.`, objectDetails(unit, 'body', path));
    for (const issue of validateMarkdown(markdown, { hasRef, hasAsset })) {
      add(issue.severity, 'Markdown', issue.code, `${unit.name}: ${issue.message}`, objectDetails(unit, 'body', path, issue.line));
    }
    if (!unit.abstract) add('warning', 'Semantics', 'missing-abstract', `ContentUnit “${unit.name}” has no abstract. Abstracts are often used for presentation slides.`, objectDetails(unit, 'abstract'));
    if (!asArray(unit.teaches).length) add('warning', 'Semantics', 'content-no-objective', `ContentUnit “${unit.name}” is not mapped to a learning objective.`, objectDetails(unit, 'teaches'));
  }
  for (const path of Object.keys(pkg.contentFiles)) {
    if (!referencedPaths.has(path)) add('error', 'Structure', 'orphan-content-file', `Markdown file ${path} is not referenced by a ContentUnit.`, { file: path, route: 'content' });
  }
}

function validateMaterials(pkg, resolve, add) {
  const sectionParents = new Map();
  const visit = (owner, sequence, depth, ancestors = new Set()) => {
    validateSequence(sequence, owner, 'marin:contentSequence', add);
    for (const entry of sequenceItems(owner, 'marin:contentSequence')) {
      const target = resolve(entry.item, owner, 'marin:contentSequence', [TYPES.CONTENT_UNIT, TYPES.SECTION]);
      if (!target || !hasType(target, TYPES.SECTION)) continue;
      if (ancestors.has(target['@id'])) {
        add('error', 'Semantics', 'section-cycle', `Section “${target.name}” contains a nesting cycle.`, objectDetails(target));
        continue;
      }
      if (depth > MAX_SECTION_DEPTH) {
        add('error', 'Semantics', 'section-depth', `Section “${target.name}” exceeds the maximum rendered section depth of ${MAX_SECTION_DEPTH}.`, objectDetails(target));
      }
      const priorParent = sectionParents.get(target['@id']);
      if (priorParent && priorParent !== owner['@id']) add('warning', 'Semantics', 'section-reused', `Section “${target.name}” is reused in more than one sequence.`, objectDetails(target));
      sectionParents.set(target['@id'], owner['@id']);
      visit(target, target['marin:contentSequence'], depth + 1, new Set([...ancestors, target['@id']]));
    }
  };
  for (const material of getObjects(pkg, TYPES.MATERIAL)) {
    visit(material, material['marin:contentSequence'], 1, new Set());
    if (!material.timeRequired) add('warning', 'Semantics', 'material-no-duration', `Learning material “${material.name}” has no estimated duration.`, objectDetails(material, 'timeRequired'));
  }
}

function validateAssessments(pkg, resolve, add) {
  const questionsInAssessment = new Set();
  for (const assessment of getObjects(pkg, TYPES.ASSESSMENT)) {
    validateSequence(assessment['marin:itemSequence'], assessment, 'marin:itemSequence', add);
    const entries = sequenceItems(assessment, 'marin:itemSequence');
    for (const entry of entries) {
      const target = resolve(entry.item, assessment, 'marin:itemSequence', [TYPES.ASSESSMENT_ITEM]);
      if (target) questionsInAssessment.add(target['@id']);
    }
    if (entries.length > MAX_QUIZ_QUESTIONS) add('error', 'Limits', 'quiz-too-many-questions', `Quiz “${assessment.name}” has ${entries.length} questions. A quiz has at most ${MAX_QUIZ_QUESTIONS}.`, objectDetails(assessment, 'marin:itemSequence'));
    const policy = assessment['marin:selectionPolicy'];
    if (policy?.mode === 'random' && entries.length <= MAX_QUIZ_QUESTIONS) add('warning', 'Semantics', 'selection-redundant', `Quiz “${assessment.name}” picks a random set from ${entries.length} questions. A quiz of ${MAX_QUIZ_QUESTIONS} or fewer should ask all of them.`, objectDetails(assessment, 'marin:selectionPolicy'));
    if (policy?.mode === 'random' && policy.count > entries.length) add('error', 'Semantics', 'selection-count', `Quiz “${assessment.name}” selects ${policy.count} questions from a bank of ${entries.length}.`, objectDetails(assessment, 'marin:selectionPolicy.count'));
    const scaleRef = assessment['marin:scoringPolicy']?.gradeScale;
    if (scaleRef) resolve(scaleRef, assessment, 'marin:scoringPolicy.gradeScale', [TYPES.GRADE_SCALE]);
  }

  for (const item of getObjects(pkg, TYPES.ASSESSMENT_ITEM)) {
    validateSequence(item['marin:options'], item, 'marin:options', add);
    const optionIds = new Set();
    for (const entry of sequenceItems(item, 'marin:options')) {
      const target = resolve(entry.item, item, 'marin:options', [TYPES.RESPONSE_OPTION]);
      if (target) optionIds.add(target['@id']);
    }
    const correct = asArray(item['marin:correctResponse']);
    for (const reference of correct) {
      const target = resolve(reference, item, 'marin:correctResponse', [TYPES.RESPONSE_OPTION]);
      if (target && !optionIds.has(target['@id'])) add('error', 'Semantics', 'correct-option-not-member', `Correct response for “${item.name || item.identifier}” is not one of that question’s answer options.`, objectDetails(item, 'marin:correctResponse'));
    }
    const type = item['marin:interactionType'];
    if (type === 'single-select' && correct.length !== 1) add('error', 'Semantics', 'single-select-correct-count', 'A single-select question must have exactly one correct response.', objectDetails(item, 'marin:correctResponse'));
    if (type === 'multiple-select') {
      if (correct.length < 2) add('error', 'Semantics', 'multiple-select-correct-count', 'A multiple-select question must have at least two correct responses.', objectDetails(item, 'marin:correctResponse'));
      if (correct.length === optionIds.size && optionIds.size > 0) add('error', 'Semantics', 'multiple-select-all-correct', 'A multiple-select question cannot mark every option correct.', objectDetails(item, 'marin:correctResponse'));
    }
    if (type === 'true-false') {
      const options = sequenceItems(item, 'marin:options').map((entry) => resolve(entry.item, item, 'marin:options', [TYPES.RESPONSE_OPTION])).filter(Boolean);
      const identifiers = new Set(options.map((option) => option.identifier));
      if (options.length !== 2 || !identifiers.has('true') || !identifiers.has('false')) add('error', 'Semantics', 'true-false-options', 'A true/false question must contain exactly the stable options “true” and “false”.', objectDetails(item, 'marin:options'));
    }
    // Questions based on a Note section need no learning objective: Notes have none.
    const fromNote = asArray(item.isBasedOn).some((source) => source?.['@id'] && getObject(pkg, source['@id']) && hasType(getObject(pkg, source['@id']), TYPES.NOTE_SECTION));
    if (!asArray(item.assesses).length && !fromNote) add('warning', 'Semantics', 'question-no-objective', `Question “${item.name || item.identifier}” does not assess a learning objective.`, objectDetails(item, 'assesses'));
    resolveSources(item, resolve);
    if (fromNote) {
      const words = [item.text, ...sequenceItems(item, 'marin:options').map((entry) => getObject(pkg, entry.item?.['@id'])?.text)].filter(Boolean).join(' ');
      const grade = readingGrade(words);
      if (grade !== null && grade > NOTE_TARGET_GRADE + 1) add('warning', 'Writing', 'question-reading-level', `Question “${item.name || item.identifier}” reads at about grade ${Math.round(grade)}. Aim for grade ${NOTE_TARGET_GRADE} or lower.`, objectDetails(item, 'text'));
    }
    if (!asArray(item.isBasedOn).length) add('warning', 'Semantics', 'question-no-source', `Question “${item.name || item.identifier}” does not identify source content.`, objectDetails(item, 'isBasedOn'));
    if (!questionsInAssessment.has(item['@id'])) add('warning', 'Semantics', 'unused-question', `Question “${item.name || item.identifier}” is not used by a quiz.`, objectDetails(item));
  }

  for (const scale of getObjects(pkg, TYPES.GRADE_SCALE)) {
    const thresholds = new Set();
    let hasZero = false;
    for (const band of asArray(scale['marin:gradeBands'])) {
      if (thresholds.has(band.minPercent)) add('error', 'Semantics', 'duplicate-grade-threshold', `Grade scale “${scale.name}” repeats the ${band.minPercent}% threshold.`, objectDetails(scale, 'marin:gradeBands'));
      thresholds.add(band.minPercent);
      if (band.minPercent === 0) hasZero = true;
    }
    if (!hasZero) add('warning', 'Semantics', 'grade-scale-gap', `Grade scale “${scale.name}” does not define a band beginning at 0%.`, objectDetails(scale, 'marin:gradeBands'));
  }
}

function validatePresentations(pkg, resolve, add) {
  const usedSlides = new Set();
  for (const presentation of getObjects(pkg, TYPES.PRESENTATION)) {
    validateSequence(presentation['marin:slideSequence'], presentation, 'marin:slideSequence', add);
    resolveSources(presentation, resolve);
    for (const entry of sequenceItems(presentation, 'marin:slideSequence')) {
      const slide = resolve(entry.item, presentation, 'marin:slideSequence', [TYPES.SLIDE]);
      if (slide) usedSlides.add(slide['@id']);
    }
  }
  for (const slide of getObjects(pkg, TYPES.SLIDE)) {
    const sequence = slide['marin:contentSequence'];
    if (sequence) {
      validateSequence(sequence, slide, 'marin:contentSequence', add);
      for (const entry of sequenceItems(slide, 'marin:contentSequence')) {
        const unit = resolve(entry.item, slide, 'marin:contentSequence', [TYPES.CONTENT_UNIT, TYPES.NOTE_SECTION]);
        if (!unit) continue;
        const range = entry['marin:itemRange'];
        if (hasType(unit, TYPES.NOTE_SECTION)) {
          if (entry['marin:displayMode'] === 'abstract') add('error', 'Semantics', 'slide-note-abstract', `Slide “${slide.name || slide.identifier}” cannot show the abstract of the Note section “${unit.name}”. Use full or title.`, objectDetails(slide, 'marin:contentSequence'));
          const codeRange = entry['marin:codeRange'];
          if (codeRange) {
            const samples = asArray(unit['marin:code']).length;
            if (unit['marin:sectionType'] !== 'examples') add('error', 'Semantics', 'slide-code-range-target', `Slide “${slide.name || slide.identifier}” uses marin:codeRange on “${unit.name}”, which has no code samples.`, objectDetails(slide, 'marin:contentSequence'));
            else if (codeRange.first > codeRange.last || codeRange.last > samples) add('error', 'Semantics', 'slide-code-range', `Slide “${slide.name || slide.identifier}” shows code samples ${codeRange.first} to ${codeRange.last} of “${unit.name}”, which has ${samples}.`, objectDetails(slide, 'marin:contentSequence'));
          }
          if (range) {
            const count = asArray(unit['marin:items']).length;
            if (range.first > range.last || range.last > count) add('error', 'Semantics', 'slide-item-range', `Slide “${slide.name || slide.identifier}” shows items ${range.first} to ${range.last} of “${unit.name}”, which has ${count} item(s).`, objectDetails(slide, 'marin:contentSequence'));
          }
        } else {
          if (range || entry['marin:codeRange']) add('error', 'Semantics', 'slide-item-range-target', `Slide “${slide.name || slide.identifier}” uses marin:itemRange on “${unit.name}”, which is not a Note section.`, objectDetails(slide, 'marin:contentSequence'));
          if (entry['marin:displayMode'] === 'abstract' && !unit.abstract) add('error', 'Semantics', 'slide-missing-abstract', `Slide “${slide.name || slide.identifier}” uses the abstract of “${unit.name}”, but that ContentUnit has no abstract.`, objectDetails(slide, 'marin:contentSequence'));
        }
      }
    }
    if (!usedSlides.has(slide['@id'])) add('warning', 'Semantics', 'unused-slide', `Slide “${slide.name || slide.identifier}” is not used by a presentation.`, objectDetails(slide));
  }
}

// isBasedOn may name outside works (no @id) or point at content inside the package.
// Internal references must resolve to something that can be a source.
function resolveSources(owner, resolve) {
  for (const reference of asArray(owner.isBasedOn)) {
    if (reference?.['@id']) resolve(reference, owner, 'isBasedOn', [TYPES.CONTENT_UNIT, TYPES.MATERIAL, TYPES.NOTE, TYPES.NOTE_SECTION]);
  }
}

// Notes: twelve sections in the standard order. Maximums are in the JSON Schema.
// Minimums and completeness are errors on a published Note and warnings on a draft.
function validateNotes(pkg, resolve, add) {
  const notes = getObjects(pkg, TYPES.NOTE);
  const sectionsByNote = new Map();
  for (const note of notes) {
    const published = note.creativeWorkStatus === 'published';
    const severity = published ? 'error' : 'warning';
    validateSequence(note['marin:sectionSequence'], note, 'marin:sectionSequence', add);
    const sections = sequenceItems(note, 'marin:sectionSequence')
      .map((entry) => resolve(entry.item, note, 'marin:sectionSequence', [TYPES.NOTE_SECTION]))
      .filter(Boolean);
    sectionsByNote.set(note['@id'], sections);

    const seen = new Set();
    let lastIndex = -1;
    for (const section of sections) {
      const type = section['marin:sectionType'];
      const index = NOTE_SECTIONS.findIndex((rule) => rule.type === type);
      if (seen.has(type)) add('error', 'Semantics', 'note-duplicate-section', `Note “${note.name}” has more than one ${NOTE_SECTIONS[index]?.label || type} section.`, objectDetails(section));
      seen.add(type);
      if (index < lastIndex) add('error', 'Semantics', 'note-section-order', `In Note “${note.name}”, ${NOTE_SECTIONS[index]?.label || type} is out of order. Sections follow the standard order.`, objectDetails(section));
      lastIndex = Math.max(lastIndex, index);
    }

    for (const rule of NOTE_SECTIONS) {
      const section = sections.find((candidate) => candidate['marin:sectionType'] === rule.type);
      if (!section) {
        if (rule.required) add(severity, 'Semantics', 'note-missing-section', `Note “${note.name}” has no ${rule.label} section.`, objectDetails(note, 'marin:sectionSequence'));
        continue;
      }
      if (rule.text) {
        if (!String(section['marin:text'] || '').trim()) add(severity, 'Semantics', 'note-empty-section', `The ${rule.label} of Note “${note.name}” is empty.`, objectDetails(section));
        continue;
      }
      // An Examples section counts its code samples too: one link or one sample is enough.
      const count = asArray(section['marin:items']).length + (rule.code ? asArray(section['marin:code']).length : 0);
      if (count === 0 && !rule.required) {
        add('warning', 'Semantics', 'note-empty-section', `${rule.label} in Note “${note.name}” is empty. Remove the section or add items; an empty section is hidden.`, objectDetails(section));
      } else if (count < rule.min) {
        add(severity, 'Semantics', 'note-too-few-items', `${rule.label} in Note “${note.name}” needs at least ${rule.min} item(s); it has ${count}.`, objectDetails(section, 'marin:items'));
      }
    }

    checkNoteLimits(note, sections, add);
    for (const advice of lintNote(note, sections)) add('warning', 'Writing', advice.code, advice.message, objectDetails(note, advice.field));
  }

  // Quizzes and decks built from a Note should cover its sections. One warning per
  // quiz or deck lists what is missing. Slogans and links are not quizzable.
  const NOT_QUIZZABLE = new Set(['overview', 'userStories', 'examples', 'mantras', 'learnMore']);
  const label = (section) => NOTE_SECTIONS.find((rule) => rule.type === section['marin:sectionType'])?.label || section.name;
  for (const assessment of getObjects(pkg, TYPES.ASSESSMENT)) {
    for (const reference of asArray(assessment.isBasedOn)) {
      const sections = sectionsByNote.get(reference?.['@id']);
      if (!sections) continue;
      const covered = new Set();
      for (const entry of sequenceItems(assessment, 'marin:itemSequence')) {
        const question = getObject(pkg, entry.item?.['@id']);
        for (const source of asArray(question?.isBasedOn)) covered.add(source['@id']);
      }
      const missing = sections.filter((section) => !NOT_QUIZZABLE.has(section['marin:sectionType']) && !covered.has(section['@id']));
      if (missing.length) add('warning', 'Semantics', 'section-no-question', `Quiz “${assessment.name}” has no question based on: ${missing.map(label).join(', ')}.`, objectDetails(assessment, 'isBasedOn'));
    }
  }
  for (const presentation of getObjects(pkg, TYPES.PRESENTATION)) {
    for (const reference of asArray(presentation.isBasedOn)) {
      const sections = sectionsByNote.get(reference?.['@id']);
      if (!sections) continue;
      const covered = new Set();
      for (const entry of sequenceItems(presentation, 'marin:slideSequence')) {
        const slide = getObject(pkg, entry.item?.['@id']);
        for (const content of sequenceItems(slide || {}, 'marin:contentSequence')) covered.add(content.item?.['@id']);
      }
      const missing = sections.filter((section) => !covered.has(section['@id']));
      if (missing.length) add('warning', 'Semantics', 'section-no-slide', `Slide deck “${presentation.name}” shows none of: ${missing.map(label).join(', ')}.`, objectDetails(presentation, 'isBasedOn'));
    }
  }
}

// Plain-language versions of the JSON Schema limits, so authors see which field is
// too long and by how much. The schema still rejects these values on its own.
function checkNoteLimits(note, sections, add) {
  const tooLong = (text, max, where, target) => {
    const length = characterCount(text);
    if (length > max) add('error', 'Limits', 'note-too-long', `${where} is ${length} characters. The limit is ${max}.`, objectDetails(target, where));
  };
  tooLong(note.name, NOTE_TITLE_MAX, 'The Note title', note);
  tooLong(note.abstract, NOTE_ABSTRACT_MAX, 'The short description', note);
  for (const section of sections) {
    const rule = NOTE_SECTIONS.find((candidate) => candidate.type === section['marin:sectionType']);
    if (!rule) continue;
    if (rule.text) {
      tooLong(section['marin:text'] || '', rule.textMax, `The ${rule.label}`, section);
      continue;
    }
    if (rule.code) {
      const samples = asArray(section['marin:code']);
      if (samples.length > rule.code.max) add('error', 'Limits', 'note-too-many-items', `${rule.label} has ${samples.length} code samples. The limit is ${rule.code.max}.`, objectDetails(section, 'marin:code'));
      samples.forEach((sample, index) => {
        const where = `${rule.label}, code sample ${index + 1}`;
        if (!String(sample?.title ?? '').trim() || !String(sample?.code ?? '').trim()) add('error', 'Limits', 'note-incomplete-pair', `${where} needs a title and code.`, objectDetails(section, 'marin:code'));
        else {
          tooLong(sample.title, rule.code.titleMax, `${where} title`, section);
          tooLong(sample.code, rule.code.codeMax, `${where} code`, section);
        }
        if (sample?.language) tooLong(sample.language, rule.code.languageMax, `${where} language`, section);
      });
    }
    const items = asArray(section['marin:items']);
    if (items.length > rule.max) add('error', 'Limits', 'note-too-many-items', `${rule.label} has ${items.length} items. The limit is ${rule.max}.`, objectDetails(section, 'marin:items'));
    items.forEach((item, index) => {
      const where = `${rule.label}, item ${index + 1}`;
      if (typeof item === 'string') {
        tooLong(item, rule.itemMax, where, section);
        return;
      }
      for (const [field, max] of Object.entries(rule.fields || {})) {
        if (!String(item?.[field] ?? '').trim()) add('error', 'Limits', 'note-incomplete-pair', `${where} is missing its ${field === 'dont' ? 'don’t' : field}.`, objectDetails(section, 'marin:items'));
        else tooLong(item[field], max, `${where} ${field === 'dont' ? 'don’t' : field}`, section);
      }
      if (rule.link && !/^https:\/\/\S+$/.test(String(item?.url ?? ''))) add('error', 'Limits', 'note-bad-url', `${where} needs a valid HTTPS link.`, objectDetails(section, 'marin:items'));
    });
  }
}

function validateAssets(pkg, add) {
  const assetObjects = [...getObjects(pkg, TYPES.IMAGE), ...getObjects(pkg, TYPES.MEDIA).filter((object) => !hasType(object, TYPES.IMAGE))];
  const paths = new Map();
  const usedAssetIds = new Set();
  for (const unit of getObjects(pkg, TYPES.CONTENT_UNIT)) {
    const markdown = pkg.contentFiles[unit.encoding?.contentUrl] || '';
    extractMarkdownReferences(markdown).assets.forEach((uuid) => usedAssetIds.add(`urn:uuid:${uuid}`));
  }
  for (const asset of assetObjects) {
    const path = asset.contentUrl;
    if (!path) continue;
    if (paths.has(path)) add('error', 'Assets', 'shared-asset-file', `Assets “${paths.get(path).name}” and “${asset.name}” reference the same file ${path}.`, objectDetails(asset, 'contentUrl'));
    else paths.set(path, asset);
    const file = pkg.assetFiles[path];
    if (!file) {
      add('error', 'Assets', 'missing-asset-file', `Asset “${asset.name}” references missing file ${path}.`, objectDetails(asset, 'contentUrl'));
      continue;
    }
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    for (const issue of validateAssetBytes(bytes, asset.encodingFormat, path)) add(issue.severity, 'Security', issue.code, `${asset.name}: ${issue.message}`, objectDetails(asset, 'contentUrl', path));
    if (asset.contentSize && Number(asset.contentSize) !== bytes.byteLength) add('warning', 'Assets', 'asset-size', `Asset “${asset.name}” declares ${asset.contentSize} bytes but contains ${bytes.byteLength} bytes.`, objectDetails(asset, 'contentSize'));
    if (!usedAssetIds.has(asset['@id'])) add('warning', 'Assets', 'unused-asset', `Asset “${asset.name}” is not used in Markdown.`, objectDetails(asset));
  }
  for (const path of Object.keys(pkg.assetFiles)) {
    if (!paths.has(path)) add('error', 'Assets', 'orphan-asset-file', `Asset file ${path} is not represented by a graph MediaObject.`, { file: path, route: 'assets' });
  }
  const allPaths = [...Object.keys(pkg.contentFiles), ...Object.keys(pkg.assetFiles), 'learning.json'];
  const caseMap = new Map();
  for (const path of allPaths) {
    const lower = path.toLowerCase();
    if (caseMap.has(lower) && caseMap.get(lower) !== path) add('error', 'Structure', 'case-path-collision', `Package paths differ only by letter case: ${caseMap.get(lower)} and ${path}.`, { file: path });
    else caseMap.set(lower, path);
    if (!safePath(path)) add('error', 'Security', 'unsafe-path', `Package path is unsafe: ${path}.`, { file: path });
  }
}

function validateReachability(pkg, add) {
  const root = rootLearningSet(pkg);
  if (!root) return;
  const reachable = new Set([root['@id']]);
  const queue = [root];
  while (queue.length) {
    const object = queue.shift();
    for (const id of collectInternalRefs(object)) {
      if (reachable.has(id)) continue;
      const target = getObject(pkg, id);
      if (target) {
        reachable.add(id);
        queue.push(target);
      }
    }
  }
  for (const object of graph(pkg)) {
    if (!reachable.has(object['@id'])) add('warning', 'Graph', 'unreachable-object', `${typeName(object)} “${object.name || object.identifier}” is not reachable from the LearningSet.`, objectDetails(object));
  }
}

function validateSequence(sequence, owner, property, add) {
  if (!sequence?.itemListElement) return;
  const positions = sequence.itemListElement.map((entry) => entry.position);
  const expected = positions.map((_, index) => index + 1);
  if (new Set(positions).size !== positions.length || positions.some((position, index) => position !== expected[index])) {
    add('error', 'Semantics', 'sequence-position', `${property} positions for “${owner.name || owner.identifier}” must start at 1 and be contiguous in array order.`, objectDetails(owner, property));
  }
}

function collectInternalRefs(value, found = new Set(), parentKey = '') {
  if (!value || typeof value !== 'object') return found;
  if (value['@id'] && Object.keys(value).length === 1 && parentKey !== '') found.add(value['@id']);
  for (const [key, child] of Object.entries(value)) {
    if (key === '@id') continue;
    if (Array.isArray(child)) child.forEach((entry) => collectInternalRefs(entry, found, key));
    else if (child && typeof child === 'object') collectInternalRefs(child, found, key);
  }
  return found;
}

function safePath(path) {
  return typeof path === 'string' && path && !path.includes('\\') && !path.startsWith('/') && !/^[A-Za-z]:/.test(path) && !path.split('/').some((part) => !part || part === '.' || part === '..' || /[\u0000-\u001f\u007f]/.test(part));
}

function objectDetails(object, field = null, file = null, line = null) {
  return {
    objectId: object?.['@id'],
    objectType: objectPrimaryType(object),
    objectName: object?.name || object?.identifier,
    field,
    file,
    line,
    route: routeForObject(object)
  };
}

function routeForObject(object) {
  if (!object) return 'validation';
  if (hasType(object, TYPES.LEARNING_SET)) return 'overview';
  if (hasType(object, TYPES.OBJECTIVE) || hasType(object, TYPES.DEFINED_TERM_SET)) return 'objectives';
  if (hasType(object, TYPES.CONTENT_UNIT)) return 'content';
  if (hasType(object, TYPES.MATERIAL) || hasType(object, TYPES.SECTION)) return 'materials';
  // Notes get their own editor route when the Note editor is added.
  if (hasType(object, TYPES.ASSESSMENT) || hasType(object, TYPES.ASSESSMENT_ITEM) || hasType(object, TYPES.RESPONSE_OPTION) || hasType(object, TYPES.GRADE_SCALE)) return 'quizzes';
  if (hasType(object, TYPES.PRESENTATION) || hasType(object, TYPES.SLIDE)) return 'slides';
  if (hasType(object, TYPES.IMAGE) || hasType(object, TYPES.MEDIA)) return 'assets';
  return 'validation';
}

function typeName(object) {
  return TYPE_LABELS[objectPrimaryType(object)] || objectPrimaryType(object) || 'Object';
}

function severityRank(severity) {
  return severity === 'error' ? 0 : severity === 'warning' ? 1 : 2;
}

function summarize(diagnostics) {
  return {
    diagnostics,
    errors: diagnostics.filter((item) => item.severity === 'error'),
    warnings: diagnostics.filter((item) => item.severity === 'warning'),
    information: diagnostics.filter((item) => item.severity === 'information'),
    valid: diagnostics.every((item) => item.severity !== 'error')
  };
}
