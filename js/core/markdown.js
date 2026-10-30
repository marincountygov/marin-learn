import { escapeAttr, escapeHtml, isUuidUrn } from './utils.js';

const URI_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:']);
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const MARIN_REF_RE = new RegExp(`^marin-ref:(${UUID})$`, 'i');
const MARIN_ASSET_RE = new RegExp(`^marin-asset:(${UUID})$`, 'i');

export function normalizeMarkdownInput(value = '') {
  return String(value).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function parseMarkdown(value = '') {
  const source = normalizeMarkdownInput(value);
  const lines = source.split('\n');
  return parseBlocks(lines, 0, lines.length).nodes;
}

function parseBlocks(lines, start, end) {
  const nodes = [];
  let index = start;
  while (index < end) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(`{3,}|~{3,})([A-Za-z0-9_+\-]*)\s*$/);
    if (fence) {
      const marker = fence[1][0];
      const length = fence[1].length;
      const language = fence[2] || '';
      const body = [];
      index += 1;
      while (index < end && !new RegExp(`^\\s*${escapeRegex(marker)}{${length},}\\s*$`).test(lines[index])) {
        body.push(lines[index]);
        index += 1;
      }
      if (index < end) index += 1;
      nodes.push({ type: 'codeBlock', language, value: body.join('\n') });
      continue;
    }

    const heading = line.match(/^(#{2,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      nodes.push({ type: 'heading', level: heading[1].length, children: parseInline(heading[2]) });
      index += 1;
      continue;
    }

    if (isTableStart(lines, index, end)) {
      const header = splitTableRow(lines[index]);
      index += 2;
      const rows = [];
      while (index < end && lines[index].trim() && looksLikeTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      nodes.push({
        type: 'table',
        header: header.map(parseInline),
        rows: rows.map((row) => row.map(parseInline))
      });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quoteLines = [];
      while (index < end && (/^\s*>\s?/.test(lines[index]) || !lines[index].trim())) {
        if (!lines[index].trim()) quoteLines.push('');
        else quoteLines.push(lines[index].replace(/^\s*>\s?/, ''));
        index += 1;
      }
      nodes.push({ type: 'blockquote', children: parseMarkdown(quoteLines.join('\n')) });
      continue;
    }

    const list = listMatch(line);
    if (list) {
      const parsed = parseList(lines, index, end, list.indent, list.ordered);
      nodes.push(parsed.node);
      index = parsed.next;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < end && lines[index].trim() && !isBlockStart(lines, index, end)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    nodes.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
  }
  return { nodes, next: index };
}

function parseList(lines, start, end, baseIndent, ordered) {
  const items = [];
  let index = start;
  let startNumber = 1;
  const first = listMatch(lines[start]);
  if (ordered && first) startNumber = Number(first.marker.replace(/\D/g, '')) || 1;

  while (index < end) {
    const match = listMatch(lines[index]);
    if (!match || match.indent !== baseIndent || match.ordered !== ordered) break;
    const itemLines = [match.text];
    index += 1;
    while (index < end) {
      const nextMatch = listMatch(lines[index]);
      if (nextMatch && nextMatch.indent === baseIndent && nextMatch.ordered === ordered) break;
      if (nextMatch && nextMatch.indent < baseIndent) break;
      if (!lines[index].trim()) {
        itemLines.push('');
        index += 1;
        if (index < end) {
          const afterBlank = listMatch(lines[index]);
          if (afterBlank && afterBlank.indent <= baseIndent) break;
        }
        continue;
      }
      const strip = Math.min(lines[index].length, baseIndent + 2);
      itemLines.push(lines[index].slice(strip));
      index += 1;
    }
    items.push(parseMarkdown(itemLines.join('\n')));
  }
  return { node: { type: 'list', ordered, start: startNumber, items }, next: index };
}

function listMatch(line) {
  const match = String(line).match(/^(\s*)([-+*]|\d+[.)])\s+(.+)$/);
  if (!match) return null;
  return {
    indent: match[1].replace(/\t/g, '    ').length,
    ordered: /^\d/.test(match[2]),
    marker: match[2],
    text: match[3]
  };
}

function isBlockStart(lines, index, end) {
  const line = lines[index] || '';
  if (/^\s*(`{3,}|~{3,})/.test(line)) return true;
  if (/^(#{2,6})\s+/.test(line)) return true;
  if (/^\s*>\s?/.test(line)) return true;
  if (listMatch(line)) return true;
  return isTableStart(lines, index, end);
}

function looksLikeTableRow(line) {
  const trimmed = String(line).trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.includes('|');
}

function isTableStart(lines, index, end) {
  if (index + 1 >= end || !looksLikeTableRow(lines[index])) return false;
  const delimiter = splitTableRow(lines[index + 1]);
  return delimiter.length > 0 && delimiter.every((cell) => /^-{3,}$/.test(cell.trim()));
}

function splitTableRow(line) {
  let text = String(line).trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  const cells = [];
  let current = '';
  let escaped = false;
  for (const char of text) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
      current += char;
    } else if (char === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseInline(value = '') {
  const text = String(value);
  const nodes = [];
  let index = 0;
  let buffer = '';

  const flush = () => {
    if (buffer) nodes.push({ type: 'text', value: buffer });
    buffer = '';
  };

  while (index < text.length) {
    if (text[index] === '\\' && index + 1 < text.length) {
      buffer += text[index + 1];
      index += 2;
      continue;
    }

    if (text[index] === '`') {
      const run = text.slice(index).match(/^`+/)?.[0] || '`';
      const close = text.indexOf(run, index + run.length);
      if (close >= 0) {
        flush();
        nodes.push({ type: 'code', value: text.slice(index + run.length, close).replace(/^ | $/g, '') });
        index = close + run.length;
        continue;
      }
    }

    const image = text.slice(index).match(/^!\[([^\]]*)\]\(([^\s)]+)\)/);
    if (image) {
      flush();
      nodes.push({ type: 'image', alt: image[1], destination: image[2] });
      index += image[0].length;
      continue;
    }

    const link = text.slice(index).match(/^\[([^\]]+)\]\(([^\s)]+)\)/);
    if (link) {
      flush();
      nodes.push({ type: 'link', destination: link[2], children: parseInline(link[1]) });
      index += link[0].length;
      continue;
    }

    let delimiter = null;
    if (text.startsWith('***', index)) delimiter = '***';
    else if (text.startsWith('**', index)) delimiter = '**';
    else if (text.startsWith('__', index)) delimiter = '__';
    else if (text[index] === '*' || text[index] === '_') delimiter = text[index];
    if (delimiter) {
      const close = text.indexOf(delimiter, index + delimiter.length);
      if (close > index + delimiter.length) {
        flush();
        const children = parseInline(text.slice(index + delimiter.length, close));
        if (delimiter === '***') nodes.push({ type: 'strong', children: [{ type: 'em', children }] });
        else if (delimiter.length === 2) nodes.push({ type: 'strong', children });
        else nodes.push({ type: 'em', children });
        index = close + delimiter.length;
        continue;
      }
    }

    buffer += text[index];
    index += 1;
  }
  flush();
  return nodes;
}

export function renderMarkdown(value, options = {}) {
  const ast = Array.isArray(value) ? value : parseMarkdown(value);
  return ast.map((node) => renderBlock(node, options)).join('');
}

function renderBlock(node, options) {
  switch (node.type) {
    case 'paragraph': return `<p>${renderInline(node.children, options)}</p>`;
    case 'heading': return `<h${node.level}>${renderInline(node.children, options)}</h${node.level}>`;
    case 'codeBlock': {
      const language = node.language ? ` class="language-${escapeAttr(node.language)}"` : '';
      return `<pre><code${language}>${escapeHtml(node.value)}</code></pre>`;
    }
    case 'blockquote': return `<blockquote>${node.children.map((child) => renderBlock(child, options)).join('')}</blockquote>`;
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul';
      const start = node.ordered && node.start !== 1 ? ` start="${node.start}"` : '';
      const items = node.items.map((blocks) => `<li>${blocks.map((child) => renderBlock(child, options)).join('')}</li>`).join('');
      return `<${tag}${start}>${items}</${tag}>`;
    }
    case 'table': {
      const head = `<thead><tr>${node.header.map((cell) => `<th scope="col">${renderInline(cell, options)}</th>`).join('')}</tr></thead>`;
      const body = `<tbody>${node.rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, options)}</td>`).join('')}</tr>`).join('')}</tbody>`;
      return `<div class="table-scroll" tabindex="0" role="region" aria-label="Scrollable table"><table>${head}${body}</table></div>`;
    }
    default: return '';
  }
}

function renderInline(nodes, options) {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return escapeHtml(node.value);
      case 'strong': return `<strong>${renderInline(node.children, options)}</strong>`;
      case 'em': return `<em>${renderInline(node.children, options)}</em>`;
      case 'code': return `<code>${escapeHtml(node.value)}</code>`;
      case 'link': {
        const destination = resolveLink(node.destination, options);
        if (!destination.valid) return `<span class="broken-reference" title="${escapeAttr(destination.message)}">${renderInline(node.children, options)}</span>`;
        const extra = destination.internal ? ` data-marin-ref="${escapeAttr(destination.uuid)}"` : '';
        const external = /^https?:/i.test(destination.href) ? ' rel="noopener noreferrer"' : '';
        return `<a href="${escapeAttr(destination.href)}"${extra}${external}>${renderInline(node.children, options)}</a>`;
      }
      case 'image': {
        const match = node.destination.match(MARIN_ASSET_RE);
        if (!match) return `<span class="broken-reference">[Invalid image]</span>`;
        const uuid = match[1].toLowerCase();
        const source = options.resolveAsset?.(uuid);
        if (!source) return `<span class="broken-reference" data-marin-asset="${escapeAttr(uuid)}">[Missing image: ${escapeHtml(node.alt || 'decorative')}]</span>`;
        return `<img src="${escapeAttr(source)}" alt="${escapeAttr(node.alt)}" data-marin-asset="${escapeAttr(uuid)}">`;
      }
      default: return '';
    }
  }).join('');
}

function resolveLink(destination, options) {
  const internal = String(destination).match(MARIN_REF_RE);
  if (internal) {
    const uuid = internal[1].toLowerCase();
    const result = options.resolveRef?.(uuid);
    if (result === false || result == null) return { valid: false, message: 'Unresolved Marin Learn reference.' };
    return { valid: true, internal: true, uuid, href: typeof result === 'string' ? result : `#ref=${uuid}` };
  }
  try {
    const parsed = new URL(destination);
    if (!URI_SCHEMES.has(parsed.protocol)) return { valid: false, message: 'Unsafe or unsupported link scheme.' };
    return { valid: true, internal: false, href: parsed.href };
  } catch {
    return { valid: false, message: 'Invalid link destination.' };
  }
}

export function serializeMarkdown(ast) {
  const source = ast.map((node) => serializeBlock(node, 0)).filter(Boolean).join('\n\n');
  return canonicalizeMarkdown(source);
}

function serializeBlock(node, depth) {
  switch (node.type) {
    case 'paragraph': return serializeInline(node.children);
    case 'heading': return `${'#'.repeat(node.level)} ${serializeInline(node.children)}`;
    case 'codeBlock': {
      const longest = Math.max(0, ...[...node.value.matchAll(/`+/g)].map((match) => match[0].length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      return `${fence}${node.language || ''}\n${node.value}\n${fence}`;
    }
    case 'blockquote': {
      const inner = node.children.map((child) => serializeBlock(child, depth)).join('\n\n');
      return inner.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n');
    }
    case 'list': {
      let counter = node.start || 1;
      return node.items.map((blocks) => {
        const marker = node.ordered ? `${counter++}.` : '-';
        const body = blocks.map((child) => serializeBlock(child, depth + 1)).join('\n\n');
        const lines = body.split('\n');
        const first = `${marker} ${lines.shift() || ''}`;
        const indent = ' '.repeat(marker.length + 1);
        return [first, ...lines.map((line) => line ? `${indent}${line}` : '')].join('\n');
      }).join('\n');
    }
    case 'table': {
      const header = `| ${node.header.map(serializeInlineCell).join(' | ')} |`;
      const delimiter = `| ${node.header.map(() => '---').join(' | ')} |`;
      const rows = node.rows.map((row) => `| ${row.map(serializeInlineCell).join(' | ')} |`);
      return [header, delimiter, ...rows].join('\n');
    }
    default: return '';
  }
}

function serializeInline(nodes) {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return escapeMarkdownText(node.value);
      case 'strong': return `**${serializeInline(node.children)}**`;
      case 'em': return `*${serializeInline(node.children)}*`;
      case 'code': {
        const longest = Math.max(0, ...[...node.value.matchAll(/`+/g)].map((match) => match[0].length));
        const delimiter = '`'.repeat(Math.max(1, longest + 1));
        return `${delimiter}${node.value}${delimiter}`;
      }
      case 'link': return `[${serializeInline(node.children)}](${node.destination})`;
      case 'image': return `![${node.alt.replace(/[\[\]]/g, '')}](${node.destination})`;
      default: return '';
    }
  }).join('');
}

// A pipe ends a table cell unless a backslash escapes it. The text is already escaped (a backslash in it is `\\`), so a
// pipe needs `\|` exactly when an even number of backslashes come before it, the same rule splitTableRow reads by.
function serializeInlineCell(nodes) {
  return serializeInline(nodes)
    .replace(/(\\*)\|/g, (match, slashes) => (slashes.length % 2 === 0 ? `${slashes}\\|` : match))
    .replace(/\n/g, ' ');
}

function escapeMarkdownText(text) {
  return String(text).replace(/([\\`*_[\]])/g, '\\$1');
}

export function canonicalizeMarkdown(value = '') {
  const source = normalizeMarkdownInput(value);
  const lines = source.split('\n');
  let inFence = false;
  let marker = '';
  const normalized = lines.map((line) => {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        marker = fence[1][0];
      } else if (fence[1][0] === marker) {
        inFence = false;
      }
      return line.replace(/\s+$/, '');
    }
    if (inFence) return line;
    return line
      .replace(/\t/g, '    ')
      .replace(/\s+$/, '')
      .replace(/^(\s*)[+*]\s+/, '$1- ')
      .replace(/^(\s*)_(.+)_$/, '$1*$2*');
  });
  while (normalized.length && !normalized[normalized.length - 1]) normalized.pop();
  return `${normalized.join('\n')}\n`;
}

export function validateMarkdown(value = '', context = {}) {
  const source = normalizeMarkdownInput(value);
  const diagnostics = [];
  const add = (severity, code, message, line = null) => diagnostics.push({ severity, code, message, line });
  const lines = source.split('\n');
  let inFence = false;
  let fenceMarker = '';
  let lastHeading = 1;

  if (source.includes('\u0000')) add('error', 'markdown-control-character', 'Markdown contains a NUL control character.');
  if (/<!--|<\/?[A-Za-z][^>]*>/.test(source)) add('error', 'markdown-raw-html', 'Raw HTML and HTML comments are not allowed.');
  if (/^\s*\[[^\]]+\]:\s+/m.test(source)) add('error', 'markdown-reference-link', 'Reference-style links are not supported.');
  if (/^\s*[-+*]\s+\[[ xX]\]\s+/m.test(source)) add('error', 'markdown-task-list', 'Task-list syntax is not supported.');
  if (/<(?:https?:\/\/|mailto:|tel:)[^>]+>/.test(source)) add('error', 'markdown-autolink', 'Autolink syntax is not supported; use an inline link.');
  if (/^\s*\[\^[^\]]+\]:/m.test(source) || /\[\^[^\]]+\]/.test(source)) add('error', 'markdown-footnote', 'Footnotes are not supported.');

  lines.forEach((line, index) => {
    const number = index + 1;
    const fence = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (!inFence) {
        inFence = true;
        fenceMarker = fence[1][0];
        const info = fence[2].trim();
        if (info && !/^[A-Za-z0-9_+\-]+$/.test(info)) add('error', 'markdown-code-info', 'Code-block language identifiers may contain only letters, numbers, underscore, plus, and hyphen.', number);
        if (fenceMarker !== '`') add('warning', 'markdown-noncanonical-fence', 'Tilde code fences will be normalized to backticks.', number);
      } else if (fence[1][0] === fenceMarker) {
        inFence = false;
      }
      return;
    }
    if (inFence) return;
    if (/\t/.test(line)) add('error', 'markdown-tab', 'Tabs are not allowed outside fenced code blocks.', number);
    if (/\s{2,}$/.test(line) || /\\$/.test(line)) add('error', 'markdown-hard-break', 'Hard line-break syntax is not supported.', number);
    if (/^#\s+/.test(line)) add('error', 'markdown-h1', 'ContentUnit Markdown must not contain an H1 heading.', number);
    const heading = line.match(/^(#{2,6})\s+/);
    if (heading) {
      const level = heading[1].length;
      if (level > lastHeading + 1) add('error', 'markdown-heading-skip', `Heading level ${level} skips a level after heading level ${lastHeading}.`, number);
      lastHeading = level;
    }
    if (/^\s{0,3}(?:[-*_]\s*){3,}$/.test(line)) add('error', 'markdown-horizontal-rule', 'Horizontal rules are not supported.', number);
    if (index > 0 && /^\s*(?:=+|-+)\s*$/.test(line) && lines[index - 1].trim()) add('error', 'markdown-setext-heading', 'Setext headings are not supported.', number);
  });
  if (inFence) add('error', 'markdown-unclosed-fence', 'A fenced code block is not closed.');

  const linkPattern = /!?\[([^\]]*)\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/g;
  for (const match of source.matchAll(linkPattern)) {
    const isImage = match[0].startsWith('!');
    const destination = match[2];
    if (/\s+["']/.test(match[0])) add('error', 'markdown-link-title', 'Link and image title syntax is not supported.');
    if (isImage) {
      const asset = destination.match(MARIN_ASSET_RE);
      if (!asset) add('error', 'markdown-image-destination', 'Images must use a marin-asset UUID reference.');
      else if (context.hasAsset && !context.hasAsset(asset[1].toLowerCase())) add('error', 'markdown-missing-asset', `Image reference ${destination} does not resolve.`);
      if (match[1] && /[*_`\[\]]/.test(match[1])) add('error', 'markdown-image-alt-formatting', 'Image alternative text must be plain text.');
    } else {
      const internal = destination.match(MARIN_REF_RE);
      if (internal) {
        if (context.hasRef && !context.hasRef(internal[1].toLowerCase())) add('error', 'markdown-missing-ref', `Internal reference ${destination} does not resolve.`);
      } else {
        try {
          const parsed = new URL(destination);
          if (!URI_SCHEMES.has(parsed.protocol)) add('error', 'markdown-unsafe-link', `Link scheme ${parsed.protocol} is not allowed.`);
          if (parsed.protocol === 'http:') add('warning', 'markdown-http-link', 'Use HTTPS when the destination supports it.');
        } catch {
          add('error', 'markdown-link-destination', `Invalid or unsupported link destination: ${destination}`);
        }
      }
    }
  }

  const ast = parseMarkdown(source);
  for (const node of ast) validateAstNode(node, add);
  return diagnostics;
}

function validateAstNode(node, add) {
  if (node.type === 'table') {
    if (!node.header.length || node.header.some((cell) => plainInline(cell).trim() === '')) add('error', 'markdown-table-header', 'Every table column must have a non-empty header.');
    const width = node.header.length;
    if (node.rows.some((row) => row.length !== width)) add('error', 'markdown-table-width', 'Every table row must contain the same number of cells.');
  }
  if (node.type === 'blockquote') {
    for (const child of node.children) {
      if (['heading', 'table', 'codeBlock', 'blockquote'].includes(child.type)) add('error', 'markdown-blockquote-content', `Block quotations cannot contain ${child.type}.`);
      validateAstNode(child, add);
    }
  }
  if (node.type === 'list') {
    node.items.flat().forEach((child) => validateAstNode(child, add));
  }
}

function plainInline(nodes) {
  return nodes.map((node) => node.value || node.alt || (node.children ? plainInline(node.children) : '')).join('');
}

export function extractMarkdownReferences(value = '') {
  const refs = [];
  const assets = [];
  const source = normalizeMarkdownInput(value);
  for (const match of source.matchAll(new RegExp(`marin-ref:(${UUID})`, 'gi'))) refs.push(match[1].toLowerCase());
  for (const match of source.matchAll(new RegExp(`marin-asset:(${UUID})`, 'gi'))) assets.push(match[1].toLowerCase());
  return { refs: [...new Set(refs)], assets: [...new Set(assets)] };
}

export function markdownToPlainText(value = '') {
  return parseMarkdown(value).map((node) => blockPlainText(node)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function blockPlainText(node) {
  if (['paragraph', 'heading'].includes(node.type)) return plainInline(node.children);
  if (node.type === 'codeBlock') return node.value;
  if (node.type === 'blockquote') return node.children.map(blockPlainText).join('\n');
  if (node.type === 'list') return node.items.map((blocks) => blocks.map(blockPlainText).join(' ')).join('\n');
  if (node.type === 'table') return [node.header, ...node.rows].map((row) => row.map(plainInline).join(' | ')).join('\n');
  return '';
}

export function marinRefToUrn(destination) {
  const match = String(destination).match(MARIN_REF_RE);
  return match ? `urn:uuid:${match[1].toLowerCase()}` : null;
}

export function marinAssetToUrn(destination) {
  const match = String(destination).match(MARIN_ASSET_RE);
  return match ? `urn:uuid:${match[1].toLowerCase()}` : null;
}

export function parseMarkdownToHtml(mdText, graphData) {
  return renderMarkdown(mdText, {
    resolveRef: (uuid) => {
      const targetObj = graphData?.byId?.get(`urn:uuid:${uuid}`) || graphData?.byId?.get(uuid);
      if (targetObj) {
        return `?set=${graphData.learningSet.identifier}&view=read&resource=${targetObj.identifier || uuid}`;
      }
      return '#';
    },
    resolveAsset: (uuid) => {
      const assetObj = graphData?.byId?.get(`urn:uuid:${uuid}`) || graphData?.byId?.get(uuid);
      return assetObj ? assetObj.contentUrl : null;
    }
  });
}

function escapeRegex(value) {
  return value.regex ? value : value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
