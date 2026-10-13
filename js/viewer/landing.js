// Marin Learn - LearningSet Landing Page Renderer
import { loadLearningSetGraph } from '../core/graph.js';

const RESOURCE_KINDS = [
  { key: 'materials', type: 'Reading material', view: 'read', action: 'Read Material' },
  { key: 'presentations', type: 'Slide presentation', view: 'slides', action: 'View Slides' },
  { key: 'assessments', type: 'Quiz', view: 'quiz', action: 'Take Quiz' }
];

export async function renderLandingPage(container, setSlug, catalogItems, onNavigate) {
  container.innerHTML = '<div class="catalog-status" aria-live="polite">Loading learning set...</div>';

  const catalogEntry = catalogItems.find(item => item.identifier === setSlug);
  if (!catalogEntry) {
    container.innerHTML = `
      <div class="catalog-error-box">
        <h3>Learning Set Not Found</h3>
        <p>The learning set identifier "<strong>${escapeHtml(setSlug)}</strong>" does not exist or is not published.</p>
        <button id="back-to-catalog" class="primary">Return to Catalog</button>
      </div>
    `;
    wireBackToCatalog(container, onNavigate);
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
        <h3 id="landing-objectives-heading">Learning Objectives</h3>
        <ul class="landing-objectives-list">
          ${graphData.objectives.map(obj => `<li>${escapeHtml(obj.name || obj.description || 'Learning objective')}</li>`).join('')}
        </ul>
      </section>
    ` : '';

    container.innerHTML = `
      <div class="landing-page" role="region" aria-label="Learning set overview">
        <nav class="landing-breadcrumb" aria-label="Breadcrumb">
          <button id="back-to-catalog" class="link-button">&larr; Back to Catalog</button>
        </nav>

        <header class="landing-header">
          <h2>${escapeHtml(lset.name)}</h2>
          ${lset.educationalLevel ? `<span class="app-badge badge--level">${escapeHtml(lset.educationalLevel)}</span>` : ''}
          <p class="landing-abstract">${escapeHtml(lset.abstract || catalogEntry.abstract || '')}</p>
        </header>

        <section class="landing-resources" aria-labelledby="landing-resources-heading">
          <h3 id="landing-resources-heading">Learning resources (${cards.length})</h3>
          ${cards.length ? `
            <div class="catalog-grid landing-resource-grid">${cards.join('')}</div>
          ` : '<p class="text-muted">No learning resources are available in this learning set.</p>'}
        </section>

        ${objectivesHtml}
      </div>
    `;

    wireBackToCatalog(container, onNavigate);

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
        <h3>Error Loading Learning Set</h3>
        <p>${escapeHtml(err.message || 'Failed to parse learning graph.')}</p>
        <button id="back-to-catalog" class="primary">Return to Catalog</button>
      </div>
    `;
    wireBackToCatalog(container, onNavigate);
  }
}

function resourceCard(item, kind, setSlug) {
  const name = item.name || kind.type;
  const identifier = String(item.identifier || item['@id'] || '');
  const params = new URLSearchParams({ set: setSlug, view: kind.view, resource: identifier });

  return `
    <article class="catalog-card landing-resource-card">
      <header class="catalog-card-header">
        <h4 class="catalog-card-title">${escapeHtml(name)}</h4>
        <div class="catalog-card-meta">
          <span class="app-badge badge--resource">${kind.type}</span>
        </div>
      </header>
      <div class="catalog-card-body">
        <p class="catalog-card-abstract">${escapeHtml(item.abstract || '')}</p>
      </div>
      <footer class="catalog-card-footer">
        <a class="catalog-card-action resource-action" href="?${escapeHtml(params.toString())}"
           data-view="${kind.view}" data-resource="${escapeHtml(identifier)}"
           aria-label="${escapeHtml(`${kind.action}: ${name}`)}">${kind.action} &rarr;</a>
      </footer>
    </article>
  `;
}

function wireBackToCatalog(container, onNavigate) {
  container.querySelector('#back-to-catalog').addEventListener('click', () => {
    onNavigate({ set: null, view: null, resource: null });
  });
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
