import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

import {
  JSZIP_VERSION,
  PPTXGENJS_VERSION,
  PPTX_RUNTIME_URL
} from '../js/pptx/runtime-browser.js';

const VENDOR_ROOT = new URL('../vendor/pptxgenjs/', import.meta.url);

test('vendored PowerPoint runtime matches the reviewed manifest and declared versions', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', VENDOR_ROOT), 'utf8'));

  assert.equal(manifest.schema, 1);
  assert.equal(manifest.pptxGenJsVersion, PPTXGENJS_VERSION);
  assert.equal(manifest.jsZipVersion, JSZIP_VERSION);
  assert.match(PPTX_RUNTIME_URL, /\/vendor\/pptxgenjs\/pptxgen\.bundle\.js$/);

  for (const [name, expected] of Object.entries(manifest.files)) {
    const fileUrl = new URL(name, VENDOR_ROOT);
    const bytes = await readFile(fileUrl);
    const details = await stat(fileUrl);
    assert.equal(details.size, expected.bytes, `${name}: byte length drifted`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected.sha256, `${name}: SHA-256 drifted`);
  }

  const bundle = await readFile(new URL('pptxgen.bundle.js', VENDOR_ROOT), 'utf8');
  assert.match(bundle.slice(0, 120), /PptxGenJS 4\.0\.0/);
  assert.doesNotMatch(bundle, /sourceMappingURL\s*=\s*https?:/i);

  const pptxLicense = await readFile(new URL('PPTXGENJS-LICENSE.txt', VENDOR_ROOT), 'utf8');
  const zipLicense = await readFile(new URL('JSZIP-LICENSE.md', VENDOR_ROOT), 'utf8');
  assert.match(pptxLicense, /MIT License/);
  assert.match(zipLicense, /MIT License/);
});
