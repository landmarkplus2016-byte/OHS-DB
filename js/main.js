// main.js — application entry point.
// Imports everything, wires the router, and kicks off the first render.

import { initRouter } from './router.js';
import { render } from './render.js';
import { getTheme } from './utils/theme.js';
import { bootstrapOfficerSession } from './data/officerSync.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Reapply the persisted accent theme (index.html hardcodes data-theme="blue").
  document.documentElement.dataset.theme = getTheme();
  initRouter();

  // Rehydrate the officer's cached snapshot/session from IndexedDB before the
  // first paint, so a reload on '#/check/*' doesn't flash the login page. Reads
  // only — never throws, so a failure here still renders (as a logged-out
  // officer, which fails closed).
  await bootstrapOfficerSession();

  render();
});
