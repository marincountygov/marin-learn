// Marin Learn - render the constrained Markdown AST into editable PowerPoint objects
import { asArray } from '../core/utils.js';
import { PptxExportError } from './errors.js';
import { PPTX_BRAND, PPTX_TEXT } from './theme.js';

const EXTERNAL_SCHEMES = /^(https?:|mailto:|tel:)/i;
const INTERNAL_REF = /^marin-ref:/i;

export function plainTextInline(nodes) {
  return asArray(nodes).map((node) => {
    if (!node) return '';
    if (node.type === 'text' || node.type === 'code') return String(node.value || '');
    if (node.type === 'image') return String(node.alt || '');
    if (node.children) return plainTextInline(node.children);
    return '';
  }).join('');
}

export function markdownAstToPlainText(ast) {
  const lines = [];
  const visitBlocks = (blocks, depth = 0) => {
    for (const block of asArray(blocks)) {
      if (!block) continue;
      if (block.type === 'paragraph' || block.type === 'heading') {
        const text = plainTextInline(block.children).trim();
        if (text) lines.push(text);
      } else if (block.type === 'codeBlock') {
        if (String(block.value || '').trim()) lines.push(String(block.value));
      } else if (block.type === 'blockquote') {
        visitBlocks(block.children, depth);
      } else if (block.type === 'list') {
        let number = Number(block.start) || 1;
        for (const item of asArray(block.items)) {
          const itemBlocks = asArray(item);
          const itemText = blockText(itemBlocks.filter((child) => child?.type !== 'list')).trim();
          const prefix = block.ordered ? `${number}. ` : '• ';
          if (itemText) lines.push(`${'  '.repeat(depth)}${prefix}${itemText}`);
          for (const child of itemBlocks) {
            if (child?.type === 'list') visitBlocks([child], depth + 1);
          }
          number += 1;
        }
      } else if (block.type === 'table') {
        const rows = [block.header, ...asArray(block.rows)];
        for (const row of rows) lines.push(asArray(row).map((cell) => plainTextInline(cell)).join('\t'));
      }
    }
  };
  visitBlocks(ast);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function collectMarkdownLinks(ast) {
  const links = [];
  const visitInline = (nodes) => {
    for (const node of asArray(nodes)) {
      if (node?.type === 'link') links.push(node);
      if (node?.children) visitInline(node.children);
    }
  };
  const visitBlocks = (blocks) => {
    for (const block of asArray(blocks)) {
      if (block?.type === 'paragraph' || block?.type === 'heading') visitInline(block.children);
      if (block?.type === 'blockquote') visitBlocks(block.children);
      if (block?.type === 'list') for (const item of asArray(block.items)) visitBlocks(item);
      if (block?.type === 'table') {
        for (const cell of asArray(block.header)) visitInline(cell);
        for (const row of asArray(block.rows)) for (const cell of asArray(row)) visitInline(cell);
      }
    }
  };
  visitBlocks(ast);
  return links;
}

export function planMarkdownBlocks(ast, {
  width,
  maxHeight = Infinity,
  bodyFontSize = PPTX_TEXT.body,
  listFontSize = PPTX_TEXT.list,
  tableFontSize = PPTX_TEXT.table,
  codeFontSize = PPTX_TEXT.code,
  namePrefix = 'Body'
} = {}) {
  if (!(Number(width) > 0)) throw new PptxExportError('A positive Markdown rendering width is required.', 'pptx-markdown-width-invalid');
  const plan = [];
  let total = 0;
  let objectIndex = 0;
  const gap = 0.12;

  const add = (item, itemGap = gap) => {
    const next = { ...item, objectIndex: ++objectIndex, namePrefix };
    plan.push(next);
    total += next.height + itemGap;
  };

  for (const block of asArray(ast)) {
    if (block?.type === 'paragraph') {
      const text = plainTextInline(block.children);
      if (!text.trim()) continue;
      add({
        type: 'paragraph',
        source: block,
        text,
        fontSize: bodyFontSize,
        height: estimateTextHeight(text, width, bodyFontSize, 1.24, 0.02)
      });
      continue;
    }

    if (block?.type === 'heading') {
      const text = plainTextInline(block.children);
      if (!text.trim()) continue;
      const fontSize = block.level === 2 ? 22 : block.level === 3 ? 20 : 18;
      add({
        type: 'heading',
        source: block,
        text,
        fontSize,
        height: estimateTextHeight(text, width, fontSize, 1.16, 0.02)
      }, gap * 0.8);
      continue;
    }

    if (block?.type === 'list') {
      const items = flattenList(block);
      for (const item of items) {
        const itemWidth = Math.max(0.8, width - item.level * 0.32);
        add({
          type: 'listItem',
          source: block,
          text: item.text,
          level: item.level,
          ordered: item.ordered,
          number: item.number,
          fontSize: listFontSize,
          height: estimateTextHeight(item.text, itemWidth, listFontSize, 1.2, 0.01)
        }, 0.04);
      }
      total += gap * 0.35;
      continue;
    }

    if (block?.type === 'blockquote') {
      const text = asArray(block.children).map((child) => blockText([child])).filter(Boolean).join('\n');
      if (!text.trim()) continue;
      add({
        type: 'blockquote',
        source: block,
        text,
        fontSize: 21,
        height: estimateTextHeight(text, Math.max(0.8, width - 0.38), 21, 1.3, 0.18)
      });
      continue;
    }

    if (block?.type === 'codeBlock') {
      const text = String(block.value || '');
      if (!text.trim()) continue;
      add({
        type: 'codeBlock',
        source: block,
        text,
        fontSize: codeFontSize,
        height: estimateTextHeight(text, Math.max(0.8, width - 0.2), codeFontSize, 1.35, 0.24, true)
      });
      continue;
    }

    if (block?.type === 'table') {
      const table = planTable(block, width, tableFontSize);
      add({ type: 'table', source: block, ...table });
    }
  }

  const height = plan.length ? Math.max(0, total - gap) : 0;
  return {
    height,
    maxHeight,
    fits: height <= maxHeight + 0.001,
    overflow: Math.max(0, height - maxHeight),
    blocks: plan
  };
}

export function renderMarkdownPlan({
  slide,
  plan,
  area,
  language = 'en-US',
  record = () => {}
}) {
  let y = area.y;
  for (const block of plan.blocks) {
    const options = {
      x: area.x,
      y,
      w: area.w,
      h: block.height,
      margin: 0,
      lang: language,
      objectName: `${block.namePrefix}: ${block.type} ${block.objectIndex}`
    };

    if (block.type === 'paragraph') {
      const runs = inlineRuns(block.source.children, { language, fontSize: block.fontSize });
      slide.addText(runs, {
        ...options,
        fontFace: PPTX_BRAND.fonts.body,
        fontSize: block.fontSize,
        color: PPTX_BRAND.colors.black,
        valign: 'top',
        breakLine: false,
        paraSpaceAfterPt: 3
      });
      recordText(record, options, block, 'paragraph');
    } else if (block.type === 'heading') {
      slide.addText(block.text, {
        ...options,
        fontFace: PPTX_BRAND.fonts.heading,
        fontSize: block.fontSize,
        bold: true,
        color: PPTX_BRAND.colors.black,
        breakLine: false
      });
      recordText(record, options, block, 'body-heading', { fontFace: PPTX_BRAND.fonts.heading, bold: true });
    } else if (block.type === 'listItem') {
      const indent = block.level * 0.32;
      const listOptions = {
        ...options,
        x: area.x + indent,
        w: Math.max(0.8, area.w - indent),
        fontFace: PPTX_BRAND.fonts.body,
        fontSize: block.fontSize,
        color: PPTX_BRAND.colors.black,
        bullet: block.ordered
          ? { type: 'number', numberType: 'arabicPeriod', numberStartAt: block.number, indent: 22 }
          : { indent: 22 },
        hanging: 4,
        breakLine: false
      };
      slide.addText(block.text, listOptions);
      recordText(record, listOptions, block, block.ordered ? 'ordered-list-item' : 'unordered-list-item');
    } else if (block.type === 'blockquote') {
      const quoteOptions = {
        ...options,
        margin: { left: 16, right: 10, top: 8, bottom: 8 },
        fontFace: PPTX_BRAND.fonts.heading,
        fontSize: block.fontSize,
        italic: true,
        color: PPTX_BRAND.colors.black,
        fill: { color: PPTX_BRAND.colors.paleGray },
        line: { color: PPTX_BRAND.colors.blue, width: 2 },
        valign: 'mid'
      };
      slide.addText(block.text, quoteOptions);
      recordText(record, quoteOptions, block, 'blockquote', {
        fontFace: PPTX_BRAND.fonts.heading,
        background: PPTX_BRAND.colors.paleGray
      });
    } else if (block.type === 'codeBlock') {
      const codeOptions = {
        ...options,
        margin: { left: 12, right: 12, top: 8, bottom: 8 },
        fontFace: PPTX_BRAND.fonts.body,
        fontSize: block.fontSize,
        color: PPTX_BRAND.colors.black,
        fill: { color: PPTX_BRAND.colors.paleGray },
        line: { color: PPTX_BRAND.colors.darkGray, width: 1 }
      };
      slide.addText(block.text, codeOptions);
      recordText(record, codeOptions, block, 'code-block', { background: PPTX_BRAND.colors.paleGray });
    } else if (block.type === 'table') {
      const rows = [
        block.header.map((text) => ({
          text,
          options: { bold: true, color: PPTX_BRAND.colors.white, fill: PPTX_BRAND.colors.blue, valign: 'mid' }
        })),
        ...block.rows.map((row) => row.map((text) => ({
          text,
          options: { color: PPTX_BRAND.colors.black, fill: PPTX_BRAND.colors.white, valign: 'mid' }
        })))
      ];
      slide.addTable(rows, {
        ...options,
        rowH: block.rowHeights,
        border: { type: 'solid', pt: 1, color: PPTX_BRAND.colors.darkGray },
        fontFace: PPTX_BRAND.fonts.body,
        fontSize: block.fontSize,
        color: PPTX_BRAND.colors.black,
        fill: PPTX_BRAND.colors.white,
        margin: 0.08,
        autoFit: false
      });
      record({
        name: options.objectName,
        type: 'table',
        x: options.x,
        y: options.y,
        w: options.w,
        h: options.h,
        text: [...block.header, ...block.rows.flat()].join(' | '),
        foreground: PPTX_BRAND.colors.black,
        background: PPTX_BRAND.colors.white,
        fontFace: PPTX_BRAND.fonts.body,
        fontSize: block.fontSize,
        semantic: 'table',
        headerRow: true
      });
    }

    y += block.height + blockGap(block.type);
  }
  return y;
}

export function inlineRuns(nodes, { language = 'en-US', fontSize = PPTX_TEXT.body } = {}) {
  const runs = [];
  const visit = (node, inherited = {}) => {
    if (!node) return;
    const base = {
      fontFace: inherited.fontFace || PPTX_BRAND.fonts.body,
      fontSize,
      color: inherited.color || PPTX_BRAND.colors.black,
      lang: language,
      ...(inherited.bold ? { bold: true } : {}),
      ...(inherited.italic ? { italic: true } : {})
    };
    if (node.type === 'text') {
      runs.push({ text: String(node.value || ''), options: base });
    } else if (node.type === 'code') {
      runs.push({
        text: String(node.value || ''),
        options: { ...base, bold: true, fill: { color: PPTX_BRAND.colors.paleGray } }
      });
    } else if (node.type === 'strong') {
      for (const child of asArray(node.children)) visit(child, { ...inherited, bold: true });
    } else if (node.type === 'em') {
      for (const child of asArray(node.children)) visit(child, { ...inherited, italic: true });
    } else if (node.type === 'link') {
      const text = plainTextInline(node.children);
      const destination = String(node.destination || '');
      const options = {
        ...base,
        color: PPTX_BRAND.colors.blue,
        underline: { style: 'sng', color: PPTX_BRAND.colors.blue }
      };
      if (EXTERNAL_SCHEMES.test(destination)) options.hyperlink = { url: destination };
      if (INTERNAL_REF.test(destination)) options.italic = true;
      runs.push({ text, options });
    }
  };
  for (const node of asArray(nodes)) visit(node);
  const normalized = coalescePunctuationRuns(runs);
  return normalized.length ? normalized : [{ text: '', options: { fontFace: PPTX_BRAND.fonts.body, fontSize, color: PPTX_BRAND.colors.black, lang: language } }];
}

function coalescePunctuationRuns(runs) {
  const output = [];
  for (const run of runs) {
    const text = String(run?.text || '');
    if (output.length && /^[,.;:!?%)\]}”’]+$/.test(text)) {
      output[output.length - 1] = {
        ...output[output.length - 1],
        text: `${output[output.length - 1].text}${text}`
      };
    } else {
      output.push(run);
    }
  }
  return output;
}

export function estimateTextHeight(text, width, fontSize, lineHeight = 1.24, padding = 0.02, preserveLines = false) {
  const safeWidth = Math.max(0.6, Number(width) || 0.6);
  const safeSize = Math.max(8, Number(fontSize) || 8);
  const charactersPerLine = Math.max(8, Math.floor((safeWidth * 72) / (safeSize * 0.53)));
  const sourceLines = String(text || '').split('\n');
  let lines = 0;
  for (const sourceLine of sourceLines) {
    if (!sourceLine) {
      lines += 1;
      continue;
    }
    if (preserveLines) lines += Math.max(1, Math.ceil(sourceLine.length / charactersPerLine));
    else lines += wrapWordCount(sourceLine, charactersPerLine);
  }
  return Math.max(safeSize * lineHeight / 72 + padding, lines * safeSize * lineHeight / 72 + padding);
}

function planTable(block, width, fontSize) {
  const header = asArray(block.header).map((cell) => plainTextInline(cell));
  const rows = asArray(block.rows).map((row) => asArray(row).map((cell) => plainTextInline(cell)));
  const columns = Math.max(1, header.length);
  const cellWidth = Math.max(0.65, width / columns - 0.16);
  const rowHeights = [header, ...rows].map((row) => {
    const height = Math.max(...row.map((cell) => estimateTextHeight(cell, cellWidth, fontSize, 1.18, 0.12)), 0.42);
    return Math.max(0.42, height);
  });
  return {
    header,
    rows,
    columns,
    rowHeights,
    fontSize,
    height: rowHeights.reduce((sum, value) => sum + value, 0) + 0.04
  };
}

function flattenList(list, level = 0, output = []) {
  let number = Number(list?.start) || 1;
  for (const blocks of asArray(list?.items)) {
    const primary = asArray(blocks).find((block) => block?.type === 'paragraph');
    const text = primary ? plainTextInline(primary.children) : blockText(blocks);
    output.push({ text, level, ordered: Boolean(list?.ordered), number });
    if (list?.ordered) number += 1;
    for (const block of asArray(blocks)) {
      if (block?.type === 'list') flattenList(block, level + 1, output);
    }
  }
  return output;
}

function blockText(blocks) {
  return asArray(blocks).map((block) => {
    if (block?.type === 'paragraph' || block?.type === 'heading') return plainTextInline(block.children);
    if (block?.type === 'codeBlock') return String(block.value || '');
    if (block?.type === 'blockquote') return blockText(block.children);
    if (block?.type === 'list') return flattenList(block).map((item) => item.text).join(' ');
    if (block?.type === 'table') return [block.header, ...asArray(block.rows)].map((row) => asArray(row).map((cell) => plainTextInline(cell)).join(' | ')).join(' ');
    return '';
  }).filter(Boolean).join(' ');
}

function wrapWordCount(line, charactersPerLine) {
  const words = String(line).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let lines = 1;
  let length = 0;
  for (const word of words) {
    const next = length ? length + 1 + word.length : word.length;
    if (next > charactersPerLine && length) {
      lines += 1;
      length = word.length;
    } else {
      length = next;
    }
    if (length > charactersPerLine) {
      lines += Math.floor((length - 1) / charactersPerLine);
      length = ((length - 1) % charactersPerLine) + 1;
    }
  }
  return lines;
}

function blockGap(type) {
  if (type === 'listItem') return 0.04;
  if (type === 'heading') return 0.096;
  return 0.12;
}

function recordText(record, options, block, semantic, overrides = {}) {
  record({
    name: options.objectName,
    type: 'text',
    x: options.x,
    y: options.y,
    w: options.w,
    h: options.h,
    text: block.text,
    foreground: overrides.foreground || options.color || PPTX_BRAND.colors.black,
    background: overrides.background || options.fill?.color || PPTX_BRAND.colors.white,
    fontFace: overrides.fontFace || options.fontFace || PPTX_BRAND.fonts.body,
    fontSize: block.fontSize,
    bold: Boolean(overrides.bold ?? options.bold),
    semantic
  });
}
