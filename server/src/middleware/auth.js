const jwt = require('jsonwebtoken');
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

module.exports = { verifyToken, requireRole };