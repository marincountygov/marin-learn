// Marin Learn - Note reader: a short, structured brief with twelve sections.
import { NOTE_SECTIONS } from '../core/constants.js';
import { readingMinutes, sectionText, itemText } from '../core/note.js';
import { escapeAttr, escapeHtml } from '../core/utils.js';
import { breadcrumbHtml, wireBreadcrumb } from './breadcrumb.js';
import { copyText } from './clipboard.js';
import { resourceCard, RESOURCE_KINDS } from './landing.js';
import { themeBadgesHtml } from './course-card.js';

// Lucide icons for the action buttons.
const ICONS = {
  share: '<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>'
};
const icon = name => `<svg aria-hidden="true" viewBox="0 0 24 24">${ICONS[name]}</svg>`;

const COPY_FAILED = 'Could not copy. Select the text in the box below and copy it.';

// The page heading and the copied title read "<title> notes", for example "Data 101 notes".
export const noteHeading = note => `${note.name} notes`;

// ---- Data helpers ------------------------------------------------------------

export function noteSections(graphData, note) {
  const entries = [...(note['marin:sectionSequence']?.itemListElement || [])].sort((a, b) => a.position - b.position);
  return entries.map(entry => graphData.byId.get(entry.item?.['@id'])).filter(Boolean)
    .filter(section => typeof section['marin:text'] === 'string' ? section['marin:text'].trim() : (section['marin:items'] || []).length || (section['marin:code'] || []).length);
}

function ruleFor(section) {
  return NOTE_SECTIONS.find(rule => rule.type === section['marin:sectionType']) || { label: section.name };
}

function sectionId(section) {
  return `note-${section['marin:sectionType']}`;
}

// Note links are untrusted data. Publication requires HTTPS; the viewer checks again.
const isHttps = url => /^https:\/\/\S+$/.test(String(url || ''));
const linkHtml = item => (isHttps(item.url)
  ? `<a href="${escapeAttr(item.url)}">${escapeHtml(item.title)}</a>`
  : escapeHtml(item.title));

const paragraphs = text => String(text || '').split(/\n{2,}|\n/).map(part => part.trim()).filter(Boolean);

// ---- Screen HTML ---------------------------------------------------------------

// The Code subsection of Examples: sample code the reader can read, scroll, and copy.
function codeHtml(samples) {
  if (!samples.length) return '';
  return `
    <div class="note-code">
      <h3>Code</h3>
      ${samples.map((sample, index) => `
        <figure class="note-code-block">
          <figcaption>
            <span class="note-code-title">${escapeHtml(sample.title)}</span>
            ${sample.language ? `<span class="app-badge">${escapeHtml(sample.language)}</span>` : ''}
            <button type="button" class="action-button note-code-copy" data-code-index="${index}" aria-label="Copy code: ${escapeAttr(sample.title)}" title="Copy code">${icon('copy')}</button>
            <span class="note-code-status" role="status" aria-live="polite"></span>
          </figcaption>
          <pre tabindex="0" role="region" aria-label="${escapeAttr(sample.title)}"><code>${escapeHtml(sample.code)}</code></pre>
        </figure>`).join('')}
    </div>`;
}

function sectionBodyHtml(section, ctx) {
  const items = section['marin:items'] || [];
  switch (section['marin:sectionType']) {
    case 'overview':
    case 'problem':
    case 'solution':
      return paragraphs(section['marin:text']).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    case 'whyItMatters':
      return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    case 'userStories':
      return `<div class="note-stories">${items.map(item => `<blockquote class="note-story">${escapeHtml(item)}</blockquote>`).join('')}</div>`;
    case 'keyTerms':
      return `<dl class="note-terms">${items.map(item => `<div><dt>${escapeHtml(item.term)}</dt><dd>${escapeHtml(item.definition)}</dd></div>`).join('')}</dl>`;
    case 'dosAndDonts':
      return `<div class="note-pairs">${items.map(item => `
        <div class="note-pair">
          <div class="note-do"><strong class="note-pair-label">Do</strong><span>${escapeHtml(item.do)}</span></div>
          <div class="note-dont"><strong class="note-pair-label">Don’t</strong><span>${escapeHtml(item.dont)}</span></div>
        </div>`).join('')}</div>`;
    case 'questions':
      return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    case 'examples':
      return `${items.length ? `<ul>${items.map(item => `<li>${linkHtml(item)}</li>`).join('')}</ul>` : ''}${codeHtml(section['marin:code'] || [])}`;
    case 'learnMore':
      return `<ul>${items.map(item => `<li>${linkHtml(item)}</li>`).join('')}</ul>`;
    case 'checklist':
      return `
        <fieldset class="note-checklist">
          <legend class="visually-hidden">Checklist</legend>
          ${items.map((item, index) => `
            <label class="note-check"><input type="checkbox" data-check-index="${index}"><span>${escapeHtml(item)}</span></label>`).join('')}
        </fieldset>`;
    case 'mantras':
      return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
    default:
      return '';
  }
}

function sectionHtml(section, ctx) {
  const rule = ruleFor(section);
  const id = sectionId(section);
  return `
    <section class="note-section note-section--${escapeAttr(section['marin:sectionType'])}" id="${id}" aria-labelledby="${id}-heading">
      <h2 id="${id}-heading">${escapeHtml(rule.label)}</h2>
      ${sectionBodyHtml(section, ctx)}
    </section>`;
}

// ---- Copy output: semantic HTML for Word, and plain text ------------------------

function sectionCopyHtml(section) {
  const rule = ruleFor(section);
  const items = section['marin:items'] || [];
  const heading = `<h2>${escapeHtml(rule.label)}</h2>`;
  switch (section['marin:sectionType']) {
    case 'overview':
    case 'problem':
    case 'solution':
      return `${heading}${paragraphs(section['marin:text']).map(p => `<p>${escapeHtml(p)}</p>`).join('')}`;
    case 'keyTerms':
      return `${heading}<ul>${items.map(item => `<li><strong>${escapeHtml(item.term)}:</strong> ${escapeHtml(item.definition)}</li>`).join('')}</ul>`;
    case 'dosAndDonts':
      return `${heading}<table border="1" cellpadding="6" cellspacing="0"><tr><th scope="col">Do</th><th scope="col">Don’t</th></tr>${items.map(item => `<tr><td>${escapeHtml(item.do)}</td><td>${escapeHtml(item.dont)}</td></tr>`).join('')}</table>`;
    case 'questions':
      return `${heading}<ol>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ol>`;
    case 'examples': {
      const samples = (section['marin:code'] || []).map(sample => `<h3>${escapeHtml(sample.title)}</h3><pre><code>${escapeHtml(sample.code)}</code></pre>`).join('');
      return `${heading}${items.length ? `<ul>${items.map(item => `<li>${linkHtml(item)}</li>`).join('')}</ul>` : ''}${samples ? `<h3>Code</h3>${samples}` : ''}`;
    }
    case 'learnMore':
      return `${heading}<ul>${items.map(item => `<li>${linkHtml(item)}</li>`).join('')}</ul>`;
    default:
      return `${heading}<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
  }
}

function sectionCopyMarkdown(section) {
  const rule = ruleFor(section);
  const items = section['marin:items'] || [];
  const heading = `## ${rule.label}`;
  const link = item => `[${item.title}](${item.url})`;
  switch (section['marin:sectionType']) {
    case 'overview':
    case 'problem':
    case 'solution':
      return [heading, ...paragraphs(section['marin:text'])].join('\n\n');
    case 'keyTerms':
      return `${heading}\n\n${items.map(item => `- **${item.term}:** ${item.definition}`).join('\n')}`;
    case 'dosAndDonts': {
      // A backslash or a pipe inside a table cell would break the row, so each is escaped.
      const cell = value => String(value).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
      return `${heading}\n\n| Do | Don’t |\n| --- | --- |\n${items.map(item => `| ${cell(item.do)} | ${cell(item.dont)} |`).join('\n')}`;
    }
    case 'questions':
      return `${heading}\n\n${items.map((item, index) => `${index + 1}. ${item}`).join('\n')}`;
    case 'examples': {
      const list = items.length ? `\n\n${items.map(item => `- ${link(item)}`).join('\n')}` : '';
      const samples = (section['marin:code'] || []).map(sample => `### ${sample.title}\n\n\`\`\`${sample.language || ''}\n${sample.code}\n\`\`\``).join('\n\n');
      return `${heading}${list}${samples ? `\n\n${samples}` : ''}`;
    }
    case 'learnMore':
      return `${heading}\n\n${items.map(item => `- ${link(item)}`).join('\n')}`;
    default:
      return `${heading}\n\n${items.map(item => `- ${itemText(item)}`).join('\n')}`;
  }
}

function sectionCopyText(section) {
  const rule = ruleFor(section);
  const items = section['marin:items'] || [];
  const lines = [rule.label];
  switch (section['marin:sectionType']) {
    case 'overview':
    case 'problem':
    case 'solution':
      return [rule.label, ...paragraphs(section['marin:text'])].join('\n');
    case 'keyTerms':
      items.forEach(item => lines.push(`- ${item.term}: ${item.definition}`));
      break;
    case 'dosAndDonts':
      items.forEach(item => lines.push(`- Do: ${item.do}`, `  Don’t: ${item.dont}`));
      break;
    case 'questions':
      items.forEach((item, index) => lines.push(`${index + 1}. ${item}`));
      break;
    case 'examples':
      items.forEach(item => lines.push(`- ${item.title} (${item.url})`));
      if ((section['marin:code'] || []).length) {
        lines.push('', 'Code');
        section['marin:code'].forEach(sample => lines.push('', sample.title, ...String(sample.code).split('\n').map(line => `    ${line}`)));
      }
      break;
    case 'learnMore':
      items.forEach(item => lines.push(`- ${item.title} (${item.url})`));
      break;
    default:
      items.forEach(item => lines.push(`- ${itemText(item)}`));
  }
  return lines.join('\n');
}

export function noteCopy(note, sections, only = null) {
  const chosen = only ? sections.filter(section => section['marin:sectionType'] === only) : sections;
  const html = (only ? '' : `<h1>${escapeHtml(noteHeading(note))}</h1>${note.abstract ? `<p>${escapeHtml(note.abstract)}</p>` : ''}`)
    + chosen.map(sectionCopyHtml).join('');
  const text = (only ? [] : [noteHeading(note), note.abstract || '', ''])
    .concat(chosen.map(sectionCopyText).join('\n\n')).join('\n').trim();
  const markdown = (only ? [] : [`# ${noteHeading(note)}`, note.abstract || '']).filter(Boolean)
    .concat(chosen.map(sectionCopyMarkdown)).join('\n\n').trim();
  return { html, text, markdown };
}

// Copy link, Copy (Text, HTML or Markdown) and Print sit above the note, in that order.
const CARET = '<svg class="menu-toggle__caret" aria-hidden="true" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4"/></svg>';
function actionButtons() {
  return `
    <div class="action-group" role="group" aria-label="Copy link">
      <button type="button" class="action-button" data-note-action="share" aria-label="Copy link" title="Copy link">${icon('link')}</button>
    </div>
    <div class="menu">
      <button type="button" class="action-button menu-toggle" aria-expanded="false" aria-controls="note-copy-panel" aria-label="Copy note, choose a format" title="Copy note">${icon('copy')}${CARET}</button>
      <div id="note-copy-panel" class="menu-panel" hidden>
        <button type="button" data-button-kind="menu-item" data-copy-format="text">Text</button>
        <button type="button" data-button-kind="menu-item" data-copy-format="html">HTML</button>
        <button type="button" data-button-kind="menu-item" data-copy-format="markdown">Markdown</button>
      </div>
    </div>
    <div class="action-group" role="group" aria-label="Print">
      <button type="button" class="action-button" data-note-action="print" aria-label="Print note" title="Print">${icon('printer')}</button>
    </div>`;
}

function fallbackHtml() {
  return `
    <div id="copy-fallback" class="note-copy-fallback" hidden>
      <label for="copy-fallback-text">${COPY_FAILED}</label>
      <textarea id="copy-fallback-text" rows="8" readonly></textarea>
    </div>`;
}

// ---- Page ------------------------------------------------------------------------

// The course's themes sit in a box of their own, below Sources.
function themesHtml(themes) {
  if (!themes || !themes.length) return '';
  return `
    <section class="note-section note-section--themes" id="note-themes" aria-labelledby="note-themes-heading">
      <h2 id="note-themes-heading">Themes</h2>
      ${themeBadgesHtml(themes)}
    </section>`;
}

export function renderNotePage(container, setSlug, note, graphData, catalogEntry, onNavigate) {
  const sections = noteSections(graphData, note);
  const minutes = readingMinutes(sections);
  const nextCards = RESOURCE_KINDS.filter(kind => kind.key === 'presentations' || kind.key === 'assessments')
    .flatMap(kind => graphData[kind.key].map(item => resourceCard(item, kind, setSlug)));

  container.innerHTML = `
    ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: catalogEntry.name, route: { set: setSlug } }, { label: 'Notes' }])}
    <div class="reader-layout note-layout" role="region" aria-label="Notes">
      <aside class="reader-sidebar" aria-label="On this page">
        <nav class="reader-toc" data-on-this-page-line="140">
          <h4>On this page</h4>
          <ul>${sections.map(section => `<li><a href="#${sectionId(section)}">${escapeHtml(ruleFor(section).label)}</a></li>`).join('')}${(catalogEntry.themes || []).length ? '<li><a href="#note-themes">Themes</a></li>' : ''}</ul>
        </nav>
      </aside>

      <div class="reader-main note-main">
        <header class="reader-header note-header">
          <h1>${escapeHtml(noteHeading(note))}</h1>
          ${note.abstract ? `<p class="reader-abstract">${escapeHtml(note.abstract)}</p>` : ''}
          <p class="note-meta"><span>${minutes} min read</span></p>
          <div class="action-toolbar note-actions">
            ${actionButtons()}
          </div>
          <p class="doc-action-status note-status" id="note-status" role="status" aria-live="polite"></p>
          ${fallbackHtml()}
        </header>

        <div class="note-body">${sections.map(section => sectionHtml(section, {})).join('')}${themesHtml(catalogEntry.themes)}</div>

        ${nextCards.length ? `<section class="reader-next" aria-label="Slides and quiz"><div class="catalog-grid landing-resource-grid">${nextCards.join('')}</div></section>` : ''}
      </div>
    </div>`;

  wireBreadcrumb(container, onNavigate);
  wireActions(container, setSlug, note, sections);
  // The shell marks the section being read in the "On this page" list.
  window.marinOnThisPage?.(container.querySelector('.reader-toc'));
  wireCodeCopy(container, sections);
  // A link from a quiz result can name a section: #note-keyTerms.
  const wanted = window.location.hash.slice(1);
  if (wanted) document.getElementById(wanted)?.scrollIntoView({ block: 'start' });

  container.querySelectorAll('.resource-action').forEach(link => {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onNavigate({ set: setSlug, view: link.dataset.view, resource: link.dataset.resource });
    });
  });
  container.querySelectorAll('.reader-toc a').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const target = document.getElementById(link.getAttribute('href').slice(1));
      if (!target) return;
      target.scrollIntoView({ block: 'start' });
      history.pushState(null, '', `#${target.id}`);
    });
  });
}

function wireActions(container, setSlug, note, sections) {
  const status = container.querySelector('#note-status');
  const fallback = container.querySelector('#copy-fallback');

  // Copy offers Text, HTML and Markdown through the shell's menus; the shell copies, and shows the text in a box when it cannot.
  window.marinFormatMenus(container.querySelector('.note-actions'), () => noteCopy(note, sections), {
    status,
    onFail: text => {
      fallback.hidden = false;
      const box = fallback.querySelector('textarea');
      box.value = text;
      box.focus();
      box.select();
    }
  });
  container.querySelector('.note-actions').addEventListener('click', event => {
    if (event.target.closest('[data-copy-format]')) fallback.hidden = true;
  });

  container.querySelectorAll('[data-note-action]').forEach(button => {
    button.addEventListener('click', async () => {
      if (button.dataset.noteAction === 'share') {
        status.textContent = (await copyText(window.location.href))
          ? 'Link copied'
          : 'Could not copy. Copy the link from the address bar.';
      } else {
        window.print();
      }
    });
  });
}

function wireCodeCopy(container, sections) {
  const examples = sections.find(section => section['marin:sectionType'] === 'examples');
  const samples = examples?.['marin:code'] || [];
  container.querySelectorAll('.note-code-copy').forEach(button => {
    const status = button.parentElement.querySelector('.note-code-status');
    button.addEventListener('click', async () => {
      const sample = samples[Number(button.dataset.codeIndex)];
      status.textContent = (sample && await copyText(sample.code)) ? 'Code copied.' : 'Could not copy. Select the code and copy it.';
    });
  });
}
