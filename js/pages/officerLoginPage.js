// officerLoginPage.js — the officer mobile shell's entry point. One job: get an
// officer signed in, and (on first run only) collect the Apps Script endpoint
// URL that every later call needs.
//
// Two screens live here because they are the same door: the officer cannot sign
// in until the app knows which server to ask, so Setup is a precondition of
// login rather than a separate route. Which one shows is derived from whether an
// endpoint is known — there is no route for it, so a refresh can't strand an
// officer on a half-configured screen.

import { t, setLanguage, getLanguage } from '../i18n/i18n.js';
import { go } from '../router.js';
import { render } from '../render.js';
import { escapeHtml } from '../utils/format.js';
import { officerLogin, getEndpointUrl, setEndpointUrl } from '../data/officerSync.js';

// Set when the officer taps "Set up the sync URL" to reach Setup by choice
// (e.g. the admin re-deployed). Module-level and deliberately not persisted: a
// reload should return to the normal sign-in screen.
let SHOW_SETUP = false;

export function renderOfficerLoginPage() {
  const showSetup = SHOW_SETUP || !getEndpointUrl();
  return showSetup ? setupScreen() : signInScreen();
}

// First-run screen: the officer pastes the URL their admin gave them.
function setupScreen() {
  const current = getEndpointUrl() || '';

  return `
    <div class="officer-login" data-screen="setup">
      <div class="mark">OHS</div>
      <h1>${t('officer_app_name')}</h1>
      <div class="sub">${t('officer_setup_title')}</div>

      <div class="field">
        <label>${t('setup_prompt')}</label>
        <input id="setup-url" inputmode="url" autocapitalize="none" spellcheck="false"
               placeholder="${t('paste_url')}" value="${escapeHtml(current)}">
      </div>
      <div id="setup-err" class="err"></div>
      <button class="btn btn-primary btn-lg btn-block" data-action="setup-save">${t('setup_save')}</button>

      ${langRow()}

      ${current ? `<div class="note"><button data-action="setup-back">${t('back_to_signin')}</button></div>` : ''}
    </div>`;
}

// Normal screen: username + password.
function signInScreen() {
  return `
    <div class="officer-login" data-screen="signin">
      <div class="mark">OHS</div>
      <h1>${t('officer_app_name')}</h1>
      <div class="sub">${t('officer_app_sub')} · ${t('officer_login_title')}</div>

      <div class="field">
        <label>${t('username')}</label>
        <input id="officer-uname" autocomplete="username" autocapitalize="none" spellcheck="false">
      </div>
      <div class="field">
        <label>${t('password')}</label>
        <input id="officer-pwd" type="password" autocomplete="current-password">
      </div>
      <div id="officer-err" class="err"></div>
      <button class="btn btn-primary btn-lg btn-block" data-action="officer-signin">${t('sign_in')}</button>

      ${langRow()}

      <div class="note">
        ${t('setup_prompt')}<br>
        <button data-action="setup-open">${t('setup_link')}</button>
      </div>
    </div>`;
}

function langRow() {
  const lang = getLanguage();
  return `
    <div class="lang">
      <button class="${lang === 'en' ? 'active' : ''}" data-lang="en">EN</button>
      <button class="${lang === 'ar' ? 'active' : ''}" data-lang="ar">ع</button>
    </div>`;
}

export function bindOfficerLoginPageEvents() {
  const root = document.querySelector('.officer-login');
  if (!root) return;

  root.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => setLanguage(b.dataset.lang));
  });

  if (root.dataset.screen === 'setup') bindSetupEvents(root);
  else bindSignInEvents(root);
}

function bindSetupEvents(root) {
  const errEl = root.querySelector('#setup-err');

  const save = async () => {
    const res = await setEndpointUrl(root.querySelector('#setup-url').value);
    if (!res.ok) {
      if (errEl) errEl.textContent = res.error;
      return;
    }
    SHOW_SETUP = false;
    render();
  };

  const saveBtn = root.querySelector('[data-action="setup-save"]');
  if (saveBtn) saveBtn.addEventListener('click', save);

  const url = root.querySelector('#setup-url');
  if (url) url.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });

  const back = root.querySelector('[data-action="setup-back"]');
  if (back) back.addEventListener('click', () => { SHOW_SETUP = false; render(); });
}

function bindSignInEvents(root) {
  const errEl = root.querySelector('#officer-err');
  const btn = root.querySelector('[data-action="officer-signin"]');

  const doLogin = async () => {
    const u = root.querySelector('#officer-uname').value.trim();
    const p = root.querySelector('#officer-pwd').value;

    // Disabled while in flight so an impatient double-tap can't fire two logins.
    if (btn) btn.disabled = true;
    if (errEl) errEl.textContent = '';

    const res = await officerLogin(getEndpointUrl(), u, p);

    if (res.ok) {
      go('check/home');
      return;
    }
    if (btn) btn.disabled = false;
    if (errEl) errEl.textContent = res.error;
  };

  if (btn) btn.addEventListener('click', doLogin);
  root.querySelectorAll('#officer-uname, #officer-pwd').forEach((input) => {
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  });

  const setup = root.querySelector('[data-action="setup-open"]');
  if (setup) setup.addEventListener('click', () => { SHOW_SETUP = true; render(); });
}
