const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sanitize } = require('../utils/sanitize');

// All employee routes require a valid token
router.use(verifyToken);

// ─── GET ALL EMPLOYEES ────────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { franchise_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT e.*, f.franchise_name
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

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Count query for total
    const countQuery = query
      .replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')
      .replace(/ORDER BY.*$/, '');
    const countResult = await pool.query(countQuery.split('ORDER')[0], params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY e.created_at DESC`;

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

// ─── GET SINGLE EMPLOYEE BY ID ────────────────────────────
router.get('/:id', requireRole('Admin', 'HR'), async (req, res) => {
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

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get employee error:', err.message);
    res.status(500).json({ error: 'Failed to fetch employee.' });
  }
});

// ─── CREATE NEW EMPLOYEE ──────────────────────────────────
router.post('/', requireRole('Admin', 'HR'), async (req, res) => {
  const {
    user_id, franchise_id,
    title, first_name, last_name, id_number, tax_number,
    birth_date, marital_status, email, home_phone, alternate_phone,
    address_street, address_city, postal_code,
    allergies_health_concerns,
    ec_title, ec_first_name, ec_last_name, ec_address,
    ec_primary_phone, ec_alternate_phone, ec_relationship,
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
        bank_name, branch_name, branch_code, account_name, account_number
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
        $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
        $24, $25, $26, $27, $28
      ) RETURNING *`,
      [
        user_id || null, franchiseId,
        sanitize(title), sanitize(first_name), sanitize(last_name), sanitize(id_number), sanitize(tax_number),
        birth_date || null, sanitize(marital_status), sanitize(email), sanitize(home_phone), sanitize(alternate_phone),
        sanitize(address_street), sanitize(address_city), sanitize(postal_code),
        sanitize(allergies_health_concerns),
        sanitize(ec_title), sanitize(ec_first_name), sanitize(ec_last_name), sanitize(ec_address),
        sanitize(ec_primary_phone), sanitize(ec_alternate_phone), sanitize(ec_relationship),
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
  const {
    title, first_name, last_name, id_number, tax_number,
    birth_date, marital_status, email, home_phone, alternate_phone,
    address_street, address_city, postal_code,
    allergies_health_concerns,
    ec_title, ec_first_name, ec_last_name, ec_address,
    ec_primary_phone, ec_alternate_phone, ec_relationship,
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
        bank_name = $22, branch_name = $23, branch_code = $24,
        account_name = $25, account_number = $26
       WHERE id = $27
       RETURNING *`,
      [
        sanitize(title), sanitize(first_name), sanitize(last_name), sanitize(id_number), sanitize(tax_number),
        birth_date || null, sanitize(marital_status), sanitize(email), sanitize(home_phone), sanitize(alternate_phone),
        sanitize(address_street), sanitize(address_city), sanitize(postal_code),
        sanitize(allergies_health_concerns),
        sanitize(ec_title), sanitize(ec_first_name), sanitize(ec_last_name), sanitize(ec_address),
        sanitize(ec_primary_phone), sanitize(ec_alternate_phone), sanitize(ec_relationship),
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
        bank_name = $24, branch_name = $25, branch_code = $26,
        account_name = $27, account_number = $28, account_type = $29,
        job_title = $30, employment_date = $31
        ${req.user.role === 'Admin' ? ', franchise_id = $33' : ''}
      WHERE id = $32
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

module.exports = router;