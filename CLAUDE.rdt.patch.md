# CLAUDE.rdt.patch.md — MCU Expiry Exclusion
> Amendment to CLAUDE.rdt.md. Read that file first, then apply these changes.
> This patch adds one exclusion rule to the RDT eligibility logic.

---

## Why

When an employee's MCU (medical checkup) expires, they must retake the full medical
checkup — which itself includes a drug test. Selecting them for a standalone RDT
during that window would be redundant work. They automatically re-enter the RDT
eligible pool once their renewed MCU expiry date is recorded.

---

## Changes to CLAUDE.rdt.md

### Section: "Compliance Rules (the 'why')" → subsection "Who's in scope"

**ADD** this bullet to the end of the list:

> - Must have a valid (non-expired) MCU — i.e. `certificates.mcu.expiry_date` is present
>   and >= today. Employees whose MCU has expired are excluded from the RDT pool
>   because the MCU renewal itself includes a drug test. Once the renewed MCU
>   expiry is entered, they re-enter the pool automatically.

### Section: "Non-Negotiable Rules (RDT-specific)"

**ADD** a new rule 11:

> 11. **MCU expiry excludes from RDT.** `eligibleEmployees()` must filter out any
>     employee whose `certificates.mcu.expiry_date` is missing or `< today`.
>     This is a hard exclusion — not a warning. If the MCU expiry is on today's
>     date, the employee is still eligible (`>= today`, not `> today`). This
>     mirrors how `deriveCertState` treats the boundary.

### Section: "Selection Algorithm" → `eligibleEmployees()`

**REPLACE** the existing `eligibleEmployees` implementation with:

```js
export function eligibleEmployees(allEmployees, today, rdtConfig) {
  const todayISO = today.toISOString().slice(0, 10);
  return allEmployees.filter(emp => {
    if (emp.personal.archived) return false;
    if (emp.personal.employment_status !== 'Active') return false;
    if (emp.team === 'safety' && emp.personal.title !== 'Safety Officer') return false;
    // team === 'field' → all titles pass
    if (!emp.personal.hired_date) return false;
    const hired = new Date(emp.personal.hired_date);
    const graceMs = rdtConfig.hire_grace_months * 30.44 * 86400 * 1000; // approx month
    if ((today - hired) < graceMs) return false;
    // MCU exclusion — expired or missing MCU means employee is in MCU renewal window,
    // which itself includes a drug test. Skip them for standalone RDT.
    const mcuExpiry = emp.certificates && emp.certificates.mcu && emp.certificates.mcu.expiry_date;
    if (!mcuExpiry) return false;
    if (mcuExpiry < todayISO) return false;
    return true;
  });
}
```

The rest of the algorithm is unchanged. `generateMonthlySelection`, `yearlyProgress`,
and the swap logic in `dataActions.js` all use `eligibleEmployees` and therefore
automatically inherit the new exclusion.

### Section: "What NOT to Do"

**ADD** one bullet:

> - Never let an employee with an expired MCU be selected for RDT — even manually.
>   The swap action's replacement pool must also respect this exclusion.

---

## Behavioral notes (no code changes required, but worth understanding)

- **Employee already selected but MCU expires before test date:** the entry stays in
  their `rdt_log` with `status: 'selected'`. Admin should manually mark it `missed`
  (with a note like "MCU expired — will be covered by MCU renewal") and the person
  drops out of the pool until MCU is renewed. This does NOT require code — it's an
  operational note.

- **Employee marked `completed` earlier this fiscal year, then MCU expires:** their
  completed entry stays in the log and still counts toward yearly progress. They
  won't be picked again this year in the Apr–Jan phase regardless. In the Feb/Mar
  repeat phase, they'd be excluded from the repeat pool because they now fail
  `eligibleEmployees` — correct behavior; a repeat RDT while their MCU renewal is
  pending would be redundant.

- **Yearly progress `pool_size`:** shrinks slightly when employees enter MCU-renewal
  windows. This is correct — the yearly target is `round(1.2 × current_pool)` and
  should reflect who's actually testable. Coverage % is against the *current*
  pool, so someone who was tested in May and later dropped out for MCU renewal
  no longer counts toward the denominator either. If Khaled wants a "snapshot at
  April 1" pool for a more stable target, that's a Phase 2 change.
