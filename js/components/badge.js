// badge.js — small stateless pill renderers shared across admin and officer UIs.
// One job: turn a derived state/verdict/status into its coloured pill markup.
// Colours live in css/components.css; labels come through t().

import { t } from '../i18n/i18n.js';
import { escapeHtml } from '../utils/format.js';

const CERT_STATES = ['valid', 'plan', 'soon', 'urgent', 'expired', 'missing'];
const VERDICTS = ['cleared', 'warning', 'blocked'];

// Small per-certificate state pill (cert rows, verdict cert list).
export function certStateBadgeHtml(state) {
  const s = CERT_STATES.includes(state) ? state : 'missing';
  return `<span class="cert-state cs-${s}">${t('st_' + s)}</span>`;
}

// Larger aggregate pill for an employee's worst compliance state (lists/detail).
export function complianceBadgeHtml(worst) {
  const s = CERT_STATES.includes(worst) ? worst : 'missing';
  return `<span class="badge st-${s}">${t('st_' + s)}</span>`;
}

// Site-check verdict pill.
export function verdictBadgeHtml(verdict) {
  const v = VERDICTS.includes(verdict) ? verdict : 'blocked';
  return `<span class="badge v-${v}">${t('verdict_' + v)}</span>`;
}

// Employment-status pill: 'Active' reads as a green pill, anything else grey.
// The status text is data (from field_options), not an i18n key, so it is
// escaped and shown as-is.
export function employmentStatusBadgeHtml(status) {
  const cls = status === 'Active' ? 'emp-active' : 'emp-inactive';
  return `<span class="badge ${cls}">${escapeHtml(status)}</span>`;
}
