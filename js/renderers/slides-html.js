// Marin Learn - Shared semantic HTML renderer for presentation slides
import { renderMarkdown } from '../core/markdown.js';
import { escapeAttr, escapeHtml } from '../core/utils.js';

export function renderSlideCanvasInnerHtml(slide, options = {}) {
  const titleId = options.titleId ? ` id="${escapeAttr(options.titleId)}"` : '';
  return `
    <div class="slide-header">
      <h2${titleId}>${escapeHtml(slide?.name || options.titleFallback || 'Slide title')}</h2>
    </div>
    <div class="slide-body">
      ${renderSlideContentHtml(slide, options)}
    </div>`;
}

export function renderSlideContentHtml(slide, options = {}) {
  const content = Array.isArray(slide?.content) ? slide.content : [];
  return content.map((entry) => renderContentEntry(entry, options)).join('');
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

  const position = Number(entry.position) || 1;
  const attributes = ` class="slide-content-item slide-content--${escapeAttr(mode)}" data-content-position="${position}"`;

  if (mode === 'title') {
    return `<div${attributes}><h3>${escapeHtml(unit.name)}</h3></div>`;
  }

  if (mode === 'abstract') {
    const missing = options.missingAbstractText || '';
    const abstract = unit.abstract || missing;
    return `<div${attributes}>${unit.name ? `<h4>${escapeHtml(unit.name)}</h4>` : ''}${abstract ? `<p>${escapeHtml(abstract)}</p>` : ''}</div>`;
  }

  if (entry.markdownStatus !== 'loaded') {
    const message = entry.markdownError || options.missingMarkdownText || 'Full content is unavailable.';
    return `<div${attributes}>${unit.name ? `<h4>${escapeHtml(unit.name)}</h4>` : ''}<p class="slide-content-error" role="alert">${escapeHtml(message)}</p></div>`;
  }

  return `<div${attributes}>${unit.name ? `<h4>${escapeHtml(unit.name)}</h4>` : ''}<div class="slide-markdown-body">${renderMarkdownAst(entry.markdownAst, entry.markdown, options)}</div></div>`;
}

function renderMarkdownAst(ast, source, options) {
  if (typeof options.renderMarkdown === 'function') {
    return options.renderMarkdown(ast, source);
  }
  return renderMarkdown(Array.isArray(ast) ? ast : source || '', options.markdownOptions || {});
}
