/**
 * Generate a CSV file from attendance report data and trigger browser download.
 * @param {Object} data - Report data from GET /time/report
 * @param {string} data.period - 'weekly' or 'monthly'
 * @param {string} data.start_date - ISO date string
 * @param {string} data.end_date - ISO date string
 * @param {Object} data.summary - Summary statistics
 * @param {Array}  data.employees - Employee attendance records
 * @param {string} [employeeName] - If provided, generates individual detailed report
 */
export function generateAttendanceCSV(data, employeeName) {
  const { period, start_date, end_date, summary, employees } = data;
  const rows = [];

  const periodLabel = period === 'monthly' ? 'Monthly' : 'Weekly';
  const title = employeeName
    ? `${periodLabel} Attendance — ${employeeName}`
    : `${periodLabel} Attendance Report`;

  // Title
  rows.push([title]);
  rows.push([`Period: ${start_date} to ${end_date}`]);
  rows.push([`Generated: ${new Date().toLocaleDateString('en-ZA')}`]);
  rows.push([]);

  if (!employeeName) {
    // ─── Overall report: per-employee summary ───
    rows.push([
      'Summary',
      `Total Employees: ${summary.total_employees}`,
      `Present Days: ${summary.total_present_days}`,
      `Late Days: ${summary.total_late_days}`,
      `Absent Days: ${summary.total_absent_days}`,
      `Total Work Hours: ${summary.total_work_hours}`,
    ]);
    rows.push([]);

    // Header
    rows.push([
      'Employee Name',
      'Branch',
      'Days Present',
      'Days Late',
      'Days Absent',
      'Total Work Hours',
      'Avg Hours/Day',
      'Tea 1 (min)',
      'Tea 2 (min)',
      'Lunch (min)',
    ]);

    for (const emp of employees) {
      const workingDays = emp.days_present;
      const avgHours = workingDays > 0
        ? (emp.total_work_minutes / workingDays / 60).toFixed(1)
        : '0.0';
      rows.push([
        `${emp.first_name} ${emp.last_name}`,
        emp.franchise_name,
        emp.days_present,
        emp.days_late,
        emp.days_absent,
        (emp.total_work_minutes / 60).toFixed(1),
        avgHours,
        emp.total_tea_1,
        emp.total_tea_2,
        emp.total_lunch,
      ]);
    }
  } else {
    // ─── Individual report: per-day breakdown ───
    if (employees.length === 0) {
      rows.push(['No attendance records found for this period.']);
    } else {
      const emp = employees[0];

      rows.push([
        'Summary',
        `Present Days: ${emp.days_present}`,
        `Late Days: ${emp.days_late}`,
        `Absent Days: ${emp.days_absent}`,
        `Total Work Hours: ${(emp.total_work_minutes / 60).toFixed(1)}`,
      ]);
      rows.push([]);

      rows.push([
        'Date',
        'Status',
        'Clock In',
        'Clock Out',
        'Work Minutes',
        'Work Hours',
        'Tea 1 (min)',
        'Tea 2 (min)',
        'Lunch (min)',
        'Location',
      ]);

      for (const day of emp.daily) {
        const fmtClockIn = day.clock_in
          ? new Date(day.clock_in).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
          : '—';
        const fmtClockOut = day.clock_out
          ? new Date(day.clock_out).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
          : '—';
        rows.push([
          day.date,
          day.status,
          fmtClockIn,
          fmtClockOut,
          day.work_minutes,
          (day.work_minutes / 60).toFixed(2),
          day.tea_1_minutes,
          day.tea_2_minutes,
          day.lunch_minutes,
          day.location_name || (day.latitude ? `${day.latitude.toFixed(4)}, ${day.longitude.toFixed(4)}` : '—'),
        ]);
      }
    }
  }

  // Build CSV string
  const csvContent = rows
    .map(row =>
      row
        .map(cell => {
          const val = String(cell ?? '');
          // Escape fields containing commas, quotes, or newlines
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    )
    .join('\n');

  // Trigger download
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' }); // BOM for Excel
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;

  const scope = employeeName
    ? employeeName.replace(/\s+/g, '_')
    : 'Overall';
  const safePeriod = period || 'weekly';
  link.download = `Attendance_${safePeriod}_${scope}_${start_date}_to_${end_date}.csv`;

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}