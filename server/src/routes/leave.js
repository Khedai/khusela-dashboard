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
    // Get all active employees
    const empResult = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, f.franchise_name
       FROM employees e
       LEFT JOIN franchises f ON e.franchise_id = f.id
       WHERE e.terminated_at IS NULL
       ORDER BY e.first_name, e.last_name`
    );

    // Get all leave balances for the current year
    const balResult = await pool.query(
      'SELECT * FROM leave_balances WHERE year = $1',
      [year]
    );

    const balMap = {};
    for (const b of balResult.rows) balMap[b.employee_id] = b;

    // Get manual adjustments
    let adjMap = {};
    try {
      const manual = await pool.query(
        `SELECT employee_id, leave_type, SUM(days)::float AS total
         FROM leave_manual_adjustments WHERE year = $1
         GROUP BY employee_id, leave_type`,
        [year]
      );
      for (const r of manual.rows) {
        if (!adjMap[r.employee_id]) adjMap[r.employee_id] = {};
        adjMap[r.employee_id][r.leave_type] = r.total;
      }
    } catch { /* table might not exist yet */ }

    const rows = empResult.rows.map(e => {
      const bal = balMap[e.id] || {};
      const adj = adjMap[e.id] || {};
      return {
        employee_id: e.id,
        first_name: e.first_name,
        last_name: e.last_name,
        franchise_name: e.franchise_name,
        annual_total: bal.annual_total ?? 15,
        annual_used:  (bal.annual_used ?? 0) + (adj['Annual'] || 0),
        sick_total:   bal.sick_total ?? 30,
        sick_used:    (bal.sick_used ?? 0) + (adj['Sick'] || 0),
        family_total: bal.family_total ?? 3,
        family_used:  (bal.family_used ?? 0) + (adj['Family Responsibility'] || 0),
      };
    });
    res.json(rows);
  } catch (err) {
    console.error('Balances error:', err.message);
    res.status(500).json({ error: 'Failed to fetch leave balances.', detail: err.message });
  }
});

// ─── GET EMPLOYEE LEAVE (Admin only view of specific employee) ─
router.get('/employee/:employee_id', verifyToken, requireRole('Admin'), async (req, res) => {
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

    // Notify Admin only — leave approval is Admin-only
    const managers = await pool.query(
      `SELECT id FROM users WHERE role = 'Admin' AND is_active = TRUE`
    );

    const leaveId = result.rows[0].id;
    const leaveLink = `/leave?request=${leaveId}`;

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
          leaveLink,
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

    const leaveLink = `/leave?request=${req.params.id}`;
    const empRow = await pool.query(
      'SELECT first_name, last_name FROM employees WHERE id = $1',
      [req_data.employee_id]
    );
    const empName = empRow.rows.length > 0
      ? `${empRow.rows[0].first_name} ${empRow.rows[0].last_name}`.trim()
      : 'An employee';
    const startLabel = req_data.start_date?.split('T')[0] || req_data.start_date;
    const reasonSuffix = rejection_reason ? ` Reason: ${rejection_reason}` : '';

    // Update Admin inbox notifications for this request (Pending → Approved/Rejected)
    await pool.query(
      `UPDATE notifications
       SET title = $1, message = $2, link = $3, is_read = FALSE
       WHERE title LIKE 'New Leave Request%'
         AND (
           link = $3
           OR (link = '/leave' AND title = 'New Leave Request — Pending' AND message LIKE $4 AND message LIKE $5)
         )`,
      [
        `New Leave Request — ${status}`,
        `${empName}'s ${req_data.leave_type} leave (${req_data.days_requested} day(s) starting ${startLabel}) has been ${status.toLowerCase()}.${reasonSuffix}`,
        leaveLink,
        `%${empName}%`,
        `%${startLabel}%`,
      ]
    );

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
          `Your ${req_data.leave_type} leave (${req_data.days_requested} days) has been ${status.toLowerCase()}.${reasonSuffix}`,
          '/inbox',
        ]
      );
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to update request.' });
  }
});

// ─── REVERSE LEAVE DECISION (Admin only) ───────────────────
// Flips an Approved <-> Rejected decision, adjusts balance, and sends notifications.
router.patch('/request/:id/reverse', verifyToken, requireRole('Admin'), async (req, res) => {
  try {
    // Fetch the request with employee info
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

    const req_data = reqResult.rows[0];

    // Only allow reversing a finalized decision, not a pending request
    if (req_data.status === 'Pending') {
      return res.status(400).json({ error: 'Cannot reverse a pending request. Use Approve or Reject instead.' });
    }

    // Determine new status (flip)
    const newStatus = req_data.status === 'Approved' ? 'Rejected' : 'Approved';
    const reasonForRejection = newStatus === 'Rejected'
      ? (req.body.rejection_reason || req_data.rejection_reason || 'Decision reversed by admin')
      : null;

    // Update the request — clear rejection_reason if switching to Approved
    const updateResult = await pool.query(
      `UPDATE leave_requests
       SET status = $1,
           approved_by = $2,
           approved_at = NOW(),
           rejection_reason = $3
       WHERE id = $4 RETURNING *`,
      [
        newStatus,
        req.user.id,
        reasonForRejection,
        req.params.id
      ]
    );

    const updated = updateResult.rows[0];

    // ── Reverse balance ──
    const typeMap = {
      Annual: 'annual_used',
      Sick: 'sick_used',
      'Family Responsibility': 'family_used'
    };
    const field = typeMap[req_data.leave_type];

    if (field) {
      const year = new Date(req_data.start_date).getFullYear();

      if (req_data.status === 'Approved' && newStatus === 'Rejected') {
        // Was Approved -> now Rejected: REMOVE the previously deducted days from balance
        await pool.query(
          `INSERT INTO leave_balances (employee_id, year, ${field})
           VALUES ($1, $2, $3)
           ON CONFLICT (employee_id, year)
           DO UPDATE SET ${field} = GREATEST(leave_balances.${field} - $3, 0)`,
          [req_data.employee_id, year, req_data.days_requested]
        );
      } else if (req_data.status === 'Rejected' && newStatus === 'Approved') {
        // Was Rejected -> now Approved: ADD the days to balance (same as original approval)
        await pool.query(
          `INSERT INTO leave_balances (employee_id, year, ${field})
           VALUES ($1, $2, $3)
           ON CONFLICT (employee_id, year)
           DO UPDATE SET ${field} = leave_balances.${field} + $3`,
          [req_data.employee_id, year, req_data.days_requested]
        );
      }
    }

    const leaveLink = `/leave?request=${req.params.id}`;
    const empRow = await pool.query(
      'SELECT first_name, last_name FROM employees WHERE id = $1',
      [req_data.employee_id]
    );
    const empName = empRow.rows.length > 0
      ? `${empRow.rows[0].first_name} ${empRow.rows[0].last_name}`.trim()
      : 'An employee';
    const startLabel = req_data.start_date?.split('T')[0] || req_data.start_date;

    // ── Update the admin notification for this request ──
    await pool.query(
      `UPDATE notifications
       SET title = $1, message = $2, link = $3, is_read = FALSE
       WHERE (title LIKE 'New Leave Request%' OR title LIKE 'Leave Request%')
         AND link = $3`,
      [
        `New Leave Request — ${newStatus} (Reversed)`,
        `${empName}'s ${req_data.leave_type} leave (${req_data.days_requested} day(s) starting ${startLabel}) has been reversed to ${newStatus.toLowerCase()} by an admin.`,
        leaveLink,
      ]
    );

    // ── Notify the employee about the reversal ──
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
          `Leave Request ${newStatus} (Decision Reversed)`,
          `Your ${req_data.leave_type} leave (${req_data.days_requested} days) decision has been reversed to ${newStatus.toLowerCase()}. Please check the details.`,
          '/inbox',
        ]
      );
    }

    res.json(updated);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to reverse decision.' });
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
    console.error('GET /leave/request/:id/notes error:', err.message, err.code);
    res.status(500).json({ error: 'Failed to fetch notes.', detail: err.message });
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
    console.error('POST /leave/request/:id/notes error:', err.message, err.code);
    res.status(500).json({ error: 'Failed to add note.', detail: err.message });
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
    console.error('DELETE /leave/request/:id/notes/:noteId error:', err.message, err.code);
    res.status(500).json({ error: 'Failed to delete note.', detail: err.message });
  }
});

module.exports = router;
