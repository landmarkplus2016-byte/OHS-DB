// theme.js — accent-color theme switching. The navy sidebar/header never changes;
// only --primary and friends do, via [data-theme] on the root element.

import { render } from '../render.js';

export const THEMES = ['blue', 'teal', 'purple', 'crimson'];
const STORAGE_KEY = 'ohs_theme';

// Current theme from localStorage, validated, default 'blue'.
export function getTheme() {
  const stored = localStorage.getItem(STORAGE_KEY);
  return THEMES.includes(stored) ? stored : 'blue';
}

// Apply a theme: set the root data-theme, persist, and re-render.
export function setTheme(theme) {
  if (!THEMES.includes(theme)) return;
  document.documentElement.dataset.theme = theme;
  localStorage.setItem(STORAGE_KEY, theme);
  render();
}
