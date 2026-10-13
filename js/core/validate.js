import { MAX_SECTION_DEPTH, TYPES, TYPE_LABELS } from './constants.js';
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
  if (root?.['marin:startResource']) resolve(root['marin:startResource'], root, 'marin:startResource', [TYPES.MATERIAL, TYPES.ASSESSMENT, TYPES.PRESENTATION]);

  for (const object of objects) {
    for (const property of ['teaches', 'assesses', 'competencyRequired']) {
      for (const reference of asArray(object[property])) resolve(reference, object, property, [TYPES.OBJECTIVE]);
    }
    for (const reference of asArray(object.hasPart)) resolve(reference, object, 'hasPart');
  }

  validateObjectives(pkg, resolve, add);
  validateContent(pkg, byId, add);
  validateMaterials(pkg, resolve, add);
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
    const policy = assessment['marin:selectionPolicy'];
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
    if (!asArray(item.assesses).length) add('warning', 'Semantics', 'question-no-objective', `Question “${item.name || item.identifier}” does not assess a learning objective.`, objectDetails(item, 'assesses'));
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
        const unit = resolve(entry.item, slide, 'marin:contentSequence', [TYPES.CONTENT_UNIT]);
        if (unit && entry['marin:displayMode'] === 'abstract' && !unit.abstract) add('error', 'Semantics', 'slide-missing-abstract', `Slide “${slide.name || slide.identifier}” uses the abstract of “${unit.name}”, but that ContentUnit has no abstract.`, objectDetails(slide, 'marin:contentSequence'));
      }
    }
    if (!usedSlides.has(slide['@id'])) add('warning', 'Semantics', 'unused-slide', `Slide “${slide.name || slide.identifier}” is not used by a presentation.`, objectDetails(slide));
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
