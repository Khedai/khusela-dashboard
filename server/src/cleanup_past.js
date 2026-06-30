/**
 * One-time cleanup: close all open shifts on past dates.
 * Run: node src/cleanup_past.js
 */
const pool = require('./config/db');

async function cleanup() {
  try {
    const today = new Date().toISOString().split('T')[0];
    console.log(`[cleanup] Today: ${today}. Finding open past shifts...`);

    // Find all open shifts (any date before today with clock_in but no clock_out)
    const stragglers = await pool.query(
      `SELECT * FROM attendance WHERE clock_in IS NOT NULL AND clock_out IS NULL AND date <= $1 ORDER BY date, employee_id`,
      [today]
    );

    console.log(`[cleanup] Found ${stragglers.rows.length} open shifts.`);

    if (stragglers.rows.length === 0) {
      console.log('[cleanup] Nothing to clean. Done.');
      process.exit(0);
    }

    let cleaned = 0;
    for (const row of stragglers.rows) {
      const employeeId = row.employee_id;
      const shiftDate = new Date(row.date).toISOString().split('T')[0];
      const closeTime = new Date(`${shiftDate}T17:10:00`);

      // Get employee name
      const empRes = await pool.query('SELECT first_name, last_name FROM employees WHERE id = $1', [employeeId]);
      const empName = empRes.rows[0] ? `${empRes.rows[0].first_name} ${empRes.rows[0].last_name}` : `ID ${employeeId}`;

      // End any active break
      const activeBreak = await pool.query(
        `SELECT * FROM time_logs
         WHERE employee_id = $1 AND date = $2 AND type LIKE '%_start'
           AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type LIKE '%_end')
         ORDER BY id DESC LIMIT 1`,
        [employeeId, shiftDate]
      );
      if (activeBreak.rows.length > 0) {
        const ab = activeBreak.rows[0];
        const key = ab.type.replace('_start', '');
        await pool.query(
          `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $4, $3)`,
          [employeeId, key === 'tea_1' ? 'tea_1_end' : key === 'tea_2' ? 'tea_2_end' : 'lunch_end', shiftDate, closeTime]
        );
      }

      // Close open idle events
      await pool.query(
        `UPDATE idle_events SET idle_end = $3, duration_minutes = EXTRACT(EPOCH FROM ($3::timestamptz - idle_start)) / 60
         WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL`,
        [employeeId, shiftDate, closeTime]
      );

      // Calculate break minutes
      const breakLogs = await pool.query(
        `SELECT type, timestamp FROM time_logs
         WHERE employee_id = $1 AND date = $2
           AND type IN ('tea_1_start','tea_1_end','tea_2_start','tea_2_end','lunch_start','lunch_end')
         ORDER BY id`,
        [employeeId, shiftDate]
      );
      let tea1Min = 0, tea2Min = 0, lunchMin = 0;
      const breakStarts = {};
      for (const log of breakLogs.rows) {
        if (log.type.endsWith('_start')) {
          breakStarts[log.type.replace('_start', '')] = new Date(log.timestamp);
        } else if (log.type.endsWith('_end')) {
          const key = log.type.replace('_end', '');
          if (breakStarts[key]) {
            const diff = (new Date(log.timestamp) - breakStarts[key]) / 60000;
            if (key === 'tea_1') tea1Min += diff;
            else if (key === 'tea_2') tea2Min += diff;
            else if (key === 'lunch') lunchMin += diff;
            delete breakStarts[key];
          }
        }
      }

      // Calculate idle minutes
      const idleRows = await pool.query(
        `SELECT COALESCE(SUM(COALESCE(duration_minutes, 0)), 0) as total_idle
         FROM idle_events WHERE employee_id = $1 AND date = $2`,
        [employeeId, shiftDate]
      );
      const idleMin = Math.round(parseFloat(idleRows.rows[0].total_idle) || 0);

      const totalBreakMin = Math.round(tea1Min + tea2Min + lunchMin);
      const rawWorkMin = (closeTime - new Date(row.clock_in)) / 60000;
      const workMin = Math.max(0, Math.round(rawWorkMin - totalBreakMin - idleMin));

      await pool.query(
        `UPDATE attendance SET
           clock_out = $1, status = $8,
           total_work_minutes = $2,
           tea_1_minutes = $3, tea_2_minutes = $4, lunch_minutes = $5,
           idle_minutes = $6, notes = 'Auto clocked out (manual cleanup 30 June)',
           updated_at = NOW()
         WHERE id = $7`,
        [closeTime, workMin, Math.round(tea1Min), Math.round(tea2Min), Math.round(lunchMin), idleMin, row.id, row.status]
      );

      await pool.query(
        `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, 'clock_out', $2, $3)`,
        [employeeId, closeTime, shiftDate]
      );

      console.log(`  ✓ ${empName} | ${shiftDate} | clock-in: ${row.clock_in} | clock-out: ${closeTime.toISOString()} | work: ${workMin}min (breaks: ${totalBreakMin}min, idle: ${idleMin}min)`);
      cleaned++;
    }

    console.log(`\n[cleanup] Done. Closed ${cleaned} shift(s).`);
  } catch (err) {
    console.error('[cleanup] Error:', err.message);
  } finally {
    process.exit(0);
  }
}

cleanup();