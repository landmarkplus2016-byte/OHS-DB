// auth.js — admin login/logout for the desktop app only. One job: validate
// admin credentials against DATA.users and set/clear CURRENT_USER.
//
// Officer authentication is entirely separate (it talks to the Apps Script
// endpoint) and lives in js/data/officerSync.js, built in Stage 9.
//
// CURRENT_USER is never persisted — it lives only in state.js's module-level
// variable, so a page refresh logs the admin out. This is intentional: a fresh
// JSON upload and re-auth is required after every reload.

import { DATA, UI, setCurrentUser } from '../state.js';
import { t } from '../i18n/i18n.js';

// Validates username/password against the loaded users. On success, sets the
// current user and returns { ok:true }. On failure, returns { ok:false, error }
// where error is a display-ready (already-translated) message.
export function login(username, password) {
  const user = DATA.users.find(
    (u) => u.username === username && u.password === password
  );

  if (!user) {
    return { ok: false, error: t('invalid_creds') };
  }
  if (user.active === false) {
    return { ok: false, error: t('inactive_acct') };
  }
  if (user.role !== 'admin') {
    return { ok: false, error: t('admin_only') };
  }

  setCurrentUser(user);
  return { ok: true };
}

// Clears the session and any transient per-page UI state that must not survive
// a logout (search text, filters, active tabs, pagination, etc.).
export function logout() {
  setCurrentUser(null);
  for (const key of Object.keys(UI)) {
    delete UI[key];
  }
}
