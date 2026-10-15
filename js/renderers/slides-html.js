// Marin Learn - Shared semantic HTML renderer for presentation slides
import { renderMarkdown } from '../core/markdown.js';
import { escapeAttr, escapeHtml } from '../core/utils.js';

export function renderSlideCanvasInnerHtml(slide, options = {}) {
  const titleId = options.titleId ? ` id="${escapeAttr(options.titleId)}"` : '';
  // A title slide can show an icon above the title and a description below it.
  // The caller supplies both: `titleExtras: { iconHtml, description }`.
  const extras = slide?.layout === 'title' ? options.titleExtras || {} : {};
  return `
    <div class="slide-header">
      ${extras.iconHtml ? `<span class="slide-title-icon" aria-hidden="true">${extras.iconHtml}</span>` : ''}
      <h2${titleId}>${escapeHtml(slide?.name || options.titleFallback || 'Slide title')}</h2>
      ${extras.description ? `<p class="slide-title-description">${escapeHtml(extras.description)}</p>` : ''}
    </div>
    <div class="slide-body">
      ${renderSlideContentHtml(slide, options)}
    </div>
    ${footerHtml(slide, options)}`;
}

// A small footer on every slide but the title slide: the course icon and title.
// The caller supplies it: `footer: { iconHtml, title }`.
function footerHtml(slide, options) {
  const footer = options.footer;
  if (!footer?.title || slide?.layout === 'title') return '';
  return `<footer class="slide-footer">${footer.iconHtml ? `<span class="slide-footer-icon" aria-hidden="true">${footer.iconHtml}</span>` : ''}<span>${escapeHtml(footer.title)}</span></footer>`;
}

export function renderSlideContentHtml(slide, options = {}) {
  const content = Array.isArray(slide?.content) ? slide.content : [];
  return content.map((entry) => renderContentEntry(entry, { ...options, contentCount: content.length })).join('');
}

export function renderSpeakerNotesHtml(slide, options = {}) {
  if (!slide?.speakerNotes) return options.emptyNotesHtml || '';
  return renderMarkdownAst(slide.speakerNotesAst, slide.speakerNotes, options);
}

function renderContentEntry(entry, options) {
  const mode = entry?.displayMode || 'full';
  const unit = entry?.unit;
  if (!unit) {
    return '<div class="slide-content-item slide-content--error"><p role="alert">Referenced content is unavailable.</p></div>';
  }

  // A Note section alone on a slide is already named by the slide title, so its own
  // heading would repeat it. Beside another entry (Problem | Solution) it labels its column.
  const showHeading = !(unit.kind === 'note-section' && options.contentCount === 1);
  const heading = (text) => (showHeading && text ? `<h4>${escapeHtml(text)}</h4>` : '');
  const position = Number(entry.position) || 1;
  const attributes = ` class="slide-content-item slide-content--${escapeAttr(mode)}" data-content-position="${position}"`;

  if (mode === 'title') {
    return `<div${attributes}><h3>${escapeHtml(unit.name)}</h3></div>`;
  }

  if (mode === 'abstract') {
    const missing = options.missingAbstractText || '';
    const abstract = unit.abstract || missing;
    return `<div${attributes}>${heading(unit.name)}${abstract ? `<p>${escapeHtml(abstract)}</p>` : ''}</div>`;
  }

  if (entry.markdownStatus !== 'loaded') {
    const message = entry.markdownError || options.missingMarkdownText || 'Full content is unavailable.';
    return `<div${attributes}>${heading(unit.name)}<p class="slide-content-error" role="alert">${escapeHtml(message)}</p></div>`;
  }

  return `<div${attributes}>${heading(unit.name)}<div class="slide-markdown-body">${renderMarkdownAst(entry.markdownAst, entry.markdown, options)}</div></div>`;
}

function renderMarkdownAst(ast, source, options) {
  if (typeof options.renderMarkdown === 'function') {
    return options.renderMarkdown(ast, source);
  }
  return renderMarkdown(Array.isArray(ast) ? ast : source || '', options.markdownOptions || {});
}
