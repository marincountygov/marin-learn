import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('the publish workflow only checks files: it must not deploy a partial site to GitHub Pages', async () => {
  // The site is served from the repository root. A workflow that uploads only generated
  // files as the Pages artifact replaces the whole app with a page that has no scripts.
  const workflow = await readFile(path.join(ROOT, '.github', 'workflows', 'publish.yml'), 'utf8');
  assert.doesNotMatch(workflow, /deploy-pages|upload-pages-artifact|configure-pages|pages: write|id-token: write/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /scripts\/check_published\.py/);
});
