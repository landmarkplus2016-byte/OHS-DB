// fields.js — certificate keys, labels, verdict groupings, and admin-managed
// dropdown lists. One job: define the field/certificate vocabulary of the app.

import { DATA } from '../state.js';

// Certificates that apply to every employee (field + safety).
export const CERT_KEYS = ['wah_practical', 'wah_theoretical', 'ra', 'fa', 'ff', 'ec', 'mcu'];

// Certificates that apply to safety-team employees only.
export const SAFETY_ONLY_KEYS = ['ppe_inspection', 'lifting', 'scaffolding'];

// Full set (safety team). Field team uses CERT_KEYS.
export const ALL_CERT_KEYS = [...CERT_KEYS, ...SAFETY_ONLY_KEYS];

// Maps each certificate key to its i18n label key (resolve via t()).
export const CERT_LABEL_KEYS = {
  wah_practical: 'cert_wah_p',
  wah_theoretical: 'cert_wah_t',
  ra: 'cert_ra',
  fa: 'cert_fa',
  ff: 'cert_ff',
  ec: 'cert_ec',
  mcu: 'cert_mcu',
  ppe_inspection: 'cert_ppe',
  lifting: 'cert_lifting',
  scaffolding: 'cert_scaffolding',
};

// Certificates that count as blockers in the site-check verdict (expired → blocked).
export const BLOCKER_CERT_KEYS = ['wah_practical', 'wah_theoretical', 'mcu'];

// Certificates that count as warnings only (never block).
export const WARNING_CERT_KEYS = ['fa', 'ff', 'ra', 'ec'];

// The admin-managed dropdown lists, keyed as stored under meta.field_options.
export const LIST_FIELD_KEYS = [
  'field_titles',
  'safety_titles',
  'contractors',
  'subcontractors',
  'employment_status',
  'legal_permission',
];

// Fallback values used when no JSON is loaded, or a list key is absent.
export const DEFAULT_FIELD_OPTIONS = {
  field_titles:      ['Team Leader', 'Technician', 'Rigger', 'Site Engineer', 'Engineer', 'Welder', 'Helper', 'Driver', 'Driver&Helper'],
  safety_titles:     ['HSE Director', 'HSE Manager', 'Safety Manager', 'Safety Coordinator', 'DC Coordinator', 'Safety Officer'],
  contractors:       ['Landmark'],
  subcontractors:    ['Landmark', 'Upper Telecom', 'New Plan', 'DAM Telecom', 'Basic', 'Startech', 'Value', 'AS Link', 'Expert', 'Apex'],
  employment_status: ['Active', 'Suspended', 'Terminated', 'Resigned'],
  legal_permission:  ['Approved', 'Not approved', 'Pending'],
};

// Returns the admin-configured list for `key` from the loaded data, or the
// default if nothing is loaded / the key is absent.
//
// DATA is imported as a live binding and read only here (at call time), never
// during module evaluation — this is what keeps the state.js <-> fields.js
// cycle safe, since fields.js never touches DATA while either module is loading.
export function getFieldOptions(key) {
  const configured = DATA && DATA.meta && DATA.meta.field_options
    ? DATA.meta.field_options[key]
    : undefined;
  if (Array.isArray(configured)) return configured;
  return DEFAULT_FIELD_OPTIONS[key] || [];
}

// Certificate keys that apply to a given employee: CERT_KEYS for field,
// ALL_CERT_KEYS for safety.
export function applicableCerts(employee) {
  return employee && employee.team === 'safety' ? ALL_CERT_KEYS : CERT_KEYS;
}
