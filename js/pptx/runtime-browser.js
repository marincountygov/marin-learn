// Marin Learn - lazy browser runtime loader for the vendored PptxGenJS bundle

export const PPTXGENJS_VERSION = '4.0.0';
export const JSZIP_VERSION = '3.10.1';
export const PPTX_RUNTIME_URL = new URL('../../vendor/pptxgenjs/pptxgen.bundle.js', import.meta.url).href;

let pendingRuntime = null;

export async function loadBrowserPptxRuntime({
  globalObject = globalThis,
  documentObject = globalThis.document,
  sourceUrl = PPTX_RUNTIME_URL
} = {}) {
  const existing = runtimeFromGlobal(globalObject);
  if (existing) return existing;
  if (!documentObject?.createElement || !documentObject?.head) {
    throw new Error('The browser PPTX runtime requires a document with a head element.');
  }
  assertSameOriginSource(globalObject, documentObject, sourceUrl);
  if (pendingRuntime) return pendingRuntime;

  pendingRuntime = new Promise((resolve, reject) => {
    const prior = findRuntimeScript(documentObject, sourceUrl);
    const script = prior || documentObject.createElement('script');

    const finish = () => {
      const runtime = runtimeFromGlobal(globalObject);
      if (!runtime) {
        reject(new Error('The vendored PptxGenJS bundle loaded but did not expose PptxGenJS and JSZip.'));
        return;
      }
      resolve(runtime);
    };

    const fail = () => reject(new Error(`The vendored PptxGenJS runtime could not be loaded from ${sourceUrl}.`));

    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', fail, { once: true });
    if (!prior) {
      script.src = sourceUrl;
      script.defer = true;
      script.dataset.marinPptxRuntime = sourceUrl;
      documentObject.head.appendChild(script);
    }
  }).finally(() => {
    pendingRuntime = null;
  });

  return pendingRuntime;
}

export function runtimeFromGlobal(globalObject = globalThis) {
  const PptxGenJS = globalObject?.PptxGenJS;
  const JSZip = globalObject?.JSZip;
  if (typeof PptxGenJS !== 'function' || typeof JSZip !== 'function') return null;
  return { PptxGenJS, JSZip, source: 'vendored-browser-bundle' };
}

function findRuntimeScript(documentObject, sourceUrl) {
  const scripts = documentObject.querySelectorAll?.('script[data-marin-pptx-runtime]') || [];
  return Array.from(scripts).find((script) => script?.dataset?.marinPptxRuntime === sourceUrl) || null;
}


function assertSameOriginSource(globalObject, documentObject, sourceUrl) {
  const baseHref = globalObject?.location?.href || documentObject?.baseURI;
  if (!baseHref) return;
  const base = new URL(baseHref);
  const source = new URL(sourceUrl, base);
  if (source.origin !== base.origin) {
    throw new Error(`The PowerPoint runtime must load from the Marin Learn origin, not ${source.origin}.`);
  }
}
