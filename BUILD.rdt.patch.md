# BUILD.rdt.patch.md — Retrofit: MCU Expiry Exclusion
> Amendment to BUILD.rdt.md. Apply after the main RDT build is complete and in use.
> Read CLAUDE.rdt.patch.md first for the spec.

---

## Stage 8.5.5 — MCU Expiry Exclusion Retrofit

**Goal:** Employees with an expired or missing MCU are excluded from the RDT
eligible pool. Existing `rdt_log` data is preserved; only the selection logic
changes.

**Prerequisite:** Stages 8.5.1 through 8.5.3 complete and deployed.

---

### Step 8.5.5.1 — Update the eligibility filter

**Prompt:**
```
Read CLAUDE.md, CLAUDE.rdt.md, and CLAUDE.rdt.patch.md before making any changes.
Stage 8.5.5, Step 1.

Update js/utils/rdt.js — modify the eligibleEmployees function to add an MCU
exclusion at the end of the filter chain. Use the exact implementation from
CLAUDE.rdt.patch.md's "Selection Algorithm" section.

Do NOT change any other function. generateMonthlySelection, yearlyProgress, and
the swap logic in dataActions.js all call eligibleEmployees and will inherit the
new exclusion automatically. Confirm this by grepping — no other file should need
edits.

Do NOT touch existing rdt_log entries or migrate any data. This is a
forward-looking rule: past selections stand as they were, future selections
respect the new filter.
```

**Tests for Step 8.5.5.1:**
- [ ] Console: build a test employee with `certificates.mcu.expiry_date` = tomorrow's date → `eligibleEmployees([emp], today, rdtConfig)` includes them
- [ ] Console: same employee with MCU expiry = yesterday's date → excluded
- [ ] Console: same employee with MCU expiry = today's date → included (boundary is `>= today`)
- [ ] Console: same employee with `certificates.mcu.expiry_date` empty string → excluded
- [ ] Generate a monthly selection in a test dataset where 3 of 20 eligible employees have expired MCU → selection quota drops accordingly, none of the 3 appear in the picks
- [ ] Yearly progress `pool_size` reflects the exclusion (matches manual count)
- [ ] Swap action: swapping out an employee whose replacement pool contains only expired-MCU employees returns `{ok:false, error:'no_replacement'}`
- [ ] Employees previously marked `completed` this fiscal year still count toward `completed_count` in yearlyProgress even if their MCU has since expired (rdt_log entries are historical facts, not filtered)

---

### Step 8.5.5.2 — Optional UI hints

**Prompt:**
```
Read CLAUDE.md, CLAUDE.rdt.md, CLAUDE.rdt.patch.md. Stage 8.5.5, Step 2.

Optional polish. Only proceed if 8.5.5.1 tests all pass.

1) js/pages/rdtPage.js — in the "This month's selection" card header, when the
   pool has shrunk because of MCU exclusions, add a small helper line under the
   quota. Compute:
     mcuExcludedCount = allEligibleIgnoringMcu.length - pool.length
   where allEligibleIgnoringMcu is a version of eligibleEmployees with the MCU
   check disabled. If mcuExcludedCount > 0, show:
     t('rdt_mcu_excluded_note', {count: mcuExcludedCount})

   To avoid duplicating filter logic, add a small helper to js/utils/rdt.js:
     export function eligibleIgnoringMcu(allEmployees, today, rdtConfig)
   with the same body as eligibleEmployees minus the last two MCU checks.
   Then eligibleEmployees can be rewritten as:
     eligibleIgnoringMcu(...).filter(hasValidMcu)
   to keep the two in lockstep. Small refactor, no behavior change.

2) Add i18n keys to en.js and ar.js:
     rdt_mcu_excluded_note: '{count} employees excluded — MCU expired or missing'
     // Arabic: 'تم استبعاد {count} موظفين — انتهت صلاحية الفحص الطبي أو غير مسجل'

3) js/pages/employeeDetailPage.js — in the "RDT history" section header, if the
   employee is currently ineligible for RDT because of expired MCU, show a small
   informational badge next to the section title:
     t('rdt_ineligible_mcu')
   Add i18n keys:
     rdt_ineligible_mcu: 'Not eligible for RDT — MCU expired'
     // Arabic: 'غير مؤهل للفحص العشوائي — انتهت صلاحية الفحص الطبي'
   This is display-only. No behavior change.
```

**Tests for Step 8.5.5.2:**
- [ ] Test dataset with 20 total-eligible, 3 with expired MCU → RDT page shows "3 employees excluded — MCU expired or missing"
- [ ] Test dataset with 0 MCU exclusions → the note is not rendered (no zero-count message)
- [ ] Employee detail for someone with expired MCU → "Not eligible for RDT — MCU expired" badge appears in RDT history section
- [ ] Employee detail for someone with valid MCU → no badge
- [ ] Arabic language: both new strings translate; layout stays clean

---

### Step 8.5.5.3 — QA additions

Add these items to the RDT section of Stage 12 QA checklist:

**RDT — MCU exclusion:**
- [ ] Employee with expired MCU never appears in generated selection
- [ ] Employee with MCU expiring today (== today) is still eligible
- [ ] Swap replacement pool excludes expired-MCU employees
- [ ] Renewing an expired MCU (updating expiry_date to future) → employee re-enters the pool next generation
- [ ] Yearly progress pool_size and coverage % reflect current MCU-based eligibility
- [ ] Historical `completed` entries from before MCU expired remain in the log and continue to count toward completed_count
- [ ] "N employees excluded — MCU expired or missing" note shows when the count > 0 (if Step 8.5.5.2 applied)
- [ ] "Not eligible for RDT — MCU expired" badge shows on employee detail (if Step 8.5.5.2 applied)

---

## Rollout note

Because this only tightens the eligibility filter and does not touch stored data,
deployment is safe at any time:

1. Push the updated `js/utils/rdt.js` (and optionally the UI polish files)
2. Reload the admin app
3. Existing `rdt_log` history is untouched
4. Next monthly selection automatically respects the new rule

No migration, no data cleanup, no schema change required.
