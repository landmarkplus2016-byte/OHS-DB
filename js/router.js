// router.js — hash-based routing.
// Reads/writes location.hash and listens for hashchange. Filled in Stage 3.

// Wire up hashchange listening and initial route parsing. Stub for now.
export function initRouter() {}

// Navigate to a route, updating the URL hash. render() runs via the hashchange
// listener that initRouter() will register in Stage 3.
export function go(route, param) {
  location.hash = '#/' + route + (param ? '/' + param : '');
}
