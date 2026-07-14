// sidebar.js — the admin desktop shell's fixed navy sidebar. One job: render
// the logo, nav, theme/language controls, and user chip, and wire their events.
//
// Unlike the prototype (which used inline onclick + globals), this modular app
// attaches listeners in bindSidebarEvents() via data-* attributes.

import { ROUTE, CURRENT_USER } from '../state.js';
import { go } from '../router.js';
import { t, setLanguage, getLanguage } from '../i18n/i18n.js';
import { setTheme } from '../utils/theme.js';
import { logout } from '../data/auth.js';
import { initials, escapeHtml } from '../utils/format.js';
import { renderThemeSwatches } from './themeSwatches.js';

// Nav entries in display order. `admin: true` items show only for admins
// (always true in practice — one admin — but the check exists per CLAUDE.md).
const NAV_ITEMS = [
  { route: 'dashboard', ic: '◇', key: 'nav_dashboard' },
  { route: 'field', ic: '⚙', key: 'nav_field' },
  { route: 'safety', ic: '⛑', key: 'nav_safety' },
  { route: 'renewals', ic: '⏱', key: 'nav_renewals' },
  { route: 'export', ic: '↓', key: 'nav_export' },
  { route: 'settings', ic: '⚙', key: 'nav_settings', admin: true },
];

// A nav item is active for its own route and any sub-route (e.g. 'field' stays
// active on 'field/new').
function isActive(route) {
  return ROUTE === route || String(ROUTE).startsWith(route + '/');
}

export function renderSidebar() {
  const user = CURRENT_USER || {};
  const lang = getLanguage();

  const navHtml = NAV_ITEMS
    .filter((i) => !i.admin || user.role === 'admin')
    .map((i) => `
      <a href="#/${i.route}" data-route="${i.route}" class="${isActive(i.route) ? 'active' : ''}">
        <span class="ic">${i.ic}</span> ${t(i.key)}
      </a>`)
    .join('');

  return `
    <aside class="sidebar">
      <div class="side-logo">
        <div class="mark">OHS</div>
        <div class="name">${t('app_name')}</div>
        <div class="sub">${t('app_sub')}</div>
      </div>
      <nav class="nav">${navHtml}</nav>
      <div class="side-bottom">
        ${renderThemeSwatches()}
        <div class="lang-toggle">
          <button data-lang="en" class="${lang === 'en' ? 'active' : ''}">EN</button>
          <button data-lang="ar" class="${lang === 'ar' ? 'active' : ''}">ع</button>
        </div>
        <div class="userchip">
          <div class="avatar">${initials(user.display_name)}</div>
          <div>
            <div class="who">${escapeHtml(user.display_name)}</div>
            <div class="role">${escapeHtml(user.role)}</div>
          </div>
        </div>
        <button class="side-signout" data-action="signout">${t('sign_out')}</button>
      </div>
    </aside>`;
}

export function bindSidebarEvents() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Nav links → route.
  sidebar.querySelectorAll('.nav a[data-route]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      go(a.dataset.route);
    });
  });

  // Theme swatches → setTheme.
  sidebar.querySelectorAll('.swatch[data-swatch]').forEach((s) => {
    s.addEventListener('click', () => setTheme(s.dataset.swatch));
  });

  // Language buttons → setLanguage.
  sidebar.querySelectorAll('.lang-toggle button[data-lang]').forEach((b) => {
    b.addEventListener('click', () => setLanguage(b.dataset.lang));
  });

  // Sign out → clear session, back to login.
  const signout = sidebar.querySelector('[data-action="signout"]');
  if (signout) {
    signout.addEventListener('click', () => {
      logout();
      go('login');
    });
  }
}
