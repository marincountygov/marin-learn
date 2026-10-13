// Marin Learn - deterministic OOXML corrections for PptxGenJS 4.0.0 output

const ADEC = 'http://schemas.microsoft.com/office/drawing/2017/decorative';
const DECORATIVE_EXT_URI = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}';
const XML_PART = /^ppt\/(slides|slideLayouts|slideMasters|notesSlides)\/.*\.xml$/;

export async function postprocessPptx(input, runtime, { language = 'en-US' } = {}) {
  if (typeof runtime?.JSZip !== 'function') throw new Error('JSZip is unavailable for PowerPoint postprocessing.');
  const zip = await runtime.JSZip.loadAsync(input);
  const audit = {
    language,
    coreLanguageAdded: false,
    coreLanguageUpdated: false,
    decorativeObjectsMarked: 0,
    tableHeaderRowsMarked: 0,
    nonvisualIdsRepaired: 0,
    runLanguagesSet: 0,
    partsProcessed: 0
  };

  const coreEntry = zip.file('docProps/core.xml');
  if (!coreEntry) throw new Error('Generated PowerPoint is missing docProps/core.xml.');
  const coreSource = await coreEntry.async('string');
  const coreResult = ensureCoreLanguage(coreSource, language);
  audit.coreLanguageAdded = coreResult.added;
  audit.coreLanguageUpdated = coreResult.updated;
  zip.file('docProps/core.xml', coreResult.xml);

  const names = Object.keys(zip.files).filter((name) => XML_PART.test(name));
  for (const name of names) {
    const entry = zip.file(name);
    if (!entry) continue;
    let xml = await entry.async('string');
    const idResult = repairNonvisualIds(xml);
    xml = idResult.xml;
    audit.nonvisualIdsRepaired += idResult.repairs;

    const decorativeResult = markDecorativeObjects(xml);
    xml = decorativeResult.xml;
    audit.decorativeObjectsMarked += decorativeResult.marked;

    const tableResult = markTableHeaderRows(xml);
    xml = tableResult.xml;
    audit.tableHeaderRowsMarked += tableResult.marked;

    const languageResult = setRunLanguages(xml, language);
    xml = languageResult.xml;
    audit.runLanguagesSet += languageResult.changed;

    zip.file(name, xml);
    audit.partsProcessed += 1;
  }

  const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes, audit };
}

export function ensureCoreLanguage(xml, language) {
  const source = String(xml || '');
  const tag = `<dc:language>${escapeXml(language)}</dc:language>`;
  const pattern = /<dc:language\b[^>]*>[\s\S]*?<\/dc:language>/i;
  if (pattern.test(source)) {
    const current = source.match(pattern)?.[0] || '';
    return { xml: source.replace(pattern, tag), added: false, updated: current !== tag };
  }
  const close = /<\/cp:coreProperties\s*>/i;
  if (!close.test(source)) throw new Error('docProps/core.xml has no cp:coreProperties closing element.');
  return { xml: source.replace(close, `\n\t\t${tag}\n\t</cp:coreProperties>`), added: true, updated: false };
}

export function repairNonvisualIds(xml) {
  const used = new Set();
  const matches = [...String(xml || '').matchAll(/<p:cNvPr\b[^>]*\/>|<p:cNvPr\b[^>]*>[\s\S]*?<\/p:cNvPr>/g)];
  let nextId = matches.reduce((max, match) => {
    const value = Number(attributeValue(openingTag(match[0]), 'id')) || 0;
    return Math.max(max, value);
  }, 0) + 1;
  let repairs = 0;

  const output = String(xml || '').replace(/<p:cNvPr\b[^>]*\/>|<p:cNvPr\b[^>]*>[\s\S]*?<\/p:cNvPr>/g, (element) => {
    const open = openingTag(element);
    const current = Number(attributeValue(open, 'id')) || 0;
    if (current > 0 && !used.has(current)) {
      used.add(current);
      return element;
    }
    while (used.has(nextId)) nextId += 1;
    const replaced = replaceOpeningTag(element, setAttribute(open, 'id', String(nextId)));
    used.add(nextId);
    nextId += 1;
    repairs += 1;
    return replaced;
  });
  return { xml: output, repairs };
}

export function markDecorativeObjects(xml) {
  let marked = 0;
  const output = String(xml || '').replace(/<p:cNvPr\b[^>]*\/>|<p:cNvPr\b[^>]*>[\s\S]*?<\/p:cNvPr>/g, (element) => {
    let open = openingTag(element);
    const name = decodeXml(attributeValue(open, 'name'));
    if (!name.startsWith('Decorative:')) return element;

    open = removeAttribute(removeAttribute(open, 'descr'), 'title');
    let content = element;
    const selfClosing = /\/>$/.test(open);
    if (selfClosing) {
      open = open.replace(/\/>$/, '>');
      content = `${open}</p:cNvPr>`;
    } else {
      content = replaceOpeningTag(content, open);
    }

    content = content.replace(
      new RegExp(`<a:ext\\b[^>]*uri=["']${escapeRegExp(DECORATIVE_EXT_URI)}["'][^>]*>[\\s\\S]*?<\\/a:ext>`, 'gi'),
      ''
    );
    const extension = `<a:ext uri="${DECORATIVE_EXT_URI}"><adec:decorative xmlns:adec="${ADEC}" val="1"/></a:ext>`;
    if (/<a:extLst\b[^>]*>/i.test(content)) {
      content = content.replace(/<\/a:extLst>/i, `${extension}</a:extLst>`);
    } else {
      content = content.replace(/<\/p:cNvPr>/i, `<a:extLst>${extension}</a:extLst></p:cNvPr>`);
    }
    marked += 1;
    return content;
  });
  return { xml: output, marked };
}

export function markTableHeaderRows(xml) {
  let marked = 0;
  const output = String(xml || '').replace(/<a:tblPr\b[^>]*\/?>/g, (tag) => {
    if (attributeValue(tag, 'firstRow') === '1') return tag;
    marked += 1;
    return setAttribute(tag, 'firstRow', '1');
  });
  return { xml: output, marked };
}

export function setRunLanguages(xml, language) {
  let changed = 0;
  const output = String(xml || '').replace(/<a:(?:rPr|endParaRPr|defRPr)\b[^>]*\/?>/g, (tag) => {
    if (attributeValue(tag, 'lang') === language) return tag;
    changed += 1;
    return setAttribute(tag, 'lang', language);
  });
  return { xml: output, changed };
}

function openingTag(element) {
  return String(element).match(/^<p:cNvPr\b[^>]*\/?>(?=|[\s\S])/i)?.[0] || '';
}

function replaceOpeningTag(element, open) {
  const original = openingTag(element);
  return original ? `${open}${String(element).slice(original.length)}` : element;
}

function attributeValue(tag, name) {
  const match = String(tag).match(new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, 'i'));
  return match ? match[2] : null;
}

function setAttribute(tag, name, value) {
  const source = String(tag);
  const pattern = new RegExp(`(\\s${escapeRegExp(name)}\\s*=\\s*)(["'])([\\s\\S]*?)\\2`, 'i');
  if (pattern.test(source)) return source.replace(pattern, `$1"${escapeXml(value)}"`);
  return source.replace(/\s*\/?>(?=$)/, (ending) => ` ${name}="${escapeXml(value)}"${ending.trimStart()}`);
}

function removeAttribute(tag, name) {
  return String(tag).replace(new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(["'])[\\s\\S]*?\\1`, 'gi'), '');
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
