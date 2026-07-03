const pool = require('./config/db');

async function fix() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const r = await pool.query(
      'UPDATE attendance SET idle_minutes = 0 WHERE date = $1 AND clock_in IS NOT NULL RETURNING employee_id',
      [today]
    );
    console.log(`Reset idle for ${r.rowCount} active shifts.`);
    await pool.query(
      'UPDATE idle_events SET idle_end = NOW(), duration_minutes = 0 WHERE date = $1 AND idle_end IS NULL',
      [today]
    );
    console.log('Closed open idle events.');
  } catch (err) {
    console.error(err.message);
  } finally {
    process.exit(0);
  }
}

fix();