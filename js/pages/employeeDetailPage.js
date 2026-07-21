// employeeDetailPage.js — the admin's read-only view of one employee's full
// record. One job: render every stored field for the employee in ROUTE_PARAM and
// wire its actions (back / edit / archive / delete).
//
// Compliance is derived here at render time (CLAUDE.md rule 9) — nothing about
// certificate state is read from or written to the JSON. Certificate PDFs are
// never touched: file_link is a string we hand to window.open() and nothing more
// (rule 15).

import { DATA, ROUTE_PARAM, CURRENT_USER } from '../state.js';
import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { render } from '../render.js';
import { applicableCerts, CERT_LABEL_KEYS } from '../constants/fields.js';
import { deriveEmployeeCompliance } from '../utils/compliance.js';
import {
  certStateBadgeHtml,
  complianceBadgeHtml,
  employmentStatusBadgeHtml,
  teamBadgeHtml,
  legalPermissionBadgeHtml,
  qualificationBadgeHtml,
  rdtStatusBadgeHtml,
  rdtResultBadgeHtml,
} from '../components/badge.js';
import { fmtDate, escapeHtml, daysUntil } from '../utils/format.js';
import { hasValidMcu } from '../utils/rdt.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { archiveEmployee, unarchiveEmployee, deleteEmployee } from '../data/dataActions.js';

// The employee this route points at, or undefined if the id is unknown (e.g. a
// stale bookmark, or the record was just deleted).
function currentEmployee() {
  return DATA.employees.find((e) => e.employee_id === ROUTE_PARAM);
}

function isAdmin() {
  return CURRENT_USER && CURRENT_USER.role === 'admin';
}

// The list route this employee belongs to — where Back and post-delete go.
function listRouteFor(emp) {
  return emp.team === 'field' ? 'field' : 'safety';
}

// ── topbar ──────────────────────────────────────────────────────────────────

// { title, sub, actions } for render.js's TOPBARS map. Name and national_id are
// data, so they are escaped before going into the topbar markup.
export function employeeDetailTopbar() {
  const emp = currentEmployee();
  // Unknown id: title it with the id that was looked up — the body explains.
  if (!emp) return { title: escapeHtml(ROUTE_PARAM || ''), sub: '', actions: '' };

  const archived = !!(emp.personal && emp.personal.archived);
  let actions = `<button class="btn btn-ghost btn-sm" data-action="back">${t('back')}</button>`;

  if (isAdmin()) {
    actions += `<button class="btn btn-primary btn-sm" data-action="edit">${t('edit')}</button>`;
    actions += archived
      ? `<button class="btn btn-ghost btn-sm" data-action="unarchive">${t('unarchive')}</button>`
      : `<button class="btn btn-ghost btn-sm" data-action="archive">${t('archive')}</button>`;
    actions += `<button class="btn btn-danger btn-sm" data-action="delete">${t('delete')}</button>`;
  }

  return {
    title: escapeHtml(emp.name),
    sub: `${emp.employee_id} · ${escapeHtml(emp.national_id)}`,
    actions,
  };
}

// ── section builders ────────────────────────────────────────────────────────

// One labelled read-only value. `value` is display-ready text; when it is empty
// the placeholder is shown in muted italics instead.
function fieldDispHtml(labelKey, value, extraClass = '') {
  const empty = value === '' || value == null;
  const cls = ['val', extraClass, empty ? 'muted' : ''].filter(Boolean).join(' ');
  return `<div class="field-disp">
    <div class="lab">${t(labelKey)}</div>
    <div class="${cls}">${empty ? t('no_value') : value}</div>
  </div>`;
}

// One certificate: name, expiry + how long until/since it, state badge, and the
// View button when a link was recorded.
function certRowHtml(emp, key, state) {
  const cert = (emp.certificates && emp.certificates[key]) || {};

  // N/A: this cert is not needed for this employee — show the note, no date,
  // no countdown, no View button (the derivation has already excluded it).
  if (state === 'na') {
    return `<div class="cert-row cert-row-na">
      <div class="cert-info">
        <div class="name">${t(CERT_LABEL_KEYS[key])}</div>
        <div class="date muted">${t('cert_na_note')}</div>
      </div>
      <div class="cert-actions">${certStateBadgeHtml('na')}</div>
    </div>`;
  }

  const days = daysUntil(cert.expiry_date);
  const rel = days == null
    ? ''
    : ` <span class="rel">(${days >= 0
        ? `${days} ${t('days_left')}`
        : `${Math.abs(days)} ${t('days_ago')}`})</span>`;

  const view = cert.file_link
    ? `<button class="btn btn-ghost btn-sm" data-action="view-cert" data-cert="${escapeHtml(key)}">${t('open_cert')}</button>`
    : '';

  return `<div class="cert-row${cert.suspended ? ' cert-row-suspended' : ''}">
    <div class="cert-info">
      <div class="name">${t(CERT_LABEL_KEYS[key])}</div>
      <div class="date">${fmtDate(cert.expiry_date)}${rel}</div>
    </div>
    <div class="cert-actions">
      ${certStateBadgeHtml(state)}
      ${view}
    </div>
  </div>`;
}

// Read-only RDT log for this employee, newest selection first. Actions (mark
// completed, swap, etc.) live on the RDT page — this is a history view only.
function rdtHistoryHtml(emp) {
  const log = Array.isArray(emp.rdt_log) ? emp.rdt_log : [];
  const rows = log
    .slice()
    .sort((a, b) => String(b.selected_at || '').localeCompare(String(a.selected_at || '')));

  const body = rows.length
    ? `<table class="tbl">
        <thead>
          <tr>
            <th>${t('rdt_col_selected_at')}</th>
            <th>${t('rdt_test_date')}</th>
            <th>${t('rdt_filter_status')}</th>
            <th>${t('rdt_result')}</th>
            <th>${t('rdt_notes')}</th>
          </tr>
        </thead>
        <tbody>${rows.map((e) => `
          <tr>
            <td>${fmtDate(e.selected_at)}</td>
            <td>${e.test_date ? fmtDate(e.test_date) : '—'}</td>
            <td>${rdtStatusBadgeHtml(e.status)}</td>
            <td>${e.status === 'completed' ? (rdtResultBadgeHtml(e.result) || '—') : '—'}</td>
            <td class="rdt-notes-cell">${escapeHtml(e.notes || '')}</td>
          </tr>`).join('')}</tbody>
      </table>`
    : `<div class="chart-empty">${t('rdt_history_empty')}</div>`;

  // Display-only hint: an expired/missing MCU takes the employee out of the RDT
  // pool (CLAUDE.rdt.patch.md rule 11). Show it beside the section title. Uses
  // today's date so it tracks the same boundary as the eligibility filter.
  const mcuBadge = hasValidMcu(emp, new Date())
    ? ''
    : `<span class="badge st-blocked rdt-ineligible-badge">${t('rdt_ineligible_mcu')}</span>`;

  return `
    <div class="section-head">${t('rdt_history_section')}${mcuBadge}</div>
    <div class="card">${body}</div>`;
}

// Append-only renewal log, newest first. Rendered only when non-empty.
function renewalHistoryHtml(emp) {
  const history = emp.renewal_history;
  if (!Array.isArray(history) || history.length === 0) return '';

  const rows = history
    .slice()
    .reverse()
    .map((r) => `<tr>
      <td>${CERT_LABEL_KEYS[r.cert_key] ? t(CERT_LABEL_KEYS[r.cert_key]) : escapeHtml(r.cert_key)}</td>
      <td>${fmtDate(r.old_expiry)}</td>
      <td>${fmtDate(r.new_expiry)}</td>
      <td>${fmtDate(r.renewed_at)}</td>
      <td>${escapeHtml(r.renewed_by)}</td>
    </tr>`)
    .join('');

  return `
    <div class="section-head">${t('section_history')}</div>
    <div class="card">
      <table class="tbl">
        <thead>
          <tr>
            <th>${t('col_cert')}</th>
            <th>${t('col_old_expiry')}</th>
            <th>${t('col_new_expiry')}</th>
            <th>${t('col_renewed_at')}</th>
            <th>${t('col_renewed_by')}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── page ────────────────────────────────────────────────────────────────────

export function renderEmployeeDetailPage() {
  const emp = currentEmployee();
  if (!emp) {
    return `<div class="not-found">
      <div>${t('emp_not_found')}</div>
      <button class="btn btn-ghost btn-sm" data-action="back-dashboard">${t('back')}</button>
    </div>`;
  }

  const comp = deriveEmployeeCompliance(emp, DATA.meta.warning_thresholds);
  const p = emp.personal || {};
  const q = emp.qualifications || {};

  const certHtml = applicableCerts(emp)
    .map((k) => certRowHtml(emp, k, comp.per_cert[k]))
    .join('');

  const qualsHtml = emp.team === 'safety'
    ? `
      <div class="section-head">${t('section_quals')}</div>
      <div class="card">
        <div class="detail-badges">
          ${qualificationBadgeHtml('qual_nebosh', !!q.nebosh_igc)}
          ${qualificationBadgeHtml('qual_iso', !!q.iso_45001)}
          ${qualificationBadgeHtml('qual_osha', !!q.osha)}
        </div>
      </div>`
    : '';

  return `
    <div class="detail-badges">
      ${teamBadgeHtml(emp.team)}
      ${complianceBadgeHtml(comp.worst)}
      ${employmentStatusBadgeHtml(p.employment_status)}
      ${legalPermissionBadgeHtml(p.legal_permission)}
      ${p.archived ? `<span class="badge st-missing">${t('archived_label')}</span>` : ''}
    </div>

    <div class="section-head">${t('section_personal')}</div>
    <div class="card">
      <div class="detail-grid">
        ${fieldDispHtml('field_name', escapeHtml(emp.name))}
        ${fieldDispHtml('field_natid', escapeHtml(emp.national_id), 'mono')}
        ${fieldDispHtml('field_title', escapeHtml(p.title))}
        ${fieldDispHtml('field_contractor', escapeHtml(p.contractor))}
        ${fieldDispHtml('field_sub', escapeHtml(p.subcontractor))}
        ${fieldDispHtml('field_hired', p.hired_date ? fmtDate(p.hired_date) : '')}
      </div>
    </div>

    <div class="section-head">${t('section_certs')}</div>
    <div class="card">
      <div class="cert-list">${certHtml}</div>
    </div>

    ${qualsHtml}

    ${rdtHistoryHtml(emp)}

    ${renewalHistoryHtml(emp)}`;
}

// ── events ──────────────────────────────────────────────────────────────────

// Confirm-or-cancel modal. `bodyHtml` is display-ready (callers escape any data).
// onConfirm runs after the modal closes so the page can re-render underneath it.
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

export function bindEmployeeDetailPageEvents() {
  // The action buttons live in the topbar, the cert buttons in #app — so this
  // binder queries the document rather than a single container.
  const backToDashboard = document.querySelector('[data-action="back-dashboard"]');
  if (backToDashboard) {
    backToDashboard.addEventListener('click', () => go('dashboard'));
    return; // Not-found page has nothing else to wire.
  }

  const emp = currentEmployee();
  if (!emp) return;

  const name = escapeHtml(emp.name);

  const on = (action, handler) => {
    const btn = document.querySelector(`[data-action="${action}"]`);
    if (btn) btn.addEventListener('click', handler);
  };

  on('back', () => go(listRouteFor(emp)));
  on('edit', () => go('employee/edit', emp.employee_id));

  on('archive', () => {
    confirmModal(
      t('confirm_archive_title'),
      `<p>${t('confirm_archive_msg', { name })}</p>`,
      t('archive'),
      'btn-primary',
      () => {
        archiveEmployee(emp.employee_id, CURRENT_USER);
        render();
        showToast(t('toast_archived', { name: emp.name }), 'success');
      }
    );
  });

  on('unarchive', () => {
    confirmModal(
      t('confirm_unarchive_title'),
      `<p>${t('confirm_unarchive_msg', { name })}</p>`,
      t('unarchive'),
      'btn-primary',
      () => {
        unarchiveEmployee(emp.employee_id, CURRENT_USER);
        render();
        showToast(t('toast_unarchived', { name: emp.name }), 'success');
      }
    );
  });

  on('delete', () => {
    // Deleting drops the append-only renewal history with the record, so the
    // confirmation says so explicitly and points at Archive as the softer option.
    const historyCount = Array.isArray(emp.renewal_history) ? emp.renewal_history.length : 0;
    const body = `
      <p>${t('confirm_delete_msg', { name, id: emp.employee_id })}</p>
      ${historyCount ? `<p class="err">${t('confirm_delete_history_warn', { n: historyCount })}</p>` : ''}`;

    confirmModal(t('confirm_delete_title'), body, t('delete'), 'btn-danger', () => {
      const listRoute = listRouteFor(emp);
      const deletedName = emp.name;
      deleteEmployee(emp.employee_id, CURRENT_USER);
      go(listRoute);
      showToast(t('toast_deleted', { name: deletedName }), 'success');
    });
  });

  // Certificate links are external files we never store — just open them.
  document.querySelectorAll('[data-action="view-cert"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cert = emp.certificates && emp.certificates[btn.dataset.cert];
      if (cert && cert.file_link) window.open(cert.file_link, '_blank');
    });
  });
}
