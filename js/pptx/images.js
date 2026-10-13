// Marin Learn - PPTX image collection, resolution, and sizing
import { sniffMediaType, validateAssetBytes } from '../core/assets.js';
import { marinAssetToUrn } from '../core/markdown.js';
import { asArray, textDecoder } from '../core/utils.js';
import { PptxExportError, pptxDiagnostic } from './errors.js';

export function createPptxAssetIndex(pkg) {
  const graph = pkg?.graphDocument?.['@graph'];
  const byId = new Map();
  if (!Array.isArray(graph)) return byId;
  for (const object of graph) {
    if (!hasType(object, 'ImageObject')) continue;
    const id = String(object?.['@id'] || '');
    if (!id) continue;
    byId.set(id, object);
    const uuid = id.replace(/^urn:uuid:/i, '').toLowerCase();
    if (uuid) byId.set(uuid, object);
  }
  return byId;
}

export function collectMarkdownImages(ast) {
  const output = [];
  const visitInline = (nodes) => {
    for (const node of asArray(nodes)) {
      if (node?.type === 'image') output.push(node);
      if (node?.children) visitInline(node.children);
    }
  };
  const visitBlocks = (blocks) => {
    for (const block of asArray(blocks)) {
      if (block?.children) {
        if (block.type === 'paragraph' || block.type === 'heading') visitInline(block.children);
        else visitBlocks(block.children);
      }
      if (block?.type === 'list') {
        for (const item of asArray(block.items)) visitBlocks(item);
      }
      if (block?.type === 'table') {
        for (const cell of asArray(block.header)) visitInline(cell);
        for (const row of asArray(block.rows)) for (const cell of asArray(row)) visitInline(cell);
      }
    }
  };
  visitBlocks(ast);
  return output;
}

export function stripMarkdownImages(ast) {
  const cleanInline = (nodes) => asArray(nodes)
    .filter((node) => node?.type !== 'image')
    .map((node) => node?.children ? { ...node, children: cleanInline(node.children) } : { ...node });

  const cleanBlocks = (blocks) => asArray(blocks).map((block) => {
    if (block?.type === 'paragraph' || block?.type === 'heading') {
      return { ...block, children: cleanInline(block.children) };
    }
    if (block?.type === 'blockquote') {
      return { ...block, children: cleanBlocks(block.children) };
    }
    if (block?.type === 'list') {
      return { ...block, items: asArray(block.items).map((item) => cleanBlocks(item)) };
    }
    if (block?.type === 'table') {
      return {
        ...block,
        header: asArray(block.header).map((cell) => cleanInline(cell)),
        rows: asArray(block.rows).map((row) => asArray(row).map((cell) => cleanInline(cell)))
      };
    }
    return { ...block };
  }).filter((block) => {
    if (block.type !== 'paragraph') return true;
    return block.children.some((node) => inlineNodeHasText(node));
  });

  return cleanBlocks(ast);
}

export function resolvePptxImageUse(pkg, assetIndex, imageNode, context = {}) {
  const assetId = marinAssetToUrn(imageNode?.destination);
  if (!assetId) {
    throw new PptxExportError(
      `Slide image destination “${imageNode?.destination || ''}” is not a Marin Learn asset reference.`,
      'pptx-image-reference-invalid',
      context
    );
  }
  const asset = assetIndex.get(assetId) || assetIndex.get(assetId.replace(/^urn:uuid:/i, '').toLowerCase());
  if (!asset) {
    throw new PptxExportError('A slide image reference could not be resolved.', 'pptx-image-unresolved', {
      ...context,
      assetId
    });
  }
  const path = String(asset.contentUrl || '');
  const file = pkg?.assetFiles?.[path];
  if (!path || !file?.bytes) {
    throw new PptxExportError(`Image asset “${asset.name || asset.identifier || assetId}” has no package bytes.`, 'pptx-image-bytes-missing', {
      ...context,
      assetId,
      path
    });
  }
  const bytes = toUint8Array(file.bytes);
  const declaredType = String(asset.encodingFormat || file.type || sniffMediaType(bytes));
  const diagnostics = validateAssetBytes(bytes, declaredType, path);
  const blocking = diagnostics.filter((item) => item.severity === 'error');
  if (blocking.length) {
    throw new PptxExportError(`Image asset “${asset.name || asset.identifier || assetId}” is not safe to export.`, 'pptx-image-invalid', {
      ...context,
      assetId,
      path,
      diagnostics: blocking
    });
  }
  const dimensions = imageDimensions(bytes, declaredType, asset);
  if (!dimensions) {
    throw new PptxExportError(`Image asset “${asset.name || asset.identifier || assetId}” has no usable dimensions.`, 'pptx-image-dimensions-missing', {
      ...context,
      assetId,
      path
    });
  }
  const altText = String(imageNode?.alt || '');
  return {
    node: imageNode,
    asset,
    assetId,
    path,
    bytes,
    type: declaredType,
    width: dimensions.width,
    height: dimensions.height,
    data: bytesToDataUri(bytes, declaredType),
    altText,
    decorative: altText.trim() === '',
    objectName: altText.trim() === ''
      ? `Decorative: ${asset.name || asset.identifier || 'image'}`
      : `Informative image: ${asset.name || asset.identifier || 'image'}`
  };
}

export function collectPptxImageDiagnostics(pkg, assetIndex, imageNodes, context = {}) {
  const images = [];
  const diagnostics = [];
  for (const [index, imageNode] of asArray(imageNodes).entries()) {
    try {
      images.push(resolvePptxImageUse(pkg, assetIndex, imageNode, { ...context, imageIndex: index + 1 }));
    } catch (error) {
      diagnostics.push(pptxDiagnostic(
        'error',
        error?.code || 'pptx-image-error',
        error?.message || 'A slide image could not be prepared for PowerPoint.',
        error?.details || { ...context, imageIndex: index + 1 }
      ));
    }
  }
  return { images, diagnostics };
}

export function imageSizingContain(image, x, y, w, h) {
  const width = Number(image?.width);
  const height = Number(image?.height);
  if (!(width > 0) || !(height > 0)) return { x, y, w, h };
  const imageRatio = width / height;
  const boxRatio = w / h;
  if (imageRatio > boxRatio) {
    const fittedHeight = w / imageRatio;
    return { x, y: y + (h - fittedHeight) / 2, w, h: fittedHeight };
  }
  const fittedWidth = h * imageRatio;
  return { x: x + (w - fittedWidth) / 2, y, w: fittedWidth, h };
}

export function bytesToDataUri(bytes, mediaType) {
  const data = toUint8Array(bytes);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < data.length; offset += chunkSize) {
    binary += String.fromCharCode(...data.subarray(offset, offset + chunkSize));
  }
  return `data:${mediaType};base64,${btoa(binary)}`;
}

export function imageDimensions(bytes, mediaType, asset = {}) {
  const width = Number(asset?.width);
  const height = Number(asset?.height);
  if (width > 0 && height > 0) return { width, height };

  const data = toUint8Array(bytes);
  if (mediaType === 'image/png' && data.length >= 24) {
    return { width: readUint32(data, 16), height: readUint32(data, 20) };
  }
  if (mediaType === 'image/gif' && data.length >= 10) {
    return { width: readUint16LE(data, 6), height: readUint16LE(data, 8) };
  }
  if (mediaType === 'image/jpeg') return jpegDimensions(data);
  if (mediaType === 'image/webp') return webpDimensions(data);
  if (mediaType === 'image/svg+xml') return svgDimensions(data);
  return null;
}

function inlineNodeHasText(node) {
  if (!node) return false;
  if (node.type === 'text' || node.type === 'code') return Boolean(String(node.value || '').trim());
  return asArray(node.children).some((child) => inlineNodeHasText(child));
}

function hasType(object, type) {
  return asArray(object?.['@type']).includes(type);
}

function toUint8Array(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value || 0);
}

function readUint32(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function readUint16LE(data, offset) {
  return data[offset] | (data[offset + 1] << 8);
}

function jpegDimensions(data) {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < data.length) {
    if (data[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = data[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > data.length) break;
    const length = (data[offset] << 8) | data[offset + 1];
    if (length < 2 || offset + length > data.length) break;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      return {
        height: (data[offset + 3] << 8) | data[offset + 4],
        width: (data[offset + 5] << 8) | data[offset + 6]
      };
    }
    offset += length;
  }
  return null;
}

function webpDimensions(data) {
  if (data.length < 30 || ascii(data, 0, 4) !== 'RIFF' || ascii(data, 8, 12) !== 'WEBP') return null;
  const kind = ascii(data, 12, 16);
  if (kind === 'VP8X') {
    return {
      width: 1 + data[24] + (data[25] << 8) + (data[26] << 16),
      height: 1 + data[27] + (data[28] << 8) + (data[29] << 16)
    };
  }
  if (kind === 'VP8L' && data.length >= 25) {
    const b0 = data[21];
    const b1 = data[22];
    const b2 = data[23];
    const b3 = data[24];
    return {
      width: 1 + (((b2 & 0x3f) << 8) | b1),
      height: 1 + (((b3 & 0x0f) << 10) | (b2 >> 6) | ((b3 & 0xf0) << 2))
    };
  }
  if (kind === 'VP8 ' && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    return {
      width: readUint16LE(data, 26) & 0x3fff,
      height: readUint16LE(data, 28) & 0x3fff
    };
  }
  return null;
}

function svgDimensions(data) {
  const source = textDecoder(data.slice(0, 8192));
  const svgTag = source.match(/<svg\b[^>]*>/i)?.[0] || '';
  const width = numberAttribute(svgTag, 'width');
  const height = numberAttribute(svgTag, 'height');
  if (width > 0 && height > 0) return { width, height };
  const viewBox = svgTag.match(/\bviewBox\s*=\s*["']\s*[-+\d.eE]+[ ,]+[-+\d.eE]+[ ,]+([-+\d.eE]+)[ ,]+([-+\d.eE]+)\s*["']/i);
  if (viewBox) {
    const viewWidth = Number(viewBox[1]);
    const viewHeight = Number(viewBox[2]);
    if (viewWidth > 0 && viewHeight > 0) return { width: viewWidth, height: viewHeight };
  }
  return null;
}

function numberAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']\\s*([-+\\d.eE]+)`, 'i'));
  return match ? Number(match[1]) : 0;
}

function ascii(data, start, end) {
  return String.fromCharCode(...data.slice(start, end));
}
