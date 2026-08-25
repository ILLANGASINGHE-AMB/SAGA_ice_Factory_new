// Local-calendar date helpers.
//
// Every timestamp in the database is a `timestamptz` stored in UTC, and
// Supabase hands them back as UTC ISO strings. Both `d.toISOString().slice(0, 10)`
// and slicing the raw string therefore yield the *UTC* calendar day, which is
// the wrong day for anyone east of Greenwich for part of every day — in
// Sri Lanka (UTC+5:30) "today" flips over at 18:30 local, so a date filter
// defaulted that way silently shows tomorrow's (empty) range all evening, and
// an evening transaction lands in the wrong daily/monthly bucket.
//
// These helpers all work off the browser's local calendar instead, so filters,
// chart buckets and "today" defaults agree with the clock on the wall.

function pad(n) {
  return String(n).padStart(2, '0');
}

/** A Date/ISO string as local `YYYY-MM-DD`. Returns '' for missing/invalid input. */
export function toLocalDateStr(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A Date/ISO string as local `YYYY-MM`. */
export function toLocalMonthStr(value) {
  return toLocalDateStr(value).slice(0, 7);
}

/** A Date/ISO string as a local 4-digit year string. */
export function toLocalYearStr(value) {
  return toLocalDateStr(value).slice(0, 4);
}

/** Today as local `YYYY-MM-DD` — the correct default for a date input. */
export function todayStr() {
  return toLocalDateStr(new Date());
}

/** The current month as local `YYYY-MM`. */
export function thisMonthStr() {
  return toLocalMonthStr(new Date());
}

/** The current year as a string. */
export function thisYearStr() {
  return String(new Date().getFullYear());
}

/**
 * The calendar day before a local `YYYY-MM-DD` string, as `YYYY-MM-DD`.
 * Built from the local-time Date constructor (not `new Date(dateStr)`, which
 * parses as UTC midnight) so it can't drift a day off in either direction,
 * and correctly rolls back across month/year boundaries.
 */
export function previousLocalDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return toLocalDateStr(new Date(y, m - 1, d - 1));
}

/** Now as local `YYYY-MM-DDTHH:mm`, the format a `datetime-local` input wants. */
export function nowLocalDatetimeStr() {
  const d = new Date();
  return `${toLocalDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Inclusive local-calendar range test. `from`/`to` are `YYYY-MM-DD` strings
 * (either may be empty, meaning "unbounded on that side").
 */
export function isWithinLocalRange(value, from, to) {
  const d = toLocalDateStr(value);
  if (!d) return false;
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}
