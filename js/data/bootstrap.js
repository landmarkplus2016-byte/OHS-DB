// bootstrap.js — the hardcoded first-access admin account and the shape of a
// fresh, empty data object. One job: provide the memory-only fallback state
// used when no JSON has been loaded yet.
//
// BOOTSTRAP_ADMIN is never written to any JSON (see CLAUDE.md rule 5). It exists
// only so the admin can log in on first visit and load or create real data.

import { DEFAULT_FIELD_OPTIONS } from '../constants/fields.js';

export const BOOTSTRAP_ADMIN = {
  user_id: 'bootstrap-admin',
  username: 'admin',
  password: 'admin123',
  role: 'admin',
  display_name: 'Administrator',
  active: true,
  can_do_site_check: false,
  created_at: '',
  created_by: 'system',
};

// Returns a full, valid, empty data object matching the JSON File Structure in
// CLAUDE.md. field_options is cloned from DEFAULT_FIELD_OPTIONS so later edits to
// the loaded data never mutate the shared constant.
export function makeBootstrapData() {
  return {
    meta: {
      version: '1.0',
      exported_at: null,
      exported_by: null,
      server_base_path: 'Z:\\ohs\\certs\\',
      employee_id_prefix: 'LM-EMP-',
      next_employee_number: 1,
      last_backup_at: '',
      backup_reminder_days: 7,
      warning_thresholds: {
        urgent_days: 30,
        soon_days: 60,
        plan_days: 90,
      },
      field_sync: {
        endpoint_url: '',
        drive_file_id: '',
        max_stale_days: 30,
        last_published_at: '',
      },
      rdt: {
        enabled: true,
        fiscal_year_start_month: 4,
        monthly_target_pct: 10,
        yearly_target_pct: 120,
        hire_grace_months: 3,
        repeat_months: [2, 3],
        next_log_number: 1,
      },
      field_options: {
        field_titles: [...DEFAULT_FIELD_OPTIONS.field_titles],
        safety_titles: [...DEFAULT_FIELD_OPTIONS.safety_titles],
        contractors: [...DEFAULT_FIELD_OPTIONS.contractors],
        subcontractors: [...DEFAULT_FIELD_OPTIONS.subcontractors],
        employment_status: [...DEFAULT_FIELD_OPTIONS.employment_status],
        legal_permission: [...DEFAULT_FIELD_OPTIONS.legal_permission],
      },
    },
    users: [{ ...BOOTSTRAP_ADMIN }],
    employees: [],
  };
}
