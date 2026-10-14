// Marin Learn - Theme page: one theme's description and the courses filed under it.
import { breadcrumbHtml, wireBreadcrumb } from './breadcrumb.js';
import { courseCardHtml, themeSlug } from './course-card.js';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[tag] || tag));
}

export function renderThemePage(container, slug, themes, catalogItems, onNavigate) {
  const theme = themes.find(entry => themeSlug(entry.name) === slug);
  if (!theme) {
    container.innerHTML = `
      <div class="catalog-error-box">
        ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: 'Theme not found' }])}
        <h3>Theme not found</h3>
        <p>This theme does not exist.</p>
      </div>`;
    wireBreadcrumb(container, onNavigate);
    return;
  }

  const courses = catalogItems.filter(item => (item.themes || []).includes(theme.name));
  container.innerHTML = `
    <div class="landing-page" role="region" aria-label="${escapeHtml(theme.name)} theme">
      ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: theme.name }])}
      <header class="landing-header">
        <h2>${escapeHtml(theme.name)}</h2>
        <p class="landing-abstract">${escapeHtml(theme.description || '')}</p>
      </header>
      ${courses.length
        ? `<div class="catalog-grid landing-resource-grid">${courses.map(courseCardHtml).join('')}</div>`
        : '<p class="text-muted">No courses in this theme yet.</p>'}
    </div>`;
  wireBreadcrumb(container, onNavigate);
}
