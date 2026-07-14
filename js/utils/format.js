// format.js — small, dependency-light formatting/date helpers.

import { getLanguage } from '../i18n/i18n.js';

// Formats a date string as 'DD MMM YYYY' in the current language. '—' if empty/invalid.
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const locale = getLanguage() === 'ar' ? 'ar-EG' : 'en-GB';
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

// Escapes the five HTML-significant characters for safe innerHTML insertion.
export function escapeHtml(str) {
  return (str == null ? '' : String(str)).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

// Up to two uppercase initials from a name.
export function initials(name) {
  return (name || '')
    .split(' ')
    .slice(0, 2)
    .map((x) => x[0] || '')
    .join('')
    .toUpperCase();
}

// Whole days from today to the given date. Negative = past. null for empty.
// Both dates are compared at UTC midnight (date-only strings) so there is no
// time-of-day drift.
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  const today = new Date(todayISO()).getTime();
  if (isNaN(target)) return null;
  return Math.round((target - today) / 86400000);
}

// Today's local date as 'YYYY-MM-DD'.
export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
