// settingsPage.js — the admin's whole configuration surface, in four tabs:
// Users, Lists, Thresholds, Data file. One job: present DATA.meta and DATA.users
// for editing and hand every change to dataActions.js. It derives nothing and
// stores nothing itself — the thresholds edited here are read back at render
// time by compliance.js/verdict.js, never baked into the JSON.
//
// Every mutation goes through saveUsers()/updateMeta(), which mark IS_DIRTY, so
// the topbar's unsaved-changes indicator is accurate. Restoring a backup is the
// one exception: loadJSON() clears the flag, because what is in memory then
// matches the file on disk exactly.

import { DATA, UI, CURRENT_USER } from '../state.js';
import { t } from '../i18n/i18n.js';
import { render } from '../render.js';
import { LIST_FIELD_KEYS, getFieldOptions } from '../constants/fields.js';
import { escapeHtml, todayISO } from '../utils/format.js';
import { openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { teamBadgeHtml } from '../components/badge.js';
import {
  saveUsers,
  updateMeta,
  exportJSON,
  loadJSON,
  publishFieldSnapshot,
} from '../data/dataActions.js';
import {
  parseExcelWorkbook,
  buildImportPreview,
  commitImport,
  summarizePreview,
} from '../utils/excelImport.js';

const TABS = ['users', 'lists', 'thresholds', 'data'];

// List key (as stored under meta.field_options) -> its i18n label key. Two of the
// six differ from their storage key, so the mapping is explicit rather than derived.
const LIST_LABEL_KEYS = {
  field_titles: 'field_titles',
  safety_titles: 'safety_titles',
  contractors: 'contractors',
  subcontractors: 'subcontractors',
  employment_status: 'employment_statuses',
  legal_permission: 'legal_permissions',
};

// ── small helpers ───────────────────────────────────────────────────────────

function activeTab() {
  return TABS.includes(UI.setTab) ? UI.setTab : 'users';
}

// meta.field_sync, tolerating a JSON file written before the key existed. Always
// spread this when updating one of its fields — updateMeta merges shallowly, so
// a partial field_sync object would drop the siblings.
function fieldSync() {
  return DATA.meta.field_sync || {};
}

// The employee_id addEmployee() would assign next — same construction as there,
// shown so the admin can see what a prefix change actually produces.
function nextEmployeeId() {
  return `${DATA.meta.employee_id_prefix || ''}${String(DATA.meta.next_employee_number || 1).padStart(4, '0')}`;
}

function adminCount(users) {
  return users.filter((u) => u.role === 'admin').length;
}

// Next free 'u###' id. Ids that don't match that shape (e.g. the bootstrap
// admin's) are ignored rather than parsed.
function makeUserId(users) {
  let max = 0;
  for (const u of users) {
    const m = /^u(\d+)$/.exec(u.user_id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return 'u' + String(max + 1).padStart(3, '0');
}

// ── tab: users ──────────────────────────────────────────────────────────────

function roleBadgeHtml(role) {
  const isAdmin = role === 'admin';
  return `<span class="badge ${isAdmin ? 'role-admin' : 'role-officer'}">${t(isAdmin ? 'role_admin' : 'role_officer')}</span>`;
}

function userRowHtml(u) {
  return `
    <tr>
      <td><b>${escapeHtml(u.username)}</b></td>
      <td>${escapeHtml(u.display_name)}</td>
      <td>${roleBadgeHtml(u.role)}</td>
      <td>${u.can_do_site_check ? '✓' : '—'}</td>
      <td>
        <input type="checkbox" data-action="toggle-active" data-user-id="${escapeHtml(u.user_id)}"
               ${u.active ? 'checked' : ''} aria-label="${t('col_active')}">
      </td>
      <td class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="edit-user" data-user-id="${escapeHtml(u.user_id)}">${t('edit')}</button>
        <button class="btn btn-danger btn-sm" data-action="delete-user" data-user-id="${escapeHtml(u.user_id)}">${t('delete')}</button>
      </td>
    </tr>`;
}

function usersPanelHtml() {
  return `
    <div class="settings-panel">
      <div class="panel-head">
        <h3>${t('settings_tab_users')}</h3>
        <button class="btn btn-primary btn-sm" data-action="add-user">+ ${t('add_user')}</button>
      </div>
      <table class="tbl">
        <thead>
          <tr>
            <th>${t('username')}</th>
            <th>${t('col_display_name')}</th>
            <th>${t('col_role')}</th>
            <th>${t('col_site_check')}</th>
            <th>${t('col_active')}</th>
            <th>${t('col_actions')}</th>
          </tr>
        </thead>
        <tbody>${DATA.users.map(userRowHtml).join('')}</tbody>
      </table>
    </div>`;
}

// ── tab: lists ──────────────────────────────────────────────────────────────

function listsPanelHtml() {
  const editors = LIST_FIELD_KEYS.map((key) => `
    <div class="list-editor">
      <div class="field">
        <label for="list-${key}">${t(LIST_LABEL_KEYS[key] || key)}</label>
        <textarea id="list-${key}" data-list="${key}" spellcheck="false">${escapeHtml(getFieldOptions(key).join('\n'))}</textarea>
      </div>
    </div>`).join('');

  return `
    <div class="settings-panel">
      <p class="panel-intro">${t('lists_intro')}</p>
      <div class="two-col">${editors}</div>
      <div class="settings-actions">
        <button class="btn btn-primary" data-action="save-lists">✓ ${t('save')}</button>
      </div>
    </div>`;
}

// ── tab: thresholds ─────────────────────────────────────────────────────────

function numberFieldHtml(id, labelKey, value) {
  return `
    <div class="field">
      <label for="${id}">${t(labelKey)}</label>
      <input type="number" id="${id}" min="0" step="1" value="${escapeHtml(value)}">
    </div>`;
}

function thresholdsPanelHtml() {
  const thr = DATA.meta.warning_thresholds || {};
  return `
    <div class="settings-panel">
      <h3>${t('settings_tab_thresholds')}</h3>
      <p class="panel-intro">${t('thresholds_intro')}</p>
      <div class="thresh-grid">
        ${numberFieldHtml('thr-urgent', 'threshold_urgent', thr.urgent_days)}
        ${numberFieldHtml('thr-soon', 'threshold_soon', thr.soon_days)}
        ${numberFieldHtml('thr-plan', 'threshold_plan', thr.plan_days)}
      </div>
      <div class="thresh-grid">
        ${numberFieldHtml('thr-backup', 'backup_reminder', DATA.meta.backup_reminder_days)}
        ${numberFieldHtml('thr-stale', 'sync_max_stale', fieldSync().max_stale_days)}
        <div></div>
      </div>
      <div class="settings-actions">
        <button class="btn btn-primary" data-action="save-thresholds">✓ ${t('save')}</button>
      </div>
    </div>`;
}

// ── tab: data file ──────────────────────────────────────────────────────────

function dataCardHtml(titleKey, descKey, actionsHtml) {
  return `
    <div class="data-card">
      <div class="data-card-title">${t(titleKey)}</div>
      <div class="data-card-desc">${t(descKey)}</div>
      <div class="data-card-actions">${actionsHtml}</div>
    </div>`;
}

// A text setting under the action cards: input + explanatory hint. `mono` is for
// values that are pasted, not read — URLs, ids, and paths.
function settingInputHtml(id, labelKey, value, hintKey, mono) {
  return `
    <div class="field">
      <label for="${id}">${t(labelKey)}</label>
      <input type="text" id="${id}" class="${mono ? 'mono-input' : ''}" value="${escapeHtml(value || '')}">
      ${hintKey ? `<div class="hint">${t(hintKey)}</div>` : ''}
    </div>`;
}

function dataPanelHtml() {
  const fs = fieldSync();
  return `
    <div class="settings-panel">
      <h3>${t('data_ops')}</h3>
      <div class="two-col">
        ${dataCardHtml('import_excel', 'import_excel_desc', `
          <label class="btn btn-primary btn-sm">
            ${t('choose_file')}
            <input type="file" accept=".xlsx,.xls" data-action="import-file" hidden>
          </label>`)}
        ${dataCardHtml('download_backup', 'download_backup_desc', `
          <button class="btn btn-primary btn-sm" data-action="download-backup">↓ ${t('download_backup')}</button>`)}
        ${dataCardHtml('restore_backup', 'restore_backup_desc', `
          <label class="btn btn-ghost btn-sm">
            ${t('choose_file')}
            <input type="file" accept=".json" data-action="restore-file" hidden>
          </label>`)}
        ${dataCardHtml('publish_snapshot', 'publish_snapshot_desc', `
          <button class="btn btn-primary btn-sm" data-action="publish-snapshot">↓ ${t('publish_snapshot')}</button>`)}
      </div>

      <div class="settings-inputs">
        ${settingInputHtml('set-endpoint', 'apps_script_url', fs.endpoint_url, 'apps_script_hint', true)}
        ${settingInputHtml('set-drive-id', 'drive_file_id', fs.drive_file_id, 'drive_file_id_hint', true)}
        ${settingInputHtml('set-base-path', 'server_base_path', DATA.meta.server_base_path, 'server_base_path_hint', true)}
        ${settingInputHtml('set-prefix', 'emp_id_prefix', DATA.meta.employee_id_prefix, null, false)}
        <div class="hint">${t('next_number_preview', { id: escapeHtml(nextEmployeeId()) })}</div>
      </div>
    </div>`;
}

// ── page ────────────────────────────────────────────────────────────────────

export function renderSettingsPage() {
  const tab = activeTab();

  const tabsHtml = TABS.map((x) => `
    <button class="tab ${tab === x ? 'active' : ''}" data-tab="${x}">${t('settings_tab_' + x)}</button>
  `).join('');

  const panels = {
    users: usersPanelHtml,
    lists: listsPanelHtml,
    thresholds: thresholdsPanelHtml,
    data: dataPanelHtml,
  };

  return `
    <div class="tabs">${tabsHtml}</div>
    ${panels[tab]()}`;
}

// ── modals ──────────────────────────────────────────────────────────────────

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

// Add/edit user modal. `existing` is null for a new user. The password field is
// intentionally never pre-filled: on edit, blank means "keep what is stored".
function openUserModal(existing) {
  const isNew = !existing;
  const u = existing || { role: 'officer', active: true, can_do_site_check: true };

  const roleOption = (value) =>
    `<option value="${value}"${u.role === value ? ' selected' : ''}>${t('role_' + value)}</option>`;

  const body = `
    <div class="field">
      <label for="us-username">${t('username')}</label>
      <input type="text" id="us-username" value="${escapeHtml(u.username || '')}" autocomplete="off">
    </div>
    <div class="field">
      <label for="us-password">${t('password')}</label>
      <input type="password" id="us-password" autocomplete="new-password"
             placeholder="${isNew ? '' : t('password_blank_hint')}">
    </div>
    <div class="field">
      <label for="us-display">${t('field_display_name')}</label>
      <input type="text" id="us-display" value="${escapeHtml(u.display_name || '')}">
    </div>
    <div class="field">
      <label for="us-role">${t('field_role')}</label>
      <select id="us-role">${roleOption('admin')}${roleOption('officer')}</select>
    </div>
    <div class="field inline">
      <input type="checkbox" id="us-active" ${u.active ? 'checked' : ''}>
      <label for="us-active">${t('field_active')}</label>
    </div>
    <div class="field inline">
      <input type="checkbox" id="us-sitecheck" ${u.can_do_site_check ? 'checked' : ''}>
      <label for="us-sitecheck">${t('field_site_check')}</label>
    </div>
    <div id="us-err"></div>`;

  const foot = `
    <button class="btn btn-ghost btn-sm" data-modal-action="cancel">${t('cancel')}</button>
    <button class="btn btn-primary btn-sm" data-modal-action="save">${t('save')}</button>`;

  const close = openModal(t(isNew ? 'new_user' : 'edit_user'), body, foot);

  const $ = (id) => document.getElementById(id);
  const showError = (msg) => { $('us-err').innerHTML = `<div class="err">${msg}</div>`; };

  // Site check only means anything for officers (the Apps Script requires
  // role==='officer' && can_do_site_check), so the box follows the role.
  $('us-role').addEventListener('change', (e) => {
    $('us-sitecheck').checked = e.target.value === 'officer';
  });

  $('us-username').focus();
  document.querySelector('[data-modal-action="cancel"]').addEventListener('click', close);
  document.querySelector('[data-modal-action="save"]').addEventListener('click', () => {
    const username = $('us-username').value.trim();
    const password = $('us-password').value;
    const role = $('us-role').value;

    if (!username) return showError(t('err_username_required'));

    const taken = DATA.users.some(
      (x) => x.username.toLowerCase() === username.toLowerCase() && (isNew || x.user_id !== u.user_id)
    );
    if (taken) return showError(t('err_username_duplicate', { username: escapeHtml(username) }));

    if (isNew && !password) return showError(t('err_password_required'));

    // Demoting the only admin locks everyone out of the desktop app just as
    // surely as deleting them, so it is blocked on the same rule (CLAUDE.md 6).
    const demotingLastAdmin = !isNew && u.role === 'admin' && role !== 'admin' && adminCount(DATA.users) <= 1;
    if (demotingLastAdmin) return showError(t('err_last_admin'));

    const fields = {
      username,
      role,
      display_name: $('us-display').value.trim(),
      active: $('us-active').checked,
      can_do_site_check: $('us-sitecheck').checked,
    };

    if (isNew) {
      const created = {
        user_id: makeUserId(DATA.users),
        ...fields,
        password,
        created_at: todayISO(),
        created_by: CURRENT_USER ? CURRENT_USER.username : 'system',
      };
      saveUsers([...DATA.users, created]);
    } else {
      // A blank password field leaves the stored one untouched.
      const updated = { ...u, ...fields, password: password || u.password };
      saveUsers(DATA.users.map((x) => (x.user_id === u.user_id ? updated : x)));
    }

    close();
    render();
    showToast(t(isNew ? 'toast_user_added' : 'toast_user_saved', { name: fields.display_name || username }), 'success');
  });
}

// ── excel import preview ────────────────────────────────────────────────────

// The per-row Action select. The options offered depend on what is wrong with
// the row, and the default (first option) is the safe choice in each case:
// duplicates default to Skip, everything else to Import.
function actionSelectHtml(row, index) {
  const opt = (value, label) =>
    `<option value="${value}"${row.action === value ? ' selected' : ''}>${label}</option>`;

  let options;
  if (row.status === 'duplicate') {
    options = opt('skip', t('act_skip')) + opt('overwrite', t('act_overwrite')) + opt('import', t('act_add_new'));
  } else if (row.status === 'unknown_sub') {
    options = opt('import', t('act_add_sub_import', { value: escapeHtml(row.unknown_sub_value) })) + opt('skip', t('act_skip'));
  } else if (row.status === 'unknown_title') {
    options = opt('import', t('act_add_title_import', { value: escapeHtml(row.unknown_title_value) })) + opt('skip', t('act_skip'));
  } else {
    options = opt('import', t('act_import')) + opt('skip', t('act_skip'));
  }

  return `<select data-row="${index}" class="row-action">${options}</select>`;
}

function previewRowHtml(row, index) {
  const reasons = row.reasons.length
    ? `<div class="row-reasons">${row.reasons.map(escapeHtml).join(' · ')}</div>`
    : '';
  return `
    <tr>
      <td>${row.excel_row}</td>
      <td>
        ${escapeHtml(row.employee_partial.name)}
        <div class="emp-id-sub">${escapeHtml(row.employee_partial.national_id)}</div>
      </td>
      <td>${teamBadgeHtml(row.team)}</td>
      <td>
        <span class="badge ${row.status === 'new' ? 'st-valid' : row.status === 'duplicate' ? 'st-urgent' : 'st-soon'}">${t('status_' + row.status)}</span>
        ${reasons}
      </td>
      <td>${actionSelectHtml(row, index)}</td>
    </tr>`;
}

function summaryHtml(summary) {
  // "Will skip" keeps the neutral base chip — it is a count, not a problem.
  const chip = (labelKey, n, cls = '') =>
    `<span class="sum-chip ${cls}"><b>${n}</b> ${t(labelKey)}</span>`;
  return `
    <div class="import-summary">
      ${chip('summary_new', summary.new, 'sum-new')}
      ${chip('summary_duplicates', summary.duplicates, 'sum-dup')}
      ${chip('summary_unknowns', summary.unknowns, 'sum-unknown')}
      ${chip('summary_skipped', summary.skipped)}
    </div>`;
}

function warningsHtml(warnings) {
  if (!warnings.length) return '';
  return `
    <details class="import-warnings">
      <summary>${t('import_warnings', { n: warnings.length })}</summary>
      <ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>
    </details>`;
}

// Opens the review table for a parsed workbook. `preview.rows` is the single
// source of truth here: the selects write straight back into it, and Confirm
// hands the same object to commitImport — so what the admin sees is exactly what
// gets written. Cancel drops it and nothing was ever mutated.
function openImportPreviewModal(preview, warnings) {
  const body = `
    <p class="panel-intro">${t('import_preview_intro')}</p>
    ${summaryHtml(preview.summary)}
    ${warningsHtml(warnings)}
    <div class="import-table-wrap">
      <table class="tbl">
        <thead>
          <tr>
            <th>${t('col_row')}</th>
            <th>${t('col_name')}</th>
            <th>${t('team_label')}</th>
            <th>${t('col_status')}</th>
            <th>${t('col_action')}</th>
          </tr>
        </thead>
        <tbody>${preview.rows.map(previewRowHtml).join('')}</tbody>
      </table>
    </div>`;

  const foot = `
    <button class="btn btn-ghost btn-sm" data-modal-action="cancel">${t('cancel')}</button>
    <button class="btn btn-primary btn-sm" data-modal-action="confirm">${t('confirm_import')}</button>`;

  const close = openModal(t('import_preview_title'), body, foot);
  document.querySelector('.modal').classList.add('modal-lg');

  // Each select writes its row's action back into the preview, and the summary
  // re-counts so "Will skip" always matches the table.
  document.querySelectorAll('.row-action').forEach((sel) => {
    sel.addEventListener('change', () => {
      preview.rows[Number(sel.dataset.row)].action = sel.value;
      preview.summary = summarizePreview(preview.rows);
      const sums = document.querySelector('.import-summary');
      if (sums) sums.outerHTML = summaryHtml(preview.summary);
    });
  });

  document.querySelector('[data-modal-action="cancel"]').addEventListener('click', close);
  document.querySelector('[data-modal-action="confirm"]').addEventListener('click', () => {
    const res = commitImport(preview, CURRENT_USER);
    close();
    render();
    if (!res.added && !res.updated) {
      showToast(t('toast_import_none'), 'error');
      return;
    }
    showToast(t('toast_import_done', { added: res.added, updated: res.updated }), 'success');
  });
}

// Reads the picked workbook and opens the preview. Parsing happens off the
// stored data entirely — DATA is untouched until Confirm.
function openExcelImportPreview(file) {
  const reader = new FileReader();
  reader.onerror = () => showToast(t('import_parse_error'), 'error');
  reader.onload = () => {
    const parsed = parseExcelWorkbook(reader.result);
    const preview = buildImportPreview(parsed, DATA.employees, DATA.meta.field_options);

    if (!preview.rows.length) {
      // No rows at all: the warnings are the whole story, so show the first one
      // rather than an empty table.
      showToast(parsed.warnings[0] || t('import_no_rows'), 'error');
      return;
    }
    openImportPreviewModal(preview, parsed.warnings);
  };
  reader.readAsArrayBuffer(file);
}

// ── events ──────────────────────────────────────────────────────────────────

// Reads a picked file as text and hands it to `onText`. Resets the input so the
// same file can be picked twice in a row (a change event needs a changed value).
function readTextFile(input, onText) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => onText(String(reader.result));
  reader.onerror = () => showToast(t('load_err_generic'), 'error');
  reader.readAsText(file);
  input.value = '';
}

function bindUsersTabEvents(app) {
  const on = (action, handler) => {
    app.querySelectorAll(`[data-action="${action}"]`).forEach((el) => {
      el.addEventListener('click', () => handler(el.dataset.userId));
    });
  };

  const byId = (id) => DATA.users.find((x) => x.user_id === id);

  const addBtn = app.querySelector('[data-action="add-user"]');
  if (addBtn) addBtn.addEventListener('click', () => openUserModal(null));

  on('edit-user', (id) => {
    const user = byId(id);
    if (user) openUserModal(user);
  });

  on('delete-user', (id) => {
    const user = byId(id);
    if (!user) return;
    if (user.role === 'admin' && adminCount(DATA.users) <= 1) {
      showToast(t('err_last_admin'), 'error');
      return;
    }
    const name = user.display_name || user.username;
    confirmModal(
      t('confirm_delete_user_title'),
      `<p>${t('confirm_delete_user_msg', { name: escapeHtml(name), username: escapeHtml(user.username) })}</p>`,
      t('delete'),
      'btn-danger',
      () => {
        saveUsers(DATA.users.filter((x) => x.user_id !== id));
        render();
        showToast(t('toast_user_deleted', { name }), 'success');
      }
    );
  });

  app.querySelectorAll('[data-action="toggle-active"]').forEach((box) => {
    box.addEventListener('change', (e) => {
      const id = box.dataset.userId;
      saveUsers(DATA.users.map((x) => (x.user_id === id ? { ...x, active: e.target.checked } : x)));
      render();
    });
  });
}

function bindListsTabEvents(app) {
  const save = app.querySelector('[data-action="save-lists"]');
  if (!save) return;
  save.addEventListener('click', () => {
    const next = { ...(DATA.meta.field_options || {}) };
    LIST_FIELD_KEYS.forEach((key) => {
      const ta = app.querySelector(`[data-list="${key}"]`);
      if (!ta) return;
      next[key] = ta.value.split('\n').map((s) => s.trim()).filter(Boolean);
    });
    updateMeta({ field_options: next });
    render();
    showToast(t('toast_lists_updated'), 'success');
  });
}

function bindThresholdsTabEvents(app) {
  const save = app.querySelector('[data-action="save-thresholds"]');
  if (!save) return;

  // A blank or negative box keeps the stored value rather than silently
  // becoming 0, which would mark every certificate urgent.
  const num = (id, fallback) => {
    const el = app.querySelector('#' + id);
    if (!el) return fallback;
    const n = parseInt(el.value, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  save.addEventListener('click', () => {
    const thr = DATA.meta.warning_thresholds || {};
    updateMeta({
      warning_thresholds: {
        ...thr,
        urgent_days: num('thr-urgent', thr.urgent_days),
        soon_days: num('thr-soon', thr.soon_days),
        plan_days: num('thr-plan', thr.plan_days),
      },
      backup_reminder_days: num('thr-backup', DATA.meta.backup_reminder_days),
      field_sync: { ...fieldSync(), max_stale_days: num('thr-stale', fieldSync().max_stale_days) },
    });
    render();
    showToast(t('toast_thresholds_updated'), 'success');
  });
}

function bindDataTabEvents(app) {
  // Text settings commit on change (blur/Enter), then re-render so the topbar's
  // unsaved-changes indicator — and the next-employee-id preview — stay honest.
  const onChange = (id, apply) => {
    const el = app.querySelector('#' + id);
    if (el) el.addEventListener('change', () => { apply(el.value.trim()); render(); });
  };

  onChange('set-endpoint', (v) => updateMeta({ field_sync: { ...fieldSync(), endpoint_url: v } }));
  onChange('set-drive-id', (v) => updateMeta({ field_sync: { ...fieldSync(), drive_file_id: v } }));
  onChange('set-base-path', (v) => updateMeta({ server_base_path: v }));
  onChange('set-prefix', (v) => updateMeta({ employee_id_prefix: v }));

  const importInput = app.querySelector('[data-action="import-file"]');
  if (importInput) {
    importInput.addEventListener('change', () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = '';
      if (file) openExcelImportPreview(file);
    });
  }

  const download = app.querySelector('[data-action="download-backup"]');
  if (download) {
    download.addEventListener('click', () => {
      exportJSON(CURRENT_USER);
      render();
      showToast(t('save_to_drive_note'), 'success');
    });
  }

  const restore = app.querySelector('[data-action="restore-file"]');
  if (restore) {
    restore.addEventListener('change', () => {
      readTextFile(restore, (text) => {
        // Parsed here first so the confirmation can state what is in the file.
        // loadJSON() re-parses and re-validates — it owns installing the data.
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          showToast(t('load_err_json'), 'error');
          return;
        }
        if (!parsed || !parsed.meta || !Array.isArray(parsed.users) || !Array.isArray(parsed.employees)) {
          showToast(t('load_err_shape'), 'error');
          return;
        }

        const counts = { employees: parsed.employees.length, users: parsed.users.length };
        confirmModal(
          t('confirm_restore_title'),
          `<p>${t('confirm_restore_msg', counts)}</p>`,
          t('restore_backup'),
          'btn-primary',
          () => {
            const res = loadJSON(text);
            if (!res.ok) {
              showToast(t(res.error === 'invalid_json' ? 'load_err_json' : 'load_err_shape'), 'error');
              return;
            }
            render();
            showToast(t('toast_restored', { employees: counts.employees }), 'success');
          }
        );
      });
    });
  }

  const publish = app.querySelector('[data-action="publish-snapshot"]');
  if (publish) {
    publish.addEventListener('click', () => {
      publishFieldSnapshot();
      render();
      showToast(t('toast_snapshot_published'), 'success');
    });
  }
}

export function bindSettingsPageEvents() {
  const app = document.getElementById('app');
  if (!app) return;

  app.querySelectorAll('.tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      UI.setTab = btn.dataset.tab;
      render();
    });
  });

  const binders = {
    users: bindUsersTabEvents,
    lists: bindListsTabEvents,
    thresholds: bindThresholdsTabEvents,
    data: bindDataTabEvents,
  };
  binders[activeTab()](app);
}
