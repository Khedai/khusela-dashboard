// ─── South African Standard Time (SAST) Utilities ──────────────────
// SAST = UTC+2, no daylight saving — stable year-round.
// Pretoria / Harare / Johannesburg

const SA_OFFSET_HOURS = 2;
const SA_OFFSET_MS = SA_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Return the current date string in SAST: "YYYY-MM-DD"
 */
function saToday() {
  const now = new Date();
  const sa = new Date(now.getTime() + SA_OFFSET_MS);
  return sa.toISOString().split('T')[0];
}

/**
 * Return an object with the current SAST hour & minute
 */
function saNowHM() {
  const now = new Date();
  const sa = new Date(now.getTime() + SA_OFFSET_MS);
  return {
    hour: sa.getUTCHours(),
    minute: sa.getUTCMinutes(),
  };
}

/**
 * Check whether SAST time is at or past a given HH:MM boundary.
 * e.g. saIsPast(8, 30) → true if it's 08:30 or later in SAST.
 */
function saIsPast(hour, minute) {
  const { hour: h, minute: m } = saNowHM();
  return h > hour || (h === hour && m >= minute);
}

/**
 * Build a full ISO string for a given SAST time today.
 * e.g. saTimestampToday(17, 10) → "2026-07-09T17:10:00.000+02:00"
 */
function saTimestampToday(hour, minute, second = 0) {
  const today = saToday();
  // Construct as UTC-2 so it represents SAST correctly
  const iso = `${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.000+02:00`;
  return new Date(iso);
}

/**
 * Format a Date (or ISO string) for display in SAST HH:MM.
 */
function saFormatTime(dateOrIso) {
  if (!dateOrIso) return '—';
  const d = new Date(dateOrIso);
  if (isNaN(d.getTime())) return '—';
  // Shift to SAST
  const sa = new Date(d.getTime() + SA_OFFSET_MS);
  const h = String(sa.getUTCHours()).padStart(2, '0');
  const m = String(sa.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

module.exports = {
  SA_OFFSET_HOURS,
  SA_OFFSET_MS,
  saToday,
  saNowHM,
  saIsPast,
  saTimestampToday,
  saFormatTime,
};