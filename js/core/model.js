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

export function addToAssessment(assessment, itemId, weight = 1) {
  appendSequenceItem(assessment['marin:itemSequence'], itemId, { 'marin:weight': weight });
}

export function addSlideToPresentation(presentation, slideId) {
  appendSequenceItem(presentation['marin:slideSequence'], slideId);
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

