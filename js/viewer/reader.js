// Marin Learn - Continuous Documentation Reader (Phase 5)
import { loadLearningSetGraph, hasType } from '../core/graph.js';
import { parseMarkdownToHtml } from '../core/markdown.js';

export async function renderContinuousReader(container, setSlug, resourceSlug, catalogItems, onNavigate) {
  container.innerHTML = '<div class="catalog-status" aria-live="polite">Loading reading material...</div>';

  const catalogEntry = catalogItems.find(item => item.identifier === setSlug);
  if (!catalogEntry) {
    renderError(container, 'Learning set not found.', setSlug, onNavigate);
    return;
  }

  try {
    const graphData = await loadLearningSetGraph(catalogEntry.graphUrl);
    
    // Find material: if resourceSlug is specified, match identifier or @id; otherwise pick sole material or first material
    let material = null;
    if (resourceSlug) {
      material = graphData.materials.find(m => m.identifier === resourceSlug || m['@id'] === resourceSlug || m['@id'] === `urn:uuid:${resourceSlug}`);
    }
    if (!material && graphData.materials.length > 0) {
      material = graphData.materials[0];
    }

    if (!material) {
      renderError(container, 'No reading material found in this learning set.', setSlug, onNavigate);
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

    // Render reader layout
    container.innerHTML = `
      <div class="reader-layout" role="region" aria-label="Continuous reading view">
        <aside class="reader-sidebar" aria-label="Table of Contents">
          <div class="reader-sidebar-back">
            <button id="back-to-landing" class="link-button">&larr; Back to overview</button>
          </div>
          <nav class="reader-toc">
            <h4>Table of Contents</h4>
            <ul>
              ${tocItems.map(item => `<li><a href="#${item.anchor}">${escapeHtml(item.name)}</a></li>`).join('')}
            </ul>
          </nav>
        </aside>
        
        <main class="reader-main">
          <header class="reader-header">
            <h1>${escapeHtml(material.name)}</h1>
            ${material.abstract ? `<p class="reader-abstract">${escapeHtml(material.abstract)}</p>` : ''}
            <div class="reader-toolbar">
              <a id="download-pdf" class="primary" role="button" href="learning/${setSlug}/${material.identifier || 'material'}.pdf" download="${material.identifier || 'material'}.pdf">Download PDF</a>
            </div>
          </header>

          <div class="reader-content-sequence">
            ${assembledHtml}
          </div>
        </main>
      </div>
    `;

    document.getElementById('back-to-landing').addEventListener('click', () => {
      onNavigate({ set: setSlug, view: null, resource: null });
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

function renderError(container, message, setSlug, onNavigate) {
  container.innerHTML = `
    <div class="catalog-error-box">
      <h3>Reading Material Error</h3>
      <p>${escapeHtml(message)}</p>
      <button id="back-to-set" class="primary">Back to Learning Set</button>
    </div>
  `;
  document.getElementById('back-to-set').addEventListener('click', () => {
    onNavigate({ set: setSlug, view: null, resource: null });
  });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[tag] || tag));
}
