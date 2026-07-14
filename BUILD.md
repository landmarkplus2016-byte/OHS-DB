# BUILD.md — OHS Database
> Your step-by-step manual for building the app from zero to live.
> Work through this top to bottom. Check off every item as you go.
> Never skip a test. Never move to the next step if a test fails.
> **No npm. No build step. Ever.** Every file you create is loaded directly by the browser.

---

## Before You Write a Single Line of Code

### One-time setup checklist
- [ ] Create a new GitHub repository — name it `ohs-db` (public)
- [ ] Enable GitHub Pages: Settings → Pages → Deploy from `main` branch, root folder
- [ ] Create your project folder: `ohs-db`
- [ ] Drop `CLAUDE.md` into the root of that folder
- [ ] Drop `BUILD.md` into the root of that folder
- [ ] Create a `design/` folder in the root and drop both prototypes into it:
  - `design/ohs_admin_prototype.html`
  - `design/ohs_officer_prototype.html`
- [ ] Create an `apps-script/` folder in the root (empty for now — we'll fill it in Stage 10)
- [ ] Open the folder in VS Code
- [ ] Connect your local folder to the GitHub repository
- [ ] **Do not run `npm init`, `npm install`, or any npm command at any point in this project**

### How you'll preview the app while building
No dev server is required, but a tiny static file server avoids browser quirks with ES modules over `file://` URLs:
- VS Code's **"Live Server"** extension (right-click `index.html` → "Open with Live Server")
- Or Python's built-in server: `python -m http.server 8000` from the project root, then open `http://localhost:8000`

Neither installs anything into the project — they just serve the static files as-is.

### First message to Claude Code — copy and paste this exactly:
```
Read CLAUDE.md first and confirm you understand the project before writing any code.
Confirm you understand this is a plain HTML/CSS/JS project — no npm, no build tools,
no React, no Tailwind, ever.

Open and review both prototypes in a browser:
  - design/ohs_admin_prototype.html (desktop admin app)
  - design/ohs_officer_prototype.html (mobile officer app)
These are the approved visual designs AND the approved architecture (plain JS
template-literal rendering, hash routing, plain-JS i18n object). Confirm you
understand they will guide all styling and structural decisions.

Describe in your own words: what this app does, how data flows between the admin
desktop app and the officer mobile app, how the Apps Script + Google Drive sync
works for officers, why the admin app has no backend calls, and why hash-based
routing is required.

Then create the full folder and file structure as defined in the File Map section
of CLAUDE.md — empty files only, no code yet.

Do not write any logic until I confirm the structure looks correct.
```

### After structure is created — verify before moving on:
- [ ] All folders exist: `css/`, `js/`, `js/i18n/`, `js/data/`, `js/pages/`, `js/components/`, `js/utils/`, `js/constants/`, `design/`, `apps-script/`
- [ ] All files listed in the File Map exist and are empty (or near-empty)
- [ ] `CLAUDE.md` is in the root
- [ ] `BUILD.md` is in the root
- [ ] Both prototypes in `design/` and Claude Code has confirmed it reviewed them
- [ ] No `package.json`, no `node_modules`, no config files for any bundler exist anywhere
- [ ] No code has been written yet

---

## Stage 1 — Shell, tokens, i18n, constants, utils

**Goal:** `index.html` opens in a browser with no console errors. CSS tokens render correctly. Hash routing dispatches to placeholder pages. Language toggle switches EN/AR and flips RTL. All utility functions are testable in the console.

---

### Step 1.1 — index.html + CSS tokens + base + main.js

**Prompt:**
```
Read CLAUDE.md. We are on Stage 1, Step 1.

Build index.html:
- Standard HTML5 boilerplate, <html lang="en" dir="ltr" data-theme="blue">
- <link> tags for css/tokens.css, css/base.css, css/layout.css, css/components.css, css/pages.css (in that order)
- CDN <script> tags exactly as listed in CLAUDE.md's File Map section (SheetJS, jsPDF, jspdf-autotable)
- <script type="module" src="js/main.js"></script> at the end of <body>
- A single <div id="app"></div> as the mount point
- A comment noting that this file must be served through a static file server (not file://) for ES modules to work

Build css/tokens.css:
- Use the exact :root block from CLAUDE.md's Design System section — copy verbatim
- Include the [data-theme="..."] blocks for blue/teal/purple/crimson

Build css/base.css:
- box-sizing reset, body font-family: var(--font-base), background: var(--bg), color: var(--text)
- Tap-highlight reset for mobile (-webkit-tap-highlight-color:transparent)
- [dir="rtl"] font-family override matching design/ohs_admin_prototype.html
- Scrollbar styling matching the prototypes

Leave css/layout.css, css/components.css, css/pages.css as empty files with a header comment
saying which components they'll contain.

Build js/main.js (minimal for now):
- import { initRouter } from './router.js'
- import { render } from './render.js'
- A temporary render() that just sets #app innerHTML to "OHS Database — loading..."
- On DOMContentLoaded, call initRouter() then render()

Build js/router.js as a stub:
- export function initRouter() {} — will be filled in Stage 3
- export function go(route, param) { location.hash = '#/'+route+(param?'/'+param:''); }

Build js/render.js as a stub:
- export function render() { document.getElementById('app').innerHTML = 'OHS Database — loading...'; }

Confirm this opens with zero console errors via Live Server.
```

**Tests for Step 1.1:**
- [ ] Opening `index.html` via Live Server shows "OHS Database — loading..." with no console errors
- [ ] No 404s for any CSS or CDN script in the Network tab
- [ ] DevTools → Elements → `:root` computed styles show all custom properties from tokens.css
- [ ] Switching `<html data-theme="teal">` in DevTools changes `--primary` to `#0d9488`

---

### Step 1.2 — i18n layer

**Prompt:**
```
Read CLAUDE.md. Stage 1, Step 2.

Build the complete i18n layer: js/i18n/en.js, js/i18n/ar.js, js/i18n/i18n.js.

Each of en.js / ar.js exports a plain object:
  export const en = { ... }
  export const ar = { ... }

Keys needed (build all of these; if a key is used in the prototypes but missing here, add it):

App / nav:
  app_name, app_sub, nav_dashboard, nav_field, nav_safety, nav_renewals, nav_export, nav_settings
  sign_out

Login:
  login_title, upload_prompt, choose_file, file_loaded, username, password, sign_in
  invalid_creds, inactive_acct

KPIs / dashboard:
  kpi_total_field, kpi_total_safety, kpi_expired, kpi_urgent, kpi_compliant
  chart_by_cert, chart_by_state, chart_by_sub, recent_activity
  save_to_drive_note

Employee list:
  add_employee, search_ph, filter_status, filter_title, filter_sub, filter_all
  col_name, col_natid, col_title, col_sub, col_state, col_updated, col_actions
  view, edit, archive, unarchive, delete

Employee detail / form:
  section_personal, section_certs, section_quals, section_drug, section_history
  field_name, field_natid, field_title, field_contractor, field_sub, field_hired
  field_emp_status, field_legal
  cert_wah_p, cert_wah_t, cert_ra, cert_fa, cert_ff, cert_ec, cert_mcu
  cert_ppe, cert_lifting, cert_scaffolding
  qual_nebosh, qual_iso, qual_osha
  dt_rdt1, dt_rdt2, dt_rdt
  expiry_date, cert_link, open_cert, no_value

Compliance states:
  st_valid, st_plan, st_soon, st_urgent, st_expired, st_missing
  days_left, days_ago

Verdict (used by both admin compliance column and officer verdict card):
  verdict_cleared, verdict_warning, verdict_blocked
  verdict_sub_cleared, verdict_sub_warning, verdict_sub_blocked
  section_reasons, section_all_certs
  reason_not_active, reason_archived, reason_legal
  reason_expired ("{cert} expired {days} days ago")
  reason_expiring ("{cert} expires in {days} days")

Buttons / common:
  save, cancel, confirm, back, unsaved_changes

Settings:
  settings_tab_users, settings_tab_lists, settings_tab_thresholds, settings_tab_data
  threshold_urgent, threshold_soon, threshold_plan
  backup_reminder, sync_max_stale
  field_titles, safety_titles, contractors, subcontractors
  employment_statuses, legal_permissions
  one_per_line
  import_excel, download_backup, restore_backup, publish_snapshot
  apps_script_url, server_base_path, emp_id_prefix

Export:
  export_page_intro, ex_excel, ex_csv, ex_pdf
  ex_desc_excel, ex_desc_csv, ex_desc_pdf
  export_limit_pdf, export_limit_spreadsheet

Renewals:
  renewals_intro, days_window, next_n_days, all_including_expired
  team_label

Officer app:
  as_of, sync_now, synced, stale_warn ("Data is {days} days old — sync soon")
  locked_title, locked_msg ("Cached data is more than {max} days old. Please sync before checking any employee.")
  empty_search, empty_none, recent, setup_prompt

Every key in en.js must exist in ar.js.

js/i18n/i18n.js must:
- import { en } from './en.js' and import { ar } from './ar.js'
- Maintain a module-level `let currentLang` initialized from localStorage 'ohs_lang', default 'en'
- export function t(key, params): returns the string for currentLang, replaces {name} placeholders,
  falls back to the key itself if missing
- export function setLanguage(lang): updates currentLang, localStorage, document.documentElement.dir,
  document.documentElement.lang, then calls render() from render.js
- export function getLanguage(): returns currentLang

On module load: apply the initial dir/lang from currentLang so RTL works on the very first paint.
```

**Tests for Step 1.2:**
- [ ] `t('app_name')` in the console returns 'OHS Database' in English
- [ ] After `setLanguage('ar')` — `t('app_name')` returns the Arabic version
- [ ] `document.documentElement.dir` is `'rtl'` after switching to Arabic
- [ ] `t('reason_expired', {cert: 'MCU', days: 12})` returns "MCU expired 12 days ago"
- [ ] Refresh page — language persists from localStorage
- [ ] Console check: `Object.keys(en).length === Object.keys(ar).length` and no missing keys

---

### Step 1.3 — Constants

**Prompt:**
```
Read CLAUDE.md. Stage 1, Step 3.
Build js/constants/fields.js as a plain ES module.

Exports:
  export const CERT_KEYS = ['wah_practical','wah_theoretical','ra','fa','ff','ec','mcu']
  export const SAFETY_ONLY_KEYS = ['ppe_inspection','lifting','scaffolding']
  export const ALL_CERT_KEYS = [...CERT_KEYS, ...SAFETY_ONLY_KEYS]

  export const CERT_LABEL_KEYS = {
    wah_practical: 'cert_wah_p',
    wah_theoretical: 'cert_wah_t',
    ra: 'cert_ra',  fa: 'cert_fa', ff: 'cert_ff', ec: 'cert_ec', mcu: 'cert_mcu',
    ppe_inspection: 'cert_ppe', lifting: 'cert_lifting', scaffolding: 'cert_scaffolding'
  }

  // Certificates that count as blockers in the site-check verdict
  export const BLOCKER_CERT_KEYS = ['wah_practical','wah_theoretical','mcu']
  // Certificates that count as warnings only
  export const WARNING_CERT_KEYS = ['fa','ff','ra','ec']

  export const LIST_FIELD_KEYS = [
    'field_titles','safety_titles','contractors','subcontractors',
    'employment_status','legal_permission'
  ]

  export const DEFAULT_FIELD_OPTIONS = {
    field_titles:      ['Team Leader','Technician','Rigger','Site Engineer','Engineer','Welder','Helper','Driver','Driver&Helper'],
    safety_titles:     ['HSE Director','HSE Manager','Safety Manager','Safety Coordinator','DC Coordinator','Safety Officer'],
    contractors:       ['Landmark'],
    subcontractors:    ['Landmark','Upper Telecom','New Plan','DAM Telecom','Basic','Startech','Value','AS Link','Expert','Apex'],
    employment_status: ['Active','Suspended','Terminated','Resigned'],
    legal_permission:  ['Approved','Not approved','Pending']
  }

  // getFieldOptions(key) — returns configured list from DATA.meta.field_options, or the default.
  // Import DATA from '../state.js' lazily inside the function to avoid circular imports.
  export function getFieldOptions(key) { ... }

  // applicableCerts(employee) — returns CERT_KEYS for field, ALL_CERT_KEYS for safety.
  export function applicableCerts(employee) { ... }
```

**Tests for Step 1.3:**
- [ ] `CERT_KEYS.length === 7`, `ALL_CERT_KEYS.length === 10`
- [ ] `applicableCerts({team: 'field'}).length === 7`
- [ ] `applicableCerts({team: 'safety'}).length === 10`
- [ ] `getFieldOptions('subcontractors')` returns the defaults before any JSON is loaded
- [ ] No duplicate keys anywhere in the exports

---

### Step 1.4 — Utility functions

**Prompt:**
```
Read CLAUDE.md. Stage 1, Step 4.
Build all utility files as plain ES modules. Every function is a named export.

js/utils/format.js:
  - export function fmtDate(dateStr): formats as 'DD MMM YYYY' using Intl.DateTimeFormat,
    respecting the current language (getLanguage() from '../i18n/i18n.js'). Returns '—' for empty.
  - export function escapeHtml(str): escapes &, <, >, ", ' for safe innerHTML insertion
  - export function initials(name): returns up to 2 uppercase initials
  - export function daysUntil(dateStr): returns integer days from today; null for empty
  - export function todayISO(): returns today's date as 'YYYY-MM-DD'

js/utils/compliance.js:
  - import { BLOCKER_CERT_KEYS, WARNING_CERT_KEYS, applicableCerts } from '../constants/fields.js'
  - import { daysUntil } from './format.js'
  - export function deriveCertState(dateStr, thresholds): returns 'valid'|'plan'|'soon'|'urgent'|'expired'|'missing'
    exactly as specified in CLAUDE.md's Compliance Derivation table
  - export function stateRank(state): returns integer for ranking (expired=5, urgent=4, soon=3, plan=2, missing=1, valid=0)
  - export function deriveEmployeeCompliance(employee, thresholds):
    returns { per_cert: {}, worst: '...', expiring_soon_count: N, expired_count: N }
    per_cert covers only applicableCerts(employee)
    worst is the highest-ranked state across those certs

js/utils/verdict.js:
  - import { BLOCKER_CERT_KEYS, WARNING_CERT_KEYS, CERT_LABEL_KEYS } from '../constants/fields.js'
  - import { daysUntil } from './format.js'
  - import { t } from '../i18n/i18n.js'
  - export function deriveSiteCheckVerdict(employee, thresholds):
    returns { verdict: 'cleared'|'warning'|'blocked', blockers: [{type,text}], warnings: [{type,text}] }
    exactly as specified in CLAUDE.md's Site Check Verdict section

  This function is SHARED by admin and officer apps. Never duplicate the logic elsewhere.

js/utils/permissions.js:
  - export function canAccessRoute(user, route):
    - null user → true only if route === 'login' or route.startsWith('check')
    - admin → true for all admin routes; false for '#/check/*'
    - officer → true only for '#/check/*'
    - returns { ok: boolean, redirect: 'login' | 'dashboard' | 'check' }

js/utils/theme.js:
  - export const THEMES = ['blue','teal','purple','crimson']
  - export function getTheme(): reads localStorage 'ohs_theme', default 'blue'
  - export function setTheme(theme): sets document.documentElement.dataset.theme,
    persists to localStorage, calls render()

js/utils/exportHelpers.js:
  - export function flattenEmployeeForExcel(employee): one flat object, all fields as top-level keys,
    dates formatted as ISO 'YYYY-MM-DD' strings, certificate expiries prefixed cert_wah_practical_expiry etc.
  - export function exportToExcel(employees, lang): uses global XLSX from CDN,
    downloads OHS-Export-YYYY-MM-DD.xlsx
  - export function exportToCSV(employees):
    uses XLSX.utils.sheet_to_csv, downloads OHS-Export-YYYY-MM-DD.csv
  - export function exportToPDF(employees, lang):
    uses global jspdf + autoTable plugin, one page per employee,
    downloads OHS-EmployeeCards-YYYY-MM-DD.pdf
    Page structure: name + employee_id header, team badge, employment status,
      then one autoTable per section: Personal, Certificates, Qualifications (safety only), Drug tests
```

**Tests for Step 1.4:**
- [ ] `deriveCertState('', {urgent_days:30,soon_days:60,plan_days:90})` returns `'missing'`
- [ ] `deriveCertState('2020-01-01', thr)` returns `'expired'` (assuming today is 2026)
- [ ] `deriveCertState(dateStrPlus15Days, thr)` returns `'urgent'`
- [ ] `deriveCertState(dateStrPlus45Days, thr)` returns `'soon'`
- [ ] `deriveEmployeeCompliance(fieldEmp, thr).per_cert` has 7 keys, no safety-only keys
- [ ] `deriveEmployeeCompliance(safetyEmp, thr).per_cert` has 10 keys
- [ ] `deriveSiteCheckVerdict(activeEmpAllValid, thr).verdict === 'cleared'`
- [ ] `deriveSiteCheckVerdict(empWithExpiredWAH, thr).verdict === 'blocked'`
- [ ] `deriveSiteCheckVerdict(empWithExpiredFA, thr).verdict === 'warning'`
- [ ] `daysUntil('2026-08-14')` returns a positive integer close to 30 (given today 2026-07-14)
- [ ] `fmtDate('2026-07-14')` returns '14 Jul 2026' in English, Arabic equivalent when lang=ar

---

## Stage 2 — Data + Auth Layer

**Goal:** Data can be loaded from JSON. Admin can log in. Session lives in memory only. Logout clears it.

---

### Step 2.1 — Bootstrap + state + data actions

**Prompt:**
```
Read CLAUDE.md. Stage 2, Step 1.

Build js/data/bootstrap.js, js/state.js, and js/data/dataActions.js.

js/data/bootstrap.js:
  - export const BOOTSTRAP_ADMIN = {
      user_id:'bootstrap-admin', username:'admin', password:'admin123',
      role:'admin', display_name:'Administrator', active:true,
      can_do_site_check:false, created_at:'', created_by:'system'
    }
  - export function makeBootstrapData(): returns a full valid data object with:
      meta: { version:'1.0', exported_at:null, exported_by:null,
              server_base_path:'Z:\\ohs\\certs\\',
              employee_id_prefix:'LM-EMP-', next_employee_number:1,
              last_backup_at:'', backup_reminder_days:7,
              warning_thresholds: {urgent_days:30, soon_days:60, plan_days:90},
              field_sync: { endpoint_url:'', drive_file_id:'', max_stale_days:30, last_published_at:'' },
              field_options: DEFAULT_FIELD_OPTIONS (import from constants/fields.js) },
      users: [BOOTSTRAP_ADMIN],
      employees: []

js/state.js — the single source of truth for all in-memory admin app state:
  - export let DATA = makeBootstrapData()
  - export let CURRENT_USER = null
  - export let IS_DIRTY = false
  - export let ROUTE = 'login', ROUTE_PARAM = null
  - export let UI = {} — free-form per-page transient state (search, filters, active tab)
  - export function setData(newData) { DATA = newData }
  - export function setCurrentUser(u) { CURRENT_USER = u }
  - export function setRoute(r,p) { ROUTE = r; ROUTE_PARAM = p||null }
  - export function markDirty() { IS_DIRTY = true }
  - export function clearDirty() { IS_DIRTY = false }
  - Keep this file free of business logic — it only holds and mutates state

js/data/dataActions.js — all mutations to DATA go through these functions:
  - loadJSON(jsonString): parse → validate shape (must have meta,users,employees) →
    setData → clearDirty → return { ok, error }
  - exportJSON(currentUser):
    - build export object: spread DATA, override meta.exported_at (now ISO) and meta.exported_by
    - trigger file download as `ohs-data-YYYY-MM-DD.json` via Blob + <a download>
    - update meta.last_backup_at, clearDirty()
    - return { ok }
  - addEmployee(employee, user):
    - assign employee_id = `${DATA.meta.employee_id_prefix}${String(DATA.meta.next_employee_number).padStart(4,'0')}`
    - increment DATA.meta.next_employee_number
    - set employee.meta = {created_at, created_by:user.username, updated_at, updated_by:user.username}
    - push into DATA.employees, markDirty()
    - return the created employee
  - updateEmployee(employeeId, updates, user, changedCertKeys):
    - merge updates into the matching employee
    - for each key in changedCertKeys where the expiry_date changed:
        push { cert_key, old_expiry, new_expiry, renewed_at, renewed_by } into employee.renewal_history
    - update employee.meta.updated_at + updated_by
    - markDirty()
  - archiveEmployee(employeeId, user):
    - set employee.personal.archived = true, archived_at = now, archived_by = user.username
    - markDirty()
  - unarchiveEmployee(employeeId, user):
    - clear archived flag, updated_at
    - markDirty()
  - deleteEmployee(employeeId, user):
    - splice from DATA.employees
    - markDirty()
  - saveUsers(users): replace DATA.users, markDirty()
  - updateMeta(metaUpdates): merge into DATA.meta, markDirty()
  - publishFieldSnapshot():
    - build stripped snapshot: { meta: {warning_thresholds, field_sync_max_stale_days: DATA.meta.field_sync.max_stale_days, published_at: now}, users: DATA.users.filter(u => u.role==='officer' && u.active && u.can_do_site_check).map(strip password? — NO, Apps Script needs the password to validate), employees: employees stripped of renewal_history and certificates.*.file_link, archived employees excluded }
    - trigger file download as `ohs-field-snapshot.json`
    - update DATA.meta.field_sync.last_published_at
    - markDirty() only if last_published_at wasn't already now
    - IMPORTANT: users in the snapshot are kept but ONLY officers with active + can_do_site_check
      because the Apps Script needs them to validate logins. Do NOT strip passwords —
      Apps Script needs plaintext-match against them. This is intentional and documented in CLAUDE.md.
```

**Tests for Step 2.1:**
- [ ] On app load: `DATA.users` contains the bootstrap admin
- [ ] `loadJSON(validJson)` returns `{ok:true}`, DATA replaced, IS_DIRTY = false
- [ ] `loadJSON('{"bad":"json"}')` returns `{ok:false, error:...}`, DATA unchanged
- [ ] `addEmployee({name:'Test',team:'field',...})` assigns `LM-EMP-0001` for the first employee
- [ ] After adding, `DATA.meta.next_employee_number === 2`
- [ ] `updateEmployee` with a changed cert expiry pushes to renewal_history exactly once
- [ ] `archiveEmployee` sets `personal.archived = true` and records archived_by
- [ ] `exportJSON` triggers a file download and updates `meta.last_backup_at`
- [ ] Re-uploading exported JSON: all data intact, no data loss
- [ ] `publishFieldSnapshot` triggers a download of a file with `renewal_history` removed and `file_link` stripped from all certificate objects; archived employees not included

---

### Step 2.2 — Auth (admin only)

**Prompt:**
```
Read CLAUDE.md. Stage 2, Step 2.
Build js/data/auth.js — admin login only.
Officer auth lives in js/data/officerSync.js and is built later in Stage 9.

export function login(username, password):
  - find user in DATA.users where username + password match
  - if not found: return { ok:false, error: t('invalid_creds') }
  - if found but user.active === false: return { ok:false, error: t('inactive_acct') }
  - if found but user.role !== 'admin': return { ok:false, error: 'Desktop app is admin-only. Officers use the mobile app URL.' }
    (use an i18n key for this too — add it to en.js/ar.js)
  - if all pass: setCurrentUser(user), return { ok:true }

export function logout():
  - setCurrentUser(null)
  - clear UI state that shouldn't survive logout

CURRENT_USER is never persisted to localStorage. Lives only in the module-level variable in state.js.
Page refresh means logout. This is intentional — a fresh JSON upload + re-auth is required after every reload.
```

**Tests for Step 2.2:**
- [ ] Login with bootstrap admin credentials → `CURRENT_USER` is set
- [ ] Login with wrong password → returns error message
- [ ] Login with an inactive user → returns deactivated error
- [ ] Login attempt with an officer account → returns "admin-only" error
- [ ] Logout → `CURRENT_USER` is null
- [ ] Page refresh → `CURRENT_USER` is null, no session persistence

---

## Stage 3 — Router + Shell

**Goal:** App renders. Hash routing works. Route guards redirect correctly. Admin gets desktop shell; officer routes (unauthenticated) get the mobile shell.

---

### Step 3.1 — Router + top-level render

**Prompt:**
```
Read CLAUDE.md. Stage 3, Step 1.
Build js/router.js and js/render.js properly (replacing the Stage 1 stubs).

js/router.js:
  - export function go(route, param):
    - setRoute(route, param) (from state.js)
    - update location.hash to '#/'+route+(param?'/'+param:'')
    - call render()
  - export function initRouter():
    - Parse the initial location.hash and setRoute()
    - Listen for the 'hashchange' event: on fire, re-parse and re-render
  - Route guard: before rendering, call canAccessRoute(CURRENT_USER, ROUTE) from permissions.js
    If it returns { ok:false, redirect:'X' }, call go('X') and stop.

js/render.js:
  - export function render():
    - Determine which shell to use:
      - If ROUTE starts with 'check' → officer mobile shell (built in Stage 9)
      - Else if CURRENT_USER is null → login page (no shell)
      - Else → admin desktop shell (sidebar + topbar + content)
    - Map ROUTE to the matching page render function
    - Assemble the full HTML string and set into #app.innerHTML
    - Call the matching bind*Events() function afterward if it exists

For Stage 3, use one-line placeholder page functions:
  function pageDashboard() { return '<div class="content">Dashboard placeholder</div>'; }
  ...etc. for every route in CLAUDE.md's Routes table.

Wire main.js properly: on DOMContentLoaded, initRouter() then render().
```

**Tests for Step 3.1:**
- [ ] Visit `http://localhost:8000` with no session → login page shows
- [ ] After login → dashboard placeholder shows in admin shell
- [ ] Navigate via `location.hash = '#/field'` → field placeholder shows
- [ ] Browser back/forward buttons trigger re-render
- [ ] Refreshing any admin route redirects to login (no session in memory)
- [ ] Visiting `#/check` without login → officer login placeholder shows (mobile shell)
- [ ] Admin logged in visiting `#/check/home` → redirected to `#/dashboard`

---

### Step 3.2 — Admin shell (sidebar + topbar + theme swatches)

**Prompt:**
```
Read CLAUDE.md. Stage 3, Step 2.
Build the admin shell components. Reference design/ohs_admin_prototype.html for exact layout.

Build the matching CSS in css/layout.css (sidebar/topbar layout) and css/components.css
(theme swatches, buttons — you already have the tokens).

js/components/sidebar.js:
  - export function renderSidebar():
    - Logo area: 'OHS' in accent color, app_name, app_sub
    - Nav items: Dashboard, Field Team, Safety Team, Renewals, Export, Settings
      (Settings only shown for admin — always true in practice, but check role)
    - Active state: 3px inline-start border in var(--primary) + rgba(255,255,255,.08) bg
    - Bottom section: theme swatches row, language toggle row (EN/AR), user chip, sign out
  - export function bindSidebarEvents():
    - Nav links → go(route)
    - Swatches → setTheme(color)
    - Lang buttons → setLanguage(lang)
    - Sign out → logout() then go('login')

js/components/topbar.js:
  - export function renderTopbar(title, sub, actionsHtml):
    - Left: title + optional sub
    - Right: unsaved-changes indicator (amber dot + t('unsaved_changes') when IS_DIRTY),
      caller-provided actionsHtml, plus a fixed 'Export JSON' button (calls exportJSON(CURRENT_USER))
  - export function bindTopbarEvents():
    - Export JSON button → exportJSON(CURRENT_USER), then showToast('Downloaded — drag into Google Drive')

js/components/themeSwatches.js:
  - Small helper: renderThemeSwatches() returns the 4-swatch row markup with .active class on current theme

js/render.js should assemble the shell as:
  <div class="app">
    ${renderSidebar()}
    <div class="main">
      ${renderTopbar(title, sub, actions)}
      <div class="content">${page}</div>
    </div>
  </div>
Then bindSidebarEvents() and bindTopbarEvents() after innerHTML is set.
```

**Tests for Step 3.2:**
- [ ] Sidebar renders correctly in English (LTR)
- [ ] Language toggle switches to Arabic — sidebar flips to RTL, all labels translated
- [ ] Active nav item highlighted on current route
- [ ] Theme swatches change accent color across the whole app
- [ ] Unsaved changes indicator appears after any mutation and clears after Export JSON
- [ ] Sign out navigates to login and clears session

---

### Step 3.3 — Shared UI helpers

**Prompt:**
```
Read CLAUDE.md. Stage 3, Step 3.
Build the small shared components. Reference the prototypes for exact markup.

Fill in css/components.css with .btn-*, .field, .card, .badge (all variants),
.modal, .overlay, .toast, .filter-bar, .tbl matching the prototypes.

js/components/badge.js:
  - certStateBadgeHtml(state): small pill for 'valid'|'plan'|'soon'|'urgent'|'expired'|'missing'
  - complianceBadgeHtml(worst): larger pill for the worst-state aggregate on employee lists
  - verdictBadgeHtml(verdict): 'cleared'|'warning'|'blocked' pill
  - employmentStatusBadgeHtml(status): Active green pill, others gray

js/components/modal.js:
  - export function modalHtml(title, bodyHtml, footHtml): returns overlay + modal markup
  - export function openModal(title, bodyHtml, footHtml, onClose):
    - appends the modal to document.body
    - wires ESC and overlay-click to remove + call onClose
  - export function closeModal(): removes any open modal

js/components/toast.js:
  - export function showToast(msg, type='info'):
    - insert a .toast element, auto-remove after 2000ms
    - types: 'info' (dark), 'success' (green tint), 'error' (red tint) — subtle

All components render correctly in both LTR and RTL — use logical properties in CSS.
```

**Tests for Step 3.3:**
- [ ] Buttons render with correct colors from tokens
- [ ] `openModal('Test','<p>Hello</p>')` shows overlay + centered modal, closes on ESC
- [ ] Modal closes on overlay click, calls onClose callback
- [ ] `showToast('Saved')` auto-dismisses after 2s
- [ ] All render correctly in RTL — buttons, modals, toasts
- [ ] `certStateBadgeHtml('expired')` uses `--blocked-bg` / `--blocked-dark`

---

## Stage 4 — Login + Employee Lists

**Goal:** Admin can upload JSON and log in. Employee list pages (Field, Safety) render with search + filters.

---

### Step 4.1 — Login page

**Prompt:**
```
Read CLAUDE.md. Stage 4, Step 1.
Build js/pages/loginPage.js. Reference the login card in design/ohs_admin_prototype.html.

export function renderLoginPage():
  - Centered card: 'OHS' logo mark, app_name, app_sub
  - Language toggle (works without login)
  - JSON upload section — shown when DATA.employees.length === 0 AND DATA.users.length === 1 (bootstrap only)
    - Upload prompt text, <input type="file" accept=".json">
    - On file pick: FileReader.readAsText → loadJSON() → on success show green "Data loaded" confirmation
    - On error: red error text
  - When data IS loaded: show a small green banner "✓ Data loaded" with a "Re-upload" button that clears data
  - Username input, password input, sign-in button
  - Below the form: small text linking to the officer app URL for officers who visited by mistake:
    "Safety officers: go to [same domain]/#/check"

export function bindLoginPageEvents():
  - Language toggle buttons → setLanguage()
  - File input → FileReader → loadJSON()
  - Sign in button → login(username, password) → on success go('dashboard'), on error show inline error
```

**Tests for Step 4.1:**
- [ ] JSON upload area appears on first load (no data yet)
- [ ] Uploading invalid JSON → red error message
- [ ] Uploading valid JSON → green confirmation, upload area collapses
- [ ] Login with bootstrap admin (admin/admin123) → navigates to dashboard
- [ ] Login with wrong credentials → red error under form
- [ ] Login with an inactive user → deactivated error
- [ ] Login attempt with an officer account → "admin-only" error message
- [ ] Language toggle works on login page (before login)

---

### Step 4.2 — Employee list pages (Field + Safety)

**Prompt:**
```
Read CLAUDE.md. Stage 4, Step 2.
Build js/pages/employeeListPage.js. One component used by both /field and /safety routes.
Reference the list table in design/ohs_admin_prototype.html.

export function renderEmployeeListPage(team):
  - Filter DATA.employees for e.team === team AND !e.personal.archived
    (Add a "Show archived" toggle in filters that reveals archived employees when on)
  - Search: matches name (case-insensitive) or national_id (substring); reads UI.search
  - Filters: status (all/expired/urgent/valid), title (from getFieldOptions), subcontractor
  - Compute compliance for every filtered employee using deriveEmployeeCompliance
  - PAGE_SIZE = 50; slice results to the current UI.page (default 1)
  - Table columns (adjust for team):
    - Field team: Name, National ID, Title, Subcontractor, Compliance, Updated, Actions
    - Safety team: Name, National ID, Title, Subcontractor, Compliance, Quals summary (NEBOSH/ISO/OSHA badges), Updated, Actions
  - Actions per row: View (all), Edit (admin), Archive/Unarchive (admin)
  - Row click → go('employee', employee.employee_id)
  - Empty state: helpful message
  - Pagination footer: "Page X of Y", prev/next buttons
  - Topbar right actions: "+ Add employee" button → go('field','new') or go('safety','new')

export function bindEmployeeListPageEvents(): wires all inputs and buttons.
Any filter or search change must reset UI.page to 1.
```

**Tests for Step 4.2:**
- [ ] Field team page shows only field employees
- [ ] Safety team page shows only safety employees
- [ ] Safety table shows the extra Quals column
- [ ] Search for partial name → correct results
- [ ] Filter by status='expired' → only employees with worst='expired'
- [ ] Filter by subcontractor → only matching employees
- [ ] Show archived toggle reveals archived employees when on
- [ ] Pagination works — 50 per page, prev/next buttons
- [ ] Empty state shows when no matches
- [ ] Row click → navigates to employee detail

---

## Stage 5 — Employee Detail + Form

**Goal:** Admin can view every employee's full record. Admin can add and edit employees with team-conditional fields.

---

### Step 5.1 — Employee detail page

**Prompt:**
```
Read CLAUDE.md. Stage 5, Step 1.
Build js/pages/employeeDetailPage.js. Reference the detail sections in design/ohs_admin_prototype.html.

export function renderEmployeeDetailPage():
  - Find employee in DATA.employees by ROUTE_PARAM
  - Topbar: employee name, employee_id + national_id as sub
    Actions: Back, Edit, Archive/Unarchive, Delete (with confirmation modal)
  - Top row of badges: team tag, compliance worst badge, employment status, legal permission
  - Section: Personal (3-col grid of field-disp components)
  - Section: Certificates
    Grid (2 cols on wide, 1 col on narrow) of cert rows.
    Each cert row: name, formatted expiry + days remaining, state badge, "View certificate" link if file_link
  - Section: Qualifications (safety team only) — three badges
  - Section: Drug tests — field shows RDT 1 / RDT 2; safety shows RDT
  - Section: Renewal history (only shown if non-empty) — table of past renewals per cert

export function bindEmployeeDetailPageEvents():
  - Back → go(employee.team === 'field' ? 'field' : 'safety')
  - Edit → go('employee', employee_id) with edit mode — actually the edit route is
    #/employee/:id/edit; parse that in the router. Or use go('employee-form', employee_id).
  - Archive → confirmation → archiveEmployee → showToast
  - Delete → confirmation modal warning that renewal_history is lost → deleteEmployee →
    go(back to list)
  - "View certificate" → window.open(file_link, '_blank')
```

**Tests for Step 5.1:**
- [ ] All applicable certs render correctly for a field employee (7 cert rows)
- [ ] All 10 cert rows render for a safety employee, including PPE/Lifting/Scaffolding
- [ ] Qualifications section shows only on safety
- [ ] Field team drug tests shows RDT 1 + RDT 2; safety shows RDT
- [ ] Renewal history shows when non-empty, hidden when empty
- [ ] "View certificate" button appears only when file_link is non-empty
- [ ] Clicking View opens the link in a new tab
- [ ] Archive button → employee archived, list re-render hides them
- [ ] Delete with confirmation → employee removed, IS_DIRTY = true
- [ ] Delete confirmation warns about renewal history loss

---

### Step 5.2 — Employee form (new + edit)

**Prompt:**
```
Read CLAUDE.md. Stage 5, Step 2.
Build js/pages/employeeFormPage.js. Reference the form in design/ohs_admin_prototype.html.

Detect new vs edit from ROUTE and ROUTE_PARAM:
  - Route 'field' with param 'new' or route 'safety' with param 'new' → new mode
  - Route 'employee-form' with param = employee_id → edit mode (existing employee)
  Adjust router.js if needed to make the mapping clean.

Use a module-level `let formDraft = null` so typed values survive re-renders.
Initialize once per page entry: new → blank draft, edit → clone of existing employee.
Before every re-render (e.g. when switching between the inline sections), sync every
input's current value back into formDraft.

export function renderEmployeeFormPage():
  - Topbar: title ("Add employee" / employee.name), Cancel + Save actions
  - Team badge (readonly — cannot change team after creation for existing employees)
  - Section: Personal
    Generate inputs from a defined field list per section (no hardcoding).
    Title uses getFieldOptions('field_titles' or 'safety_titles').
    Subcontractor, employment_status, legal_permission use getFieldOptions with the right key.
  - Section: Certificates
    Generate 7 (field) or 10 (safety) cert blocks from applicableCerts(formDraft).
    Each block: expiry_date input, file_link input.
  - Section: Qualifications (safety only) — three checkboxes
  - Section: Drug tests — field shows RDT 1 + RDT 2; safety shows RDT

Validation on Save:
  - name required (inline error)
  - national_id required (inline error)
  - team must be set (implied by route)
  - Duplicate national_id check for new mode — inline error, blocks save

On Save:
  - New: addEmployee(formDraft, CURRENT_USER) → go('employee', newEmployee.employee_id)
  - Edit: identify which cert expiry_dates changed → updateEmployee(id, formDraft, user, changedCertKeys)
    → go('employee', id)

Cancel → history.back() or go to the team list.
```

**Tests for Step 5.2:**
- [ ] New field employee: form shows 7 certs, no PPE/Lifting/Scaffolding, no Qualifications section
- [ ] New safety employee: form shows 10 certs + qualifications + single RDT
- [ ] Empty name → inline error, save blocked
- [ ] Empty national_id → inline error, save blocked
- [ ] Duplicate national_id on new → inline error, save blocked
- [ ] Save → employee_id auto-assigned as LM-EMP-####, appears in list, IS_DIRTY = true
- [ ] Edit: existing values pre-filled, editing values doesn't lose data on re-render
- [ ] Edit + change MCU expiry + save → renewal_history has a new entry with old_expiry and new_expiry
- [ ] Cancel: no changes saved
- [ ] Files/links: paste a Drive URL into a cert's file_link input → save → detail page shows View button

---

## Stage 6 — Dashboard + Renewals + Export

**Goal:** Dashboard shows live stats with split team KPIs. Renewals page prioritizes upcoming work. Export downloads work in three formats.

---

### Step 6.1 — Dashboard

**Prompt:**
```
Read CLAUDE.md. Stage 6, Step 1.
Build js/pages/dashboardPage.js. Reference the dashboard in design/ohs_admin_prototype.html.

export function renderDashboardPage():
  - Filter active (non-archived) employees
  - Compute compliance for every employee
  - KPI row (4 cards, split per-team where meaningful):
    - Total active — one big number, then a split line "X Field · Y Safety"
    - Certs expired — total count with a small 7-day sparkline (fake data OK)
    - Expiring in ≤30 days
    - Fully compliant (worst === 'valid')
  - Optional hero banner: "Remember to upload the exported file to Google Drive · Last backup: X ago"
    with a Download JSON backup button. Only show when days-since-last-backup > backup_reminder_days.
  - Chart row 1:
    - Horizontal bar chart: cert types in x-axis, count expiring in next 90 days on y-axis
      Built with inline SVG or simple divs — no chart library
    - Donut chart of employees by worst state (SVG-only, matches prototype exactly)
  - Chart row 2:
    - Headcount by subcontractor (horizontal bars using --teal accent)
    - Recently updated: last 6 employees sorted by meta.updated_at desc

export function bindDashboardPageEvents():
  - Optional banner "Download backup" button → exportJSON(CURRENT_USER)
  - Recently updated rows → click → go('employee', id)
```

**Tests for Step 6.1:**
- [ ] KPI counts match actual employees after JSON upload
- [ ] Split line correctly shows field vs safety counts
- [ ] KPI counts update after adding a new employee
- [ ] Backup reminder banner appears if last_backup_at was > backup_reminder_days ago
- [ ] Charts reflect real proportions (donut segments sum to 100%)
- [ ] Recently updated shows the 6 latest employees

---

### Step 6.2 — Renewals page

**Prompt:**
```
Read CLAUDE.md. Stage 6, Step 2.
Build js/pages/renewalsPage.js. Reference the renewals table in design/ohs_admin_prototype.html.

export function renderRenewalsPage():
  - Build a flat list of {employee, cert_key, expiry, days_left, state}
    from active employees × their applicable certs (skip missing expiries)
  - Sort ascending by days_left (soonest first, including negative for expired)
  - Filters: days_window (7/30/60/90/all-incl-expired), team, subcontractor, cert type
  - PAGE_SIZE = 100 for this table (denser)
  - Row color-coded by state (subtle bg tint):
    expired → red-tint, urgent → orange-tint, soon/plan → yellow-tint, valid → white
  - Columns: Employee (name + employee_id), Team badge, Certificate, Expiry, Days, State badge, Subcontractor
  - Row click → go('employee', id)
  - Topbar right action: "Export this list to Excel" — passes the filtered set to exportToExcel with a flatter shape (one row per renewal, not one per employee)

export function bindRenewalsPageEvents(): filters, row clicks, export.
```

**Tests for Step 6.2:**
- [ ] List is sorted correctly, soonest expiring on top including negative days
- [ ] Filter by days_window=30 → only renewals ≤30 days ahead
- [ ] Filter by team=field → only field employees' renewals
- [ ] Row colors match state
- [ ] Row click → correct employee detail
- [ ] Export button downloads a spreadsheet with the renewals view

---

### Step 6.3 — Export page

**Prompt:**
```
Read CLAUDE.md. Stage 6, Step 3.
Build js/pages/exportPage.js. Reference the three export cards in design/ohs_admin_prototype.html.

export function renderExportPage():
  - Filter panel: team, status (worst state), subcontractor, include-archived toggle
  - Show match count
  - Enforce Export Limits caps from CLAUDE.md:
    - > 100 → disable PDF card, show inline warning
    - > 5000 → disable Excel/CSV cards, show inline warning
  - Three cards, each with hover shadow: Excel, CSV, PDF
    Each shows an icon, name, description
  - Click Excel → exportToExcel(filteredEmployees, getLanguage())
  - Click CSV → exportToCSV(filteredEmployees)
  - Click PDF → exportToPDF(filteredEmployees, getLanguage())

export function bindExportPageEvents(): filters and card clicks.
```

**Tests for Step 6.3:**
- [ ] Filter to 0 matches → cards disabled or clearly say "0 employees" with no download
- [ ] Filter to > 100 matches → PDF card disabled with cap warning
- [ ] Filter to > 5000 matches → Excel/CSV cards disabled
- [ ] Excel downloads a .xlsx with correct columns and rows
- [ ] CSV downloads a .csv with the same data
- [ ] PDF downloads with one page per employee, all sections rendered

---

## Stage 7 — Settings

**Goal:** All admin configuration in one page with 4 tabs.

---

### Step 7.1 — Settings shell + all four tabs

**Prompt:**
```
Read CLAUDE.md. Stage 7.
Build js/pages/settingsPage.js. Reference all four tabs in design/ohs_admin_prototype.html.

Structure:
  export function renderSettingsPage():
    - Topbar: "Settings"
    - Tabs row: Users | Lists | Thresholds | Data file (UI.setTab tracks active)
    - Render the matching tab panel below

Tab: Users
  - Table: Username, Display Name, Role badge, Site Check, Active toggle, Actions (Edit / Delete)
  - "+ Add user" button → opens modal with fields:
    username (required, unique), password (required), display_name, role (admin/officer),
    active (default true), can_do_site_check (default true when role=officer)
  - Edit user opens same modal pre-filled. Password field shows placeholder — leave blank to keep existing.
  - Delete: confirmation. Cannot delete if it would leave zero admins.
  - Active toggle: directly toggles user.active + saveUsers()

Tab: Lists
  - Six textareas in a two-column grid, one per LIST_FIELD_KEYS entry
  - Above each textarea: label = t(matching key), one option per line
  - Save button at bottom → parses each textarea into a string[] → updateMeta({field_options:{...}})
    → showToast('Lists updated')

Tab: Thresholds
  - Three number inputs: urgent_days, soon_days, plan_days
  - Two more: backup_reminder_days, field_sync.max_stale_days
  - Save button → updateMeta({warning_thresholds, backup_reminder_days, field_sync:{...}})

Tab: Data file
  - Four action cards in a 2×2 grid:
    - Import from Excel: file input → opens Excel import preview modal (Stage 8)
    - Download JSON backup: button → exportJSON(CURRENT_USER)
    - Restore from JSON backup: file input → confirmation modal → loadJSON()
    - Publish field snapshot: button → publishFieldSnapshot() → showToast('Snapshot exported — drag to Drive')
  - Below the grid: two text inputs
    - Apps Script endpoint URL (updates meta.field_sync.endpoint_url)
    - Drive file ID (updates meta.field_sync.drive_file_id) — used by the .gs script, stored here for admin's own reference
    - Server base path (updates meta.server_base_path) — legacy, in case admin wants a shared-drive prefix for pasted paths
    - Employee ID prefix (updates meta.employee_id_prefix) — with a "next number will be X" preview

export function bindSettingsPageEvents(): wires everything above.
Any settings change marks IS_DIRTY.
```

**Tests for Step 7.1:**
- [ ] Users tab: add user → appears in table → after Export JSON + re-upload → new user can log in
- [ ] Cannot delete last admin — error toast
- [ ] Deactivating a user → they can't log in
- [ ] Lists tab: adding a subcontractor → appears in employee form dropdown immediately
- [ ] Removing a subcontractor that's used by employees → existing employees still show it, dropdown just doesn't offer it
- [ ] Thresholds change: urgent_days from 30 → 45 → dashboard KPIs update immediately
- [ ] Data file tab: Download JSON backup → file downloads, last_backup_at updated
- [ ] Restore from backup: preview modal shows content summary, confirm replaces DATA
- [ ] Publish field snapshot: file downloads, contents strip renewal_history + file_links, users only include active officers
- [ ] Apps Script URL saves and persists in DATA.meta.field_sync.endpoint_url
- [ ] Any settings change → IS_DIRTY = true

---

## Stage 8 — Excel Import

**Goal:** Admin can bulk-load employees from an .xlsx file matching the OHS Data Base Landmark format. Preview before commit. Duplicates and unknown values are surfaced.

---

### Step 8.1 — Excel parser + preview + commit

**Prompt:**
```
Read CLAUDE.md. Stage 8, Step 1.
Build js/utils/excelImport.js.

The workbook has (typically) two sheets: 'Field Team' and 'Safety Team'.
Column headers vary slightly across versions of the file — do fuzzy header matching:
  Trim whitespace, lowercase, remove punctuation, then match against known aliases per column.

Column mapping (map to employee fields):
  'national id' → national_id
  'name'|'full name' → name
  'status'|'employment status' → personal.employment_status
  'title'|'job title'|'position' → personal.title
  'contractor' → personal.contractor
  'subcontractor'|'sub contractor'|'sub-contractor' → personal.subcontractor
  'hired date'|'hire date'|'date of hire' → personal.hired_date
  'wah expiry date (practical)'|'wah practical'|'work at height practical' → certificates.wah_practical.expiry_date
  ...(and so on for every column; see the sample file OHS_Data_base__Landmark.xlsx for full list)
  'ra expiry date' → certificates.ra.expiry_date
  ...
  'rdt 1 date'|'rdt1' → drug_tests.rdt_1
  'rdt 2 date'|'rdt2' → drug_tests.rdt_2
  'rdt date' → drug_tests.rdt (safety only)
  'legal permission approval'|'legal permission' → personal.legal_permission

Any date-shaped cell should be normalized to 'YYYY-MM-DD' — parse both Excel serial dates
and string dates like 'DD/MM/YYYY' or 'DD-MMM-YYYY'.

Exports:
  - export function parseExcelWorkbook(arrayBuffer):
    Uses global XLSX from CDN. Returns { field: [rows], safety: [rows], warnings: [] }
    Each row is a partial employee object. Rows with no national_id or no name are skipped
    with a warning.

  - export function buildImportPreview(parsed, existingEmployees, fieldOptions):
    Returns:
      {
        rows: [{ team, employee_partial, status:'new'|'duplicate'|'unknown_sub'|..., action:'import'|'skip'|'overwrite', reasons:[] }],
        summary: { new: N, duplicates: N, unknowns: N, skipped: N }
      }
    Status per row:
      - 'duplicate': national_id already in existingEmployees
      - 'unknown_sub': subcontractor not in fieldOptions.subcontractors
      - 'unknown_title': title not in fieldOptions[team+'_titles']
      - 'new': all fine

  - export function commitImport(preview, user):
    For each row where action is 'import' or 'overwrite':
      - if import → addEmployee(row.employee_partial, user)
      - if overwrite → find existing by national_id → updateEmployee with the new values
    For unknowns, if the admin ticked "add to list" in the preview UI, add the new value
    to the corresponding field_options list first.
    Returns { added:N, updated:N, list_added:{title:[],sub:[]} }

Build the preview modal UI inside settingsPage.js (Data file tab, Import from Excel action card):
  - After parsing: open a large modal
  - Show summary counts at the top
  - Table of rows with per-row Action select:
    - 'new' rows: Import (default) / Skip
    - 'duplicate' rows: Skip (default) / Overwrite / Add as new
    - 'unknown_sub' rows: "Add 'XyzCo' to Subcontractors list" (default) / Skip
    - 'unknown_title' rows: "Add '...' to titles list" (default) / Skip
  - Footer: Cancel / Confirm import
  - On Confirm: commitImport(), showToast summary, close modal, IS_DIRTY = true
```

**Tests for Step 8.1:**
- [ ] Import the provided OHS_Data_base__Landmark.xlsx → preview modal shows correct counts
- [ ] Field Team and Safety Team sheets both parse
- [ ] Rows with no national_id → skipped with warning
- [ ] A national_id that already exists → flagged 'duplicate', default action 'Skip'
- [ ] An unknown subcontractor → flagged, default action "Add to list"
- [ ] Confirming import with all defaults → correct number of employees added
- [ ] Overwrite duplicates → existing employee data updated
- [ ] "Add to list" actions actually extend meta.field_options and persist
- [ ] Cancel → no changes made to DATA

---

## Stage 9 — Officer app

**Goal:** Officers can log in, sync from Apps Script, view a verdict card for any employee, and be locked out if the cache is too old.

---

### Step 9.1 — Officer sync layer

**Prompt:**
```
Read CLAUDE.md. Stage 9, Step 1.
Build js/data/officerSync.js.

IndexedDB helper (small, self-contained — no libraries):
  - openDb() → promise of IDBDatabase 'ohs-officer' with object store 'kv' (keyPath 'key')
  - cacheGet(key) → returns value or null
  - cacheSet(key, value) → resolves when write is done
  - cacheClear() → clears the store

Public exports:
  - export const OFFICER_STATE = {
      snapshot: null,       // parsed field snapshot from cache
      user: null,           // logged-in officer (subset of officer record — display_name + username only)
      last_synced_at: null  // ISO string
    }

  - export async function bootstrapOfficerSession():
      Reads 'snapshot' + 'session' + 'last_synced_at' from IndexedDB and populates OFFICER_STATE.
      Call this from main.js on load, before render().

  - export function isCacheStale(): boolean
      Uses OFFICER_STATE.snapshot.meta.field_sync_max_stale_days and last_synced_at.

  - export async function officerLogin(endpointUrl, username, password):
      POSTs { action:'login', username, password } to endpointUrl.
      Body: JSON.stringify(...), Content-Type: text/plain (Apps Script CORS quirk workaround)
      On success: cache the returned snapshot and user, update OFFICER_STATE + last_synced_at.
      Returns { ok, error, snapshot }.

  - export async function officerSync(endpointUrl, username, password):
      Same as login but explicitly a re-sync — re-uses stored credentials from OFFICER_STATE.user
      (NOTE: for security we don't cache the password in IndexedDB; instead, on cache staleness
      or manual Sync click, we prompt the user to re-enter credentials.)
      Simpler model: officerSync just re-issues the login call using freshly-typed credentials.
      Return { ok, error }.

  - export async function officerLogout():
      cacheClear() and reset OFFICER_STATE. Redirect to '#/check'.

Do NOT persist the password. Only cache the snapshot and a lightweight session marker
({username, display_name, last_synced_at}). On stale-lockout, admin flow: prompt for
username+password again, then call officerLogin.
```

**Tests for Step 9.1:**
- [ ] `cacheSet('foo','bar')` then reload page → `cacheGet('foo')` returns 'bar'
- [ ] `officerLogin` with valid credentials against a deployed Apps Script → snapshot cached
- [ ] Fake `Date.now()` forward by 40 days (or set field_sync_max_stale_days lower) → `isCacheStale()` returns true
- [ ] Cache survives page refresh
- [ ] Password is never in IndexedDB (search stored values)

---

### Step 9.2–9.5 — Officer app pages

**Prompt:**
```
Read CLAUDE.md. Stage 9, Steps 2–5.
Build the four officer pages plus the mobile shell wiring. Reference design/ohs_officer_prototype.html.

Update js/render.js:
  - If ROUTE starts with 'check' → render mobile shell (no sidebar, no topbar).
    Structure:
      <div class="phone">
        ${renderOfficerHeader()}          // navy bar (skip on login screen)
        ${renderOfficerSyncStrip()}        // "Data as of X · Nd + Sync button" (skip on login/verdict)
        <div class="body">${pageBody}</div>
      </div>

Build the components:
  js/components/officerHeader.js — renderOfficerHeader() → navy bar with logo, display_name, sign-out icon
  js/components/officerSyncStrip.js — renderOfficerSyncStrip() → sync info + Sync button + stale banner

Step 9.2 — js/pages/officerLoginPage.js:
  - Full-screen navy gradient login card
  - Text: "Officer sign-in"
  - Username + password inputs, big Sign in button
  - Small note asking admin for the Apps Script endpoint if not yet configured
    (The endpoint URL is bundled with the field snapshot's meta — the app reads it from the
    last-cached snapshot. On very first use, the officer must be given the endpoint URL by
    the admin — support a one-time "Setup" screen where officer pastes the endpoint URL.
    Store this URL in IndexedDB cache as 'endpoint_url' so it persists across sessions.)
  - Sign in → officerLogin(endpointUrl, username, password)
    On success → go('check','home')
    On error → inline red error

Step 9.3 — js/pages/officerHomePage.js:
  - Check isCacheStale() first — if stale, go('check','locked') instead
  - Search box: name or national_id, live filter as officer types
  - If SEARCH empty: show "Recent lookups" (up to 5 employee_ids stored in memory only)
  - Result list: employee cards with name, title, employee_id, small dot showing quick verdict color
  - Tap → go('check','employee', employee_id)

Step 9.4 — js/pages/officerVerdictPage.js:
  - Full-width color-coded verdict hero (green/amber/red) with big icon + verdict label + subtext
  - Back button top-inline-start
  - Employee card overlapping hero: name, national_id, team tag, title tag, employment_status tag, legal_permission tag
  - If blockers: "Issues found" section with red left-border cards
  - If warnings: "Issues found" section with amber left-border cards
  - "All certificates" card at the bottom: expiry, days, state badge for each applicable cert

Step 9.5 — js/pages/officerLockedPage.js:
  - Full-screen white background, lock icon, title "Sync required", message with days count
  - Big Sync button → opens a prompt/modal for username+password → officerLogin → on success go('check','home')

Update main.js:
  - On DOMContentLoaded, before render(), call bootstrapOfficerSession() to hydrate IndexedDB state.
```

**Tests for Step 9.2–9.5:**
- [ ] Visit `#/check` → officer login page
- [ ] Enter valid credentials → syncs snapshot → home page shows
- [ ] Search for a name → results filter live
- [ ] Tap an employee → verdict card shows with correct verdict for that employee
- [ ] Cleared employee → green hero, no reasons section, all certs valid
- [ ] Blocked employee (e.g. expired MCU) → red hero, blockers listed
- [ ] Warning employee (e.g. WAH expires in 20 days) → amber hero, warnings listed
- [ ] Refresh page → session persists (cache hydrated from IndexedDB)
- [ ] Set field_sync.max_stale_days=1 in the admin app, publish snapshot, sync in officer app,
      then manually reset IndexedDB `last_synced_at` to 5 days ago → officer app locks
- [ ] Locked screen Sync → prompts credentials → re-syncs → home page unlocks
- [ ] Sign out clears cache and returns to login

---

## Stage 10 — Google Apps Script

**Goal:** Admin deploys the Apps Script that validates officer credentials and serves the field snapshot.

---

### Step 10.1 — The .gs code + deployment guide

**Prompt:**
```
Read CLAUDE.md. Stage 10.
Create apps-script/OhsFieldSync.gs with the code below (copy verbatim, then customize
the two constants at the top per your setup).

======================================================================
FILE: apps-script/OhsFieldSync.gs
======================================================================

// OHS Field Sync — reads the field snapshot from Google Drive and returns
// stripped data to an authenticated officer.
//
// Setup:
//  1. In Google Drive, upload your ohs-field-snapshot.json to a folder you own.
//  2. Right-click the file → Share → "Anyone with the link" is NOT needed
//     since this script runs as YOU and has access to your Drive.
//  3. Get the file ID from the URL (the long string between /d/ and /view).
//  4. Paste it below as DRIVE_FILE_ID.
//  5. Deploy → New deployment → type: Web app
//       Execute as: Me
//       Who has access: Anyone (this is safe — auth is inside the script)
//  6. Copy the deployment URL, paste into the admin app: Settings → Data file → Apps Script URL.

const DRIVE_FILE_ID = 'PASTE_YOUR_FIELD_SNAPSHOT_FILE_ID_HERE';

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.action !== 'login') return jsonResponse({ok:false, error:'unknown_action'});

    const raw = DriveApp.getFileById(DRIVE_FILE_ID).getBlob().getDataAsString();
    const data = JSON.parse(raw);

    const user = (data.users || []).find(u =>
      u.username === req.username &&
      u.password === req.password &&
      u.active === true &&
      u.role === 'officer' &&
      u.can_do_site_check === true
    );

    if (!user) return jsonResponse({ok:false, error:'invalid_credentials'});

    // Build the officer-facing snapshot (strip anything they shouldn't see)
    const snapshot = {
      meta: {
        version: data.meta.version,
        warning_thresholds: data.meta.warning_thresholds,
        field_sync_max_stale_days: (data.meta.field_sync && data.meta.field_sync.max_stale_days) || 30,
        published_at: (data.meta.field_sync && data.meta.field_sync.last_published_at) || data.meta.exported_at || new Date().toISOString()
      },
      employees: (data.employees || [])
        .filter(emp => !emp.personal.archived)
        .map(emp => ({
          employee_id: emp.employee_id,
          national_id: emp.national_id,
          name: emp.name,
          team: emp.team,
          personal: {
            title: emp.personal.title,
            subcontractor: emp.personal.subcontractor,
            employment_status: emp.personal.employment_status,
            legal_permission: emp.personal.legal_permission,
            archived: false
          },
          certificates: stripCertLinks(emp.certificates),
          qualifications: emp.qualifications,
          drug_tests: emp.drug_tests
        }))
    };

    return jsonResponse({
      ok: true,
      user: { username: user.username, display_name: user.display_name },
      snapshot: snapshot
    });
  } catch (err) {
    return jsonResponse({ok:false, error:'server_error', detail: String(err)});
  }
}

// Officers never see file_link, so strip it.
function stripCertLinks(certs) {
  const out = {};
  for (const k in certs) {
    out[k] = { expiry_date: (certs[k] && certs[k].expiry_date) || '' };
  }
  return out;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Optional: doGet for quick health check
function doGet(e) {
  return jsonResponse({ok:true, service:'OHS Field Sync', version:'1.0'});
}
```

Write a short README section inside `apps-script/` folder or at the top of the .gs file
covering the deployment steps clearly, since the admin will do this by copy-paste.

**Tests for Step 10.1:**
- [ ] Paste the .gs file into a new Apps Script project
- [ ] Set DRIVE_FILE_ID to a real Drive file ID containing a valid field snapshot
- [ ] Deploy as Web App, "Execute as: Me", "Anyone" access
- [ ] Copy the URL, hit it in a browser as a GET → returns `{ok:true, service:'OHS Field Sync'...}`
- [ ] Paste the URL into the officer app's setup screen
- [ ] Try login with valid officer credentials → snapshot returned, cached, home page shows
- [ ] Try login with wrong password → returns `{ok:false, error:'invalid_credentials'}` → officer app shows error
- [ ] Try login with an admin's credentials → rejected (role check fails)
- [ ] Try login with can_do_site_check=false → rejected

---

## Stage 11 — Polish

**Goal:** App is bilingual, RTL-correct, deployed to GitHub Pages.

---

### Step 11.1 — RTL + bilingual audit

**Prompt:**
```
Read CLAUDE.md. Stage 11, Step 1.
Audit the entire app for bilingual completeness and RTL correctness.

Check every page in both admin AND officer apps:
- Every visible string uses t('key') — no hardcoded text in any .js file
- Every key used in JS exists in both js/i18n/en.js and js/i18n/ar.js
  (Run a console script: Object.keys(en) === Object.keys(ar) check)

RTL layout must flip correctly on every screen:
- Admin sidebar moves to the right side
- All text is start-aligned (right-aligned in RTL, left-aligned in LTR)
- Form labels and inputs correctly directional
- Table column text start-aligned
- Nav active-border on the correct inline side
- Verdict hero back button on the correct side
- Sync strip button on the correct side

Use ONLY CSS logical properties in all css/*.css:
  margin-inline-start/end, padding-inline-start/end,
  inset-inline-start/end, border-inline-start/end,
  text-align: start/end
Never margin-left, padding-right, left, right, or text-align: left/right.

Test on every page in both languages, admin and officer.
```

**Tests for Step 11.1:**
- [ ] Every page — switch to Arabic — all text switches
- [ ] Switch back to English — all text switches back
- [ ] RTL: admin sidebar on right, all text right-aligned, active border on right
- [ ] Officer app in Arabic: header layout correct, sync strip mirrored, verdict card layout correct
- [ ] No hardcoded English or Arabic strings visible in either mode
- [ ] Language preference persists after page refresh

---

### Step 11.2 — Deploy to GitHub Pages

**Prompt:**
```
Read CLAUDE.md. Stage 11, Step 2.
Deploy to GitHub Pages. There is no build step, so this is just push + a settings toggle.

1. Commit and push everything to `main`
   (CLAUDE.md, BUILD.md, design/, apps-script/ stay in the repo — they don't affect the live app)
2. GitHub repo → Settings → Pages → Source: "Deploy from a branch" → Branch: `main`, folder: `/ (root)`
3. Wait ~1 minute for GitHub Pages to publish
4. Confirm the app loads at https://[username].github.io/ohs-db/
5. Officers hit https://[username].github.io/ohs-db/#/check
6. Admin hits https://[username].github.io/ohs-db/#/login

No npm install, no build command, no gh-pages branch, no dist folder — the repo IS the deployed site.
```

**Tests for Step 11.2:**
- [ ] Admin URL loads with no console errors
- [ ] Hash routing works on the live URL — refreshing any admin route stays on it
- [ ] Officer URL (`#/check`) loads the mobile shell
- [ ] CDN scripts (SheetJS, jsPDF) load on the live URL (Network tab shows 200s)
- [ ] Admin login works on live URL
- [ ] JSON upload works on live URL
- [ ] Officer login → Apps Script call succeeds → snapshot syncs
- [ ] Editing any file locally and pushing again updates the live site within a minute

---

## Stage 12 — Full QA Checklist

Complete every item before going live. Do not skip.

**Admin auth & session:**
- [ ] Bootstrap login (admin / admin123) works with no JSON loaded
- [ ] Login with credentials from uploaded JSON works
- [ ] Wrong password → clear error message
- [ ] Inactive user → clear error message
- [ ] Officer attempting admin login → clear "admin-only" error
- [ ] Page refresh → session cleared, redirected to login
- [ ] Logout → session cleared

**Admin JSON data flow:**
- [ ] Upload JSON → all employees + users load correctly
- [ ] Add employee → appears in list, IS_DIRTY = true
- [ ] Edit employee → changes reflected in detail view
- [ ] Change a cert expiry_date → renewal_history entry created
- [ ] Archive employee → hidden from default list, IS_DIRTY = true
- [ ] Unarchive employee → visible again
- [ ] Delete employee → confirmation shown, then removed
- [ ] Export JSON → file downloads with all changes
- [ ] Re-upload exported JSON → all data intact
- [ ] Publish field snapshot → separate file downloads with users stripped to active officers, renewal_history removed, file_links removed

**Excel import:**
- [ ] Import the reference OHS_Data_base__Landmark.xlsx → preview modal shows correct counts
- [ ] Duplicates flagged, "add to list" option for unknown values works
- [ ] Confirm import → correct number of employees created / updated
- [ ] Cancel → no changes

**Site check verdict (admin side check):**
- [ ] Same employee shows same worst state in admin list as they'd get on officer verdict
- [ ] Blocker vs warning classification matches the CLAUDE.md rules

**Officer app:**
- [ ] First visit → login prompts for Apps Script URL setup on the very first launch
- [ ] Login with valid officer creds → snapshot syncs, home page loads
- [ ] Search finds employees by name and by national_id
- [ ] Verdict card shows correct color and reasons for cleared/warning/blocked employees
- [ ] All certs listed with correct state per cert
- [ ] File links NEVER appear in the officer app
- [ ] Refresh page → session persists (IndexedDB hydration)
- [ ] Manually setting max_stale_days=1 and last_synced_at back 5 days → app locks
- [ ] Sync from locked screen → unlocks after fresh login
- [ ] Sign out → cache cleared

**Apps Script:**
- [ ] GET request returns health check JSON
- [ ] POST with invalid credentials → error
- [ ] POST with valid credentials → snapshot with no users list, no file_links, no renewal_history
- [ ] Admin credentials cannot be used to sync officer app

**Dashboard:**
- [ ] KPI counts correct after JSON upload
- [ ] Split field/safety split line correct
- [ ] Charts reflect real proportions
- [ ] Backup-reminder banner appears after threshold days

**Export:**
- [ ] Excel download — correct columns and rows
- [ ] CSV download — same data
- [ ] PDF download — one page per employee
- [ ] Export caps enforced: PDF > 100 disabled, Excel > 5000 disabled

**Settings:**
- [ ] Add user → after Export + re-upload → new user can log in
- [ ] Cannot delete last admin
- [ ] Deactivate user → they cannot log in
- [ ] Editing a list → dropdown in employee form reflects the change
- [ ] Editing thresholds → dashboard KPIs recalculate

**Bilingual / RTL:**
- [ ] Every string translates in both directions on every page (admin + officer)
- [ ] RTL layout correct on all pages in Arabic
- [ ] Language preference persists after refresh
- [ ] No hardcoded strings

**No-build sanity check:**
- [ ] No `package.json` or `node_modules` anywhere in the repo
- [ ] No bundler config files anywhere
- [ ] The app runs by opening `index.html` through a static file server with zero install steps
- [ ] Editing any .js file and refreshing the browser reflects the change immediately

---

## Stage 13 — Go Live

### Switch from bootstrap to real data:
1. [ ] Open admin app with bootstrap login (admin / admin123)
2. [ ] Settings → Users → create the real admin account with a strong password
3. [ ] Export JSON → this is now the master file
4. [ ] Save master JSON to the Google Drive folder — agree on a location with the team
5. [ ] Create all officer accounts in Settings → Users
6. [ ] Import employees from the OHS Data Base Landmark.xlsx (or create fresh)
7. [ ] Export JSON again → replace file on Drive
8. [ ] Deploy the Apps Script (Stage 10 setup)
9. [ ] Test one officer end-to-end: give them the officer URL + Apps Script URL → sign in → sync → look up an employee
10. [ ] Announce launch to the team: admin URL, officer URL, what admin does on each edit, what officers do

### Ongoing — admin responsibilities:
- After every edit session: Export JSON → upload to Drive folder (replaces the master)
- Also click Publish field snapshot → upload to same Drive folder (replaces the officer snapshot)
- Message the team when a new snapshot is available; officers tap Sync in their app

### Ongoing — officer responsibilities:
- Tap Sync at least every 30 days (or whatever max_stale_days is set to)
- If the app locks, tap Sync and re-enter credentials

---

## Future Additions (Phase 2)

Ideas parked for later — don't build yet:
- Automated sync from admin desktop directly to Drive (would need OAuth popup or a small backend)
- Notifications: email officers 30/7/1 days before their own certs expire
- Search across renewal history (audit-style filter)
- Second admin role (would reintroduce the concurrency and require a real audit log)

The swap points are intentionally isolated:
- **js/data/dataActions.js** — swap loadJSON/exportJSON for a live sync layer if needed
- **apps-script/** — add write-back endpoints for real bidirectional sync
- **All pages and components** — unchanged, they only call data-layer functions

---

*Keep this file open while building. Check off every item as you go.*
*If something fails a test, fix it before moving to the next step.*
*Never skip the Stage 12 QA checklist — it catches cross-feature issues.*
*If Claude Code goes off-plan, paste the relevant CLAUDE.md section and say: follow this exactly.*
*If Claude Code ever suggests installing an npm package, stop it and ask for a CDN or plain-JS alternative instead.*
