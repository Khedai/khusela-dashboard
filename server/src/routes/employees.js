const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// All employee routes require a valid token
router.use(verifyToken);

// ─── GET ALL EMPLOYEES ────────────────────────────────────
router.get('/', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        e.id, e.first_name, e.last_name, e.title, e.email,
        e.home_phone, e.alternate_phone, e.marital_status,
        e.id_number, e.created_at,
        f.franchise_name
       FROM employees e
       LEFT JOIN franchises f ON e.franchise_id = f.id
       ORDER BY e.last_name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get employees error:', err.message);
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
        user_id || null, franchise_id || null,
        title, first_name, last_name, id_number, tax_number,
        birth_date || null, marital_status, email, home_phone, alternate_phone,
        address_street, address_city, postal_code,
        allergies_health_concerns,
        ec_title, ec_first_name, ec_last_name, ec_address,
        ec_primary_phone, ec_alternate_phone, ec_relationship,
        bank_name, branch_name, branch_code, account_name, account_number
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
        title, first_name, last_name, id_number, tax_number,
        birth_date || null, marital_status, email, home_phone, alternate_phone,
        address_street, address_city, postal_code,
        allergies_health_concerns,
        ec_title, ec_first_name, ec_last_name, ec_address,
        ec_primary_phone, ec_alternate_phone, ec_relationship,
        bank_name, branch_name, branch_code, account_name, account_number,
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

module.exports = router;