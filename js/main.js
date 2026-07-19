// main.js — application entry point.
// Imports everything, wires the router, and kicks off the first render.

import { initRouter } from './router.js';
import { render } from './render.js';
import { getTheme } from './utils/theme.js';
import { bootstrapOfficerSession } from './data/officerSync.js';
import { loadAdminData, ADMIN_CACHE } from './data/adminCache.js';
import { setData } from './state.js';

// Validates a cached object has the three required top-level sections before we
// trust it as DATA (mirrors loadJSON's shape check).
function isValidData(d) {
  return !!d && !!d.meta && Array.isArray(d.users) && Array.isArray(d.employees);
}

document.addEventListener('DOMContentLoaded', async () => {
  // Reapply the persisted accent theme (index.html hardcodes data-theme="blue").
  document.documentElement.dataset.theme = getTheme();
  initRouter();

  // Restore the admin's last working data from this device, if any, so a reload
  // or re-login doesn't require re-uploading the JSON. Best-effort: an absent or
  // malformed cache just falls back to the first-run upload prompt. The officer
  // app ignores DATA entirely, so this is a no-op there.
  const cached = await loadAdminData();
  if (cached && isValidData(cached.data)) {
    setData(cached.data);
    ADMIN_CACHE.restored_at = cached.saved_at || null;
  }

  // Rehydrate the officer's cached snapshot/session from IndexedDB before the
  // first paint, so a reload on '#/check/*' doesn't flash the login page. Reads
  // only — never throws, so a failure here still renders (as a logged-out
  // officer, which fails closed).
  await bootstrapOfficerSession();

  render();
});
