import {
  MAX_ZIP_ENTRIES,
  MAX_ZIP_ENTRY_BYTES,
  MAX_ZIP_RATIO,
  MAX_ZIP_TOTAL_BYTES
} from './constants.js';
import { textDecoder, textEncoder } from './utils.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

const CRC_TABLE = buildCrcTable();

export function crc32(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZip(entries) {
  const files = entries.map((entry) => {
    const name = normalizeEntryName(entry.name);
    const data = typeof entry.data === 'string' ? textEncoder(entry.data) : entry.data instanceof Uint8Array ? entry.data : new Uint8Array(entry.data);
    const nameBytes = textEncoder(name);
    return { name, nameBytes, data, crc: crc32(data), offset: 0 };
  });

  let localSize = 0;
  for (const file of files) localSize += 30 + file.nameBytes.length + file.data.length;
  let centralSize = 0;
  for (const file of files) centralSize += 46 + file.nameBytes.length;
  const total = localSize + centralSize + 22;
  const output = new Uint8Array(total);
  const view = new DataView(output.buffer);
  let cursor = 0;

  for (const file of files) {
    file.offset = cursor;
    write32(view, cursor, SIG_LOCAL);
    write16(view, cursor + 4, 20);
    write16(view, cursor + 6, 0x0800);
    write16(view, cursor + 8, 0);
    write16(view, cursor + 10, 0);
    write16(view, cursor + 12, 0x0021);
    write32(view, cursor + 14, file.crc);
    write32(view, cursor + 18, file.data.length);
    write32(view, cursor + 22, file.data.length);
    write16(view, cursor + 26, file.nameBytes.length);
    write16(view, cursor + 28, 0);
    output.set(file.nameBytes, cursor + 30);
    output.set(file.data, cursor + 30 + file.nameBytes.length);
    cursor += 30 + file.nameBytes.length + file.data.length;
  }

  const centralOffset = cursor;
  for (const file of files) {
    write32(view, cursor, SIG_CENTRAL);
    write16(view, cursor + 4, 0x0314);
    write16(view, cursor + 6, 20);
    write16(view, cursor + 8, 0x0800);
    write16(view, cursor + 10, 0);
    write16(view, cursor + 12, 0);
    write16(view, cursor + 14, 0x0021);
    write32(view, cursor + 16, file.crc);
    write32(view, cursor + 20, file.data.length);
    write32(view, cursor + 24, file.data.length);
    write16(view, cursor + 28, file.nameBytes.length);
    write16(view, cursor + 30, 0);
    write16(view, cursor + 32, 0);
    write16(view, cursor + 34, 0);
    write16(view, cursor + 36, 0);
    write32(view, cursor + 38, 0x81a40000);
    write32(view, cursor + 42, file.offset);
    output.set(file.nameBytes, cursor + 46);
    cursor += 46 + file.nameBytes.length;
  }

  const centralLength = cursor - centralOffset;
  write32(view, cursor, SIG_EOCD);
  write16(view, cursor + 4, 0);
  write16(view, cursor + 6, 0);
  write16(view, cursor + 8, files.length);
  write16(view, cursor + 10, files.length);
  write32(view, cursor + 12, centralLength);
  write32(view, cursor + 16, centralOffset);
  write16(view, cursor + 20, 0);
  return output;
}

export async function readZip(input, options = {}) {
  const limits = {
    maxEntries: options.maxEntries ?? MAX_ZIP_ENTRIES,
    maxEntryBytes: options.maxEntryBytes ?? MAX_ZIP_ENTRY_BYTES,
    maxTotalBytes: options.maxTotalBytes ?? MAX_ZIP_TOTAL_BYTES,
    maxRatio: options.maxRatio ?? MAX_ZIP_RATIO
  };
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) throw new ZipError('ZIP', 'zip-eocd', 'The file does not contain a valid ZIP end record.');

  const disk = read16(view, eocd + 4);
  const centralDisk = read16(view, eocd + 6);
  const diskEntries = read16(view, eocd + 8);
  const totalEntries = read16(view, eocd + 10);
  const centralSize = read32(view, eocd + 12);
  const centralOffset = read32(view, eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) throw new ZipError('ZIP', 'zip-multidisk', 'Multi-disk ZIP archives are not supported.');
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) throw new ZipError('ZIP', 'zip64', 'ZIP64 archives are not supported in Marin Learn v1.');
  if (totalEntries > limits.maxEntries) throw new ZipError('ZIP', 'zip-entry-limit', `ZIP contains ${totalEntries} entries; the limit is ${limits.maxEntries}.`);
  if (centralOffset + centralSize > bytes.length) throw new ZipError('ZIP', 'zip-central-range', 'ZIP central directory extends beyond the file.');

  const metadata = [];
  let cursor = centralOffset;
  let totalUncompressed = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (read32(view, cursor) !== SIG_CENTRAL) throw new ZipError('ZIP', 'zip-central-signature', 'ZIP central directory is malformed.');
    const versionMade = read16(view, cursor + 4);
    const flags = read16(view, cursor + 8);
    const method = read16(view, cursor + 10);
    const crc = read32(view, cursor + 16);
    const compressedSize = read32(view, cursor + 20);
    const uncompressedSize = read32(view, cursor + 24);
    const nameLength = read16(view, cursor + 28);
    const extraLength = read16(view, cursor + 30);
    const commentLength = read16(view, cursor + 32);
    const externalAttributes = read32(view, cursor + 38);
    const localOffset = read32(view, cursor + 42);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > bytes.length) throw new ZipError('ZIP', 'zip-central-entry-range', 'ZIP central-directory entry extends beyond the file.');
    const name = decodeName(bytes.slice(nameStart, nameEnd), flags);
    if (flags & 0x0001) throw new ZipError('ZIP', 'zip-encrypted', `Encrypted ZIP entry is not allowed: ${name}.`);
    if (![0, 8].includes(method)) throw new ZipError('ZIP', 'zip-compression', `Unsupported ZIP compression method ${method} for ${name}.`);
    if (uncompressedSize > limits.maxEntryBytes) throw new ZipError('ZIP', 'zip-entry-size', `${name} exceeds the per-entry uncompressed size limit.`);
    totalUncompressed += uncompressedSize;
    if (totalUncompressed > limits.maxTotalBytes) throw new ZipError('ZIP', 'zip-total-size', 'ZIP exceeds the total uncompressed size limit.');
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxRatio) throw new ZipError('ZIP', 'zip-ratio', `${name} exceeds the allowed compression ratio.`);

    const host = versionMade >>> 8;
    const mode = host === 3 ? (externalAttributes >>> 16) & 0xffff : 0;
    const fileType = mode & 0xf000;
    const directory = name.endsWith('/') || fileType === 0x4000;
    if (fileType === 0xa000) throw new ZipError('ZIP', 'zip-symlink', `Symbolic-link entry is not allowed: ${name}.`);
    if (fileType && ![0x4000, 0x8000].includes(fileType)) throw new ZipError('ZIP', 'zip-special-entry', `Special ZIP entry is not allowed: ${name}.`);
    metadata.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset, directory });
    cursor = nameEnd + extraLength + commentLength;
  }

  const rawEntries = [];
  for (const entry of metadata) {
    if (entry.directory) continue;
    validateRawName(entry.name);
    if (read32(view, entry.localOffset) !== SIG_LOCAL) throw new ZipError('ZIP', 'zip-local-signature', `Local ZIP header is malformed for ${entry.name}.`);
    const nameLength = read16(view, entry.localOffset + 26);
    const extraLength = read16(view, entry.localOffset + 28);
    const dataStart = entry.localOffset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > bytes.length) throw new ZipError('ZIP', 'zip-entry-range', `Compressed bytes for ${entry.name} extend beyond the archive.`);
    const compressed = bytes.slice(dataStart, dataEnd);
    let data;
    if (entry.method === 0) data = compressed;
    else data = await inflateRaw(compressed);
    if (data.length !== entry.uncompressedSize) throw new ZipError('ZIP', 'zip-size-mismatch', `Uncompressed size does not match for ${entry.name}.`);
    if (crc32(data) !== entry.crc) throw new ZipError('ZIP', 'zip-crc', `CRC check failed for ${entry.name}.`);
    rawEntries.push({ name: entry.name, data });
  }

  const repaired = repairEntries(rawEntries, options.repair !== false);
  const entries = new Map();
  const lowerNames = new Map();
  for (const entry of repaired.entries) {
    validateRawName(entry.name);
    if (entries.has(entry.name)) throw new ZipError('ZIP', 'zip-duplicate-entry', `ZIP contains duplicate entry ${entry.name}.`);
    const lower = entry.name.toLowerCase();
    if (lowerNames.has(lower) && lowerNames.get(lower) !== entry.name) throw new ZipError('ZIP', 'zip-case-collision', `ZIP paths differ only by case: ${lowerNames.get(lower)} and ${entry.name}.`);
    entries.set(entry.name, entry.data);
    lowerNames.set(lower, entry.name);
  }
  return { entries, warnings: repaired.warnings };
}

function repairEntries(entries, enabled) {
  const warnings = [];
  let filtered = entries;
  if (enabled) {
    const before = filtered.length;
    filtered = filtered.filter((entry) => !entry.name.startsWith('__MACOSX/') && !/(^|\/)(?:\.DS_Store|Thumbs\.db)$/i.test(entry.name));
    if (filtered.length !== before) warnings.push('Removed operating-system metadata entries while opening the package in repair mode.');
    const names = filtered.map((entry) => entry.name);
    if (!names.includes('learning.json') && names.length) {
      const firstSegments = new Set(names.map((name) => name.split('/')[0]));
      if (firstSegments.size === 1 && names.every((name) => name.includes('/'))) {
        const prefix = `${[...firstSegments][0]}/`;
        const stripped = filtered.map((entry) => ({ ...entry, name: entry.name.slice(prefix.length) }));
        if (stripped.some((entry) => entry.name === 'learning.json')) {
          filtered = stripped;
          warnings.push(`Removed wrapper directory “${prefix.slice(0, -1)}” while opening the package in repair mode.`);
        }
      }
    }
  }
  return { entries: filtered, warnings };
}

async function inflateRaw(compressed) {
  if (typeof DecompressionStream !== 'function') throw new ZipError('ZIP', 'zip-deflate-unavailable', 'This browser cannot read deflated ZIP entries.');
  try {
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (error) {
    throw new ZipError('ZIP', 'zip-deflate', `Deflated ZIP data could not be decompressed: ${error.message}`);
  }
}

function findEocd(view) {
  const minimum = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (read32(view, offset) === SIG_EOCD) return offset;
  }
  return -1;
}

function normalizeEntryName(name) {
  validateRawName(name);
  return name.replace(/\\/g, '/');
}

function validateRawName(name) {
  if (!name || typeof name !== 'string') throw new ZipError('ZIP', 'zip-empty-name', 'ZIP entry name is empty.');
  if (name.includes('\\')) throw new ZipError('ZIP', 'zip-backslash', `ZIP entry uses backslashes: ${name}.`);
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new ZipError('ZIP', 'zip-absolute-path', `ZIP entry uses an absolute path: ${name}.`);
  const parts = name.split('/').filter((part) => part !== '');
  if (parts.some((part) => part === '.' || part === '..')) throw new ZipError('ZIP', 'zip-traversal', `ZIP entry contains a path-traversal segment: ${name}.`);
  if (/\0|[\u0001-\u001f\u007f]/.test(name)) throw new ZipError('ZIP', 'zip-control-name', `ZIP entry name contains control characters: ${name}.`);
}

function decodeName(bytes, flags) {
  if (!(flags & 0x0800)) {
    try { return textDecoder(bytes); } catch { /* continue */ }
  }
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new ZipError('ZIP', 'zip-name-encoding', 'ZIP entry name is not valid UTF-8.'); }
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
}

function read16(view, offset) { return view.getUint16(offset, true); }
function read32(view, offset) { return view.getUint32(offset, true); }
function write16(view, offset, value) { view.setUint16(offset, value, true); }
function write32(view, offset, value) { view.setUint32(offset, value >>> 0, true); }

export class ZipError extends Error {
  constructor(stage, code, message) {
    super(message);
    this.name = 'ZipError';
    this.stage = stage;
    this.code = code;
  }
}
