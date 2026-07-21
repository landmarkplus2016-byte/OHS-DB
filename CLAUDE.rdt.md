# CLAUDE.rdt.md — RDT Feature Addendum

> This file extends CLAUDE.md with the Random Drug Test (RDT) feature.
> Read CLAUDE.md first, then read this. All rules in CLAUDE.md still apply.
> When this file conflicts with CLAUDE.md, this file wins for anything RDT-related.

\---

## What RDT Adds

A new admin-only feature to plan and track Random Drug Tests across the fiscal year:

* Each month, the system proposes a randomized list of employees to test
* Admin marks each test as completed, missed, or swaps out a person who's unavailable
* Every test is logged per employee with date, status, result, notes
* A yearly progress view tracks coverage against a 120% target

**Admin desktop only.** Officers never see any RDT data. The field snapshot strips `rdt\_log` before publishing.

\---

## Compliance Rules (the "why")

Landmark's OHS policy requires **120% RDT coverage per fiscal year**:

* **Fiscal year:** April 1 → March 31
* **Apr–Jan (10 months):** 10% of the eligible pool tested each month → cumulatively 100% of employees tested once
* **Feb + Mar (2 months):** 10% each month, drawn from employees already tested this fiscal year (repeat tests)
* **Total:** 120% coverage

**Who's in scope:**

* All Field Team employees (any title)
* Safety Team employees **only** if their `personal.title === "Safety Officer"` — HSE Managers, Coordinators, Directors, etc. are excluded
* Must be `personal.employment\_status === "Active"` and `personal.archived === false`
* Must have `personal.hired\_date` at least **3 months** before the selection date (new hires are covered by their hiring medical checkup for the first 3 months)

\---

## Non-Negotiable Rules (RDT-specific)

These extend the "Non-Negotiable Rules" section of CLAUDE.md.

1. **Selection is random.** Never sort the pool by anything other than a random shuffle before slicing to the monthly quota.
2. **Rolling pool.** Recompute the eligible pool at the moment of selection — do NOT freeze the pool at the start of the fiscal year. Hires who cross the 3-month grace after Apr 1 become eligible mid-year; resigned/terminated/archived employees drop out.
3. **Rounding is round-to-nearest.** 137 × 0.10 = 13.7 → 14. Use `Math.round()`. If fewer eligible employees remain than the quota (Feb/Mar with a small pool, or year-end drift), test only what's available — never pad the list.
4. **Apr–Jan phase: no repeats within the fiscal year.** An employee tested in May cannot be picked again until Feb at the earliest. Enforce by excluding anyone with a `completed` entry in `rdt\_log` for the current fiscal year.
5. **Feb + Mar phase: only repeats.** Pick randomly from employees who already have a `completed` entry for the current fiscal year. If someone is picked in Feb, they can still be picked again in Mar (Mar re-randomizes over the full "already-tested" pool).
6. **Missed tests re-open eligibility.** If a test is marked `missed`, that employee returns to the untested pool and can be picked in a subsequent month. A `missed` entry does NOT count toward the 100%.
7. **Swap = re-pick.** When admin swaps out a selected employee (e.g. on leave that day), the system randomly picks one replacement from the remaining eligible pool. The original entry is deleted, not marked missed. Missed is for "we tried and it didn't happen"; swap is for "we knew in advance."
8. **Log is per-employee, append-only in practice.** Entries live inside each employee's `rdt\_log` array. Editing an existing entry's date/result/notes is allowed (admin fat-finger fixes). Deleting an entry is allowed but warns.
9. **RDT data is admin-only.** `publishFieldSnapshot()` must strip `rdt\_log` from every employee before writing the snapshot file. `js/data/officerSync.js` never receives or displays RDT data.
10. **Feature is opt-in via config.** `meta.rdt` must exist for the RDT page to function. If missing, the RDT page shows a one-click "Enable RDT feature" button that seeds default config.

\---

## JSON Schema Changes

### Remove

The old flat `drug\_tests` object is **removed entirely** from every employee record:

```diff
- "drug\_tests": {
-   "rdt\_1": "2025-12-28",
-   "rdt\_2": "",
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
    "fiscal\_year\_start\_month": 4,
    "monthly\_target\_pct": 10,
    "yearly\_target\_pct": 120,
    "hire\_grace\_months": 3,
    "repeat\_months": \[2, 3],
    "next\_log\_number": 1
  }
}
```

* `fiscal\_year\_start\_month`: 1–12, defaults to 4 (April)
* `repeat\_months`: array of month numbers (1–12) that are Feb/Mar repeat phase. Default `\[2, 3]`
* `next\_log\_number`: monotonically incrementing counter used to build `log\_id`

### Add — `employee.rdt\_log`

Every employee record gains an `rdt\_log` array. Present even if empty.

```json
{
  "employee\_id": "LM-EMP-0001",
  ...
  "rdt\_log": \[
    {
      "log\_id": "rdt-000001",
      "fiscal\_year": "2026-2027",
      "selected\_at": "2026-05-03",
      "selected\_by": "khaled",
      "test\_date": "2026-05-08",
      "status": "completed",
      "result": "pass",
      "notes": ""
    },
    {
      "log\_id": "rdt-000002",
      "fiscal\_year": "2026-2027",
      "selected\_at": "2026-11-01",
      "selected\_by": "khaled",
      "test\_date": "",
      "status": "missed",
      "result": "",
      "notes": "On leave — reschedule next month"
    }
  ]
}
```

Field notes:

* **`log\_id`** — `rdt-######`, incremented from `meta.rdt.next\_log\_number`. Stable, unique across the whole dataset.
* **`fiscal\_year`** — string like `"2026-2027"`, computed at selection time. Format: `"{start\_year}-{end\_year}"` where start\_year is the calendar year of April 1 for that fiscal year.
* **`selected\_at`** — ISO date when admin generated the selection.
* **`selected\_by`** — username of the admin who generated it.
* **`test\_date`** — ISO date when the test actually happened. Empty until admin marks completed. For `missed` entries, stays empty.
* **`status`** — `"selected"` | `"completed"` | `"missed"`. Starts at `"selected"` when the monthly list is generated.
* **`result`** — `"pass"` | `"fail"` | `""`. Only meaningful when `status === "completed"`.
* **`notes`** — free text, up to \~500 chars. Admin's discretion.

\---

## Selection Algorithm

Implemented in `js/utils/rdt.js`. Every function is pure — takes state, returns new state; no side effects. `dataActions.js` wraps mutations.

### Fiscal year helpers

```js
export function currentFiscalYear(today, startMonth) {
  // If today's month >= startMonth: FY starts this calendar year
  // Else: FY started last calendar year
  // Returns { start\_year, end\_year, label: "2026-2027", start\_date, end\_date }
}

export function isRepeatMonth(today, rdtConfig) {
  return rdtConfig.repeat\_months.includes(today.getMonth() + 1);
}
```

### Eligible pool

```js
export function eligibleEmployees(allEmployees, today, rdtConfig) {
  return allEmployees.filter(emp => {
    if (emp.personal.archived) return false;
    if (emp.personal.employment\_status !== 'Active') return false;
    if (emp.team === 'safety' \&\& emp.personal.title !== 'Safety Officer') return false;
    // team === 'field' → all titles pass
    if (!emp.personal.hired\_date) return false;
    const hired = new Date(emp.personal.hired\_date);
    const graceMs = rdtConfig.hire\_grace\_months \* 30.44 \* 86400 \* 1000; // approx month
    if ((today - hired) < graceMs) return false;
    return true;
  });
}
```

### Untested vs already-tested (current fiscal year)

```js
export function testedThisYear(employee, fyLabel) {
  return (employee.rdt\_log || \[]).some(e =>
    e.fiscal\_year === fyLabel \&\& e.status === 'completed'
  );
}

export function selectedOrCompletedThisMonth(employee, monthISO /\* "YYYY-MM" \*/) {
  return (employee.rdt\_log || \[]).some(e => {
    if (e.status === 'missed') return false;
    const d = e.selected\_at || e.test\_date;
    return d \&\& d.startsWith(monthISO);
  });
}
```

### Monthly quota

```js
export function monthlyQuota(poolSize, pct) {
  return Math.round((pct / 100) \* poolSize);
}
```

### Generate monthly selection

```js
export function generateMonthlySelection(allEmployees, today, rdtConfig) {
  const fy = currentFiscalYear(today, rdtConfig.fiscal\_year\_start\_month);
  const pool = eligibleEmployees(allEmployees, today, rdtConfig);
  const quota = monthlyQuota(pool.length, rdtConfig.monthly\_target\_pct);
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
    const j = Math.floor(Math.random() \* (i + 1));
    \[a\[i], a\[j]] = \[a\[j], a\[i]];
  }
  return a;
}
```

### Yearly progress

```js
export function yearlyProgress(allEmployees, today, rdtConfig) {
  const fy = currentFiscalYear(today, rdtConfig.fiscal\_year\_start\_month);
  const pool = eligibleEmployees(allEmployees, today, rdtConfig);
  const target = Math.round((rdtConfig.yearly\_target\_pct / 100) \* pool.length);

  let completed = 0;
  let uniqueTested = new Set();
  for (const emp of pool) {
    for (const entry of (emp.rdt\_log || \[])) {
      if (entry.fiscal\_year === fy.label \&\& entry.status === 'completed') {
        completed++;
        uniqueTested.add(emp.employee\_id);
      }
    }
  }

  return {
    fiscal\_year: fy.label,
    pool\_size: pool.length,
    yearly\_target: target,
    completed\_count: completed,
    unique\_tested\_count: uniqueTested.size,
    coverage\_pct: pool.length ? (uniqueTested.size / pool.length) \* 100 : 0,
    target\_pct: (completed / (target || 1)) \* 100
  };
}
```

\---

## Data Actions (extensions to `js/data/dataActions.js`)

Add these mutating actions. Every one calls `scheduleAutosave()` at the end.

* **`enableRdt()`** — seeds `DATA.meta.rdt` with defaults if missing. Called from the RDT page's onboarding state.
* **`generateAndSaveMonthlySelection(user)`** — calls `generateMonthlySelection()`, creates a new log entry per selected employee with `status: 'selected'`, `selected\_at: todayISO()`, `selected\_by: user.username`, `fiscal\_year: fy.label`, increments `meta.rdt.next\_log\_number` per entry. Returns the created entries.
* **`markRdtCompleted(employee\_id, log\_id, test\_date, result, notes)`** — finds the entry, sets `status: 'completed'`, `test\_date`, `result`, `notes`. Errors if entry not found or already completed/missed.
* **`markRdtMissed(employee\_id, log\_id, notes)`** — sets `status: 'missed'`, keeps `test\_date` empty.
* **`swapRdtSelection(employee\_id, log\_id, user)`** — deletes the entry, then picks a random replacement from the current eligible pool (excluding anyone already selected/completed this month), creates a new `selected` entry for the replacement. Returns the replacement employee. Errors if no replacement available.
* **`editRdtEntry(employee\_id, log\_id, updates)`** — for correcting typos/mistakes on any completed entry. Whitelist: `test\_date`, `result`, `notes`.
* **`deleteRdtEntry(employee\_id, log\_id)`** — hard delete. UI must confirm.

`publishFieldSnapshot()` must be updated to strip `rdt\_log` from every employee in the published snapshot.

Excel import (`js/utils/excelImport.js`) must NOT map any RDT-shaped columns. Old spreadsheets with RDT columns still import — those columns are just ignored.

\---

## Compliance State Interaction

**RDT status does NOT affect the site-check verdict.** An employee overdue for RDT is still `cleared` for site work if their certificates and legal permission are in order. This is intentional — RDT is compliance/HR paperwork, not a safety blocker. If Khaled ever wants to make it a blocker, add it to `js/utils/verdict.js` in a future phase.

**RDT status does NOT affect the dashboard KPIs.** The RDT page has its own progress view. The main dashboard stays certificate-focused.

\---

## App Route Additions

Add to the admin routes table in CLAUDE.md:

|Route|Renders|Who|
|-|-|-|
|`#/rdt`|RDT dashboard: yearly progress + this month's selection + recent log|admin|
|`#/rdt/history`|Full year log, filterable by month/status/result/team|admin|

Sidebar: add a new nav item **"RDT"** between "Renewals" and "Export".

\---

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
                                 # Modify: publishFieldSnapshot to strip rdt\_log

js/data/bootstrap.js             # makeBootstrapData(): add default meta.rdt block,
                                 # remove drug\_tests from any sample employee shape

js/constants/fields.js           # Remove any drug\_tests-related constants if they exist

js/utils/excelImport.js          # Remove RDT column aliases from the header map,
                                 # ignore any RDT-shaped columns in source files

js/pages/employeeFormPage.js     # Remove Drug tests section entirely

js/pages/employeeDetailPage.js   # Replace Drug tests section with "RDT history" section
                                 # showing the employee's rdt\_log entries chronologically

js/pages/employeeListPage.js     # Remove any legacy RDT date columns.
                                 # Optional: add a "Last RDT" column showing the most
                                 # recent completed rdt\_log entry date, "—" if none.

js/components/sidebar.js         # Add RDT nav item

js/i18n/en.js + ar.js            # Add all RDT-related i18n keys (see i18n section below)
```

\---

## i18n Keys to Add

Add every key in both `en.js` and `ar.js`. English values below; Arabic values must be provided.

```js
// Nav
nav\_rdt: 'RDT',                                 // Arabic: 'الفحص العشوائي للمخدرات'

// Page titles
rdt\_page\_title: 'Random Drug Testing',
rdt\_page\_sub: 'Monthly selection and yearly compliance tracking',
rdt\_history\_title: 'RDT history',

// Enable feature (onboarding)
rdt\_enable\_prompt: 'RDT tracking is not yet configured for this dataset.',
rdt\_enable\_button: 'Enable RDT feature',

// Yearly progress
rdt\_fiscal\_year: 'Fiscal year {label}',
rdt\_pool\_size: 'Eligible employees',
rdt\_yearly\_target: 'Yearly target',
rdt\_completed: 'Completed',
rdt\_unique\_tested: 'Unique employees tested',
rdt\_coverage: 'Coverage',
rdt\_target\_progress: 'Target progress',

// Monthly section
rdt\_this\_month: "This month's selection",
rdt\_month\_phase\_normal: 'First-time tests (Apr–Jan phase)',
rdt\_month\_phase\_repeat: 'Repeat tests (Feb/Mar phase)',
rdt\_generate: 'Generate this month',
rdt\_regenerate: 'Regenerate this month',
rdt\_no\_selection: 'No selection generated yet for this month.',
rdt\_quota\_line: '{quota} of {pool} eligible ({pct}%)',
rdt\_no\_eligible: 'No eligible employees remain for this phase.',
rdt\_confirm\_regenerate: 'Regenerate this month\\'s list? Existing selections not yet completed will be discarded.',

// Row actions
rdt\_mark\_completed: 'Mark completed',
rdt\_mark\_missed: 'Mark missed',
rdt\_swap: 'Swap',
rdt\_edit: 'Edit',
rdt\_delete: 'Delete',

// Complete modal
rdt\_complete\_title: 'Mark RDT completed',
rdt\_test\_date: 'Test date',
rdt\_result: 'Result',
rdt\_result\_pass: 'Pass',
rdt\_result\_fail: 'Fail',
rdt\_notes: 'Notes',

// Miss modal
rdt\_miss\_title: 'Mark RDT missed',
rdt\_miss\_reason: 'Reason (leave, refusal, no-show, etc.)',

// Swap
rdt\_swap\_confirm: 'Swap {name} for a random replacement?',
rdt\_swap\_no\_replacement: 'No replacement available in the current eligible pool.',
rdt\_swap\_done: '{oldName} swapped for {newName}',

// Delete
rdt\_delete\_confirm: 'Delete this RDT entry? This cannot be undone.',

// Status labels
rdt\_status\_selected: 'Selected',
rdt\_status\_completed: 'Completed',
rdt\_status\_missed: 'Missed',

// History filters
rdt\_filter\_month: 'Month',
rdt\_filter\_status: 'Status',
rdt\_filter\_result: 'Result',
rdt\_filter\_team: 'Team',

// Employee detail section
rdt\_history\_section: 'RDT history',
rdt\_history\_empty: 'No RDT entries yet.',

// List view column
col\_last\_rdt: 'Last RDT',

// Settings
rdt\_settings\_title: 'RDT settings',
rdt\_setting\_fy\_start: 'Fiscal year start month',
rdt\_setting\_monthly\_pct: 'Monthly target %',
rdt\_setting\_yearly\_pct: 'Yearly target %',
rdt\_setting\_hire\_grace: 'New-hire grace (months)',
rdt\_setting\_repeat\_months: 'Repeat months',
```

\---

## Design Notes

The RDT page follows the same layout language as the Renewals page (see `design/ohs\_admin\_prototype.html` for the visual template) — no new component types required.

**Page structure (`#/rdt`):**

1. **Topbar** — title "RDT" + sub "Random Drug Testing" + Export JSON button (standard)
2. **Progress hero card** — big number: `{completed\_count} / {yearly\_target}` this fiscal year. Sub-line: coverage %, pool size, phase indicator ("Apr–Jan first-round" or "Feb/Mar repeat round")
3. **Yearly progress bar** — one horizontal bar showing `completed / target` in accent color, with a subtle marker at the 100% point (end of first-round phase)
4. **This month's selection card** — heading "This month · {monthLabel}" + phase label + quota line + Generate/Regenerate button

   * If not generated: empty state with big Generate button
   * If generated: table of selected employees (name, employee\_id, team badge, title, status badge, row actions)
5. **Recent activity card** — last \~15 log entries across all employees this fiscal year, most recent first
6. **Link to full history** (`#/rdt/history`)

**Settings integration** — add an "RDT" section to Settings → Thresholds tab (or a new "RDT" tab if it gets crowded) exposing the `meta.rdt` fields. This is optional for v1; defaults are fine for most cases.

**Empty state (feature not enabled)** — a friendly card with a summary of what RDT does + the Enable button.

\---

## Testing Notes

Selection randomness must be verifiable but not annoying to test:

* Never seed the RNG in production code — real randomness is required
* For tests, admin can regenerate a month's selection any number of times before the first person is marked completed, to shuffle the list

The `Math.round()` rounding rule handles all edge cases:

* Pool of 3, 10% → round(0.3) → 0 tests that month (correct — tiny team, no monthly tests)
* Pool of 5, 10% → round(0.5) → 1 test
* Pool of 137, 10% → round(13.7) → 14
* Pool of 8 in Feb repeat, but only 3 already tested → quota 1, only 3 candidates → picks 1 correctly

\---

## What NOT to Do (RDT-specific additions to CLAUDE.md's "What NOT to Do")

* Never expose `rdt\_log` or `meta.rdt` to the officer app
* Never let the site-check verdict depend on RDT status
* Never sort the eligible pool by anything other than random shuffle before selection
* Never persist RNG state or seed — randomness must be fresh each run
* Never allow generating a monthly selection that would create duplicates within the same calendar month for the same employee
* Never allow Feb/Mar to pick employees who haven't been tested yet this fiscal year — that would create a false "completed" record without an actual first-round test
* Never re-introduce the flat `drug\_tests` object — the `rdt\_log` array is the sole source of truth



\## Amendments

\- `CLAUDE.rdt.patch.md` — MCU expiry exclusion (added post-launch)

