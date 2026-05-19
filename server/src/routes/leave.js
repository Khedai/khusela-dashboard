const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sanitize } = require('../utils/sanitize');

router.use(verifyToken);

// ─── HELPER: merge manual adjustments into balance ───────
async function withManualAdjustments(balance, employeeId, year) {
  const manual = await pool.query(
    `SELECT leave_type, SUM(days)::float AS total
     FROM leave_manual_adjustments
     WHERE employee_id = $1 AND year = $2
     GROUP BY leave_type`,
    [employeeId, year]
  );
  const adj = {};
  for (const r of manual.rows) adj[r.leave_type] = r.total;
  return {
    ...balance,
    annual_used:  (balance.annual_used  || 0) + (adj['Annual']               || 0),
    sick_used:    (balance.sick_used    || 0) + (adj['Sick']                  || 0),
    family_used:  (balance.family_used  || 0) + (adj['Family Responsibility'] || 0),
  };
}

// ─── GET LEAVE BALANCE FOR EMPLOYEE ──────────────────────
router.get('/balance/:employee_id', async (req, res) => {
  const year = new Date().getFullYear();
  try {
    let result = await pool.query(
      'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2',
      [req.params.employee_id, year]
    );
    if (result.rows.length === 0) {
      result = await pool.query(
        `INSERT INTO leave_balances (employee_id, year) VALUES ($1, $2) RETURNING *`,
        [req.params.employee_id, year]
      );
    }
    res.json(await withManualAdjustments(result.rows[0], req.params.employee_id, year));
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch balance.' });
  }
});

// ─── GET ALL LEAVE REQUESTS (Admin only) ─────────────────
router.get('/requests', verifyToken, requireRole('Admin'), async (req, res) => {
  try {
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
       ORDER BY lr.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch leave requests.' });
  }
});

// ─── GET ALL EMPLOYEE LEAVE BALANCES (Admin only) ────────
router.get('/balances', verifyToken, requireRole('Admin'), async (req, res) => {
  const year = new Date().getFullYear();
  try {
    const result = await pool.query(
      `SELECT
        e.id AS employee_id, e.first_name, e.last_name,
        f.franchise_name,
        COALESCE(lb.annual_total, 15) AS annual_total,
        COALESCE(lb.annual_used, 0)  AS annual_used,
        COALESCE(lb.sick_total, 30)  AS sick_total,
        COALESCE(lb.sick_used, 0)    AS sick_used,
        COALESCE(lb.family_total, 3) AS family_total,
        COALESCE(lb.family_used, 0)  AS family_used
       FROM employees e
       LEFT JOIN leave_balances lb ON lb.employee_id = e.id AND lb.year = $1
       LEFT JOIN franchises f ON e.franchise_id = f.id
       WHERE e.terminated_at IS NULL
       ORDER BY e.first_name, e.last_name`,
      [year]
    );
    // merge manual adjustments for each employee
    const manual = await pool.query(
      `SELECT employee_id, leave_type, SUM(days)::float AS total
       FROM leave_manual_adjustments
       WHERE year = $1
       GROUP BY employee_id, leave_type`,
      [year]
    );
    const adjMap = {};
    for (const r of manual.rows) {
      if (!adjMap[r.employee_id]) adjMap[r.employee_id] = {};
      adjMap[r.employee_id][r.leave_type] = r.total;
    }
    const rows = result.rows.map(e => {
      const adj = adjMap[e.employee_id] || {};
      return {
        ...e,
        annual_used:  parseFloat(e.annual_used)  + (adj['Annual'] || 0),
        sick_used:    parseFloat(e.sick_used)     + (adj['Sick'] || 0),
        family_used:  parseFloat(e.family_used)   + (adj['Family Responsibility'] || 0),
      };
    });
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch leave balances.' });
  }
});

// ─── GET EMPLOYEE LEAVE (HR/Admin view of specific employee) ─
router.get('/employee/:employee_id', verifyToken, requireRole('Admin', 'HR'), async (req, res) => {
  const year = new Date().getFullYear();
  try {
    let balResult = await pool.query(
      'SELECT * FROM leave_balances WHERE employee_id = $1 AND year = $2',
      [req.params.employee_id, year]
    );
    if (balResult.rows.length === 0) {
      balResult = await pool.query(
        'INSERT INTO leave_balances (employee_id, year) VALUES ($1, $2) RETURNING *',
        [req.params.employee_id, year]
      );
    }
    const reqResult = await pool.query(
      `SELECT lr.*, u.username AS approved_by_username
       FROM leave_requests lr
       LEFT JOIN users u ON lr.approved_by = u.id
       WHERE lr.employee_id = $1
       ORDER BY lr.created_at DESC`,
      [req.params.employee_id]
    );
    const manualResult = await pool.query(
      `SELECT lma.*, u.username AS created_by_username
       FROM leave_manual_adjustments lma
       LEFT JOIN users u ON lma.created_by = u.id
       WHERE lma.employee_id = $1
       ORDER BY lma.created_at DESC`,
      [req.params.employee_id]
    );
    const balance = await withManualAdjustments(balResult.rows[0], req.params.employee_id, year);
    res.json({ balance, requests: reqResult.rows, manualAdjustments: manualResult.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch employee leave.' });
  }
});

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
      [employee_id, leave_type, start_date, end_date, days_requested, sanitize(reason) || null]
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

// ─── APPROVE / REJECT REQUEST (Admin only) ───────────────
router.patch('/request/:id', verifyToken, requireRole('Admin'), async (req, res) => {
  const { status, rejection_reason } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
  }

  try {
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

    // Admin cannot approve their own leave request
    if (reqResult.rows[0].employee_id) {
      const selfCheck = await pool.query(
        'SELECT id FROM employees WHERE user_id = $1 AND id = $2',
        [req.user.id, reqResult.rows[0].employee_id]
      );
      if (selfCheck.rows.length > 0) {
        return res.status(403).json({ error: 'You cannot approve your own leave request.' });
      }
    }

    // Update
    const result = await pool.query(
      `UPDATE leave_requests
       SET status = $1, approved_by = $2, approved_at = NOW(), rejection_reason = $3
       WHERE id = $4 RETURNING *`,
      [status, req.user.id, sanitize(rejection_reason) || null, req.params.id]
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

// ─── GET MANUAL ADJUSTMENTS FOR EMPLOYEE ─────────────────
router.get('/manual/:employee_id', verifyToken, requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT lma.*, u.username AS created_by_username
       FROM leave_manual_adjustments lma
       LEFT JOIN users u ON lma.created_by = u.id
       WHERE lma.employee_id = $1
       ORDER BY lma.created_at DESC`,
      [req.params.employee_id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch manual adjustments.' });
  }
});

// ─── ADD MANUAL ADJUSTMENT (Admin only) ──────────────────
router.post('/manual', verifyToken, requireRole('Admin'), async (req, res) => {
  const { employee_id, leave_type, days, description, year } = req.body;
  if (!employee_id || !leave_type || !days) {
    return res.status(400).json({ error: 'Employee, leave type and days are required.' });
  }
  const validTypes = ['Annual', 'Sick', 'Family Responsibility'];
  if (!validTypes.includes(leave_type)) {
    return res.status(400).json({ error: 'Invalid leave type.' });
  }
  const adjYear = year || new Date().getFullYear();
  try {
    const result = await pool.query(
      `INSERT INTO leave_manual_adjustments (employee_id, leave_type, days, description, year, created_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [employee_id, leave_type, parseFloat(days), sanitize(description) || null, adjYear, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to add manual adjustment.' });
  }
});

// ─── DELETE MANUAL ADJUSTMENT (Admin only) ───────────────
router.delete('/manual/:id', verifyToken, requireRole('Admin'), async (req, res) => {
  try {
    await pool.query('DELETE FROM leave_manual_adjustments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete manual adjustment.' });
  }
});

// ─── LEAVE REQUEST NOTES (comments thread) ───────────────

router.get('/request/:id/notes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.note, n.created_at,
              u.username, u.role,
              f.franchise_name
       FROM leave_request_notes n
       LEFT JOIN users u ON n.user_id = u.id
       LEFT JOIN franchises f ON u.franchise_id = f.id
       WHERE n.leave_request_id = $1
       ORDER BY n.created_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notes.' });
  }
});

router.post('/request/:id/notes', async (req, res) => {
  const { note } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'Note cannot be empty.' });
  try {
    const result = await pool.query(
      `INSERT INTO leave_request_notes (leave_request_id, user_id, note)
       VALUES ($1, $2, $3) RETURNING id, note, created_at`,
      [req.params.id, req.user.id, note.trim()]
    );
    res.status(201).json({ ...result.rows[0], username: req.user.username, role: req.user.role });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add note.' });
  }
});

router.delete('/request/:id/notes/:noteId', async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT user_id FROM leave_request_notes WHERE id = $1',
      [req.params.noteId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Note not found.' });
    if (req.user.role !== 'Admin' && check.rows[0].user_id !== req.user.id)
      return res.status(403).json({ error: 'Cannot delete this note.' });
    await pool.query('DELETE FROM leave_request_notes WHERE id = $1', [req.params.noteId]);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note.' });
  }
});

module.exports = router;