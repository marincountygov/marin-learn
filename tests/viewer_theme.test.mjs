import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the reader loads MarinOS before its viewer-specific stylesheet', async () => {
  const html = await read('../index.html');
  const shellIndex = html.indexOf('href="vendor/marinos/marinos.css"');
  const viewerIndex = html.indexOf('href="assets/app.css"');

  assert.ok(shellIndex >= 0, 'root viewer must load the vendored MarinOS stylesheet');
  assert.ok(viewerIndex > shellIndex, 'viewer CSS must extend MarinOS rather than precede it');
  assert.doesNotMatch(html, /href="editor\/assets\/app\.css"/);
});

test('viewer styling inherits Pico and MarinOS theme tokens without hard-coded theme colors', async () => {
  const css = await read('../assets/app.css');

  assert.match(css, /--learn-surface:\s*var\(--pico-card-background-color\)/);
  assert.match(css, /--learn-surface-subtle:\s*var\(--pico-card-sectioning-background-color\)/);
  assert.match(css, /--learn-border-subtle:\s*var\(--pico-card-border-color\)/);
  assert.match(css, /--learn-text:\s*var\(--pico-color\)/);
  assert.match(css, /--learn-muted:\s*var\(--pico-muted-color\)/);
  assert.match(css, /--learn-success:\s*var\(--app-success\)/);
  assert.match(css, /--learn-danger:\s*var\(--app-danger-text\)/);
  assert.match(css, /\.quiz-options-group\s*>\s*\.quiz-option-label\s*\{[\s\S]*?width:\s*100%;[\s\S]*?flex:\s*0 0 auto;/);

  assert.doesNotMatch(css, /var\(--pico-secondary-background/);
  assert.doesNotMatch(css, /var\(--pico-border-color/);
  assert.doesNotMatch(css, /var\(\s*--[^,)]+,/);
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i);
  assert.doesNotMatch(css, /\[data-theme=(?:["']?)(?:light|dark)/i);
});

test('viewer markup uses the App Shell badge and Pico role-button contracts', async () => {
  const sources = await Promise.all([
    read('../assets/app.js'),
    read('../js/viewer/landing.js'),
    read('../js/viewer/reader.js'),
    read('../js/viewer/quiz.js')
  ]);
  const combined = sources.join('\n');
  const reader = sources[2];

  assert.match(combined, /class="app-badge badge--level"/);
  assert.match(combined, /class="app-badge badge--resource"/);
  assert.match(combined, /class="app-badge quiz-weight-badge"/);
  assert.match(combined, /class="app-badge \$\{isCorrect \? 'badge--success' : 'badge--error'\}"/);
  assert.doesNotMatch(combined, /class="badge(?:\s|\")/);

  assert.match(reader, /class="primary" role="button"/);
  assert.doesNotMatch(reader, /class="button\b/);
});

test('the continuous reader intentionally resets Pico article cards to document sections', async () => {
  const css = await read('../assets/app.css');

  assert.match(css, /\.reader-unit\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.reader-unit\s*>\s*\.reader-unit-header\s*\{[\s\S]*?background:\s*transparent;/);
  assert.match(css, /\.reader-unit\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--learn-border-subtle\)/);
});
