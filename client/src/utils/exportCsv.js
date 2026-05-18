/**
 * Download an array of objects as a CSV file.
 * @param {string}   filename  – e.g. "applications-2026-05.csv"
 * @param {object[]} rows      – data rows
 * @param {string[]} [cols]    – optional ordered column keys (defaults to all keys in first row)
 * @param {object}   [headers] – optional { key: 'Label' } map for header row
 */
export function downloadCsv(filename, rows, cols, headers) {
  if (!rows?.length) return;
  const keys = cols || Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n\r]/.test(s) ? `"${s}"` : s;
  };
  const headerRow = keys.map(k => escape((headers && headers[k]) || k)).join(',');
  const body = rows.map(r => keys.map(k => escape(r[k])).join(',')).join('\n');
  const blob = new Blob([`${headerRow}\n${body}`], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
