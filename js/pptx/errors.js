// Marin Learn - PPTX export errors and diagnostics

export class PptxExportError extends Error {
  constructor(message, code = 'pptx-export-error', details = {}) {
    super(message);
    this.name = 'PptxExportError';
    this.code = code;
    this.details = details;
  }
}

export function pptxDiagnostic(severity, code, message, details = {}) {
  return { severity, code, message, ...details };
}

export function throwIfPptxErrors(errors, message = 'The selected slides cannot be exported to PowerPoint.') {
  if (!Array.isArray(errors) || errors.length === 0) return;
  throw new PptxExportError(message, 'pptx-preflight-failed', { diagnostics: errors });
}
