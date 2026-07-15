// exportHelpers.js — Excel/CSV/PDF export. Uses the CDN globals (window.XLSX,
// window.jspdf) loaded by index.html. Never imports an npm package.

import { ALL_CERT_KEYS, CERT_LABEL_KEYS, applicableCerts } from '../constants/fields.js';
import { t } from '../i18n/i18n.js';
import { fmtDate, todayISO } from './format.js';

// Export size caps from CLAUDE.md "Export Limits". Shared so every page that
// offers a download blocks at the same number — never truncate silently.
export const SPREADSHEET_ROW_CAP = 5000;
export const PDF_EMPLOYEE_CAP = 100;

// Normalises any date-ish value to a 'YYYY-MM-DD' string (or '' if empty).
// String-slicing avoids timezone drift on full ISO timestamps.
function isoDay(s) {
  return s ? String(s).slice(0, 10) : '';
}

// Triggers a client-side file download from an in-memory string.
function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// One flat object per employee — every field a top-level key, dates as ISO
// 'YYYY-MM-DD'. Certificate expiries are prefixed cert_<key>_expiry. Every cert
// key is always present so columns stay uniform across field and safety rows.
export function flattenEmployeeForExcel(employee) {
  const p = employee.personal || {};
  const q = employee.qualifications || {};
  const dt = employee.drug_tests || {};
  const m = employee.meta || {};

  const row = {
    employee_id: employee.employee_id || '',
    national_id: employee.national_id || '',
    name: employee.name || '',
    team: employee.team || '',
    title: p.title || '',
    contractor: p.contractor || '',
    subcontractor: p.subcontractor || '',
    hired_date: isoDay(p.hired_date),
    employment_status: p.employment_status || '',
    legal_permission: p.legal_permission || '',
    archived: p.archived ? 'Yes' : 'No',
  };

  ALL_CERT_KEYS.forEach((k) => {
    row['cert_' + k + '_expiry'] = isoDay(employee.certificates?.[k]?.expiry_date);
  });

  row.qual_nebosh_igc = q.nebosh_igc ? 'Yes' : 'No';
  row.qual_iso_45001 = q.iso_45001 ? 'Yes' : 'No';
  row.qual_osha = q.osha ? 'Yes' : 'No';
  row.rdt_1 = isoDay(dt.rdt_1);
  row.rdt_2 = isoDay(dt.rdt_2);
  row.rdt = isoDay(dt.rdt);
  row.created_at = isoDay(m.created_at);
  row.updated_at = isoDay(m.updated_at);
  row.updated_by = m.updated_by || '';

  return row;
}

// Downloads an .xlsx of the given employees (flat, one row each).
export function exportToExcel(employees, lang) {
  const rows = employees.map(flattenEmployeeForExcel);
  const ws = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Employees');
  window.XLSX.writeFile(wb, `OHS-Export-${todayISO()}.xlsx`);
}

// One flat object per *renewal* — i.e. per (employee × certificate) pair, not
// per employee. Used by the renewals page, whose whole subject is the individual
// expiring certificate rather than the person.
//
// `row` is a renewals row: { employee, cert_key, expiry, days_left, state }.
export function flattenRenewalForExcel(row) {
  const p = row.employee.personal || {};
  return {
    employee_id: row.employee.employee_id || '',
    national_id: row.employee.national_id || '',
    name: row.employee.name || '',
    team: row.employee.team || '',
    title: p.title || '',
    subcontractor: p.subcontractor || '',
    certificate: t(CERT_LABEL_KEYS[row.cert_key]),
    cert_key: row.cert_key,
    expiry_date: isoDay(row.expiry),
    days_left: row.days_left,
    state: row.state,
  };
}

// Downloads an .xlsx of the given renewals rows (one row per renewal).
export function exportRenewalsToExcel(renewalRows) {
  const rows = renewalRows.map(flattenRenewalForExcel);
  const ws = window.XLSX.utils.json_to_sheet(rows);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'Renewals');
  window.XLSX.writeFile(wb, `OHS-Renewals-${todayISO()}.xlsx`);
}

// Downloads a .csv with the same columns as the Excel export.
export function exportToCSV(employees) {
  const rows = employees.map(flattenEmployeeForExcel);
  const ws = window.XLSX.utils.json_to_sheet(rows);
  const csv = window.XLSX.utils.sheet_to_csv(ws);
  downloadBlob(csv, `OHS-Export-${todayISO()}.csv`, 'text/csv;charset=utf-8;');
}

// Downloads a PDF with one page per employee: header + a section table each for
// Personal, Certificates, Qualifications (safety only), and Drug tests.
export function exportToPDF(employees, lang) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const headStyles = { fillColor: [15, 25, 66], textColor: 255, fontStyle: 'bold' };

  employees.forEach((emp, i) => {
    if (i > 0) doc.addPage();
    const p = emp.personal || {};

    // Header
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text(String(emp.name || ''), 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    const teamLabel = emp.team === 'safety' ? t('nav_safety') : t('nav_field');
    doc.text(`${emp.employee_id || ''}  ·  ${teamLabel}  ·  ${p.employment_status || ''}`, 14, 25);
    doc.setTextColor(0);

    // Personal
    doc.autoTable({
      startY: 32,
      theme: 'grid',
      headStyles,
      head: [[t('section_personal'), '']],
      body: [
        [t('field_natid'), emp.national_id || ''],
        [t('field_title'), p.title || ''],
        [t('field_contractor'), p.contractor || ''],
        [t('field_sub'), p.subcontractor || ''],
        [t('field_hired'), fmtDate(p.hired_date)],
        [t('field_emp_status'), p.employment_status || ''],
        [t('field_legal'), p.legal_permission || ''],
      ],
    });

    // Certificates
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 4,
      theme: 'grid',
      headStyles,
      head: [[t('section_certs'), t('expiry_date')]],
      body: applicableCerts(emp).map((k) => [t(CERT_LABEL_KEYS[k]), fmtDate(emp.certificates?.[k]?.expiry_date)]),
    });

    // Qualifications (safety only)
    if (emp.team === 'safety') {
      const q = emp.qualifications || {};
      doc.autoTable({
        startY: doc.lastAutoTable.finalY + 4,
        theme: 'grid',
        headStyles,
        head: [[t('section_quals'), '']],
        body: [
          [t('qual_nebosh'), q.nebosh_igc ? '✓' : '—'],
          [t('qual_iso'), q.iso_45001 ? '✓' : '—'],
          [t('qual_osha'), q.osha ? '✓' : '—'],
        ],
      });
    }

    // Drug tests
    const d = emp.drug_tests || {};
    const drugBody = emp.team === 'safety'
      ? [[t('dt_rdt'), fmtDate(d.rdt)]]
      : [[t('dt_rdt1'), fmtDate(d.rdt_1)], [t('dt_rdt2'), fmtDate(d.rdt_2)]];
    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 4,
      theme: 'grid',
      headStyles,
      head: [[t('section_drug'), '']],
      body: drugBody,
    });
  });

  doc.save(`OHS-EmployeeCards-${todayISO()}.pdf`);
}
