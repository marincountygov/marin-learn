import assert from 'node:assert/strict';
import test from 'node:test';

import { createEmptyPackage, createImageAsset } from '../js/core/model.js';
import {
  collectPptxImageDiagnostics,
  createPptxAssetIndex,
  imageDimensions,
  resolvePptxImageUse
} from '../js/pptx/images.js';

const encoder = new TextEncoder();

test('PowerPoint image preparation accepts a safe package-local SVG and preserves contextual alt text', () => {
  const pkg = createEmptyPackage('Image fixture');
  const bytes = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 320"><rect width="640" height="320" fill="#0777cf"/></svg>');
  const asset = createImageAsset(pkg, { name: 'diagram.svg', type: 'image/svg+xml', bytes });
  const uuid = asset['@id'].replace(/^urn:uuid:/, '');
  const image = resolvePptxImageUse(pkg, createPptxAssetIndex(pkg), {
    type: 'image',
    destination: `marin-asset:${uuid}`,
    alt: 'Diagram of the export workflow'
  });

  assert.deepEqual(imageDimensions(bytes, 'image/svg+xml'), { width: 640, height: 320 });
  assert.equal(image.decorative, false);
  assert.equal(image.altText, 'Diagram of the export workflow');
  assert.match(image.data, /^data:image\/svg\+xml;base64,/);
});

test('PowerPoint image preparation rejects active SVG content before PptxGenJS receives it', () => {
  const pkg = createEmptyPackage('Unsafe image fixture');
  const bytes = encoder.encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
  const asset = createImageAsset(pkg, { name: 'unsafe.svg', type: 'image/svg+xml', bytes, width: 10, height: 10 });
  const uuid = asset['@id'].replace(/^urn:uuid:/, '');
  const result = collectPptxImageDiagnostics(pkg, createPptxAssetIndex(pkg), [{
    type: 'image',
    destination: `marin-asset:${uuid}`,
    alt: 'Unsafe test image'
  }]);

  assert.equal(result.images.length, 0);
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].code, 'pptx-image-invalid');
});
