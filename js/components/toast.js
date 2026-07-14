// toast.js — transient bottom-corner notification. One job: briefly show a
// message, then auto-dismiss. No state, no i18n (callers pass display-ready text).

// Shows `msg` as a toast. `type` is optional: 'success' | 'error' tints it;
// anything else uses the default dark toast. Auto-dismisses after 2s.
export function showToast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast' + (type ? ' toast-' + type : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
