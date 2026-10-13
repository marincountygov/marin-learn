import { canonicalizeMarkdown, renderMarkdown } from '../../js/core/markdown.js';

const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'LI', 'UL', 'OL', 'TABLE', 'DIV']);
const IGNORED_TAGS = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'META', 'LINK', 'HEAD']);
const SAFE_LINK = /^(https?:|mailto:|tel:|marin-ref:)/i;
const SAFE_ASSET_REFERENCE = /^(?:marin-asset:|urn:uuid:)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createMarkdownEditor({ markdown = '', label = 'Content', dialogs, renderOptions = {} } = {}) {
  if (!dialogs?.requestText || !dialogs?.requestFields) {
    throw new Error('The rich editor requires the shared editor dialog service.');
  }

  const root = document.createElement('div');
  root.className = 'editor-rich-editor';
  root.innerHTML = `
    <div class="editor-rich-toolbar" role="toolbar" aria-label="${escapeAttribute(label)} formatting">
      <label class="editor-rich-format-label">
        <span class="visually-hidden">Text style</span>
        <select data-rich-block aria-label="Text style">
          <option value="p">Paragraph</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
        </select>
      </label>
      <button type="button" class="secondary outline" data-rich-command="strong" aria-label="Bold"><strong>B</strong></button>
      <button type="button" class="secondary outline" data-rich-command="em" aria-label="Italic"><em>I</em></button>
      <button type="button" class="secondary outline" data-rich-command="ul">Bulleted list</button>
      <button type="button" class="secondary outline" data-rich-command="ol">Numbered list</button>
      <button type="button" class="secondary outline" data-rich-command="blockquote">Quote</button>
      <button type="button" class="secondary outline" data-rich-command="pre">Code block</button>
      <button type="button" class="secondary outline" data-rich-command="link">Link</button>
      <button type="button" class="secondary outline" data-rich-command="table">Table</button>
      <button type="button" class="secondary outline" data-rich-command="image">Insert image</button>
    </div>
    <div class="editor-rich-surface" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${escapeAttribute(label)}"></div>
    <p class="editor-rich-help">Use headings to organize this content block. The learning material title is added separately, so do not add a Heading 1.</p>
  `;

  const surface = root.querySelector('.editor-rich-surface');
  surface.innerHTML = renderMarkdown(markdown, renderOptions) || '<p><br></p>';
  normalizeEditorDom(surface);

  let savedRange = null;
  const rememberSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (surface.contains(range.commonAncestorContainer)) savedRange = range.cloneRange();
  };
  document.addEventListener('selectionchange', rememberSelection);

  const restoreSelection = () => {
    if (!savedRange) {
      surface.focus();
      return;
    }
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRange);
    surface.focus();
  };

  root.querySelector('[data-rich-block]').addEventListener('change', (event) => {
    restoreSelection();
    setBlockTag(surface, event.target.value);
    rememberSelection();
  });

  root.querySelectorAll('[data-rich-command]').forEach((button) => {
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', async () => {
      restoreSelection();
      const command = button.dataset.richCommand;
      if (command === 'strong' || command === 'em') wrapInline(surface, command);
      else if (command === 'ul' || command === 'ol') wrapList(surface, command);
      else if (command === 'blockquote' || command === 'pre') setBlockTag(surface, command);
      else if (command === 'link') await insertLink(surface, dialogs, button);
      else if (command === 'table') await insertTable(surface, dialogs, button);
      else if (command === 'image') await insertImage(surface, renderOptions.onSelectImage, dialogs, button);
      normalizeEditorDom(surface);
      rememberSelection();
    });
  });

  surface.addEventListener('paste', (event) => {
    event.preventDefault();
    const html = event.clipboardData?.getData('text/html');
    const text = event.clipboardData?.getData('text/plain') || '';
    let fragmentHtml;
    if (html) {
      const documentValue = new DOMParser().parseFromString(html, 'text/html');
      const normalized = htmlToMarkdown(documentValue.body);
      fragmentHtml = renderMarkdown(normalized, renderOptions);
    } else {
      const normalized = plainTextToMarkdown(text);
      fragmentHtml = renderMarkdown(normalized, renderOptions);
    }
    insertHtmlAtSelection(surface, fragmentHtml || '<p><br></p>');
    normalizeEditorDom(surface);
  });

  surface.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      const cell = closestElement(window.getSelection()?.anchorNode, ['TD', 'TH']);
      if (cell) {
        event.preventDefault();
        const cells = [...surface.querySelectorAll('th, td')];
        const current = cells.indexOf(cell);
        const next = cells[current + (event.shiftKey ? -1 : 1)];
        next?.focus?.();
        if (next) placeCaretAtEnd(next);
      }
    }
  });

  return {
    element: root,
    surface,
    getMarkdown() {
      return canonicalizeMarkdown(htmlToMarkdown(surface));
    },
    setMarkdown(value) {
      surface.innerHTML = renderMarkdown(value, renderOptions) || '<p><br></p>';
      normalizeEditorDom(surface);
    },
    focus() {
      surface.focus();
    },
    destroy() {
      document.removeEventListener('selectionchange', rememberSelection);
    }
  };
}

export function htmlToMarkdown(root) {
  const blocks = [];
  for (const node of root.childNodes) {
    const value = blockToMarkdown(node, 0).trim();
    if (value) blocks.push(value);
  }
  return canonicalizeMarkdown(blocks.join('\n\n'));
}

function blockToMarkdown(node, depth) {
  if (node.nodeType === Node.TEXT_NODE) return cleanText(node.nodeValue);
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName;
  if (IGNORED_TAGS.has(tag)) return '';

  const hasBlockChildren = [...node.children].some((c) => BLOCK_TAGS.has(c.tagName));
  if (hasBlockChildren && tag !== 'BLOCKQUOTE' && tag !== 'PRE' && tag !== 'UL' && tag !== 'OL' && tag !== 'TABLE') {
    return [...node.childNodes]
      .map((child) => blockToMarkdown(child, depth))
      .filter(Boolean)
      .join('\n\n');
  }

  if (tag === 'DIV' && node.classList.contains('table-scroll')) {
    const table = node.querySelector(':scope > table');
    return table ? tableToMarkdown(table) : '';
  }
  if (tag === 'P' || tag === 'DIV') return inlineChildren(node).trim();
  if (/^H[2-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${inlineChildren(node).trim()}`;
  if (tag === 'H1') return `## ${inlineChildren(node).trim()}`;
  if (tag === 'BLOCKQUOTE') {
    return [...node.childNodes]
      .map((child) => blockToMarkdown(child, depth + 1))
      .filter(Boolean)
      .join('\n\n')
      .split('\n')
      .map((line) => `> ${line}`.trimEnd())
      .join('\n');
  }
  if (tag === 'PRE') {
    const code = node.querySelector('code') || node;
    const language = [...code.classList].find((name) => name.startsWith('language-'))?.slice(9) || '';
    const value = code.textContent.replace(/\n$/, '');
    const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return `${fence}${language}\n${value}\n${fence}`;
  }
  if (tag === 'UL' || tag === 'OL') return listToMarkdown(node, depth);
  if (tag === 'TABLE') return tableToMarkdown(node);
  if (tag === 'BR') return '';
  return inlineChildren(node).trim();
}

function inlineChildren(node) {
  return [...node.childNodes].map(inlineToMarkdown).join('').replace(/\s+/g, ' ');
}

function inlineToMarkdown(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapeMarkdown(node.nodeValue || '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName;
  if (IGNORED_TAGS.has(tag)) return '';
  const body = [...node.childNodes].map(inlineToMarkdown).join('');
  if (tag === 'STRONG' || tag === 'B') return body ? `**${body}**` : '';
  if (tag === 'EM' || tag === 'I') return body ? `*${body}*` : '';
  if (tag === 'CODE' && node.parentElement?.tagName !== 'PRE') {
    const value = node.textContent || '';
    const longest = Math.max(0, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = '`'.repeat(Math.max(1, longest + 1));
    return `${fence}${value}${fence}`;
  }
  if (tag === 'A') {
    const href = node.getAttribute('href') || '';
    return href && SAFE_LINK.test(href) ? `[${body || escapeMarkdown(href)}](${href})` : body;
  }
  if (tag === 'IMG') {
    const source = node.dataset.marinAsset ? `marin-asset:${node.dataset.marinAsset}` : node.getAttribute('src') || '';
    if (!source.startsWith('marin-asset:')) return '';
    return `![${String(node.getAttribute('alt') || '').replace(/[\[\]]/g, '')}](${source})`;
  }
  if (tag === 'BR') return ' ';
  return body;
}

function listToMarkdown(list, depth) {
  const ordered = list.tagName === 'OL';
  let number = Number(list.getAttribute('start')) || 1;
  return [...list.children]
    .filter((item) => item.tagName === 'LI')
    .map((item) => {
      const marker = ordered ? `${number++}.` : '-';
      const parts = [];
      const nested = [];
      for (const child of item.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && ['UL', 'OL'].includes(child.tagName)) nested.push(child);
        else parts.push(child);
      }
      const first = parts.map((child) => child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName)
        ? blockToMarkdown(child, depth + 1)
        : inlineToMarkdown(child)).join('').trim();
      const indent = '  '.repeat(depth + 1);
      const nestedText = nested.map((child) => listToMarkdown(child, depth + 1).split('\n').map((line) => `${indent}${line}`).join('\n')).join('\n');
      return `${marker} ${first}${nestedText ? `\n${nestedText}` : ''}`;
    })
    .join('\n');
}

function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll('tr')];
  if (!rows.length) return '';
  const matrix = rows.map((row) => [...row.children]
    .filter((cell) => ['TH', 'TD'].includes(cell.tagName))
    .map((cell) => inlineChildren(cell).replace(/\|/g, '\\|').trim()));
  const width = Math.max(...matrix.map((row) => row.length));
  if (!width) return '';
  const header = matrix[0];
  while (header.length < width) header.push('Column');
  const lines = [
    `| ${header.map((value, index) => value || `Column ${index + 1}`).join(' | ')} |`,
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`
  ];
  for (const row of matrix.slice(1)) {
    while (row.length < width) row.push('');
    lines.push(`| ${row.join(' | ')} |`);
  }
  return lines.join('\n');
}

function setBlockTag(surface, tagName) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const block = closestBlock(selection.anchorNode, surface);
  if (!block) return;
  const normalizedTag = tagName.toLowerCase();
  if (normalizedTag === 'pre') {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.textContent = block.textContent;
    pre.append(code);
    block.replaceWith(pre);
    placeCaretAtEnd(code);
    return;
  }
  if (normalizedTag === 'blockquote') {
    if (block.tagName === 'BLOCKQUOTE') return;
    const quote = document.createElement('blockquote');
    const paragraph = document.createElement('p');
    paragraph.append(...block.childNodes);
    quote.append(paragraph);
    block.replaceWith(quote);
    placeCaretAtEnd(paragraph);
    return;
  }
  const replacement = document.createElement(normalizedTag);
  replacement.append(...block.childNodes);
  block.replaceWith(replacement);
  placeCaretAtEnd(replacement);
}

function wrapInline(surface, tagName) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (!surface.contains(range.commonAncestorContainer) || range.collapsed) return;
  const wrapper = document.createElement(tagName);
  try {
    range.surroundContents(wrapper);
  } catch {
    wrapper.append(range.extractContents());
    range.insertNode(wrapper);
  }
  selection.removeAllRanges();
  const next = document.createRange();
  next.selectNodeContents(wrapper);
  selection.addRange(next);
}

function wrapList(surface, tagName) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const block = closestBlock(selection.anchorNode, surface);
  if (!block) return;
  if (block.tagName === 'LI') {
    const list = block.parentElement;
    if (list?.tagName === tagName.toUpperCase()) return;
  }
  const list = document.createElement(tagName);
  const item = document.createElement('li');
  if (block.tagName === 'LI') {
    item.append(...block.childNodes);
    block.parentElement.replaceWith(list);
  } else {
    item.append(...block.childNodes);
    block.replaceWith(list);
  }
  list.append(item);
  placeCaretAtEnd(item);
}

async function insertLink(surface, dialogs, invoker) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0).cloneRange();
  if (!surface.contains(range.commonAncestorContainer)) return;
  const destination = await dialogs.requestText({
    title: 'Insert link',
    label: 'Link destination',
    helpText: 'Use an HTTPS, email, phone, or Marin Learn link.',
    requiredMessage: 'Enter a link destination.',
    submitLabel: 'Insert link',
    invoker,
    validate: (value) => SAFE_LINK.test(value)
      ? ''
      : 'Enter a link that starts with https:, mailto:, tel:, or marin-ref:.'
  });
  if (!destination || !surface.isConnected || !surface.contains(range.commonAncestorContainer)) return;
  const link = document.createElement('a');
  link.href = destination;
  if (range.collapsed) link.textContent = destination;
  else link.append(range.extractContents());
  range.insertNode(link);
  placeCaretAtEnd(link);
}

async function insertTable(surface, dialogs, invoker) {
  const selection = window.getSelection();
  const selectedRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
  const insertionRange = selectedRange && surface.contains(selectedRange.commonAncestorContainer)
    ? selectedRange.cloneRange()
    : null;

  const values = await dialogs.requestFields({
    title: 'Insert table',
    description: 'Choose the table size. A header row is added automatically.',
    submitLabel: 'Insert table',
    invoker,
    fields: [
      {
        name: 'rows',
        label: 'Body rows',
        type: 'number',
        value: '2',
        required: true,
        integer: true,
        min: 1,
        max: 10,
        requiredMessage: 'Enter the number of body rows.',
        integerMessage: 'Enter a whole number of body rows.',
        minMessage: 'Enter at least 1 body row.',
        maxMessage: 'Enter no more than 10 body rows.',
        parse: Number,
        select: true
      },
      {
        name: 'columns',
        label: 'Columns',
        type: 'number',
        value: '2',
        required: true,
        integer: true,
        min: 1,
        max: 8,
        requiredMessage: 'Enter the number of columns.',
        integerMessage: 'Enter a whole number of columns.',
        minMessage: 'Enter at least 1 column.',
        maxMessage: 'Enter no more than 8 columns.',
        parse: Number
      }
    ]
  });
  if (!values || !surface.isConnected) return;

  const rows = values.rows;
  const columns = values.columns;
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const header = document.createElement('tr');
  for (let column = 0; column < columns; column += 1) {
    const cell = document.createElement('th');
    cell.scope = 'col';
    cell.textContent = `Column ${column + 1}`;
    header.append(cell);
  }
  thead.append(header);
  const tbody = document.createElement('tbody');
  for (let row = 0; row < rows; row += 1) {
    const tr = document.createElement('tr');
    for (let column = 0; column < columns; column += 1) {
      const cell = document.createElement('td');
      cell.textContent = 'Text';
      tr.append(cell);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  if (insertionRange && surface.contains(insertionRange.commonAncestorContainer)) {
    const block = closestBlock(insertionRange.commonAncestorContainer, surface);
    if (block) block.after(table);
    else insertionRange.insertNode(table);
  } else {
    surface.append(table);
  }
  placeCaretAtEnd(table.querySelector('th'));
}

async function insertImage(surface, onSelectImage, dialogs, invoker) {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0).cloneRange();
  if (!surface.contains(range.commonAncestorContainer)) return;

  if (onSelectImage) {
    onSelectImage(({ assetUuid, alt, src }) => {
      if (!assetUuid || !surface.isConnected || !surface.contains(range.commonAncestorContainer)) return;
      const img = document.createElement('img');
      img.setAttribute('data-marin-asset', assetUuid);
      img.alt = alt || '';
      img.src = src || 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
      range.insertNode(img);
      placeCaretAtEnd(img);
      normalizeEditorDom(surface);
    });
  } else {
    const values = await dialogs.requestFields({
      title: 'Insert image reference',
      description: 'Use a stable Marin Learn asset reference. Add a description unless the image is decorative.',
      submitLabel: 'Insert image',
      invoker,
      fields: [
        {
          name: 'assetRef',
          label: 'Asset reference',
          type: 'text',
          required: true,
          requiredMessage: 'Enter an asset reference.',
          helpText: 'Example: marin-asset:123e4567-e89b-12d3-a456-426614174000',
          validate: (value) => SAFE_ASSET_REFERENCE.test(value)
            ? ''
            : 'Enter a marin-asset reference or UUID in the expected format.'
        },
        {
          name: 'alt',
          label: 'Image description',
          type: 'text',
          required: false,
          helpText: 'Leave blank only when the image is decorative.'
        }
      ]
    });
    if (!values || !surface.isConnected || !surface.contains(range.commonAncestorContainer)) return;
    const assetRef = values.assetRef;
    const match = assetRef.match(/marin-asset:([0-9a-fA-F-]+)/i);
    const uuid = match ? match[1].toLowerCase() : assetRef.replace(/^urn:uuid:/i, '');
    const img = document.createElement('img');
    img.setAttribute('data-marin-asset', uuid);
    img.alt = values.alt || '';
    img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
    range.insertNode(img);
    placeCaretAtEnd(img);
    normalizeEditorDom(surface);
  }
}

function insertHtmlAtSelection(surface, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const fragment = template.content;
  const selection = window.getSelection();
  if (!selection?.rangeCount || !surface.contains(selection.getRangeAt(0).commonAncestorContainer)) {
    surface.append(fragment);
    return;
  }
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) placeCaretAtEnd(last);
}

function normalizeEditorDom(surface) {
  surface.querySelectorAll('.table-scroll').forEach((wrapper) => wrapper.replaceWith(...wrapper.childNodes));
  surface.querySelectorAll('[style], [class]:not(code):not(img)').forEach((element) => {
    element.removeAttribute('style');
    element.removeAttribute('class');
  });
  surface.querySelectorAll('script, style, iframe, object, embed, form, input, button, textarea, select').forEach((element) => element.remove());
  if (!surface.textContent.trim() && !surface.querySelector('img, table')) surface.innerHTML = '<p><br></p>';
}

function plainTextToMarkdown(text) {
  return String(text)
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.split('\n').map((line) => escapeMarkdown(line.trim())).join(' '))
    .filter(Boolean)
    .join('\n\n');
}

function closestBlock(node, surface) {
  let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (element && element !== surface) {
    if (BLOCK_TAGS.has(element.tagName)) return element;
    element = element.parentElement;
  }
  return null;
}

function closestElement(node, tags) {
  let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
  while (element) {
    if (tags.includes(element.tagName)) return element;
    element = element.parentElement;
  }
  return null;
}

function placeCaretAtEnd(node) {
  if (!node) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function cleanText(value) {
  return escapeMarkdown(String(value || '').replace(/\s+/g, ' '));
}

function escapeMarkdown(value) {
  return String(value || '').replace(/([\\`*_[\]])/g, '\\$1');
}

function escapeAttribute(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
