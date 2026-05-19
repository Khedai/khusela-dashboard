const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Fail fast if JWT secret is too weak
const JWT_SECRET = process.env.JWT_SECRET || '';
if (JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET is missing or too short (minimum 32 characters). Set a strong random secret in .env');
  process.exit(1);
}

// Run once on startup — safe to repeat
const pool = require('./config/db');
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS terminated_at TIMESTAMPTZ').catch(() => {});

// Leave request comments thread
pool.query(`
  CREATE TABLE IF NOT EXISTS leave_request_notes (
    id SERIAL PRIMARY KEY,
    leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});

// Formal disciplinary / written warning records
pool.query(`
  CREATE TABLE IF NOT EXISTS written_warnings (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    warning_type VARCHAR(60) NOT NULL DEFAULT 'Written Warning',
    reason TEXT NOT NULL,
    issued_date DATE,
    notes TEXT,
    issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});

// Create manual leave adjustments table if it doesn't exist
pool.query(`
  CREATE TABLE IF NOT EXISTS leave_manual_adjustments (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type VARCHAR(50) NOT NULL,
    days DECIMAL(4,1) NOT NULL,
    description TEXT,
    year INTEGER NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )
`).catch(() => {});

// Ensure birth_date column exists, then populate from SA ID numbers
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS birth_date DATE')
  .then(() => pool.query(`
    UPDATE employees SET birth_date = (
      CASE
        WHEN CAST(substring(id_number, 1, 2) AS int) > (EXTRACT(YEAR FROM NOW())::int % 100)
        THEN ('19' || substring(id_number, 1, 2) || '-' || substring(id_number, 3, 2) || '-' || substring(id_number, 5, 2))::date
        ELSE ('20' || substring(id_number, 1, 2) || '-' || substring(id_number, 3, 2) || '-' || substring(id_number, 5, 2))::date
      END
    )
    WHERE birth_date IS NULL
      AND id_number IS NOT NULL
      AND length(id_number) >= 6
      AND substring(id_number, 1, 6) ~ '^[0-9]+$'
      AND CAST(substring(id_number, 3, 2) AS int) BETWEEN 1 AND 12
      AND CAST(substring(id_number, 5, 2) AS int) BETWEEN 1 AND 31
  `))
  .catch(err => console.error('birth_date migration error:', err.message));

// Terminate orphaned employees (user account deleted before terminate-on-delete existed)
pool.query(`
  UPDATE employees SET terminated_at = NOW(), user_id = NULL
  WHERE terminated_at IS NULL
    AND user_id IS NOT NULL
    AND user_id NOT IN (SELECT id FROM users)
`).catch(() => {});

const app = express();
app.set('trust proxy', 1); // Required for Render/Heroku

app.use(helmet());
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Routes
const rateLimit = require('express-rate-limit');
const { csrfProtect } = require('./middleware/auth');

// Apply CSRF protection to all mutating requests except login/logout (which create/destroy the token)
app.use((req, res, next) => {
  const exempt = ['/api/auth/login', '/api/auth/logout'];
  if (exempt.includes(req.path)) return next();
  csrfProtect(req, res, next);
});

// Strict limit on auth routes — 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/employees', require('./routes/employees'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

app.use('/api/documents', require('./routes/documents'));
app.use('/api/users', require('./routes/users'));
app.use('/api/franchises', require('./routes/franchises'));
app.use('/api/employee-documents', require('./routes/employeeDocuments'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/notifications', require('./routes/notifications'));





