import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadBrowserPptxRuntime,
  runtimeFromGlobal
} from '../js/pptx/runtime-browser.js';

test('browser runtime uses existing reviewed globals without loading another script', async () => {
  const globalObject = { PptxGenJS: function PptxGenJS() {}, JSZip: function JSZip() {} };
  let created = 0;
  const documentObject = {
    head: { appendChild() { throw new Error('should not append'); } },
    createElement() { created += 1; return {}; }
  };

  const runtime = await loadBrowserPptxRuntime({ globalObject, documentObject });
  assert.equal(runtime.PptxGenJS, globalObject.PptxGenJS);
  assert.equal(runtime.JSZip, globalObject.JSZip);
  assert.equal(runtime.source, 'vendored-browser-bundle');
  assert.equal(created, 0);
});

test('browser runtime lazy-loads one same-origin script and resolves only after both globals exist', async () => {
  const globalObject = { location: { href: 'https://example.test/editor/' } };
  const listeners = new Map();
  const scripts = [];
  const script = {
    dataset: {},
    defer: false,
    src: '',
    addEventListener(type, callback) { listeners.set(type, callback); }
  };
  const sourceUrl = 'https://example.test/vendor/pptxgenjs/pptxgen.bundle.js';
  const documentObject = {
    querySelectorAll() { return scripts; },
    createElement(tag) {
      assert.equal(tag, 'script');
      return script;
    },
    head: {
      appendChild(node) {
        scripts.push(node);
        globalObject.PptxGenJS = function PptxGenJS() {};
        globalObject.JSZip = function JSZip() {};
        queueMicrotask(() => listeners.get('load')?.());
      }
    }
  };

  const runtime = await loadBrowserPptxRuntime({ globalObject, documentObject, sourceUrl });
  assert.equal(scripts.length, 1);
  assert.equal(script.src, sourceUrl);
  assert.equal(script.defer, true);
  assert.equal(script.dataset.marinPptxRuntime, sourceUrl);
  assert.equal(runtime.PptxGenJS, globalObject.PptxGenJS);
  assert.equal(runtime.JSZip, globalObject.JSZip);
});



test('browser runtime rejects a cross-origin dependency source', async () => {
  const globalObject = { location: { href: 'https://example.test/editor/' } };
  const documentObject = {
    baseURI: 'https://example.test/editor/',
    head: { appendChild() { throw new Error('must not append'); } },
    createElement() { throw new Error('must not create'); }
  };

  await assert.rejects(
    loadBrowserPptxRuntime({
      globalObject,
      documentObject,
      sourceUrl: 'https://cdn.example.invalid/pptxgen.bundle.js'
    }),
    /must load from the Marin Learn origin/
  );
});

test('runtimeFromGlobal rejects partial or absent runtimes', () => {
  assert.equal(runtimeFromGlobal({}), null);
  assert.equal(runtimeFromGlobal({ PptxGenJS() {} }), null);
  assert.equal(runtimeFromGlobal({ JSZip() {} }), null);
});
