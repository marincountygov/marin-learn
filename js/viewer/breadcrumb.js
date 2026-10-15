// Marin Learn - Breadcrumb trail shared by the course, notes, deck, and quiz pages.
// Items before the last one are links; the last item is the current page.

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[tag] || tag));
}

export function breadcrumbHtml(items) {
  const last = items.length - 1;
  const entries = items.map((item, index) => {
    if (index === last) return `<li aria-current="page">${escapeHtml(item.label)}</li>`;
    const params = new URLSearchParams();
    if (item.route && item.route.set) params.set('set', item.route.set);
    if (item.route && item.route.view) params.set('view', item.route.view);
    if (item.route && item.route.resource) params.set('resource', item.route.resource);
    if (item.route && item.route.theme) params.set('theme', item.route.theme);
    const query = params.toString();
    return `<li><a href="${query ? `?${escapeHtml(query)}` : './'}" data-route="${escapeHtml(JSON.stringify(item.route || {}))}">${escapeHtml(item.label)}</a></li>`;
  });
  return `<nav class="viewer-breadcrumb" aria-label="Breadcrumb"><ul>${entries.join('')}</ul></nav>`;
}

// Wires every link with a data-route (breadcrumbs, theme badges, card titles).
// Ordinary clicks use in-app navigation; modified clicks keep the browser's
// open-in-new-tab behavior because the links are real links.
export function wireBreadcrumb(container, onNavigate) {
  container.querySelectorAll('a[data-route]').forEach(link => {
    link.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const route = JSON.parse(link.dataset.route);
      onNavigate({ set: route.set || null, view: route.view || null, resource: route.resource || null, theme: route.theme || null, hash: route.hash || null });
    });
  });
}
