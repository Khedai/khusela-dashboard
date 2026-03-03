const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireRole('Admin'));

// ─── GET ALL USERS ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.is_active, u.created_at,
              f.franchise_name
       FROM users u
       LEFT JOIN franchises f ON u.franchise_id = f.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get users error:', err.message);
    res.status(500).json({ error: 'Failed to fetch users.' });
  }
});

// ─── CREATE USER ──────────────────────────────────────────
router.post('/', async (req, res) => {
  const { username, password, role, franchise_id } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password and role are required.' });
  }

  const validRoles = ['Admin', 'HR', 'Consultant'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, role, franchise_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, is_active, created_at`,
      [username, passwordHash, role, franchise_id || null]
    );

    const newUser = userResult.rows[0];

    // Auto-create employee record for non-admin users
    if (role !== 'Admin') {
      await client.query(
        `INSERT INTO employees (first_name, last_name, user_id, franchise_id)
         VALUES ($1, $2, $3, $4)`,
        [username, '', newUser.id, franchise_id || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json(newUser);
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already exists.' });
    }
    console.error('Create user error:', err.message);
    res.status(500).json({ error: 'Failed to create user.' });
  } finally {
    client.release();
  }
});

// ─── TOGGLE ACTIVE STATUS ─────────────────────────────────
router.patch('/:id/toggle', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE users SET is_active = NOT is_active
       WHERE id = $1
       RETURNING id, username, is_active`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Toggle user error:', err.message);
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// ─── RESET PASSWORD ───────────────────────────────────────
router.patch('/:id/password', async (req, res) => {
  const { password } = req.body;

  if (!password || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [passwordHash, req.params.id]
    );
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Reset password error:', err.message);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ─── DELETE USER ──────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;