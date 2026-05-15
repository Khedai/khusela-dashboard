/**
 * One-time cleanup script — run with: node server/src/config/cleanup.js
 * Deletes all but the oldest application, and purges all leave requests.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const pool = require('./db');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Keep only the single oldest application
    const oldest = await client.query(
      'SELECT id FROM applications ORDER BY created_at ASC LIMIT 1'
    );

    if (oldest.rows.length > 0) {
      const keepId = oldest.rows[0].id;
      const del = await client.query(
        'DELETE FROM applications WHERE id != $1',
        [keepId]
      );
      console.log(`Deleted ${del.rowCount} application(s). Kept ID ${keepId}.`);
    } else {
      console.log('No applications found.');
    }

    // Purge all leave requests
    const lr = await client.query('DELETE FROM leave_requests');
    console.log(`Deleted ${lr.rowCount} leave request(s).`);

    // Ensure terminated_at column exists before using it
    await client.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ');

    // Move orphaned employees (user account deleted before this update) to Past Employees.
    // Matches employees whose user_id is NULL or points to a non-existent user, and
    // haven't already been terminated.
    const orphaned = await client.query(`
      UPDATE employees
      SET terminated_at = NOW(), user_id = NULL
      WHERE terminated_at IS NULL
        AND (
          user_id IS NULL
          OR user_id NOT IN (SELECT id FROM users)
        )
      RETURNING id, first_name, last_name
    `);
    if (orphaned.rowCount > 0) {
      console.log(`Moved ${orphaned.rowCount} orphaned employee(s) to Past Employees:`);
      orphaned.rows.forEach(e => console.log(`  - ${e.first_name} ${e.last_name} (ID ${e.id})`));
    } else {
      console.log('No orphaned employees found.');
    }

    await client.query('COMMIT');
    console.log('Cleanup complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cleanup failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
