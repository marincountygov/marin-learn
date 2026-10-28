import { IMAGE_TYPES } from './constants.js';
import { textDecoder } from './utils.js';

export function sniffMediaType(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (data.length >= 8 && bytesEqual(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 6) {
    const signature = ascii(data.slice(0, 6));
    if (signature === 'GIF87a' || signature === 'GIF89a') return 'image/gif';
  }
  if (data.length >= 12 && ascii(data.slice(0, 4)) === 'RIFF' && ascii(data.slice(8, 12)) === 'WEBP') return 'image/webp';
  const prefix = safeTextPrefix(data, 4096).replace(/^\uFEFF/, '').trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(prefix)) return 'image/svg+xml';
  if (data.length >= 5 && ascii(data.slice(0, 5)) === '%PDF-') return 'application/pdf';
  return 'application/octet-stream';
}

export function validateAssetBytes(bytes, declaredType, path = '') {
  const diagnostics = [];
  const actual = sniffMediaType(bytes);
  const extensionType = mediaTypeForExtension(path);
  if (actual !== 'application/octet-stream' && declaredType !== actual) {
    diagnostics.push({ severity: 'error', code: 'asset-type-mismatch', message: `Declared media type ${declaredType} does not match detected type ${actual}.` });
  }
  if (extensionType && extensionType !== declaredType) {
    diagnostics.push({ severity: 'error', code: 'asset-extension-mismatch', message: `File extension for ${path} does not match declared media type ${declaredType}.` });
  }
  if (declaredType === 'image/svg+xml' || actual === 'image/svg+xml') {
    diagnostics.push(...validateSvg(bytes));
  }
  return diagnostics;
}

export function validateSvg(bytes) {
  let source;
  try {
    source = textDecoder(bytes);
  } catch {
    return [{ severity: 'error', code: 'svg-encoding', message: 'SVG must be valid UTF-8 text.' }];
  }
  const diagnostics = [];
  const blockedTags = /<\s*(?:script|foreignObject|iframe|object|embed|audio|video|canvas|link|meta)\b/i;
  if (blockedTags.test(source)) diagnostics.push({ severity: 'error', code: 'svg-active-element', message: 'SVG contains a prohibited active or embedded-document element.' });
  if (/\son[a-z0-9_-]+\s*=/i.test(source)) diagnostics.push({ severity: 'error', code: 'svg-event-handler', message: 'SVG contains an event-handler attribute.' });
  if (/javascript\s*:/i.test(source) || /vbscript\s*:/i.test(source)) diagnostics.push({ severity: 'error', code: 'svg-script-url', message: 'SVG contains an unsafe script URL.' });
  for (const match of source.matchAll(/\s(?:href|xlink:href)\s*=\s*["']([^"']+)["']/gi)) {
    const destination = match[1].trim();
    if (!destination.startsWith('#')) diagnostics.push({ severity: 'error', code: 'svg-external-reference', message: 'SVG external resource references are not allowed.' });
  }
  if (/<!DOCTYPE/i.test(source) || /<!ENTITY/i.test(source)) diagnostics.push({ severity: 'error', code: 'svg-doctype', message: 'SVG document type and entity declarations are not allowed.' });
  if (!/<\s*svg\b/i.test(source)) diagnostics.push({ severity: 'error', code: 'svg-root', message: 'SVG does not contain an svg root element.' });
  return diagnostics;
}

export function mediaTypeForExtension(path = '') {
  const lower = String(path).toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return null;
}

export function extensionForMediaType(type) {
  return IMAGE_TYPES[type] || '';
}

export function isSupportedImageType(type) {
  return Object.prototype.hasOwnProperty.call(IMAGE_TYPES, type);
}

function bytesEqual(data, expected) {
  return expected.every((value, index) => data[index] === value);
}

function ascii(bytes) {
  return String.fromCharCode(...bytes);
}

function safeTextPrefix(bytes, limit) {
  try {
    // marin-shared-helpers: allow (a short look at the start of a package file to sniff its type, not a file the reader opened)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, limit));
  } catch {
    return '';
  }
}
