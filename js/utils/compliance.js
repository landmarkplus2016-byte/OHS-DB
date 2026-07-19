// compliance.js — certificate expiry status derivation.
// Status is ALWAYS derived here at render time, never stored in the JSON.

import { applicableCerts } from '../constants/fields.js';
import { daysUntil } from './format.js';

// Derives a single certificate's state from its expiry date + thresholds.
// `na` (the admin's "not needed for this employee" flag) short-circuits to the
// 'na' state so this cert is shown as N/A and excluded from every aggregate —
// it is never "missing". See CLAUDE.md "Compliance Derivation" for the table.
export function deriveCertState(dateStr, thresholds, na) {
  if (na) return 'na';
  if (!dateStr) return 'missing';
  const d = daysUntil(dateStr);
  if (d < 0) return 'expired';
  if (d <= thresholds.urgent_days) return 'urgent';
  if (d <= thresholds.soon_days) return 'soon';
  if (d <= thresholds.plan_days) return 'plan';
  return 'valid';
}

// Ranking used to pick the aggregate "worst" state (higher wins).
// missing outranks valid so an all-valid-but-one-missing employee reads honestly.
// na never competes for "worst" — the aggregate loop skips it entirely.
export function stateRank(state) {
  return { expired: 5, urgent: 4, soon: 3, plan: 2, missing: 1, valid: 0, na: -1 }[state] || 0;
}

// Aggregate compliance for an employee across the certs applicable to their team.
// Certificates flagged N/A are recorded in per_cert (so the UI can show the N/A
// badge) but take no part in worst / the counts — they are not required work.
export function deriveEmployeeCompliance(employee, thresholds) {
  const keys = applicableCerts(employee);
  const per_cert = {};
  let worst = 'valid';
  let expiring_soon_count = 0;
  let expired_count = 0;

  keys.forEach((k) => {
    const cert = employee.certificates?.[k];
    const s = deriveCertState(cert?.expiry_date, thresholds, cert?.na);
    per_cert[k] = s;
    if (s === 'na') return; // not needed for this employee — excluded from aggregate
    if (stateRank(s) > stateRank(worst)) worst = s;
    if (s === 'expired') expired_count++;
    else if (s === 'urgent' || s === 'soon' || s === 'plan') expiring_soon_count++;
  });

  return { per_cert, worst, expiring_soon_count, expired_count };
}
