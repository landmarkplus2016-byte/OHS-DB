// state.js — the single source of truth for all in-memory admin app state.
// One job: hold and mutate state. No business logic, no rendering, no I/O.
// Every field is exported as a live binding so other modules always read the
// current value; mutations go through the small setters below.

import { makeBootstrapData } from './data/bootstrap.js';

// The whole loaded data object (meta + users + employees). Starts as a fresh
// bootstrap object so the app is usable before any JSON is loaded.
export let DATA = makeBootstrapData();

// The logged-in user, or null when no session is active.
export let CURRENT_USER = null;

// Whether the in-memory DATA has unsaved edits not yet exported to JSON.
export let IS_DIRTY = false;

// Current route name and its parameter (e.g. an employee_id), parsed from the
// URL hash by router.js.
export let ROUTE = 'login';
export let ROUTE_PARAM = null;

// Free-form per-page transient state: search text, active filters, active tab,
// pagination page, etc. Cleared/overwritten freely by page code.
export let UI = {};

export function setData(newData) {
  DATA = newData;
}

export function setCurrentUser(u) {
  CURRENT_USER = u;
}

export function setRoute(r, p) {
  ROUTE = r;
  ROUTE_PARAM = p || null;
}

export function markDirty() {
  IS_DIRTY = true;
}

export function clearDirty() {
  IS_DIRTY = false;
}
