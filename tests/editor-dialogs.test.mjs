import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const editorAssets = path.join(root, 'editor', 'assets');

async function productionSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await productionSourceFiles(target));
    else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html'))) files.push(target);
  }
  return files;
}

test('production editor code does not call, alias, or monkey-patch browser-native dialogs', async () => {
  const forbiddenPatterns = [
    /(^|[^\w$])(?:(?:window|globalThis|self)\s*\.\s*)?(?:prompt|confirm|alert)\s*\(/m,
    /(?:window|globalThis|self)\s*(?:\.\s*(?:prompt|confirm|alert)|\[\s*['"](?:prompt|confirm|alert)['"]\s*\])\s*=/m,
    /(?:const|let|var)\s+[\w$]+\s*=\s*(?:(?:window|globalThis|self)\s*\.\s*)?(?:prompt|confirm|alert)\b/m,
    /(?:const|let|var)\s*\{[^}]*\b(?:prompt|confirm|alert)\b[^}]*\}\s*=\s*(?:window|globalThis|self)\b/m
  ];
  const findings = [];

  const productionFiles = [
    ...await productionSourceFiles(path.join(root, 'editor')),
    ...await productionSourceFiles(path.join(root, 'js'))
  ];

  for (const filename of productionFiles) {
    const source = await readFile(filename, 'utf8');
    if (forbiddenPatterns.some((pattern) => pattern.test(source))) {
      findings.push(path.relative(root, filename));
    }
  }

  assert.deepEqual(findings, [], `Native browser dialogs remain in: ${findings.join(', ')}`);
});

test('the shared dialog utility uses one native dialog and normal form', async () => {
  const source = await readFile(path.join(editorAssets, 'dialogs.js'), 'utf8');

  assert.match(source, /createElement\('dialog'\)/);
  assert.match(source, /createElement\('form'\)/);
  assert.match(source, /dialog\.showModal\(\)/);
  assert.match(source, /requestText/);
  assert.match(source, /requestFields/);
  assert.match(source, /requestChoice/);
  assert.match(source, /confirmAction/);
  assert.match(source, /showMessage/);
  assert.match(source, /aria-errormessage/);
  assert.match(source, /aria-invalid/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /role\s*=\s*['"]dialog['"]/);
});

test('editor feature modules receive the shared dialog service', async () => {
  const app = await readFile(path.join(editorAssets, 'app.js'), 'utf8');
  const materials = await readFile(path.join(editorAssets, 'materials.js'), 'utf8');
  const quizzes = await readFile(path.join(editorAssets, 'quizzes.js'), 'utf8');
  const slides = await readFile(path.join(editorAssets, 'slides.js'), 'utf8');
  const assets = await readFile(path.join(editorAssets, 'assets.js'), 'utf8');
  const objectives = await readFile(path.join(editorAssets, 'objectives.js'), 'utf8');
  const richEditor = await readFile(path.join(editorAssets, 'rich-editor.js'), 'utf8');

  assert.match(app, /const editorDialogs = createEditorDialogs\(\)/);
  assert.ok((app.match(/dialogs:\s*editorDialogs/g) || []).length >= 6);
  assert.match(materials, /createMaterialsModule\(\{[^}]*dialogs/s);
  assert.match(quizzes, /createQuizzesModule\(\{[^}]*dialogs/s);
  assert.match(slides, /createSlidesModule\(\{[^}]*dialogs/s);
  assert.match(assets, /createAssetsModule\(\{[^}]*dialogs/s);
  assert.match(objectives, /showObjectivesManager\([^,]+,\s*\{[^}]*dialogs/s);
  assert.match(richEditor, /createMarkdownEditor\(\{[^}]*dialogs/s);
});

test('dialog styling is scoped and includes dark-mode-compatible tokens and reflow rules', async () => {
  const css = await readFile(path.join(editorAssets, 'app.css'), 'utf8');

  assert.match(css, /dialog\.editor-dialog/);
  assert.match(css, /dialog\.editor-dialog::backdrop/);
  assert.match(css, /\.editor-dialog-field-error/);
  assert.match(css, /\.editor-dialog-submit--danger/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.editor-dialog-actions/);
  assert.match(css, /var\(--editor-surface\)/);
  assert.match(css, /var\(--editor-danger\)/);
});
