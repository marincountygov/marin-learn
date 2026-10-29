export function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttr(value = '') {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

export function slugify(value, fallback = 'item') {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return slug || fallback;
}

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().toLowerCase();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  if (!globalThis.crypto?.getRandomValues) {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function uuidUrn() {
  return `urn:uuid:${uuid()}`;
}

export function uuidFromUrn(value = '') {
  return String(value).replace(/^urn:uuid:/i, '').toLowerCase();
}

export function ref(id) {
  return { '@id': id };
}

export function asArray(value) {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

export function deepClone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

export function formatBytes(bytes) {
  const count = Number(bytes) || 0;
  if (count < 1024) return `${count} B`;
  if (count < 1024 ** 2) return `${(count / 1024).toFixed(1)} KB`;
  return `${(count / 1024 ** 2).toFixed(1)} MB`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return new Date().toISOString();
}

export function safeFilename(value, fallback = 'file') {
  const parts = String(value || '').split('.');
  const extension = parts.length > 1 ? `.${parts.pop().toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  const base = slugify(parts.join('.'), fallback);
  return `${base}${extension}`;
}

export function uniqueValue(base, existing) {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function uniquePath(path, existing) {
  if (!existing.has(path)) return path;
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf('.');
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : '';
  let suffix = 2;
  while (existing.has(`${dir}${base}-${suffix}${ext}`)) suffix += 1;
  return `${dir}${base}-${suffix}${ext}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeUuidUrn(value) {
  const uuidValue = uuidFromUrn(value);
  return `urn:uuid:${uuidValue}`;
}

export function isUuidUrn(value) {
  return /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value));
}

export function downloadBlob(blob, filename) {
  window.marinDownload({ content: blob, name: filename });
}

export function debounce(fn, wait = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function textDecoder(bytes) {
  // marin-shared-helpers: allow (package text must be valid UTF-8; an error beats a guess)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export function textEncoder(text) {
  return new TextEncoder().encode(text);
}

export function compareByName(a, b) {
  return String(a?.name || a?.identifier || '').localeCompare(String(b?.name || b?.identifier || ''), undefined, { sensitivity: 'base' });
}
