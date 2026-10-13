// Marin Learn - Application Main Entry Point (Phases 3 & 4)
import { parseRoute, navigateToRoute } from '../js/viewer/router.js';
import { renderLandingPage } from '../js/viewer/landing.js';
import { renderContinuousReader } from '../js/viewer/reader.js';
import { renderSlideViewer } from '../js/viewer/slides.js';
import { renderQuizViewer } from '../js/viewer/quiz.js';

document.addEventListener('DOMContentLoaded', async () => {
  const startSection = document.getElementById('start');
  let catalogItems = [];

  // Load catalog index on startup
  async function fetchCatalog() {
    try {
      const response = await fetch('catalog.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.format === 'marin-learn-catalog/v1' && Array.isArray(data.items)) {
        catalogItems = data.items;
      }
    } catch (err) {
      console.error('Failed to load catalog:', err);
    }
  }

  await fetchCatalog();

  function handleRoute() {
    const route = parseRoute();
    if (route.set) {
      // Render Landing Page or View Placeholder
      if (route.view) {
        if (route.view === 'read') {
          renderContinuousReader(startSection, route.set, route.resource, catalogItems, (newRoute) => {
            navigateToRoute(newRoute);
          });
        } else if (route.view === 'slides') {
          renderSlideViewer(startSection, route.set, route.resource, catalogItems, (newRoute) => {
            navigateToRoute(newRoute);
          });
        } else if (route.view === 'quiz') {
          renderQuizViewer(startSection, route.set, route.resource, catalogItems, (newRoute) => {
            navigateToRoute(newRoute);
          });
        } else {
          startSection.innerHTML = `
            <div class="landing-page">
              <nav class="landing-breadcrumb">
                <button id="back-to-landing" class="link-button">&larr; Back to Learning Set</button>
              </nav>
              <div class="catalog-status catalog-status--spaced">
                <h3>${route.view.toUpperCase()} View (${route.resource || 'default'})</h3>
                <p>This resource viewer view (Phase ${route.view === 'slides' ? '6' : '7'}) is scheduled for implementation in a subsequent phase.</p>
              </div>
            </div>
          `;
          document.getElementById('back-to-landing').addEventListener('click', () => {
            navigateToRoute({ set: route.set });
          });
        }
      } else {
        renderLandingPage(startSection, route.set, catalogItems, (newRoute) => {
          navigateToRoute(newRoute);
        });
      }
    } else {
      // Render Catalog Home
      renderCatalogHome();
    }
  }

  function renderCatalogHome() {
    startSection.innerHTML = `
      <h2 id="start-heading">Marin Learn Catalog</h2>
      <p>Discover published learning sets, training materials, slide presentations, and quizzes.</p>

      <div class="catalog-controls" role="region" aria-label="Catalog search and filters">
        <div class="catalog-search-group">
          <label for="catalog-search" class="catalog-label">Search learning sets</label>
          <input type="search" id="catalog-search" placeholder="Search title, abstract, or keywords..." aria-label="Search learning sets">
        </div>
        <div class="catalog-filter-group">
          <label for="level-filter" class="catalog-label">Educational Level</label>
          <select id="level-filter" aria-label="Filter by educational level">
            <option value="">All levels</option>
            <option value="introductory">Introductory</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
      </div>

      <div id="catalog-status" class="catalog-status" aria-live="polite">Loading catalog...</div>
      <div id="catalog-grid" class="catalog-grid" role="feed" aria-label="Learning sets list"></div>
    `;

    initCatalogUI();
  }

  function initCatalogUI() {
    const searchInput = document.getElementById('catalog-search');
    const levelFilter = document.getElementById('level-filter');
    const catalogStatus = document.getElementById('catalog-status');
    const catalogGrid = document.getElementById('catalog-grid');

    if (!catalogGrid) return;

    if (catalogItems.length === 0) {
      catalogStatus.textContent = 'The learning catalog is currently empty or failed to load.';
      return;
    }

    function renderGrid() {
      const query = (searchInput.value || '').toLowerCase().trim();
      const selectedLevel = levelFilter.value;

      const filtered = catalogItems.filter(item => {
        const name = (item.name || '').toLowerCase();
        const abstract = (item.abstract || '').toLowerCase();
        const keywords = (item.keywords || []).join(' ').toLowerCase();
        
        const matchesQuery = !query || name.includes(query) || abstract.includes(query) || keywords.includes(query);
        const matchesLevel = !selectedLevel || item.educationalLevel === selectedLevel;

        return matchesQuery && matchesLevel;
      });

      if (filtered.length === 0) {
        catalogStatus.textContent = 'No learning sets match your search or filter.';
        catalogGrid.innerHTML = '<p class="catalog-empty-notice">Try adjusting your search terms or clearing filters.</p>';
        return;
      }

      catalogStatus.textContent = `Showing ${filtered.length} of ${catalogItems.length} published learning set${catalogItems.length === 1 ? '' : 's'}.`;
      catalogGrid.innerHTML = '';

      filtered.forEach(item => {
        const card = document.createElement('article');
        card.className = 'catalog-card';
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'article');
        card.setAttribute('aria-labelledby', `set-title-${item.identifier}`);

        const levelBadge = item.educationalLevel ? `<span class="app-badge badge--level">${escapeHtml(item.educationalLevel)}</span>` : '';
        const counts = item.resourceCounts || { materials: 0, presentations: 0, assessments: 0 };
        
        const badges = [];
        if (counts.materials > 0) badges.push('<span class="app-badge badge--resource">Read</span>');
        if (counts.presentations > 0) badges.push('<span class="app-badge badge--resource">Slides</span>');
        if (counts.assessments > 0) badges.push('<span class="app-badge badge--resource">Quiz</span>');

        card.innerHTML = `
          <header class="catalog-card-header">
            <h3 id="set-title-${item.identifier}" class="catalog-card-title">${escapeHtml(item.name)}</h3>
            <div class="catalog-card-meta">
              ${levelBadge}
              <div class="catalog-resource-badges">${badges.join('')}</div>
            </div>
          </header>
          <div class="catalog-card-body">
            <p class="catalog-card-abstract">${escapeHtml(item.abstract || 'No abstract provided for this learning set.')}</p>
          </div>
          <footer class="catalog-card-footer">
            <span class="catalog-card-action">View Learning Set &rarr;</span>
          </footer>
        `;

        const openSet = () => {
          navigateToRoute({ set: item.identifier });
        };

        card.addEventListener('click', openSet);
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openSet();
          }
        });

        catalogGrid.appendChild(card);
      });
    }

    if (searchInput) searchInput.addEventListener('input', renderGrid);
    if (levelFilter) levelFilter.addEventListener('change', renderGrid);

    renderGrid();
  }

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;'
    }[tag] || tag));
  }

  window.addEventListener('popstate', handleRoute);
  window.addEventListener('marin-route-change', handleRoute);

  // Initial route dispatch
  handleRoute();
});
