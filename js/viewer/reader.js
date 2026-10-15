// Marin Learn - Continuous Documentation Reader (Phase 5)
import { loadLearningSetGraph, hasType } from '../core/graph.js';
import { parseMarkdownToHtml } from '../core/markdown.js';
import { breadcrumbHtml, wireBreadcrumb } from './breadcrumb.js';
import { resourceCard, RESOURCE_KINDS } from './landing.js';
import { renderNotePage } from './note.js';
import { wireScrollSpy } from './scrollspy.js';

export async function renderContinuousReader(container, setSlug, resourceSlug, catalogItems, onNavigate) {
  container.innerHTML = '<div class="catalog-status" aria-live="polite">Loading Marin Learn…</div>';

  const catalogEntry = catalogItems.find(item => item.identifier === setSlug);
  if (!catalogEntry) {
    renderError(container, 'Course not found.', setSlug, onNavigate);
    return;
  }

  try {
    const graphData = await loadLearningSetGraph(catalogEntry.graphUrl);
    
    // A Note replaces the free-form reading material. Old links that name the old
    // reading material (?resource=county-leaders-data-guide) open the Note instead.
    const note = (resourceSlug
      ? graphData.notes.find(n => n.identifier === resourceSlug || n['@id'] === resourceSlug || n['@id'] === `urn:uuid:${resourceSlug}`)
      : null) || graphData.notes[0];
    if (note) {
      renderNotePage(container, setSlug, note, graphData, catalogEntry, onNavigate);
      return;
    }

    // Find material: if resourceSlug is specified, match identifier or @id; otherwise pick sole material or first material
    let material = null;
    if (resourceSlug) {
      material = graphData.materials.find(m => m.identifier === resourceSlug || m['@id'] === resourceSlug || m['@id'] === `urn:uuid:${resourceSlug}`);
    }
    if (!material && graphData.materials.length > 0) {
      material = graphData.materials[0];
    }

    if (!material) {
      renderError(container, 'No reading material found in this course.', setSlug, onNavigate);
      return;
    }

    // Traverse content sequence (materials -> sections -> contentUnits)
    const contentUnitsToFetch = []; // { unit, sectionName }

    function processSequence(sequenceObj, sectionName = null) {
      if (!sequenceObj || !sequenceObj.itemListElement) return;
      sequenceObj.itemListElement.forEach(listItem => {
        const itemRef = listItem.item && listItem.item['@id'];
        if (!itemRef) return;
        const targetObj = graphData.byId.get(itemRef);
        if (!targetObj) return;

        if (hasType(targetObj, 'Section')) {
          const sName = targetObj.name || 'Section';
          if (targetObj['marin:contentSequence']) {
            processSequence(targetObj['marin:contentSequence'], sName);
          }
        } else if (hasType(targetObj, 'ContentUnit')) {
          contentUnitsToFetch.push({ unit: targetObj, sectionName });
        }
      });
    }

    if (material['marin:contentSequence']) {
      processSequence(material['marin:contentSequence']);
    }

    if (contentUnitsToFetch.length === 0) {
      renderError(container, 'Reading material contains no content units.', setSlug, onNavigate);
      return;
    }

    // Fetch Markdown files with bounded concurrency (limit 6) and deduplication
    const mdCache = new Map();
    const urlsToFetch = [...new Set(contentUnitsToFetch.map(item => item.unit.encoding && item.unit.encoding.contentUrl).filter(Boolean))];

    async function fetchWithConcurrency(urls, limit = 6) {
      let index = 0;
      async function worker() {
        while (index < urls.length) {
          const curl = urls[index++];
          if (mdCache.has(curl)) continue;
          // Construct base path for learning set files: learning/<setSlug>/<curl>
          const fullUrl = `learning/${setSlug}/${curl}`;
          try {
            const resp = await fetch(fullUrl, { cache: 'no-cache' });
            if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${curl}`);
            const text = await resp.text();
            mdCache.set(curl, text);
          } catch (err) {
            mdCache.set(curl, `> **Error:** Failed to load content file \`${curl}\`: ${err.message}`);
          }
        }
      }
      const workers = Array(Math.min(limit, urls.length)).fill(0).map(() => worker());
      await Promise.all(workers);
    }

    await fetchWithConcurrency(urlsToFetch, 6);

    // Build assembled document HTML and TOC
    let tocItems = [];
    let assembledHtml = '';

    contentUnitsToFetch.forEach(({ unit, sectionName }, idx) => {
      const curl = unit.encoding && unit.encoding.contentUrl;
      const rawMd = mdCache.get(curl) || '*Missing content*';
      const parsedContent = parseMarkdownToHtml(rawMd, graphData);

      const unitName = unit.name || `Unit ${idx + 1}`;
      const unitAnchor = `unit-${unit.identifier || idx}`;

      tocItems.push({ name: unitName, anchor: unitAnchor, section: sectionName });

      assembledHtml += `
        <article class="reader-unit" id="${unitAnchor}">
          <header class="reader-unit-header">
            <h3>${escapeHtml(unitName)}</h3>
            ${unit.abstract ? `<p class="reader-unit-abstract">${escapeHtml(unit.abstract)}</p>` : ''}
          </header>
          <div class="reader-unit-body">
            ${parsedContent}
          </div>
        </article>
      `;
    });

    // The course's other resources (deck, quiz) so a reader can keep going.
    const nextCards = RESOURCE_KINDS.filter(kind => kind.key !== 'materials')
      .flatMap(kind => graphData[kind.key].map(item => resourceCard(item, kind, setSlug)));
    const nextCardsHtml = nextCards.length ? `
          <section class="reader-next" aria-label="Deck and quiz">
            <div class="catalog-grid landing-resource-grid">${nextCards.join('')}</div>
          </section>` : '';

    // Sources: external works named in the material's or course's citation / isBasedOn lists.
    const sources = collectSources([material, graphData.learningSet]);
    const sourcesHtml = sources.length ? `
          <section class="reader-sources" aria-labelledby="reader-sources-heading">
            <h2 id="reader-sources-heading">Sources</h2>
            <ul>
              ${sources.map(src => `<li>${src.url ? `<a href="${escapeHtml(src.url)}">${escapeHtml(src.name)}</a>` : escapeHtml(src.name)}</li>`).join('')}
            </ul>
          </section>` : '';

    // Render reader layout
    container.innerHTML = `
      ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: catalogEntry.name, route: { set: setSlug } }, { label: 'Notes' }])}
      <div class="reader-layout" role="region" aria-label="Notes">
        <aside class="reader-sidebar" aria-label="On this page">
          <nav class="reader-toc">
            <h4>On this page</h4>
            <ul>
              ${tocItems.map(item => `<li><a href="#${item.anchor}">${escapeHtml(item.name)}</a></li>`).join('')}
            </ul>
          </nav>
        </aside>

        <div class="reader-main">
          <header class="reader-header">
            <h1>${escapeHtml(material.name)}</h1>
            ${material.abstract ? `<p class="reader-abstract">${escapeHtml(material.abstract)}</p>` : ''}
            <!-- Download PDF is hidden for now; the PDFs are still built by scripts/publish.py. -->
            <div class="doc-actions">
              <button type="button" class="doc-action" id="share-notes">Share</button>
              <span class="doc-action-status" role="status" aria-live="polite"></span>
            </div>
          </header>

          <div class="reader-content-sequence">
            ${assembledHtml}
          </div>
          ${nextCardsHtml}
          ${sourcesHtml}
        </div>
      </div>
    `;

    wireBreadcrumb(container, onNavigate);
    wireScrollSpy(container);

    const shareButton = container.querySelector('#share-notes');
    const shareStatus = container.querySelector('.doc-action-status');
    shareButton.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(window.location.href);
        shareStatus.textContent = 'Link copied';
      } catch {
        shareStatus.textContent = 'Could not copy. Copy the link from the address bar.';
      }
    });

    // Deck and quiz cards use real links; ordinary clicks stay in the app.
    container.querySelectorAll('.resource-action').forEach(link => {
      link.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        onNavigate({ set: setSlug, view: link.dataset.view, resource: link.dataset.resource });
      });
    });

    container.querySelectorAll('.reader-toc a').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href').substring(1);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          history.pushState(null, '', `#${targetId}`);
        }
      });
    });

  } catch (err) {
    renderError(container, err.message || 'Failed to load reading material.', setSlug, onNavigate);
  }
}

// External works only: skip internal {"@id": "urn:uuid:..."} references.
function collectSources(objects) {
  const found = new Map();
  objects.forEach(obj => {
    ['citation', 'isBasedOn'].forEach(key => {
      (obj && Array.isArray(obj[key]) ? obj[key] : []).forEach(entry => {
        if (typeof entry === 'string') entry = { url: entry, name: entry };
        if (!entry || typeof entry !== 'object') return;
        const id = typeof entry['@id'] === 'string' ? entry['@id'] : '';
        if (id.startsWith('urn:uuid:')) return;
        const url = [entry.url, id].find(value => /^https?:\/\//.test(value || '')) || '';
        const name = entry.name || url;
        if (!name) return;
        found.set(`${name}|${url}`, { name, url });
      });
    });
  });
  return [...found.values()];
}

function renderError(container, message, setSlug, onNavigate) {
  container.innerHTML = `
    <div class="catalog-error-box">
      ${breadcrumbHtml([{ label: 'Catalog', route: {} }, { label: 'Error' }])}
      <h3>Notes error</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
  wireBreadcrumb(container, onNavigate);
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[tag] || tag));
}
