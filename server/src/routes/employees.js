const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sanitize } = require('../utils/sanitize');

// All employee routes require a valid token
router.use(verifyToken);

// ─── GET ALL EMPLOYEE BIRTHDAYS (lightweight, no pagination) ─
router.get('/birthdays', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.id, e.first_name, e.last_name, e.id_number, f.franchise_name
       FROM employees e
       LEFT JOIN franchises f ON e.franchise_id = f.id
       WHERE e.terminated_at IS NULL
         AND e.id_number IS NOT NULL
         AND length(e.id_number) >= 6
       ORDER BY e.first_name, e.last_name`
    );
    const currentYY = new Date().getFullYear() % 100;
    const rows = result.rows
      .filter(e => /^\d{6}/.test(e.id_number))
      .map(e => {
        const yy = parseInt(e.id_number.substring(0, 2));
        const mm = e.id_number.substring(2, 4);
        const dd = e.id_number.substring(4, 6);
        const century = yy > currentYY ? '19' : '20';
        return {
          ...e,
          birth_date: `${century}${yy.toString().padStart(2, '0')}-${mm}-${dd}`,
        };
      });
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch birthdays.' });
  }
});

// ─── GET ALL EMPLOYEES ────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { franchise_id, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Non-Admin roles get only non-confidential columns (name, phone, job title, franchise)
    // Plus their own user_id so the UI can detect "this is me" for self-edit access
    const isAdmin = req.user.role === 'Admin';
    const selectColumns = isAdmin
      ? 'e.*, f.franchise_name'
      : `e.id, e.first_name, e.last_name, e.cell, e.whatsapp, e.home_phone,
         e.job_title, e.franchise_id, e.user_id, e.terminated_at, f.franchise_name`;

    let query = `
      SELECT ${selectColumns}
      FROM employees e
      LEFT JOIN franchises f ON e.franchise_id = f.id
    `;
    const params = [];
    const conditions = [];

    if (franchise_id) {
      conditions.push(`e.franchise_id = $${params.length + 1}`);
      params.push(franchise_id);
    } else if (req.user.role !== 'Admin') {
      // Non-admins with no filter still only see their franchise
      conditions.push(`e.franchise_id = $${params.length + 1}`);
      params.push(req.user.franchise_id || null);
    }

    // Never show unassigned employees to non-admins
    if (req.user.role !== 'Admin') {
      conditions.push(`e.franchise_id IS NOT NULL`);
    }

    conditions.push('e.terminated_at IS NULL');
    // Exclude employees whose linked user account has been deleted
    conditions.push('(e.user_id IS NULL OR EXISTS (SELECT 1 FROM users u WHERE u.id = e.user_id))');

    // Search filter
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      const idx = params.length + 1;
      conditions.push(`(e.first_name ILIKE $${idx} OR e.last_name ILIKE $${idx} OR e.id_number ILIKE $${idx} OR e.email ILIKE $${idx} OR e.job_title ILIKE $${idx})`);
      params.push(q);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Count query for total
    const countQuery = query
      .replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')
      .replace(/ORDER BY.*$/, '');
    const countResult = await pool.query(countQuery.split('ORDER')[0], params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY CASE WHEN e.job_title IS NULL OR e.job_title = '' THEN 1 ELSE 0 END, e.job_title, e.first_name ASC`;

    // Add pagination to main query
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);
    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch employees.' });
  }
});

// ─── GET TERMINATED (PAST) EMPLOYEES ─────────────────────
router.get('/terminated', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const conditions = ['e.terminated_at IS NOT NULL'];
    const params = [];
    if (req.user.role !== 'Admin') {
      conditions.push(`e.franchise_id = $${params.length + 1}`);
      params.push(req.user.franchise_id || null);
    }
    const result = await pool.query(
      `SELECT e.*, f.franchise_name
       FROM employees e
       LEFT JOIN franchises f ON e.franchise_id = f.id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.terminated_at DESC`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch past employees.' });
  }
});

// ─── GET SINGLE EMPLOYEE BY ID ────────────────────────────
router.get('/:id', requireRole('Admin', 'HR', 'Consultant'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*, f.franchise_name
       FROM employees e
       LEFT JOIN franchises f ON e.franchise_id = f.id
       WHERE e.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    const emp = result.rows[0];

    // HR and Consultants may only view their OWN employee record in full.
    // Admins see everything.
    if (req.user.role !== 'Admin' && emp.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied. You can only view your own employee record.' });
    }

    res.json(emp);
  } catch (err) {
    console.error('Get employee error:', err.message);
    res.status(500).json({ error: 'Failed to fetch employee.' });
  }
});

// ─── CREATE NEW EMPLOYEE ──────────────────────────────────
router.post('/', requireRole('Admin'), async (req, res) => {
  const {
    user_id, franchise_id,
    title, first_name, last_name, id_number, tax_number,
    birth_date, marital_status, email, home_phone, alternate_phone,
    address_street, address_city, postal_code,
    allergies_health_concerns,
    ec_title, ec_first_name, ec_last_name, ec_address,
    ec_primary_phone, ec_alternate_phone, ec_relationship,
    sec_title, sec_first_name, sec_last_name, sec_address,
    sec_primary_phone, sec_alternate_phone, sec_relationship,
    bank_name, branch_name, branch_code, account_name, account_number
  } = req.body;

  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'First name and last name are required.' });
  }

  // Auto-assign franchise from logged-in user if not provided
  const franchiseId = franchise_id || req.user?.franchise_id || null;

  try {
    const result = await pool.query(
      `INSERT INTO employees (
        user_id, franchise_id,
        title, first_name, last_name, id_number, tax_number,
        birth_date, marital_status, email, home_phone, alternate_phone,
        address_street, address_city, postal_code,
        allergies_health_concerns,
        ec_title, ec_first_name, ec_last_name, ec_address,
        ec_primary_phone, ec_alternate_phone, ec_relationship,
        sec_title, sec_first_name, sec_last_name, sec_address,
        sec_primary_phone, sec_alternate_phone, sec_relationship,
        bank_name, branch_name, branch_code, account_name, account_number
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35
      ) RETURNING *`,
      [
        user_id || null, franchiseId,
        sanitize(title), sanitize(first_name), sanitize(last_name), sanitize(id_number), sanitize(tax_number),
        birth_date || null, sanitize(marital_status), sanitize(email), sanitize(home_phone), sanitize(alternate_phone),
        sanitize(address_street), sanitize(address_city), sanitize(postal_code),
        sanitize(allergies_health_concerns),
        sanitize(ec_title), sanitize(ec_first_name), sanitize(ec_last_name), sanitize(ec_address),
        sanitize(ec_primary_phone), sanitize(ec_alternate_phone), sanitize(ec_relationship),
        sanitize(sec_title), sanitize(sec_first_name), sanitize(sec_last_name), sanitize(sec_address),
        sanitize(sec_primary_phone), sanitize(sec_alternate_phone), sanitize(sec_relationship),
        sanitize(bank_name), sanitize(branch_name), sanitize(branch_code), sanitize(account_name), sanitize(account_number)
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create employee error:', err.message);
    res.status(500).json({ error: 'Failed to create employee.' });
  }
});

// ─── UPDATE EMPLOYEE ──────────────────────────────────────
router.put('/:id', requireRole('Admin', 'HR'), async (req, res) => {
  // HR can only edit their own employee record
  if (req.user.role === 'HR') {
    const check = await pool.query('SELECT user_id FROM employees WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0 || check.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own employee record.' });
    }
  }
  const {
    title, first_name, last_name, id_number, tax_number,
    birth_date, marital_status, email, home_phone, alternate_phone,
    address_street, address_city, postal_code,
    allergies_health_concerns,
    ec_title, ec_first_name, ec_last_name, ec_address,
    ec_primary_phone, ec_alternate_phone, ec_relationship,
    sec_title, sec_first_name, sec_last_name, sec_address,
    sec_primary_phone, sec_alternate_phone, sec_relationship,
    bank_name, branch_name, branch_code, account_name, account_number
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE employees SET
        title = $1, first_name = $2, last_name = $3,
        id_number = $4, tax_number = $5, birth_date = $6,
        marital_status = $7, email = $8, home_phone = $9,
        alternate_phone = $10, address_street = $11,
        address_city = $12, postal_code = $13,
        allergies_health_concerns = $14,
        ec_title = $15, ec_first_name = $16, ec_last_name = $17,
        ec_address = $18, ec_primary_phone = $19,
        ec_alternate_phone = $20, ec_relationship = $21,
        sec_title = $22, sec_first_name = $23, sec_last_name = $24,
        sec_address = $25, sec_primary_phone = $26,
        sec_alternate_phone = $27, sec_relationship = $28,
        bank_name = $29, branch_name = $30, branch_code = $31,
        account_name = $32, account_number = $33
       WHERE id = $34
       RETURNING *`,
      [
        sanitize(title), sanitize(first_name), sanitize(last_name), sanitize(id_number), sanitize(tax_number),
        birth_date || null, sanitize(marital_status), sanitize(email), sanitize(home_phone), sanitize(alternate_phone),
        sanitize(address_street), sanitize(address_city), sanitize(postal_code),
        sanitize(allergies_health_concerns),
        sanitize(ec_title), sanitize(ec_first_name), sanitize(ec_last_name), sanitize(ec_address),
        sanitize(ec_primary_phone), sanitize(ec_alternate_phone), sanitize(ec_relationship),
        sanitize(sec_title), sanitize(sec_first_name), sanitize(sec_last_name), sanitize(sec_address),
        sanitize(sec_primary_phone), sanitize(sec_alternate_phone), sanitize(sec_relationship),
        sanitize(bank_name), sanitize(branch_name), sanitize(branch_code), sanitize(account_name), sanitize(account_number),
        req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update employee error:', err.message);
    res.status(500).json({ error: 'Failed to update employee.' });
  }
});

// ─── DELETE EMPLOYEE ──────────────────────────────────────
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM employees WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json({ message: 'Employee deleted successfully.' });
  } catch (err) {
    console.error('Delete employee error:', err.message);
    res.status(500).json({ error: 'Failed to delete employee.' });
  }
});

// ─── PATCH EMPLOYEE (partial update) ──────────────────────
router.patch('/:id', verifyToken, requireRole('Admin', 'HR'), async (req, res) => {
  const {
    title, first_name, last_name, id_number, tax_number,
    birth_date, marital_status, email, cell, whatsapp,
    home_phone, alternate_phone,
    address_street, address_city, postal_code,
    allergies_health_concerns,
    ec_title, ec_first_name, ec_last_name, ec_address,
    ec_primary_phone, ec_alternate_phone, ec_relationship,
    sec_title, sec_first_name, sec_last_name, sec_address,
    sec_primary_phone, sec_alternate_phone, sec_relationship,
    bank_name, branch_name, branch_code,
    account_name, account_number, account_type,
    job_title, employment_date,
    franchise_id,
  } = req.body;

  try {
    // HR cannot change franchise — only Admin can
    const franchiseUpdate = req.user.role === 'Admin' ? franchise_id : undefined;

    // HR can only edit employees in their own franchise
    if (req.user.role === 'HR') {
      const empCheck = await pool.query(
        'SELECT franchise_id FROM employees WHERE id = $1',
        [req.params.id]
      );
      if (empCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found.' });
      }
      if (empCheck.rows[0].franchise_id !== req.user.franchise_id) {
        return res.status(403).json({ error: 'You can only edit employees in your franchise.' });
      }
    }

    const result = await pool.query(
      `UPDATE employees SET
        title = $1, first_name = $2, last_name = $3,
        id_number = $4, tax_number = $5,
        birth_date = $6, marital_status = $7,
        email = $8, cell = $9, whatsapp = $10,
        home_phone = $11, alternate_phone = $12,
        address_street = $13, address_city = $14, postal_code = $15,
        allergies_health_concerns = $16,
        ec_title = $17, ec_first_name = $18, ec_last_name = $19,
        ec_address = $20, ec_primary_phone = $21,
        ec_alternate_phone = $22, ec_relationship = $23,
        sec_title = $24, sec_first_name = $25, sec_last_name = $26,
        sec_address = $27, sec_primary_phone = $28,
        sec_alternate_phone = $29, sec_relationship = $30,
        bank_name = $31, branch_name = $32, branch_code = $33,
        account_name = $34, account_number = $35, account_type = $36,
        job_title = $37, employment_date = $38
        ${req.user.role === 'Admin' ? ', franchise_id = $40' : ''}
      WHERE id = $39
      RETURNING *`,
      [
        sanitize(title) || null, sanitize(first_name), sanitize(last_name) || null,
        sanitize(id_number) || null, sanitize(tax_number) || null,
        birth_date || null, sanitize(marital_status) || null,
        sanitize(email) || null, sanitize(cell) || null, sanitize(whatsapp) || null,
        sanitize(home_phone) || null, sanitize(alternate_phone) || null,
        sanitize(address_street) || null, sanitize(address_city) || null, sanitize(postal_code) || null,
        sanitize(allergies_health_concerns) || null,
        sanitize(ec_title) || null, sanitize(ec_first_name) || null, sanitize(ec_last_name) || null,
        sanitize(ec_address) || null, sanitize(ec_primary_phone) || null,
        sanitize(ec_alternate_phone) || null, sanitize(ec_relationship) || null,
        sanitize(sec_title) || null, sanitize(sec_first_name) || null, sanitize(sec_last_name) || null,
        sanitize(sec_address) || null, sanitize(sec_primary_phone) || null,
        sanitize(sec_alternate_phone) || null, sanitize(sec_relationship) || null,
        sanitize(bank_name) || null, sanitize(branch_name) || null, sanitize(branch_code) || null,
        sanitize(account_name) || null, sanitize(account_number) || null, sanitize(account_type) || null,
        sanitize(job_title) || null, employment_date || null,
        req.params.id,
        ...(req.user.role === 'Admin' ? [franchise_id || null] : []),
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update employee error:', err.message);
    res.status(500).json({ error: 'Failed to update employee.' });
  }
});

// ─── LINK EMPLOYEE TO USER ACCOUNT ───────────────────────
router.patch('/:id/link-user', requireRole('Admin', 'HR'), async (req, res) => {
  const { user_id } = req.body;
  try {
    // Remove link from any other employee first (one user = one employee)
    if (user_id) {
      await pool.query(
        'UPDATE employees SET user_id = NULL WHERE user_id = $1 AND id != $2',
        [user_id, req.params.id]
      );
    }
    const result = await pool.query(
      'UPDATE employees SET user_id = $1 WHERE id = $2 RETURNING *',
      [user_id || null, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Employee not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to link user.' });
  }
});

// ─── EMPLOYEE NOTES (internal HR/Admin comments) ─────────

router.get('/:id/notes', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.note, n.created_at,
              u.username, u.role,
              f.franchise_name
       FROM employee_notes n
       LEFT JOIN users u ON n.user_id = u.id
       LEFT JOIN franchises f ON u.franchise_id = f.id
       WHERE n.employee_id = $1
       ORDER BY n.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('GET employee notes error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notes.', detail: err.message });
  }
});

router.post('/:id/notes', requireRole('Admin', 'HR'), async (req, res) => {
  const { note } = req.body;
  if (!note?.trim()) return res.status(400).json({ error: 'Note cannot be empty.' });
  try {
    const result = await pool.query(
      `INSERT INTO employee_notes (employee_id, user_id, note)
       VALUES ($1, $2, $3) RETURNING id, note, created_at`,
      [req.params.id, req.user.id, note.trim()]
    );
    res.status(201).json({ ...result.rows[0], username: req.user.username, role: req.user.role });
  } catch (err) {
    console.error('POST employee notes error:', err.message);
    res.status(500).json({ error: 'Failed to add note.', detail: err.message });
  }
});

router.delete('/:id/notes/:noteId', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const check = await pool.query(
      'SELECT user_id FROM employee_notes WHERE id = $1',
      [req.params.noteId]
    );
    if (!check.rows.length) return res.status(404).json({ error: 'Note not found.' });
    // HR can only delete their own notes; Admin can delete any
    if (req.user.role !== 'Admin' && check.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Cannot delete this note.' });
    }
    await pool.query('DELETE FROM employee_notes WHERE id = $1', [req.params.noteId]);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error('DELETE employee notes error:', err.message);
    res.status(500).json({ error: 'Failed to delete note.', detail: err.message });
  }
});

// ─── WRITTEN WARNINGS ────────────────────────────────────

router.get('/:id/warnings', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT w.*, u.username AS issued_by_username
       FROM written_warnings w
       LEFT JOIN users u ON w.issued_by = u.id
       WHERE w.employee_id = $1
       ORDER BY COALESCE(w.issued_date, w.created_at::date) DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch warnings.' });
  }
});

router.post('/:id/warnings', requireRole('Admin', 'HR'), async (req, res) => {
  const { warning_type, reason, issued_date, notes } = req.body;
  if (!reason?.trim()) return res.status(400).json({ error: 'Reason is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO written_warnings (employee_id, warning_type, reason, issued_date, notes, issued_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        req.params.id,
        warning_type || 'Written Warning',
        sanitize(reason),
        issued_date || null,
        notes?.trim() ? sanitize(notes) : null,
        req.user.id
      ]
    );
    res.status(201).json({ ...result.rows[0], issued_by_username: req.user.username });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create warning.' });
  }
});

router.delete('/:id/warnings/:warnId', requireRole('Admin'), async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM written_warnings WHERE id = $1 AND employee_id = $2',
      [req.params.warnId, req.params.id]
    );
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete warning.' });
  }
});

// ─── TERMINATE EMPLOYEE (resignation / dismissal) ─────────
router.patch('/:id/terminate', requireRole('Admin'), async (req, res) => {
  const { termination_type, termination_reason, termination_notes } = req.body;
  if (!termination_type || !['Resignation', 'Dismissal'].includes(termination_type)) {
    return res.status(400).json({ error: 'termination_type must be "Resignation" or "Dismissal".' });
  }
  if (!termination_reason || !termination_reason.trim()) {
    return res.status(400).json({ error: 'Termination reason is required.' });
  }
  try {
    const result = await pool.query(
      `UPDATE employees
       SET terminated_at = NOW(),
           user_id = NULL,
           termination_type = $1,
           termination_reason = $2,
           termination_notes = $3
       WHERE id = $4
       RETURNING *`,
      [termination_type, sanitize(termination_reason), termination_notes?.trim() ? sanitize(termination_notes) : null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Terminate employee error:', err.message);
    res.status(500).json({ error: 'Failed to terminate employee.' });
  }
});

module.exports = router;