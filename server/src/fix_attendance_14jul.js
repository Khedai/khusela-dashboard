const pool = require('./config/db');

async function fix() {
  console.log('=== Fixing attendance for 14 July 2026 ===\n');

  // Find the employees
  const names = [
    { search: 'yonela', label: 'Yonela' },
    { search: 'stacy', label: 'Stacy' },
    { search: 'rashaad', label: 'Rashaad' },
  ];

  const date = '2026-07-14';

  for (const n of names) {
    const emp = await pool.query(
      `SELECT id, first_name, last_name FROM employees
       WHERE terminated_at IS NULL
         AND (LOWER(first_name) LIKE $1 OR LOWER(last_name) LIKE $1)
       ORDER BY first_name`,
      [`%${n.search}%`]
    );

    if (emp.rows.length === 0) {
      console.log(`  [NOT FOUND] ${n.label} - no matching active employee`);
      continue;
    }

    // Pick the first match
    const e = emp.rows[0];

    // Check if attendance already exists for this date
    const existing = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [e.id, date]
    );

    if (existing.rows.length > 0) {
      console.log(`  [EXISTS] ${e.first_name} ${e.last_name} already has attendance on ${date}: status=${existing.rows[0].status}, clock_in=${existing.rows[0].clock_in}, clock_out=${existing.rows[0].clock_out}`);
      continue;
    }

    // Create an attendance record with reasonable times
    // We'll set clock_in at 08:30 SAST and clock_out at 17:00 SAST with total_work_minutes ~480 (8h) minus breaks
    const clockIn = new Date('2026-07-14T08:30:00+02:00');
    const clockOut = new Date('2026-07-14T17:00:00+02:00');
    const rawMinutes = (clockOut - clockIn) / 60000;
    const workMinutes = Math.round(rawMinutes - 45); // subtract ~45 min for breaks

    await pool.query(
      `INSERT INTO attendance (employee_id, date, status, clock_in, clock_out, total_work_minutes, tea_1_minutes, tea_2_minutes, lunch_minutes, notes)
       VALUES ($1, $2, 'present', $3, $4, $5, 15, 15, 30, 'Manual entry - clock-in issues on 14 July')`,
      [e.id, date, clockIn, clockOut, workMinutes]
    );

    console.log(`  [FIXED] ${e.first_name} ${e.last_name} (id=${e.id}): clock_in=08:30, clock_out=17:00, work=${workMinutes}min`);
  }

  console.log('\nDone.');
  process.exit(0);
}

fix().catch(e => { console.error(e.message); process.exit(1); });