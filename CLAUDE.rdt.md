# CLAUDE.rdt.md — RDT Feature Addendum
> This file extends CLAUDE.md with the Random Drug Test (RDT) feature.
> Read CLAUDE.md first, then read this. All rules in CLAUDE.md still apply.
> When this file conflicts with CLAUDE.md, this file wins for anything RDT-related.

---

## What RDT Adds

A new admin-only feature to plan and track Random Drug Tests across the fiscal year:

- Each month, the system proposes a randomized list of employees to test
- Admin marks each test as completed, missed, or swaps out a person who's unavailable
- Every test is logged per employee with date, status, result, notes
- A yearly progress view tracks coverage against a 120% target

**Admin desktop only.** Officers never see any RDT data. The field snapshot strips `rdt_log` before publishing.

---

## Compliance Rules (the "why")

Landmark's OHS policy requires **120% RDT coverage per fiscal year**:

- **Fiscal year:** April 1 → March 31
- **Apr–Jan (10 months):** 10% of the eligible pool tested each month → cumulatively 100% of employees tested once
- **Feb + Mar (2 months):** 10% each month, drawn from employees already tested this fiscal year (repeat tests)
- **Total:** 120% coverage

**Who's in scope:**
- All Field Team employees (any title)
- Safety Team employees **only** if their `personal.title === "Safety Officer"` — HSE Managers, Coordinators, Directors, etc. are excluded
- Must be `personal.employment_status === "Active"` and `personal.archived === false`
- Must have `personal.hired_date` at least **3 months** before the selection date (new hires are covered by their hiring medical checkup for the first 3 months)

---

## Non-Negotiable Rules (RDT-specific)

These extend the "Non-Negotiable Rules" section of CLAUDE.md.

1. **Selection is random.** Never sort the pool by anything other than a random shuffle before slicing to the monthly quota.
2. **Rolling pool.** Recompute the eligible pool at the moment of selection — do NOT freeze the pool at the start of the fiscal year. Hires who cross the 3-month grace after Apr 1 become eligible mid-year; resigned/terminated/archived employees drop out.
3. **Rounding is round-to-nearest.** 137 × 0.10 = 13.7 → 14. Use `Math.round()`. If fewer eligible employees remain than the quota (Feb/Mar with a small pool, or year-end drift), test only what's available — never pad the list.
4. **Apr–Jan phase: no repeats within the fiscal year.** An employee tested in May cannot be picked again until Feb at the earliest. Enforce by excluding anyone with a `completed` entry in `rdt_log` for the current fiscal year.
5. **Feb + Mar phase: only repeats.** Pick randomly from employees who already have a `completed` entry for the current fiscal year. If someone is picked in Feb, they can still be picked again in Mar (Mar re-randomizes over the full "already-tested" pool).
6. **Missed tests re-open eligibility.** If a test is marked `missed`, that employee returns to the untested pool and can be picked in a subsequent month. A `missed` entry does NOT count toward the 100%.
7. **Swap = re-pick.** When admin swaps out a selected employee (e.g. on leave that day), the system randomly picks one replacement from the remaining eligible pool. The original entry is deleted, not marked missed. Missed is for "we tried and it didn't happen"; swap is for "we knew in advance."
8. **Log is per-employee, append-only in practice.** Entries live inside each employee's `rdt_log` array. Editing an existing entry's date/result/notes is allowed (admin fat-finger fixes). Deleting an entry is allowed but warns.
9. **RDT data is admin-only.** `publishFieldSnapshot()` must strip `rdt_log` from every employee before writing the snapshot file. `js/data/officerSync.js` never receives or displays RDT data.
10. **Feature is opt-in via config.** `meta.rdt` must exist for the RDT page to function. If missing, the RDT page shows a one-click "Enable RDT feature" button that seeds default config.

---

## JSON Schema Changes

### Remove

The old flat `drug_tests` object is **removed entirely** from every employee record:

```diff
- "drug_tests": {
-   "rdt_1": "2025-12-28",
-   "rdt_2": "",
-   "rdt":   ""
- }
```

Excel import must ignore any RDT-shaped columns in the source spreadsheet — those columns are legacy and no longer map to anything. The employee form must not render RDT date inputs.

### Add — `meta.rdt`

```json
"meta": {
  ...
  "rdt": {
    "enabled": true,
    "fiscal_year_start_month": 4,
    "monthly_target_pct": 10,
    "yearly_target_pct": 120,
    "hire_grace_months": 3,
    "repeat_months": [2, 3],
    "next_log_number": 1
  }
}
```

- `fiscal_year_start_month`: 1–12, defaults to 4 (April)
- `repeat_months`: array of month numbers (1–12) that are Feb/Mar repeat phase. Default `[2, 3]`
- `next_log_number`: monotonically incrementing counter used to build `log_id`

### Add — `employee.rdt_log`

Every employee record gains an `rdt_log` array. Present even if empty.

```json
{
  "employee_id": "LM-EMP-0001",
  ...
  "rdt_log": [
    {
      "log_id": "rdt-000001",
      "fiscal_year": "2026-2027",
      "selected_at": "2026-05-03",
      "selected_by": "khaled",
      "test_date": "2026-05-08",
      "status": "completed",
      "result": "pass",
      "notes": ""
    },
    {
      "log_id": "rdt-000002",
      "fiscal_year": "2026-2027",
      "selected_at": "2026-11-01",
      "selected_by": "khaled",
      "test_date": "",
      "status": "missed",
      "result": "",
      "notes": "On leave — reschedule next month"
    }
  ]
}
```

Field notes:

- **`log_id`** — `rdt-######`, incremented from `meta.rdt.next_log_number`. Stable, unique across the whole dataset.
- **`fiscal_year`** — string like `"2026-2027"`, computed at selection time. Format: `"{start_year}-{end_year}"` where start_year is the calendar year of April 1 for that fiscal year.
- **`selected_at`** — ISO date when admin generated the selection.
- **`selected_by`** — username of the admin who generated it.
- **`test_date`** — ISO date when the test actually happened. Empty until admin marks completed. For `missed` entries, stays empty.
- **`status`** — `"selected"` | `"completed"` | `"missed"`. Starts at `"selected"` when the monthly list is generated.
- **`result`** — `"pass"` | `"fail"` | `""`. Only meaningful when `status === "completed"`.
- **`notes`** — free text, up to ~500 chars. Admin's discretion.

---

## Selection Algorithm

Implemented in `js/utils/rdt.js`. Every function is pure — takes state, returns new state; no side effects. `dataActions.js` wraps mutations.

### Fiscal year helpers

```js
export function currentFiscalYear(today, startMonth) {
  // If today's month >= startMonth: FY starts this calendar year
  // Else: FY started last calendar year
  // Returns { start_year, end_year, label: "2026-2027", start_date, end_date }
}

export function isRepeatMonth(today, rdtConfig) {
  return rdtConfig.repeat_months.includes(today.getMonth() + 1);
}
```

### Eligible pool

```js
export function eligibleEmployees(allEmployees, today, rdtConfig) {
  return allEmployees.filter(emp => {
    if (emp.personal.archived) return false;
    if (emp.personal.employment_status !== 'Active') return false;
    if (emp.team === 'safety' && emp.personal.title !== 'Safety Officer') return false;
    // team === 'field' → all titles pass
    if (!emp.personal.hired_date) return false;
    const hired = new Date(emp.personal.hired_date);
    const graceMs = rdtConfig.hire_grace_months * 30.44 * 86400 * 1000; // approx month
    if ((today - hired) < graceMs) return false;
    return true;
  });
}
```

### Untested vs already-tested (current fiscal year)

```js
export function testedThisYear(employee, fyLabel) {
  return (employee.rdt_log || []).some(e =>
    e.fiscal_year === fyLabel && e.status === 'completed'
  );
}

export function selectedOrCompletedThisMonth(employee, monthISO /* "YYYY-MM" */) {
  return (employee.rdt_log || []).some(e => {
    if (e.status === 'missed') return false;
    const d = e.selected_at || e.test_date;
    return d && d.startsWith(monthISO);
  });
}
```

### Monthly quota

```js
export function monthlyQuota(poolSize, pct) {
  return Math.round((pct / 100) * poolSize);
}
```

### Generate monthly selection

```js
export function generateMonthlySelection(allEmployees, today, rdtConfig) {
  const fy = currentFiscalYear(today, rdtConfig.fiscal_year_start_month);
  const pool = eligibleEmployees(allEmployees, today, rdtConfig);
  const quota = monthlyQuota(pool.length, rdtConfig.monthly_target_pct);
  const monthISO = today.toISOString().slice(0, 7);

  // Exclude anyone already selected/completed THIS calendar month
  // (prevents accidentally regenerating a duplicate list within the same month)
  const notThisMonth = pool.filter(e => !selectedOrCompletedThisMonth(e, monthISO));

  let candidates;
  if (isRepeatMonth(today, rdtConfig)) {
    // Feb/Mar: only those already tested this fiscal year
    candidates = notThisMonth.filter(e => testedThisYear(e, fy.label));
  } else {
    // Apr–Jan: only those NOT yet tested this fiscal year
    candidates = notThisMonth.filter(e => !testedThisYear(e, fy.label));
  }

  const shuffled = shuffle(candidates); // Fisher-Yates
  return shuffled.slice(0, Math.min(quota, shuffled.length));
}
```

### Fisher-Yates shuffle (utility)

```js
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

### Yearly progress

```js
export function yearlyProgress(allEmployees, today, rdtConfig) {
  const fy = currentFiscalYear(today, rdtConfig.fiscal_year_start_month);
  const pool = eligibleEmployees(allEmployees, today, rdtConfig);
  const target = Math.round((rdtConfig.yearly_target_pct / 100) * pool.length);

  let completed = 0;
  let uniqueTested = new Set();
  for (const emp of pool) {
    for (const entry of (emp.rdt_log || [])) {
      if (entry.fiscal_year === fy.label && entry.status === 'completed') {
        completed++;
        uniqueTested.add(emp.employee_id);
      }
    }
  }

  return {
    fiscal_year: fy.label,
    pool_size: pool.length,
    yearly_target: target,
    completed_count: completed,
    unique_tested_count: uniqueTested.size,
    coverage_pct: pool.length ? (uniqueTested.size / pool.length) * 100 : 0,
    target_pct: (completed / (target || 1)) * 100
  };
}
```

---

## Data Actions (extensions to `js/data/dataActions.js`)

Add these mutating actions. Every one calls `scheduleAutosave()` at the end.

- **`enableRdt()`** — seeds `DATA.meta.rdt` with defaults if missing. Called from the RDT page's onboarding state.
- **`generateAndSaveMonthlySelection(user)`** — calls `generateMonthlySelection()`, creates a new log entry per selected employee with `status: 'selected'`, `selected_at: todayISO()`, `selected_by: user.username`, `fiscal_year: fy.label`, increments `meta.rdt.next_log_number` per entry. Returns the created entries.
- **`markRdtCompleted(employee_id, log_id, test_date, result, notes)`** — finds the entry, sets `status: 'completed'`, `test_date`, `result`, `notes`. Errors if entry not found or already completed/missed.
- **`markRdtMissed(employee_id, log_id, notes)`** — sets `status: 'missed'`, keeps `test_date` empty.
- **`swapRdtSelection(employee_id, log_id, user)`** — deletes the entry, then picks a random replacement from the current eligible pool (excluding anyone already selected/completed this month), creates a new `selected` entry for the replacement. Returns the replacement employee. Errors if no replacement available.
- **`editRdtEntry(employee_id, log_id, updates)`** — for correcting typos/mistakes on any completed entry. Whitelist: `test_date`, `result`, `notes`.
- **`deleteRdtEntry(employee_id, log_id)`** — hard delete. UI must confirm.

`publishFieldSnapshot()` must be updated to strip `rdt_log` from every employee in the published snapshot.

Excel import (`js/utils/excelImport.js`) must NOT map any RDT-shaped columns. Old spreadsheets with RDT columns still import — those columns are just ignored.

---

## Compliance State Interaction

**RDT status does NOT affect the site-check verdict.** An employee overdue for RDT is still `cleared` for site work if their certificates and legal permission are in order. This is intentional — RDT is compliance/HR paperwork, not a safety blocker. If Khaled ever wants to make it a blocker, add it to `js/utils/verdict.js` in a future phase.

**RDT status does NOT affect the dashboard KPIs.** The RDT page has its own progress view. The main dashboard stays certificate-focused.

---

## App Route Additions

Add to the admin routes table in CLAUDE.md:

| Route | Renders | Who |
|---|---|---|
| `#/rdt` | RDT dashboard: yearly progress + this month's selection + recent log | admin |
| `#/rdt/history` | Full year log, filterable by month/status/result/team | admin |

Sidebar: add a new nav item **"RDT"** between "Renewals" and "Export".

---

## File Map Additions

New files:

```
js/
├── pages/
│   └── rdtPage.js               # renderRdtPage(), renderRdtHistoryPage()
├── utils/
│   └── rdt.js                   # All selection algorithm functions (pure, testable)
```

Modified files:

```
js/data/dataActions.js           # Add: enableRdt, generateAndSaveMonthlySelection,
                                 #      markRdtCompleted, markRdtMissed,
                                 #      swapRdtSelection, editRdtEntry, deleteRdtEntry
                                 # Modify: publishFieldSnapshot to strip rdt_log

js/data/bootstrap.js             # makeBootstrapData(): add default meta.rdt block,
                                 # remove drug_tests from any sample employee shape

js/constants/fields.js           # Remove any drug_tests-related constants if they exist

js/utils/excelImport.js          # Remove RDT column aliases from the header map,
                                 # ignore any RDT-shaped columns in source files

js/pages/employeeFormPage.js     # Remove Drug tests section entirely

js/pages/employeeDetailPage.js   # Replace Drug tests section with "RDT history" section
                                 # showing the employee's rdt_log entries chronologically

js/pages/employeeListPage.js     # Remove any legacy RDT date columns.
                                 # Optional: add a "Last RDT" column showing the most
                                 # recent completed rdt_log entry date, "—" if none.

js/components/sidebar.js         # Add RDT nav item

js/i18n/en.js + ar.js            # Add all RDT-related i18n keys (see i18n section below)
```

---

## i18n Keys to Add

Add every key in both `en.js` and `ar.js`. English values below; Arabic values must be provided.

```js
// Nav
nav_rdt: 'RDT',                                 // Arabic: 'الفحص العشوائي للمخدرات'

// Page titles
rdt_page_title: 'Random Drug Testing',
rdt_page_sub: 'Monthly selection and yearly compliance tracking',
rdt_history_title: 'RDT history',

// Enable feature (onboarding)
rdt_enable_prompt: 'RDT tracking is not yet configured for this dataset.',
rdt_enable_button: 'Enable RDT feature',

// Yearly progress
rdt_fiscal_year: 'Fiscal year {label}',
rdt_pool_size: 'Eligible employees',
rdt_yearly_target: 'Yearly target',
rdt_completed: 'Completed',
rdt_unique_tested: 'Unique employees tested',
rdt_coverage: 'Coverage',
rdt_target_progress: 'Target progress',

// Monthly section
rdt_this_month: "This month's selection",
rdt_month_phase_normal: 'First-time tests (Apr–Jan phase)',
rdt_month_phase_repeat: 'Repeat tests (Feb/Mar phase)',
rdt_generate: 'Generate this month',
rdt_regenerate: 'Regenerate this month',
rdt_no_selection: 'No selection generated yet for this month.',
rdt_quota_line: '{quota} of {pool} eligible ({pct}%)',
rdt_no_eligible: 'No eligible employees remain for this phase.',
rdt_confirm_regenerate: 'Regenerate this month\'s list? Existing selections not yet completed will be discarded.',

// Row actions
rdt_mark_completed: 'Mark completed',
rdt_mark_missed: 'Mark missed',
rdt_swap: 'Swap',
rdt_edit: 'Edit',
rdt_delete: 'Delete',

// Complete modal
rdt_complete_title: 'Mark RDT completed',
rdt_test_date: 'Test date',
rdt_result: 'Result',
rdt_result_pass: 'Pass',
rdt_result_fail: 'Fail',
rdt_notes: 'Notes',

// Miss modal
rdt_miss_title: 'Mark RDT missed',
rdt_miss_reason: 'Reason (leave, refusal, no-show, etc.)',

// Swap
rdt_swap_confirm: 'Swap {name} for a random replacement?',
rdt_swap_no_replacement: 'No replacement available in the current eligible pool.',
rdt_swap_done: '{oldName} swapped for {newName}',

// Delete
rdt_delete_confirm: 'Delete this RDT entry? This cannot be undone.',

// Status labels
rdt_status_selected: 'Selected',
rdt_status_completed: 'Completed',
rdt_status_missed: 'Missed',

// History filters
rdt_filter_month: 'Month',
rdt_filter_status: 'Status',
rdt_filter_result: 'Result',
rdt_filter_team: 'Team',

// Employee detail section
rdt_history_section: 'RDT history',
rdt_history_empty: 'No RDT entries yet.',

// List view column
col_last_rdt: 'Last RDT',

// Settings
rdt_settings_title: 'RDT settings',
rdt_setting_fy_start: 'Fiscal year start month',
rdt_setting_monthly_pct: 'Monthly target %',
rdt_setting_yearly_pct: 'Yearly target %',
rdt_setting_hire_grace: 'New-hire grace (months)',
rdt_setting_repeat_months: 'Repeat months',
```

---

## Design Notes

The RDT page follows the same layout language as the Renewals page (see `design/ohs_admin_prototype.html` for the visual template) — no new component types required.

**Page structure (`#/rdt`):**

1. **Topbar** — title "RDT" + sub "Random Drug Testing" + Export JSON button (standard)
2. **Progress hero card** — big number: `{completed_count} / {yearly_target}` this fiscal year. Sub-line: coverage %, pool size, phase indicator ("Apr–Jan first-round" or "Feb/Mar repeat round")
3. **Yearly progress bar** — one horizontal bar showing `completed / target` in accent color, with a subtle marker at the 100% point (end of first-round phase)
4. **This month's selection card** — heading "This month · {monthLabel}" + phase label + quota line + Generate/Regenerate button
   - If not generated: empty state with big Generate button
   - If generated: table of selected employees (name, employee_id, team badge, title, status badge, row actions)
5. **Recent activity card** — last ~15 log entries across all employees this fiscal year, most recent first
6. **Link to full history** (`#/rdt/history`)

**Settings integration** — add an "RDT" section to Settings → Thresholds tab (or a new "RDT" tab if it gets crowded) exposing the `meta.rdt` fields. This is optional for v1; defaults are fine for most cases.

**Empty state (feature not enabled)** — a friendly card with a summary of what RDT does + the Enable button.

---

## Testing Notes

Selection randomness must be verifiable but not annoying to test:
- Never seed the RNG in production code — real randomness is required
- For tests, admin can regenerate a month's selection any number of times before the first person is marked completed, to shuffle the list

The `Math.round()` rounding rule handles all edge cases:
- Pool of 3, 10% → round(0.3) → 0 tests that month (correct — tiny team, no monthly tests)
- Pool of 5, 10% → round(0.5) → 1 test
- Pool of 137, 10% → round(13.7) → 14
- Pool of 8 in Feb repeat, but only 3 already tested → quota 1, only 3 candidates → picks 1 correctly

---

## What NOT to Do (RDT-specific additions to CLAUDE.md's "What NOT to Do")

- Never expose `rdt_log` or `meta.rdt` to the officer app
- Never let the site-check verdict depend on RDT status
- Never sort the eligible pool by anything other than random shuffle before selection
- Never persist RNG state or seed — randomness must be fresh each run
- Never allow generating a monthly selection that would create duplicates within the same calendar month for the same employee
- Never allow Feb/Mar to pick employees who haven't been tested yet this fiscal year — that would create a false "completed" record without an actual first-round test
- Never re-introduce the flat `drug_tests` object — the `rdt_log` array is the sole source of truth
