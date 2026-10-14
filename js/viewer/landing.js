// Marin Learn - LearningSet Landing Page Renderer
import { loadLearningSetGraph } from '../core/graph.js';
import { breadcrumbHtml, wireBreadcrumb } from './breadcrumb.js';
import { themeBadgesHtml } from './course-card.js';

const ICONS = {
  'sticky-note': '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
  presentation: '<path d="M2 3h20"/><path d="M21 3v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V3"/><path d="m7 21 5-5 5 5"/>',
  blocks: '<rect width="7" height="7" x="14" y="3" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>'
};

export const RESOURCE_KINDS = [
  { key: 'materials', title: 'Notes', icon: 'sticky-note', view: 'read' },
  { key: 'presentations', title: 'Deck', icon: 'presentation', view: 'slides' },
  { key: 'assessments', title: 'Quiz', icon: 'blocks', view: 'quiz' }
];

export async function renderLandingPage(container, setSlug, catalogItems, onNavigate) {
  container.innerHTML = '<div class="catalog-status" aria-live="polite">Loading Marin Learn…</div>';

  const catalogEntry = catalogItems.find(item => item.identifier === setSlug);
  if (!catalogEntry) {
    container.innerHTML = `
      <div class="catalog-error-box">
        ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: 'Course not found' }])}
        <h3>Course not found</h3>
        <p>The course "<strong>${escapeHtml(setSlug)}</strong>" does not exist or is not published.</p>
      </div>
    `;
    wireBreadcrumb(container, onNavigate);
    return;
  }

  try {
    const graphData = await loadLearningSetGraph(catalogEntry.graphUrl);
    const lset = graphData.learningSet;
    const cards = RESOURCE_KINDS.flatMap(kind =>
      graphData[kind.key].map(item => resourceCard(item, kind, setSlug))
    );

    // Keep the learning resources first; objectives remain available below
    // without surrounding the resource cards in another bordered panel.
    const objectivesHtml = graphData.objectives.length > 0 ? `
      <section class="landing-objectives" aria-labelledby="landing-objectives-heading">
        <h3 id="landing-objectives-heading">Learning objectives</h3>
        <ul class="landing-objectives-list">
          ${graphData.objectives.map(obj => `<li>${escapeHtml(obj.name || obj.description || 'Learning objective')}</li>`).join('')}
        </ul>
      </section>
    ` : '';

    container.innerHTML = `
      <div class="landing-page" role="region" aria-label="Course overview">
        ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: lset.name }])}

        <header class="landing-header">
          <h2>${escapeHtml(lset.name)}</h2>
          <p class="landing-abstract">${escapeHtml(lset.abstract || catalogEntry.abstract || '')}</p>
          ${themeBadgesHtml(catalogEntry.themes)}
        </header>

        <section class="landing-resources" aria-label="Notes, deck, and quiz">
          ${cards.length ? `
            <div class="catalog-grid landing-resource-grid">${cards.join('')}</div>
          ` : '<p class="text-muted">This course has no notes, deck, or quiz yet.</p>'}
        </section>

        ${objectivesHtml}
      </div>
    `;

    wireBreadcrumb(container, onNavigate);

    // Use real links so open-in-new-tab, copy-link, and keyboard activation
    // work without JavaScript-specific keyboard event handlers. Ordinary
    // clicks retain the viewer's existing history/navigation behavior.
    container.querySelectorAll('.resource-action').forEach(link => {
      link.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate({
          set: setSlug,
          view: link.dataset.view,
          resource: link.dataset.resource
        });
      });
    });
  } catch (err) {
    container.innerHTML = `
      <div class="catalog-error-box">
        ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: 'Error' }])}
        <h3>This course did not load</h3>
        <p>${escapeHtml(err.message || 'Failed to parse learning graph.')}</p>
      </div>
    `;
    wireBreadcrumb(container, onNavigate);
  }
}

export function resourceCard(item, kind, setSlug) {
  const identifier = String(item.identifier || item['@id'] || '');
  const params = new URLSearchParams({ set: setSlug, view: kind.view, resource: identifier });

  return `
    <article class="app-card course-card landing-resource-card">
      <span class="app-card__icon" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[kind.icon]}</svg></span>
      <h3><a class="resource-action" href="?${escapeHtml(params.toString())}"
         data-view="${kind.view}" data-resource="${escapeHtml(identifier)}"
         aria-label="${escapeHtml(`${kind.title}: ${item.name || kind.title}`)}">${kind.title}</a></h3>
      <p>${escapeHtml(item.abstract || '')}</p>
    </article>
  `;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[tag] || tag));
}
