// adminCache.js — optional local persistence of the admin's working data so a
// reload or re-login on this device does not require re-uploading the JSON file.
//
// This is an intentional, admin-authorized exception to CLAUDE.md rule 3 ("no
// localStorage for employee data"). It stores the FULL working data — including
// the users list with plain-text passwords — in this browser's IndexedDB, purely
// as a convenience copy for the single-admin desktop app.
//
// Google Drive remains the single source of truth. This cache is never a
// substitute for Export JSON → upload to Drive: it only saves re-uploading the
// file on the same machine. Clearing it (reupload / "forget on this device")
// wipes the local copy.

import { DATA } from '../state.js';

const DB_NAME = 'ohs-admin';
const DB_VERSION = 1;
const STORE = 'kv';
const KEY = 'working_data';

// Fires once when a restore happens at boot, so the login page can show a
// "restored from this device · saved <date>" note. Reset to null when the
// local copy is cleared.
export const ADMIN_CACHE = { restored_at: null };

// ---------- IndexedDB helpers (same minimal pattern as officerSync.js) ----------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function withStore(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req ? req.result : undefined);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      })
  );
}

// ---------- public API ----------

// Writes the current DATA to the local cache with a timestamp. Best-effort: a
// failure (private browsing, blocked storage) is swallowed — the app still works
// in memory, it just won't be able to restore next time.
async function saveNow() {
  try {
    await withStore('readwrite', (store) =>
      store.put({ key: KEY, value: { data: DATA, saved_at: new Date().toISOString() } })
    );
  } catch {
    // ignore — the cache is a convenience, never load-bearing
  }
}

// Debounced save. Mutations can arrive in bursts (Excel import writes hundreds of
// employees), so coalesce them into a single write shortly after the last change.
let saveTimer = null;
export function scheduleAdminCacheSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 500);
}

// Returns { data, saved_at } from the last save, or null when nothing is cached
// or the store is unavailable. Callers must validate `data`'s shape before use.
export async function loadAdminData() {
  try {
    const row = await withStore('readonly', (store) => store.get(KEY));
    return row ? row.value : null;
  } catch {
    return null;
  }
}

// Wipes the local copy (used by "re-upload" / "forget on this device").
export async function clearAdminData() {
  clearTimeout(saveTimer);
  ADMIN_CACHE.restored_at = null;
  try {
    await withStore('readwrite', (store) => store.clear());
  } catch {
    // nothing actionable
  }
}
