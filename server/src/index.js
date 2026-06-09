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
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS sec_title VARCHAR(10)').catch(() => {});
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS sec_first_name VARCHAR(50)').catch(() => {});
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS sec_last_name VARCHAR(50)').catch(() => {});
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS sec_relationship VARCHAR(50)').catch(() => {});
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS sec_primary_phone VARCHAR(20)').catch(() => {});
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS sec_alternate_phone VARCHAR(20)').catch(() => {});
pool.query('ALTER TABLE employees ADD COLUMN IF NOT EXISTS sec_address TEXT').catch(() => {});

// Drop legacy CHECK constraint on documents.doc_type — UI allows arbitrary names (SARS, etc.)
pool.query('ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_doc_type_check').catch(() => {});

// Remove leave-request inbox notifications wrongly sent to HR/Consultant (Admin-only going forward)
pool.query(`
  DELETE FROM notifications n
  USING users u
  WHERE n.user_id = u.id
    AND u.role IN ('HR', 'Consultant')
    AND (n.link = '/leave' OR n.title = 'New Leave Request — Pending')
`).catch(err => console.error('leave notification cleanup:', err.message));

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

// Employee internal HR/Admin comments thread
pool.query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'id'`)
  .then(res => {
    const userIdType = res.rows[0]?.data_type === 'uuid' ? 'UUID' : 'INTEGER';
    return pool.query(`
      CREATE TABLE IF NOT EXISTS employee_notes (
        id SERIAL PRIMARY KEY,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        user_id ${userIdType} REFERENCES users(id) ON DELETE SET NULL,
        note TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  })
  .catch(err => console.error('employee_notes migration error:', err.message));

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
        days INTEGER NOT NULL,
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
    annual_used INTEGER NOT NULL DEFAULT 0,
    sick_total INTEGER NOT NULL DEFAULT 30,
    sick_used INTEGER NOT NULL DEFAULT 0,
    family_total INTEGER NOT NULL DEFAULT 3,
    family_used INTEGER NOT NULL DEFAULT 0,
    UNIQUE (employee_id, year)
  )
`)).catch(err => console.error('leave_balances migration error:', err.message));

// ─── Migrate existing DECIMAL day columns to INTEGER (rounds existing values) ───
pool.query('ALTER TABLE leave_balances ALTER COLUMN annual_used TYPE INTEGER USING ROUND(annual_used)::INTEGER').catch(() => {});
pool.query('ALTER TABLE leave_balances ALTER COLUMN sick_used   TYPE INTEGER USING ROUND(sick_used)::INTEGER').catch(() => {});
pool.query('ALTER TABLE leave_balances ALTER COLUMN family_used TYPE INTEGER USING ROUND(family_used)::INTEGER').catch(() => {});
pool.query('ALTER TABLE leave_manual_adjustments ALTER COLUMN days TYPE INTEGER USING ROUND(days)::INTEGER').catch(() => {});

// One-time: fix ALL stale "Pending" notifications for already-finalized leave requests
pool.query(`
  UPDATE notifications n
  SET
    title = 'New Leave Request — ' || lr.status,
    message = lr.leave_type || ' leave (' || lr.days_requested || ' day(s) starting ' || TO_CHAR(lr.start_date, 'YYYY-MM-DD') || ') has been ' || LOWER(lr.status) || '.',
    is_read = FALSE
  FROM leave_requests lr
  WHERE n.link = '/leave?request=' || lr.id
    AND (n.title LIKE 'New Leave Request%' OR n.title LIKE 'Leave Request%')
    AND lr.status != 'Pending'
`).catch(err => console.error('stale notification cleanup:', err.message));

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





