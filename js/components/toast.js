// toast.js — transient bottom-corner notification. One job: briefly show a
// message, then auto-dismiss. No state, no i18n (callers pass display-ready text).

// Shows `msg` as a toast. type: 'info' (dark, default), 'success' (green accent),
// or 'error' (red accent). Auto-dismisses after 2000ms.
export function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast' + (type && type !== 'info' ? ' toast-' + type : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
