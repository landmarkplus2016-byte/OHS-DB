// renewalsPage.js — the cross-team renewal worklist. One job: flatten active
// employees into one row per expiring certificate, sorted soonest-first, and
// wire its filters/export.
//
// The unit here is the certificate, not the person: an employee with three
// expiring certs appears three times. Certificates with no expiry date are left
// out entirely — a missing date is missing data, not renewal work (CLAUDE.md
// "Site Check Verdict" rules).

import { DATA, UI } from '../state.js';
import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { render } from '../render.js';
import { ALL_CERT_KEYS, CERT_LABEL_KEYS, applicableCerts, getFieldOptions } from '../constants/fields.js';
import { deriveCertState } from '../utils/compliance.js';
import { certStateBadgeHtml, teamBadgeHtml } from '../components/badge.js';
import { fmtDate, escapeHtml, daysUntil } from '../utils/format.js';
import { exportRenewalsToExcel, SPREADSHEET_ROW_CAP } from '../utils/exportHelpers.js';
import { showToast } from '../components/toast.js';

// Denser than the employee list: one row per certificate, not per person.
const PAGE_SIZE = 100;

// Selectable windows. '0' means "all, including already-expired".
const WINDOWS = ['7', '30', '60', '90', '0'];
const DEFAULT_WINDOW = '90';

// Every applicable certificate of every active employee that has an expiry date,
// as { employee, cert_key, expiry, days_left, state }.
function buildRenewalRows(thresholds) {
  const rows = [];
  DATA.employees
    .filter((e) => !(e.personal && e.personal.archived))
    .forEach((e) => {
      applicableCerts(e).forEach((k) => {
        const expiry = e.certificates?.[k]?.expiry_date;
        if (!expiry) return;
        rows.push({
          employee: e,
          cert_key: k,
          expiry,
          days_left: daysUntil(expiry),
          state: deriveCertState(expiry, thresholds),
        });
      });
    });
  return rows;
}

// Current filter selections, defaulted. Kept in one place so render and export
// filter through exactly the same code path.
function currentFilters() {
  return {
    window: WINDOWS.includes(UI.rWindow) ? UI.rWindow : DEFAULT_WINDOW,
    team: UI.rTeam || 'all',
    sub: UI.rSub || 'all',
    cert: UI.rCert || 'all',
  };
}

function applyFilters(rows, f) {
  const windowDays = parseInt(f.window, 10);
  return rows
    .filter((r) => {
      // windowDays === 0 is the "all, including expired" case: no upper bound.
      if (windowDays > 0 && r.days_left > windowDays) return false;
      if (f.team !== 'all' && r.employee.team !== f.team) return false;
      if (f.cert !== 'all' && r.cert_key !== f.cert) return false;
      if (f.sub !== 'all' && (r.employee.personal || {}).subcontractor !== f.sub) return false;
      return true;
    })
    .sort((a, b) => a.days_left - b.days_left);
}

// The filtered, sorted rows for the current UI state. Used by both the table and
// the export so what downloads is exactly what is on screen.
function filteredRows() {
  return applyFilters(buildRenewalRows(DATA.meta.warning_thresholds), currentFilters());
}

// '12 days left' / '3 days ago' — the sign of days_left carries the meaning, so
// the number shown is always absolute.
function daysCellHtml(days) {
  const label = days >= 0 ? t('days_left') : t('days_ago');
  return `<b>${Math.abs(days)} ${label}</b>`;
}

export function renderRenewalsPage() {
  const f = currentFilters();
  const rows = filteredRows();

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(Math.max(UI.rPage || 1, 1), totalPages);
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Every bounded window still shows already-expired certs (they are the most
  // urgent renewal work); the number is only the upper, future-facing bound.
  // The label says so explicitly so the window's behaviour is self-evident.
  const windowLabel = (w) => (w === '0' ? t('all_including_expired') : t('expired_plus_next_days', { days: w }));
  const windowOptions = WINDOWS.map(
    (w) => `<option value="${w}"${f.window === w ? ' selected' : ''}>${windowLabel(w)}</option>`
  ).join('');

  const certOptions = ALL_CERT_KEYS.map(
    (k) => `<option value="${k}"${f.cert === k ? ' selected' : ''}>${t(CERT_LABEL_KEYS[k])}</option>`
  ).join('');

  const subOptions = getFieldOptions('subcontractors').map(
    (s) => `<option value="${escapeHtml(s)}"${f.sub === s ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  // The row tint is driven by --row-tint, set per state class in pages.css.
  const rowsHtml = pageRows.map((r) => `
    <tr class="row-clickable rnw-row rnw-${r.state}" data-row-emp="${r.employee.employee_id}">
      <td>
        <b>${escapeHtml(r.employee.name)}</b><br>
        <span class="emp-id-sub">${r.employee.employee_id}</span>
      </td>
      <td>${teamBadgeHtml(r.employee.team)}</td>
      <td>${t(CERT_LABEL_KEYS[r.cert_key])}</td>
      <td>${fmtDate(r.expiry)}</td>
      <td class="days-cell">${daysCellHtml(r.days_left)}</td>
      <td>${certStateBadgeHtml(r.state)}</td>
      <td>${escapeHtml((r.employee.personal || {}).subcontractor)}</td>
    </tr>`).join('');

  const emptyHtml = rows.length === 0
    ? `<tr><td class="empty-cell" colspan="7">${t('renewals_empty')}</td></tr>`
    : '';

  return `
    <div class="filter-bar">
      <div class="field">
        <label>${t('days_window')}</label>
        <select data-filter="window">${windowOptions}</select>
      </div>
      <div class="field">
        <label>${t('team_label')}</label>
        <select data-filter="team">
          <option value="all">${t('filter_all')}</option>
          <option value="field"${f.team === 'field' ? ' selected' : ''}>${t('nav_field')}</option>
          <option value="safety"${f.team === 'safety' ? ' selected' : ''}>${t('nav_safety')}</option>
        </select>
      </div>
      <div class="field">
        <label>${t('filter_cert')}</label>
        <select data-filter="cert">
          <option value="all">${t('filter_all')}</option>
          ${certOptions}
        </select>
      </div>
      <div class="field">
        <label>${t('filter_sub')}</label>
        <select data-filter="sub">
          <option value="all">${t('filter_all')}</option>
          ${subOptions}
        </select>
      </div>
      <div class="count">${t('n_renewals', { n: rows.length })}</div>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th>${t('col_name')}</th>
          <th>${t('team_label')}</th>
          <th>${t('col_cert')}</th>
          <th>${t('expiry_date')}</th>
          <th>${t('col_days')}</th>
          <th>${t('col_status')}</th>
          <th>${t('col_sub')}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}${emptyHtml}</tbody>
    </table>

    <div class="list-pager">
      <div>${t('page_x_of_y', { x: page, y: totalPages })}</div>
      <div class="pages">
        <button class="btn btn-ghost btn-sm" data-action="prev"${page <= 1 ? ' disabled' : ''}>${t('prev')}</button>
        <button class="btn btn-ghost btn-sm" data-action="next"${page >= totalPages ? ' disabled' : ''}>${t('next')}</button>
      </div>
    </div>`;
}

// Topbar meta — the export action lives here, on the right.
export function renewalsTopbar() {
  return {
    title: t('nav_renewals'),
    sub: t('renewals_intro'),
    actions: `<button class="btn btn-ghost btn-sm" data-action="export-renewals">${t('export_list_excel')}</button>`,
  };
}

export function bindRenewalsPageEvents() {
  const app = document.getElementById('app');
  if (!app) return;

  // Any filter change resets to page 1.
  const setFilter = (sel, key) => {
    const el = app.querySelector(sel);
    if (el) el.addEventListener('change', (e) => { UI[key] = e.target.value; UI.rPage = 1; render(); });
  };
  setFilter('[data-filter="window"]', 'rWindow');
  setFilter('[data-filter="team"]', 'rTeam');
  setFilter('[data-filter="cert"]', 'rCert');
  setFilter('[data-filter="sub"]', 'rSub');

  app.querySelectorAll('tr[data-row-emp]').forEach((tr) => {
    tr.addEventListener('click', () => go('employee', tr.dataset.rowEmp));
  });

  const prev = app.querySelector('[data-action="prev"]');
  if (prev) prev.addEventListener('click', () => { UI.rPage = Math.max(1, (UI.rPage || 1) - 1); render(); });
  const next = app.querySelector('[data-action="next"]');
  if (next) next.addEventListener('click', () => { UI.rPage = (UI.rPage || 1) + 1; render(); });

  // Export the whole filtered set — every page of it, not just the visible one.
  // Over the cap we block rather than truncate (CLAUDE.md rule 14).
  const exportBtn = app.querySelector('[data-action="export-renewals"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const rows = filteredRows();
      if (!rows.length) return showToast(t('renewals_empty'), 'error');
      if (rows.length > SPREADSHEET_ROW_CAP) return showToast(t('export_limit_spreadsheet'), 'error');
      exportRenewalsToExcel(rows);
    });
  }
}
