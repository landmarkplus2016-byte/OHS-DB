// dataActions.js — every mutation to the in-memory DATA object goes through
// here. One job: own the read/parse/mutate/export lifecycle of app data.
// No rendering, no routing. Pages call these and then re-render themselves.

import {
  DATA,
  setData,
  markDirty,
  clearDirty,
} from '../state.js';

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

// ── field snapshot (officer app) ────────────────────────────────────────────

// Returns a copy of `emp` stripped of everything officers must never receive:
// renewal_history and every certificate's file_link. Certificate expiry dates
// are kept so the officer app can derive verdicts.
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
