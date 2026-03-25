const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();
const pool = require('../config/db');

const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'No session. Please log in.' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Fetch fresh user data including franchise_id
    const result = await pool.query(
      'SELECT id, username, role, franchise_id, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({ error: 'User not found or deactivated.' });
    }
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({ error: `Forbidden. Required: ${roles.join(' or ')}` });
  }
  next();
};

// ─── CSRF PROTECTION (double-submit cookie) ───────────────
// Mutating requests must include X-CSRF-Token header matching the csrf-token cookie.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const csrfProtect = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies?.['csrf-token'];
  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token.' });
  }
  next();
};

const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

module.exports = { verifyToken, requireRole, csrfProtect, generateCsrfToken };