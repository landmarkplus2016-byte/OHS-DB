// verdict.js — site-check verdict logic.
// SHARED by the admin app (compliance column / dashboard) and the officer app
// (verdict card). Never duplicate this logic anywhere else.

import { BLOCKER_CERT_KEYS, WARNING_CERT_KEYS, CERT_LABEL_KEYS } from '../constants/fields.js';
import { daysUntil } from './format.js';
import { t } from '../i18n/i18n.js';

// Returns { verdict, blockers, warnings } where verdict is
// 'cleared' | 'warning' | 'blocked' and each reason is { type, text }.
// See CLAUDE.md "Site Check Verdict" for the exact rules.
export function deriveSiteCheckVerdict(employee, thresholds) {
  const blockers = [];
  const warnings = [];
  const p = employee.personal || {};

  // Status / legal blockers
  if (p.employment_status !== 'Active') blockers.push({ type: 'status', text: t('reason_not_active') });
  if (p.archived) blockers.push({ type: 'status', text: t('reason_archived') });
  if (p.legal_permission !== 'Approved') blockers.push({ type: 'legal', text: t('reason_legal') });

  // Blocker certificates: expired → blocker; expiring within urgent window → warning.
  // A missing expiry date (empty) is neither a blocker nor a warning.
  BLOCKER_CERT_KEYS.forEach((k) => {
    const dtStr = employee.certificates?.[k]?.expiry_date;
    if (!dtStr) return;
    const d = daysUntil(dtStr);
    if (d < 0) {
      blockers.push({ type: 'cert', text: t('reason_expired', { cert: t(CERT_LABEL_KEYS[k]), days: Math.abs(d) }) });
    } else if (d <= thresholds.urgent_days) {
      warnings.push({ type: 'cert', text: t('reason_expiring', { cert: t(CERT_LABEL_KEYS[k]), days: d }) });
    }
  });

  // Warning certificates: expired OR expiring within urgent window → warning only.
  WARNING_CERT_KEYS.forEach((k) => {
    const dtStr = employee.certificates?.[k]?.expiry_date;
    if (!dtStr) return;
    const d = daysUntil(dtStr);
    if (d < 0) {
      warnings.push({ type: 'cert', text: t('reason_expired', { cert: t(CERT_LABEL_KEYS[k]), days: Math.abs(d) }) });
    } else if (d <= thresholds.urgent_days) {
      warnings.push({ type: 'cert', text: t('reason_expiring', { cert: t(CERT_LABEL_KEYS[k]), days: d }) });
    }
  });

  if (blockers.length) return { verdict: 'blocked', blockers, warnings };
  if (warnings.length) return { verdict: 'warning', blockers: [], warnings };
  return { verdict: 'cleared', blockers: [], warnings: [] };
}
