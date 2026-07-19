// officerVerdictPage.js — the answer to the only question the officer app
// exists to answer: can this person work today? One job: render the verdict for
// one employee, why it says that, and the certificates behind it.
//
// The verdict itself comes from js/utils/verdict.js — the same function the
// admin app's compliance column uses, never a copy (CLAUDE.md rule 10).
//
// Certificate file_links are never shown here: the field snapshot strips them,
// and an officer at a tower has no way to open a Drive link behind auth anyway.

import { ROUTE_PARAM } from '../state.js';
import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { escapeHtml, fmtDate, daysUntil } from '../utils/format.js';
import { deriveSiteCheckVerdict } from '../utils/verdict.js';
import { deriveCertState } from '../utils/compliance.js';
import { applicableCerts, CERT_LABEL_KEYS } from '../constants/fields.js';
import { certStateBadgeHtml, teamBadgeHtml, employmentStatusBadgeHtml, legalPermissionBadgeHtml } from '../components/badge.js';
import { OFFICER_STATE } from '../data/officerSync.js';

const VERDICT_ICONS = { cleared: '✓', warning: '⚠', blocked: '✕' };

function findEmployee(id) {
  const list = (OFFICER_STATE.snapshot && OFFICER_STATE.snapshot.employees) || [];
  return list.find((e) => e.employee_id === id) || null;
}

function thresholds() {
  const meta = OFFICER_STATE.snapshot && OFFICER_STATE.snapshot.meta;
  return (meta && meta.warning_thresholds) || { urgent_days: 30, soon_days: 60, plan_days: 90 };
}

export function renderOfficerVerdictPage() {
  const emp = findEmployee(ROUTE_PARAM);

  // Unknown id (stale link, or the employee left the snapshot on the last sync).
  if (!emp) {
    return `
      <div class="body">
        <div class="empty"><div class="big">–</div><div>${t('empty_none')}</div></div>
        <button class="btn btn-ghost btn-lg btn-block" data-action="verdict-back">${t('back')}</button>
      </div>`;
  }

  const thr = thresholds();
  const v = deriveSiteCheckVerdict(emp, thr);
  const p = emp.personal || {};

  return `
    <div class="verdict-hero ${v.verdict}">
      <button class="verdict-back" data-action="verdict-back" aria-label="${t('back')}">←</button>
      <div class="verdict-icon">${VERDICT_ICONS[v.verdict]}</div>
      <div class="verdict-label">${t('verdict_' + v.verdict)}</div>
      <div class="verdict-sub">${t('verdict_sub_' + v.verdict)}</div>
    </div>

    <div class="emp-card">
      <div class="emp-name">${escapeHtml(emp.name)}</div>
      <div class="emp-natid">${escapeHtml(emp.national_id)}</div>
      <div class="emp-tags">
        ${teamBadgeHtml(emp.team)}
        ${p.title ? `<span class="badge tag-title">${escapeHtml(p.title)}</span>` : ''}
        ${employmentStatusBadgeHtml(p.employment_status)}
        ${legalPermissionBadgeHtml(p.legal_permission)}
      </div>
    </div>

    ${reasonsHtml(v)}

    <div class="cert-block">
      <h3>${t('section_all_certs')}</h3>
      ${applicableCerts(emp).map((k) => certLineHtml(emp, k, thr)).join('')}
    </div>

    <div style="height:20px"></div>`;
}

// Blockers and warnings share one "Issues found" section: the officer wants a
// single list of what is wrong, ordered worst-first, not two competing headings.
function reasonsHtml(v) {
  if (!v.blockers.length && !v.warnings.length) return '';

  const headingClass = v.blockers.length ? 'blocked-h' : 'warning-h';
  const rows = [
    ...v.blockers.map((r) => reasonItemHtml(r, 'blocker', '✕')),
    ...v.warnings.map((r) => reasonItemHtml(r, 'warning', '⚠')),
  ].join('');

  return `
    <div class="reasons">
      <h3 class="${headingClass}">${t('section_reasons')}</h3>
      ${rows}
    </div>`;
}

// r.text is already-translated display text built by verdict.js from t().
function reasonItemHtml(r, cls, icon) {
  return `
    <div class="reason-item ${cls}">
      <span class="reason-ic">${icon}</span>
      <span class="reason-txt">${escapeHtml(r.text)}</span>
    </div>`;
}

function certLineHtml(emp, key, thr) {
  const cert = (emp.certificates && emp.certificates[key]) || {};
  const expiry = cert.expiry_date || '';
  const state = deriveCertState(expiry, thr, cert.na);

  // N/A: not needed for this employee — show the note instead of a date/countdown.
  const d = state === 'na' ? null : daysUntil(expiry);
  const age = d === null ? '' : ` (${d >= 0 ? `${d} ${t('days_left')}` : `${Math.abs(d)} ${t('days_ago')}`})`;
  const dateLine = state === 'na' ? t('cert_na_note') : `${fmtDate(expiry)}${age}`;

  return `
    <div class="cert-line">
      <div>
        <div class="cert-line-name">${t(CERT_LABEL_KEYS[key])}</div>
        <div class="cert-line-date">${dateLine}</div>
      </div>
      ${certStateBadgeHtml(state)}
    </div>`;
}

export function bindOfficerVerdictPageEvents() {
  document.querySelectorAll('[data-action="verdict-back"]').forEach((b) => {
    b.addEventListener('click', () => go('check/home'));
  });
}
