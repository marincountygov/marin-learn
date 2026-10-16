import {
  CONTENT_TYPES,
  EDUCATIONAL_LEVELS,
  JSONLD_CONTEXT,
  MATERIAL_TYPES,
  SCHEMA_VERSION,
  STATUSES,
  TYPES
} from './constants.js';
import {
  asArray,
  deepClone,
  ref,
  safeFilename,
  slugify,
  todayIso,
  uniquePath,
  uniqueValue,
  uuidUrn
} from './utils.js';

export function createEmptyPackage(title = 'Untitled learning set', description = '') {
  const rootId = uuidUrn();
  const identifier = slugify(title, 'learning-set');
  const learningSet = {
    '@id': rootId,
    '@type': ['LearningResource', TYPES.LEARNING_SET],
    identifier,
    name: title,
    schemaVersion: SCHEMA_VERSION,
    inLanguage: 'en-US',
    version: '0.1.0',
    dateCreated: todayIso(),
    dateModified: todayIso(),
    creativeWorkStatus: 'draft',
    educationalLevel: 'introductory',
    description: description || undefined,
  };
  cleanUndefined(learningSet);
  return {
    editorStateVersion: 1,
    graphDocument: {
      '@context': deepClone(JSONLD_CONTEXT),
      '@graph': [learningSet]
    },
    contentFiles: {},
    assetFiles: {},
    packageWarnings: [],
    packageName: `${identifier}.zip`
  };
}

export function graph(pkg) {
  return pkg.graphDocument['@graph'];
}

export function rootLearningSet(pkg) {
  return graph(pkg).find((object) => hasType(object, TYPES.LEARNING_SET));
}

export function hasType(object, type) {
  return asArray(object?.['@type']).includes(type);
}

export function getObjects(pkg, type) {
  return graph(pkg).filter((object) => hasType(object, type));
}

export function getObject(pkg, id) {
  return graph(pkg).find((object) => object['@id'] === id);
}

export function objectPrimaryType(object) {
  const types = asArray(object?.['@type']);
  const priority = [
    TYPES.LEARNING_SET, TYPES.DEFINED_TERM_SET, TYPES.OBJECTIVE, TYPES.AUDIENCE,
    TYPES.CONTENT_UNIT, TYPES.MATERIAL, TYPES.NOTE, TYPES.NOTE_SECTION, TYPES.SECTION, TYPES.ASSESSMENT,
    TYPES.ASSESSMENT_ITEM, TYPES.RESPONSE_OPTION, TYPES.GRADE_SCALE,
    TYPES.PRESENTATION, TYPES.SLIDE, TYPES.IMAGE, TYPES.MEDIA
  ];
  return priority.find((type) => types.includes(type)) || types.at(-1) || '';
}

export function objectCategory(object) {
  const type = objectPrimaryType(object);
  if ([TYPES.IMAGE, TYPES.MEDIA].includes(type)) return 'asset';
  return type || 'unknown';
}

export function uniqueIdentifierFor(pkg, requested, category, exceptId = null) {
  const existing = new Set(
    graph(pkg)
      .filter((object) => object['@id'] !== exceptId && objectCategory(object) === category)
      .map((object) => object.identifier)
      .filter(Boolean)
  );
  return uniqueValue(slugify(requested, 'item'), existing);
}

export function addGraphObject(pkg, object) {
  graph(pkg).push(object);
  syncRootMembership(pkg);
  touchPackage(pkg);
  return object;
}

export function removeGraphObject(pkg, id) {
  const index = graph(pkg).findIndex((object) => object['@id'] === id);
  if (index === -1) return null;
  const [removed] = graph(pkg).splice(index, 1);
  removeReferences(pkg, id);

  if (hasType(removed, TYPES.CONTENT_UNIT)) {
    const path = removed.encoding?.contentUrl;
    if (path) delete pkg.contentFiles[path];
  }
  if (hasType(removed, TYPES.IMAGE) || hasType(removed, TYPES.MEDIA)) {
    const path = removed.contentUrl;
    if (path) delete pkg.assetFiles[path];
  }
  if (hasType(removed, TYPES.OBJECTIVE)) {
    const set = getObjects(pkg, TYPES.DEFINED_TERM_SET)[0];
    if (set) {
      set.hasDefinedTerm = asArray(set.hasDefinedTerm).filter((entry) => entry['@id'] !== id);
      if (!set.hasDefinedTerm.length) {
        const setIndex = graph(pkg).findIndex((item) => item['@id'] === set['@id']);
        if (setIndex >= 0) graph(pkg).splice(setIndex, 1);
      }
    }
  }
  syncRootMembership(pkg);
  touchPackage(pkg);
  return removed;
}

export function removeReferences(pkg, id) {
  for (const object of graph(pkg)) {
    removeIdRecursively(object, id);
  }
}

function removeIdRecursively(value, id) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      value[key] = child.filter((entry) => {
        if (!entry || typeof entry !== 'object') return true;
        if (entry['@id'] === id) return false;
        if (entry.item && entry.item['@id'] === id) return false;
        return true;
      });
      if (value['@type'] === 'ItemList' && key === 'itemListElement') {
        renumberSequence(value);
      }
      for (const entry of value[key]) removeIdRecursively(entry, id);
    } else if (child && typeof child === 'object') {
      if (child['@id'] === id && Object.keys(child).length === 1) {
        delete value[key];
      } else {
        removeIdRecursively(child, id);
      }
    }
  }
}

export function syncRootMembership(pkg) {
  const root = rootLearningSet(pkg);
  if (!root) return;
  const members = graph(pkg)
    .filter((object) => object['@id'] !== root['@id'])
    .map((object) => ref(object['@id']));
  if (members.length) root.hasPart = members;
  else delete root.hasPart;
}

export function touchPackage(pkg) {
  const root = rootLearningSet(pkg);
  if (root) root.dateModified = todayIso();
}

export { ref } from './utils.js';

export function getOrCreateObjectiveSet(pkg) {
  let objectiveSet = getObjects(pkg, TYPES.DEFINED_TERM_SET)[0];
  if (objectiveSet) return objectiveSet;
  objectiveSet = {
    '@id': uuidUrn(),
    '@type': [TYPES.DEFINED_TERM_SET],
    identifier: uniqueIdentifierFor(pkg, 'learning-objectives', TYPES.DEFINED_TERM_SET),
    name: 'Learning objectives',
    hasDefinedTerm: []
  };
  addGraphObject(pkg, objectiveSet);
  return objectiveSet;
}

export function createObjective(pkg, name = 'New learning objective', parentId = null) {
  const set = getOrCreateObjectiveSet(pkg);
  const objective = {
    '@id': uuidUrn(),
    '@type': [TYPES.OBJECTIVE],
    identifier: uniqueIdentifierFor(pkg, name, TYPES.OBJECTIVE),
    name,
    inDefinedTermSet: ref(set['@id'])
  };
  if (parentId) {
    objective['marin:parentObjective'] = ref(parentId);
  }
  addGraphObject(pkg, objective);
  set.hasDefinedTerm = asArray(set.hasDefinedTerm);
  set.hasDefinedTerm.push(ref(objective['@id']));
  syncRootMembership(pkg);
  touchPackage(pkg);
  return objective;
}

export function canSetObjectiveParent(pkg, objectiveId, proposedParentId) {
  if (!proposedParentId) return true;
  if (objectiveId === proposedParentId) return false;
  let current = getObject(pkg, proposedParentId);
  const visited = new Set([objectiveId]);
  while (current && current['marin:parentObjective']) {
    const parentId = current['marin:parentObjective']['@id'];
    if (visited.has(parentId)) return false;
    visited.add(parentId);
    current = getObject(pkg, parentId);
  }
  return true;
}

export function getObjectiveUsages(pkg, objectiveId) {
  const taughtBy = [];
  const assessedBy = [];
  for (const object of graph(pkg)) {
    if (hasType(object, TYPES.CONTENT_UNIT) || hasType(object, TYPES.MATERIAL)) {
      if (asArray(object.teaches).some((e) => e?.['@id'] === objectiveId)) {
        taughtBy.push(object);
      }
    }
    if (hasType(object, TYPES.ASSESSMENT_ITEM)) {
      if (asArray(object.assesses).some((e) => e?.['@id'] === objectiveId)) {
        assessedBy.push(object);
      }
    }
  }
  return { taughtBy, assessedBy };
}

export function deleteObjective(pkg, objectiveId) {
  for (const obj of getObjects(pkg, TYPES.OBJECTIVE)) {
    if (obj['marin:parentObjective']?.['@id'] === objectiveId) {
      delete obj['marin:parentObjective'];
    }
  }
  return removeGraphObject(pkg, objectiveId);
}

export function createContentUnit(pkg, name = 'New content unit', type = 'topic') {
  const identifier = uniqueIdentifierFor(pkg, name, TYPES.CONTENT_UNIT);
  const existing = new Set(Object.keys(pkg.contentFiles));
  const path = uniquePath(`content/${safeFilename(identifier)}.md`, existing);
  const unit = {
    '@id': uuidUrn(),
    '@type': ['LearningResource', TYPES.CONTENT_UNIT],
    identifier,
    name,
    learningResourceType: CONTENT_TYPES.includes(type) ? type : 'topic',
    encoding: {
      '@type': 'MediaObject',
      contentUrl: path,
      encodingFormat: 'text/markdown'
    }
  };
  pkg.contentFiles[path] = '';
  addGraphObject(pkg, unit);
  return unit;
}

export function createMaterial(pkg, name = 'New learning material', type = 'lesson') {
  const material = {
    '@id': uuidUrn(),
    '@type': ['LearningResource', TYPES.MATERIAL],
    identifier: uniqueIdentifierFor(pkg, name, TYPES.MATERIAL),
    name,
    learningResourceType: MATERIAL_TYPES.includes(type) ? type : 'lesson',
    'marin:contentSequence': emptyItemList()
  };
  addGraphObject(pkg, material);
  return material;
}

export function createSection(pkg, name = 'New section') {
  const section = {
    '@id': uuidUrn(),
    '@type': ['CreativeWork', TYPES.SECTION],
    identifier: uniqueIdentifierFor(pkg, name, TYPES.SECTION),
    name,
    'marin:contentSequence': emptyItemList()
  };
  addGraphObject(pkg, section);
  return section;
}

export function createAssessment(pkg, name = 'New quiz') {
  const assessment = {
    '@id': uuidUrn(),
    '@type': ['LearningResource', TYPES.ASSESSMENT],
    identifier: uniqueIdentifierFor(pkg, name, TYPES.ASSESSMENT),
    name,
    learningResourceType: 'quiz',
    educationalUse: ['assessment'],
    interactivityType: 'active',
    'marin:itemSequence': emptyItemList(),
    'marin:selectionPolicy': { mode: 'all', shuffle: false },
    'marin:scoringPolicy': { method: 'weighted-sum' },
    'marin:feedbackPolicy': {
      timing: 'after-assessment',
      showCorrectResponses: true,
      showOptionFeedback: true,
      showExplanation: true
    }
  };
  addGraphObject(pkg, assessment);
  return assessment;
}

export function createAssessmentItem(pkg, type = 'single-select', prompt = 'New question') {
  const item = {
    '@id': uuidUrn(),
    '@type': ['CreativeWork', TYPES.ASSESSMENT_ITEM],
    identifier: uniqueIdentifierFor(pkg, prompt, TYPES.ASSESSMENT_ITEM),
    text: prompt,
    'marin:interactionType': type,
    'marin:options': emptyItemList(),
    'marin:correctResponse': [],
    'marin:shuffleOptions': false
  };
  addGraphObject(pkg, item);
  if (type === 'true-false') {
    const trueOption = createResponseOption(pkg, 'True', 'true');
    const falseOption = createResponseOption(pkg, 'False', 'false');
    setSequence(item['marin:options'], [trueOption['@id'], falseOption['@id']]);
    item['marin:correctResponse'] = [ref(trueOption['@id'])];
  } else {
    const first = createResponseOption(pkg, 'First answer');
    const second = createResponseOption(pkg, 'Second answer');
    setSequence(item['marin:options'], [first['@id'], second['@id']]);
    item['marin:correctResponse'] = [ref(first['@id'])];
  }
  return item;
}

export function createResponseOption(pkg, text = 'Answer option', requestedIdentifier = null) {
  const stableBooleanIdentifier = ['true', 'false'].includes(requestedIdentifier) ? requestedIdentifier : null;
  const option = {
    '@id': uuidUrn(),
    '@type': ['CreativeWork', TYPES.RESPONSE_OPTION],
    // Each true/false item uses the same stable local option identifiers. The
    // package-wide @id remains unique and is always used for references.
    identifier: stableBooleanIdentifier || uniqueIdentifierFor(pkg, requestedIdentifier || text, TYPES.RESPONSE_OPTION),
    text
  };
  addGraphObject(pkg, option);
  return option;
}

export function duplicateAssessmentItem(pkg, itemId, requestedPrompt = null) {
  const original = getObject(pkg, itemId);
  if (!original || !hasType(original, TYPES.ASSESSMENT_ITEM)) return null;

  const newItemId = uuidUrn();
  const prompt = requestedPrompt || `${original.text || original.name || 'Question'} (Copy)`;
  const identifier = uniqueIdentifierFor(pkg, prompt, TYPES.ASSESSMENT_ITEM);

  const duplicate = deepClone(original);
  duplicate['@id'] = newItemId;
  duplicate.identifier = identifier;
  duplicate.text = prompt;
  if (duplicate.name) duplicate.name = prompt;

  const idMap = new Map();
  const oldOptions = sequenceItems(original, 'marin:options');
  const newOptionIds = [];

  for (const optEntry of oldOptions) {
    const oldOpt = getObject(pkg, optEntry.item?.['@id']);
    if (oldOpt) {
      const newOpt = createResponseOption(pkg, oldOpt.text, oldOpt.identifier);
      if (oldOpt['marin:feedback']) newOpt['marin:feedback'] = oldOpt['marin:feedback'];
      idMap.set(oldOpt['@id'], newOpt['@id']);
      newOptionIds.push(newOpt['@id']);
    }
  }

  setSequence(duplicate['marin:options'], newOptionIds);
  duplicate['marin:correctResponse'] = asArray(original['marin:correctResponse'])
    .map((r) => idMap.get(r?.['@id']))
    .filter(Boolean)
    .map(ref);

  cleanUndefined(duplicate);
  addGraphObject(pkg, duplicate);
  return duplicate;
}

export function duplicateAssessment(pkg, assessmentId, requestedName = null) {
  const original = getObject(pkg, assessmentId);
  if (!original || !hasType(original, TYPES.ASSESSMENT)) return null;

  const newId = uuidUrn();
  const name = requestedName || `${original.name} (Copy)`;
  const identifier = uniqueIdentifierFor(pkg, name, TYPES.ASSESSMENT);

  const duplicate = deepClone(original);
  duplicate['@id'] = newId;
  duplicate.identifier = identifier;
  duplicate.name = name;
  cleanUndefined(duplicate);
  addGraphObject(pkg, duplicate);
  return duplicate;
}

export function createGradeScale(pkg, name = 'Letter grades') {
  const scale = {
    '@id': uuidUrn(),
    '@type': [TYPES.GRADE_SCALE],
    identifier: uniqueIdentifierFor(pkg, name, TYPES.GRADE_SCALE),
    name,
    'marin:gradeBands': [
      { name: 'A', minPercent: 90, 'marin:message': 'Excellent work.' },
      { name: 'B', minPercent: 80, 'marin:message': 'Good work.' },
      { name: 'C', minPercent: 70, 'marin:message': 'You passed.' },
      { name: 'D', minPercent: 60, 'marin:message': 'Review the material and try again.' },
      { name: 'F', minPercent: 0, 'marin:message': 'Review the material before trying again.' }
    ]
  };
  addGraphObject(pkg, scale);
  return scale;
}

export function createPresentation(pkg, name = 'New slides', basedOnMaterialId = null) {
  const presentation = {
    '@id': uuidUrn(),
    '@type': ['PresentationDigitalDocument', TYPES.PRESENTATION],
    identifier: uniqueIdentifierFor(pkg, name, TYPES.PRESENTATION),
    name,
    learningResourceType: 'presentation',
    'marin:slideSequence': emptyItemList()
  };
  if (basedOnMaterialId) {
    presentation.isBasedOn = [ref(basedOnMaterialId)];
  }
  addGraphObject(pkg, presentation);
  return presentation;
}

export function duplicatePresentation(pkg, presentationId, requestedName = null) {
  const original = getObject(pkg, presentationId);
  if (!original || !hasType(original, TYPES.PRESENTATION)) return null;

  const newId = uuidUrn();
  const name = requestedName || `${original.name} (Copy)`;
  const identifier = uniqueIdentifierFor(pkg, name, TYPES.PRESENTATION);

  const duplicate = deepClone(original);
  duplicate['@id'] = newId;
  duplicate.identifier = identifier;
  duplicate.name = name;
  cleanUndefined(duplicate);
  addGraphObject(pkg, duplicate);
  return duplicate;
}

export function createSlide(pkg, name = 'New slide', layout = 'content') {
  const slide = {
    '@id': uuidUrn(),
    '@type': ['CreativeWork', TYPES.SLIDE],
    identifier: uniqueIdentifierFor(pkg, name, TYPES.SLIDE),
    name,
    'marin:layout': layout
  };
  addGraphObject(pkg, slide);
  return slide;
}

export function duplicateSlide(pkg, slideId, requestedName = null) {
  const original = getObject(pkg, slideId);
  if (!original || !hasType(original, TYPES.SLIDE)) return null;

  const newId = uuidUrn();
  const name = requestedName || `${original.name || 'Slide'} (Copy)`;
  const identifier = uniqueIdentifierFor(pkg, name, TYPES.SLIDE);

  const duplicate = deepClone(original);
  duplicate['@id'] = newId;
  duplicate.identifier = identifier;
  duplicate.name = name;
  cleanUndefined(duplicate);
  addGraphObject(pkg, duplicate);
  return duplicate;
}

export function addContentToSlide(slide, contentUnitId, displayMode = 'abstract') {
  if (!slide['marin:contentSequence']) {
    slide['marin:contentSequence'] = emptyItemList();
  }
  appendSequenceItem(slide['marin:contentSequence'], contentUnitId, { 'marin:displayMode': displayMode });
}

export function createImageAsset(pkg, fileMeta) {
  const requested = fileMeta.name.replace(/\.[^.]+$/, '');
  const identifier = uniqueIdentifierFor(pkg, requested, 'asset');
  const existing = new Set(Object.keys(pkg.assetFiles));
  const filename = safeFilename(fileMeta.name, identifier);
  const path = uniquePath(`assets/${filename}`, existing);
  const asset = {
    '@id': uuidUrn(),
    '@type': ['MediaObject', 'ImageObject'],
    identifier,
    name: requested || filename,
    contentUrl: path,
    encodingFormat: fileMeta.type,
    contentSize: String(fileMeta.bytes.byteLength)
  };
  if (fileMeta.width) asset.width = fileMeta.width;
  if (fileMeta.height) asset.height = fileMeta.height;
  pkg.assetFiles[path] = {
    bytes: fileMeta.bytes instanceof Uint8Array ? fileMeta.bytes : new Uint8Array(fileMeta.bytes),
    type: fileMeta.type,
    originalName: fileMeta.name
  };
  addGraphObject(pkg, asset);
  return asset;
}

export function emptyItemList() {
  return { '@type': 'ItemList', itemListElement: [] };
}

export function sequenceItems(container, property) {
  return asArray(container?.[property]?.itemListElement).sort((a, b) => a.position - b.position);
}

export function setSequence(itemList, ids, extras = {}) {
  itemList['@type'] = 'ItemList';
  itemList.itemListElement = ids.map((id, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: ref(id),
    ...(extras[id] || {})
  }));
}

export function appendSequenceItem(itemList, id, extra = {}) {
  if (!itemList) return;
  const items = asArray(itemList.itemListElement);
  items.push({ '@type': 'ListItem', position: items.length + 1, item: ref(id), ...extra });
  itemList.itemListElement = items;
}

export function insertSequenceItem(itemList, index, id, extra = {}) {
  const items = asArray(itemList?.itemListElement).sort((a, b) => a.position - b.position);
  const insertIdx = Math.max(0, Math.min(index, items.length));
  items.splice(insertIdx, 0, { '@type': 'ListItem', position: insertIdx + 1, item: ref(id), ...extra });
  itemList.itemListElement = items;
  renumberSequence(itemList);
}

export function moveSequenceItem(itemList, index, delta) {
  const items = asArray(itemList?.itemListElement).sort((a, b) => a.position - b.position);
  const target = index + delta;
  if (index < 0 || target < 0 || index >= items.length || target >= items.length) return false;
  const temp = items[index];
  items[index] = items[target];
  items[target] = temp;
  itemList.itemListElement = items;
  renumberSequence(itemList);
  return true;
}

export function removeSequenceItem(itemList, index) {
  const items = asArray(itemList?.itemListElement).sort((a, b) => a.position - b.position);
  if (index < 0 || index >= items.length) return null;
  const [removed] = items.splice(index, 1);
  itemList.itemListElement = items;
  renumberSequence(itemList);
  return removed;
}

export function renumberSequence(itemList) {
  itemList.itemListElement = asArray(itemList?.itemListElement)
    .map((item, index) => ({ ...item, position: index + 1 }));
}

export function transferSequenceItem(sourceList, targetList, sourceIndex, targetIndex = -1) {
  const sourceItems = asArray(sourceList?.itemListElement).sort((a, b) => a.position - b.position);
  if (sourceIndex < 0 || sourceIndex >= sourceItems.length) return null;
  const [removed] = sourceItems.splice(sourceIndex, 1);
  sourceList.itemListElement = sourceItems;
  renumberSequence(sourceList);

  if (!targetList['marin:contentSequence'] && !targetList.itemListElement) {
    targetList['@type'] = 'ItemList';
    targetList.itemListElement = [];
  }
  const destList = targetList.itemListElement ? targetList : targetList['marin:contentSequence'];
  const targetItems = asArray(destList?.itemListElement).sort((a, b) => a.position - b.position);
  const destIndex = targetIndex < 0 || targetIndex > targetItems.length ? targetItems.length : targetIndex;
  targetItems.splice(destIndex, 0, removed);
  destList.itemListElement = targetItems;
  renumberSequence(destList);
  return removed;
}

export function isDescendantSection(pkg, ancestorId, targetId) {
  if (ancestorId === targetId) return true;
  const ancestor = getObject(pkg, ancestorId);
  if (!ancestor || !hasType(ancestor, TYPES.SECTION)) return false;
  const entries = asArray(ancestor['marin:contentSequence']?.itemListElement);
  for (const entry of entries) {
    const childId = entry.item?.['@id'];
    if (childId === targetId) return true;
    if (isDescendantSection(pkg, childId, targetId)) return true;
  }
  return false;
}

export function getSectionSubtreeHeight(pkg, sectionId) {
  const section = getObject(pkg, sectionId);
  if (!section || !hasType(section, TYPES.SECTION)) return 1;
  let maxChildHeight = 0;
  const entries = asArray(section['marin:contentSequence']?.itemListElement);
  for (const entry of entries) {
    const childId = entry.item?.['@id'];
    const child = getObject(pkg, childId);
    if (child && hasType(child, TYPES.SECTION)) {
      maxChildHeight = Math.max(maxChildHeight, getSectionSubtreeHeight(pkg, childId));
    }
  }
  return 1 + maxChildHeight;
}

export function findParentContainer(pkg, rootMaterial, itemId) {
  if (!rootMaterial) return null;
  const rootEntries = asArray(rootMaterial['marin:contentSequence']?.itemListElement).sort((a, b) => a.position - b.position);
  const rootIdx = rootEntries.findIndex((e) => e.item?.['@id'] === itemId);
  if (rootIdx !== -1) {
    return { container: rootMaterial, sequence: rootMaterial['marin:contentSequence'], index: rootIdx, depth: 0 };
  }

  function search(parentSection, currentDepth) {
    const entries = asArray(parentSection['marin:contentSequence']?.itemListElement).sort((a, b) => a.position - b.position);
    const idx = entries.findIndex((e) => e.item?.['@id'] === itemId);
    if (idx !== -1) {
      return { container: parentSection, sequence: parentSection['marin:contentSequence'], index: idx, depth: currentDepth };
    }
    for (const entry of entries) {
      const child = getObject(pkg, entry.item?.['@id']);
      if (child && hasType(child, TYPES.SECTION)) {
        const found = search(child, currentDepth + 1);
        if (found) return found;
      }
    }
    return null;
  }

  for (const entry of rootEntries) {
    const child = getObject(pkg, entry.item?.['@id']);
    if (child && hasType(child, TYPES.SECTION)) {
      const found = search(child, 1);
      if (found) return found;
    }
  }
  return null;
}

export function getSectionDepth(pkg, rootMaterial, sectionId) {
  const parentInfo = findParentContainer(pkg, rootMaterial, sectionId);
  return parentInfo ? parentInfo.depth + 1 : 1;
}

export function canNestSection(pkg, rootMaterial, sectionId, targetParentId) {
  if (sectionId === targetParentId) return false;
  if (isDescendantSection(pkg, sectionId, targetParentId)) return false;

  let targetDepth = 0;
  if (targetParentId !== rootMaterial['@id']) {
    const parentInfo = findParentContainer(pkg, rootMaterial, targetParentId);
    if (!parentInfo) return false;
    targetDepth = parentInfo.depth + 1;
  }

  const subtreeHeight = getSectionSubtreeHeight(pkg, sectionId);
  return targetDepth + subtreeHeight <= 3;
}

export function addToAssessment(assessment, itemId, weight = 1) {
  appendSequenceItem(assessment['marin:itemSequence'], itemId, { 'marin:weight': weight });
}

export function addSlideToPresentation(presentation, slideId) {
  appendSequenceItem(presentation['marin:slideSequence'], slideId);
}

export function usagesOf(pkg, id) {
  const usages = [];
  for (const object of graph(pkg)) {
    if (object['@id'] === id) continue;
    const paths = findRefPaths(object, id);
    for (const path of paths) usages.push({ object, path });
  }
  for (const unit of getObjects(pkg, TYPES.CONTENT_UNIT)) {
    const markdown = pkg.contentFiles[unit.encoding?.contentUrl] || '';
    const uuidValue = id.replace(/^urn:uuid:/i, '');
    if (markdown.includes(`marin-ref:${uuidValue}`) || markdown.includes(`marin-asset:${uuidValue}`)) {
      usages.push({ object: unit, path: 'Markdown body' });
    }
  }
  return usages;
}

export function structuralUsagesOf(pkg, id) {
  return usagesOf(pkg, id).filter(({ object }) => !hasType(object, TYPES.LEARNING_SET));
}

export function duplicateContentUnit(pkg, unitId, requestedName = null) {
  const original = getObject(pkg, unitId);
  if (!original || !hasType(original, TYPES.CONTENT_UNIT)) return null;

  const newId = uuidUrn();
  const name = requestedName || `${original.name} (Copy)`;
  const identifier = uniqueIdentifierFor(pkg, name, TYPES.CONTENT_UNIT);

  const existingPaths = new Set(Object.keys(pkg.contentFiles));
  const newPath = uniquePath(`content/${slugify(name, 'content')}.md`, existingPaths);

  const originalPath = original.encoding?.contentUrl;
  const markdown = (originalPath && pkg.contentFiles[originalPath]) || '';
  pkg.contentFiles[newPath] = markdown;

  const duplicate = deepClone(original);
  duplicate['@id'] = newId;
  duplicate.identifier = identifier;
  duplicate.name = name;
  duplicate.encoding = {
    '@type': 'MediaObject',
    contentUrl: newPath,
    encodingFormat: 'text/markdown'
  };
  cleanUndefined(duplicate);
  addGraphObject(pkg, duplicate);
  return duplicate;
}

function findRefPaths(value, id, path = '$') {
  const found = [];
  if (!value || typeof value !== 'object') return found;
  if (value['@id'] === id && Object.keys(value).length === 1) found.push(path);
  for (const [key, child] of Object.entries(value)) {
    if (Array.isArray(child)) {
      child.forEach((entry, index) => found.push(...findRefPaths(entry, id, `${path}.${key}[${index}]`)));
    } else if (child && typeof child === 'object') {
      found.push(...findRefPaths(child, id, `${path}.${key}`));
    }
  }
  return found;
}

export function normalizePackage(pkg) {
  const copy = deepClone(pkg);
  copy.graphDocument['@context'] = deepClone(JSONLD_CONTEXT);
  for (const object of graph(copy)) {
    if (Array.isArray(object['@type'])) object['@type'] = [...new Set(object['@type'])];
    cleanUndefined(object);
  }
  for (const [path, text] of Object.entries(copy.contentFiles)) {
    copy.contentFiles[path] = String(text ?? '');
  }
  syncRootMembership(copy);
  touchPackage(copy);
  return copy;
}

export function effectiveObjectivesForMaterial(pkg, material) {
  const ids = new Set(asArray(material.teaches).map((entry) => entry['@id']));
  const visit = (sequence) => {
    for (const entry of asArray(sequence?.itemListElement)) {
      const object = getObject(pkg, entry.item?.['@id']);
      if (!object) continue;
      if (hasType(object, TYPES.CONTENT_UNIT)) {
        asArray(object.teaches).forEach((refValue) => ids.add(refValue['@id']));
      } else if (hasType(object, TYPES.SECTION)) {
        visit(object['marin:contentSequence']);
      }
    }
  };
  visit(material['marin:contentSequence']);
  return [...ids];
}

export function cleanUndefined(value) {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const item of value) cleanUndefined(item);
    return value;
  }
  for (const key of Object.keys(value)) {
    if (value[key] === undefined || value[key] === null || value[key] === '') delete value[key];
    else if (key === 'marin:contentSequence' && hasType(value, TYPES.SLIDE) && value[key]?.itemListElement && !value[key].itemListElement.length) {
      delete value[key];
    }
    else cleanUndefined(value[key]);
  }
  return value;
}

export function ensureRootDefaults(pkg) {
  const root = rootLearningSet(pkg);
  if (!root) return;
  if (!STATUSES.includes(root.creativeWorkStatus)) root.creativeWorkStatus = 'draft';
  if (!EDUCATIONAL_LEVELS.includes(root.educationalLevel)) root.educationalLevel = 'introductory';
  root.schemaVersion = SCHEMA_VERSION;
  root.inLanguage ||= 'en-US';
  root.version ||= '0.1.0';
  root.identifier ||= uniqueIdentifierFor(pkg, root.name || 'learning-set', TYPES.LEARNING_SET, root['@id']);
  syncRootMembership(pkg);
}
