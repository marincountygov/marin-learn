// The HTML the rich editor shows, made safe a second time.
//
// The editor's HTML comes from renderMarkdown (js/core/markdown.js), which escapes text and attributes and checks link schemes; pasted HTML never goes
// to the page as it is: it is turned into Markdown first and rendered from that (docs/editor/SPEC.md, "Rich-text editing and paste"). This is a second
// layer under that: the rendered HTML is read into an inert document and a NEW tree is built from it out of a short list of elements and attributes, so
// whatever else was in the markup (a script, an event handler, a style, a link that runs code, an element nobody listed) is not copied. If the renderer
// ever lets something through by mistake, it stops here.
//
//   safeFragment(html)   a DocumentFragment built only from what the editor produces: paragraphs, headings, lists, quotes, code, tables, bold, italic,
//                        links (http, https, mailto, tel, marin-ref, or "#"), images (a data:image or blob: source) and the broken-reference marker

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const matches = (pattern) => (value) => pattern.test(value);
const anything = () => true;

const LINK_TARGET = /^(?:#|https?:|mailto:|tel:|marin-ref:)/i;
const IMAGE_SOURCE = /^(?:data:image\/(?:png|jpe?g|gif|webp|avif|bmp|svg\+xml);base64,[A-Za-z0-9+/=\s]*|blob:)/i;

// element name as the parser gives it (upper case) -> the element to make, and the attributes it may keep, each with a test of its value.
// Every value here is a constant written in this file: nothing in the pasted or rendered text becomes a tag name.
const ELEMENTS = new Map([
  ['P', { tag: 'p' }],
  ['BR', { tag: 'br' }],
  ['H1', { tag: 'h1' }], ['H2', { tag: 'h2' }], ['H3', { tag: 'h3' }], ['H4', { tag: 'h4' }], ['H5', { tag: 'h5' }], ['H6', { tag: 'h6' }],
  ['BLOCKQUOTE', { tag: 'blockquote' }],
  ['UL', { tag: 'ul' }],
  ['OL', { tag: 'ol', attrs: { start: matches(/^-?\d{1,9}$/) } }],
  ['LI', { tag: 'li' }],
  ['PRE', { tag: 'pre' }],
  ['CODE', { tag: 'code', attrs: { class: matches(/^language-[\w+#.-]{1,40}$/) } }],
  ['STRONG', { tag: 'strong' }],
  ['EM', { tag: 'em' }],
  ['TABLE', { tag: 'table' }], ['THEAD', { tag: 'thead' }], ['TBODY', { tag: 'tbody' }], ['TR', { tag: 'tr' }],
  ['TH', { tag: 'th', attrs: { scope: matches(/^(?:col|row)$/) } }],
  ['TD', { tag: 'td' }],
  ['DIV', { tag: 'div', attrs: { class: matches(/^table-scroll$/), tabindex: matches(/^0$/), role: matches(/^region$/), 'aria-label': anything } }],
  ['A', { tag: 'a', attrs: { href: matches(LINK_TARGET), rel: matches(/^noopener noreferrer$/), 'data-marin-ref': matches(new RegExp(`^${UUID}$`)) } }],
  ['IMG', { tag: 'img', attrs: { src: matches(IMAGE_SOURCE), alt: anything, 'data-marin-asset': matches(new RegExp(`^${UUID}$`)) }, needs: 'src' }],
  ['SPAN', { tag: 'span', attrs: { class: matches(/^broken-reference$/), title: anything, 'data-marin-asset': matches(new RegExp(`^${UUID}$`)) } }],
]);

function clean(node) {
  if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
  if (node.nodeType !== Node.ELEMENT_NODE) return null; // comments, processing instructions: not copied
  const spec = ELEMENTS.get(node.tagName);
  if (!spec) return null; // an element that is not listed is dropped with everything inside it
  const copy = document.createElement(spec.tag);
  for (const [name, accepts] of Object.entries(spec.attrs || {})) {
    const value = node.getAttribute(name);
    if (value !== null && accepts(value)) copy.setAttribute(name, value);
  }
  if (spec.needs && !copy.hasAttribute(spec.needs)) return null; // an image with no safe source is not an image
  for (const child of node.childNodes) {
    const kept = clean(child);
    if (kept) copy.append(kept);
  }
  return copy;
}

export function safeFragment(html) {
  const parsed = new DOMParser().parseFromString(String(html ?? ''), 'text/html');
  const fragment = document.createDocumentFragment();
  for (const child of parsed.body.childNodes) {
    const kept = clean(child);
    if (kept) fragment.append(kept);
  }
  return fragment;
}
