# CLAUDE.md — OHS Database
> This file is Claude Code's persistent memory for this project.
> Read this at the start of every session before writing any code.

---

## What We Are Building

A standalone browser app to track certificate expiry and compliance for Landmark's Occupational Health & Safety department.

- **1 admin (Khaled):** Uses the desktop app to add/edit employees, manage officer accounts, manage dropdown lists, and publish updated data to a Google Drive folder
- **~10 safety officers:** Use the mobile app to check whether crew members are cleared to work at a tower site — verdict lookup only, no editing
- Hosted on **GitHub Pages** (static site — no server)
- **No backend at runtime. No API server. No database. No build step. No npm — ever.** Pure HTML, CSS, and vanilla JavaScript, served as-is.
- Data lives in a single JSON file the admin exports and re-uploads to Google Drive
- Officers get data via a Google Apps Script endpoint that reads the same Drive file and validates credentials server-side

---

## Tech Stack — Plain HTML/CSS/JS, No Build Tools

This project is intentionally framework-free and build-tool-free:

- **No npm, no package.json, no node_modules, no Vite, no webpack, no bundler of any kind**
- **No React** — UI is built with plain JS functions that return HTML strings (template literals), inserted via `innerHTML`, exactly like `design/ohs_admin_prototype.html` and `design/ohs_officer_prototype.html` already do
- **No Tailwind** — plain CSS files using CSS custom properties (variables) for the design tokens
- **No npm packages** — any third-party library (SheetJS for Excel, jsPDF for PDF) is loaded via a `<script src="https://cdn...">` tag directly in `index.html`, pinned to a specific version
- **Routing** — hash-based routing (`#/dashboard`, `#/field`, etc.) implemented in plain JS by reading `location.hash`, exactly like the prototypes
- **i18n** — a plain JS object with `en` and `ar` keys (no i18next), exactly like the prototypes' `I18N` object
- **Why this matters:** the whole point is that anyone on the team can open `index.html` in a browser, or the admin can edit a `.js` file directly and push — there is nothing to install, nothing to compile, nothing that can break because of a Google Drive sync lock or a missing `node_modules` folder

**The codebase should be a direct, modularized evolution of the two prototypes in `design/`** — same approach, just split into separate files per the File Map below instead of one big file, with real data persistence wired to JSON import/export and a real Apps Script endpoint for the officer app.

### Deployment

GitHub Pages serves the repo directly — no build/deploy script, no `gh-pages` branch, no `dist/` folder. Push to `main`, point GitHub Pages at the root, done. Editing a file and pushing is the entire deployment process.

---

## Non-Negotiable Rules

1. **No backend calls at runtime from the admin app** — the desktop app is 100% offline after load (except loading the CDN script tags for SheetJS/jsPDF, which only happens once on page load). The officer app is the one exception: it POSTs to a single Google Apps Script endpoint for login + data fetch, then works offline from IndexedDB cache
2. **No npm, no build step, ever** — if a feature seems to require installing a package, find a CDN `<script>` tag alternative or write it in plain JS instead
3. **No localStorage for employee data** — all employee data lives in JS variables (in-memory state) only. localStorage is only used for UI display preferences: language (`ohs_lang`) and accent theme (`ohs_theme`). The officer app's IndexedDB cache of the field snapshot is the one sanctioned exception (it stores the last-synced JSON so officers can work offline), and it must respect the fail-closed staleness lockout
4. **HashRouter pattern only** — routes are `#/...` fragments handled by reading `location.hash`. GitHub Pages does not support server-side routing, and hash routing needs zero configuration
5. **Bootstrap admin is memory-only** — never written to JSON. Exists only as a hardcoded fallback when no JSON is loaded
6. **Cannot delete last admin** — always validate before any user deletion. In practice this is a light constraint since there's only ever one admin, but the check must exist
7. **All UI text through `t('key')`** — never hardcode English or Arabic strings in JS template strings
8. **Site check verdict must fail-closed** — the officer app must lock and refuse to show verdicts if the cached snapshot is older than the configured max-stale threshold. Never show a verdict from stale data
9. **Certificate expiry logic is derived, never stored** — status per certificate is computed at render time from expiry_date + today's date + configured thresholds. Never persist "expired" or "urgent" state in the JSON
10. **Site check verdict logic is centralized** — blockers and warnings are defined in one place (`js/utils/verdict.js`) and used identically in the admin app (for the compliance state column) and the officer app (for the verdict card). Never duplicate this logic
11. **One file, one job** — never add logic to a file that belongs in another file (see File Map)
12. **Visual design comes from the two prototypes in `design/`** — sidebar (navy), accent color (switchable via theme palette), light content area on desktop, mobile-first shell for officer app. The Design System section below is the source of truth where a token needs to be looked up
13. **Employee list is always paginated** — `js/pages/employeeListPage.js` renders 50 employees per page (`PAGE_SIZE`), never the full filtered set, to keep `innerHTML` re-renders fast
14. **Export size caps are enforced before download** — PDF employee-card exports are capped at 100 employees, Excel/CSV at 5,000 (see "Export Limits"); never silently truncate the export — block it and tell the user to narrow their filters
15. **Certificate PDFs are external** — the app stores only a link/path string per certificate. It never uploads, downloads, or stores the PDF itself. Admin uploads PDFs to Google Drive or the company server outside the app; the app just stores where they went and opens the link when the admin clicks View
16. **Officer app never sees users/passwords** — the field snapshot published to Drive strips the `users` array. The Apps Script endpoint validates credentials against the users list inside its own execution context and returns only employees + certificates + thresholds

---

## How the App Works — Read This Carefully

This is a **JSON-file-driven app**, but with two distinct data flows depending on who's using it:

### Flow A — Admin (desktop)

Admin uses the desktop app to edit data. Sync is manual upload/download via Google Drive.

```
First visit: admin opens the app, uploads the current data.json from their computer
          ↓
Data loads into memory. IS_DIRTY starts false.
          ↓
Admin edits sites/employees → IS_DIRTY becomes true
          ↓
Admin clicks Export → data.json downloads to their Downloads folder
          ↓
Admin drags/uploads that file to the Google Drive folder,
replacing the previous copy
          ↓
Page refresh → session cleared, admin re-uploads the file on next visit
```

**No File System Access API. No mapped network drive. Nothing installed.** The Drive folder is the source of truth; the app is a temporary in-memory editor between two file uploads.

A one-time-ish Excel importer is also available in Settings → Data file for bulk-loading employees from a spreadsheet.

### Flow B — Officer (mobile)

Officers never see the full data. They fetch a stripped field snapshot via a Google Apps Script endpoint.

```
Admin (one-time setup): deploys apps-script/OhsFieldSync.gs as a Web App,
gets the endpoint URL, saves URL + Drive file ID in Settings → Data file
          ↓
Admin (ongoing): after editing, clicks "Publish field snapshot" →
downloads a stripped JSON (no users/passwords) → drags to Drive folder
          ↓
Officer opens the mobile app URL → logs in →
app POSTs {username,password} to the Apps Script endpoint
          ↓
Script reads the field snapshot from Drive, validates the credentials
against the users list, checks can_do_site_check flag, returns
{ok:true, snapshot:{employees, thresholds, published_at}} if valid
          ↓
Officer's browser caches the snapshot in IndexedDB with last_synced_at timestamp
          ↓
Officer works offline. On every open: if last_synced_at is older than
meta.field_sync_max_stale_days, app locks and forces a sync before verdict lookup
          ↓
Officer taps Sync any time to refresh from Drive via Apps Script
```

**The Drive JSON file is the single source of truth.** Admin publishes it after every editing session. Officers pull from it on demand. Neither ever writes to it directly — only admin's desktop export → drag-to-Drive flow updates it.

---

## User Roles

| Role | Where | Can do |
|---|---|---|
| `admin` | Desktop app | Everything: manage officer accounts, add/edit/archive/delete employees, edit dropdown lists, edit thresholds, import Excel, export JSON, publish field snapshot |
| `officer` | Mobile app only | Sync data from Apps Script endpoint, search employees by name/National ID, view verdict card |

### Officer permission flags

| Field | Type | Meaning |
|---|---|---|
| `active` | boolean | Whether this officer can log in at all |
| `can_do_site_check` | boolean | Must be true for the Apps Script endpoint to return data to this officer |

There is no per-officer scoping of which employees they can look up — all officers see all employees. If we ever need scoping (e.g. an officer only sees their region), add it via a `scope` field and filter in the Apps Script.

### Bootstrap admin account

When no JSON is loaded, a hardcoded bootstrap account allows first access:
- Username: `admin`
- Password: `admin123`
- Role: `admin`

This account exists only in memory. It is never written to any JSON. Real admin creates their proper account in Settings → Users, then exports the JSON before this bootstrap is needed again.

---

## JSON File Structure — Complete Reference

```json
{
  "meta": {
    "version": "1.0",
    "exported_at": "2026-07-14T14:30:00",
    "exported_by": "khaled",
    "server_base_path": "Z:\\ohs\\certs\\",
    "employee_id_prefix": "LM-EMP-",
    "next_employee_number": 12,
    "last_backup_at": "2026-07-14T14:30:00",
    "backup_reminder_days": 7,
    "warning_thresholds": {
      "urgent_days": 30,
      "soon_days":   60,
      "plan_days":   90
    },
    "field_sync": {
      "endpoint_url": "https://script.google.com/macros/s/AKfycb.../exec",
      "drive_file_id": "1AbCdEf...",
      "max_stale_days": 30,
      "last_published_at": "2026-07-14T14:35:00"
    },
    "field_options": {
      "field_titles":       ["Team Leader","Technician","Rigger","Site Engineer","Engineer","Welder","Helper","Driver","Driver&Helper"],
      "safety_titles":      ["HSE Director","HSE Manager","Safety Manager","Safety Coordinator","DC Coordinator","Safety Officer"],
      "contractors":        ["Landmark"],
      "subcontractors":     ["Landmark","Upper Telecom","New Plan","DAM Telecom","Basic","Startech","Value","AS Link","Expert","Apex"],
      "employment_status":  ["Active","Suspended","Terminated","Resigned"],
      "legal_permission":   ["Approved","Not approved","Pending"]
    }
  },
  "users": [
    {
      "user_id": "u001",
      "username": "khaled",
      "password": "changeme",
      "role": "admin",
      "display_name": "Khaled (Admin)",
      "active": true,
      "can_do_site_check": false,
      "created_at": "2026-07-01",
      "created_by": "system"
    },
    {
      "user_id": "u002",
      "username": "officer1",
      "password": "changeme",
      "role": "officer",
      "display_name": "Mahmoud Farouk",
      "active": true,
      "can_do_site_check": true,
      "created_at": "2026-07-01",
      "created_by": "khaled"
    }
  ],
  "employees": [
    {
      "employee_id": "LM-EMP-0001",
      "national_id": "28612011705414",
      "name": "Ahmed Hassan Ali",
      "team": "field",
      "personal": {
        "title": "Team Leader",
        "contractor": "Landmark",
        "subcontractor": "Landmark",
        "hired_date": "2017-10-08",
        "employment_status": "Active",
        "legal_permission": "Approved",
        "archived": false,
        "archived_at": "",
        "archived_by": ""
      },
      "certificates": {
        "wah_practical":   { "expiry_date": "2028-03-04", "file_link": "", "na": false },
        "wah_theoretical": { "expiry_date": "2028-03-04", "file_link": "", "na": false },
        "ra":  { "expiry_date": "2027-01-13", "file_link": "", "na": false },
        "fa":  { "expiry_date": "2027-01-10", "file_link": "", "na": false },
        "ff":  { "expiry_date": "2027-01-11", "file_link": "", "na": false },
        "ec":  { "expiry_date": "2028-01-11", "file_link": "", "na": false },
        "mcu": { "expiry_date": "2026-11-01", "file_link": "", "na": false },
        "ppe_inspection": { "expiry_date": "", "file_link": "", "na": false },
        "lifting":        { "expiry_date": "", "file_link": "", "na": false },
        "scaffolding":    { "expiry_date": "", "file_link": "", "na": false }
      },
      "qualifications": {
        "nebosh_igc": false,
        "iso_45001":  false,
        "osha":       false
      },
      "drug_tests": {
        "rdt_1": "2025-12-28",
        "rdt_2": "",
        "rdt":   ""
      },
      "renewal_history": [
        {
          "cert_key": "mcu",
          "old_expiry": "2025-11-01",
          "new_expiry": "2026-11-01",
          "renewed_at": "2025-10-15T09:30:00",
          "renewed_by": "khaled"
        }
      ],
      "meta": {
        "created_at": "2024-01-15T10:00:00",
        "created_by": "khaled",
        "updated_at": "2026-06-01T14:00:00",
        "updated_by": "khaled"
      }
    }
  ]
}
```

### Field notes

- **`employee_id`** — auto-generated `LM-EMP-####`, incremented from `meta.next_employee_number`. Stable, safe to use in routes. NEVER change once assigned.
- **`national_id`** — searchable, indexed by users mentally, but NOT the primary key. Egyptian national IDs are 14 digits and should not be used as URL fragments (PII).
- **`team`** — `"field"` or `"safety"`. Discriminator that drives which certificates and qualifications apply. Cannot change after creation (change of team means archive + create new).
- **`certificates.*.file_link`** — free-text string. Admin pastes a Google Drive share URL, a Windows path (`Z:\ohs\certs\...`), or any URL. If empty, no "Open certificate" button shows. App never validates or opens the link itself beyond passing it to `window.open()`.
- **`certificates.*.na`** — boolean. `true` means this certificate is **not needed for this employee**. An N/A cert derives to the `na` state (never `missing`) and is excluded from the "worst" aggregate, the renewals worklist, the dashboard charts/sparklines, and the site-check verdict (it can neither block nor warn). It travels with the field snapshot so the officer app derives the same result. Absent/falsy `na` behaves exactly as before.
- **`ppe_inspection` / `lifting` / `scaffolding`** — always present in the JSON schema, but only shown in the form/detail for `team === "safety"`. Field team employees have these fields but they stay empty forever.
- **`qualifications.*`** — same pattern, safety team only.
- **`drug_tests`** — field team uses `rdt_1` + `rdt_2`; safety team uses `rdt` (single). All three fields exist in every employee record but only the relevant ones are shown.
- **`renewal_history`** — append-only. When admin changes an existing expiry date, push a new entry `{cert_key, old_expiry, new_expiry, renewed_at, renewed_by}`. Never edit or delete history entries.
- **No global audit log** — same reasoning as our LMP project: single editor, `meta.updated_at`/`updated_by` per employee is enough. `renewal_history` is the one exception because it's operationally important.

---

## Compliance Derivation — Always Derived, Never Stored

Certificate status is computed at render time by `deriveCertState(expiryDate, thresholds, today)` in `js/utils/compliance.js`. Never store it in the JSON.

| State | Condition (given today's date) | Color |
|---|---|---|
| `na` | `certificates.<key>.na === true` (not needed for this employee) | Slate |
| `missing` | expiry_date is empty (and not N/A) | Gray |
| `expired` | expiry_date < today | Red |
| `urgent` | expiry_date within `urgent_days` (default 30) | Orange |
| `soon` | expiry_date within `soon_days` (default 60) | Amber |
| `plan` | expiry_date within `plan_days` (default 90) | Yellow |
| `valid` | expiry_date beyond `plan_days` | Green |

### Aggregate per employee

`deriveEmployeeCompliance(employee, thresholds, today)` returns:
```
{
  per_cert: { wah_practical: 'valid', mcu: 'urgent', ra: 'expired', ... },
  worst: 'expired',           // aggregate: worst state across applicable certs
  expiring_soon_count: 3,     // count of certs in urgent/soon/plan
  expired_count: 1
}
```

Applicable certs depend on team:
- **field** → wah_practical, wah_theoretical, ra, fa, ff, ec, mcu (7 certs)
- **safety** → all of the above + ppe_inspection, lifting, scaffolding (10 certs)

`missing` certs on applicable keys count in `worst` only when they're the ONLY state present (all valid → worst is `valid`, but valid + missing → worst is still `missing` for display honesty).

State ranking (highest wins for `worst`): expired > urgent > soon > plan > missing > valid. `na` certs are skipped entirely — they never contribute to `worst`, `expiring_soon_count`, or `expired_count`.

---

## Site Check Verdict — The Officer App's Core Logic

`deriveSiteCheckVerdict(employee, thresholds, today)` in `js/utils/verdict.js` returns:
```
{
  verdict: 'cleared' | 'warning' | 'blocked',
  blockers: [{ type, text }, ...],
  warnings: [{ type, text }, ...]
}
```

### Blockers (any one present → `blocked`)

- `personal.employment_status !== 'Active'`
- `personal.archived === true`
- `personal.legal_permission !== 'Approved'`
- `certificates.wah_practical` expired
- `certificates.wah_theoretical` expired
- `certificates.mcu` expired

### Warnings (present if no blockers → `warning`; ignored if already blocked)

- Any of the blocker certificates expiring within `urgent_days` (default 30)
- `certificates.fa` / `ff` / `ra` / `ec` expired OR expiring within `urgent_days`

### Otherwise → `cleared`

**Rules:**
- `missing` (no expiry date) is NOT a blocker or warning — it's just missing data. If admin hasn't entered an expiry, the officer sees "Missing" in the cert list but no explicit warning line. This matches how the current Excel-based tracking works — an absent date is just an absent record.
- Verdict logic MUST live in `js/utils/verdict.js` and be imported by both the admin app (for the compliance column and dashboard) and the officer app. Never duplicate.
- Officer app runs the verdict logic on its cached snapshot — the Apps Script does not compute verdicts server-side. Thresholds travel with the snapshot.

---

## Certificate PDF Handling — Link Only, No Upload

The app never touches PDF files. It stores a single string per certificate: `certificates.<key>.file_link`.

**Admin's workflow (external to the app):**
1. Admin uploads the PDF to Google Drive or the company server using Drive/Explorer directly
2. Admin copies the share link (or path)
3. Admin pastes it into the certificate's link field on the employee form
4. Done — app records the string, shows "View certificate" button, moves on

**In the UI:**
- Employee form: each certificate block has an expiry_date input AND a file_link text input side-by-side. Placeholder text: `https://drive.google.com/...`
- Employee detail: each certificate row shows the expiry, the derived state badge, AND a "View certificate" button that appears only if `file_link` is non-empty. Clicking it calls `window.open(file_link, '_blank')`.
- Officer app: certificate links are NEVER shown or opened. Officers see only expiry dates and state badges. Even if the field snapshot were to include the links (it shouldn't), officers wouldn't be able to open them at a tower site without auth.
- The field snapshot strips `certificates.*.file_link` before publishing (Apps Script strips it, or admin's publish step does — either way, officers never receive them).

---

## App Routes

Implemented in plain JS. `js/router.js` reads `location.hash`, sets `ROUTE` + `ROUTE_PARAM` in state, then `js/render.js` calls the matching page function.

### Admin app routes

| Route | Renders | Who |
|---|---|---|
| `#/login` | Login page | Entry point when no session |
| `#/dashboard` | Dashboard | admin |
| `#/field` | Field team list | admin |
| `#/field/new` | Employee form (new field employee) | admin |
| `#/safety` | Safety team list | admin |
| `#/safety/new` | Employee form (new safety employee) | admin |
| `#/employee/:id` | Employee detail | admin |
| `#/employee/:id/edit` | Employee form (edit) | admin |
| `#/renewals` | Renewals due page | admin |
| `#/export` | Export page | admin |
| `#/settings` | Settings page (4 tabs) | admin |
| `#/` | — | Redirect to `#/dashboard` if logged in, else `#/login` |

### Officer app routes (mobile shell)

The officer app is served from the same GitHub Pages site under `#/check/*`. When ROUTE starts with `check`, `render.js` renders the mobile shell instead of the desktop sidebar/topbar shell.

| Route | Renders | Who |
|---|---|---|
| `#/check` | Officer login | Entry point |
| `#/check/home` | Search + recent + sync strip | Logged-in officer |
| `#/check/employee/:id` | Verdict card | Logged-in officer |
| `#/check/locked` | Stale-sync lockout screen | Logged-in officer when cache too old |

`canAccessRoute(user, route)` in `js/utils/permissions.js` guards every render:
- Admin routes reject officers → redirect to `#/check/home`
- `#/check/*` routes reject admin → redirect to `#/dashboard`
- Any protected route rejects unauthenticated users → redirect to `#/login` or `#/check`

---

## Export Limits

| Format | Cap | Why |
|---|---|---|
| PDF (employee cards via jsPDF/autotable) | 100 employees | jsPDF with autoTable rendering one card per employee can stall the tab well before this. Capped low. |
| Excel (.xlsx) / CSV (SheetJS) | 5,000 employees | SheetJS handles large row counts fine — sanity guard, not a real bottleneck |

Enforced in `js/pages/exportPage.js`: the format buttons are disabled and an inline warning shows when the current filter's match count exceeds the cap. Never truncate silently — block it and tell the user to narrow their filters.

---

## Google Apps Script — Officer Sync Endpoint

The officer app cannot fetch directly from Drive (CORS). All officer traffic goes through a single Apps Script Web App endpoint that the admin deploys once.

### Setup (one-time, ~10 min, admin)

1. Go to `script.google.com` → New project → paste the code from `apps-script/OhsFieldSync.gs`
2. Set the two constants at the top of the script:
   - `DRIVE_FILE_ID` → the ID of the `ohs-field-snapshot.json` file in the Drive folder
   - (no API key needed — the script has implicit access to Drive under admin's account)
3. Deploy → New deployment → Web App
   - Execute as: **Me** (admin)
   - Who has access: **Anyone**
4. Copy the deployed URL — looks like `https://script.google.com/macros/s/AKfycb.../exec`
5. In the admin app: Settings → Data file → paste the URL into "Apps Script endpoint URL"
6. Admin exports data, clicks "Publish field snapshot" → drags the stripped file into the Drive folder, replacing the previous copy

Officers can now log in and sync.

### What the script does

- `doPost(e)` receives `{username, password}` as JSON
- Reads the Drive file, parses the JSON
- Finds the user in `users[]`, checks password match, role === 'officer', active === true, can_do_site_check === true
- If any check fails: returns `{ok: false, error: 'invalid_credentials'}`
- If all pass: returns `{ok: true, snapshot: {meta: {warning_thresholds, field_sync_max_stale_days, published_at}, employees: [...stripped...]}}`
- Stripping: removes `renewal_history`, `certificates.*.file_link`, and anything else officers don't need
- CORS: script returns `application/json` with permissive CORS headers so the browser can read the response

The full `.gs` code lives in `apps-script/OhsFieldSync.gs` in this repo — see BUILD.md Stage 10 for the exact contents.

---

## File Map — One Job Per File

No `node_modules`, no `package.json`, no config files for bundlers. Every file is loaded directly by the browser.

```
ohs-db/
├── CLAUDE.md                        ← you are here
├── BUILD.md                         ← step-by-step build guide
├── design/
│   ├── ohs_admin_prototype.html     # Approved desktop admin visual + architecture reference
│   └── ohs_officer_prototype.html   # Approved mobile officer visual + architecture reference
├── apps-script/
│   └── OhsFieldSync.gs              # Google Apps Script code — admin deploys this once
│
├── index.html                       # The entire app's single HTML entry point.
│                                     # Loads css/*.css, then js/main.js as a module,
│                                     # plus CDN <script> tags for SheetJS + jsPDF.
│
├── css/
│   ├── tokens.css                   # CSS custom properties from Design System section
│   ├── base.css                     # Resets, typography, RTL base rules
│   ├── layout.css                   # Sidebar, topbar, content area (desktop) + phone shell (mobile)
│   ├── components.css               # Buttons, inputs, cards, badges, modal, toast, tabs, verdict card
│   └── pages.css                    # Page-specific layout (dashboard charts, tables, forms, verdict hero)
│
├── js/
│   ├── main.js                      # Entry point: imports everything, calls initRouter() then render()
│   ├── state.js                     # In-memory app state: DATA, CURRENT_USER, ROUTE, IS_DIRTY, UI
│   ├── router.js                    # go(route, param), reads/writes location.hash, listens for hashchange
│   ├── render.js                    # Top-level render() — picks admin shell OR officer shell based on ROUTE
│   │
│   ├── i18n/
│   │   ├── en.js                    # English UI strings (plain JS object, exported)
│   │   ├── ar.js                    # Arabic UI strings — every key in en.js must exist here
│   │   └── i18n.js                  # t(key, params), setLanguage(lang) — reads/writes localStorage 'ohs_lang'
│   │
│   ├── data/
│   │   ├── bootstrap.js             # BOOTSTRAP_ADMIN, makeBootstrapData()
│   │   ├── dataActions.js           # loadJSON(), exportJSON(), addEmployee(), updateEmployee(),
│   │   │                             #   archiveEmployee(), deleteEmployee(), saveUsers(), updateMeta(),
│   │   │                             #   importFromExcel(), publishFieldSnapshot()
│   │   ├── auth.js                  # login(), logout()  (admin app only)
│   │   └── officerSync.js           # officerLogin(url, u, p), officerSync(url), cacheGet(), cacheSet(),
│   │                                 #   isCacheStale(thr) — talks to Apps Script + IndexedDB
│   │
│   ├── pages/
│   │   ├── loginPage.js             # renderLoginPage() — shows the JSON upload box when no data loaded
│   │   ├── dashboardPage.js         # renderDashboardPage() — split KPIs per team + combined charts
│   │   ├── employeeListPage.js      # renderEmployeeListPage(team) — used by both Field and Safety routes
│   │   │                             #   PAGE_SIZE = 50, resets to page 1 on any search/filter change
│   │   ├── employeeDetailPage.js    # renderEmployeeDetailPage()
│   │   ├── employeeFormPage.js      # renderEmployeeFormPage() — new + edit
│   │   ├── renewalsPage.js          # renderRenewalsPage() — sorted-soonest table across both teams
│   │   ├── exportPage.js            # renderExportPage() — enforces the Export Limits caps
│   │   ├── settingsPage.js          # renderSettingsPage() — 4 tabs: Users, Lists, Thresholds, Data file
│   │   ├── officerLoginPage.js      # renderOfficerLoginPage() — mobile shell entry
│   │   ├── officerHomePage.js       # renderOfficerHomePage() — search + sync strip
│   │   ├── officerVerdictPage.js    # renderOfficerVerdictPage() — verdict hero card + reasons + cert list
│   │   └── officerLockedPage.js     # renderOfficerLockedPage() — stale-sync lockout
│   │
│   ├── components/
│   │   ├── sidebar.js               # renderSidebar() — admin shell only
│   │   ├── topbar.js                # renderTopbar(title, sub, actionsHtml)
│   │   ├── badge.js                 # certStateBadgeHtml(state), complianceBadgeHtml(worst),
│   │   │                             #   verdictBadgeHtml(verdict), employmentStatusBadge()
│   │   ├── modal.js                 # modalHtml(title, bodyHtml, footHtml), openModal(), closeModal()
│   │   ├── toast.js                 # showToast(msg, type)
│   │   ├── themeSwatches.js         # renderThemeSwatches() — the 4 accent color circles
│   │   ├── officerHeader.js         # renderOfficerHeader() — navy bar for mobile shell
│   │   └── officerSyncStrip.js      # renderOfficerSyncStrip() — "Data as of X · Nd" + Sync button
│   │
│   ├── utils/
│   │   ├── compliance.js            # deriveCertState(), deriveEmployeeCompliance(), applicableCerts()
│   │   ├── verdict.js               # deriveSiteCheckVerdict() — SHARED by admin and officer apps
│   │   ├── permissions.js           # canAccessRoute()  (light — only two roles)
│   │   ├── format.js                # fmtDate(), escapeHtml(), initials(), daysUntil()
│   │   ├── theme.js                 # THEMES, getTheme(), setTheme() — reads/writes localStorage 'ohs_theme'
│   │   ├── excelImport.js           # parseExcelWorkbook(), buildImportPreview(), commitImport()
│   │   └── exportHelpers.js         # flattenEmployeeForExcel(), exportToExcel(), exportToCSV(), exportToPDF()
│   │
│   └── constants/
│       └── fields.js                # CERT_KEYS, SAFETY_ONLY_KEYS, CERT_LABEL_KEYS,
│                                     #   LIST_FIELD_KEYS + getFieldOptions(key) for admin-managed dropdowns
│
├── favicon.ico
└── back-ground.png                  # Optional app-wide background art (same as LMP), referenced from
                                      #   css/base.css at ~10% visibility via color-mix() overlay
```

### CDN scripts loaded in `index.html` (pin exact versions, no npm)

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
<script type="module" src="js/main.js"></script>
```

`js/` files use native ES modules (`import` / `export`) — modern browsers support this natively with `<script type="module">`, so no bundler is needed for that either.

---

## Visual Reference — Use These, Don't Reinvent

`design/ohs_admin_prototype.html` and `design/ohs_officer_prototype.html` are the **approved visual designs AND the approved architecture** for this app — they are already plain HTML/CSS/JS with hash routing and a plain-JS i18n object. Open both in a browser before starting any work.

The build is essentially: **take these two prototypes and split them into the modular files in the File Map above**, then replace the mock data plumbing with the real `loadJSON`/`exportJSON`/`addEmployee` etc. functions and the real Apps Script sync for the officer app.

Match the prototypes **exactly** for:

- Colors, spacing, border-radius, shadows (see Design System section below — values lifted from the prototypes)
- Component look and feel: buttons, badges, cards, inputs, tabs, modals, toasts, verdict hero card, sync strip
- Page layouts: sidebar + topbar shell (admin), phone shell with navy header and sync strip (officer), dashboard KPI cards and charts, employee list table, employee detail panels with cert grid, employee form with team-conditional fields, verdict card with color-coded hero, renewals sorted table, export cards, settings tabs
- The general render pattern: a JS function returns an HTML string for a page/component, it's inserted via `innerHTML`, then a `bind*Events()` function attaches event listeners afterward — this is the pattern used throughout both prototypes and should be used throughout the real app too

When building each page or component, open the matching section of the relevant prototype (view source or inspect in browser) and lift its CSS into the matching file in `css/`, and its render logic into the matching file in `js/pages/` or `js/components/`.

---

## Design System

**Theme:** Light content area (white cards on soft gray background) + a **fixed navy sidebar** (admin) / **navy header** (officer), with a **switchable accent color** picked from a 4-swatch palette in the sidebar bottom / hidden on the officer shell.

| Token | Value |
|---|---|
| Background | `#f5f6fa` |
| Card / surface | `#ffffff` |
| Border | `#e2e4ed` |
| Text primary | `#1a1d2e` |
| Text secondary | `#4a4f6a` |
| Text muted | `#9095b0` |
| Success | `#16a34a` |
| Warning | `#d97706` |
| Danger | `#e05252` |
| Purple | `#7c3aed` |
| Teal | `#0d9488` |

**Verdict / compliance colors:**

| State | Background | Text |
|---|---|---|
| Cleared / Valid | `#dcfce7` | `#15803d` |
| Plan (≤90d) | `#fef9c3` | `#854d0e` |
| Soon (≤60d) | `#fef3c7` | `#b45309` |
| Urgent / Warning (≤30d) | `#ffe4e6` | `#9f1239` |
| Expired / Blocked | `#fee2e2` | `#991b1b` |
| Missing | `#f3f4f6` | `#6b7280` |

**Typography:** `'Segoe UI', system-ui, -apple-system, sans-serif`
**Border radius:** `14px` cards, `8px` inputs and buttons, `10px` mobile touch controls
**Shadows:** `--shadow-sm` on `.card`, `--shadow-md` for hover-elevated elements and mobile emp-card
**Bilingual:** English (LTR) + Arabic (RTL). `document.documentElement.dir` toggled on language change. Flex containers use plain `flex-direction: row` — **never** `row-reverse` for RTL.

### Theme switcher — accent color, sidebar stays navy

- `js/utils/theme.js` exports `THEMES = ['blue','teal','purple','crimson']`, `getTheme()`, `setTheme(theme)`
- `setTheme(theme)` sets `document.documentElement.dataset.theme`, persists to `localStorage('ohs_theme')`, re-renders
- `css/tokens.css` defines `[data-theme="blue|teal|purple|crimson"]` blocks that override `--primary`, `--primary-dark`, `--primary-soft` — this is the only thing that changes between themes
- **The navy sidebar/header never changes with the theme** — only buttons, links, the active nav-item border, badges, and chart accents follow the selected theme color

### `css/tokens.css` — required :root block

```css
:root {
  --bg: #f5f6fa;
  --card: #ffffff;
  --border: #e2e4ed;
  --text: #1a1d2e;
  --text2: #4a4f6a;
  --muted: #9095b0;
  --primary: #3d5af1;
  --primary-dark: #2d47d4;
  --primary-soft: #3d5af11f;
  --success: #16a34a;
  --warning: #d97706;
  --danger: #e05252;
  --purple: #7c3aed;
  --teal: #0d9488;

  --cleared:    #16a34a;  --cleared-bg:  #dcfce7;  --cleared-dark: #15803d;
  --warn:       #d97706;  --warn-bg:     #fef3c7;  --warn-dark:    #b45309;
  --blocked:    #dc2626;  --blocked-bg:  #fee2e2;  --blocked-dark: #991b1b;
  --plan-bg:    #fef9c3;  --plan-tx:     #854d0e;
  --urgent-bg:  #ffe4e6;  --urgent-tx:   #9f1239;
  --missing-bg: #f3f4f6;  --missing-tx:  #6b7280;

  --radius-card: 14px;
  --radius-control: 8px;
  --radius-mobile: 10px;
  --shadow-sm: 0 1px 2px rgba(16, 24, 64, 0.05);
  --shadow-md: 0 4px 14px rgba(16, 24, 64, 0.08);
  --font-base: 'Segoe UI', system-ui, -apple-system, sans-serif;

  --navy: #0f1942;
  --navy-soft: #16215a;
  --navy-border: #232c63;
  --navy-text: #aab2d8;
  --navy-text-strong: #ffffff;
  --navy-muted: #6b74a8;

  --theme-color-blue: #3d5af1;
  --theme-color-teal: #0d9488;
  --theme-color-purple: #7c3aed;
  --theme-color-crimson: #be123c;
}

[data-theme="blue"]    { --primary: #3d5af1; --primary-dark: #2d47d4; --primary-soft: #3d5af11f; }
[data-theme="teal"]    { --primary: #0d9488; --primary-dark: #0b7a70; --primary-soft: #0d94881f; }
[data-theme="purple"]  { --primary: #7c3aed; --primary-dark: #6425c9; --primary-soft: #7c3aed1f; }
[data-theme="crimson"] { --primary: #be123c; --primary-dark: #9f0f32; --primary-soft: #be123c1f; }
```

Use these variables everywhere in `css/*.css` — never hardcode a hex color in a component file.

### Component reference cheatsheet

| Component | Key styling |
|---|---|
| `.btn-primary` | bg `var(--primary)`, white text, `var(--radius-control)` radius, `9px 15px` padding, hover → `var(--primary-dark)` |
| `.btn-ghost` | transparent bg, `1px solid var(--border)`, `var(--text2)` color |
| `.btn-danger` | bg `#fbeaea`, text `var(--danger)` |
| `.btn-lg` (mobile) | `padding: 14px 18px`, `font-size: 15px`, `border-radius: var(--radius-mobile)` |
| `.card` | white bg, `1px solid var(--border)`, `var(--radius-card)` radius, `var(--shadow-sm)` |
| `.badge` | pill shape, `3px 10px` padding, `11.5px` bold text, colors from verdict/compliance table |
| Admin sidebar | `230px` fixed width, navy bg, border-inline-end navy border, active nav item gets 3px inline-start border in `var(--primary)` + `rgba(255,255,255,.08)` bg |
| Theme swatches | row of 4 `20px` circles, active one gets a white ring + navy halo |
| Topbar | white bg, bottom border, `16px 26px` padding, flex space-between |
| Inputs | `1px solid var(--border)`, `8px` radius, `9px 10px` padding, focus ring `0 0 0 3px var(--primary-soft)` |
| Modal | centered, `max-width: 560px`, `12px` radius, dark overlay `rgba(20,22,40,.45)` |
| Toast | fixed bottom-end, dark bg, `9px` radius, auto-dismiss 2s |
| Verdict hero (officer) | full-width gradient block, big icon (66px), big label (26px), semi-transparent back button top-inline-start |
| Employee card (officer, overlaps hero) | `margin: -12px 14px 14px`, `border-radius: 14px`, `var(--shadow-md)` |
| Cert row (detail) | flex justify-space-between, small state badge on the end, "View certificate" link if file_link present |
| Sync strip (officer) | white bg, `10px 18px` padding, left = "Data as of X · Nd", right = Sync button in `var(--primary)` |
| Stale banner (officer) | full-width `var(--warn-bg)` strip below sync strip, appears when close to lockout threshold |

Use CSS logical properties everywhere for RTL support (`margin-inline-start/end`, `padding-inline-start/end`, `inset-inline-start/end`, `border-inline-start/end`, `text-align: start/end`) — never `margin-left`, `padding-right`, etc.

---

## i18n Rules

- All UI text uses `t('key')` from `js/i18n/i18n.js` — never hardcode strings in JS template literals
- Every key in `js/i18n/en.js` must have a matching key in `js/i18n/ar.js`
- Language preference saved to `localStorage` as `ohs_lang`
- On language change: `setLanguage(lang)` updates the active language, localStorage, `document.documentElement.dir`, `document.documentElement.lang`, and re-renders
- Date format: `DD MMM YYYY` in both languages, Gregorian calendar only, via `Intl.DateTimeFormat`
- No date library needed
- Parameterized strings: use `{name}` placeholders and pass a params object to `t()` — `t('reason_expired', {cert: 'MCU', days: 12})`

---

## Naming Conventions

| Thing | Convention | Example |
|---|---|---|
| Render functions | camelCase + `render` prefix | `renderEmployeeFormPage`, `renderTopbar` |
| Event-binding functions | camelCase + `bind` prefix | `bindEmployeeFormEvents` |
| Utility functions | camelCase | `deriveCertState`, `daysUntil` |
| JSON field keys | snake_case | `employee_id`, `expiry_date` |
| i18n keys | snake_case | `field_name`, `verdict_cleared` |
| CSS | plain classes, CSS variables for all tokens | `.btn-primary`, `.cert-row` |
| Files | camelCase, matches the main exported function | `employeeFormPage.js` exports `renderEmployeeFormPage` |

---

## What NOT to Do

- Never add `package.json`, `node_modules`, or any npm dependency
- Never introduce a bundler, transpiler, or build step of any kind
- Never use React, Vue, or any UI framework — plain JS template-literal rendering only
- Never persist employee data or users to localStorage (the officer's IndexedDB snapshot cache is the one sanctioned exception, and it must respect fail-closed staleness)
- Never make a `fetch()` call from the admin app (the officer app's Apps Script call is the only external network call anywhere in this project)
- Never hardcode any visible string in JS — always use `t('key')`
- Never store certificate state or verdict in the JSON — always derive at render time
- Never duplicate compliance or verdict logic between admin and officer apps — import from `js/utils/compliance.js` and `js/utils/verdict.js`
- Never show the officer app any user list, password, or renewal history — the field snapshot must strip these before publishing
- Never allow the officer app to show a verdict from stale cache — enforce the max-stale lockout
- Never allow deletion of the last admin user
- Never hardcode a hex color outside `css/tokens.css` — always reference the CSS variable
- Never render the full filtered employee list unpaginated — always slice to `PAGE_SIZE`
- Never let an export silently truncate over its cap — block it and tell the user to narrow filters
- Never store or open a certificate PDF from within the app — file_link is a string that gets passed to `window.open()` and nothing more
- Never add a feature not in this file without confirming with Khaled
