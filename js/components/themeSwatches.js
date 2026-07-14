// themeSwatches.js — the 4-accent-color swatch row shown in the sidebar bottom.
// One job: render the swatches with .active on the current theme. Click handling
// lives in the sidebar's bindSidebarEvents (event delegation on data-swatch).

import { THEMES, getTheme } from '../utils/theme.js';

export function renderThemeSwatches() {
  const current = getTheme();
  return `<div class="swatches">${THEMES.map((c) => `
    <div class="swatch ${c}${c === current ? ' active' : ''}" data-swatch="${c}"></div>
  `).join('')}</div>`;
}
