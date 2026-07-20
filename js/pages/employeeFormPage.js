// employeeFormPage.js — the add/edit employee form. One job: build a draft
// employee record from the admin's input, validate it, and hand it to
// dataActions. No compliance derivation, no persistence logic of its own.
//
// Mode comes from the route (see router.js):
//   'field/new' / 'safety/new'  -> new mode, team taken from the route
//   'employee/edit' + param id  -> edit mode, draft cloned from the record
//
// Every input is described by a field list (PERSONAL_FIELDS / QUAL_FIELDS) and
// rendered from it, so adding a field means editing one list.

import { DATA, ROUTE, ROUTE_PARAM, CURRENT_USER } from '../state.js';
import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { render } from '../render.js';
import { applicableCerts, CERT_LABEL_KEYS, ALL_CERT_KEYS, getFieldOptions } from '../constants/fields.js';
import { teamBadgeHtml } from '../components/badge.js';
import { escapeHtml } from '../utils/format.js';
import { showToast } from '../components/toast.js';
import { addEmployee, updateEmployee } from '../data/dataActions.js';

// ── draft state ─────────────────────────────────────────────────────────────

// The in-progress employee record. Module-level so typed values survive the
// re-renders triggered by validation, language switches, and theme changes.
let formDraft = null;
// The route key the draft was built for — entering the form on a different route
// rebuilds it. Cleared by clearEmployeeFormDraft() on leaving the form.
let draftKey = null;
// Field path -> error message, shown inline under the input. Reset on each save.
let formErrors = {};

const FORM_ROUTES = ['field/new', 'safety/new', 'employee/edit'];

export function isEmployeeFormRoute(route) {
  return FORM_ROUTES.includes(route);
}

// Discards the draft. render.js calls this whenever it draws a non-form route,
// so returning to the form later always starts clean rather than resuming the
// last person's half-typed record.
export function clearEmployeeFormDraft() {
  formDraft = null;
  draftKey = null;
  formErrors = {};
}

function isNewMode() {
  return ROUTE === 'field/new' || ROUTE === 'safety/new';
}

// A complete, empty record matching the JSON schema in CLAUDE.md. Every cert key
// is present even when this team never uses it — the shape is constant, only
// what the form shows varies by team.
function blankEmployee(team) {
  const certificates = {};
  ALL_CERT_KEYS.forEach((k) => { certificates[k] = { expiry_date: '', file_link: '', na: false, suspended: false }; });

  return {
    national_id: '',
    name: '',
    team,
    personal: {
      title: '',
      contractor: getFieldOptions('contractors')[0] || '',
      subcontractor: '',
      hired_date: '',
      employment_status: 'Active',
      legal_permission: 'Pending',
      archived: false,
      archived_at: '',
      archived_by: '',
    },
    certificates,
    qualifications: { nebosh_igc: false, iso_45001: false, osha: false },
  };
}

// Clone of an existing record for editing. employee_id, meta, and
// renewal_history are deliberately left out of the draft: they are not editable
// here, and renewal_history in particular must not travel back through
// updateEmployee — it appends to the live array before applying the draft, so a
// stale copy in the payload would overwrite the entry it just added.
function draftFromEmployee(emp) {
  const certificates = {};
  ALL_CERT_KEYS.forEach((k) => {
    const c = (emp.certificates && emp.certificates[k]) || {};
    certificates[k] = { expiry_date: c.expiry_date || '', file_link: c.file_link || '', na: !!c.na, suspended: !!c.suspended };
  });

  return {
    national_id: emp.national_id || '',
    name: emp.name || '',
    team: emp.team,
    personal: { ...emp.personal },
    certificates,
    qualifications: { ...emp.qualifications },
  };
}

// Builds the draft once per page entry; returns false if the route is unusable
// (edit mode pointing at an id that no longer exists).
function ensureDraft() {
  const key = ROUTE + ':' + (ROUTE_PARAM || '');
  if (formDraft && draftKey === key) return true;

  if (isNewMode()) {
    formDraft = blankEmployee(ROUTE === 'safety/new' ? 'safety' : 'field');
  } else {
    const emp = DATA.employees.find((e) => e.employee_id === ROUTE_PARAM);
    if (!emp) return false;
    formDraft = draftFromEmployee(emp);
  }
  draftKey = key;
  formErrors = {};
  return true;
}

// ── path helpers ────────────────────────────────────────────────────────────
// Inputs carry data-path="personal.title" etc., so one generic reader/writer
// serves every field regardless of section.

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

// ── field lists ─────────────────────────────────────────────────────────────

// `options` is the getFieldOptions key, or a function of team where it varies.
const PERSONAL_FIELDS = [
  { path: 'name', labelKey: 'field_name', type: 'text', required: true },
  { path: 'national_id', labelKey: 'field_natid', type: 'text', required: true },
  { path: 'personal.title', labelKey: 'field_title', type: 'select', allowEmpty: true,
    options: (team) => (team === 'safety' ? 'safety_titles' : 'field_titles') },
  { path: 'personal.contractor', labelKey: 'field_contractor', type: 'select', options: 'contractors' },
  { path: 'personal.subcontractor', labelKey: 'field_sub', type: 'select', allowEmpty: true, options: 'subcontractors' },
  { path: 'personal.hired_date', labelKey: 'field_hired', type: 'date' },
  { path: 'personal.employment_status', labelKey: 'field_emp_status', type: 'select', options: 'employment_status' },
  { path: 'personal.legal_permission', labelKey: 'field_legal', type: 'select', options: 'legal_permission' },
];

const QUAL_FIELDS = [
  { path: 'qualifications.nebosh_igc', labelKey: 'qual_nebosh' },
  { path: 'qualifications.iso_45001', labelKey: 'qual_iso' },
  { path: 'qualifications.osha', labelKey: 'qual_osha' },
];

// ── input renderers ─────────────────────────────────────────────────────────

function errorHtml(path) {
  return formErrors[path] ? `<div class="err">${escapeHtml(formErrors[path])}</div>` : '';
}

function inputHtml(field, team) {
  const value = getPath(formDraft, field.path);
  const label = `${t(field.labelKey)}${field.required ? ' *' : ''}`;
  const invalid = formErrors[field.path] ? ' input-invalid' : '';
  let control;

  if (field.type === 'select') {
    const key = typeof field.options === 'function' ? field.options(team) : field.options;
    const opts = getFieldOptions(key);
    // A stored value the admin has since removed from the list must still be
    // selectable, or simply opening the form would silently reassign it.
    const stale = value && !opts.includes(value)
      ? `<option value="${escapeHtml(value)}" selected>${escapeHtml(value)}</option>`
      : '';
    const empty = field.allowEmpty
      ? `<option value=""${!value ? ' selected' : ''}>${t('select_none')}</option>`
      : '';
    control = `<select data-path="${field.path}" class="${invalid.trim()}">
      ${empty}${stale}
      ${opts.map((o) => `<option value="${escapeHtml(o)}"${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}
    </select>`;
  } else {
    control = `<input type="${field.type === 'date' ? 'date' : 'text'}"
      data-path="${field.path}"
      class="${invalid.trim()}"
      value="${escapeHtml(value || '')}">`;
  }

  return `<div class="field">
    <label>${label}</label>
    ${control}
    ${errorHtml(field.path)}
  </div>`;
}

// One certificate: expiry date + the external link string, plus the "not needed"
// (N/A) checkbox. The app never touches the PDF itself (CLAUDE.md rule 15) —
// file_link is just text we store. When N/A is ticked the date/link are disabled
// (the block dims); the toggle is wired live in bindEmployeeFormPageEvents.
function certBlockHtml(key) {
  const c = formDraft.certificates[key] || {};
  const na = !!c.na;
  const suspended = !!c.suspended;
  const dis = na ? ' disabled' : '';
  const cls = `cert-edit${na ? ' cert-edit-na' : ''}${suspended ? ' cert-edit-suspended' : ''}`;
  return `<div class="${cls}" data-cert-block="${key}">
    <div class="cert-edit-name">${t(CERT_LABEL_KEYS[key])}</div>
    <div class="field">
      <label>${t('expiry_date')}</label>
      <input type="date" data-path="certificates.${key}.expiry_date" value="${escapeHtml(c.expiry_date || '')}"${dis}>
    </div>
    <div class="field last">
      <label>${t('cert_link')}</label>
      <input type="text" data-path="certificates.${key}.file_link"
        placeholder="https://drive.google.com/..." value="${escapeHtml(c.file_link || '')}"${dis}>
    </div>
    <label class="check cert-na-check">
      <input type="checkbox" data-path="certificates.${key}.na" data-cert-na="${key}"${na ? ' checked' : ''}>
      ${t('cert_na_label')}
    </label>
    <label class="check cert-suspended-check">
      <input type="checkbox" data-path="certificates.${key}.suspended" data-cert-suspended="${key}"${suspended ? ' checked' : ''}>
      ${t('cert_suspended_label')}
    </label>
  </div>`;
}

// ── topbar ──────────────────────────────────────────────────────────────────

export function employeeFormTopbar() {
  if (!ensureDraft()) return { title: escapeHtml(ROUTE_PARAM || ''), sub: '', actions: '' };

  const actions = `
    <button class="btn btn-ghost btn-sm" data-action="cancel">${t('cancel')}</button>
    <button class="btn btn-primary btn-sm" data-action="save">✓ ${t('save')}</button>`;

  return {
    title: isNewMode() ? t('add_employee') : escapeHtml(formDraft.name || ''),
    sub: isNewMode() ? '' : ROUTE_PARAM,
    actions,
  };
}

// ── page ────────────────────────────────────────────────────────────────────

export function renderEmployeeFormPage() {
  if (!ensureDraft()) {
    return `<div class="not-found">
      <div>${t('emp_not_found')}</div>
      <button class="btn btn-ghost btn-sm" data-action="back-dashboard">${t('back')}</button>
    </div>`;
  }

  const team = formDraft.team;

  const qualsHtml = team === 'safety'
    ? `
      <div class="section-head">${t('section_quals')}</div>
      <div class="card">
        <div class="qual-checks">
          ${QUAL_FIELDS.map((f) => `<label class="check">
            <input type="checkbox" data-path="${f.path}"${getPath(formDraft, f.path) ? ' checked' : ''}>
            ${t(f.labelKey)}
          </label>`).join('')}
        </div>
      </div>`
    : '';

  // The team tag is display-only: team cannot change after creation (a move
  // means archive + create new), so the form never offers it as an input.
  return `
    <div class="detail-badges">
      ${teamBadgeHtml(team)}
    </div>

    <div class="section-head">${t('section_personal')}</div>
    <div class="card">
      <div class="detail-grid">
        ${PERSONAL_FIELDS.map((f) => inputHtml(f, team)).join('')}
      </div>
    </div>

    <div class="section-head">${t('section_certs')}</div>
    <div class="card">
      <div class="two-col">
        ${applicableCerts(formDraft).map(certBlockHtml).join('')}
      </div>
    </div>

    ${qualsHtml}`;
}

// ── validation ──────────────────────────────────────────────────────────────

// Fills formErrors and returns true when the draft is saveable. Team is implied
// by the route, so it needs no check of its own.
function validateDraft() {
  formErrors = {};

  const name = (formDraft.name || '').trim();
  const natid = (formDraft.national_id || '').trim();

  if (!name) formErrors.name = t('err_name_required');
  if (!natid) formErrors.national_id = t('err_natid_required');

  // National ID is not the primary key, but it is how staff look people up, so
  // duplicates are blocked. Checked on edit too (excluding this record), since
  // an edit can introduce a clash just as easily as a new record can.
  if (natid) {
    const clash = DATA.employees.find(
      (e) => e.national_id === natid && e.employee_id !== ROUTE_PARAM
    );
    if (clash) {
      formErrors.national_id = t('err_natid_duplicate', { natid, name: clash.name });
    }
  }

  return Object.keys(formErrors).length === 0;
}

// ── events ──────────────────────────────────────────────────────────────────

// Reads every rendered input back into the draft. The live listeners below
// already keep it current, so this is the safety net for re-renders triggered
// from outside the page (language switch, theme change).
function syncFormDraft() {
  if (!formDraft) return;
  document.querySelectorAll('#app [data-path]').forEach((el) => {
    setPath(formDraft, el.dataset.path, el.type === 'checkbox' ? el.checked : el.value);
  });
}

// The list route this draft belongs to.
function listRoute() {
  return formDraft && formDraft.team === 'safety' ? 'safety' : 'field';
}

function onSave() {
  syncFormDraft();

  if (!validateDraft()) {
    render();
    showToast(t('err_fix_form'), 'error');
    return;
  }

  // Trim the two free-text fields so lookups are not defeated by stray spaces.
  formDraft.name = formDraft.name.trim();
  formDraft.national_id = formDraft.national_id.trim();

  if (isNewMode()) {
    const created = addEmployee(formDraft, CURRENT_USER);
    const name = created.name;
    clearEmployeeFormDraft();
    go('employee', created.employee_id);
    showToast(t('toast_employee_added', { name }), 'success');
    return;
  }

  // Edit: report which cert expiries actually moved so dataActions can append
  // the renewal_history entries. Comparison is against the live record, before
  // the draft is applied over it.
  const emp = DATA.employees.find((e) => e.employee_id === ROUTE_PARAM);
  if (!emp) {
    clearEmployeeFormDraft();
    go('dashboard');
    return;
  }

  const changedCertKeys = ALL_CERT_KEYS.filter((k) => {
    const before = (emp.certificates && emp.certificates[k] && emp.certificates[k].expiry_date) || '';
    const after = (formDraft.certificates[k] && formDraft.certificates[k].expiry_date) || '';
    return before !== after;
  });

  const id = emp.employee_id;
  const name = formDraft.name;
  updateEmployee(id, formDraft, CURRENT_USER, changedCertKeys);
  clearEmployeeFormDraft();
  go('employee', id);
  showToast(t('toast_employee_saved', { name }), 'success');
}

export function bindEmployeeFormPageEvents() {
  const backToDashboard = document.querySelector('[data-action="back-dashboard"]');
  if (backToDashboard) {
    backToDashboard.addEventListener('click', () => go('dashboard'));
    return; // Not-found page has nothing else to wire.
  }
  if (!formDraft) return;

  // Live-write every input into the draft so nothing is lost if something
  // outside this page triggers a re-render mid-typing.
  document.querySelectorAll('#app [data-path]').forEach((el) => {
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      setPath(formDraft, el.dataset.path, el.type === 'checkbox' ? el.checked : el.value);
    });
  });

  // N/A checkboxes: the generic listener above already writes the flag into the
  // draft; here we also dim the block and disable its date/link inputs live, so
  // the "not needed" state reads clearly without a full re-render.
  document.querySelectorAll('[data-cert-na]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const block = document.querySelector(`[data-cert-block="${cb.dataset.certNa}"]`);
      if (!block) return;
      block.classList.toggle('cert-edit-na', cb.checked);
      block.querySelectorAll('input[type="date"], input[type="text"]').forEach((inp) => {
        inp.disabled = cb.checked;
      });
    });
  });

  // "Suspended course" checkboxes: purely visual — the generic listener writes
  // the flag into the draft; here we tint the whole block yellow live, mirroring
  // the N/A colouring but without disabling the date/link inputs.
  document.querySelectorAll('[data-cert-suspended]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const block = document.querySelector(`[data-cert-block="${cb.dataset.certSuspended}"]`);
      if (block) block.classList.toggle('cert-edit-suspended', cb.checked);
    });
  });

  const cancel = document.querySelector('[data-action="cancel"]');
  if (cancel) {
    cancel.addEventListener('click', () => {
      const target = isNewMode() ? listRoute() : 'employee';
      const param = isNewMode() ? null : ROUTE_PARAM;
      clearEmployeeFormDraft();
      go(target, param);
    });
  }

  const save = document.querySelector('[data-action="save"]');
  if (save) save.addEventListener('click', onSave);
}
