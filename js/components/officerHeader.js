// officerHeader.js — the navy bar at the top of the officer mobile shell.
// One job: brand + who is signed in + the language and sign-out controls.
// Rendered by render.js on every officer screen except the login/setup page.

import { t, setLanguage, getLanguage } from '../i18n/i18n.js';
import { escapeHtml } from '../utils/format.js';
import { OFFICER_STATE, officerLogout } from '../data/officerSync.js';

export function renderOfficerHeader() {
  const lang = getLanguage();
  const who = (OFFICER_STATE.user && OFFICER_STATE.user.display_name) || '';

  return `
    <div class="hbar">
      <div class="brand">
        <div class="mark">OHS</div>
        <div>
          <div class="name">${t('officer_app_name')}</div>
          <div class="sub">${escapeHtml(who)}</div>
        </div>
      </div>
      <div class="hbar-actions">
        <button class="hbar-btn icon" data-action="officer-lang">${lang === 'en' ? 'ع' : 'EN'}</button>
        <button class="hbar-btn icon" data-action="officer-signout" title="${t('sign_out')}">⏻</button>
      </div>
    </div>`;
}

export function bindOfficerHeaderEvents() {
  const root = document.querySelector('.hbar');
  if (!root) return;

  const lang = root.querySelector('[data-action="officer-lang"]');
  if (lang) {
    lang.addEventListener('click', () => setLanguage(getLanguage() === 'en' ? 'ar' : 'en'));
  }

  const out = root.querySelector('[data-action="officer-signout"]');
  if (out) {
    // officerLogout clears the cache and navigates to '#/check' itself.
    out.addEventListener('click', () => { officerLogout(); });
  }
}
