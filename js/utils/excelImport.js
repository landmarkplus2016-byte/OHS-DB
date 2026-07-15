// excelImport.js — bulk-load employees from the OHS Data Base Landmark workbook.
// One job: turn an .xlsx ArrayBuffer into reviewable rows, then commit the ones
// the admin approved. Uses the CDN global window.XLSX — never an npm package.
//
// Three stages, one export each:
//   parseExcelWorkbook  — bytes            -> { field, safety, warnings }
//   buildImportPreview  — parsed + DATA    -> { rows, summary }   (pure; no mutation)
//   commitImport        — approved preview -> writes via dataActions
//
// Nothing here touches DATA until commitImport, so Cancel is always free.

import { DATA } from '../state.js';
import { addEmployee, updateEmployee, updateMeta } from '../data/dataActions.js';
import { ALL_CERT_KEYS } from '../constants/fields.js';
import { t } from '../i18n/i18n.js';

// ── header normalisation ────────────────────────────────────────────────────

// Collapses a header to a comparable form: lowercase, punctuation to spaces,
// a space inserted at every letter/digit boundary, whitespace squeezed. This is
// what makes 'Sub-Contractor', 'sub contractor', and 'SubContractor' one key,
// and what lets the single alias 'rdt 1' cover both 'RDT1' and 'RDT 1 Date'.
function normHeader(h) {
  return String(h == null ? '' : h)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── column vocabulary ───────────────────────────────────────────────────────
//
// One entry per importable column: where the value lands, how to read it, and
// every spelling seen in the wild. Aliases are matched against normHeader(), so
// they are written already-normalised (no punctuation, no double spaces).
//
// NOTE: only the aliases named in BUILD.md are confirmed; the rest are
// extrapolated from the JSON schema in CLAUDE.md, because the sample workbook
// (OHS_Data_base__Landmark.xlsx) is not in the repo. Headers the matcher does
// not recognise are reported as warnings rather than dropped silently, so a
// miss is visible on the first real import and fixed by adding one string here.
const COLUMNS = [
  { path: 'national_id', type: 'text', aliases: ['national id', 'national i d', 'nationalid', 'nid', 'natid', 'national id number', 'id number', 'national number'] },
  { path: 'name', type: 'text', aliases: ['name', 'full name', 'employee name', 'employee full name'] },

  { path: 'personal.employment_status', type: 'text', aliases: ['status', 'employment status', 'employee status', 'work status'] },
  { path: 'personal.title', type: 'text', aliases: ['title', 'job title', 'position', 'job position', 'designation'] },
  { path: 'personal.contractor', type: 'text', aliases: ['contractor', 'main contractor'] },
  { path: 'personal.subcontractor', type: 'text', aliases: ['subcontractor', 'sub contractor', 'subcon', 'sub con', 'sub company'] },
  { path: 'personal.hired_date', type: 'date', aliases: ['hired date', 'hire date', 'date of hire', 'hiring date', 'date of hiring', 'joining date', 'date of joining'] },
  { path: 'personal.legal_permission', type: 'text', aliases: ['legal permission approval', 'legal permission', 'legal permission status', 'legal approval', 'legal'] },

  { path: 'certificates.wah_practical.expiry_date', type: 'date', aliases: ['wah expiry date practical', 'wah practical', 'wah practical expiry date', 'work at height practical', 'work at height practical expiry date', 'wah p', 'practical wah'] },
  { path: 'certificates.wah_theoretical.expiry_date', type: 'date', aliases: ['wah expiry date theoretical', 'wah theoretical', 'wah theoretical expiry date', 'work at height theoretical', 'work at height theoretical expiry date', 'wah t', 'theoretical wah'] },
  { path: 'certificates.ra.expiry_date', type: 'date', aliases: ['ra expiry date', 'ra', 'ra expiry', 'risk assessment', 'risk assessment expiry date'] },
  { path: 'certificates.fa.expiry_date', type: 'date', aliases: ['fa expiry date', 'fa', 'fa expiry', 'first aid', 'first aid expiry date'] },
  { path: 'certificates.ff.expiry_date', type: 'date', aliases: ['ff expiry date', 'ff', 'ff expiry', 'fire fighting', 'firefighting', 'fire fighting expiry date'] },
  { path: 'certificates.ec.expiry_date', type: 'date', aliases: ['ec expiry date', 'ec', 'ec expiry', 'emergency coordinator', 'emergency coordinator expiry date', 'emergency co ordinator'] },
  { path: 'certificates.mcu.expiry_date', type: 'date', aliases: ['mcu expiry date', 'mcu', 'mcu expiry', 'medical check up', 'medical checkup', 'medical check up expiry date', 'medical'] },
  { path: 'certificates.ppe_inspection.expiry_date', type: 'date', aliases: ['ppe inspection', 'ppe', 'ppe expiry date', 'ppe inspection expiry date', 'ppe inspection date'] },
  { path: 'certificates.lifting.expiry_date', type: 'date', aliases: ['lifting', 'lifting expiry date', 'lifting expiry', 'lifting equipment', 'lifting inspection'] },
  { path: 'certificates.scaffolding.expiry_date', type: 'date', aliases: ['scaffolding', 'scaffold', 'scaffolding expiry date', 'scaffolding expiry'] },

  { path: 'qualifications.nebosh_igc', type: 'bool', aliases: ['nebosh', 'nebosh igc', 'nebosh i g c'] },
  { path: 'qualifications.iso_45001', type: 'bool', aliases: ['iso', 'iso 45001', 'iso 45001 lead auditor'] },
  { path: 'qualifications.osha', type: 'bool', aliases: ['osha', 'osha 30', 'osha certificate'] },

  { path: 'drug_tests.rdt_1', type: 'date', aliases: ['rdt 1', 'rdt 1 date', 'rdt 1 expiry date', 'first rdt'] },
  { path: 'drug_tests.rdt_2', type: 'date', aliases: ['rdt 2', 'rdt 2 date', 'rdt 2 expiry date', 'second rdt'] },
  { path: 'drug_tests.rdt', type: 'date', aliases: ['rdt', 'rdt date', 'rdt expiry date'] },
];

// alias -> column, built once. A duplicate alias across two columns would be a
// bug in the table above; first definition wins.
const ALIAS_MAP = (() => {
  const map = new Map();
  for (const col of COLUMNS) {
    for (const a of col.aliases) if (!map.has(a)) map.set(a, col);
  }
  return map;
})();

// Sheet name -> team. Matched on normHeader() too, so 'Field  Team' works.
const SHEET_ALIASES = {
  field: ['field team', 'field', 'field team data', 'field employees'],
  safety: ['safety team', 'safety', 'safety team data', 'safety employees'],
};

// ── cell value parsing ──────────────────────────────────────────────────────

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
  january: 1, february: 2, march: 3, april: 4, june: 6, july: 7,
  august: 8, september: 9, october: 10, november: 11, december: 12,
};

const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;

// Rejects impossible dates (month 13, 31 February) so a misread never becomes a
// real-looking expiry.
function isValidYMD(y, m, d) {
  if (!(y >= 1900 && y <= 2200)) return false;
  if (!(m >= 1 && m <= 12)) return false;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d >= 1 && d <= daysInMonth;
}

// Two-digit years: 70-99 are 1900s, 00-69 are 2000s.
function fixYear(y) {
  if (y >= 1000) return y;
  return y < 70 ? 2000 + y : 1900 + y;
}

// Excel serial day -> 'YYYY-MM-DD'. 25569 is the serial of 1970-01-01, and the
// offset absorbs Excel's fictional 1900-02-29 for every date after 1900-03-01
// (every date this app will ever see). Read back in UTC so no timezone can
// shift the day.
function fromSerial(n) {
  const days = Math.floor(n);
  if (!(days >= 1 && days < 300000)) return '';
  const d = new Date((days - 25569) * 86400000);
  if (isNaN(d.getTime())) return '';
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

// Text date -> 'YYYY-MM-DD', or '' if it is not a date this app understands.
//
// Purely numeric forms are read DAY-FIRST ('05/03/2026' is 5 March), per the
// spec and the workbook's origin. There is no way to tell 05/03 from 03/05 in
// the data, so the convention is fixed rather than guessed per row.
function parseDateString(raw) {
  const s = String(raw).trim();
  if (!s) return '';
  let m;

  // ISO: 2026-03-04, or the leading date of an ISO timestamp.
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]|$)/.exec(s);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2], +m[3]];
    return isValidYMD(y, mo, d) ? ymd(y, mo, d) : '';
  }

  // Numeric, day-first: 04/03/2026, 04-03-26, 04.03.2026
  m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (m) {
    const [d, mo, y] = [+m[1], +m[2], fixYear(+m[3])];
    return isValidYMD(y, mo, d) ? ymd(y, mo, d) : '';
  }

  // Month-name, day-first: 04-Mar-2026, 4 March 2026
  m = /^(\d{1,2})[\s\-/]+([a-z]{3,9})\.?[\s\-/]+(\d{2,4})$/i.exec(s);
  if (m) {
    const mo = MONTHS[m[2].toLowerCase()];
    const [d, y] = [+m[1], fixYear(+m[3])];
    return mo && isValidYMD(y, mo, d) ? ymd(y, mo, d) : '';
  }

  // Month-name first: Mar 4, 2026
  m = /^([a-z]{3,9})\.?[\s\-/]+(\d{1,2}),?[\s\-/]+(\d{2,4})$/i.exec(s);
  if (m) {
    const mo = MONTHS[m[1].toLowerCase()];
    const [d, y] = [+m[2], fixYear(+m[3])];
    return mo && isValidYMD(y, mo, d) ? ymd(y, mo, d) : '';
  }

  return '';
}

// Any date-ish cell -> 'YYYY-MM-DD'. Returns { value, bad }: `bad` is true only
// when the cell held something that could not be read, so the caller can warn
// about a real misread without warning about an ordinary empty cell.
function parseDateCell(v) {
  if (v == null || v === '') return { value: '', bad: false };
  if (v instanceof Date) {
    return isNaN(v.getTime())
      ? { value: '', bad: true }
      : { value: ymd(v.getFullYear(), v.getMonth() + 1, v.getDate()), bad: false };
  }
  if (typeof v === 'number') {
    const value = fromSerial(v);
    return { value, bad: !value };
  }
  const s = String(v).trim();
  if (!s || s === '-' || s === '—') return { value: '', bad: false };
  const value = parseDateString(s);
  return { value, bad: !value };
}

const BOOL_NEGATIVE = ['', 'no', 'n', '0', 'false', 'none', 'na', 'n a', '-', '—'];
const BOOL_POSITIVE = ['yes', 'y', '1', 'true', 'x', '✓', 'v', 'have', 'holder', 'done'];

// Qualification cells. Explicit negatives are false; explicit positives are
// true; anything else non-empty (a date, a certificate number) is read as true,
// because in this workbook the column is filled in only when the person holds it.
function parseBoolCell(v) {
  if (typeof v === 'boolean') return v;
  const s = String(v == null ? '' : v).trim().toLowerCase().replace(/[^a-z0-9✓]+/g, ' ').trim();
  if (BOOL_NEGATIVE.includes(s)) return false;
  if (BOOL_POSITIVE.includes(s)) return true;
  return true;
}

// Text cells: trimmed, inner whitespace squeezed. Numbers (a National ID stored
// as a number) stringify without exponent notation well past 14 digits.
function parseTextCell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  return String(v).replace(/\s+/g, ' ').trim();
}

// ── object path helpers ─────────────────────────────────────────────────────

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = obj;
  for (const k of keys) {
    if (node[k] == null || typeof node[k] !== 'object') node[k] = {};
    node = node[k];
  }
  node[last] = value;
}

// A complete, schema-shaped employee with every field present and empty — the
// base a parsed row is merged onto, so an imported record has the same shape as
// a hand-entered one (CLAUDE.md: every cert key exists on every employee).
function makeEmptyEmployee(team) {
  const certificates = {};
  for (const k of ALL_CERT_KEYS) certificates[k] = { expiry_date: '', file_link: '' };
  return {
    national_id: '',
    name: '',
    team,
    personal: {
      title: '', contractor: '', subcontractor: '', hired_date: '',
      employment_status: '', legal_permission: '',
      archived: false, archived_at: '', archived_by: '',
    },
    certificates,
    qualifications: { nebosh_igc: false, iso_45001: false, osha: false },
    drug_tests: { rdt_1: '', rdt_2: '', rdt: '' },
    renewal_history: [],
  };
}

// ── parse ───────────────────────────────────────────────────────────────────

// Finds the row that looks like the header: the one mapping the most known
// columns, requiring a name/National ID plus two others. Scanning instead of
// assuming row 1 survives the title/logo rows these files often carry above
// the table.
function findHeaderRow(grid) {
  let best = { index: -1, score: 0, map: null };
  const limit = Math.min(grid.length, 10);

  for (let i = 0; i < limit; i++) {
    const map = new Map();
    for (let c = 0; c < grid[i].length; c++) {
      const col = ALIAS_MAP.get(normHeader(grid[i][c]));
      // First column wins if a header repeats across the sheet.
      if (col && !map.has(col.path)) map.set(col.path, c);
    }
    const identifies = map.has('name') || map.has('national_id');
    if (identifies && map.size >= 3 && map.size > best.score) {
      best = { index: i, score: map.size, map };
    }
  }
  return best.index === -1 ? null : best;
}

// Reads one sheet into partial employees. `warn` collects display-ready
// warnings; `sheetLabel` is the workbook's own sheet name, shown in them.
function parseSheet(sheet, team, sheetLabel, warn) {
  const grid = window.XLSX.utils.sheet_to_json(sheet, {
    header: 1, raw: true, blankrows: false, defval: '',
  });

  const header = findHeaderRow(grid);
  if (!header) {
    warn(t('warn_no_header', { sheet: sheetLabel }));
    return [];
  }

  // Surface anything in the header row we could not place, so an unrecognised
  // spelling shows up as a visible gap rather than a silently missing column.
  const unmapped = grid[header.index]
    .map((h) => parseTextCell(h))
    .filter((h) => h && !ALIAS_MAP.has(normHeader(h)));
  if (unmapped.length) {
    warn(t('warn_unmapped_cols', { sheet: sheetLabel, cols: unmapped.join(', ') }));
  }

  // Only the columns this sheet actually has.
  const columnsHere = COLUMNS.filter((c) => header.map.has(c.path));
  const rows = [];

  for (let r = header.index + 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells || cells.every((c) => c === '' || c == null)) continue;

    const employee = makeEmptyEmployee(team);
    const present = [];
    const excelRow = r + 1; // 1-based, as shown in Excel's own row gutter

    for (const col of columnsHere) {
      const raw = cells[header.map.get(col.path)];
      if (col.type === 'date') {
        const { value, bad } = parseDateCell(raw);
        if (bad) {
          warn(t('warn_bad_date', {
            row: excelRow, sheet: sheetLabel, value: parseTextCell(raw),
          }));
        }
        setPath(employee, col.path, value);
      } else if (col.type === 'bool') {
        setPath(employee, col.path, parseBoolCell(raw));
      } else {
        setPath(employee, col.path, parseTextCell(raw));
      }
      present.push(col.path);
    }

    // Identity is the one thing we cannot invent — no name or no National ID
    // means the row is not an employee record.
    if (!employee.national_id || !employee.name) {
      warn(t('warn_row_skipped', { row: excelRow, sheet: sheetLabel }));
      continue;
    }

    rows.push({ employee, present, excel_row: excelRow });
  }

  return rows;
}

// Reads the workbook bytes. Returns { field, safety, warnings } where field and
// safety are arrays of { employee, present, excel_row }.
export function parseExcelWorkbook(arrayBuffer) {
  const warnings = [];
  const warn = (text) => warnings.push(text);

  let wb;
  try {
    wb = window.XLSX.read(arrayBuffer, { type: 'array' });
  } catch (e) {
    return { field: [], safety: [], warnings: [t('import_parse_error')] };
  }

  const out = { field: [], safety: [], warnings };

  for (const team of ['field', 'safety']) {
    const name = wb.SheetNames.find((n) => SHEET_ALIASES[team].includes(normHeader(n)));
    if (!name) {
      warn(t('warn_sheet_missing', { sheet: t(team === 'field' ? 'nav_field' : 'nav_safety') }));
      continue;
    }
    out[team] = parseSheet(wb.Sheets[name], team, name, warn);
  }

  return out;
}

// ── preview ─────────────────────────────────────────────────────────────────

// Case/space-insensitive membership test for the admin's dropdown lists, so
// 'landmark' does not read as a new subcontractor next to 'Landmark'.
function inList(list, value) {
  if (!value) return true; // an empty cell is not an unknown value
  const needle = String(value).trim().toLowerCase();
  return (list || []).some((x) => String(x).trim().toLowerCase() === needle);
}

// Classifies every parsed row against the current data and picks its default
// action. Pure: it reads existingEmployees/fieldOptions and mutates nothing.
//
// A row can have several problems at once; `status` carries the one that drives
// the default action (duplicate first — it is the only one that risks writing
// over a real record), while `reasons` lists all of them for the admin to read.
export function buildImportPreview(parsed, existingEmployees, fieldOptions) {
  const byNatId = new Map();
  for (const e of existingEmployees || []) {
    if (e.national_id) byNatId.set(String(e.national_id).trim(), e);
  }

  const rows = [];

  for (const team of ['field', 'safety']) {
    for (const item of parsed[team] || []) {
      const emp = item.employee;
      const p = emp.personal || {};
      const reasons = [];

      const existing = byNatId.get(String(emp.national_id).trim());
      const titleList = fieldOptions ? fieldOptions[team + '_titles'] : [];
      const subList = fieldOptions ? fieldOptions.subcontractors : [];

      const unknownSub = !inList(subList, p.subcontractor);
      const unknownTitle = !inList(titleList, p.title);

      if (existing) {
        reasons.push(t('reason_duplicate', { natid: emp.national_id, name: existing.name }));
      }
      if (unknownSub) reasons.push(t('reason_unknown_sub', { value: p.subcontractor }));
      if (unknownTitle) reasons.push(t('reason_unknown_title', { value: p.title }));

      let status = 'new';
      if (existing) status = 'duplicate';
      else if (unknownSub) status = 'unknown_sub';
      else if (unknownTitle) status = 'unknown_title';

      rows.push({
        team,
        employee_partial: emp,
        present_paths: item.present,
        excel_row: item.excel_row,
        status,
        // Duplicates default to Skip — never silently overwrite a real record.
        // Everything else defaults to Import, adding unknown values to the lists.
        action: existing ? 'skip' : 'import',
        add_sub: unknownSub,
        add_title: unknownTitle,
        unknown_sub_value: unknownSub ? p.subcontractor : '',
        unknown_title_value: unknownTitle ? p.title : '',
        reasons,
      });
    }
  }

  return { rows, summary: summarizePreview(rows) };
}

// Counts for the preview header. `skipped` follows the live actions (so it
// tracks what the admin changed); the other three describe what was found.
export function summarizePreview(rows) {
  return {
    new: rows.filter((r) => r.status === 'new').length,
    duplicates: rows.filter((r) => r.status === 'duplicate').length,
    unknowns: rows.filter((r) => r.status === 'unknown_sub' || r.status === 'unknown_title').length,
    skipped: rows.filter((r) => r.action === 'skip').length,
  };
}

// ── commit ──────────────────────────────────────────────────────────────────

// Builds the update payload for an overwrite. Only paths whose column existed in
// the sheet are considered, and a blank cell never erases stored data — a
// spreadsheet gap means "no information here", not "delete this". Fields the
// import has no business touching are preserved by construction: file_link, the
// archive flags, renewal_history, meta, employee_id, and team are never in the
// payload.
function buildOverwriteUpdates(existing, row) {
  const updates = {};

  for (const path of row.present_paths) {
    const v = getPath(row.employee_partial, path);
    if (v === '' || v == null) continue;
    setPath(updates, path, v);
  }

  // Deep-merge each touched sub-object over the stored one, so untouched
  // siblings survive.
  if (updates.personal) updates.personal = { ...existing.personal, ...updates.personal };
  if (updates.qualifications) updates.qualifications = { ...existing.qualifications, ...updates.qualifications };
  if (updates.drug_tests) updates.drug_tests = { ...existing.drug_tests, ...updates.drug_tests };
  if (updates.certificates) {
    const merged = { ...existing.certificates };
    for (const key of Object.keys(updates.certificates)) {
      merged[key] = { ...(existing.certificates || {})[key], ...updates.certificates[key] };
    }
    updates.certificates = merged;
  }

  return updates;
}

// Applies the approved rows. Unknown list values are added first, so the
// employees that reference them are valid the moment they land.
//
// Returns { added, updated, list_added: { title: [], sub: [] } }.
export function commitImport(preview, user) {
  const rows = preview.rows.filter((r) => r.action === 'import' || r.action === 'overwrite');
  const list_added = { title: [], sub: [] };

  // 1. Extend the dropdown lists with the values the admin ticked.
  const nextOptions = { ...(DATA.meta.field_options || {}) };
  const addTo = (listKey, value, bucket) => {
    if (!value) return;
    const list = nextOptions[listKey] || [];
    if (inList(list, value)) return;
    nextOptions[listKey] = [...list, value];
    if (!bucket.includes(value)) bucket.push(value);
  };

  for (const row of rows) {
    if (row.add_sub) addTo('subcontractors', row.unknown_sub_value, list_added.sub);
    if (row.add_title) addTo(row.team + '_titles', row.unknown_title_value, list_added.title);
  }
  if (list_added.sub.length || list_added.title.length) {
    updateMeta({ field_options: nextOptions });
  }

  // 2. Write the employees.
  let added = 0;
  let updated = 0;

  for (const row of rows) {
    if (row.action === 'overwrite') {
      const existing = DATA.employees.find(
        (e) => String(e.national_id).trim() === String(row.employee_partial.national_id).trim()
      );
      // The row was classified against this same list, so a miss here means the
      // record went away mid-review; importing it as new would be a surprise.
      if (!existing) continue;
      const updates = buildOverwriteUpdates(existing, row);
      // updateEmployee only records a renewal when an expiry actually changed,
      // so handing it every cert key logs exactly the real renewals.
      updateEmployee(existing.employee_id, updates, user, ALL_CERT_KEYS);
      updated++;
    } else {
      addEmployee(row.employee_partial, user);
      added++;
    }
  }

  return { added, updated, list_added };
}
