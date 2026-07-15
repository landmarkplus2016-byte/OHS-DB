// officerSyncStrip.js — the white strip under the officer header showing how old
// the cached data is, plus the Sync control. One job: report cache age and start
// a re-sync. The stale banner below the strip warns as the lockout approaches.
//
// Sync needs credentials every time: the password is deliberately not cached
// (see officerSync.js), so the Sync button opens a small re-auth modal rather
// than silently refetching. The lockout screen reuses that modal via
// openSyncModal(), which is why it lives here next to the Sync button.

import { t } from '../i18n/i18n.js';
import { fmtDate, escapeHtml } from '../utils/format.js';
import { render } from '../render.js';
import { openModal } from './modal.js';
import { showToast } from './toast.js';
import {
  OFFICER_STATE,
  officerSync,
  daysSinceSync,
  maxStaleDays,
  getEndpointUrl,
} from '../data/officerSync.js';

// How many days before the lockout threshold the amber banner appears.
const STALE_WARN_LEAD_DAYS = 5;

export function renderOfficerSyncStrip() {
  const snapshot = OFFICER_STATE.snapshot;
  const publishedAt = (snapshot && snapshot.meta && snapshot.meta.published_at) || '';
  const elapsed = daysSinceSync();
  const days = elapsed === null ? null : Math.floor(elapsed);
  const warn = days !== null && days >= maxStaleDays() - STALE_WARN_LEAD_DAYS;

  const age = days === null ? '' : ` · <span class="${warn ? 'age-warn' : ''}">${t('n_days_short', { days })}</span>`;

  return `
    <div class="sync-strip">
      <div class="as-of">${t('as_of')} <b>${fmtDate(publishedAt)}</b>${age}</div>
      <button data-action="officer-sync">↻ ${t('sync_now')}</button>
    </div>
    ${warn ? `<div class="stale-banner">⚠ ${t('stale_warn', { days })}</div>` : ''}`;
}

export function bindOfficerSyncStripEvents() {
  const btn = document.querySelector('[data-action="officer-sync"]');
  if (!btn) return;
  btn.addEventListener('click', () => openSyncModal());
}

// Opens the re-auth modal and runs a sync with the typed credentials.
// `onSuccess` runs after a successful sync; it defaults to a plain re-render so
// the caller (sync strip) simply refreshes in place. The lockout page passes its
// own callback to navigate home.
export function openSyncModal(onSuccess) {
  const username = (OFFICER_STATE.user && OFFICER_STATE.user.username) || '';

  const body = `
    <p class="sync-note">${t('sync_signin_msg')}</p>
    <div class="field">
      <label>${t('username')}</label>
      <input id="sync-uname" value="${escapeHtml(username)}" autocomplete="username">
    </div>
    <div class="field">
      <label>${t('password')}</label>
      <input id="sync-pwd" type="password" autocomplete="current-password">
    </div>
    <div id="sync-err" class="err"></div>`;

  const foot = `
    <button class="btn btn-ghost" data-action="sync-cancel">${t('cancel')}</button>
    <button class="btn btn-primary" data-action="sync-go">${t('sync_now')}</button>`;

  const close = openModal(t('sync_signin_title'), body, foot);

  const errEl = document.querySelector('#sync-err');
  const goBtn = document.querySelector('[data-action="sync-go"]');
  const cancelBtn = document.querySelector('[data-action="sync-cancel"]');
  const pwdEl = document.querySelector('#sync-pwd');

  if (cancelBtn) cancelBtn.addEventListener('click', () => close());

  const run = async () => {
    const u = document.querySelector('#sync-uname').value.trim();
    const p = pwdEl.value;

    // Guard against a double-tap firing two syncs.
    goBtn.disabled = true;
    if (errEl) errEl.textContent = '';
    showToast(t('syncing'));

    const res = await officerSync(getEndpointUrl(), u, p);

    if (!res.ok) {
      goBtn.disabled = false;
      if (errEl) errEl.textContent = res.error;
      return;
    }

    close();
    showToast('✓ ' + t('synced'), 'success');
    if (typeof onSuccess === 'function') onSuccess();
    else render();
  };

  if (goBtn) goBtn.addEventListener('click', run);
  if (pwdEl) pwdEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  if (pwdEl) pwdEl.focus();
}
