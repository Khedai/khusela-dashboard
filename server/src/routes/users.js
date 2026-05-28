const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);
router.use(requireRole('Admin'));

const SUPERUSER = 'Ayabonga'; // only this account can promote/demote to Admin

// ─── GET ALL USERS ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, u.is_active, u.created_at,
              f.franchise_name,
              e.id AS linked_employee_id,
              e.first_name AS linked_employee_first,
              e.last_name AS linked_employee_last
       FROM users u
       LEFT JOIN franchises f ON u.franchise_id = f.id
       LEFT JOIN employees e ON e.user_id = u.id AND e.terminated_at IS NULL
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

  if (role === 'Admin' && req.user.username !== SUPERUSER) {
    return res.status(403).json({ error: 'Only Ayabonga can create Admin accounts.' });
  }

  if (password.length < 10 || !/[0-9!@#$%^&*]/.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and contain a number or special character.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, 12);
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
    // Prevent deactivation of protected accounts
    const target = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length > 0 && PROTECTED_USERNAMES.includes(target.rows[0].username)) {
      return res.status(403).json({ error: 'This account is protected and cannot be deactivated.' });
    }
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
router.patch('/:id/reset-password', async (req, res) => {
  const { password } = req.body;

  if (!password || password.length < 10 || !/[0-9!@#$%^&*]/.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and contain a number or special character.' });
  }

  try {
    // Prevent password reset of protected accounts
    const target = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length > 0 && PROTECTED_USERNAMES.includes(target.rows[0].username)) {
      return res.status(403).json({ error: 'This account is protected and its password cannot be reset by other admins.' });
    }
    const passwordHash = await bcrypt.hash(password, 12);
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

// ─── PROMOTE TO ADMIN (Ayabonga only) ────────────────────
router.patch('/:id/promote', async (req, res) => {
  if (req.user.username !== SUPERUSER) {
    return res.status(403).json({ error: 'Only Ayabonga can promote users to Admin.' });
  }
  try {
    const result = await pool.query(
      `UPDATE users SET role = 'Admin' WHERE id = $1 AND role != 'Admin'
       RETURNING id, username, role`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found or already Admin.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Promote user error:', err.message);
    res.status(500).json({ error: 'Failed to promote user.' });
  }
});

// ─── DEMOTE FROM ADMIN (Ayabonga only) ───────────────────
router.patch('/:id/demote', async (req, res) => {
  if (req.user.username !== SUPERUSER) {
    return res.status(403).json({ error: 'Only Ayabonga can demote Admin users.' });
  }
  try {
    // Cannot demote yourself
    if (req.params.id == req.user.id) {
      return res.status(403).json({ error: 'You cannot demote yourself.' });
    }
    // Cannot demote the superuser account
    const target = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
    if (target.rows[0]?.username === SUPERUSER) {
      return res.status(403).json({ error: 'The superuser account cannot be demoted.' });
    }
    const result = await pool.query(
      `UPDATE users SET role = 'HR' WHERE id = $1 AND role = 'Admin'
       RETURNING id, username, role`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Demote user error:', err.message);
    res.status(500).json({ error: 'Failed to demote user.' });
  }
});

// ─── DELETE USER ──────────────────────────────────────────
const PROTECTED_USERNAMES = ['Ayabonga', 'Admin'];

router.delete('/:id', async (req, res) => {
  try {
    const target = await pool.query('SELECT username FROM users WHERE id = $1', [req.params.id]);
    if (target.rows.length > 0 && PROTECTED_USERNAMES.includes(target.rows[0].username)) {
      return res.status(403).json({ error: 'This account is protected and cannot be deleted.' });
    }

    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }
    // Mark linked employee as terminated so HR can see them in Past Employees
    await pool.query(
      'UPDATE employees SET terminated_at = NOW(), user_id = NULL WHERE user_id = $1',
      [req.params.id]
    );
    res.json({ message: 'User deleted.' });
  } catch (err) {
    console.error('Delete user error:', err.message);
    res.status(500).json({ error: 'Failed to delete user.' });
  }
});

module.exports = router;