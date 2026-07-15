// officerHomePage.js — the officer's search screen. One job: find a crew member
// by name or National ID and hand off to the verdict page.
//
// Results are capped at MAX_RESULTS: an officer at a tower site is looking for
// one specific person, and a 500-row list on a phone is slower to scan than
// typing another letter.

import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { escapeHtml, initials } from '../utils/format.js';
import { deriveSiteCheckVerdict } from '../utils/verdict.js';
import { OFFICER_STATE } from '../data/officerSync.js';

const MAX_RESULTS = 20;
const MAX_RECENT = 5;

// Live search text and the recently-viewed employee_ids. Both are in-memory
// only: RECENT is a convenience, not a record, and CLAUDE.md forbids persisting
// employee data outside the sanctioned snapshot cache.
let SEARCH = '';
let RECENT = [];

// Records a lookup. Most-recent first, no duplicates, newest MAX_RECENT kept.
export function pushRecent(id) {
  RECENT = [id, ...RECENT.filter((x) => x !== id)].slice(0, MAX_RECENT);
}

// Clears the officer's transient search state (called on sign-out).
export function clearOfficerHomeState() {
  SEARCH = '';
  RECENT = [];
}

function employees() {
  return (OFFICER_STATE.snapshot && OFFICER_STATE.snapshot.employees) || [];
}

function thresholds() {
  const meta = OFFICER_STATE.snapshot && OFFICER_STATE.snapshot.meta;
  return (meta && meta.warning_thresholds) || { urgent_days: 30, soon_days: 60, plan_days: 90 };
}

// Matches on name (case-insensitive) or National ID (substring, as typed).
function searchEmployees(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return employees()
    .filter((e) => {
      const name = String(e.name || '').toLowerCase();
      const natId = String(e.national_id || '');
      return name.includes(q) || natId.includes(q);
    })
    .slice(0, MAX_RESULTS);
}

export function renderOfficerHomePage() {
  return `
    <div class="search-box">
      <span class="ic">🔍</span>
      <input id="officer-search" placeholder="${t('search_ph')}" value="${escapeHtml(SEARCH)}"
             autocapitalize="none" spellcheck="false">
      ${SEARCH ? `<button class="clear" data-action="search-clear">×</button>` : ''}
    </div>
    <div id="officer-results">${resultsHtml()}</div>`;
}

// The part that changes as the officer types. Kept separate from the page so the
// input handler can repaint just this and leave the focused input untouched.
function resultsHtml() {
  const thr = thresholds();

  if (!SEARCH.trim()) {
    const recent = RECENT
      .map((id) => employees().find((e) => e.employee_id === id))
      .filter(Boolean);

    if (!recent.length) {
      return `<div class="empty"><div class="big">🔎</div><div>${t('empty_search')}</div></div>`;
    }
    return `
      <div class="section-h">${t('recent')}</div>
      <div class="result-list">${recent.map((e) => resultItemHtml(e, thr)).join('')}</div>`;
  }

  const results = searchEmployees(SEARCH);
  if (!results.length) {
    return `<div class="empty"><div class="big">–</div><div>${t('empty_none')}</div></div>`;
  }
  return `<div class="result-list">${results.map((e) => resultItemHtml(e, thr)).join('')}</div>`;
}

function resultItemHtml(e, thr) {
  const { verdict } = deriveSiteCheckVerdict(e, thr);
  const title = (e.personal && e.personal.title) || '';

  return `
    <button class="result-item" data-emp="${escapeHtml(e.employee_id)}">
      <span class="avatar">${escapeHtml(initials(e.name))}</span>
      <span class="result-info">
        <span class="result-name">${escapeHtml(e.name)}</span>
        <span class="result-meta">${escapeHtml(title)} · ${escapeHtml(e.employee_id)}</span>
      </span>
      <span class="v-dot v-${verdict}"></span>
    </button>`;
}

export function bindOfficerHomePageEvents() {
  const input = document.querySelector('#officer-search');
  const results = document.querySelector('#officer-results');
  if (!input || !results) return;

  // Repaint only the results container. A full render() would rebuild the input
  // and drop focus mid-word, which is why this page updates in place.
  const repaint = () => {
    results.innerHTML = resultsHtml();
    bindResultEvents();
    syncClearButton();
  };

  input.addEventListener('input', () => {
    SEARCH = input.value;
    repaint();
  });

  const clear = () => {
    SEARCH = '';
    input.value = '';
    input.focus();
    repaint();
  };

  // The × button lives outside #officer-results, so it is added/removed by hand
  // rather than by the repaint above.
  function syncClearButton() {
    const box = document.querySelector('.search-box');
    if (!box) return;
    const existing = box.querySelector('[data-action="search-clear"]');
    if (SEARCH && !existing) {
      const btn = document.createElement('button');
      btn.className = 'clear';
      btn.dataset.action = 'search-clear';
      btn.textContent = '×';
      btn.addEventListener('click', clear);
      box.appendChild(btn);
    } else if (!SEARCH && existing) {
      existing.remove();
    }
  }

  function bindResultEvents() {
    results.querySelectorAll('[data-emp]').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.emp;
        pushRecent(id);
        go('check/employee', id);
      });
    });
  }

  const existingClear = document.querySelector('[data-action="search-clear"]');
  if (existingClear) existingClear.addEventListener('click', clear);

  bindResultEvents();
}
