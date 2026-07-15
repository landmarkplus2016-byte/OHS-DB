// exportPage.js — download the current employee set as Excel, CSV, or PDF.
// One job: filter employees, show the match count, and hand the filtered set to
// the matching export helper. It owns no export formatting of its own — the
// shaping and the file writing live in js/utils/exportHelpers.js.
//
// The size caps in CLAUDE.md "Export Limits" are enforced here, before any
// download: over the cap a format is disabled with a visible reason. An export
// is never silently truncated (CLAUDE.md rule 14).

import { DATA, UI } from '../state.js';
import { t, getLanguage } from '../i18n/i18n.js';
import { render } from '../render.js';
import { getFieldOptions } from '../constants/fields.js';
import { deriveEmployeeCompliance } from '../utils/compliance.js';
import { escapeHtml } from '../utils/format.js';
import {
  exportToExcel,
  exportToCSV,
  exportToPDF,
  SPREADSHEET_ROW_CAP,
  PDF_EMPLOYEE_CAP,
} from '../utils/exportHelpers.js';

// Current filter selections, defaulted.
function currentFilters() {
  return {
    team: UI.xTeam || 'all',
    status: UI.xStatus || 'all',
    sub: UI.xSub || 'all',
    archived: !!UI.xArchived,
  };
}

// The employees the export will contain. Shared by the render and the click
// handlers so what downloads is exactly what the count promised.
//
// The status filter reads the same aggregate worst state the employee list
// filters on, so "Expired" means the same thing on both pages.
function filteredEmployees() {
  const f = currentFilters();
  const thr = DATA.meta.warning_thresholds;

  return DATA.employees.filter((e) => {
    const p = e.personal || {};
    if (!f.archived && p.archived) return false;
    if (f.team !== 'all' && e.team !== f.team) return false;
    if (f.sub !== 'all' && p.subcontractor !== f.sub) return false;
    if (f.status !== 'all') {
      const worst = deriveEmployeeCompliance(e, thr).worst;
      if (f.status === 'expired' && worst !== 'expired') return false;
      if (f.status === 'urgent' && !(worst === 'urgent' || worst === 'expired')) return false;
      if (f.status === 'valid' && worst !== 'valid') return false;
    }
    return true;
  });
}

// Why a format is unavailable at the current match count, or '' if it is fine.
// Having nothing to export blocks just as much as having too much.
function blockReason(format, count) {
  if (count === 0) return t('export_empty');
  if (format === 'pdf' && count > PDF_EMPLOYEE_CAP) return t('export_limit_pdf');
  if (format !== 'pdf' && count > SPREADSHEET_ROW_CAP) return t('export_limit_spreadsheet');
  return '';
}

function exportCardHtml(format, icon, nameKey, descKey, count) {
  const blocked = blockReason(format, count);
  return `
    <button class="ex-card" data-format="${format}"${blocked ? ' disabled' : ''}>
      <div class="ex-icon">${icon}</div>
      <div class="ex-body">
        <div class="ex-name">${t(nameKey)}</div>
        <div class="ex-desc">${t(descKey)}</div>
        ${blocked ? `<div class="ex-warn">${blocked}</div>` : ''}
      </div>
    </button>`;
}

export function renderExportPage() {
  const f = currentFilters();
  const count = filteredEmployees().length;

  const subOptions = getFieldOptions('subcontractors').map(
    (s) => `<option value="${escapeHtml(s)}"${f.sub === s ? ' selected' : ''}>${escapeHtml(s)}</option>`
  ).join('');

  const opt = (value, label, current) =>
    `<option value="${value}"${current === value ? ' selected' : ''}>${label}</option>`;

  return `
    <div class="filter-bar">
      <div class="field">
        <label>${t('team_label')}</label>
        <select data-filter="team">
          ${opt('all', t('filter_all'), f.team)}
          ${opt('field', t('nav_field'), f.team)}
          ${opt('safety', t('nav_safety'), f.team)}
        </select>
      </div>
      <div class="field">
        <label>${t('filter_status')}</label>
        <select data-filter="status">
          ${opt('all', t('filter_all'), f.status)}
          ${opt('expired', t('st_expired'), f.status)}
          ${opt('urgent', t('st_urgent'), f.status)}
          ${opt('valid', t('st_valid'), f.status)}
        </select>
      </div>
      <div class="field">
        <label>${t('filter_sub')}</label>
        <select data-filter="sub">
          <option value="all">${t('filter_all')}</option>
          ${subOptions}
        </select>
      </div>
      <div class="field check">
        <input type="checkbox" id="x-archived" data-filter="archived"${f.archived ? ' checked' : ''}>
        <label for="x-archived">${t('include_archived')}</label>
      </div>
      <div class="count">${t('n_employees_match', { n: count })}</div>
    </div>

    <div class="export-cards">
      ${exportCardHtml('excel', '▤', 'ex_excel', 'ex_desc_excel', count)}
      ${exportCardHtml('csv', '▥', 'ex_csv', 'ex_desc_csv', count)}
      ${exportCardHtml('pdf', '▨', 'ex_pdf', 'ex_desc_pdf', count)}
    </div>`;
}

// Topbar meta — the intro line is the subtitle, matching the prototype.
export function exportTopbar() {
  return { title: t('nav_export'), sub: t('export_page_intro') };
}

export function bindExportPageEvents() {
  const app = document.getElementById('app');
  if (!app) return;

  const setFilter = (sel, key) => {
    const el = app.querySelector(sel);
    if (el) el.addEventListener('change', (e) => { UI[key] = e.target.value; render(); });
  };
  setFilter('[data-filter="team"]', 'xTeam');
  setFilter('[data-filter="status"]', 'xStatus');
  setFilter('[data-filter="sub"]', 'xSub');

  const archived = app.querySelector('[data-filter="archived"]');
  if (archived) {
    archived.addEventListener('change', (e) => { UI.xArchived = e.target.checked; render(); });
  }

  app.querySelectorAll('.ex-card[data-format]').forEach((card) => {
    card.addEventListener('click', () => {
      const employees = filteredEmployees();
      const format = card.dataset.format;
      // The disabled attribute already blocks the click; re-checking here keeps
      // the cap tied to the set actually being exported rather than to the count
      // that was on screen when the card was drawn.
      if (blockReason(format, employees.length)) return;

      if (format === 'excel') exportToExcel(employees, getLanguage());
      else if (format === 'csv') exportToCSV(employees);
      else if (format === 'pdf') exportToPDF(employees, getLanguage());
    });
  });
}
