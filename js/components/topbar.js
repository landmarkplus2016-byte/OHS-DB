// topbar.js — the admin shell's top bar. One job: render the page title/subtitle,
// the unsaved-changes indicator, caller-supplied actions, and the always-present
// Export JSON button; then wire that button.

import { IS_DIRTY, CURRENT_USER } from '../state.js';
import { t } from '../i18n/i18n.js';
import { exportJSON } from '../data/dataActions.js';
import { showToast } from './toast.js';

// renderTopbar(title, sub, actionsHtml):
//   title       — main heading (already display-ready text)
//   sub         — optional subtitle line
//   actionsHtml — optional caller-provided buttons, inserted before Export JSON
export function renderTopbar(title, sub, actionsHtml) {
  const dirty = IS_DIRTY
    ? `<span><span class="dirty-dot"></span><span class="dirty-txt">${t('unsaved_changes')}</span></span>`
    : '';

  return `
    <div class="topbar">
      <div>
        <div class="title">${title || ''}</div>
        ${sub ? `<div class="sub">${sub}</div>` : ''}
      </div>
      <div class="topbar-actions">
        ${dirty}
        ${actionsHtml || ''}
        <button class="btn btn-primary btn-sm" data-action="export-json">↓ ${t('export_json')}</button>
      </div>
    </div>`;
}

export function bindTopbarEvents() {
  const btn = document.querySelector('.topbar [data-action="export-json"]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    exportJSON(CURRENT_USER);
    showToast(t('save_to_drive_note'), 'success');
  });
}
