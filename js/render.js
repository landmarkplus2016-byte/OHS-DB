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

// ── placeholder pages (one per route) ───────────────────────────────────────
// Admin pages return inner content only; render() wraps them in <div class="content">.
// Real implementations arrive in later stages under js/pages/*.

function pageSettings() { return 'Settings placeholder'; }

function pageOfficerLogin() { return '<div class="content">Officer login placeholder</div>'; }
function pageOfficerHome() { return '<div class="content">Officer home placeholder</div>'; }
function pageOfficerVerdict() { return '<div class="content">Officer verdict placeholder</div>'; }
function pageOfficerLocked() { return '<div class="content">Officer locked placeholder</div>'; }

// route name -> page render function.
const PAGES = {
  login: renderLoginPage,
  dashboard: renderDashboardPage,
  field: () => renderEmployeeListPage('field'),
  'field/new': renderEmployeeFormPage,
  safety: () => renderEmployeeListPage('safety'),
  'safety/new': renderEmployeeFormPage,
  employee: renderEmployeeDetailPage,
  'employee/edit': renderEmployeeFormPage,
  renewals: renderRenewalsPage,
  export: renderExportPage,
  settings: pageSettings,

  check: pageOfficerLogin,
  'check/home': pageOfficerHome,
  'check/employee': pageOfficerVerdict,
  'check/locked': pageOfficerLocked,
};

// route name -> optional bind<Name>Events function for the page body. Each stage
// registers its page's binder here as it lands.
const BINDERS = {
  login: bindLoginPageEvents,
  dashboard: bindDashboardPageEvents,
  renewals: bindRenewalsPageEvents,
  export: bindExportPageEvents,
  field: bindEmployeeListPageEvents,
  safety: bindEmployeeListPageEvents,
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
    renewals: 'nav_renewals',
    export: 'nav_export',
    settings: 'nav_settings',
  };
  return { title: t(byKey[route] || 'app_name'), sub: '' };
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

  // Unknown route — send somewhere safe.
  const pageFn = PAGES[ROUTE];
  if (!pageFn) {
    go(CURRENT_USER ? 'dashboard' : 'login');
    return;
  }

  // Leaving the employee form discards its draft, so re-entering it later
  // starts blank instead of resuming a half-typed record.
  if (!isEmployeeFormRoute(ROUTE)) clearEmployeeFormDraft();

  const content = pageFn();

  if (String(ROUTE).startsWith('check')) {
    // Officer mobile shell (placeholder until Stage 9).
    app.innerHTML = `
      <div class="phone-shell">
        <header class="officer-header">OHS Field Check</header>
        ${content}
      </div>`;
  } else if (!CURRENT_USER) {
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
