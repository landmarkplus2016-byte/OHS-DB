// main.js — application entry point.
// Imports everything, wires the router, and kicks off the first render.

import { initRouter } from './router.js';
import { render } from './render.js';
import { getTheme } from './utils/theme.js';

document.addEventListener('DOMContentLoaded', () => {
  // Reapply the persisted accent theme (index.html hardcodes data-theme="blue").
  document.documentElement.dataset.theme = getTheme();
  initRouter();
  render();
});
