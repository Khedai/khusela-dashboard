const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// ─── GET LEAVE BALANCE FOR EMPLOYEE ──────────────────────
router.get('/balance/:employee_id', async (req, res) => {
  const year = new Date().getFullYear();
  try {
    let result = await pool.query(
      'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2',
      [req.params.employee_id, year]
    );
    // Auto-create balance record if it doesn't exist
    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO leave_balances (employee_id, year)
         VALUES ($1, $2) RETURNING *`,
        [req.params.employee_id, year]
      );
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch balance.' });
  }
});

// ─── GET ALL LEAVE REQUESTS ───────────────────────────────
router.get('/requests', verifyToken, requireRole('HR'), async (req, res) => {
  try {
    const hrResult = await pool.query(
      'SELECT franchise_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const franchiseId = hrResult.rows[0]?.franchise_id;

    const result = await pool.query(
      `SELECT 
        lr.*,
        e.first_name, e.last_name,
        f.franchise_name,
        u.username AS approved_by_username
       FROM leave_requests lr
       LEFT JOIN employees e ON lr.employee_id = e.id
       LEFT JOIN franchises f ON e.franchise_id = f.id
       LEFT JOIN users u ON lr.approved_by = u.id
       WHERE e.franchise_id = $1
       ORDER BY lr.created_at DESC`,
      [franchiseId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave requests.' });
  }
});

// ─── GET MY LEAVE REQUESTS (for consultant) ───────────────
// ─── GET MY EMPLOYEE RECORD ───────────────────────────────
router.get('/my-employee', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No employee record linked to your account.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch employee record.' });
  }
});

// ─── GET MY LEAVE REQUESTS (for consultant) ───────────────
router.get('/my-requests/:employee_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lr.*, u.username AS approved_by_username
       FROM leave_requests lr
       LEFT JOIN users u ON lr.approved_by = u.id
       WHERE lr.employee_id = $1
       ORDER BY lr.created_at DESC`,
      [req.params.employee_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch requests.' });
  }
});

// ─── SUBMIT LEAVE REQUEST ─────────────────────────────────
router.post('/request', async (req, res) => {
  const { employee_id, leave_type, start_date, end_date, days_requested, reason } = req.body;

  if (!employee_id || !leave_type || !start_date || !end_date || !days_requested) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  if (new Date(start_date) > new Date(end_date)) {
    return res.status(400).json({ error: 'Start date cannot be after end date.' });
  }

  if (new Date(start_date) < new Date()) {
    return res.status(400).json({ error: 'Leave must be applied for future dates.' });
  }

  try {
    // Check balance and warn (but don't block)
    const year = new Date().getFullYear();
    const balanceResult = await pool.query(
      'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2',
      [employee_id, year]
    );

    let warning = null;
    if (balanceResult.rows.length > 0) {
      const bal = balanceResult.rows[0];
      const typeMap = { Annual: ['annual_total', 'annual_used'], Sick: ['sick_total', 'sick_used'], 'Family Responsibility': ['family_total', 'family_used'] };
      const keys = typeMap[leave_type];
      if (keys) {
        const remaining = bal[keys[0]] - bal[keys[1]];
        if (remaining <= 0) {
          warning = `You have 0 ${leave_type} leave days remaining. Request will still be submitted.`;
        }
      }
    }

    // Create the request
    const result = await pool.query(
      `INSERT INTO leave_requests (employee_id, leave_type, start_date, end_date, days_requested, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [employee_id, leave_type, start_date, end_date, days_requested, reason || null]
    );

    // Notify all HR and Admin users
    const managers = await pool.query(
      `SELECT id FROM users WHERE role IN ('Admin', 'HR') AND is_active = TRUE`
    );

    const emp = await pool.query('SELECT first_name, last_name FROM employees WHERE id = $1', [employee_id]);
    const empName = emp.rows.length > 0 ? `${emp.rows[0].first_name} ${emp.rows[0].last_name}` : 'An employee';

    for (const manager of managers.rows) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, link)
         VALUES ($1, $2, $3, $4)`,
        [
          manager.id,
          'New Leave Request — Pending',
          `${empName} has submitted a ${leave_type} leave request for ${days_requested} day(s) starting ${start_date}. Action required.`,
          '/leave'
        ]
      );
    }

    res.status(201).json({ request: result.rows[0], warning });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to submit request.' });
  }
});

// ─── APPROVE / REJECT REQUEST ─────────────────────────────
router.patch('/request/:id', verifyToken, requireRole('HR'), async (req, res) => {
  const { status, rejection_reason } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
  }

  try {
    // Verify the leave request belongs to HR's franchise
    const hrResult = await pool.query(
      'SELECT franchise_id FROM users WHERE id = $1',
      [req.user.id]
    );
    const hrFranchiseId = hrResult.rows[0]?.franchise_id;

    const reqResult = await pool.query(
      `SELECT lr.*, e.franchise_id AS employee_franchise_id
       FROM leave_requests lr
       JOIN employees e ON lr.employee_id = e.id
       WHERE lr.id = $1`,
      [req.params.id]
    );

    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found.' });
    }

    if (reqResult.rows[0].employee_franchise_id !== hrFranchiseId) {
      return res.status(403).json({
        error: 'You can only approve leave for employees in your franchise.'
      });
    }

    // Update
    const result = await pool.query(
      `UPDATE leave_requests
       SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = $3
       WHERE id = $4 RETURNING *`,
      [status, req.user.id, rejection_reason || null, req.params.id]
    );

    const req_data = result.rows[0];

    // Deduct balance if approved
    if (status === 'Approved') {
      const year = new Date(req_data.start_date).getFullYear();
      const typeMap = {
        Annual: 'annual_used',
        Sick: 'sick_used',
        'Family Responsibility': 'family_used'
      };
      const field = typeMap[req_data.leave_type];
      if (field) {
        await pool.query(
          `INSERT INTO leave_balances (employee_id, year, ${field})
           VALUES ($1, $2, $3)
           ON CONFLICT (employee_id, year)
           DO UPDATE SET ${field} = leave_balances.${field} + $3`,
          [req_data.employee_id, year, req_data.days_requested]
        );
      }
    }

    // Notify the employee
    const empUser = await pool.query(
      `SELECT u.id FROM users u
       JOIN employees e ON e.user_id = u.id
       WHERE e.id = $1`,
      [req_data.employee_id]
    );

    if (empUser.rows.length > 0) {
      await pool.query(
        `INSERT INTO notifications (user_id, title, message, link)
         VALUES ($1, $2, $3, $4)`,
        [
          empUser.rows[0].id,
          `Leave Request ${status}`,
          `Your ${req_data.leave_type} leave (${req_data.days_requested} days) has been ${status.toLowerCase()}.${rejection_reason ? ' Reason: ' + rejection_reason : ''}`,
          '/inbox'
        ]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to update request.' });
  }
});

module.exports = router;