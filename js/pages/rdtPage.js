// rdtPage.js — the admin-only Random Drug Testing dashboard. One job: show the
// yearly coverage progress, this month's proposed selection, and recent activity,
// and wire the mark/miss/swap/edit/delete actions.
//
// All selection maths is pure and lives in js/utils/rdt.js; every data change
// goes through js/data/dataActions.js (which autosaves). This file never mutates
// DATA directly — it reads DATA to render, calls a dataAction, then render()s.
//
// Visual language mirrors the Renewals/Dashboard pages: plain .card / .tbl /
// .badge / .btn, no new component types.

import { DATA, CURRENT_USER, UI } from '../state.js';
import { t, getLanguage } from '../i18n/i18n.js';
import { go } from '../router.js';
import { render } from '../render.js';
import {
  yearlyProgress,
  currentFiscalYear,
  isRepeatMonth,
  eligibleEmployees,
  eligibleIgnoringMcu,
  monthlyQuota,
} from '../utils/rdt.js';
import {
  enableRdt,
  generateAndSaveMonthlySelection,
  markRdtCompleted,
  markRdtMissed,
  swapRdtSelection,
  editRdtEntry,
  deleteRdtEntry,
} from '../data/dataActions.js';
import { teamBadgeHtml, rdtStatusBadgeHtml, rdtResultBadgeHtml } from '../components/badge.js';
import { fmtDate, escapeHtml, todayISO } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { exportRdtHistoryToExcel, SPREADSHEET_ROW_CAP } from '../utils/exportHelpers.js';

const RECENT_LIMIT = 15;
const HISTORY_PAGE_SIZE = 100;

// The 100%-coverage point sits at 100/120 of the 120% target scale.
const FIRST_ROUND_MARKER_PCT = (100 / 120) * 100;

// ── small helpers ───────────────────────────────────────────────────────────

// "July 2026" in the active language.
function monthLabel(today) {
  const locale = getLanguage() === 'ar' ? 'ar-EG' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(today);
}

// Every rdt_log entry selected in the current calendar month, any status, as
// { employee, entry }. Drives the "This month" table and its empty state.
function thisMonthSelections(today) {
  const monthISO = today.toISOString().slice(0, 7);
  const out = [];
  DATA.employees.forEach((e) => {
    (e.rdt_log || []).forEach((entry) => {
      if ((entry.selected_at || '').startsWith(monthISO)) out.push({ employee: e, entry });
    });
  });
  return out;
}

// Every rdt_log entry in the current fiscal year, newest selection first, capped.
function recentActivity(fyLabel) {
  const out = [];
  DATA.employees.forEach((e) => {
    (e.rdt_log || []).forEach((entry) => {
      if (entry.fiscal_year === fyLabel) out.push({ employee: e, entry });
    });
  });
  out.sort((a, b) => String(b.entry.selected_at || '').localeCompare(String(a.entry.selected_at || '')));
  return out.slice(0, RECENT_LIMIT);
}

// Locate a log entry by ids (for the edit modal pre-fill).
function findEntry(empId, logId) {
  const emp = DATA.employees.find((e) => e.employee_id === empId);
  return emp ? (emp.rdt_log || []).find((x) => x.log_id === logId) : null;
}

// ── row / card renderers ────────────────────────────────────────────────────

function actBtn(act, labelKey, empId, logId, cls = 'btn-ghost') {
  return `<button class="btn ${cls} btn-sm" data-act="${act}" data-emp="${escapeHtml(empId)}" data-log="${escapeHtml(logId)}">${t(labelKey)}</button>`;
}

// Actions available for a row depend on the entry's status.
function rowActions(empId, entry) {
  if (entry.status === 'selected') {
    return actBtn('complete', 'rdt_mark_completed', empId, entry.log_id)
      + actBtn('missed', 'rdt_mark_missed', empId, entry.log_id)
      + actBtn('swap', 'rdt_swap', empId, entry.log_id);
  }
  if (entry.status === 'completed') {
    return actBtn('edit', 'rdt_edit', empId, entry.log_id)
      + actBtn('delete', 'rdt_delete', empId, entry.log_id, 'btn-danger');
  }
  // missed
  return actBtn('delete', 'rdt_delete', empId, entry.log_id, 'btn-danger');
}

function monthRowHtml({ employee, entry }) {
  const p = employee.personal || {};
  return `
    <tr>
      <td><a class="rdt-name-link" data-emp="${escapeHtml(employee.employee_id)}">${escapeHtml(employee.name)}</a></td>
      <td><span class="emp-id-sub">${escapeHtml(employee.employee_id)}</span></td>
      <td>${teamBadgeHtml(employee.team)}</td>
      <td>${escapeHtml(p.title || '—')}</td>
      <td>${rdtStatusBadgeHtml(entry.status)}</td>
      <td class="rdt-actions">${rowActions(employee.employee_id, entry)}</td>
    </tr>`;
}

function heroCardHtml(prog, fy, repeat) {
  const targetPct = prog.target_pct;
  const barWidth = Math.min(100, targetPct);
  const phaseCls = repeat ? 'st-soon' : 'st-plan';
  const phaseLabel = t(repeat ? 'rdt_month_phase_repeat' : 'rdt_month_phase_normal');

  return `
    <div class="card">
      <div class="two-col">
        <div>
          <div class="rdt-big">${prog.completed_count} <span>/ ${prog.yearly_target}</span></div>
          <div class="rdt-sub">${t('rdt_target_progress')} ${targetPct.toFixed(0)}%</div>
          <div class="rdt-phase"><span class="badge ${phaseCls}">${phaseLabel}</span></div>
        </div>
        <div class="rdt-facts">
          <div class="rdt-facts-title">${t('rdt_fiscal_year', { label: fy.label })}</div>
          <div class="row"><span>${t('rdt_pool_size')}</span><b>${prog.pool_size}</b></div>
          <div class="row"><span>${t('rdt_unique_tested')}</span><b>${prog.unique_tested_count}</b></div>
          <div class="row"><span>${t('rdt_coverage')}</span><b>${prog.coverage_pct.toFixed(0)}%</b></div>
        </div>
      </div>
      <div class="rdt-progress-wrap">
        <div class="bar-track rdt-bar-track">
          <div class="bar-fill primary" style="width:${barWidth}%"></div>
          <div class="rdt-marker" style="inset-inline-start:${FIRST_ROUND_MARKER_PCT}%" title="${t('rdt_first_round_marker')}"></div>
        </div>
        <div class="rdt-progress-legend">
          <span>0%</span>
          <span>${t('rdt_first_round_marker')} · 100%</span>
          <span>120%</span>
        </div>
      </div>
    </div>`;
}

function monthCardHtml(today, repeat, pool, quota, monthSel, mcuExcludedCount) {
  const quotaLine = t('rdt_quota_line', { quota, pool: pool.length, pct: DATA.meta.rdt.monthly_target_pct });
  const phaseLabel = t(repeat ? 'rdt_month_phase_repeat' : 'rdt_month_phase_normal');

  // Helper line: how many otherwise-eligible employees the MCU rule dropped from
  // this month's pool. Only shown when the count is > 0 (no zero-count noise).
  const mcuNote = mcuExcludedCount > 0
    ? `<div class="meta rdt-mcu-note">${t('rdt_mcu_excluded_note', { count: mcuExcludedCount })}</div>`
    : '';

  const head = `
    <div class="rdt-card-head">
      <div>
        <h3>${t('rdt_this_month')} · ${escapeHtml(monthLabel(today))}</h3>
        <div class="meta">${phaseLabel} — ${quotaLine}</div>
        ${mcuNote}
      </div>
    </div>`;

  let body;
  if (!monthSel.length) {
    body = `
      <div class="rdt-empty">
        <p>${t('rdt_no_selection')}</p>
        <button class="btn btn-primary" data-act="generate">${t('rdt_generate')}</button>
      </div>`;
  } else {
    body = `
      <table class="tbl">
        <thead>
          <tr>
            <th>${t('col_name')}</th>
            <th>${t('col_emp_id')}</th>
            <th>${t('team_label')}</th>
            <th>${t('col_title')}</th>
            <th>${t('col_status')}</th>
            <th>${t('col_actions')}</th>
          </tr>
        </thead>
        <tbody>${monthSel.map(monthRowHtml).join('')}</tbody>
      </table>
      <button class="rdt-link" data-act="regenerate">${t('rdt_regenerate')}</button>`;
  }

  return `<div class="card rdt-month-card">${head}${body}</div>`;
}

function recentCardHtml(fy) {
  const recent = recentActivity(fy.label);
  const rows = recent.length
    ? recent.map(({ employee, entry }) => `
        <div class="rdt-recent-row">
          <span class="when">${fmtDate(entry.selected_at)}</span>
          <span class="who"><a class="rdt-name-link" data-emp="${escapeHtml(employee.employee_id)}">${escapeHtml(employee.name)}</a></span>
          ${rdtStatusBadgeHtml(entry.status)}
          ${entry.status === 'completed' ? rdtResultBadgeHtml(entry.result) : ''}
        </div>`).join('')
    : `<div class="chart-empty">${t('rdt_history_empty')}</div>`;

  return `
    <div class="card">
      <h3>${t('rdt_recent_activity')}</h3>
      ${rows}
      <div class="rdt-foot-link"><button class="rdt-link" data-act="history">${t('rdt_view_history')}</button></div>
    </div>`;
}

// Onboarding card shown on both the RDT dashboard and its history view when the
// feature is not yet configured. The 'enable' action is wired by both binders.
function onboardingHtml() {
  return `
    <div class="card rdt-onboard">
      <div class="rdt-onboard-ic">⚗</div>
      <p>${t('rdt_enable_prompt')}</p>
      <button class="btn btn-primary" data-act="enable">${t('rdt_enable_button')}</button>
    </div>`;
}

// ── page ────────────────────────────────────────────────────────────────────

export function renderRdtPage() {
  const rdt = DATA.meta.rdt;

  // Feature not configured (or explicitly disabled) → onboarding empty state.
  if (!rdt || rdt.enabled === false) return onboardingHtml();

  const today = new Date();
  const prog = yearlyProgress(DATA.employees, today, rdt);
  const fy = currentFiscalYear(today, rdt.fiscal_year_start_month);
  const repeat = isRepeatMonth(today, rdt);
  const pool = eligibleEmployees(DATA.employees, today, rdt);
  const quota = monthlyQuota(pool.length, rdt.monthly_target_pct);
  const monthSel = thisMonthSelections(today);
  // How many in-scope employees the MCU rule dropped from the pool this month.
  const mcuExcludedCount = eligibleIgnoringMcu(DATA.employees, today, rdt).length - pool.length;

  return `
    ${heroCardHtml(prog, fy, repeat)}
    ${monthCardHtml(today, repeat, pool, quota, monthSel, mcuExcludedCount)}
    ${recentCardHtml(fy)}`;
}

// Topbar meta — the always-present Export JSON button is added by the shell.
export function rdtTopbar() {
  return { title: t('rdt_page_title'), sub: t('rdt_page_sub') };
}

// ── modals ──────────────────────────────────────────────────────────────────

// Confirm-or-cancel modal, mirroring the pattern used on the employee detail
// page. onConfirm runs after close so the page can re-render underneath it.
function confirmModal(title, bodyHtml, confirmLabel, confirmClass, onConfirm) {
  const foot = `
    <button class="btn btn-ghost btn-sm" data-modal-action="cancel">${t('cancel')}</button>
    <button class="btn ${confirmClass} btn-sm" data-modal-action="confirm">${confirmLabel}</button>`;
  const close = openModal(title, bodyHtml, foot);
  document.querySelector('[data-modal-action="cancel"]').addEventListener('click', close);
  document.querySelector('[data-modal-action="confirm"]').addEventListener('click', () => {
    close();
    onConfirm();
  });
}

// Complete / Edit share one modal: test date, pass/fail, notes. `existing` is the
// entry when editing a completed row (pre-fills and routes to editRdtEntry).
function openCompleteModal(empId, logId, existing) {
  const isEdit = !!existing;
  const testDate = (existing && existing.test_date) || todayISO();
  const result = (existing && existing.result) || 'pass';
  const notes = (existing && existing.notes) || '';

  const body = `
    <div class="field">
      <label>${t('rdt_test_date')}</label>
      <input type="date" id="rdt-test-date" value="${escapeHtml(testDate)}">
    </div>
    <div class="field">
      <label>${t('rdt_result')}</label>
      <select id="rdt-result">
        <option value="pass"${result === 'pass' ? ' selected' : ''}>${t('rdt_result_pass')}</option>
        <option value="fail"${result === 'fail' ? ' selected' : ''}>${t('rdt_result_fail')}</option>
      </select>
    </div>
    <div class="field last">
      <label>${t('rdt_notes')}</label>
      <textarea id="rdt-notes" class="rdt-textarea" rows="3">${escapeHtml(notes)}</textarea>
    </div>`;

  const foot = `
    <button class="btn btn-ghost btn-sm" data-modal-action="cancel">${t('cancel')}</button>
    <button class="btn btn-primary btn-sm" data-modal-action="confirm">${t('save')}</button>`;

  const close = openModal(isEdit ? t('rdt_edit') : t('rdt_complete_title'), body, foot);
  document.querySelector('[data-modal-action="cancel"]').addEventListener('click', close);
  document.querySelector('[data-modal-action="confirm"]').addEventListener('click', () => {
    const td = document.getElementById('rdt-test-date').value;
    const rs = document.getElementById('rdt-result').value;
    const nt = document.getElementById('rdt-notes').value;
    close();
    if (isEdit) editRdtEntry(empId, logId, { test_date: td, result: rs, notes: nt });
    else markRdtCompleted(empId, logId, td, rs, nt);
    render();
    showToast(t(isEdit ? 'rdt_toast_edited' : 'rdt_toast_completed'), 'success');
  });
}

function openMissedModal(empId, logId) {
  const body = `
    <div class="field last">
      <label>${t('rdt_miss_reason')}</label>
      <textarea id="rdt-miss-notes" class="rdt-textarea" rows="3"></textarea>
    </div>`;

  const foot = `
    <button class="btn btn-ghost btn-sm" data-modal-action="cancel">${t('cancel')}</button>
    <button class="btn btn-primary btn-sm" data-modal-action="confirm">${t('save')}</button>`;

  const close = openModal(t('rdt_miss_title'), body, foot);
  document.querySelector('[data-modal-action="cancel"]').addEventListener('click', close);
  document.querySelector('[data-modal-action="confirm"]').addEventListener('click', () => {
    const nt = document.getElementById('rdt-miss-notes').value;
    close();
    markRdtMissed(empId, logId, nt);
    render();
    showToast(t('rdt_toast_missed'), 'success');
  });
}

function openSwapModal(empId, logId) {
  const emp = DATA.employees.find((e) => e.employee_id === empId);
  const name = emp ? emp.name : '';
  confirmModal(
    t('rdt_swap'),
    `<p>${t('rdt_swap_confirm', { name: escapeHtml(name) })}</p>`,
    t('rdt_swap'),
    'btn-primary',
    () => {
      const res = swapRdtSelection(empId, logId, CURRENT_USER);
      render();
      if (!res.ok) {
        showToast(t('rdt_swap_no_replacement'), 'error');
        return;
      }
      const replacement = DATA.employees.find((e) => e.employee_id === res.replacement_employee_id);
      showToast(t('rdt_swap_done', { oldName: name, newName: replacement ? replacement.name : '' }), 'success');
    }
  );
}

// Regenerate: drop every not-yet-completed 'selected' entry from THIS calendar
// month (via deleteRdtEntry, so nothing mutates DATA directly here), then
// generate a fresh list. Completed and missed entries are never touched.
function clearThisMonthSelected(today) {
  const monthISO = today.toISOString().slice(0, 7);
  const targets = [];
  DATA.employees.forEach((e) => {
    (e.rdt_log || []).forEach((entry) => {
      if (entry.status === 'selected' && (entry.selected_at || '').startsWith(monthISO)) {
        targets.push({ emp: e.employee_id, log: entry.log_id });
      }
    });
  });
  targets.forEach((x) => deleteRdtEntry(x.emp, x.log));
}

function runGenerate() {
  const created = generateAndSaveMonthlySelection(CURRENT_USER);
  render();
  if (!created.length) showToast(t('rdt_no_eligible'), 'error');
  else showToast(t('rdt_toast_generated', { n: created.length }), 'success');
}

// ── events ──────────────────────────────────────────────────────────────────

export function bindRdtPageEvents() {
  const app = document.getElementById('app');
  if (!app) return;

  // Name links → employee detail.
  app.querySelectorAll('.rdt-name-link[data-emp]').forEach((a) => {
    a.addEventListener('click', () => go('employee', a.dataset.emp));
  });

  const on = (act, handler) => {
    app.querySelectorAll(`[data-act="${act}"]`).forEach((el) => el.addEventListener('click', () => handler(el)));
  };

  on('enable', () => { enableRdt(); render(); });

  on('generate', () => runGenerate());

  on('regenerate', () => {
    confirmModal(
      t('rdt_this_month'),
      `<p>${t('rdt_confirm_regenerate')}</p>`,
      t('rdt_regenerate'),
      'btn-primary',
      () => { clearThisMonthSelected(new Date()); runGenerate(); }
    );
  });

  on('complete', (el) => openCompleteModal(el.dataset.emp, el.dataset.log, null));
  on('edit', (el) => openCompleteModal(el.dataset.emp, el.dataset.log, findEntry(el.dataset.emp, el.dataset.log)));
  on('missed', (el) => openMissedModal(el.dataset.emp, el.dataset.log));
  on('swap', (el) => openSwapModal(el.dataset.emp, el.dataset.log));

  on('delete', (el) => {
    confirmModal(
      t('rdt_delete'),
      `<p>${t('rdt_delete_confirm')}</p>`,
      t('rdt_delete'),
      'btn-danger',
      () => {
        deleteRdtEntry(el.dataset.emp, el.dataset.log);
        render();
        showToast(t('rdt_toast_deleted'), 'success');
      }
    );
  });

  // Full history lives at #/rdt/history.
  on('history', () => go('rdt/history'));
}

// ══════════════════════════════════════════════════════════════════════════
// RDT history (#/rdt/history) — full fiscal-year log, filterable + exportable.
// Same filter-bar / table / pager pattern as the Renewals page.
// ══════════════════════════════════════════════════════════════════════════

// The current fiscal year for the loaded config, at today's date.
function currentFy() {
  return currentFiscalYear(new Date(), DATA.meta.rdt.fiscal_year_start_month);
}

// The 12 'YYYY-MM' months of a fiscal year, in calendar order from its start.
function fyMonths(fy, startMonth) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m0 = startMonth - 1 + i;
    const year = fy.start_year + Math.floor(m0 / 12);
    const month = (m0 % 12) + 1;
    out.push(`${year}-${String(month).padStart(2, '0')}`);
  }
  return out;
}

// 'YYYY-MM' → "July 2026" in the active language.
function monthOptLabel(ym) {
  const [y, mo] = ym.split('-').map(Number);
  const locale = getLanguage() === 'ar' ? 'ar-EG' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, mo - 1, 1));
}

// Every rdt_log entry in the given fiscal year, as { employee, entry }.
function historyRows(fyLabel) {
  const out = [];
  DATA.employees.forEach((e) => {
    (e.rdt_log || []).forEach((entry) => {
      if (entry.fiscal_year === fyLabel) out.push({ employee: e, entry });
    });
  });
  return out;
}

function historyFilters() {
  return {
    month: UI.rdtHMonth || 'all',
    team: UI.rdtHTeam || 'all',
    status: UI.rdtHStatus || 'all',
    result: UI.rdtHResult || 'all',
  };
}

function applyHistoryFilters(rows, f) {
  return rows
    .filter(({ employee, entry }) => {
      if (f.month !== 'all' && !(entry.selected_at || '').startsWith(f.month)) return false;
      if (f.team !== 'all' && employee.team !== f.team) return false;
      if (f.status !== 'all' && entry.status !== f.status) return false;
      if (f.result !== 'all' && entry.result !== f.result) return false;
      return true;
    })
    .sort((a, b) => String(b.entry.selected_at || '').localeCompare(String(a.entry.selected_at || '')));
}

// Filtered + sorted rows for the current UI state — shared by the table and the
// export so what downloads is exactly what is on screen.
function filteredHistoryRows() {
  if (!DATA.meta.rdt) return [];
  return applyHistoryFilters(historyRows(currentFy().label), historyFilters());
}

function selectHtml(filterKey, current, options) {
  const opts = options
    .map((o) => `<option value="${o.value}"${current === o.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`)
    .join('');
  return `<select data-rdthfilter="${filterKey}">${opts}</select>`;
}

function historyRowHtml({ employee, entry }) {
  return `
    <tr>
      <td>${fmtDate(entry.selected_at)}</td>
      <td><a class="rdt-name-link" data-emp="${escapeHtml(employee.employee_id)}">${escapeHtml(employee.name)}</a></td>
      <td>${teamBadgeHtml(employee.team)}</td>
      <td><span class="emp-id-sub">${escapeHtml(entry.log_id || '')}</span></td>
      <td>${escapeHtml(entry.selected_by || '')}</td>
      <td>${entry.test_date ? fmtDate(entry.test_date) : '—'}</td>
      <td>${rdtStatusBadgeHtml(entry.status)}</td>
      <td>${entry.status === 'completed' ? (rdtResultBadgeHtml(entry.result) || '—') : '—'}</td>
      <td class="rdt-notes-cell">${escapeHtml(entry.notes || '')}</td>
    </tr>`;
}

export function renderRdtHistoryPage() {
  const rdt = DATA.meta.rdt;
  if (!rdt || rdt.enabled === false) return onboardingHtml();

  const fy = currentFy();
  const f = historyFilters();
  const rows = applyHistoryFilters(historyRows(fy.label), f);

  const totalPages = Math.max(1, Math.ceil(rows.length / HISTORY_PAGE_SIZE));
  const page = Math.min(Math.max(UI.rdtHPage || 1, 1), totalPages);
  const pageRows = rows.slice((page - 1) * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE);

  const monthOptions = [{ value: 'all', label: t('filter_all') }]
    .concat(fyMonths(fy, rdt.fiscal_year_start_month).map((m) => ({ value: m, label: monthOptLabel(m) })));
  const teamOptions = [
    { value: 'all', label: t('filter_all') },
    { value: 'field', label: t('nav_field') },
    { value: 'safety', label: t('nav_safety') },
  ];
  const statusOptions = [
    { value: 'all', label: t('filter_all') },
    { value: 'selected', label: t('rdt_status_selected') },
    { value: 'completed', label: t('rdt_status_completed') },
    { value: 'missed', label: t('rdt_status_missed') },
  ];
  const resultOptions = [
    { value: 'all', label: t('filter_all') },
    { value: 'pass', label: t('rdt_result_pass') },
    { value: 'fail', label: t('rdt_result_fail') },
  ];

  const emptyHtml = rows.length === 0
    ? `<tr><td class="empty-cell" colspan="9">${t('rdt_history_empty')}</td></tr>`
    : '';

  return `
    <div class="filter-bar">
      <div class="field">
        <label>${t('rdt_filter_month')}</label>
        ${selectHtml('month', f.month, monthOptions)}
      </div>
      <div class="field">
        <label>${t('rdt_filter_team')}</label>
        ${selectHtml('team', f.team, teamOptions)}
      </div>
      <div class="field">
        <label>${t('rdt_filter_status')}</label>
        ${selectHtml('status', f.status, statusOptions)}
      </div>
      <div class="field">
        <label>${t('rdt_filter_result')}</label>
        ${selectHtml('result', f.result, resultOptions)}
      </div>
      <div class="count">${t('rdt_n_entries', { n: rows.length })}</div>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th>${t('rdt_col_selected_at')}</th>
          <th>${t('rdt_col_employee')}</th>
          <th>${t('team_label')}</th>
          <th>${t('rdt_col_log_id')}</th>
          <th>${t('rdt_col_selected_by')}</th>
          <th>${t('rdt_test_date')}</th>
          <th>${t('rdt_filter_status')}</th>
          <th>${t('rdt_result')}</th>
          <th>${t('rdt_notes')}</th>
        </tr>
      </thead>
      <tbody>${pageRows.map(historyRowHtml).join('')}${emptyHtml}</tbody>
    </table>

    <div class="list-pager">
      <div>${t('page_x_of_y', { x: page, y: totalPages })}</div>
      <div class="pages">
        <button class="btn btn-ghost btn-sm" data-action="prev"${page <= 1 ? ' disabled' : ''}>${t('prev')}</button>
        <button class="btn btn-ghost btn-sm" data-action="next"${page >= totalPages ? ' disabled' : ''}>${t('next')}</button>
      </div>
    </div>`;
}

// Topbar meta — Back to the RDT dashboard + the Excel export action on the right.
export function rdtHistoryTopbar() {
  return {
    title: t('rdt_history_title'),
    sub: '',
    actions: `
      <button class="btn btn-ghost btn-sm" data-action="back-rdt">${t('back')}</button>
      <button class="btn btn-ghost btn-sm" data-action="export-rdt-history">${t('rdt_export_history')}</button>`,
  };
}

export function bindRdtHistoryPageEvents() {
  const app = document.getElementById('app');
  if (!app) return;

  // Onboarding state (feature disabled): only the enable button to wire.
  const enable = app.querySelector('[data-act="enable"]');
  if (enable) {
    enable.addEventListener('click', () => { enableRdt(); render(); });
    return;
  }

  // Back to the RDT dashboard (topbar).
  const back = app.querySelector('[data-action="back-rdt"]');
  if (back) back.addEventListener('click', () => go('rdt'));

  // Name links → employee detail.
  app.querySelectorAll('.rdt-name-link[data-emp]').forEach((a) => {
    a.addEventListener('click', () => go('employee', a.dataset.emp));
  });

  // Any filter change resets to page 1.
  const setF = (key, stateKey) => {
    const el = app.querySelector(`[data-rdthfilter="${key}"]`);
    if (el) el.addEventListener('change', (e) => { UI[stateKey] = e.target.value; UI.rdtHPage = 1; render(); });
  };
  setF('month', 'rdtHMonth');
  setF('team', 'rdtHTeam');
  setF('status', 'rdtHStatus');
  setF('result', 'rdtHResult');

  const prev = app.querySelector('[data-action="prev"]');
  if (prev) prev.addEventListener('click', () => { UI.rdtHPage = Math.max(1, (UI.rdtHPage || 1) - 1); render(); });
  const next = app.querySelector('[data-action="next"]');
  if (next) next.addEventListener('click', () => { UI.rdtHPage = (UI.rdtHPage || 1) + 1; render(); });

  // Export the whole filtered set — every page of it. Over the cap we block
  // rather than truncate (CLAUDE.md rule 14).
  const exportBtn = app.querySelector('[data-action="export-rdt-history"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const rows = filteredHistoryRows();
      if (!rows.length) return showToast(t('rdt_history_empty'), 'error');
      if (rows.length > SPREADSHEET_ROW_CAP) return showToast(t('export_limit_spreadsheet'), 'error');
      exportRdtHistoryToExcel(rows);
    });
  }
}
