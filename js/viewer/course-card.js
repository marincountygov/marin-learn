// Marin Learn - Course cards and theme badges shared by the catalog, theme pages, and course pages.

// Lucide icons shown above each course title, keyed by course identifier.
const COURSE_ICONS = {
  'county-leaders-guide-to-data': '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  'county-leaders-guide-to-schemas': '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M10 12a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1 1 1 0 0 1 1 1v1a1 1 0 0 0 1 1"/><path d="M14 18a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1 1 1 0 0 1-1-1v-1a1 1 0 0 0-1-1"/>'
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[tag] || tag));
}

export function themeSlug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Each badge links to that theme's page.
export function themeBadgesHtml(names) {
  if (!names || !names.length) return '';
  return `<div class="catalog-card-meta">${names.map(name => {
    const slug = themeSlug(name);
    return `<a class="app-badge" href="?theme=${escapeHtml(slug)}" data-route="${escapeHtml(JSON.stringify({ theme: slug }))}">${escapeHtml(name)}</a>`;
  }).join('')}</div>`;
}

export function courseCardHtml(item) {
  const href = `?${new URLSearchParams({ set: item.identifier }).toString()}`;
  const icon = COURSE_ICONS[item.identifier];
  return `
    <article class="app-card course-card">
      ${icon ? `<span class="app-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${icon}</svg></span>` : ''}
      <h3 id="set-title-${escapeHtml(item.identifier)}"><a href="${escapeHtml(href)}" data-route="${escapeHtml(JSON.stringify({ set: item.identifier }))}">${escapeHtml(item.name)}</a></h3>
      <p>${escapeHtml(item.abstract || '')}</p>
      ${themeBadgesHtml(item.themes)}
    </article>`;
}

// The course's Lucide icon as an <svg> string, or '' when the course has none.
export function courseIconSvg(identifier) {
  const icon = COURSE_ICONS[identifier];
  return icon ? `<svg viewBox="0 0 24 24">${icon}</svg>` : '';
}
