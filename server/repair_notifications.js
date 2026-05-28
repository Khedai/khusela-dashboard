#!/usr/bin/env node
// Repair stale leave request notifications — updates admin notifications
// to match the current status of the leave request.
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    // Find leave requests that are no longer Pending, but whose admin notifications still say Pending
    const result = await pool.query(`
      SELECT
        lr.id AS leave_id,
        lr.status,
        lr.leave_type,
        lr.start_date,
        lr.days_requested,
        lr.rejection_reason,
        e.first_name,
        e.last_name,
        n.id AS notif_id
      FROM leave_requests lr
      JOIN employees e ON lr.employee_id = e.id
      JOIN notifications n ON (
        n.title LIKE 'New Leave Request%'
        AND n.user_id IN (SELECT id FROM users WHERE role = 'Admin')
        AND (
          n.link = '/leave?request=' || lr.id::text
          OR (
            n.link = '/leave'
            AND n.message LIKE '%' || e.first_name || ' ' || e.last_name || '%'
          )
        )
      )
      WHERE lr.status != 'Pending'
        AND n.title LIKE 'New Leave Request%'
        AND n.title NOT ILIKE '%' || lr.status || '%'
    `);

    console.log(`Found ${result.rows.length} stale notification(s).`);

    let fixed = 0;
    for (const row of result.rows) {
      const empName = `${row.first_name} ${row.last_name}`.trim();
      const startLabel = row.start_date ? new Date(row.start_date).toISOString().split('T')[0] : '';
      const reasonSuffix = row.rejection_reason ? ` Reason: ${row.rejection_reason}` : '';
      const leaveLink = `/leave?request=${row.leave_id}`;
      const newTitle = `New Leave Request — ${row.status}`;
      const newMessage = `${empName}'s ${row.leave_type} leave (${row.days_requested} day(s) starting ${startLabel}) has been ${row.status.toLowerCase()}.${reasonSuffix}`;

      await pool.query(
        `UPDATE notifications
         SET title = $1, message = $2, link = $3, is_read = FALSE
         WHERE id = $4`,
        [newTitle, newMessage, leaveLink, row.notif_id]
      );
      fixed++;
      console.log(`  Fixed: ${row.leave_id} → ${row.status} (notif ${row.notif_id})`);
    }

    console.log(`\nRepaired ${fixed} notification(s).`);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

main();