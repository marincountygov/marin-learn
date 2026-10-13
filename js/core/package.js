import { sniffMediaType } from './assets.js';
import { canonicalizeMarkdown } from './markdown.js';
import { getObjects, graph, normalizePackage, syncRootMembership } from './model.js';
import { TYPES } from './constants.js';
import { validatePackage } from './validate.js';
import { createZip, readZip } from './zip.js';
import { textDecoder, textEncoder } from './utils.js';

export async function exportLearningPackage(pkg, options = {}) {
  const normalized = normalizePackage(pkg);
  syncRootMembership(normalized);
  for (const object of [...getObjects(normalized, TYPES.IMAGE), ...getObjects(normalized, TYPES.MEDIA)]) {
    const file = normalized.assetFiles[object.contentUrl];
    if (file) object.contentSize = String(toBytes(file.bytes).byteLength);
  }
  for (const unit of getObjects(normalized, TYPES.CONTENT_UNIT)) {
    const path = unit.encoding?.contentUrl;
    if (path in normalized.contentFiles) normalized.contentFiles[path] = canonicalizeMarkdown(normalized.contentFiles[path]);
  }
  const validation = validatePackage(normalized);
  if (!validation.valid && !options.allowInvalid) throw new PackageValidationError('Package contains validation errors and cannot be exported as conforming Marin Learn v1.', validation);

  const entries = [{ name: 'learning.json', data: `${JSON.stringify(normalized.graphDocument, null, 2)}\n` }];
  for (const path of Object.keys(normalized.contentFiles).sort()) entries.push({ name: path, data: normalized.contentFiles[path] });
  for (const path of Object.keys(normalized.assetFiles).sort()) entries.push({ name: path, data: toBytes(normalized.assetFiles[path].bytes) });
  return { bytes: createZip(entries), normalized, validation };
}

export async function importLearningPackage(input, options = {}) {
  const zip = await readZip(input, { repair: options.repair !== false });
  if (!zip.entries.has('learning.json')) throw new PackageImportError('Package is missing root learning.json.', { diagnostics: [{ severity: 'error', stage: 'Structure', code: 'missing-learning-json', message: 'Package is missing root learning.json.' }] });

  const unknown = [...zip.entries.keys()].filter((path) => path !== 'learning.json' && !path.startsWith('content/') && !path.startsWith('assets/'));
  if (unknown.length) throw new PackageImportError(`Package contains unsupported root entries: ${unknown.join(', ')}.`, { diagnostics: unknown.map((path) => ({ severity: 'error', stage: 'Structure', code: 'unknown-package-entry', message: `Unsupported package entry: ${path}.`, file: path })) });

  let graphDocument;
  try {
    graphDocument = JSON.parse(textDecoder(zip.entries.get('learning.json')));
  } catch (error) {
    throw new PackageImportError(`learning.json is not valid UTF-8 JSON: ${error.message}`, { diagnostics: [{ severity: 'error', stage: 'JSON', code: 'invalid-json', message: error.message }] });
  }

  const pkg = {
    editorStateVersion: 1,
    graphDocument,
    contentFiles: {},
    assetFiles: {},
    packageWarnings: [...zip.warnings],
    packageName: options.filename || 'learning-set.zip'
  };
  for (const [path, data] of zip.entries) {
    if (path.startsWith('content/')) {
      try { pkg.contentFiles[path] = textDecoder(data).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); }
      catch (error) { throw new PackageImportError(`${path} is not valid UTF-8: ${error.message}`, { diagnostics: [{ severity: 'error', stage: 'Markdown', code: 'content-encoding', message: `${path} is not valid UTF-8.`, file: path }] }); }
    }
    if (path.startsWith('assets/')) pkg.assetFiles[path] = { bytes: data, type: sniffMediaType(data), originalName: path.split('/').at(-1) };
  }
  const validation = validatePackage(pkg);
  for (const warning of zip.warnings) validation.diagnostics.unshift({ severity: 'warning', stage: 'Structure', code: 'repair-mode', message: warning });
  validation.warnings = validation.diagnostics.filter((item) => item.severity === 'warning');
  if (!validation.valid && !options.allowInvalid) throw new PackageImportError('Package did not pass Marin Learn validation.', validation, pkg);
  return { pkg, validation };
}

export function serializeLearningJson(pkg) {
  return `${JSON.stringify(pkg.graphDocument, null, 2)}\n`;
}

export function packageEntries(pkg) {
  const entries = new Map();
  entries.set('learning.json', textEncoder(serializeLearningJson(pkg)));
  for (const [path, markdown] of Object.entries(pkg.contentFiles)) entries.set(path, textEncoder(markdown));
  for (const [path, asset] of Object.entries(pkg.assetFiles)) entries.set(path, toBytes(asset.bytes));
  return entries;
}

function toBytes(value) {
  return value instanceof Uint8Array ? value : new Uint8Array(value);
}

export class PackageValidationError extends Error {
  constructor(message, validation) {
    super(message);
    this.name = 'PackageValidationError';
    this.validation = validation;
  }
}

export class PackageImportError extends Error {
  constructor(message, validation, partialPackage = null) {
    super(message);
    this.name = 'PackageImportError';
    this.validation = validation;
    this.partialPackage = partialPackage;
  }
}
