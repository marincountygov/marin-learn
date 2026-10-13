import test from 'node:test';
import assert from 'node:assert/strict';
import { createExamplePackage } from '../examples/example-package.js';
import { TYPES } from '../js/core/constants.js';
import { getObjects, rootLearningSet } from '../js/core/model.js';
import {
  importLearningPackage,
  packageEntries,
  PackageImportError
} from '../js/core/package.js';
import { validatePackage } from '../js/core/validate.js';
import { createZip, readZip, ZipError } from '../js/core/zip.js';
import { deepClone, uuidFromUrn } from '../js/core/utils.js';

function entriesFor(pkg) {
  return [...packageEntries(pkg)].map(([name, data]) => ({ name, data }));
}

function codes(validation) {
  return new Set(validation.diagnostics.map((item) => item.code));
}

function assertCode(pkg, code) {
  const validation = validatePackage(pkg);
  assert.equal(validation.valid, false, `Expected invalid package containing ${code}.`);
  assert.ok(codes(validation).has(code), `Expected diagnostic ${code}; received ${[...codes(validation)].join(', ')}.`);
  return validation;
}

async function assertImportFailure(bytes, predicate) {
  await assert.rejects(
    () => importLearningPackage(bytes),
    (error) => error instanceof PackageImportError && predicate(error)
  );
}

test('a minimal LearningSet-only package is valid', () => {
  const pkg = createExamplePackage();
  const root = rootLearningSet(pkg);
  pkg.graphDocument['@graph'] = [deepClone(root)];
  delete pkg.graphDocument['@graph'][0].hasPart;
  delete pkg.graphDocument['@graph'][0]['marin:startResource'];
  pkg.contentFiles = {};
  pkg.assetFiles = {};
  const validation = validatePackage(pkg);
  assert.equal(validation.valid, true);
});

test('import rejects a package without learning.json', async () => {
  await assertImportFailure(createZip([{ name: 'content/readme.md', data: 'Text\n' }]), (error) => /missing root learning\.json/i.test(error.message));
});

test('import rejects malformed learning.json', async () => {
  await assertImportFailure(createZip([{ name: 'learning.json', data: '{not json' }]), (error) => error.validation?.diagnostics?.some((item) => item.code === 'invalid-json'));
});

test('schema validation rejects an unsupported schema version', async () => {
  const pkg = createExamplePackage();
  rootLearningSet(pkg).schemaVersion = '2.0.0';
  await assertImportFailure(createZip(entriesFor(pkg)), (error) => error.validation?.errors?.some((item) => item.stage === 'Schema'));
});

test('schema validation rejects a second LearningSet', () => {
  const pkg = createExamplePackage();
  const duplicate = deepClone(rootLearningSet(pkg));
  duplicate['@id'] = 'urn:uuid:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  duplicate.identifier = 'second-learning-set';
  pkg.graphDocument['@graph'].push(duplicate);
  const validation = validatePackage(pkg);
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((item) => item.stage === 'Schema'));
});

test('graph validation detects duplicate object identities', () => {
  const pkg = createExamplePackage();
  const [first, second] = getObjects(pkg, TYPES.CONTENT_UNIT);
  second['@id'] = first['@id'];
  assertCode(pkg, 'duplicate-id');
});

test('graph validation detects unresolved and wrong-type references', () => {
  const unresolved = createExamplePackage();
  const material = getObjects(unresolved, TYPES.MATERIAL)[0];
  material['marin:contentSequence'].itemListElement[0].item = { '@id': 'urn:uuid:ffffffff-ffff-4fff-8fff-ffffffffffff' };
  assertCode(unresolved, 'unresolved-reference');

  const wrongType = createExamplePackage();
  const wrongMaterial = getObjects(wrongType, TYPES.MATERIAL)[0];
  const objective = getObjects(wrongType, TYPES.OBJECTIVE)[0];
  wrongMaterial['marin:contentSequence'].itemListElement[0].item = { '@id': objective['@id'] };
  assertCode(wrongType, 'wrong-reference-type');
});

test('content validation detects missing, orphaned, and shared Markdown files', () => {
  const missing = createExamplePackage();
  const missingUnit = getObjects(missing, TYPES.CONTENT_UNIT)[0];
  delete missing.contentFiles[missingUnit.encoding.contentUrl];
  assertCode(missing, 'missing-content-file');

  const orphan = createExamplePackage();
  orphan.contentFiles['content/orphan.md'] = 'Orphan text.\n';
  assertCode(orphan, 'orphan-content-file');

  const shared = createExamplePackage();
  const [first, second] = getObjects(shared, TYPES.CONTENT_UNIT);
  const oldPath = second.encoding.contentUrl;
  second.encoding.contentUrl = first.encoding.contentUrl;
  delete shared.contentFiles[oldPath];
  assertCode(shared, 'shared-content-file');
});

test('Markdown validation rejects raw HTML and unresolved stable references', () => {
  const rawHtml = createExamplePackage();
  const unit = getObjects(rawHtml, TYPES.CONTENT_UNIT)[0];
  rawHtml.contentFiles[unit.encoding.contentUrl] += '\n<script>alert(1)</script>\n';
  assertCode(rawHtml, 'markdown-raw-html');

  const missingRef = createExamplePackage();
  const refUnit = getObjects(missingRef, TYPES.CONTENT_UNIT)[0];
  missingRef.contentFiles[refUnit.encoding.contentUrl] += '\n[Missing](marin-ref:ffffffff-ffff-4fff-8fff-ffffffffffff)\n';
  assertCode(missingRef, 'markdown-missing-ref');
});

test('asset validation detects missing, orphaned, and shared asset files', () => {
  const missing = createExamplePackage();
  const image = getObjects(missing, TYPES.IMAGE)[0];
  delete missing.assetFiles[image.contentUrl];
  assertCode(missing, 'missing-asset-file');

  const orphan = createExamplePackage();
  orphan.assetFiles['assets/orphan.svg'] = {
    bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    type: 'image/svg+xml'
  };
  assertCode(orphan, 'orphan-asset-file');

  const shared = createExamplePackage();
  const original = getObjects(shared, TYPES.IMAGE)[0];
  const duplicate = deepClone(original);
  duplicate['@id'] = 'urn:uuid:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  duplicate.identifier = 'shared-image-path';
  duplicate.name = 'Shared image path';
  shared.graphDocument['@graph'].push(duplicate);
  assertCode(shared, 'shared-asset-file');
});

test('Markdown image validation rejects missing and non-image stable asset targets', () => {
  const missing = createExamplePackage();
  const unit = getObjects(missing, TYPES.CONTENT_UNIT)[0];
  missing.contentFiles[unit.encoding.contentUrl] += '\n![Missing](marin-asset:ffffffff-ffff-4fff-8fff-ffffffffffff)\n';
  assertCode(missing, 'markdown-missing-asset');

  const wrongType = createExamplePackage();
  const media = {
    '@id': 'urn:uuid:cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    '@type': ['MediaObject'],
    identifier: 'downloadable-file',
    name: 'Downloadable file',
    contentUrl: 'assets/download.pdf',
    encodingFormat: 'application/pdf'
  };
  wrongType.graphDocument['@graph'].push(media);
  wrongType.assetFiles[media.contentUrl] = {
    bytes: new TextEncoder().encode('%PDF-1.4\n'),
    type: 'application/pdf'
  };
  const wrongUnit = getObjects(wrongType, TYPES.CONTENT_UNIT)[0];
  wrongType.contentFiles[wrongUnit.encoding.contentUrl] += `\n![Not an image](marin-asset:${uuidFromUrn(media['@id'])})\n`;
  assertCode(wrongType, 'markdown-missing-asset');
});

test('asset validation rejects media mismatches and active SVG', () => {
  const mismatch = createExamplePackage();
  const mismatchImage = getObjects(mismatch, TYPES.IMAGE)[0];
  mismatchImage.encodingFormat = 'image/png';
  assertCode(mismatch, 'asset-type-mismatch');

  const unsafe = createExamplePackage();
  const unsafeImage = getObjects(unsafe, TYPES.IMAGE)[0];
  unsafe.assetFiles[unsafeImage.contentUrl].bytes = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assertCode(unsafe, 'svg-active-element');
});

test('ZIP reader rejects duplicate and case-only-colliding entry names', async () => {
  await assert.rejects(
    () => readZip(createZip([{ name: 'learning.json', data: '{}' }, { name: 'learning.json', data: '{}' }])),
    (error) => error instanceof ZipError && error.code === 'zip-duplicate-entry'
  );
  await assert.rejects(
    () => readZip(createZip([{ name: 'learning.json', data: '{}' }, { name: 'LEARNING.JSON', data: '{}' }])),
    (error) => error instanceof ZipError && error.code === 'zip-case-collision'
  );
});

test('repair mode removes operating-system metadata entries', async () => {
  const pkg = createExamplePackage();
  const entries = entriesFor(pkg);
  entries.push({ name: '__MACOSX/._learning.json', data: 'metadata' });
  entries.push({ name: '.DS_Store', data: 'metadata' });
  const imported = await importLearningPackage(createZip(entries), { repair: true });
  assert.equal(imported.validation.errors.length, 0);
  assert.ok(imported.validation.warnings.some((item) => item.code === 'repair-mode'));
});

test('ZIP resource limits fail before package activation', async () => {
  const bytes = createZip([{ name: 'learning.json', data: '{}' }, { name: 'content/a.md', data: 'a' }]);
  await assert.rejects(
    () => readZip(bytes, { maxEntries: 1 }),
    (error) => error instanceof ZipError && error.code === 'zip-entry-limit'
  );
  await assert.rejects(
    () => readZip(createZip([{ name: 'learning.json', data: '1234567890' }]), { maxEntryBytes: 5 }),
    (error) => error instanceof ZipError && error.code === 'zip-entry-size'
  );
});

test('failed package import does not mutate the active package object', async () => {
  const active = createExamplePackage();
  const before = JSON.stringify(active.graphDocument);
  await assertImportFailure(createZip([{ name: 'learning.json', data: '{invalid' }]), () => true);
  assert.equal(JSON.stringify(active.graphDocument), before);
});

test('stable ContentUnit identity survives title and identifier changes', () => {
  const pkg = createExamplePackage();
  const unit = getObjects(pkg, TYPES.CONTENT_UNIT)[0];
  const id = unit['@id'];
  unit.name = 'Renamed content unit';
  unit.identifier = 'renamed-content-unit';
  assert.equal(unit['@id'], id);
  assert.equal(validatePackage(pkg).valid, true);
});

test('stable asset references survive asset filename changes', () => {
  const pkg = createExamplePackage();
  const asset = getObjects(pkg, TYPES.IMAGE)[0];
  const oldPath = asset.contentUrl;
  const newPath = 'assets/renamed-flow.svg';
  pkg.assetFiles[newPath] = pkg.assetFiles[oldPath];
  delete pkg.assetFiles[oldPath];
  asset.contentUrl = newPath;
  const validation = validatePackage(pkg);
  assert.equal(validation.valid, true);
  assert.equal(validation.warnings.length, 0);
});

test('stable ContentUnit references survive Markdown filename changes', () => {
  const pkg = createExamplePackage();
  const unit = getObjects(pkg, TYPES.CONTENT_UNIT)[0];
  const oldPath = unit.encoding.contentUrl;
  const newPath = 'content/renamed-unit.md';
  pkg.contentFiles[newPath] = pkg.contentFiles[oldPath];
  delete pkg.contentFiles[oldPath];
  unit.encoding.contentUrl = newPath;
  const validation = validatePackage(pkg);
  assert.equal(validation.valid, true);
  assert.equal(validation.warnings.length, 0);
});
