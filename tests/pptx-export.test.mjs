import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  addContentToSlide,
  addSlideToPresentation,
  createContentUnit,
  createEmptyPackage,
  createImageAsset,
  createPresentation,
  createSlide
} from '../js/core/model.js';
import { importLearningPackage } from '../js/core/package.js';
import {
  analyzePresentationForPptx,
  exportPresentationToPptx
} from '../js/pptx/index.js';
import { generateRawPptx } from '../js/pptx/generate.js';
import {
  ensureCoreLanguage,
  markDecorativeObjects,
  markTableHeaderRows,
  postprocessPptx,
  repairNonvisualIds,
  setRunLanguages
} from '../js/pptx/postprocess.js';
import { validateManifest, validatePptx } from '../js/pptx/validate.js';
import { loadVendoredPptxRuntime } from './helpers/pptx-runtime.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let runtimePromise;

function runtime() {
  runtimePromise ||= loadVendoredPptxRuntime(ROOT);
  return runtimePromise;
}

test('all current published slide decks pass PPTX preflight and the complete structural export gate', async () => {
  // The published decks, plus the reference package, which exercises the older
  // content-block slides that the Note decks no longer use.
  const packageFiles = (await readdir(join(ROOT, 'packages')))
    .filter((name) => name.endsWith('.zip'))
    .sort()
    .map((name) => join(ROOT, 'packages', name));
  packageFiles.push(join(ROOT, 'tests', 'fixtures', 'reference-package', 'marinos-foundations.zip'));
  const pptxRuntime = await runtime();
  let deckCount = 0;

  for (const packageFile of packageFiles) {
    const packageName = packageFile.split('/').at(-1);
    const source = await readFile(packageFile);
    const imported = await importLearningPackage(source, { filename: packageName });
    const before = snapshotPackage(imported.pkg);
    const presentations = imported.pkg.graphDocument['@graph']
      .filter((object) => asTypes(object).includes('marin:Presentation'));

    for (const presentation of presentations) {
      deckCount += 1;
      const preflight = await analyzePresentationForPptx(imported.pkg, presentation['@id']);
      assert.equal(preflight.status, 'pass', `${packageName}: ${JSON.stringify(preflight.errors)}`);
      const result = await exportPresentationToPptx(imported.pkg, presentation['@id'], { runtime: pptxRuntime });

      assert.equal(result.validation.status, 'pass', `${packageName}: ${JSON.stringify(result.validation.errors)}`);
      assert.equal(result.manifest.slides.length, preflight.model.slides.length);
      assert.match(result.filename, /^[a-z0-9][a-z0-9-]*\.pptx$/);
      assert.ok(result.bytes.byteLength > 20_000);
      assert.deepEqual(Array.from(result.bytes.slice(0, 2)), [0x50, 0x4b]);
      assert.equal(result.postprocessAudit.coreLanguageAdded || result.postprocessAudit.coreLanguageUpdated, true);
      assert.equal(result.postprocessAudit.partsProcessed > 0, true);
    }
    assert.deepEqual(snapshotPackage(imported.pkg), before, `${packageName}: export mutated the working package`);
  }

  assert.ok(deckCount >= 3);
});

test('PptxGenJS raw output fails required OOXML checks and the deterministic postprocessor corrects it', async () => {
  const pptxRuntime = await runtime();
  const { pkg, deck } = createCapabilityFixture();
  const preflight = await analyzePresentationForPptx(pkg, deck['@id']);
  assert.equal(preflight.status, 'pass', JSON.stringify(preflight.errors));

  const raw = await generateRawPptx(preflight, pptxRuntime);
  const rawValidation = await validatePptx(raw.bytes, pptxRuntime, raw.manifest, { language: 'en-US' });
  assert.equal(rawValidation.status, 'fail');
  assert.ok(rawValidation.errors.some((item) => item.code === 'pptx-language-missing'));
  assert.ok(rawValidation.errors.some((item) => item.code === 'pptx-decorative-marker-missing'));
  assert.ok(rawValidation.errors.some((item) => item.code === 'pptx-table-header-unmarked'));

  const processed = await postprocessPptx(raw.bytes, pptxRuntime, { language: 'en-US' });
  assert.equal(processed.audit.coreLanguageAdded, true);
  assert.ok(processed.audit.decorativeObjectsMarked >= 1);
  assert.ok(processed.audit.tableHeaderRowsMarked >= 1);
  assert.ok(processed.audit.runLanguagesSet >= 1);

  const finalValidation = await validatePptx(processed.bytes, pptxRuntime, raw.manifest, { language: 'en-US' });
  assert.equal(finalValidation.status, 'pass', JSON.stringify(finalValidation.errors));
  assert.ok(finalValidation.evidence.decorativeObjects >= 1);
  assert.ok(finalValidation.evidence.informativeImages >= 1);
  assert.ok(finalValidation.evidence.tables >= 1);
  assert.ok(finalValidation.evidence.hyperlinks >= 1);
  assert.equal(finalValidation.evidence.titleTextMatches, 2);
  assert.equal(finalValidation.evidence.automaticFitObjects, 0);
  assert.equal(finalValidation.evidence.widescreen, true);
});

test('structural validation independently rejects broken titles, alt text, automatic fitting, fonts, and colors', async () => {
  const pptxRuntime = await runtime();
  const { pkg, deck } = createCapabilityFixture();
  const preflight = await analyzePresentationForPptx(pkg, deck['@id']);
  assert.equal(preflight.status, 'pass', JSON.stringify(preflight.errors));
  const raw = await generateRawPptx(preflight, pptxRuntime);
  const processed = await postprocessPptx(raw.bytes, pptxRuntime, { language: 'en-US' });

  const zip = await pptxRuntime.JSZip.loadAsync(processed.bytes);
  const part = 'ppt/slides/slide1.xml';
  let xml = await zip.file(part).async('string');
  xml = xml.replace('<a:t>Capability fixture</a:t>', '<a:t>Changed title</a:t>');
  xml = xml.replace(/(<p:cNvPr\b[^>]*name="Informative image:[^"]*"[^>]*)\sdescr="[^"]*"/i, '$1');
  xml = xml.replace(/(<a:bodyPr\b[^>]*>)/i, '$1<a:normAutofit/>');
  xml = xml.replace('typeface="Jost"', 'typeface="Comic Sans MS"');
  xml = xml.replace('val="000000"', 'val="FF00FF"');
  zip.file(part, xml);
  const brokenBytes = await zip.generateAsync({ type: 'uint8array' });

  const validation = await validatePptx(brokenBytes, pptxRuntime, raw.manifest, { language: 'en-US' });
  const codes = new Set(validation.errors.map((item) => item.code));
  assert.equal(validation.status, 'fail');
  assert.ok(codes.has('pptx-slide-title-mismatch'));
  assert.ok(codes.has('pptx-image-alt-missing'));
  assert.ok(codes.has('pptx-automatic-fit-present'));
  assert.ok(codes.has('pptx-font-unapproved-ooxml'));
  assert.ok(codes.has('pptx-color-unapproved-ooxml'));
  assert.equal(validation.evidence.automaticFitObjects, 1);
});

test('manifest validation rejects out-of-bounds geometry, overlaps, weak contrast, and unapproved styling', () => {
  const errors = [];
  const manifest = {
    slides: [{
      number: 1,
      elements: [
        {
          name: 'Out-of-bounds text',
          type: 'text',
          x: -0.2,
          y: 1,
          w: 2,
          h: 1,
          fontFace: 'Comic Sans MS',
          fontSize: 10,
          foreground: 'FF00FF',
          background: 'FFFFFF',
          semantic: 'body'
        },
        {
          name: 'Low-contrast text',
          type: 'text',
          x: 0.1,
          y: 1,
          w: 2,
          h: 1,
          fontFace: 'Open Sans',
          fontSize: 18,
          foreground: 'A9A9A9',
          background: 'FFFFFF',
          semantic: 'body'
        }
      ]
    }]
  };

  validateManifest(manifest, errors, [], {});
  const codes = new Set(errors.map((item) => item.code));
  assert.ok(codes.has('pptx-element-out-of-bounds'));
  assert.ok(codes.has('pptx-element-overlap'));
  assert.ok(codes.has('pptx-font-unapproved'));
  assert.ok(codes.has('pptx-color-unapproved'));
  assert.ok(codes.has('pptx-font-too-small'));
  assert.ok(codes.has('pptx-contrast-failure'));
});

test('preflight rejects known authoring and layout failures without mutating source data', async () => {
  const pkg = createEmptyPackage('PPTX negative fixture');
  const deck = createPresentation(pkg, 'Problem deck');
  const first = createContentUnit(pkg, 'Repeated unit', 'concept');
  first.abstract = '';
  pkg.contentFiles[first.encoding.contentUrl] = `![Missing image](marin-asset:ffffffff-ffff-4fff-8fff-ffffffffffff)\n\n${'- Excessive content that cannot fit.\n'.repeat(140)}`;

  const firstSlide = createSlide(pkg, 'Repeated title', 'content');
  addContentToSlide(firstSlide, first['@id'], 'abstract');
  addSlideToPresentation(deck, firstSlide['@id']);

  const secondSlide = createSlide(pkg, 'Repeated title', 'split');
  addContentToSlide(secondSlide, first['@id'], 'full');
  addContentToSlide(secondSlide, first['@id'], 'title');
  addContentToSlide(secondSlide, first['@id'], 'title');
  addSlideToPresentation(deck, secondSlide['@id']);

  const before = snapshotPackage(pkg);
  const preflight = await analyzePresentationForPptx(pkg, deck['@id']);
  const codes = new Set(preflight.errors.map((item) => item.code));

  assert.equal(preflight.status, 'fail');
  assert.ok(codes.has('pptx-slide-title-duplicate'));
  assert.ok(codes.has('pptx-abstract-missing'));
  assert.ok(codes.has('pptx-layout-content-excess'));
  assert.ok(codes.has('pptx-image-unresolved'));
  assert.ok(codes.has('pptx-content-overflow'));
  assert.deepEqual(snapshotPackage(pkg), before);
});

test('OOXML correction helpers are deterministic and preserve non-target content', () => {
  const core = '<cp:coreProperties xmlns:cp="x" xmlns:dc="d"><dc:title>Example</dc:title></cp:coreProperties>';
  const first = ensureCoreLanguage(core, 'en-US');
  const second = ensureCoreLanguage(first.xml, 'en-US');
  assert.equal(first.added, true);
  assert.equal(second.added, false);
  assert.equal(second.updated, false);
  assert.match(second.xml, /<dc:language>en-US<\/dc:language>/);

  const xml = '<p:sld xmlns:p="p" xmlns:a="a"><p:cNvPr id="2" name="Decorative: rule" descr="/tmp/source.svg"/><p:cNvPr id="2" name="Body"/><a:tblPr/><a:rPr/></p:sld>';
  const ids = repairNonvisualIds(xml);
  const decorative = markDecorativeObjects(ids.xml);
  const tables = markTableHeaderRows(decorative.xml);
  const language = setRunLanguages(tables.xml, 'en-US');

  assert.equal(ids.repairs, 1);
  assert.equal(decorative.marked, 1);
  assert.equal(tables.marked, 1);
  assert.equal(language.changed, 1);
  assert.match(language.xml, /adec:decorative[^>]*val="1"/);
  assert.doesNotMatch(language.xml, /descr="\/tmp\/source\.svg"/);
  assert.match(language.xml, /<a:tblPr firstRow="1"\/>/);
  assert.match(language.xml, /<a:rPr lang="en-US"\/>/);
  const idsAfter = [...language.xml.matchAll(/<p:cNvPr[^>]*id="(\d+)"/g)].map((match) => match[1]);
  assert.equal(new Set(idsAfter).size, idsAfter.length);
});

function createCapabilityFixture() {
  const pkg = createEmptyPackage('PPTX capability fixture');
  const deck = createPresentation(pkg, 'PPTX capability fixture deck');
  deck.abstract = 'Fixture used to verify tables, images, links, notes, and OOXML remediation.';
  const imageBytes = Uint8Array.from(Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAeAAAADwCAIAAABXFyDtAAACzElEQVR42u3YoQ2AMBRFUUoqGIc9WAcBE4BgHfZgnLrPBKiGQJpzfM0TNz9NEdEB8D+9CQAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaoEW55vGwXBbkSdlHI4ALGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBoAgQYQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBkCgAQQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABEGgAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaAAEGkCgARBoAIEGQKABBBoAgQZAoAEEGgCBBhBoAD6TTQD15nUyAk+O7fwg0GUfTQ/wEl8cAAINgEADCDQAAg0g0AAINAACDSDQAAg0gEADINAACDSAQAMg0AACDYBAAwg0AAINgEADCDQAAg0g0AAINAACDSDQAAg0gEADINAAAg2AQAMg0AACDYBAAwg0AAINgEADCDQAAg0g0AAINIBAmwBAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGgCBBhBoAAQaQKABEGgAgQZAoAEQaACBBkCgAQQaAIEGQKABBBoAgQYQaAAEGkCgARBoAAQaQKABEGgAgQZAoAEQaACBBqBKiggrALigARBoAIEGQKABBBoAgQZAoAEEGgCBBhBoAAQaAIEGEGgABBpAoAEQaACBBkCgARBoAIEGQKABBBoAgQZAoAEEGgCBBhBoAAQaQKABEGgABBpAoAEQaACBBkCgARBoAIEGQKABmnMDyCkPjyLdCwQAAAAASUVORK5CYII=',
    'base64'
  ));
  const asset = createImageAsset(pkg, {
    name: 'workflow.png',
    type: 'image/png',
    bytes: imageBytes,
    width: 480,
    height: 240
  });
  const uuid = asset['@id'].replace(/^urn:uuid:/, '');

  const informative = createContentUnit(pkg, 'Capability content', 'reference');
  pkg.contentFiles[informative.encoding.contentUrl] = [
    'A paragraph with **strong text** and a [County website](https://www.marincounty.gov/).',
    '',
    '| Stage | Responsibility |',
    '| --- | --- |',
    '| Browser | Generate and repair the file |',
    '| Human reviewer | Validate PowerPoint behavior |',
    '',
    `![Diagram showing two workflow stages](marin-asset:${uuid})`
  ].join('\n');
  const informativeSlide = createSlide(pkg, 'Capability fixture', 'media');
  informativeSlide['marin:speakerNotes'] = 'Verify the table, link, image alternative text, and reading order.';
  addContentToSlide(informativeSlide, informative['@id'], 'full');
  addSlideToPresentation(deck, informativeSlide['@id']);

  const decorative = createContentUnit(pkg, 'Decorative image content', 'example');
  pkg.contentFiles[decorative.encoding.contentUrl] = `The image on this slide is decorative.\n\n![](marin-asset:${uuid})`;
  const decorativeSlide = createSlide(pkg, 'Decorative image fixture', 'media');
  decorativeSlide['marin:speakerNotes'] = 'Verify that the image is skipped by assistive technology.';
  addContentToSlide(decorativeSlide, decorative['@id'], 'full');
  addSlideToPresentation(deck, decorativeSlide['@id']);

  return { pkg, deck };
}

function snapshotPackage(pkg) {
  return {
    graph: JSON.stringify(pkg.graphDocument),
    content: Object.fromEntries(Object.entries(pkg.contentFiles).sort()),
    assets: Object.fromEntries(Object.entries(pkg.assetFiles).sort().map(([path, file]) => [
      path,
      {
        type: file.type,
        originalName: file.originalName,
        bytes: Array.from(file.bytes)
      }
    ]))
  };
}

function asTypes(object) {
  const value = object?.['@type'];
  return Array.isArray(value) ? value : value == null ? [] : [value];
}
