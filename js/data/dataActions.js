// dataActions.js — every mutation to the in-memory DATA object goes through
// here. One job: own the read/parse/mutate/export lifecycle of app data.
// No rendering, no routing. Pages call these and then re-render themselves.

import {
  DATA,
  setData,
  markDirty as markDirtyState,
  clearDirty as clearDirtyState,
} from '../state.js';
import { scheduleAdminCacheSave } from './adminCache.js';
import { todayISO } from '../utils/format.js';
import {
  generateMonthlySelection,
  eligibleEmployees,
  selectedOrCompletedThisMonth,
  isRepeatMonth,
  testedThisYear,
  currentFiscalYear,
} from '../utils/rdt.js';

// Marks the data dirty AND schedules a save of the working copy to this device's
// local cache, so a re-login can restore it without re-uploading the JSON file.
// Every mutation below already called markDirty(), so routing dirty-marking
// through here is all it takes to keep the local copy current.
function markDirty() {
  markDirtyState();
  scheduleAdminCacheSave();
}

// Clears the dirty flag only. loadJSON/exportJSON call scheduleAdminCacheSave()
// themselves where a cache write is also wanted.
function clearDirty() {
  clearDirtyState();
}

// ── small local helpers ────────────────────────────────────────────────────

// ISO timestamp for "now" (e.g. 2026-07-14T14:30:00.000Z). Used for meta and
// history timestamps.
function nowISO() {
  return new Date().toISOString();
}

// YYYY-MM-DD for today, used in export filenames.
function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

// Triggers a browser file download of `text` under `filename`. Uses a Blob and
// a temporary <a download> — no network, no server.
function downloadTextFile(text, filename, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── load / export ──────────────────────────────────────────────────────────

// Parses a JSON string, validates it has the three required top-level sections,
// installs it as the current DATA, and clears the dirty flag. Returns
// { ok, error } — error is a code string, never display text.
export function loadJSON(jsonString) {
  let parsed;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    return { ok: false, error: 'invalid_json' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'invalid_shape' };
  }
  if (!parsed.meta || !Array.isArray(parsed.users) || !Array.isArray(parsed.employees)) {
    return { ok: false, error: 'invalid_shape' };
  }
  setData(parsed);
  clearDirty();
  scheduleAdminCacheSave();
  return { ok: true };
}

// Serializes the current DATA (stamping who exported it and when), downloads it
// as ohs-data-YYYY-MM-DD.json, records the backup time, and clears dirty.
export function exportJSON(currentUser) {
  const stampedMeta = {
    ...DATA.meta,
    exported_at: nowISO(),
    exported_by: currentUser ? currentUser.username : null,
  };
  const exportObj = { ...DATA, meta: stampedMeta };

  downloadTextFile(JSON.stringify(exportObj, null, 2), `ohs-data-${todayStamp()}.json`);

  // Persist the stamp back into live state so the UI reflects the last export.
  DATA.meta.exported_at = stampedMeta.exported_at;
  DATA.meta.exported_by = stampedMeta.exported_by;
  DATA.meta.last_backup_at = stampedMeta.exported_at;
  clearDirty();
  scheduleAdminCacheSave();
  return { ok: true };
}

// ── employees ──────────────────────────────────────────────────────────────

// Assigns the next auto-generated employee_id, stamps meta, appends to the list,
// and marks the data dirty. Returns the created employee (with its new id).
export function addEmployee(employee, user) {
  const number = DATA.meta.next_employee_number;
  const employee_id = `${DATA.meta.employee_id_prefix}${String(number).padStart(4, '0')}`;
  DATA.meta.next_employee_number = number + 1;

  const ts = nowISO();
  const username = user ? user.username : 'system';
  const created = {
    ...employee,
    employee_id,
    meta: {
      created_at: ts,
      created_by: username,
      updated_at: ts,
      updated_by: username,
    },
  };

  DATA.employees.push(created);
  markDirty();
  return created;
}

// Merges `updates` into the matching employee. For each cert key in
// `changedCertKeys` whose expiry_date actually changed, appends a renewal_history
// entry. Stamps updated_at/by and marks dirty. No-op if the id isn't found.
export function updateEmployee(employeeId, updates, user, changedCertKeys = []) {
  const emp = DATA.employees.find((e) => e.employee_id === employeeId);
  if (!emp) return;

  const ts = nowISO();
  const username = user ? user.username : 'system';

  // Record renewal history BEFORE overwriting, comparing old vs incoming expiry.
  if (updates.certificates && Array.isArray(changedCertKeys) && changedCertKeys.length) {
    if (!Array.isArray(emp.renewal_history)) emp.renewal_history = [];
    for (const certKey of changedCertKeys) {
      const oldCert = emp.certificates ? emp.certificates[certKey] : undefined;
      const newCert = updates.certificates[certKey];
      if (!newCert) continue;
      const oldExpiry = oldCert ? oldCert.expiry_date || '' : '';
      const newExpiry = newCert.expiry_date || '';
      if (oldExpiry !== newExpiry) {
        emp.renewal_history.push({
          cert_key: certKey,
          old_expiry: oldExpiry,
          new_expiry: newExpiry,
          renewed_at: ts,
          renewed_by: username,
        });
      }
    }
  }

  // Apply the updates over the existing record.
  Object.assign(emp, updates);

  // Always keep meta intact and stamped with this edit.
  emp.meta = {
    ...emp.meta,
    updated_at: ts,
    updated_by: username,
  };

  markDirty();
}

// Marks an employee archived, recording who and when.
export function archiveEmployee(employeeId, user) {
  const emp = DATA.employees.find((e) => e.employee_id === employeeId);
  if (!emp) return;
  const ts = nowISO();
  const username = user ? user.username : 'system';
  if (!emp.personal) emp.personal = {};
  emp.personal.archived = true;
  emp.personal.archived_at = ts;
  emp.personal.archived_by = username;
  if (!emp.meta) emp.meta = {};
  emp.meta.updated_at = ts;
  emp.meta.updated_by = username;
  markDirty();
}

// Reverses archiveEmployee, clearing the archive flag and metadata.
export function unarchiveEmployee(employeeId, user) {
  const emp = DATA.employees.find((e) => e.employee_id === employeeId);
  if (!emp) return;
  const ts = nowISO();
  const username = user ? user.username : 'system';
  if (!emp.personal) emp.personal = {};
  emp.personal.archived = false;
  emp.personal.archived_at = '';
  emp.personal.archived_by = '';
  if (!emp.meta) emp.meta = {};
  emp.meta.updated_at = ts;
  emp.meta.updated_by = username;
  markDirty();
}

// Permanently removes an employee from the list.
export function deleteEmployee(employeeId, user) {
  const idx = DATA.employees.findIndex((e) => e.employee_id === employeeId);
  if (idx === -1) return;
  DATA.employees.splice(idx, 1);
  markDirty();
}

// ── users / meta ───────────────────────────────────────────────────────────

// Replaces the whole users list. Callers (settings) are responsible for the
// "cannot delete last admin" guard before calling this.
export function saveUsers(users) {
  DATA.users = users;
  markDirty();
}

// Shallow-merges partial updates into meta.
export function updateMeta(metaUpdates) {
  DATA.meta = { ...DATA.meta, ...metaUpdates };
  markDirty();
}

// ── RDT (random drug testing) ───────────────────────────────────────────────
//
// The pure selection maths lives in utils/rdt.js. These wrappers own the
// side effects: writing log entries into each employee's rdt_log, bumping the
// log-number counter, and marking dirty. RDT is admin-only — publishFieldSnapshot
// strips rdt_log and meta.rdt before anything reaches the officer app.

// Default meta.rdt block, kept in sync with makeBootstrapData() in bootstrap.js.
const RDT_DEFAULTS = {
  enabled: true,
  fiscal_year_start_month: 4,
  monthly_target_pct: 10,
  yearly_target_pct: 120,
  hire_grace_months: 3,
  repeat_months: [2, 3],
  next_log_number: 1,
};

// Builds a fresh 'selected' log entry for `emp`, consuming the next log number.
function pushRdtSelection(emp, fyLabel, username) {
  const rdt = DATA.meta.rdt;
  const log_id = `rdt-${String(rdt.next_log_number).padStart(6, '0')}`;
  rdt.next_log_number += 1;
  if (!Array.isArray(emp.rdt_log)) emp.rdt_log = [];
  emp.rdt_log.push({
    log_id,
    fiscal_year: fyLabel,
    selected_at: todayISO(),
    selected_by: username,
    status: 'selected',
    test_date: '',
    result: '',
    notes: '',
  });
  return log_id;
}

// Seeds DATA.meta.rdt with defaults if it is missing or currently disabled.
// Existing config values are preserved; only `enabled` is forced on.
export function enableRdt() {
  const cur = DATA.meta.rdt;
  if (cur && cur.enabled) return;
  DATA.meta.rdt = { ...RDT_DEFAULTS, ...(cur || {}), enabled: true };
  markDirty();
}

// Generates this month's selection and writes a 'selected' log entry per picked
// employee. Returns [{ employee_id, log_id }, ...] for the created entries.
export function generateAndSaveMonthlySelection(user) {
  const today = new Date();
  const rdt = DATA.meta.rdt;
  const fy = currentFiscalYear(today, rdt.fiscal_year_start_month);
  const username = user ? user.username : 'system';

  const selected = generateMonthlySelection(DATA.employees, today, rdt);
  const created = [];
  for (const emp of selected) {
    const log_id = pushRdtSelection(emp, fy.label, username);
    created.push({ employee_id: emp.employee_id, log_id });
  }

  markDirty();
  return created;
}

// Locates the log entry and returns { emp, entry } or null.
function findRdtEntry(employee_id, log_id) {
  const emp = DATA.employees.find((e) => e.employee_id === employee_id);
  if (!emp) return null;
  const entry = (emp.rdt_log || []).find((x) => x.log_id === log_id);
  if (!entry) return null;
  return { emp, entry };
}

// Marks a still-'selected' entry completed with its test date, result, and notes.
export function markRdtCompleted(employee_id, log_id, test_date, result, notes) {
  const found = findRdtEntry(employee_id, log_id);
  if (!found || found.entry.status !== 'selected') {
    return { ok: false, error: 'entry_not_found' };
  }
  found.entry.status = 'completed';
  found.entry.test_date = test_date || '';
  found.entry.result = result || '';
  found.entry.notes = notes || '';
  markDirty();
  return { ok: true };
}

// Marks a still-'selected' entry missed. test_date stays empty — a missed test
// re-opens the employee's eligibility for a later month.
export function markRdtMissed(employee_id, log_id, notes) {
  const found = findRdtEntry(employee_id, log_id);
  if (!found || found.entry.status !== 'selected') {
    return { ok: false, error: 'entry_not_found' };
  }
  found.entry.status = 'missed';
  found.entry.notes = notes || '';
  markDirty();
  return { ok: true };
}

// Swaps a still-'selected' entry for a fresh random pick. The original entry is
// deleted (not marked missed — swap is "we knew in advance"), and a replacement
// is chosen from the current eligible pool respecting the fiscal-year phase,
// excluding anyone already selected/completed this month AND the original person.
export function swapRdtSelection(employee_id, log_id, user) {
  const emp = DATA.employees.find((e) => e.employee_id === employee_id);
  if (!emp) return { ok: false, error: 'entry_not_found' };
  const log = emp.rdt_log || [];
  const idx = log.findIndex((x) => x.log_id === log_id);
  if (idx === -1 || log[idx].status !== 'selected') {
    return { ok: false, error: 'entry_not_found' };
  }

  log.splice(idx, 1);

  const today = new Date();
  const rdt = DATA.meta.rdt;
  const fy = currentFiscalYear(today, rdt.fiscal_year_start_month);
  const monthISO = today.toISOString().slice(0, 7);

  const pool = eligibleEmployees(DATA.employees, today, rdt)
    .filter((e) => !selectedOrCompletedThisMonth(e, monthISO));
  let candidates = isRepeatMonth(today, rdt)
    ? pool.filter((e) => testedThisYear(e, fy.label))
    : pool.filter((e) => !testedThisYear(e, fy.label));
  // Never re-pick the person just swapped out, even if removing their entry
  // dropped them back out of selectedOrCompletedThisMonth.
  candidates = candidates.filter((e) => e.employee_id !== employee_id);

  if (!candidates.length) return { ok: false, error: 'no_replacement' };

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  const username = user ? user.username : 'system';
  const replacement_log_id = pushRdtSelection(pick, fy.label, username);

  markDirty();
  return {
    ok: true,
    replacement_employee_id: pick.employee_id,
    replacement_log_id,
  };
}

// Corrects an existing entry. Whitelisted to test_date, result, and notes only —
// status, log_id, fiscal_year, and the selection metadata are never editable.
export function editRdtEntry(employee_id, log_id, updates) {
  const found = findRdtEntry(employee_id, log_id);
  if (!found) return { ok: false, error: 'entry_not_found' };
  const allowed = ['test_date', 'result', 'notes'];
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(updates || {}, key)) {
      found.entry[key] = updates[key];
    }
  }
  markDirty();
  return { ok: true };
}

// Hard-deletes an entry (UI must confirm first).
export function deleteRdtEntry(employee_id, log_id) {
  const emp = DATA.employees.find((e) => e.employee_id === employee_id);
  if (!emp) return { ok: false, error: 'entry_not_found' };
  const log = emp.rdt_log || [];
  const idx = log.findIndex((x) => x.log_id === log_id);
  if (idx === -1) return { ok: false, error: 'entry_not_found' };
  log.splice(idx, 1);
  markDirty();
  return { ok: true };
}

// ── field snapshot (officer app) ────────────────────────────────────────────

// Returns a copy of `emp` stripped of everything officers must never receive:
// renewal_history, rdt_log, and every certificate's file_link. Certificate
// expiry dates are kept so the officer app can derive verdicts.
function stripEmployeeForField(emp) {
  const certificates = {};
  if (emp.certificates) {
    for (const key of Object.keys(emp.certificates)) {
      const { file_link, ...rest } = emp.certificates[key] || {};
      certificates[key] = { ...rest };
    }
  }
  const stripped = { ...emp, certificates };
  delete stripped.renewal_history;
  delete stripped.rdt_log;
  return stripped;
}

// Builds the stripped field snapshot, downloads it as ohs-field-snapshot.json,
// and records last_published_at. Officers pull this (via Apps Script) — it must
// never contain admin users, passwords for non-officers, file links, renewal
// history, or archived employees.
//
// Users ARE kept, but only officers who are active AND can_do_site_check, and
// their passwords are intentionally retained: the Apps Script validates login
// credentials by matching against them (see CLAUDE.md, Flow B / Apps Script).
export function publishFieldSnapshot() {
  const publishedAt = nowISO();

  const snapshot = {
    meta: {
      warning_thresholds: DATA.meta.warning_thresholds,
      field_sync_max_stale_days: DATA.meta.field_sync.max_stale_days,
      published_at: publishedAt,
    },
    users: DATA.users
      .filter((u) => u.role === 'officer' && u.active && u.can_do_site_check)
      .map((u) => ({ ...u })),
    employees: DATA.employees
      .filter((e) => !(e.personal && e.personal.archived))
      .map(stripEmployeeForField),
  };

  downloadTextFile(JSON.stringify(snapshot, null, 2), 'ohs-field-snapshot.json');

  const wasAlreadyNow = DATA.meta.field_sync.last_published_at === publishedAt;
  DATA.meta.field_sync.last_published_at = publishedAt;
  if (!wasAlreadyNow) markDirty();

  return { ok: true, published_at: publishedAt };
}
