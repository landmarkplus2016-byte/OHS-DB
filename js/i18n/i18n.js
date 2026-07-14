// i18n.js — translation lookup and language switching.
// All UI text goes through t('key'). Language preference persists to localStorage.

import { en } from './en.js';
import { ar } from './ar.js';
import { render } from '../render.js';

const DICTS = { en, ar };
const STORAGE_KEY = 'ohs_lang';

// Module-level current language, seeded from localStorage (default 'en').
let currentLang = localStorage.getItem(STORAGE_KEY) || 'en';
if (!DICTS[currentLang]) currentLang = 'en';

// Apply dir/lang immediately on module load so the very first paint is correct
// (RTL must be in place before render() runs).
applyDocumentLang(currentLang);

function applyDocumentLang(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

// Look up a translation, substitute {placeholder} params, fall back to the key.
export function t(key, params) {
  const dict = DICTS[currentLang] || en;
  let s = key in dict ? dict[key] : key;
  if (params) {
    for (const p in params) {
      s = s.replace('{' + p + '}', params[p]);
    }
  }
  return s;
}

// Switch language: update state, persist, sync the document, and re-render.
export function setLanguage(lang) {
  if (!DICTS[lang]) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  applyDocumentLang(lang);
  render();
}

export function getLanguage() {
  return currentLang;
}
