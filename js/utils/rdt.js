// rdt.js — the Random Drug Test selection algorithm. One job: given the employee
// list, today's date, and the meta.rdt config, decide who should be tested and
// report yearly coverage. Every export is a PURE function: it reads its arguments
// and returns a value, never mutating DATA or any input. All state changes live
// in js/data/dataActions.js, which wraps these.
//
// See CLAUDE.rdt.md "Selection Algorithm" — this file follows it verbatim.

// ── fiscal year helpers ─────────────────────────────────────────────────────

const pad2 = (n) => String(n).padStart(2, '0');

// Which fiscal year `today` falls in, given the 1–12 start month.
// If today's month >= startMonth the FY started this calendar year, otherwise it
// started last calendar year. Label format: "{start_year}-{end_year}".
export function currentFiscalYear(today, startMonth) {
  const y = today.getFullYear();
  const m = today.getMonth() + 1; // 1–12
  const start_year = m >= startMonth ? y : y - 1;
  const end_year = start_year + 1;

  const start_date = `${start_year}-${pad2(startMonth)}-01`;
  // end_date is the day before the next fiscal year's start.
  const nextStart = new Date(Date.UTC(end_year, startMonth - 1, 1));
  nextStart.setUTCDate(nextStart.getUTCDate() - 1);
  const end_date = `${nextStart.getUTCFullYear()}-${pad2(nextStart.getUTCMonth() + 1)}-${pad2(nextStart.getUTCDate())}`;

  return { start_year, end_year, label: `${start_year}-${end_year}`, start_date, end_date };
}

// True in the Feb/Mar repeat phase (or whatever months meta.rdt.repeat_months lists).
export function isRepeatMonth(today, rdtConfig) {
  return rdtConfig.repeat_months.includes(today.getMonth() + 1);
}

// ── eligible pool ───────────────────────────────────────────────────────────

// Everyone in scope for testing at the moment `today`: recomputed every call,
// never frozen (CLAUDE.rdt.md rule 2). Field team of any title; safety team only
// if titled "Safety Officer"; active, not archived, and past the hire grace.
export function eligibleEmployees(allEmployees, today, rdtConfig) {
  return allEmployees.filter((emp) => {
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

// ── untested vs already-tested (current fiscal year) ────────────────────────

// Has this employee a completed test in the given fiscal year?
export function testedThisYear(employee, fyLabel) {
  return (employee.rdt_log || []).some((e) =>
    e.fiscal_year === fyLabel && e.status === 'completed'
  );
}

// Has this employee already been selected or completed in the given calendar
// month ("YYYY-MM")? Missed entries do NOT count — a missed person re-opens.
export function selectedOrCompletedThisMonth(employee, monthISO) {
  return (employee.rdt_log || []).some((e) => {
    if (e.status === 'missed') return false;
    const d = e.selected_at || e.test_date;
    return d && d.startsWith(monthISO);
  });
}

// ── monthly quota ───────────────────────────────────────────────────────────

// Round-to-nearest (CLAUDE.rdt.md rule 3): 137 × 10% → 13.7 → 14.
export function monthlyQuota(poolSize, pct) {
  return Math.round((pct / 100) * poolSize);
}

// ── generate monthly selection ──────────────────────────────────────────────

// Returns the array of employee objects picked for this month. Apr–Jan draws
// from those not yet tested this FY; Feb/Mar draws only from those already
// tested. Never pads past the number of available candidates.
export function generateMonthlySelection(allEmployees, today, rdtConfig) {
  const fy = currentFiscalYear(today, rdtConfig.fiscal_year_start_month);
  const pool = eligibleEmployees(allEmployees, today, rdtConfig);
  const quota = monthlyQuota(pool.length, rdtConfig.monthly_target_pct);
  const monthISO = today.toISOString().slice(0, 7);

  // Exclude anyone already selected/completed THIS calendar month
  // (prevents accidentally regenerating a duplicate list within the same month).
  const notThisMonth = pool.filter((e) => !selectedOrCompletedThisMonth(e, monthISO));

  let candidates;
  if (isRepeatMonth(today, rdtConfig)) {
    // Feb/Mar: only those already tested this fiscal year.
    candidates = notThisMonth.filter((e) => testedThisYear(e, fy.label));
  } else {
    // Apr–Jan: only those NOT yet tested this fiscal year.
    candidates = notThisMonth.filter((e) => !testedThisYear(e, fy.label));
  }

  const shuffled = shuffle(candidates); // Fisher-Yates
  return shuffled.slice(0, Math.min(quota, shuffled.length));
}

// Fisher-Yates shuffle on a copy — the sole source of ordering before slicing to
// quota (CLAUDE.rdt.md rule 1: never sort the pool by anything but random).
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── yearly progress ─────────────────────────────────────────────────────────

// Coverage against the 120% yearly target for the current fiscal year.
export function yearlyProgress(allEmployees, today, rdtConfig) {
  const fy = currentFiscalYear(today, rdtConfig.fiscal_year_start_month);
  const pool = eligibleEmployees(allEmployees, today, rdtConfig);
  const target = Math.round((rdtConfig.yearly_target_pct / 100) * pool.length);

  let completed = 0;
  const uniqueTested = new Set();
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
    target_pct: (completed / (target || 1)) * 100,
  };
}
