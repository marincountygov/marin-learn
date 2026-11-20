// Marin Learn - Application Main Entry Point (Phases 3 & 4)
import { parseRoute, navigateToRoute } from '../js/viewer/router.js';
import { renderLandingPage } from '../js/viewer/landing.js';
import { renderContinuousReader } from '../js/viewer/reader.js';
import { renderSlideViewer } from '../js/viewer/slides.js';
import { renderQuizViewer } from '../js/viewer/quiz.js';
import { breadcrumbHtml, wireBreadcrumb } from '../js/viewer/breadcrumb.js';
import { renderThemePage } from '../js/viewer/themes.js';
import { courseCardHtml } from '../js/viewer/course-card.js';

document.addEventListener('DOMContentLoaded', async () => {
  const startSection = document.getElementById('start');
  let catalogItems = [];
  let catalogThemes = [];

  // Load catalog index on startup
  async function fetchCatalog() {
    try {
      const response = await fetch('catalog.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.format === 'marin-learn-catalog/v1' && Array.isArray(data.items)) {
        catalogItems = data.items;
        catalogThemes = Array.isArray(data.themes) ? data.themes : [];
      }
    } catch (err) {
      console.error('Failed to load catalog:', err);
    }
  }

  await fetchCatalog();

  function handleRoute() {
    const route = parseRoute();
    if (route.theme && !route.set) {
      renderThemePage(startSection, route.theme, catalogThemes, catalogItems, (newRoute) => navigateToRoute(newRoute));
    } else if (route.set) {
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
            <div class="catalog-error-box">
              ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: 'Page not found' }])}
              <h3>Page not found</h3>
              <p>This page does not exist.</p>
            </div>
          `;
          wireBreadcrumb(startSection, (newRoute) => navigateToRoute(newRoute));
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
    const template = document.getElementById('catalog-home-template');
    startSection.replaceChildren(template.content.cloneNode(true));
    initCatalogUI();
  }

  function initCatalogUI() {
    // The filter column (search and Themes) is drawn by the shell from filters.json, and only on this page: a course,
    // a note, the slides, a quiz or a theme page replaces it, so none of them has a filter.
    const column = document.querySelector('[data-filter-column]');
    const catalogStatus = document.getElementById('catalog-status');
    const catalogGrid = document.getElementById('catalog-grid');

    if (!catalogGrid) return;

    if (catalogItems.length === 0) {
      catalogStatus.textContent = 'The catalog is empty or did not load.';
      return;
    }

    // The column does the matching: filters.json names the item field the Themes group looks at and the fields the
    // search reads. A course shows when it has any chosen theme; with none chosen every course shows.
    function renderGrid() {
      if (!column?.filterState) return;
      const filtered = column.filter(catalogItems);
      // Each theme's count is the courses the search leaves, so a choice shows what it would add.
      column.updateCounts(catalogItems);

      catalogGrid.innerHTML = filtered.map(courseCardHtml).join('');
      wireBreadcrumb(catalogGrid, newRoute => navigateToRoute(newRoute));
      // The column says how many courses are showing, or that none are, with a Reset filters button.
      column.setResults(filtered.length);
    }

    column.addEventListener('marin-filter-change', renderGrid);
    // The column is drawn once its own files have loaded, which can be after this page is built.
    if (column.setOptions) renderGrid();
    else column.addEventListener('marin-filter-ready', renderGrid, { once: true });
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
