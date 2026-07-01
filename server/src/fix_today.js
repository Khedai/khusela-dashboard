/**
 * Fix: clear any premature clock-outs on today's date caused by server restart cleanup bug.
 * Run: node src/fix_today.js
 */
const pool = require('./config/db');

async function fix() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[fix] Today: ${today}. Finding prematurely closed shifts...`);

    const result = await pool.query(
      `UPDATE attendance SET clock_out = NULL, total_work_minutes = NULL, notes = 'Clock-out cleared (bug fix)' WHERE date = $1 AND clock_out IS NOT NULL AND clock_in IS NOT NULL RETURNING *`,
      [today]
    );

    if (result.rows.length === 0) {
      console.log('[fix] No prematurely closed shifts found for today.');
    } else {
      for (const row of result.rows) {
        const empRes = await pool.query('SELECT first_name, last_name FROM employees WHERE id = $1', [row.employee_id]);
        const name = empRes.rows[0] ? `${empRes.rows[0].first_name} ${empRes.rows[0].last_name}` : `ID ${row.employee_id}`;
        console.log(`  ✓ Cleared clock-out for ${name} — clocked in at ${row.clock_in}, status now 'present'`);
      }
      console.log(`[fix] Restored ${result.rows.length} shift(s).`);
    }

    // Also remove the clock_out time_logs for today
    const logRes = await pool.query(
      `DELETE FROM time_logs WHERE date = $1 AND type = 'clock_out'`,
      [today]
    );
    if (logRes.rowCount > 0) {
      console.log(`  ✓ Removed ${logRes.rowCount} clock_out time_logs for today.`);
    }

    console.log('[fix] Done.');
  } catch (err) {
    console.error('[fix] Error:', err.message);
  } finally {
    process.exit(0);
  }
}

fix();