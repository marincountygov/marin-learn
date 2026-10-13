// Marin Learn - URL Router and State Manager
export function parseRoute() {
  const params = new URLSearchParams(window.location.search);
  return {
    set: params.get('set'),
    view: params.get('view'),
    resource: params.get('resource')
  };
}

export function navigateToRoute(routeParams, replace = false) {
  const url = new URL(window.location.href);
  url.search = '';
  if (routeParams.set) url.searchParams.set('set', routeParams.set);
  if (routeParams.view) url.searchParams.set('view', routeParams.view);
  if (routeParams.resource) url.searchParams.set('resource', routeParams.resource);

  if (replace) {
    window.history.replaceState(routeParams, '', url.toString());
  } else {
    window.history.pushState(routeParams, '', url.toString());
  }
  window.dispatchEvent(new CustomEvent('marin-route-change', { detail: routeParams }));
}
