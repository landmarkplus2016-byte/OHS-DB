// officerSync.js — the officer app's data layer. One job: talk to the Apps
// Script endpoint and mirror the field snapshot into IndexedDB so officers can
// look up verdicts at a tower site with no signal.
//
// This is the ONLY module in the project that makes a network call, and the
// IndexedDB cache below is the ONE sanctioned exception to the "no persisted
// employee data" rule. Both exist because officers work offline.
//
// The password is never persisted. We cache the snapshot and a lightweight
// session marker ({username, display_name}) only. That means a re-sync needs
// freshly-typed credentials — officerSync() takes them as arguments rather than
// reading them back from the cache, and the stale-lockout screen re-prompts.
//
// Staleness is fail-closed: anything we cannot prove is fresh is stale. Callers
// must consult isCacheStale() before showing a verdict (see CLAUDE.md rule 8).

import { t } from '../i18n/i18n.js';
import { go } from '../router.js';

const DB_NAME = 'ohs-officer';
const DB_VERSION = 1;
const STORE = 'kv';

// Cache keys. 'session' holds the display-only officer marker; 'snapshot' holds
// the stripped field data; 'last_synced_at' holds the ISO time of the last
// successful fetch (the staleness clock); 'endpoint_url' holds the Apps Script
// URL the admin hands out once, which must survive sign-out (an officer who
// signs out has not forgotten where their server is).
const KEY_SNAPSHOT = 'snapshot';
const KEY_SESSION = 'session';
const KEY_LAST_SYNCED = 'last_synced_at';
const KEY_ENDPOINT = 'endpoint_url';

// Used when the snapshot omits meta.field_sync_max_stale_days. Matches the
// default in the JSON schema.
const DEFAULT_MAX_STALE_DAYS = 30;

// ---------- IndexedDB helpers ----------
// A minimal promise wrapper over a single key/value store. No libraries — the
// surface we need is four calls wide.

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

// Runs fn against a store in a transaction and resolves with the request result.
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

// Returns the stored value, or null when the key is absent. Also returns null if
// IndexedDB itself is unavailable (private browsing, blocked storage) — the
// caller then treats the cache as empty, which fails closed.
export async function cacheGet(key) {
  try {
    const row = await withStore('readonly', (store) => store.get(key));
    return row ? row.value : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value) {
  return withStore('readwrite', (store) => store.put({ key, value }));
}

export async function cacheClear() {
  return withStore('readwrite', (store) => store.clear());
}

// ---------- Officer session state ----------
// The officer shell's equivalent of state.js. Kept here rather than in state.js
// because state.js is the admin app's in-memory DATA and the two never mix.

export const OFFICER_STATE = {
  snapshot: null, // parsed field snapshot from cache
  user: null, // { username, display_name } — never the password
  last_synced_at: null, // ISO string of the last successful sync
  endpoint_url: null, // Apps Script Web App URL, from setup or the snapshot
};

// Rehydrates OFFICER_STATE from IndexedDB. main.js must await this before the
// first render(), otherwise a logged-in officer's reload paints the login page.
export async function bootstrapOfficerSession() {
  const [snapshot, session, lastSyncedAt, endpointUrl] = await Promise.all([
    cacheGet(KEY_SNAPSHOT),
    cacheGet(KEY_SESSION),
    cacheGet(KEY_LAST_SYNCED),
    cacheGet(KEY_ENDPOINT),
  ]);

  OFFICER_STATE.snapshot = snapshot || null;
  OFFICER_STATE.user = session || null;
  OFFICER_STATE.last_synced_at = lastSyncedAt || null;
  OFFICER_STATE.endpoint_url = endpointUrl || null;
}

// The endpoint to talk to, or null when the officer has never been given one
// (first run → the login page shows its Setup screen instead).
//
// A URL carried in the snapshot wins over the stored one: it lets the admin move
// the deployment and have officers follow on their next sync, without every
// officer re-pasting a URL by hand.
export function getEndpointUrl() {
  const fromSnapshot =
    OFFICER_STATE.snapshot &&
    OFFICER_STATE.snapshot.meta &&
    OFFICER_STATE.snapshot.meta.field_sync &&
    OFFICER_STATE.snapshot.meta.field_sync.endpoint_url;
  return fromSnapshot || OFFICER_STATE.endpoint_url || null;
}

// Persists the endpoint URL from the one-time Setup screen. Trims, and rejects
// anything that isn't an http(s) URL so a mistyped paste fails here rather than
// as a confusing network error later.
export async function setEndpointUrl(url) {
  const clean = String(url || '').trim();
  if (!/^https:\/\/\S+$/i.test(clean)) return { ok: false, error: t('sync_err_bad_url') };

  OFFICER_STATE.endpoint_url = clean;
  try {
    await cacheSet(KEY_ENDPOINT, clean);
  } catch {
    // Kept in memory for this session even if the store rejected the write.
  }
  return { ok: true, error: null };
}

// Days elapsed since the last successful sync, or null when never synced.
// Fractional days are kept (the clock is a full timestamp, not a date) and
// rounded down by callers that display it.
export function daysSinceSync() {
  if (!OFFICER_STATE.last_synced_at) return null;
  const then = new Date(OFFICER_STATE.last_synced_at).getTime();
  if (isNaN(then)) return null;
  return (Date.now() - then) / 86400000;
}

// The max-stale threshold that travels with the snapshot.
export function maxStaleDays() {
  const meta = OFFICER_STATE.snapshot && OFFICER_STATE.snapshot.meta;
  const n = meta && Number(meta.field_sync_max_stale_days);
  return n > 0 ? n : DEFAULT_MAX_STALE_DAYS;
}

// True when the cached snapshot must not be trusted for a verdict. Fail-closed:
// a missing snapshot, a missing/unparseable sync clock, and a clock in the
// future all count as stale.
export function isCacheStale() {
  if (!OFFICER_STATE.snapshot) return true;
  const elapsed = daysSinceSync();
  if (elapsed === null || elapsed < 0) return true;
  return elapsed > maxStaleDays();
}

// ---------- Apps Script transport ----------

// POSTs a payload to the endpoint and returns the parsed JSON body.
//
// Content-Type is text/plain on purpose: Apps Script Web Apps do not answer the
// CORS preflight that application/json would trigger, but text/plain is a
// "simple" request that skips preflight entirely. The script reads the raw
// e.postData.contents and JSON.parses it itself, so the body is still JSON.
async function postToEndpoint(endpointUrl, payload) {
  const res = await fetch(endpointUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error('http_' + res.status);
  return res.json();
}

// Maps an error code from the script (or from us) to a display-ready message.
function errorMessage(code) {
  if (code === 'invalid_credentials') return t('invalid_creds');
  if (code === 'inactive_account') return t('inactive_acct');
  if (code === 'no_site_check') return t('sync_err_no_site_check');
  if (code === 'no_url') return t('sync_err_no_url');
  if (code === 'network') return t('sync_err_network');
  return t('sync_err_server');
}

// Logs an officer in and caches what comes back.
//
// Returns { ok, error, snapshot } where `error` is already translated and
// present only when ok is false.
export async function officerLogin(endpointUrl, username, password) {
  if (!endpointUrl) {
    return { ok: false, error: errorMessage('no_url'), snapshot: null };
  }

  let body;
  try {
    body = await postToEndpoint(endpointUrl, {
      action: 'login',
      username,
      password,
    });
  } catch {
    // Offline, DNS failure, CORS rejection, non-2xx, unparseable body — all
    // indistinguishable from the browser and all mean "no fresh data".
    return { ok: false, error: errorMessage('network'), snapshot: null };
  }

  if (!body || !body.ok) {
    const code = (body && body.error) || 'server_error';
    return { ok: false, error: errorMessage(code), snapshot: null };
  }
  if (!body.snapshot) {
    return { ok: false, error: errorMessage('server_error'), snapshot: null };
  }

  const syncedAt = new Date().toISOString();
  const session = {
    username,
    display_name: (body.user && body.user.display_name) || username,
  };

  // Cache first, then publish to OFFICER_STATE — if the write fails we must not
  // leave the app believing it has a durable snapshot it can work offline from.
  try {
    await Promise.all([
      cacheSet(KEY_SNAPSHOT, body.snapshot),
      cacheSet(KEY_SESSION, session),
      cacheSet(KEY_LAST_SYNCED, syncedAt),
    ]);
  } catch {
    return { ok: false, error: errorMessage('server_error'), snapshot: null };
  }

  OFFICER_STATE.snapshot = body.snapshot;
  OFFICER_STATE.user = session;
  OFFICER_STATE.last_synced_at = syncedAt;

  return { ok: true, error: null, snapshot: body.snapshot };
}

// Re-fetches the snapshot. Because the password is deliberately not cached, a
// sync is just a fresh login: the caller (sync strip button, stale-lockout
// screen) re-prompts for credentials and passes them in.
export async function officerSync(endpointUrl, username, password) {
  const res = await officerLogin(endpointUrl, username, password);
  return { ok: res.ok, error: res.error };
}

// Drops the cached snapshot and session, then returns to the officer login.
//
// The endpoint URL is deliberately re-seeded after the wipe: it is configuration
// the admin handed out, not session data, and making a signed-out officer
// re-paste it at a tower site would be a self-inflicted outage.
export async function officerLogout() {
  const endpoint = OFFICER_STATE.endpoint_url;

  try {
    await cacheClear();
    if (endpoint) await cacheSet(KEY_ENDPOINT, endpoint);
  } catch {
    // Nothing actionable — clear the in-memory state regardless so the session
    // ends even if the store is unavailable.
  }

  OFFICER_STATE.snapshot = null;
  OFFICER_STATE.user = null;
  OFFICER_STATE.last_synced_at = null;

  go('check');
}
