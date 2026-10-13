// Marin Learn - Node runtime adapter for the reviewed vendored PptxGenJS bundle
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

import { JSZIP_VERSION, PPTXGENJS_VERSION } from './runtime-browser.js';

export const PPTX_NODE_BUNDLE_URL = new URL('../../vendor/pptxgenjs/pptxgen.bundle.js', import.meta.url);
export const PPTX_NODE_MANIFEST_URL = new URL('../../vendor/pptxgenjs/manifest.json', import.meta.url);

let pendingRuntime = null;

const TRANSPARENT_PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2W7zWQAAAABJRU5ErkJggg==';

class NodeSvgFallbackImage {
  constructor() {
    this.width = 1;
    this.height = 1;
    this.onload = null;
    this.onerror = null;
    this._src = '';
  }

  set src(value) {
    this._src = String(value || '');
    queueMicrotask(() => {
      if (typeof this.onload === 'function') this.onload();
    });
  }

  get src() {
    return this._src;
  }
}

const NODE_SVG_FALLBACK_DOCUMENT = Object.freeze({
  createElement(name) {
    if (String(name || '').toUpperCase() !== 'CANVAS') {
      throw new Error(`The vendored PowerPoint runtime requested an unsupported DOM element: ${name}`);
    }
    return {
      width: 1,
      height: 1,
      getContext(kind) {
        if (kind !== '2d') throw new Error(`Unsupported canvas context requested by PowerPoint runtime: ${kind}`);
        return { drawImage() {} };
      },
      toDataURL() {
        return TRANSPARENT_PNG_DATA_URI;
      }
    };
  }
});

export async function loadNodePptxRuntime({
  bundleUrl = PPTX_NODE_BUNDLE_URL,
  manifestUrl = PPTX_NODE_MANIFEST_URL,
  verify = true,
  cache = true
} = {}) {
  const useSharedCache = cache && verify &&
    String(bundleUrl) === String(PPTX_NODE_BUNDLE_URL) &&
    String(manifestUrl) === String(PPTX_NODE_MANIFEST_URL);
  if (useSharedCache && pendingRuntime) return pendingRuntime;
  const load = createNodeRuntime({ bundleUrl, manifestUrl, verify });
  if (!useSharedCache) return load;
  pendingRuntime = load.catch((error) => {
    pendingRuntime = null;
    throw error;
  });
  return pendingRuntime;
}

export async function verifyNodePptxRuntime({
  bundleUrl = PPTX_NODE_BUNDLE_URL,
  manifestUrl = PPTX_NODE_MANIFEST_URL
} = {}) {
  const [bundleBytes, manifestText] = await Promise.all([
    readFile(bundleUrl),
    readFile(manifestUrl, 'utf8')
  ]);
  const manifest = JSON.parse(manifestText);
  const expected = manifest?.files?.['pptxgen.bundle.js'];
  if (!expected || !Number.isInteger(expected.bytes) || typeof expected.sha256 !== 'string') {
    throw new Error('The vendored PowerPoint manifest does not define pptxgen.bundle.js integrity metadata.');
  }
  if (manifest.pptxGenJsVersion !== PPTXGENJS_VERSION || manifest.jsZipVersion !== JSZIP_VERSION) {
    throw new Error(
      `The vendored PowerPoint manifest versions do not match the exporter runtime contract ` +
      `(PptxGenJS ${PPTXGENJS_VERSION}, JSZip ${JSZIP_VERSION}).`
    );
  }
  const sha256 = createHash('sha256').update(bundleBytes).digest('hex');
  if (bundleBytes.byteLength !== expected.bytes || sha256 !== expected.sha256) {
    throw new Error('The vendored PowerPoint runtime failed its size or SHA-256 integrity check.');
  }
  return {
    bundleBytes,
    manifest,
    sha256,
    bytes: bundleBytes.byteLength
  };
}

async function createNodeRuntime({ bundleUrl, manifestUrl, verify }) {
  let bundleBytes;
  let manifest = null;
  let sha256 = null;
  if (verify) {
    const integrity = await verifyNodePptxRuntime({ bundleUrl, manifestUrl });
    bundleBytes = integrity.bundleBytes;
    manifest = integrity.manifest;
    sha256 = integrity.sha256;
  } else {
    bundleBytes = await readFile(bundleUrl);
    sha256 = createHash('sha256').update(bundleBytes).digest('hex');
  }

  const source = bundleBytes.toString('utf8');
  const context = createRuntimeContext();
  vm.createContext(context);
  vm.runInContext(source, context, {
    filename: fileNameFromUrl(bundleUrl),
    displayErrors: true
  });

  context.Image = NodeSvgFallbackImage;
  context.document = NODE_SVG_FALLBACK_DOCUMENT;

  if (typeof context.PptxGenJS !== 'function' || typeof context.JSZip !== 'function') {
    throw new Error('The vendored PowerPoint bundle did not expose PptxGenJS and JSZip in Node.');
  }

  return Object.freeze({
    PptxGenJS: context.PptxGenJS,
    JSZip: context.JSZip,
    source: 'vendored-node-bundle',
    pptxGenJsVersion: manifest?.pptxGenJsVersion || PPTXGENJS_VERSION,
    jsZipVersion: manifest?.jsZipVersion || JSZIP_VERSION,
    bundleSha256: sha256,
    bundleBytes: bundleBytes.byteLength,
    svgFallback: 'embedded-svg-with-transparent-png-compatibility'
  });
}

function createRuntimeContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    TextEncoder,
    TextDecoder,
    Blob,
    URL,
    Uint8Array,
    ArrayBuffer,
    DataView,
    queueMicrotask,
    atob: globalThis.atob || ((value) => Buffer.from(value, 'base64').toString('binary')),
    btoa: globalThis.btoa || ((value) => Buffer.from(value, 'binary').toString('base64'))
  };
  context.window = context;
  context.self = context;
  context.global = context;
  return context;
}

function fileNameFromUrl(value) {
  try {
    return new URL(value).pathname.split('/').pop() || 'pptxgen.bundle.js';
  } catch {
    return 'pptxgen.bundle.js';
  }
}
