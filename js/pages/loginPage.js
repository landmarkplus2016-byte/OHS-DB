// loginPage.js — the admin desktop entry point (no shell). One job: render the
// login card with the first-run JSON upload, and wire language, upload, and
// sign-in. Officers who land here get a hint pointing to the mobile app URL.
//
// The bootstrap admin (admin/admin123) lives in memory, so sign-in works before
// any JSON is uploaded; uploading real data just replaces that in-memory state.

import { DATA, setData, clearDirty } from '../state.js';
import { t, setLanguage, getLanguage } from '../i18n/i18n.js';
import { makeBootstrapData } from '../data/bootstrap.js';
import { loadJSON } from '../data/dataActions.js';
import { login } from '../data/auth.js';
import { go } from '../router.js';
import { render } from '../render.js';
import { escapeHtml, fmtDate } from '../utils/format.js';
import { clearAdminData, ADMIN_CACHE } from '../data/adminCache.js';

// True when only the in-memory bootstrap state is present (no real data yet).
function isBootstrapOnly() {
  return DATA.employees.length === 0 && DATA.users.length === 1;
}

// Maps a loadJSON() error code to a translated message.
function loadErrorMessage(code) {
  if (code === 'invalid_json') return t('load_err_json');
  if (code === 'invalid_shape') return t('load_err_shape');
  return t('load_err_generic');
}

export function renderLoginPage() {
  const lang = getLanguage();
  const checkUrl = `${location.origin}${location.pathname}#/check`;

  const dataSection = isBootstrapOnly()
    ? `
      <div class="upload-box">
        <div class="t">${t('upload_prompt')}</div>
        <div class="s">data.json</div>
        <label class="btn btn-primary btn-sm">
          ${t('choose_file')}
          <input id="login-file" type="file" accept=".json" hidden>
        </label>
        <div id="upload-msg"></div>
      </div>`
    : `
      <div class="upload-inline">
        <span>✓ ${t('file_loaded', { employees: DATA.employees.length, users: DATA.users.length })}</span>
        <button class="btn btn-ghost btn-sm" data-action="reupload">${t('reupload')}</button>
      </div>
      ${ADMIN_CACHE.restored_at ? `<div class="restore-note">${t('restored_note', { date: fmtDate(ADMIN_CACHE.restored_at) })}</div>` : ''}`;

  return `
    <div class="login-wrap">
      <div class="login-card">
        <div class="mark">OHS</div>
        <h1>${t('app_name')}</h1>
        <div class="sub">${t('app_sub')}</div>

        <div class="lang-row">
          <button class="btn btn-ghost btn-sm${lang === 'en' ? ' active' : ''}" data-lang="en">EN</button>
          <button class="btn btn-ghost btn-sm${lang === 'ar' ? ' active' : ''}" data-lang="ar">ع</button>
        </div>

        ${dataSection}

        <div class="field">
          <label>${t('username')}</label>
          <input id="login-uname" placeholder="admin" autocomplete="username">
        </div>
        <div class="field">
          <label>${t('password')}</label>
          <input id="login-pwd" type="password" autocomplete="current-password">
        </div>
        <div id="login-err" class="err"></div>
        <button class="btn btn-primary btn-block" data-action="signin">${t('sign_in')}</button>

        <div class="officer-hint">
          ${t('officer_hint')} <a href="#/check">${escapeHtml(checkUrl)}</a>
        </div>
      </div>
    </div>`;
}

export function bindLoginPageEvents() {
  const root = document.querySelector('.login-wrap');
  if (!root) return;

  // Language toggle (works without login).
  root.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => setLanguage(b.dataset.lang));
  });

  // Re-upload: clear back to bootstrap state so the upload box returns.
  const reupload = root.querySelector('[data-action="reupload"]');
  if (reupload) {
    reupload.addEventListener('click', () => {
      // Also forget the local copy on this device — the admin is deliberately
      // replacing it, so we must not silently restore the old data next boot.
      clearAdminData();
      setData(makeBootstrapData());
      clearDirty();
      render();
    });
  }

  // File pick → read → loadJSON. Success re-renders (shows the loaded banner);
  // failure shows inline red text without discarding the current state.
  const file = root.querySelector('#login-file');
  if (file) {
    file.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = loadJSON(String(reader.result));
        if (res.ok) {
          render();
        } else {
          const msg = root.querySelector('#upload-msg');
          if (msg) { msg.className = 'err'; msg.textContent = loadErrorMessage(res.error); }
        }
      };
      reader.onerror = () => {
        const msg = root.querySelector('#upload-msg');
        if (msg) { msg.className = 'err'; msg.textContent = t('load_err_generic'); }
      };
      reader.readAsText(f);
    });
  }

  // Sign in.
  const errEl = root.querySelector('#login-err');
  const doLogin = () => {
    const u = root.querySelector('#login-uname').value.trim();
    const p = root.querySelector('#login-pwd').value;
    const res = login(u, p);
    if (res.ok) {
      go('dashboard');
    } else if (errEl) {
      errEl.textContent = res.error;
    }
  };
  const signin = root.querySelector('[data-action="signin"]');
  if (signin) signin.addEventListener('click', doLogin);

  // Enter submits from either field.
  root.querySelectorAll('#login-uname, #login-pwd').forEach((input) => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  });
}
