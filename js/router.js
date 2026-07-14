// router.js — hash-based routing. One job: keep location.hash, the ROUTE/
// ROUTE_PARAM state, and the rendered view in sync. No page markup lives here.
//
// GitHub Pages has no server-side routing, so every route is a '#/...' fragment.
// We parse the hash into a (route, param) pair, where `route` may be a
// multi-segment name (e.g. 'field/new', 'employee/edit', 'check/home') and
// `param` holds a single id (an employee_id). The access guard lives in
// render.js so it runs on every draw regardless of how render() was reached.

import { ROUTE, ROUTE_PARAM, setRoute } from './state.js';
import { render } from './render.js';

// Parse the current location.hash into { route, param }.
//
// Handled shapes:
//   '' / '#/'                     -> { route: '',                 param: null }
//   '#/dashboard'                 -> { route: 'dashboard',        param: null }
//   '#/field/new'                 -> { route: 'field/new',        param: null }
//   '#/employee/LM-EMP-0001'      -> { route: 'employee',         param: 'LM-EMP-0001' }
//   '#/employee/LM-EMP-0001/edit' -> { route: 'employee/edit',    param: 'LM-EMP-0001' }
//   '#/check'                     -> { route: 'check',            param: null }
//   '#/check/home'                -> { route: 'check/home',       param: null }
//   '#/check/employee/LM-EMP-1'   -> { route: 'check/employee',   param: 'LM-EMP-1' }
//   '#/check/locked'              -> { route: 'check/locked',     param: null }
function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const segs = raw.split('/').filter(Boolean);

  if (segs.length === 0) return { route: '', param: null };

  const [a, b, c] = segs;

  // Officer mobile shell.
  if (a === 'check') {
    if (!b) return { route: 'check', param: null };
    if (b === 'employee') return { route: 'check/employee', param: c || null };
    if (b === 'home' || b === 'locked') return { route: 'check/' + b, param: null };
    return { route: 'check', param: null };
  }

  // Employee detail / edit carry an id param.
  if (a === 'employee') {
    if (c === 'edit') return { route: 'employee/edit', param: b || null };
    return { route: 'employee', param: b || null };
  }

  // List routes with a '/new' sub-route.
  if (a === 'field' || a === 'safety') {
    if (b === 'new') return { route: a + '/new', param: null };
    return { route: a, param: null };
  }

  // Single-segment routes: login, dashboard, renewals, export, settings.
  return { route: a, param: b || null };
}

// Build the URL hash for a (route, param) pair. Inverse of parseHash — it must
// round-trip, so the one route whose id sits in the MIDDLE of the path
// ('#/employee/:id/edit') is special-cased. Every other route puts the param
// last, matching the generic form.
function buildHash(route, param) {
  if (route === 'employee/edit') return '#/employee/' + param + '/edit';
  return '#/' + route + (param ? '/' + param : '');
}

// Navigate to a route: update state, sync the URL hash, and draw. Setting the
// hash may queue a 'hashchange'; onHashChange() dedupes it against the state we
// just set so navigation renders exactly once.
export function go(route, param) {
  setRoute(route, param);
  const hash = buildHash(route, param);
  if (location.hash !== hash) location.hash = hash;
  render();
}

// Fired for external hash changes (back/forward button, manual URL edit). If the
// hash already matches current state (because go() set it), this is a no-op.
function onHashChange() {
  const { route, param } = parseHash();
  if (route === ROUTE && (param || null) === (ROUTE_PARAM || null)) return;
  setRoute(route, param);
  render();
}

// Register the hashchange listener and seed ROUTE from the initial hash. The
// first render() is triggered by main.js after this returns.
export function initRouter() {
  window.addEventListener('hashchange', onHashChange);
  const { route, param } = parseHash();
  setRoute(route, param);
}
