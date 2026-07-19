// employeeListPage.js — the shared Field/Safety team roster. One job: render a
// searchable, filterable, paginated table of one team's employees and wire its
// controls. Used by both #/field and #/safety (team is passed in).
//
// Compliance is derived at render time (never stored). The list is always sliced
// to PAGE_SIZE so innerHTML re-renders stay fast (CLAUDE.md rule 13).

import { DATA, UI, CURRENT_USER } from '../state.js';
import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { render } from '../render.js';
import { getFieldOptions } from '../constants/fields.js';
import { deriveEmployeeCompliance } from '../utils/compliance.js';
import { complianceBadgeHtml } from '../components/badge.js';
import { fmtDate, escapeHtml } from '../utils/format.js';
import { archiveEmployee, unarchiveEmployee } from '../data/dataActions.js';

const PAGE_SIZE = 50;

function isAdmin() {
  return CURRENT_USER && CURRENT_USER.role === 'admin';
}

// Topbar title/subtitle/actions for the list route. The subtitle counts the
// team's non-archived employees; the action is the admin-only add button.
export function employeeListTopbar(team) {
  const count = DATA.employees.filter((e) => e.team === team && !(e.personal && e.personal.archived)).length;
  const title = team === 'field' ? t('nav_field') : t('nav_safety');
  const actions = isAdmin()
    ? `<button class="btn btn-primary btn-sm" data-action="add-employee" data-team="${team}">+ ${t('add_employee')}</button>`
    : '';
  return { title, sub: t('n_employees', { n: count }), actions };
}

// Small NEBOSH/ISO/OSHA pills for the safety-team quals column.
function qualsCellHtml(emp) {
  const q = emp.qualifications || {};
  const items = [];
  if (q.nebosh_igc) items.push(t('qual_nebosh'));
  if (q.iso_45001) items.push(t('qual_iso'));
  if (q.osha) items.push(t('qual_osha'));
  if (!items.length) return '—';
  return `<div class="qual-badges">${items.map((x) => `<span class="qual-badge">${x}</span>`).join('')}</div>`;
}

// View (all) + Edit / Archive|Unarchive (admin) buttons for a row.
function rowActionsHtml(emp) {
  let html = `<button class="btn btn-ghost btn-sm" data-action="view" data-emp="${emp.employee_id}">${t('view')}</button>`;
  if (isAdmin()) {
    html += `<button class="btn btn-ghost btn-sm" data-action="edit" data-emp="${emp.employee_id}">${t('edit')}</button>`;
    html += emp.personal && emp.personal.archived
      ? `<button class="btn btn-ghost btn-sm" data-action="unarchive" data-emp="${emp.employee_id}">${t('unarchive')}</button>`
      : `<button class="btn btn-ghost btn-sm" data-action="archive" data-emp="${emp.employee_id}">${t('archive')}</button>`;
  }
  return html;
}

export function renderEmployeeListPage(team) {
  const thr = DATA.meta.warning_thresholds;
  const showArchived = !!UI.showArchived;
  const search = (UI.search || '').toLowerCase();
  const statusFilter = UI.statusFilter || 'all';
  const titleFilter = UI.titleFilter || 'all';
  const subFilter = UI.subFilter || 'all';

  // Base set: this team, archived excluded unless the toggle is on.
  const base = DATA.employees.filter(
    (e) => e.team === team && (showArchived || !(e.personal && e.personal.archived))
  );

  // Compliance is computed at most once per employee and reused for filter + row.
  const compCache = new Map();
  const compOf = (e) => {
    let c = compCache.get(e);
    if (!c) { c = deriveEmployeeCompliance(e, thr); compCache.set(e, c); }
    return c;
  };

  // Digits typed into the search box are matched against the National ID with
  // all non-digits stripped from both sides, so typing just the last 4 digits
  // (or any run of digits) finds the employee even if the stored ID has spaces.
  const searchDigits = search.replace(/\D/g, '');

  const filtered = base.filter((e) => {
    const p = e.personal || {};
    if (search) {
      const matchesName = (e.name || '').toLowerCase().includes(search);
      const matchesId =
        searchDigits.length > 0 &&
        (e.national_id || '').replace(/\D/g, '').includes(searchDigits);
      if (!matchesName && !matchesId) return false;
    }
    if (titleFilter !== 'all' && p.title !== titleFilter) return false;
    if (subFilter !== 'all' && p.subcontractor !== subFilter) return false;
    if (statusFilter !== 'all') {
      const worst = compOf(e).worst;
      if (statusFilter === 'expired' && worst !== 'expired') return false;
      if (statusFilter === 'urgent' && !(worst === 'urgent' || worst === 'expired')) return false;
      if (statusFilter === 'valid' && worst !== 'valid') return false;
    }
    return true;
  });

  // Pagination — clamp the requested page into range, then slice.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(Math.max(UI.page || 1, 1), totalPages);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const titles = getFieldOptions(team === 'field' ? 'field_titles' : 'safety_titles');
  const subs = getFieldOptions('subcontractors');
  const colCount = team === 'safety' ? 8 : 7;

  const optionsHtml = (list, current) =>
    list.map((x) => `<option value="${escapeHtml(x)}"${current === x ? ' selected' : ''}>${escapeHtml(x)}</option>`).join('');

  const rowsHtml = pageRows.map((e) => {
    const p = e.personal || {};
    const c = compOf(e);
    const archived = !!p.archived;
    const resigned = p.employment_status === 'Resigned';
    return `
      <tr class="row-clickable${archived ? ' row-archived' : ''}${resigned ? ' row-resigned' : ''}" data-row-emp="${e.employee_id}">
        <td>
          <b>${escapeHtml(e.name)}</b><br>
          <span class="emp-id-sub">${e.employee_id}${archived ? ' · ' + t('archived_label') : ''}</span>
        </td>
        <td class="natid-cell">${escapeHtml(e.national_id)}</td>
        <td>${escapeHtml(p.title)}</td>
        <td>${escapeHtml(p.subcontractor)}</td>
        <td>${complianceBadgeHtml(c.worst)}${c.expired_count ? `<span class="expired-note">${t('n_expired', { n: c.expired_count })}</span>` : ''}</td>
        ${team === 'safety' ? `<td>${qualsCellHtml(e)}</td>` : ''}
        <td>${fmtDate(e.meta && e.meta.updated_at)}</td>
        <td class="row-actions">${rowActionsHtml(e)}</td>
      </tr>`;
  }).join('');

  const emptyHtml = filtered.length === 0
    ? `<tr><td class="empty-cell" colspan="${colCount}">${t('list_empty')}</td></tr>`
    : '';

  return `
    <div class="filter-bar">
      <div class="field search">
        <label>${t('search_label')}</label>
        <input data-filter="search" placeholder="${t('search_ph')}" value="${escapeHtml(UI.search || '')}">
      </div>
      <div class="field">
        <label>${t('filter_status')}</label>
        <select data-filter="status">
          <option value="all"${statusFilter === 'all' ? ' selected' : ''}>${t('filter_all')}</option>
          <option value="expired"${statusFilter === 'expired' ? ' selected' : ''}>${t('st_expired')}</option>
          <option value="urgent"${statusFilter === 'urgent' ? ' selected' : ''}>${t('st_urgent')}</option>
          <option value="valid"${statusFilter === 'valid' ? ' selected' : ''}>${t('st_valid')}</option>
        </select>
      </div>
      <div class="field">
        <label>${t('filter_title')}</label>
        <select data-filter="title">
          <option value="all">${t('filter_all')}</option>
          ${optionsHtml(titles, titleFilter)}
        </select>
      </div>
      <div class="field">
        <label>${t('filter_sub')}</label>
        <select data-filter="sub">
          <option value="all">${t('filter_all')}</option>
          ${optionsHtml(subs, subFilter)}
        </select>
      </div>
      <div class="field check">
        <input type="checkbox" id="show-archived" data-filter="archived"${showArchived ? ' checked' : ''}>
        <label for="show-archived">${t('show_archived')}</label>
      </div>
      <div class="count">${filtered.length} / ${base.length}</div>
    </div>

    <table class="tbl">
      <thead>
        <tr>
          <th>${t('col_name')}</th>
          <th>${t('col_natid')}</th>
          <th>${t('col_title')}</th>
          <th>${t('col_sub')}</th>
          <th>${t('col_state')}</th>
          ${team === 'safety' ? `<th>${t('col_quals')}</th>` : ''}
          <th>${t('col_updated')}</th>
          <th>${t('col_actions')}</th>
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

export function bindEmployeeListPageEvents() {
  const app = document.getElementById('app');
  if (!app) return;

  // Any filter/search change resets to page 1.
  const resetAndRender = () => { UI.page = 1; render(); };

  const searchInput = app.querySelector('[data-filter="search"]');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => { UI.search = e.target.value; resetAndRender(); });
  }

  const setFilter = (sel, key) => {
    const el = app.querySelector(sel);
    if (el) el.addEventListener('change', (e) => { UI[key] = e.target.value; resetAndRender(); });
  };
  setFilter('[data-filter="status"]', 'statusFilter');
  setFilter('[data-filter="title"]', 'titleFilter');
  setFilter('[data-filter="sub"]', 'subFilter');

  const archived = app.querySelector('[data-filter="archived"]');
  if (archived) {
    archived.addEventListener('change', (e) => { UI.showArchived = e.target.checked; resetAndRender(); });
  }

  // Row click → detail (ignore clicks that originate on an action button).
  app.querySelectorAll('tr[data-row-emp]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;
      go('employee', tr.dataset.rowEmp);
    });
  });

  // Row action buttons.
  app.querySelectorAll('.row-actions [data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.emp;
      const action = btn.dataset.action;
      if (action === 'view') go('employee', id);
      else if (action === 'edit') go('employee/edit', id);
      else if (action === 'archive') { archiveEmployee(id, CURRENT_USER); render(); }
      else if (action === 'unarchive') { unarchiveEmployee(id, CURRENT_USER); render(); }
    });
  });

  // Add employee (button lives in the topbar). The '/new' sub-route is part of
  // the route name, not a param — go('field', 'new') would render the list first
  // and only reach the form once the hashchange landed.
  const addBtn = app.querySelector('[data-action="add-employee"]');
  if (addBtn) {
    addBtn.addEventListener('click', () => go(addBtn.dataset.team + '/new'));
  }

  // Pagination.
  const prev = app.querySelector('[data-action="prev"]');
  if (prev) prev.addEventListener('click', () => { UI.page = Math.max(1, (UI.page || 1) - 1); render(); });
  const next = app.querySelector('[data-action="next"]');
  if (next) next.addEventListener('click', () => { UI.page = (UI.page || 1) + 1; render(); });
}
