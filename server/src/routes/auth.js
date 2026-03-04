const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ─── LOGIN ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    // Find user by username
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Check password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Issue JWT
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        franchise_id: user.franchise_id
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        franchise_id: user.franchise_id
      }
    });

  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error during login.' });
  }
});

// ─── VERIFY TOKEN (frontend can call this to check if still logged in) ───
router.get('/verify', require('../middleware/auth').verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

module.exports = router;

// ─── SIGNUP ───────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  const { username, password, role, franchise_id } = req.body;

  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password and role are required.' });
  }

  const validRoles = ['HR', 'Consultant'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Only HR and Consultant accounts can self-register.' });
  }

  if (!franchise_id) {
    return res.status(400).json({ error: 'Please select your franchise.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers and underscores.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const passwordHash = await bcrypt.hash(password, 10);

    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, role, franchise_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, role, is_active, created_at`,
      [username, passwordHash, role, franchise_id]
    );

    const newUser = userResult.rows[0];

    // Auto-create linked employee record
    await client.query(
      `INSERT INTO employees (first_name, user_id, franchise_id)
       VALUES ($1, $2, $3)`,
      [username, newUser.id, franchise_id]
    );

    // Notify all admins of new signup
    const admins = await client.query(
      `SELECT id FROM users WHERE role = 'Admin' AND is_active = TRUE`
    );

    const franchise = await client.query(
      'SELECT franchise_name FROM franchises WHERE id = $1',
      [franchise_id]
    );
    const franchiseName = franchise.rows[0]?.franchise_name || 'Unknown';

    for (const admin of admins.rows) {
      await client.query(
        `INSERT INTO notifications (user_id, title, message, link)
         VALUES ($1, $2, $3, $4)`,
        [
          admin.id,
          'New User Registered',
          `${username} has signed up as ${role} at ${franchiseName}.`,
          '/users'
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ message: 'Account created successfully. You can now log in.' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username already taken. Please choose another.' });
    }
    console.error('Signup error:', err.message);
    res.status(500).json({ error: 'Failed to create account.' });
  } finally {
    client.release();
  }
});