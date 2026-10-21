import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadNodePptxRuntime, verifyNodePptxRuntime } from '../js/pptx/runtime-node.js';
import {
  assertSafeCleanDirectory,
  discoverPackageFiles,
  generatePptxArtifacts,
  parseArgs
} from '../scripts/generate_pptx.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Node runtime verifies and reuses the reviewed vendored PowerPoint bundle', async () => {
  const integrity = await verifyNodePptxRuntime();
  assert.equal(integrity.manifest.pptxGenJsVersion, '4.0.0');
  assert.equal(integrity.manifest.jsZipVersion, '3.10.1');
  assert.equal(integrity.bundleBytes.byteLength, integrity.manifest.files['pptxgen.bundle.js'].bytes);
  assert.equal(integrity.sha256, integrity.manifest.files['pptxgen.bundle.js'].sha256);

  const first = await loadNodePptxRuntime();
  const second = await loadNodePptxRuntime();
  assert.equal(first, second);
  assert.equal(first.source, 'vendored-node-bundle');
  assert.equal(typeof first.PptxGenJS, 'function');
  assert.equal(typeof first.JSZip, 'function');
  assert.equal(first.svgFallback, 'embedded-svg-with-transparent-png-compatibility');
});

test('Node generator writes a validated PPTX and complete review sidecars without npm installation', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-pptx-node-'));
  const outputDir = path.join(temp, 'review');
  const packageFile = path.join(ROOT, 'tests', 'fixtures', 'reference-package', 'marinos-foundations.zip');
  const { summary, summaryPath } = await generatePptxArtifacts({
    inputs: [packageFile],
    outputDir
  });

  assert.equal(summary.status, 'pass', JSON.stringify(summary.failures));
  assert.equal(summary.counts.packages, 1);
  assert.equal(summary.counts.presentations, 1);
  assert.equal(summary.runtime.source, 'vendored-node-bundle');
  assert.equal(summary.runtime.svgFallback, 'embedded-svg-with-transparent-png-compatibility');
  assert.equal(summary.packages[0].source, 'tests/fixtures/reference-package/marinos-foundations.zip');
  assert.equal(summary.artifacts[0].slideCount, 7);
  assert.equal(summary.artifacts[0].warningCount, 2);

  const artifact = summary.artifacts[0];
  for (const relative of [artifact.file, artifact.manifest, artifact.validation, artifact.buildRecord]) {
    const details = await stat(path.join(outputDir, relative));
    assert.ok(details.size > 0, relative);
  }
  const bytes = await readFile(path.join(outputDir, artifact.file));
  assert.deepEqual(Array.from(bytes.subarray(0, 2)), [0x50, 0x4b]);
  const writtenSummary = JSON.parse(await readFile(summaryPath, 'utf8'));
  assert.equal(writtenSummary.artifacts[0].sha256, artifact.sha256);
  const buildRecord = JSON.parse(await readFile(path.join(outputDir, artifact.buildRecord), 'utf8'));
  assert.equal(buildRecord.runtime.svgFallback, 'embedded-svg-with-transparent-png-compatibility');
});

test('Node generator reports unmatched presentation selectors as a failing review result', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-pptx-selector-'));
  const { summary } = await generatePptxArtifacts({
    inputs: [path.join(ROOT, 'tests', 'fixtures', 'reference-package', 'marinos-foundations.zip')],
    outputDir: path.join(temp, 'review'),
    presentationSelectors: ['does-not-exist']
  });
  assert.equal(summary.status, 'fail');
  assert.equal(summary.counts.presentations, 0);
  assert.ok(summary.failures.some((item) => item.code === 'pptx-presentation-not-found'));
});

test('Node CLI argument and package discovery contracts remain deterministic', async () => {
  assert.deepEqual(parseArgs([
    'packages', '--out', 'build/example', '--presentation', 'deck-one',
    '--presentation', 'deck-two', '--fail-on-warning', '--no-clean'
  ]), {
    inputs: ['packages'],
    presentationSelectors: ['deck-one', 'deck-two'],
    clean: false,
    failOnWarning: true,
    outputDir: 'build/example'
  });

  const files = await discoverPackageFiles([path.join(ROOT, 'packages')]);
  assert.deepEqual(files.map((value) => path.basename(value)), [
    'county-leaders-guide-to-apis.zip',
    'county-leaders-guide-to-data.zip',
    'county-leaders-guide-to-schemas.zip'
  ]);
});

test('Node generator refuses destructive output cleanup targets', () => {
  const source = path.join(ROOT, 'tests', 'fixtures', 'reference-package', 'marinos-foundations.zip');
  assert.throws(
    () => assertSafeCleanDirectory(ROOT, [source]),
    (error) => error?.code === 'pptx-output-unsafe'
  );
  const published = path.join(ROOT, 'packages', 'county-leaders-guide-to-data.zip');
  assert.throws(
    () => assertSafeCleanDirectory(path.join(ROOT, 'packages'), [published]),
    (error) => error?.code === 'pptx-output-contains-input'
  );
});

test('PowerPoint review workflow is isolated from Pages publication and retains review evidence', async () => {
  const workflow = await readFile(path.join(ROOT, '.github', 'workflows', 'pptx-review.yml'), 'utf8');
  assert.match(workflow, /node scripts\/generate_pptx\.mjs packages/);
  assert.match(workflow, /python3 scripts\/validate_pptx\.py build\/pptx-review/);
  assert.match(workflow, /python3 scripts\/render_pptx\.py build\/pptx-review/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /if: \$\{\{ always\(\) && hashFiles\('build\/pptx-review\/\*\*\/\*\.pptx'\) != '' \}\}/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /deploy-pages|upload-pages-artifact|pages: write|id-token: write/);
});


test('PowerPoint release-candidate workflow is dispatch-only, read-only, and does not publish', async () => {
  const workflow = await readFile(path.join(ROOT, '.github', 'workflows', 'pptx-release-candidate.yml'), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /type: choice[\s\S]*?- pilot[\s\S]*?- production/);
  assert.match(workflow, /python3 scripts\/build_pptx_release_fixture\.py/);
  assert.match(workflow, /node scripts\/generate_pptx\.mjs[\s\S]*?build\/pptx-fixtures\/pptx-release-conformance\.zip/);
  assert.match(workflow, /python3 scripts\/pptx_release_gate\.py init/);
  assert.match(workflow, /actions\/upload-artifact@v7/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.doesNotMatch(workflow, /pull_request:|push:|schedule:/);
  assert.doesNotMatch(workflow, /scripts\/publish\.py|deploy-pages|upload-pages-artifact|pages: write|id-token: write/);
});

test('A title slide with no content of its own shows the description', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'marin-learn-pptx-title-'));
  const outputDir = path.join(temp, 'review');
  const packageFile = path.join(ROOT, 'tests', 'fixtures', 'reference-package', 'marinos-foundations.zip');
  const { summary } = await generatePptxArtifacts({ inputs: [packageFile], outputDir });
  assert.equal(summary.status, 'pass', JSON.stringify(summary.failures));
  const { JSZip } = { JSZip: (await loadNodePptxRuntime()).JSZip };
  const zip = await JSZip.loadAsync(await readFile(path.join(outputDir, summary.artifacts[0].file)));
  const text = [...(await zip.file('ppt/slides/slide1.xml').async('string')).matchAll(/<a:t>([^<]*)<\/a:t>/g)]
    .map((match) => match[1]);
  assert.ok(text.length >= 2, `Title slide should have a title and a description, found: ${JSON.stringify(text)}`);
});
