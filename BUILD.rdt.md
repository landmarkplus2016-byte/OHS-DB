# BUILD.rdt.md — RDT Feature Build Guide
> This file extends BUILD.md with the RDT feature.
> Read BUILD.md and CLAUDE.md first. Read CLAUDE.rdt.md before starting this stage.
> Slots into the main build as **Stage 8.5**, after Excel import (Stage 8), before the Officer app (Stage 9).
>
> Prerequisite: Stages 0–8 of BUILD.md are complete and passing.

---

## Stage 8.5 — RDT (Random Drug Testing)

**Goal:** Admin can generate a monthly RDT selection, mark tests completed/missed, swap unavailable employees, edit and delete entries, and see yearly coverage against a 120% target. RDT data is admin-only and stripped from the officer field snapshot.

---

### Step 8.5.1 — Schema migration + utility layer

**Prompt:**
```
Read CLAUDE.md and CLAUDE.rdt.md fully before writing any code.
Stage 8.5, Step 1.

Update the schema and add the pure utility layer for RDT.

1) js/data/bootstrap.js:
   - Update makeBootstrapData(): add meta.rdt with the default block from CLAUDE.rdt.md
     (enabled:true, fiscal_year_start_month:4, monthly_target_pct:10,
      yearly_target_pct:120, hire_grace_months:3, repeat_months:[2,3],
      next_log_number:1)
   - If any sample employee shape exists that includes drug_tests, remove it and
     add rdt_log:[] instead.

2) js/constants/fields.js:
   - Remove any drug_tests-related keys/constants if present.
   - No other changes here.

3) js/utils/rdt.js — NEW FILE. Pure functions only, no side effects, no DATA mutation.
   Export every function listed in CLAUDE.rdt.md's "Selection Algorithm" section:
     - currentFiscalYear(today, startMonth)
     - isRepeatMonth(today, rdtConfig)
     - eligibleEmployees(allEmployees, today, rdtConfig)
     - testedThisYear(employee, fyLabel)
     - selectedOrCompletedThisMonth(employee, monthISO)
     - monthlyQuota(poolSize, pct)   // uses Math.round
     - generateMonthlySelection(allEmployees, today, rdtConfig)
     - yearlyProgress(allEmployees, today, rdtConfig)
   Also include the Fisher-Yates shuffle() helper as a non-exported function.

   Follow the CLAUDE.rdt.md implementations exactly — do not reinterpret the rules.
   Fiscal-year label format: "YYYY-YYYY" (start_year-end_year).

4) js/data/dataActions.js — add these mutations. Each ends with scheduleAutosave().
     - enableRdt(): seeds DATA.meta.rdt with defaults if missing or if .enabled is
       falsy; markDirty; scheduleAutosave.
     - generateAndSaveMonthlySelection(user):
         Import generateMonthlySelection from utils/rdt.js.
         For each selected employee, push a new entry into emp.rdt_log with:
           log_id: `rdt-${String(DATA.meta.rdt.next_log_number).padStart(6,'0')}`
           fiscal_year, selected_at: todayISO(), selected_by: user.username,
           status: 'selected', test_date:'', result:'', notes:''
         Increment DATA.meta.rdt.next_log_number for each entry.
         Return the array of {employee_id, log_id}.
     - markRdtCompleted(employee_id, log_id, test_date, result, notes):
         Locate entry; if not found or status !== 'selected', return {ok:false,error}.
         Set status='completed', test_date, result, notes.
     - markRdtMissed(employee_id, log_id, notes):
         Locate entry; must be currently 'selected'.
         Set status='missed', notes; test_date stays empty.
     - swapRdtSelection(employee_id, log_id, user):
         Locate the entry; must be currently 'selected'.
         Splice it out.
         Build a fresh eligible pool excluding: everyone already selected/completed
         this calendar month (including the just-removed original employee).
         Pool must respect the fiscal-year phase (untested vs. repeat).
         If pool is empty, return {ok:false, error:'no_replacement'}.
         Randomly pick one, push a new 'selected' entry into their rdt_log using the
         next log_number.
         Return {ok:true, replacement_employee_id, replacement_log_id}.
     - editRdtEntry(employee_id, log_id, updates):
         Whitelist updates to test_date, result, notes only.
     - deleteRdtEntry(employee_id, log_id):
         Hard delete.

5) js/data/dataActions.js — MODIFY publishFieldSnapshot():
     Before writing the snapshot, map each employee to strip rdt_log entirely
     (`{...emp, rdt_log: undefined}` or omit the key). Also strip meta.rdt from
     the snapshot's meta block. Everything else in publishFieldSnapshot stays the same.

6) js/utils/excelImport.js — MODIFY:
     Remove any column aliases that mapped to drug_tests.rdt_1 / rdt_2 / rdt.
     Any RDT-shaped columns in the source spreadsheet are silently ignored — do
     not import them anywhere. Add a small note to the import preview footer:
     "Legacy RDT date columns in this file were ignored — use the RDT page to
     record new tests."

7) js/pages/employeeFormPage.js — MODIFY:
     Remove the Drug tests section entirely from both new and edit modes.

Do not build the RDT page yet — that comes in Step 8.5.2.
```

**Tests for Step 8.5.1:**
- [ ] Fresh bootstrap: `DATA.meta.rdt` exists with defaults; `DATA.meta.rdt.next_log_number === 1`
- [ ] Sample or newly-added employee has `rdt_log: []` and no `drug_tests` key anywhere
- [ ] Console: `currentFiscalYear(new Date('2026-05-15'), 4).label === '2026-2027'`
- [ ] Console: `currentFiscalYear(new Date('2026-02-15'), 4).label === '2025-2026'`
- [ ] Console: `isRepeatMonth(new Date('2026-02-15'), {repeat_months:[2,3]}) === true`
- [ ] Console: `isRepeatMonth(new Date('2026-05-15'), {repeat_months:[2,3]}) === false`
- [ ] Console: `monthlyQuota(137, 10) === 14`
- [ ] Console: `monthlyQuota(3, 10) === 0`
- [ ] `eligibleEmployees` filters correctly: archived out, non-Active out, safety non-officers out, employees hired < 3 months ago out
- [ ] `generateMonthlySelection` in an Apr–Jan month returns only untested-this-FY employees; running it a second time in the same month with existing selections returns fresh employees (excludes anyone already selected this month)
- [ ] `generateMonthlySelection` in Feb returns only employees with a `completed` entry this fiscal year
- [ ] `generateMonthlySelection` when pool is small returns fewer than quota (not padded)
- [ ] `generateAndSaveMonthlySelection(user)` creates log entries with sequential `log_id` (`rdt-000001`, `rdt-000002`, ...); `meta.rdt.next_log_number` incremented correctly
- [ ] `markRdtCompleted` on a 'selected' entry moves it to 'completed' with the given fields
- [ ] `markRdtCompleted` on a non-existent entry returns `{ok:false}`
- [ ] `markRdtMissed` sets status to 'missed', leaves `test_date` empty
- [ ] `swapRdtSelection` deletes the original and creates a replacement selected entry; original employee has one fewer log entry
- [ ] `swapRdtSelection` when no replacement available returns `{ok:false, error:'no_replacement'}`
- [ ] `editRdtEntry` updates only whitelisted fields
- [ ] `deleteRdtEntry` removes the entry
- [ ] `publishFieldSnapshot` output does NOT contain any `rdt_log` or `meta.rdt` keys anywhere
- [ ] Excel importing the reference OHS_Data_base__Landmark.xlsx: RDT columns are ignored, no errors, note appears in preview footer
- [ ] Employee form (new + edit): no Drug tests section rendered
- [ ] IS_DIRTY is set after every mutation; autosave persists to `ohs-admin` IndexedDB (check by reloading and inspecting `DATA.employees[0].rdt_log`)

---

### Step 8.5.2 — RDT page (dashboard + monthly selection)

**Prompt:**
```
Read CLAUDE.md, CLAUDE.rdt.md, and design/ohs_admin_prototype.html.
Stage 8.5, Step 2.

Build js/pages/rdtPage.js. Follow the visual language of the Renewals page — same
card/table styling, same topbar layout, same button styles. No new component types.

Add the RDT nav item in js/components/sidebar.js: between Renewals and Export,
label = t('nav_rdt').

Add the route in js/router.js and js/render.js: '#/rdt' → renderRdtPage().

Add ALL i18n keys from CLAUDE.rdt.md's "i18n Keys to Add" section into
js/i18n/en.js and js/i18n/ar.js.

export function renderRdtPage():

  0) Feature-enabled check:
     If DATA.meta.rdt is missing OR DATA.meta.rdt.enabled === false:
       Render a centered empty-state card:
         - Icon
         - t('rdt_enable_prompt')
         - Button t('rdt_enable_button') → wire in bindRdtPageEvents to call enableRdt()
       Return.

  1) Topbar:
     - Title: t('rdt_page_title')
     - Sub: t('rdt_page_sub')
     - Right actions: standard Export JSON button (already in the shell)

  2) Progress hero card:
     Call yearlyProgress(DATA.employees, new Date(), DATA.meta.rdt).
     Layout: two-column card
       Left column:
         - Big number: {completed_count} / {yearly_target}
         - Sub: t('rdt_target_progress') + " " + `${target_pct.toFixed(0)}%`
         - Phase indicator badge (normal or repeat), from isRepeatMonth()
       Right column:
         - t('rdt_fiscal_year', {label: fy.label})
         - t('rdt_pool_size'): {pool_size}
         - t('rdt_unique_tested'): {unique_tested_count}
         - t('rdt_coverage'): {coverage_pct.toFixed(0)}%
     Horizontal progress bar underneath spanning the full card:
       width = min(100, target_pct)%, accent color; add a subtle vertical
       marker at (100/120)*100 = 83.3% to indicate "first-round complete" point.

  3) This month's selection card:
     Compute:
       - fy = currentFiscalYear(today, ...)
       - phase = isRepeatMonth(today, ...) ? 'repeat' : 'normal'
       - pool = eligibleEmployees(...)
       - quota = monthlyQuota(pool.length, monthly_target_pct)
       - Existing selections THIS calendar month =
           flatten every employee.rdt_log, filter to entries whose selected_at
           starts with today's YYYY-MM, keep {employee, entry}. Any status.

     Card header:
       - Title: t('rdt_this_month') + " · " + formatted month
       - Phase label: t(phase === 'repeat' ? 'rdt_month_phase_repeat' : 'rdt_month_phase_normal')
       - Quota line: t('rdt_quota_line', {quota, pool: pool.length, pct: monthly_target_pct})

     Card body:
       If existing selections THIS month is empty:
         - Empty state message: t('rdt_no_selection')
         - Big button t('rdt_generate') → generateAndSaveMonthlySelection(CURRENT_USER)
           on click. If it returns an empty array, showToast(t('rdt_no_eligible')).
       Else:
         - Table:
           Columns: Name (with click→employee detail), employee_id, team badge,
             title, status badge, Actions
           Actions per row depend on status:
             - 'selected': [Mark completed], [Mark missed], [Swap]
             - 'completed': [Edit], [Delete]
             - 'missed': [Delete]
         - Below the table: small link t('rdt_regenerate')
           → confirm dialog t('rdt_confirm_regenerate') →
             delete all THIS-MONTH entries with status === 'selected' from every
             employee's rdt_log, then call generateAndSaveMonthlySelection.
             Do NOT touch already-completed or missed entries.

  4) Recent activity card:
     Flatten all employees' rdt_log entries with fiscal_year === fy.label.
     Sort by selected_at desc, take top 15.
     Show a compact list: date, employee name (click→detail), status badge,
       result badge if completed.
     Footer link: "View full history →" (route to '#/rdt/history' — stub for now,
     built in Step 8.5.3).

export function bindRdtPageEvents():
  - Enable button → enableRdt() + re-render
  - Generate button → generateAndSaveMonthlySelection(CURRENT_USER) + re-render + toast
  - Regenerate link → confirm → clear this-month 'selected' entries → regenerate + toast
  - Mark completed button → open modal with test_date (default today), result select
    (pass/fail), notes textarea → on confirm, markRdtCompleted(...) + toast + re-render
  - Mark missed button → open modal with notes textarea → on confirm,
    markRdtMissed(...) + toast + re-render
  - Swap button → confirmation modal t('rdt_swap_confirm', {name}) → on confirm,
    swapRdtSelection(...) → toast t('rdt_swap_done', {oldName, newName}) or
    t('rdt_swap_no_replacement') → re-render
  - Edit button (on completed rows) → same modal as Mark completed but pre-filled
    → editRdtEntry(...)
  - Delete button → confirm t('rdt_delete_confirm') → deleteRdtEntry(...) + re-render

Every mutating action calls scheduleAutosave via dataActions; the RDT page just
calls render() after actions succeed. No direct state mutation in this file.
```

**Tests for Step 8.5.2:**
- [ ] Fresh dataset (no `meta.rdt`): RDT page shows the Enable empty state; clicking Enable populates `meta.rdt` and re-renders to the real page
- [ ] Progress hero shows correct numbers for a small hand-built dataset (e.g. 10 eligible, 0 completed → 0/12 target, 0% coverage)
- [ ] Fiscal-year label displays correctly around the boundary — set device date to Mar 15 vs Apr 15 and confirm label shifts
- [ ] Generate button in a normal month (say, May) produces a selection of `round(0.1 × pool)` employees, all previously untested-this-FY
- [ ] Generated employees appear in the table with status="Selected"
- [ ] Marking one completed with test_date + result="pass" → status badge updates, appears in Recent activity
- [ ] Marking one missed → status="Missed", stays in the table for the current month
- [ ] Swap: the swapped-out employee is removed from the list, a new random employee appears, both employees' `rdt_log` reflect the change
- [ ] Swap when no replacement available (contrive by manually completing everyone in the pool first) → error toast, no change
- [ ] Regenerate confirmation: keeps completed/missed entries this month, clears only "selected", generates fresh
- [ ] Edit on a completed entry updates test_date/result/notes without changing status
- [ ] Delete removes the entry from `rdt_log`
- [ ] Repeat month behavior: set device date to Feb 15, generate → selection contains only employees with a completed entry this FY
- [ ] Repeat month with nobody yet tested this FY → empty selection, no error
- [ ] Progress bar width matches `target_pct` (capped at 100%), 83.3% marker visible
- [ ] Nav item "RDT" appears in the sidebar between Renewals and Export
- [ ] Route `#/rdt` loads the page; browser back/forward work
- [ ] Arabic language: all RDT strings translate, table stays readable, RTL layout correct
- [ ] Reload page after generating a selection → selection persists (adminCache autosaved)

---

### Step 8.5.3 — RDT history page + employee detail integration + list column

**Prompt:**
```
Read CLAUDE.md and CLAUDE.rdt.md. Stage 8.5, Step 3.

1) js/pages/rdtPage.js — add renderRdtHistoryPage():
     Route: '#/rdt/history'
     Layout:
       - Topbar with title t('rdt_history_title')
       - Filter bar (like renewals page):
           Month select (all + each month of current FY)
           Team select (all/field/safety)
           Status select (all/selected/completed/missed)
           Result select (all/pass/fail)
       - Table:
           Columns: Selected at, Employee (click→detail), Team, Log ID,
                    Selected by, Test date, Status badge, Result badge, Notes
       - Pagination: PAGE_SIZE = 100
       - Rows come from flattening every employee.rdt_log, filtered to current FY
         + filter selects, sorted by selected_at desc.
       - Topbar right action: "Export history to Excel" — builds a flat array of
         all rows and calls a small local export function (or extends
         exportHelpers.js with exportRdtHistoryToExcel).
     Also add bindRdtHistoryPageEvents() for filter changes, pagination, export.

     Add the router mapping and the "View full history →" link on the main RDT page.

2) js/pages/employeeDetailPage.js — MODIFY:
     Remove the old Drug tests section.
     Add a new "RDT history" section:
       Header: t('rdt_history_section')
       If employee.rdt_log is empty: t('rdt_history_empty')
       Else: compact table with columns:
         Selected at, Test date, Status badge, Result, Notes
       Sorted by selected_at desc.
       No inline actions — actions live on the RDT page.

3) js/pages/employeeListPage.js — MODIFY:
     Remove any legacy RDT date column if it exists.
     ADD a new "Last RDT" column:
       For each employee, find the most recent rdt_log entry with
       status === 'completed' (by test_date desc). Show the formatted test_date
       via fmtDate(); "—" if none.
     Sortable is not required for v1 — display only.

4) Verify integration points once more:
   - publishFieldSnapshot strips rdt_log everywhere (already done in 8.5.1)
   - officer app has zero references to rdt_log or meta.rdt (grep confirms)
   - excelImport ignores RDT columns (already done in 8.5.1)
   - employeeFormPage has no Drug tests section (already done in 8.5.1)
```

**Tests for Step 8.5.3:**
- [ ] `#/rdt/history` loads with a filterable, paginated table
- [ ] Filtering by month="May" shows only entries selected in May of current FY
- [ ] Filtering by status="completed" + result="fail" shows only failed tests
- [ ] Empty filter combinations show a clean empty state
- [ ] Pagination works with >100 entries (add test entries manually if needed)
- [ ] Excel export downloads a `.xlsx` with all filtered rows
- [ ] Employee detail page: "RDT history" section shows that employee's log entries in reverse-chronological order
- [ ] Employee detail: no Drug tests section anywhere
- [ ] Employee list: "Last RDT" column shows the most recent completed test date or "—"
- [ ] Employee list with a fresh dataset: all "Last RDT" cells show "—"
- [ ] After marking one employee's test completed, their row in the list shows the correct Last RDT date
- [ ] Officer app (mobile): no RDT information anywhere — verdict card, home page, or detail
- [ ] `grep -r "rdt_log" js/data/officerSync.js js/pages/officer*.js` returns nothing
- [ ] Publishing a snapshot then opening the downloaded JSON: no `rdt_log`, no `meta.rdt`
- [ ] Bilingual: RDT history page, employee detail RDT section, and Last RDT column all translate; RTL layout correct

---

### Step 8.5.4 — QA additions

Add these items to the Stage 12 QA checklist in BUILD.md:

**RDT feature:**
- [ ] Fresh dataset: RDT page shows Enable state; enabling seeds meta.rdt
- [ ] Generate monthly selection in an Apr–Jan month → quota = round(0.10 × pool); no repeats
- [ ] Generate again same month → deduplicates (no new picks that conflict with existing selections this month)
- [ ] Mark completed / missed / edit / delete all work and persist across page reload
- [ ] Swap: original removed, replacement selected, replacement has status='selected'
- [ ] Swap with no available replacement → clear error toast, no change
- [ ] Feb / Mar phase: only picks from employees already tested this FY
- [ ] Feb / Mar with an empty already-tested set → empty selection, no error
- [ ] Yearly progress: completed count and coverage % match manual count
- [ ] Pool refresh: archiving an employee mid-year removes them from next month's pool
- [ ] Pool refresh: adding a new employee with hire_date >3 months ago includes them in next month's pool
- [ ] 3-month grace: brand-new hire is excluded until 3 months after hire_date
- [ ] Safety Officer scope: HSE Managers/Coordinators/Directors never appear in the pool
- [ ] RDT history page: filters, pagination, export all work
- [ ] Employee detail RDT history section renders in reverse-chronological order
- [ ] Employee list "Last RDT" column populated correctly
- [ ] Publish field snapshot: downloaded file contains no rdt_log or meta.rdt
- [ ] Officer app: no RDT data visible anywhere
- [ ] Bilingual: all RDT UI translates; RTL layout correct
- [ ] Excel import: legacy RDT columns silently ignored, footer note shown

---

## Rollback Plan

If the RDT feature needs to be temporarily disabled without removing the code:

1. Set `DATA.meta.rdt.enabled = false` in the JSON (Settings → Data file → edit the raw JSON, or via a dev console).
2. Re-upload the JSON.
3. The RDT page will show the enable prompt; the nav item can be left in place or optionally hidden in `sidebar.js` behind the same flag.

No data is lost — existing `rdt_log` entries stay in every employee record and reappear when the feature is re-enabled.

---

*Keep this file open while building the RDT feature. Check off every item as you go.*
*Do not proceed to Step 8.5.2 until every 8.5.1 test passes.*
*If any test fails, fix before moving on.*
