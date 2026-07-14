// main.js — application entry point.
// Imports everything, wires the router, and kicks off the first render.

import { initRouter } from './router.js';
import { render } from './render.js';

document.addEventListener('DOMContentLoaded', () => {
  initRouter();
  render();
});
