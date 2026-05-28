const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  try {
    const leaveIds = [
      '5594b6e7-506c-4593-8276-0dd1cd756a1e', // Mishque Oliver - Annual 1 day
      '14f3f520-ce59-44f7-875f-ab952671a623', // Olwethu Petros - Sick 1 day
      'c5b2bbf4-6ce5-4dbe-b5e9-e5e2a875a0b9', // Olwethu Petros - Annual 2 days
    ];
    const adminUserId = '18ceec06-bfaa-441e-9316-e5778a8af53b';

    for (const leaveId of leaveIds) {
      const { rows } = await pool.query('SELECT * FROM leave_requests WHERE id = $1', [leaveId]);
      if (!rows.length) { console.log('Not found:', leaveId); continue; }
      const req = rows[0];
      const startLabel = req.start_date ? new Date(req.start_date).toISOString().split('T')[0] : '';
      console.log(`${req.id}: ${req.leave_type} - status=${req.status}, days=${req.days_requested}, start=${startLabel}`);

      if (req.status !== 'Approved') {
        console.log('  -> already not Approved, skip');
        continue;
      }

      // Update status
      await pool.query(
        'UPDATE leave_requests SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = $3 WHERE id = $4',
        ['Rejected', adminUserId, 'Decision reversed by admin', leaveId]
      );
      console.log('  -> Status updated to Rejected');

      // Reverse balance deduction
      const typeMap = { Annual: 'annual_used', Sick: 'sick_used', 'Family Responsibility': 'family_used' };
      const field = typeMap[req.leave_type];
      if (field) {
        const year = new Date(req.start_date).getFullYear();
        await pool.query(
          `INSERT INTO leave_balances (employee_id, year, ${field})
           VALUES ($1, $2, $3)
           ON CONFLICT (employee_id, year)
           DO UPDATE SET ${field} = GREATEST(leave_balances.${field} - $3, 0)`,
          [req.employee_id, year, parseFloat(req.days_requested)]
        );
        console.log(`  -> Balance reversed: removed ${req.days_requested} from ${field}`);
      }

      // Get employee name
      const empInfo = await pool.query('SELECT first_name, last_name FROM employees WHERE id = $1', [req.employee_id]);
      const empName = empInfo.rows.length ? empInfo.rows[0].first_name + ' ' + empInfo.rows[0].last_name : 'Employee';
      const leaveLink = '/leave?request=' + leaveId;

      // Update admin notifications
      await pool.query(
        `UPDATE notifications SET title = $1, message = $2, is_read = FALSE
         WHERE (title LIKE 'New Leave Request%' OR title LIKE 'Leave Request%') AND link = $3`,
        [
          'New Leave Request \u2014 Rejected (Reversed)',
          empName + "'s " + req.leave_type + ' leave (' + req.days_requested + ' day(s) starting ' + startLabel + ') has been reversed to rejected by an admin.',
          leaveLink,
        ]
      );
      console.log('  -> Admin notifications updated');

      // Notify employee
      const empUser = await pool.query(
        'SELECT u.id FROM users u JOIN employees e ON e.user_id = u.id WHERE e.id = $1',
        [req.employee_id]
      );
      if (empUser.rows.length > 0) {
        await pool.query(
          `INSERT INTO notifications (user_id, title, message, link) VALUES ($1, $2, $3, $4)`,
          [
            empUser.rows[0].id,
            'Leave Request Rejected (Decision Reversed)',
            'Your ' + req.leave_type + ' leave (' + req.days_requested + ' days) decision has been reversed to rejected. Please check the details.',
            '/inbox',
          ]
        );
        console.log('  -> Employee notified');
      }
      console.log('  -> Complete!');
    }

    console.log('\nAll requests have been rejected successfully.');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    await pool.end();
  }
}
main();
