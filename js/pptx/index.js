// Marin Learn - public PowerPoint export API
import { PptxExportError } from './errors.js';
import { generateRawPptx } from './generate.js';
import { postprocessPptx } from './postprocess.js';
import { assertPptxPreflight, preflightPptxExport } from './preflight.js';
import { loadBrowserPptxRuntime, runtimeFromGlobal } from './runtime-browser.js';
import { validatePptx } from './validate.js';

export const PPTX_EXPORTER_VERSION = '0.1.0';

export async function analyzePresentationForPptx(pkg, presentationId = null, options = {}) {
  return preflightPptxExport(pkg, presentationId, options);
}

export async function exportPresentationToPptx(pkg, presentationId = null, options = {}) {
  const preflight = await preflightPptxExport(pkg, presentationId, options);
  assertPptxPreflight(preflight);
  const runtime = await resolvePptxRuntime(options.runtime, options.runtimeOptions);
  const raw = await generateRawPptx(preflight, runtime, options.metadata);
  const processed = await postprocessPptx(raw.bytes, runtime, { language: preflight.plan.language });
  const validation = await validatePptx(processed.bytes, runtime, raw.manifest, {
    language: preflight.plan.language
  });
  if (validation.status !== 'pass') {
    throw new PptxExportError(
      'PowerPoint generation completed, but the structural validation gate failed.',
      'pptx-output-invalid',
      { diagnostics: validation.errors, validation }
    );
  }

  return {
    bytes: processed.bytes,
    filename: preflight.plan.filename,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    warnings: preflight.warnings,
    validation,
    manifest: raw.manifest,
    postprocessAudit: processed.audit,
    exporterVersion: PPTX_EXPORTER_VERSION
  };
}

export function pptxBytesToBlob(bytes) {
  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  });
}

async function resolvePptxRuntime(runtime, runtimeOptions) {
  if (typeof runtime?.PptxGenJS === 'function' && typeof runtime?.JSZip === 'function') return runtime;
  const globalRuntime = runtimeFromGlobal(globalThis);
  if (globalRuntime) return globalRuntime;
  if (globalThis.document) return loadBrowserPptxRuntime(runtimeOptions);
  throw new PptxExportError(
    'No PowerPoint runtime is available. Supply PptxGenJS and JSZip or run in a supported browser.',
    'pptx-runtime-unavailable'
  );
}
