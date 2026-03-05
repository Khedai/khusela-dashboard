const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// ─── LOGIN ───────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password are required.' });

  try {
    const result = await pool.query(
      `SELECT u.*, f.franchise_name 
       FROM users u
       LEFT JOIN franchises f ON u.franchise_id = f.id
       WHERE u.username = $1`,
      [username]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const user = result.rows[0];

    if (!user.is_active)
      return res.status(403).json({ error: 'Your account has been deactivated.' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Invalid username or password.' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );

    // Set httpOnly cookie — JavaScript cannot read this
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
    });

    // Return user info but NOT the token
    res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        franchise_id: user.franchise_id,
        franchise_name: user.franchise_name,
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ─── LOGOUT ───────────────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  });
  res.json({ message: 'Logged out.' });
});

// ─── VERIFY (used by frontend on load) ───────────────────
router.get('/verify', (req, res) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No session.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.status(401).json({ error: 'Session expired.' });
  }
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