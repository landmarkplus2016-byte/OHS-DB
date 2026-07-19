// dashboardPage.js — the admin landing page. One job: summarise the currently
// loaded data set (KPIs, charts, recent activity) and wire its two interactions.
//
// Every number on this page is derived at render time from expiry dates and the
// configured thresholds — nothing here is read from a stored status field
// (CLAUDE.md rule 9). Charts are inline SVG / plain divs; no chart library.

import { DATA, CURRENT_USER } from '../state.js';
import { t } from '../i18n/i18n.js';
import { go } from '../router.js';
import { render } from '../render.js';
import { CERT_LABEL_KEYS, applicableCerts } from '../constants/fields.js';
import { deriveEmployeeCompliance } from '../utils/compliance.js';
import { fmtDate, escapeHtml, initials, daysUntil } from '../utils/format.js';
import { exportJSON } from '../data/dataActions.js';
import { showToast } from '../components/toast.js';

// Donut/legend states, in the order they read best top-to-bottom.
const STATE_ORDER = ['valid', 'plan', 'soon', 'urgent', 'expired', 'missing'];

// How many days of history the KPI sparklines show, today last.
const SPARK_DAYS = 7;

const RECENT_LIMIT = 6;

// ── derivation helpers ─────────────────────────────────────────────────────

// Days-to-expiry for every certificate applicable to the given employees, with
// empty (missing) expiry dates dropped. This one list backs both sparklines.
function applicableDaysList(employees) {
  const out = [];
  employees.forEach((e) => {
    applicableCerts(e).forEach((k) => {
      const cert = e.certificates?.[k];
      if (cert?.na) return; // not needed for this employee — off the compliance clock
      const d = daysUntil(cert?.expiry_date);
      if (d != null) out.push(d);
    });
  });
  return out;
}

// A certificate's remaining days on the day `k` days ago is its remaining days
// today plus k — that shift is all a historical count needs, so the sparklines
// are real history, not a placeholder curve.
function sparkSeries(daysList, countOn) {
  const series = [];
  for (let k = SPARK_DAYS - 1; k >= 0; k--) {
    series.push(daysList.reduce((n, d) => n + (countOn(d + k) ? 1 : 0), 0));
  }
  return series;
}

// ── small renderers ────────────────────────────────────────────────────────

// Bars are scaled against the series peak, with a floor so a zero day still
// draws a baseline tick instead of vanishing.
function sparkHtml(series) {
  const max = Math.max(1, ...series);
  const bars = series
    .map((v) => `<span style="height:max(2px, ${(v / max) * 100}%)"></span>`)
    .join('');
  return `<div class="spark">${bars}</div>`;
}

// One labelled horizontal bar. `accent` picks the fill colour class.
function barHtml(label, value, max, accent) {
  return `
    <div class="bar-item">
      <div class="bar-head"><span>${label}</span><span><b>${value}</b></span></div>
      <div class="bar-track"><div class="bar-fill ${accent}" style="width:${(value / max) * 100}%"></div></div>
    </div>`;
}

// Sorted-desc horizontal bar chart from a { label: count } map.
function barChartHtml(counts, accent) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="chart-empty">${t('chart_empty')}</div>`;
  const max = Math.max(...entries.map(([, v]) => v));
  return entries.map(([label, v]) => barHtml(label, v, max, accent)).join('');
}

// Donut of employees by worst compliance state. Segment colours come from CSS
// classes (fill: var(--state-*)) so no hex is hardcoded outside tokens.css.
function donutHtml(byState, total) {
  const present = STATE_ORDER.filter((s) => byState[s] > 0);

  let segs;
  if (!total) {
    segs = '<circle cx="60" cy="60" r="54" class="donut-seg s-empty"/>';
  } else if (present.length === 1) {
    // A single state fills the ring: an arc whose start and end coincide draws
    // nothing, so draw a plain circle instead.
    segs = `<circle cx="60" cy="60" r="54" class="donut-seg s-${present[0]}"/>`;
  } else {
    let acc = 0;
    segs = present.map((s) => {
      const frac = byState[s] / total;
      const start = acc * 2 * Math.PI - Math.PI / 2;
      const end = (acc + frac) * 2 * Math.PI - Math.PI / 2;
      acc += frac;
      const large = frac > 0.5 ? 1 : 0;
      const r = 54, cx = 60, cy = 60;
      const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
      const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
      return `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z" class="donut-seg s-${s}"/>`;
    }).join('');
  }

  const legend = present.map((s) => `
    <div><span class="legend-dot s-${s}"></span>${t('st_' + s)} <b>${byState[s]}</b></div>
  `).join('');

  return `
    <div class="donut-wrap">
      <svg width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="${t('chart_by_state')}">
        ${segs}
        <circle cx="60" cy="60" r="30" class="donut-hole"/>
        <text x="60" y="58" text-anchor="middle" class="donut-total">${total}</text>
        <text x="60" y="74" text-anchor="middle" class="donut-cap">${t('employees_label')}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

// The upload-to-Drive reminder. Only rendered once the last export is older than
// meta.backup_reminder_days (0 turns the reminder off), or if nothing has ever
// been exported in this session.
function backupBannerHtml() {
  const meta = DATA.meta || {};
  const reminderDays = Number(meta.backup_reminder_days) || 0;
  if (reminderDays <= 0) return '';

  const last = meta.last_backup_at;
  // daysUntil() counts forward, so a past date comes back negative.
  const daysSince = last ? -daysUntil(last) : null;
  if (last && !(daysSince > reminderDays)) return '';

  const sub = last
    ? t('backup_last_ago', { days: daysSince, date: fmtDate(last) })
    : t('backup_never');

  return `
    <div class="hero-banner">
      <div>
        <div class="h">${t('backup_due')}</div>
        <div class="s">${sub}</div>
      </div>
      <button class="btn" data-action="download-backup">${t('download_backup')}</button>
    </div>`;
}

// ── page ───────────────────────────────────────────────────────────────────

export function renderDashboardPage() {
  const thr = DATA.meta.warning_thresholds;
  // "Active" here means the working roster: not archived AND employment_status
  // Active. Anyone Suspended/Terminated/Resigned has left the working roster —
  // the same rule the site-check verdict uses (employment_status !== 'Active'
  // is a blocker), so the KPI, split, and charts all describe one coherent set.
  const active = DATA.employees.filter(
    (e) => !(e.personal && e.personal.archived) && (e.personal || {}).employment_status === 'Active'
  );
  const fieldCount = active.filter((e) => e.team === 'field').length;
  const safetyCount = active.filter((e) => e.team === 'safety').length;

  const comp = active.map((e) => deriveEmployeeCompliance(e, thr));
  const expired = comp.reduce((s, c) => s + c.expired_count, 0);
  const urgent30 = comp.filter((c) => c.worst === 'urgent' || c.worst === 'expired').length;
  const compliant = comp.filter((c) => c.worst === 'valid').length;

  // Sparkline history for the two time-sensitive KPIs.
  const daysList = applicableDaysList(active);
  const expiredSpark = sparkSeries(daysList, (d) => d < 0);
  const urgentSpark = sparkSeries(daysList, (d) => d >= 0 && d <= thr.urgent_days);

  // Expiries inside the planning window, by certificate type. Bar labels are
  // translated cert names, so they are display-ready already.
  const planWindow = thr.plan_days;
  const byCert = {};
  active.forEach((e) => applicableCerts(e).forEach((k) => {
    const cert = e.certificates?.[k];
    if (cert?.na) return; // not needed for this employee — excluded from the chart
    const d = daysUntil(cert?.expiry_date);
    if (d == null || d < 0 || d > planWindow) return;
    const label = t(CERT_LABEL_KEYS[k]);
    byCert[label] = (byCert[label] || 0) + 1;
  }));

  // Employees by worst state (donut) and by subcontractor (bars).
  const byState = { valid: 0, plan: 0, soon: 0, urgent: 0, expired: 0, missing: 0 };
  comp.forEach((c) => { byState[c.worst]++; });

  // Grouped on the raw value, escaped only once it becomes a bar label.
  const bySub = {};
  active.forEach((e) => {
    const s = (e.personal && e.personal.subcontractor) || t('select_none');
    bySub[s] = (bySub[s] || 0) + 1;
  });
  const bySubLabels = Object.fromEntries(
    Object.entries(bySub).map(([k, v]) => [escapeHtml(k), v])
  );

  // Recent activity spans every employee, archived included — archiving is
  // itself an edit worth seeing here.
  const recent = [...DATA.employees]
    .sort((a, b) => String(b.meta?.updated_at || '').localeCompare(String(a.meta?.updated_at || '')))
    .slice(0, RECENT_LIMIT);

  const recentHtml = recent.length
    ? recent.map((e) => `
        <div class="recent-row" data-emp="${e.employee_id}">
          <div class="avatar sm">${escapeHtml(initials(e.name))}</div>
          <div class="who"><b>${escapeHtml(e.name)}</b> <span class="id">${e.employee_id}</span></div>
          <div class="when">${fmtDate(e.meta && e.meta.updated_at)}</div>
        </div>`).join('')
    : `<div class="chart-empty">${t('chart_empty')}</div>`;

  return `
    ${backupBannerHtml()}

    <div class="kpi-row">
      <div class="kpi blue">
        <div class="n">${active.length}</div>
        <div class="l">${t('kpi_total_active')}</div>
        <div class="kpi-split">
          <span><b>${fieldCount}</b> ${t('nav_field')}</span>
          <span><b>${safetyCount}</b> ${t('nav_safety')}</span>
        </div>
      </div>
      <div class="kpi red">
        <div class="n">${expired}</div>
        <div class="l">${t('kpi_expired')}</div>
        ${sparkHtml(expiredSpark)}
      </div>
      <div class="kpi amber">
        <div class="n">${urgent30}</div>
        <div class="l">${t('kpi_urgent', { days: thr.urgent_days })}</div>
        ${sparkHtml(urgentSpark)}
      </div>
      <div class="kpi green">
        <div class="n">${compliant}</div>
        <div class="l">${t('kpi_compliant')}</div>
      </div>
    </div>

    <div class="chart-row">
      <div class="card">
        <h3>${t('chart_by_cert', { days: planWindow })}</h3>
        ${barChartHtml(byCert, 'primary')}
      </div>
      <div class="card">
        <h3>${t('chart_by_state')}</h3>
        ${donutHtml(byState, comp.length)}
      </div>
    </div>

    <div class="chart-row">
      <div class="card">
        <h3>${t('chart_by_sub')}</h3>
        ${barChartHtml(bySubLabels, 'teal')}
      </div>
      <div class="card">
        <h3>${t('recent_activity')}</h3>
        ${recentHtml}
      </div>
    </div>`;
}

// Topbar meta — the subtitle is today's date, matching the prototype.
export function dashboardTopbar() {
  return { title: t('nav_dashboard'), sub: fmtDate(new Date().toISOString().slice(0, 10)) };
}

export function bindDashboardPageEvents() {
  const app = document.getElementById('app');
  if (!app) return;

  // Banner backup button — same export the topbar runs; re-render so the fresh
  // last_backup_at stamp dismisses the banner.
  const backup = app.querySelector('[data-action="download-backup"]');
  if (backup) {
    backup.addEventListener('click', () => {
      exportJSON(CURRENT_USER);
      showToast(t('save_to_drive_note'), 'success');
      render();
    });
  }

  app.querySelectorAll('.recent-row[data-emp]').forEach((row) => {
    row.addEventListener('click', () => go('employee', row.dataset.emp));
  });
}
