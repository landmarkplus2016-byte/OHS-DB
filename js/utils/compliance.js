// compliance.js — certificate expiry status derivation.
// Status is ALWAYS derived here at render time, never stored in the JSON.

import { applicableCerts } from '../constants/fields.js';
import { daysUntil } from './format.js';

// Derives a single certificate's state from its expiry date + thresholds.
// See CLAUDE.md "Compliance Derivation" for the exact table.
export function deriveCertState(dateStr, thresholds) {
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
export function stateRank(state) {
  return { expired: 5, urgent: 4, soon: 3, plan: 2, missing: 1, valid: 0 }[state] || 0;
}

// Aggregate compliance for an employee across the certs applicable to their team.
export function deriveEmployeeCompliance(employee, thresholds) {
  const keys = applicableCerts(employee);
  const per_cert = {};
  let worst = 'valid';
  let expiring_soon_count = 0;
  let expired_count = 0;

  keys.forEach((k) => {
    const s = deriveCertState(employee.certificates?.[k]?.expiry_date, thresholds);
    per_cert[k] = s;
    if (stateRank(s) > stateRank(worst)) worst = s;
    if (s === 'expired') expired_count++;
    else if (s === 'urgent' || s === 'soon' || s === 'plan') expiring_soon_count++;
  });

  return { per_cert, worst, expiring_soon_count, expired_count };
}
