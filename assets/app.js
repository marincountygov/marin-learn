// Marin Learn - Application Main Entry Point (Phases 3 & 4)
import { parseRoute, navigateToRoute } from '../js/viewer/router.js';
import { renderLandingPage } from '../js/viewer/landing.js';
import { renderContinuousReader } from '../js/viewer/reader.js';
import { renderSlideViewer } from '../js/viewer/slides.js';
import { renderQuizViewer } from '../js/viewer/quiz.js';
import { breadcrumbHtml, wireBreadcrumb } from '../js/viewer/breadcrumb.js';
import { renderThemePage } from '../js/viewer/themes.js';
import { courseCardHtml, themeBadgesHtml } from '../js/viewer/course-card.js';

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
    const searchInput = document.getElementById('catalog-search');
    const themeFilter = document.getElementById('theme-filter');
    const catalogStatus = document.getElementById('catalog-status');
    const catalogGrid = document.getElementById('catalog-grid');

    if (!catalogGrid) return;

    // Themes section: a badge for every theme, each linking to its theme page.
    const themesSection = document.getElementById('themes');
    if (catalogThemes.length) {
      document.getElementById('theme-badges').innerHTML = themeBadgesHtml(catalogThemes.map(theme => theme.name));
      wireBreadcrumb(themesSection, newRoute => navigateToRoute(newRoute));
      themesSection.hidden = false;
    }

    catalogThemes.forEach(theme => {
      const option = document.createElement('option');
      option.value = theme.name;
      option.textContent = theme.name;
      themeFilter.appendChild(option);
    });

    if (catalogItems.length === 0) {
      catalogStatus.textContent = 'The catalog is empty or did not load.';
      return;
    }

    function renderGrid() {
      const query = (searchInput.value || '').toLowerCase().trim();
      const selectedTheme = themeFilter.value;

      const filtered = catalogItems.filter(item => {
        const name = (item.name || '').toLowerCase();
        const abstract = (item.abstract || '').toLowerCase();
        const keywords = (item.keywords || []).join(' ').toLowerCase();
        const themes = (item.themes || []).join(' ').toLowerCase();

        const matchesQuery = !query || name.includes(query) || abstract.includes(query) || keywords.includes(query) || themes.includes(query);
        const matchesTheme = !selectedTheme || (item.themes || []).includes(selectedTheme);

        return matchesQuery && matchesTheme;
      });

      catalogStatus.textContent = '';
      catalogGrid.innerHTML = '';

      if (filtered.length === 0) {
        catalogStatus.textContent = 'Nothing in the catalog matches your search or filter.';
        return;
      }

      catalogGrid.innerHTML = filtered.map(courseCardHtml).join('');
      wireBreadcrumb(catalogGrid, newRoute => navigateToRoute(newRoute));
    }

    searchInput.addEventListener('input', renderGrid);
    themeFilter.addEventListener('change', renderGrid);

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
