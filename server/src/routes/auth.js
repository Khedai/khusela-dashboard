const router = require('express').Router();
const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { verifyToken, requireRole, generateCsrfToken } = require('../middleware/auth');
const { sanitize } = require('../utils/sanitize');

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

    const isProd = process.env.NODE_ENV === 'production';
    const cookieBase = {
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      path: '/',
      // Optional: set this to the parent domain (e.g. ".example.com")
      // so cookies can be read/sent across subdomains in production.
      domain: process.env.COOKIE_DOMAIN || undefined,
    };

    // Set httpOnly cookie — JavaScript cannot read this
    res.cookie('token', token, { ...cookieBase, httpOnly: true });

    // Set CSRF token — intentionally readable by JS for double-submit validation
    const csrfToken = generateCsrfToken();
    res.cookie('csrf-token', csrfToken, { ...cookieBase, httpOnly: false });

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
  const isProd = process.env.NODE_ENV === 'production';
  const cookieBase = {
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    domain: process.env.COOKIE_DOMAIN || undefined,
  };
  res.clearCookie('token', { ...cookieBase, httpOnly: true });
  res.clearCookie('csrf-token', { ...cookieBase, httpOnly: false });
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
router.post('/signup', verifyToken, requireRole('Admin'), async (req, res) => {
  const { username, password, role, franchise_id } = req.body;
  const cleanUsername = sanitize(username)?.toLowerCase().replace(/\s/g, '');

  if (!cleanUsername || !password || !role) {
    return res.status(400).json({ error: 'Username, password and role are required.' });
  }

  if (password.length < 10 || !/[0-9!@#$%^&*]/.test(password)) {
    return res.status(400).json({ error: 'Password must be at least 10 characters and contain a number or special character.' });
  }

  const allowedRoles = ['Admin', 'HR', 'Consultant'];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ error: 'Role must be Admin, HR or Consultant.' });
  }

  try {
    // Check username taken
    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [cleanUsername]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Username already taken.' });
    }

    const password_hash = await bcrypt.hash(password, 12);

    // Create user
    const userResult = await pool.query(
      `INSERT INTO users (username, password_hash, role, franchise_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE) RETURNING id, username, role, franchise_id`,
      [cleanUsername, password_hash, role, franchise_id || null]
    );

    const newUser = userResult.rows[0];

    // Auto-create employee record
    await pool.query(
      `INSERT INTO employees (first_name, last_name, user_id, franchise_id)
       VALUES ($1, $2, $3, $4)`,
      [cleanUsername, '', newUser.id, franchise_id || null]
    );

    res.status(201).json({ message: 'Account created.', user: newUser });
  } catch (err) {
    console.error('Create account error:', err.message);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});