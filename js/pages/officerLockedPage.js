// officerLockedPage.js — the fail-closed stale-sync lockout (CLAUDE.md rule 8).
// One job: refuse to show verdicts from data that is too old, and offer the one
// way out — a sync.
//
// This screen is a dead end by design. There is no "continue anyway": a verdict
// from a month-old snapshot could clear someone whose medical expired last week,
// and the officer has no way to know. The only exit is fresh data.

import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { openSyncModal } from '../components/officerSyncStrip.js';
import { maxStaleDays, daysSinceSync } from '../data/officerSync.js';

export function renderOfficerLockedPage() {
  const elapsed = daysSinceSync();

  return `
    <div class="lock">
      <div class="lock-icon">🔒</div>
      <h2>${t('locked_title')}</h2>
      <p>${t('locked_msg', { max: maxStaleDays() })}</p>
      ${elapsed === null ? '' : `<p class="lock-age">${t('stale_warn', { days: Math.floor(elapsed) })}</p>`}
      <button class="btn btn-primary btn-lg" data-action="locked-sync">↻ ${t('sync_now')}</button>
    </div>`;
}

export function bindOfficerLockedPageEvents() {
  const btn = document.querySelector('[data-action="locked-sync"]');
  if (!btn) return;

  // On success go home — render()'s staleness guard re-checks the fresh cache
  // and will bounce straight back here if the sync somehow didn't help.
  btn.addEventListener('click', () => openSyncModal(() => go('check/home')));
}
