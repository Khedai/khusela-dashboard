/**
 * Clear ALL clock-in history for everyone.
 * Run: node src/clear_history.js
 * WARNING: This deletes all attendance records, time_logs, and idle_events.
 */
const pool = require('./config/db');

async function clear() {
  try {
    console.log('[clear] Deleting all attendance history...');
    
    const idleRes = await pool.query('DELETE FROM idle_events');
    console.log(`  idle_events: ${idleRes.rowCount} rows deleted.`);
    
    const logRes = await pool.query('DELETE FROM time_logs');
    console.log(`  time_logs: ${logRes.rowCount} rows deleted.`);
    
    const attRes = await pool.query('DELETE FROM attendance');
    console.log(`  attendance: ${attRes.rowCount} rows deleted.`);
    
    console.log('\n[clear] All clock-in history cleared. Everyone starts fresh.');
  } catch (err) {
    console.error('[clear] Error:', err.message);
  } finally {
    process.exit(0);
  }
}

clear();