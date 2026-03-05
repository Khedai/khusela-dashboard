const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
  // Read from httpOnly cookie instead of Authorization header
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'No session. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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