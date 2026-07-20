// render.js — top-level render entry point. One job: pick the right shell,
// draw the page for the current ROUTE into #app, then run its event binders.
//
// The access guard runs here (before any drawing) so every render path — go(),
// hashchange, setLanguage(), setTheme() — is guarded. Page render functions are
// Stage-3 placeholders; each later stage replaces them with the real page
// modules from the File Map and registers their bind*Events in BINDERS.

import { ROUTE, CURRENT_USER } from './state.js';
import { canAccessRoute } from './utils/permissions.js';
import { go } from './router.js';
import { t } from './i18n/i18n.js';
import { renderSidebar, bindSidebarEvents } from './components/sidebar.js';
import { renderTopbar, bindTopbarEvents } from './components/topbar.js';
import { renderOfficerHeader, bindOfficerHeaderEvents } from './components/officerHeader.js';
import { renderOfficerSyncStrip, bindOfficerSyncStripEvents } from './components/officerSyncStrip.js';
import { renderLoginPage, bindLoginPageEvents } from './pages/loginPage.js';
import { renderEmployeeListPage, employeeListTopbar, bindEmployeeListPageEvents } from './pages/employeeListPage.js';
import { renderEmployeeDetailPage, employeeDetailTopbar, bindEmployeeDetailPageEvents } from './pages/employeeDetailPage.js';
import {
  renderEmployeeFormPage,
  employeeFormTopbar,
  bindEmployeeFormPageEvents,
  isEmployeeFormRoute,
  clearEmployeeFormDraft,
} from './pages/employeeFormPage.js';
import { renderDashboardPage, dashboardTopbar, bindDashboardPageEvents } from './pages/dashboardPage.js';
import { renderRenewalsPage, renewalsTopbar, bindRenewalsPageEvents } from './pages/renewalsPage.js';
import { renderExportPage, exportTopbar, bindExportPageEvents } from './pages/exportPage.js';
import { renderSettingsPage, bindSettingsPageEvents } from './pages/settingsPage.js';
import { renderOfficerLoginPage, bindOfficerLoginPageEvents } from './pages/officerLoginPage.js';
import { renderOfficerHomePage, bindOfficerHomePageEvents, clearOfficerHomeState } from './pages/officerHomePage.js';
import { renderOfficerVerdictPage, bindOfficerVerdictPageEvents } from './pages/officerVerdictPage.js';
import { renderOfficerLockedPage, bindOfficerLockedPageEvents } from './pages/officerLockedPage.js';
import { OFFICER_STATE, isCacheStale } from './data/officerSync.js';

// route name -> page render function.
const PAGES = {
  login: renderLoginPage,
  dashboard: renderDashboardPage,
  field: () => renderEmployeeListPage('field'),
  'field/new': renderEmployeeFormPage,
  safety: () => renderEmployeeListPage('safety'),
  'safety/new': renderEmployeeFormPage,
  separated: () => renderEmployeeListPage('separated'),
  employee: renderEmployeeDetailPage,
  'employee/edit': renderEmployeeFormPage,
  renewals: renderRenewalsPage,
  export: renderExportPage,
  settings: renderSettingsPage,
};

// ── officer mobile shell ────────────────────────────────────────────────────
// The officer app is a separate world: its own session (OFFICER_STATE, not
// CURRENT_USER), its own chrome, and its own staleness guard. Everything below
// is keyed by the same '#/check/*' route names the admin PAGES map uses.

const OFFICER_PAGES = {
  check: renderOfficerLoginPage,
  'check/home': renderOfficerHomePage,
  'check/employee': renderOfficerVerdictPage,
  'check/locked': renderOfficerLockedPage,
};

const OFFICER_BINDERS = {
  check: bindOfficerLoginPageEvents,
  'check/home': bindOfficerHomePageEvents,
  'check/employee': bindOfficerVerdictPageEvents,
  'check/locked': bindOfficerLockedPageEvents,
};

// Which chrome each officer screen gets.
//   header — the navy bar (everything except the login/setup screen)
//   strip  — the sync strip (home only; the verdict and lock screens are
//            single-purpose and must not offer a competing action)
//   padded — wrap the page in <div class="body">. The verdict hero and the lock
//            screen are full-bleed and do their own spacing, so they opt out.
const OFFICER_SHELL = {
  check:            { header: false, strip: false, padded: false },
  'check/home':     { header: true,  strip: true,  padded: true },
  'check/employee': { header: true,  strip: false, padded: false },
  'check/locked':   { header: true,  strip: false, padded: false },
};

// Screens that show verdict-bearing data and therefore must never render from a
// stale cache (CLAUDE.md rule 8).
const NEEDS_FRESH_CACHE = ['check/home', 'check/employee'];

// route name -> optional bind<Name>Events function for the page body. Each stage
// registers its page's binder here as it lands.
const BINDERS = {
  login: bindLoginPageEvents,
  dashboard: bindDashboardPageEvents,
  renewals: bindRenewalsPageEvents,
  export: bindExportPageEvents,
  settings: bindSettingsPageEvents,
  field: bindEmployeeListPageEvents,
  safety: bindEmployeeListPageEvents,
  separated: bindEmployeeListPageEvents,
  employee: bindEmployeeDetailPageEvents,
  'field/new': bindEmployeeFormPageEvents,
  'safety/new': bindEmployeeFormPageEvents,
  'employee/edit': bindEmployeeFormPageEvents,
};

// route name -> function returning { title, sub, actions } for the topbar, when
// a page needs a dynamic subtitle or its own action buttons. Falls back to
// adminTopbarMeta for routes not listed here.
const TOPBARS = {
  dashboard: dashboardTopbar,
  renewals: renewalsTopbar,
  export: exportTopbar,
  field: () => employeeListTopbar('field'),
  safety: () => employeeListTopbar('safety'),
  separated: () => employeeListTopbar('separated'),
  employee: employeeDetailTopbar,
  'field/new': employeeFormTopbar,
  'safety/new': employeeFormTopbar,
  'employee/edit': employeeFormTopbar,
};

// Topbar title/subtitle for an admin route. Employee routes use the id param as
// the title (data, not translatable); everything else uses an i18n key.
function adminTopbarMeta(route) {
  const byKey = {
    dashboard: 'nav_dashboard',
    field: 'nav_field',
    safety: 'nav_safety',
    separated: 'nav_separated',
    renewals: 'nav_renewals',
    export: 'nav_export',
    settings: 'nav_settings',
  };
  return { title: t(byKey[route] || 'app_name'), sub: '' };
}

// Draws an officer screen into `app`. Each early return here redirects instead
// of drawing; the go() re-enters render() and this runs again against the new
// route, so it always terminates on a screen the officer is allowed to see.
//
// The staleness lockout is enforced here rather than inside the page functions
// so it cannot be bypassed by reaching a page another way — a typed URL, a back
// button, or a bookmark all pass through this one gate.
function renderOfficerShell(app) {
  if (!OFFICER_STATE.user) {
    // Signed out: login is the only officer screen. Drop any leftover search and
    // recent-lookup state so the next officer starts clean.
    clearOfficerHomeState();
    if (ROUTE !== 'check') {
      go('check');
      return;
    }
  } else if (ROUTE === 'check') {
    // Already signed in — skip the login screen.
    go('check/home');
    return;
  } else if (NEEDS_FRESH_CACHE.includes(ROUTE) && isCacheStale()) {
    go('check/locked');
    return;
  } else if (ROUTE === 'check/locked' && !isCacheStale()) {
    // A sync landed; don't strand the officer on the lock screen.
    go('check/home');
    return;
  }

  const pageFn = OFFICER_PAGES[ROUTE];
  if (!pageFn) {
    go('check');
    return;
  }

  const shell = OFFICER_SHELL[ROUTE];
  const body = pageFn();

  app.innerHTML = `
    <div class="phone">
      ${shell.header ? renderOfficerHeader() : ''}
      ${shell.strip ? renderOfficerSyncStrip() : ''}
      ${shell.padded ? `<div class="body">${body}</div>` : body}
    </div>`;

  if (shell.header) bindOfficerHeaderEvents();
  if (shell.strip) bindOfficerSyncStripEvents();

  const bind = OFFICER_BINDERS[ROUTE];
  if (typeof bind === 'function') bind();
}

// ── render ──────────────────────────────────────────────────────────────────

export function render() {
  const app = document.getElementById('app');
  if (!app) return;

  // Root '#/' resolves to a concrete destination based on auth.
  if (ROUTE === '') {
    go(CURRENT_USER ? 'dashboard' : 'login');
    return;
  }

  // Access guard — runs before any drawing.
  const access = canAccessRoute(CURRENT_USER, ROUTE);
  if (!access.ok) {
    go(access.redirect);
    return;
  }

  // Leaving the employee form discards its draft, so re-entering it later
  // starts blank instead of resuming a half-typed record.
  if (!isEmployeeFormRoute(ROUTE)) clearEmployeeFormDraft();

  // Officer mobile shell — its own session, chrome, and staleness guard.
  if (String(ROUTE).startsWith('check')) {
    renderOfficerShell(app);
    return;
  }

  // Unknown route — send somewhere safe.
  const pageFn = PAGES[ROUTE];
  if (!pageFn) {
    go(CURRENT_USER ? 'dashboard' : 'login');
    return;
  }

  const content = pageFn();

  if (!CURRENT_USER) {
    // Login page — no shell.
    app.innerHTML = content;
  } else {
    // Admin desktop shell: sidebar + topbar + content. A page may supply its own
    // topbar (dynamic subtitle + action buttons) via TOPBARS; otherwise a static
    // title is used.
    const meta = TOPBARS[ROUTE] ? TOPBARS[ROUTE]() : adminTopbarMeta(ROUTE);
    app.innerHTML = `
      <div class="app">
        ${renderSidebar()}
        <div class="main">
          ${renderTopbar(meta.title, meta.sub, meta.actions || '')}
          <div class="content">${content}</div>
        </div>
      </div>`;
    bindSidebarEvents();
    bindTopbarEvents();
  }

  // Attach page-body listeners, if this page has a binder.
  const bind = BINDERS[ROUTE];
  if (typeof bind === 'function') bind();
}
