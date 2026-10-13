import test from 'node:test';
import assert from 'node:assert/strict';
import { createExamplePackage } from '../examples/example-package.js';
import {
  exportLearningPackage,
  importLearningPackage,
  packageEntries,
  PackageImportError
} from '../js/core/package.js';
import { createZip, readZip, ZipError } from '../js/core/zip.js';

function comparable(pkg) {
  return {
    graphDocument: pkg.graphDocument,
    contentFiles: pkg.contentFiles,
    assets: Object.fromEntries(Object.entries(pkg.assetFiles).map(([path, file]) => [path, [...file.bytes]]))
  };
}

test('the reference package exports, imports, and retains its semantic source', async () => {
  const exported = await exportLearningPackage(createExamplePackage());
  assert.ok(exported.bytes.byteLength > 1000);
  const imported = await importLearningPackage(exported.bytes, { filename: 'round-trip.zip' });
  assert.equal(imported.validation.errors.length, 0);
  assert.deepEqual(comparable(imported.pkg), comparable(exported.normalized));
});

test('ZIP export contains only the package contract roots', async () => {
  const exported = await exportLearningPackage(createExamplePackage());
  const zip = await readZip(exported.bytes);
  const names = [...zip.entries.keys()];
  assert.ok(names.includes('learning.json'));
  assert.ok(names.some((name) => name.startsWith('content/')));
  assert.ok(names.some((name) => name.startsWith('assets/')));
  assert.ok(names.every((name) => name === 'learning.json' || name.startsWith('content/') || name.startsWith('assets/')));
});

test('repair mode removes a single wrapper directory', async () => {
  const pkg = createExamplePackage();
  const entries = [...packageEntries(pkg)].map(([name, data]) => ({ name: `wrapper/${name}`, data }));
  const imported = await importLearningPackage(createZip(entries), { repair: true });
  assert.equal(imported.validation.errors.length, 0);
  assert.ok(imported.validation.warnings.some((item) => item.code === 'repair-mode'));
});

test('unknown root entries make a package nonconforming', async () => {
  const pkg = createExamplePackage();
  const entries = [...packageEntries(pkg)].map(([name, data]) => ({ name, data }));
  entries.push({ name: 'notes.txt', data: 'Not part of the package contract.' });
  await assert.rejects(
    () => importLearningPackage(createZip(entries)),
    (error) => error instanceof PackageImportError && /unsupported root entries/i.test(error.message)
  );
});

test('unsafe ZIP paths are rejected before archive creation', () => {
  assert.throws(() => createZip([{ name: '../outside.txt', data: 'x' }]), (error) => error instanceof ZipError && error.code === 'zip-traversal');
  assert.throws(() => createZip([{ name: '/absolute.txt', data: 'x' }]), (error) => error instanceof ZipError && error.code === 'zip-absolute-path');
});
