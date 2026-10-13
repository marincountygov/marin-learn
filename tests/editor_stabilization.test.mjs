import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TYPES } from '../js/core/constants.js';
import {
  appendSequenceItem,
  createContentUnit,
  createEmptyPackage,
  createMaterial,
  getObjects
} from '../js/core/model.js';
import { exportLearningPackage, importLearningPackage } from '../js/core/package.js';
import { validatePackage } from '../js/core/validate.js';

const root = new URL('../', import.meta.url);

test('the stabilized material workflow creates canonical objects and Markdown', async () => {
  const pkg = createEmptyPackage('Editor stabilization fixture');
  const material = createMaterial(pkg, 'Employee Orientation');
  const unit = createContentUnit(pkg, 'Welcome to the County', 'overview');
  unit.abstract = 'A short welcome for new employees.';
  pkg.contentFiles[unit.encoding.contentUrl] = 'Welcome to County service.\n\n## What to know\n\n- Public service matters.\n';
  appendSequenceItem(material['marin:contentSequence'], unit['@id']);

  const validation = validatePackage(pkg);
  assert.equal(validation.errors.length, 0, validation.errors.map((item) => item.message).join('\n'));
  assert.equal(getObjects(pkg, TYPES.MATERIAL).length, 1);
  assert.equal(getObjects(pkg, TYPES.CONTENT_UNIT).length, 1);

  const exported = await exportLearningPackage(pkg);
  assert.ok(exported.bytes instanceof Uint8Array);
  assert.ok(exported.bytes.byteLength > 0);
  const imported = await importLearningPackage(exported.bytes);
  assert.equal(getObjects(imported.pkg, TYPES.MATERIAL).length, 1);
  assert.equal(getObjects(imported.pkg, TYPES.CONTENT_UNIT).length, 1);
  assert.match(Object.values(imported.pkg.contentFiles)[0], /Welcome to County service/);
});

test('the editor controller uses canonical types and the export byte payload', async () => {
  const source = await readFile(new URL('../editor/assets/app.js', import.meta.url), 'utf8');
  assert.match(source, /getObjects\(currentPkg, TYPES\.MATERIAL\)/);
  assert.match(source, /getObjects\(currentPkg, TYPES\.ASSESSMENT\)/);
  assert.match(source, /getObjects\(currentPkg, TYPES\.PRESENTATION\)/);
  assert.match(source, /new Blob\(\[result\.bytes\]/);
  assert.match(source, /<h4>No issues found<\/h4>/);
  assert.match(source, /This learning package has no blocking errors or warnings\./);
  assert.doesNotMatch(source, /getObjects\(currentPkg, ['"]LearningMaterial['"]\)/);
});

test('the rich editor foundation does not use deprecated execCommand', async () => {
  const source = await readFile(new URL('../editor/assets/rich-editor.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /execCommand/);
  assert.match(source, /htmlToMarkdown/);
  assert.match(source, /renderMarkdown/);
});

test('editor hidden state has an explicit CSS contract', async () => {
  const css = await readFile(new URL('../editor/assets/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.editor-hidden[\s\S]*display:\s*none\s*!important/);
});

test('editor styling inherits the vendored Pico and MarinOS theme contract', async () => {
  const html = await readFile(new URL('../editor/index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../editor/assets/app.css', import.meta.url), 'utf8');

  assert.match(html, /href="\.\.\/vendor\/marinos\/marinos\.css"/);
  assert.match(html, /href="assets\/app\.css"/);
  assert.doesNotMatch(html, /href="\.\.\/assets\/app\.css"/);

  assert.match(css, /--editor-surface:\s*var\(--pico-card-background-color\)/);
  assert.match(css, /--editor-surface-subtle:\s*var\(--pico-card-sectioning-background-color\)/);
  assert.match(css, /--editor-border-subtle:\s*var\(--pico-card-border-color\)/);
  assert.match(css, /--editor-text:\s*var\(--pico-color\)/);
  assert.match(css, /--editor-muted:\s*var\(--pico-muted-color\)/);
  assert.doesNotMatch(css, /var\(--pico-secondary-background/);
  assert.doesNotMatch(css, /var\(--pico-border-color/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
});

test('editor status labels use the App Shell badge foundation', async () => {
  const sourceFiles = [
    '../editor/index.html',
    '../editor/assets/materials.js',
    '../editor/assets/quizzes.js',
    '../editor/assets/slides.js',
    '../editor/assets/assets.js',
    '../editor/assets/objectives.js'
  ];
  const sources = (await Promise.all(sourceFiles.map((file) =>
    readFile(new URL(file, import.meta.url), 'utf8')))).join('\n');

  assert.match(sources, /class="app-badge badge--status"/);
  assert.match(sources, /class="app-badge badge--level/);
  assert.doesNotMatch(sources, /class="badge(?:\s|\")/);
});

test('editor file pickers use Pico role-button styling and delegated keyboard activation', async () => {
  const html = await readFile(new URL('../editor/index.html', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../editor/assets/app.js', import.meta.url), 'utf8');
  const assetsSource = await readFile(new URL('../editor/assets/assets.js', import.meta.url), 'utf8');
  const combinedMarkup = `${html}\n${assetsSource}`;

  assert.doesNotMatch(combinedMarkup, /class="button\b/);
  assert.match(combinedMarkup, /label class="secondary outline editor-file-label" role="button" tabindex="0"/);
  assert.match(combinedMarkup, /editor-file-btn-label" role="button" tabindex="0"/);
  assert.match(appSource, /document\.addEventListener\('keydown'/);
  assert.match(appSource, /label\[role="button"\]/);
});
