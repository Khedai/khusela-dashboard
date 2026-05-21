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

// Leave request comments thread — introspect users.id type so we match it exactly
pool.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'`)
  .then(res => {
    const userIdType = res.rows[0]?.data_type === 'uuid' ? 'UUID' : 'INTEGER';
    // Drop existing table if either FK column has wrong type
    return pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leave_request_notes'
            AND ((column_name = 'leave_request_id' AND data_type != 'uuid')
              OR (column_name = 'user_id' AND data_type != '${userIdType.toLowerCase()}'))
        ) THEN
          DROP TABLE leave_request_notes;
        END IF;
      END $$
    `).then(() => pool.query(`
      CREATE TABLE IF NOT EXISTS leave_request_notes (
        id SERIAL PRIMARY KEY,
        leave_request_id UUID NOT NULL REFERENCES leave_requests(id) ON DELETE CASCADE,
        user_id ${userIdType} REFERENCES users(id) ON DELETE SET NULL,
        note TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `));
  })
  .catch(err => console.error('leave_request_notes migration error:', err.message));

// Formal disciplinary / written warning records
pool.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'`)
  .then(res => {
    const userIdType = res.rows[0]?.data_type === 'uuid' ? 'UUID' : 'INTEGER';
    return pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'written_warnings'
            AND ((column_name = 'employee_id' AND data_type != 'uuid')
              OR (column_name = 'issued_by' AND data_type != '${userIdType.toLowerCase()}'))
        ) THEN
          DROP TABLE written_warnings;
        END IF;
      END $$
    `).then(() => pool.query(`
      CREATE TABLE IF NOT EXISTS written_warnings (
        id SERIAL PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        warning_type VARCHAR(60) NOT NULL DEFAULT 'Written Warning',
        reason TEXT NOT NULL,
        issued_date DATE,
        notes TEXT,
        issued_by ${userIdType} REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `));
  })
  .catch(err => console.error('written_warnings migration error:', err.message));

// Manual leave adjustments
pool.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'`)
  .then(res => {
    const userIdType = res.rows[0]?.data_type === 'uuid' ? 'UUID' : 'INTEGER';
    return pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'leave_manual_adjustments'
            AND ((column_name = 'employee_id' AND data_type != 'uuid')
              OR (column_name = 'created_by' AND data_type != '${userIdType.toLowerCase()}'))
        ) THEN
          DROP TABLE leave_manual_adjustments;
        END IF;
      END $$
    `).then(() => pool.query(`
      CREATE TABLE IF NOT EXISTS leave_manual_adjustments (
        id SERIAL PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        leave_type VARCHAR(50) NOT NULL,
        days DECIMAL(4,1) NOT NULL,
        description TEXT,
        year INTEGER NOT NULL,
        created_by ${userIdType} REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `));
  })
  .catch(err => console.error('leave_manual_adjustments migration error:', err.message));


// Ensure leave_balances uses UUID for employee_id (employees table uses UUID PKs)
pool.query(`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'leave_balances'
        AND column_name = 'employee_id'
        AND data_type = 'integer'
    ) THEN
      DROP TABLE leave_balances;
    END IF;
  END $$
`).then(() => pool.query(`
  CREATE TABLE IF NOT EXISTS leave_balances (
    id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
    annual_total INTEGER NOT NULL DEFAULT 15,
    annual_used DECIMAL(5,1) NOT NULL DEFAULT 0,
    sick_total INTEGER NOT NULL DEFAULT 30,
    sick_used DECIMAL(5,1) NOT NULL DEFAULT 0,
    family_total INTEGER NOT NULL DEFAULT 3,
    family_used DECIMAL(5,1) NOT NULL DEFAULT 0,
    UNIQUE (employee_id, year)
  )
`)).catch(err => console.error('leave_balances migration error:', err.message));

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





