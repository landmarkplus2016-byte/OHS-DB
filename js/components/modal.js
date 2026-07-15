// modal.js — a single centered modal over a dimmed overlay. One job: build the
// markup and manage one open modal at a time (mount, ESC/overlay-click close,
// unmount). Callers pass display-ready title/body/footer HTML.

// Tracks the active ESC handler so it can be detached on close.
let escHandler = null;

// Returns overlay + modal markup. title/bodyHtml/footHtml are inserted as-is
// (callers pass t()-resolved text and any already-escaped data).
export function modalHtml(title, bodyHtml, footHtml) {
  return `<div class="overlay" data-modal-root>
    <div class="modal" role="dialog" aria-modal="true">
      <h3>${title || ''}</h3>
      <div class="modal-body">${bodyHtml || ''}</div>
      ${footHtml ? `<div class="mfoot">${footHtml}</div>` : ''}
    </div>
  </div>`;
}

// Mounts a modal on document.body. Closing (ESC or a click on the backdrop —
// not the modal itself) removes it and calls onClose. Any previously open modal
// is closed first so only one exists at a time. Returns a close() function so
// callers (e.g. a footer button) can dismiss it programmatically.
export function openModal(title, bodyHtml, footHtml, onClose) {
  closeModal();

  const wrap = document.createElement('div');
  wrap.innerHTML = modalHtml(title, bodyHtml, footHtml);
  const overlay = wrap.firstElementChild;
  document.body.appendChild(overlay);

  const close = () => {
    if (escHandler) {
      document.removeEventListener('keydown', escHandler);
      escHandler = null;
    }
    overlay.remove();
    if (typeof onClose === 'function') onClose();
  };

  // Click on the backdrop (but not on the modal panel) closes.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  // ESC closes.
  escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);

  return close;
}

// Removes any open modal without invoking its onClose (use the close() returned
// by openModal when you need the callback to fire).
export function closeModal() {
  if (escHandler) {
    document.removeEventListener('keydown', escHandler);
    escHandler = null;
  }
  document.querySelectorAll('.overlay[data-modal-root]').forEach((el) => el.remove());
}
