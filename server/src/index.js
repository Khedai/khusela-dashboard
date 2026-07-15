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

// ─── Time Tracking Tables ──────────────────────────────
pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION').catch(() => {});
pool.query('ALTER TABLE attendance ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION').catch(() => {});
pool.query(`
  CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status VARCHAR(20) DEFAULT 'absent',
    clock_in TIMESTAMPTZ,
    clock_out TIMESTAMPTZ,
    total_work_minutes INTEGER,
    tea_1_minutes INTEGER DEFAULT 0,
    tea_2_minutes INTEGER DEFAULT 0,
    lunch_minutes INTEGER DEFAULT 0,
    idle_minutes INTEGER DEFAULT 0,
    is_manual_entry BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    UNIQUE (employee_id, date)
  )
`).catch(err => console.error('attendance migration error:', err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS time_logs (
    id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    date DATE NOT NULL,
    idle_detected BOOLEAN DEFAULT false
  )
`).catch(err => console.error('time_logs migration error:', err.message));

pool.query(`
  CREATE TABLE IF NOT EXISTS idle_events (
    id SERIAL PRIMARY KEY,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    idle_start TIMESTAMPTZ NOT NULL,
    idle_end TIMESTAMPTZ,
    duration_minutes INTEGER,
    date DATE NOT NULL
  )
`).catch(err => console.error('idle_events migration error:', err.message));

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

// ─── Automatic daily cleanup at 17:10 SA time ─────────
// Every 30 seconds, check if we're past 17:10 SAST and run cleanup if not done today.
// Also runs on startup to catch missed cleanups while server was asleep (Render free tier).
let cleanupRanDate = null;
const DAILY_CLEANUP_MINUTE = 10; // 17:10 SA time

async function runDailyCleanup() {
  try {
    const now = new Date();
    const saHour = (now.getUTCHours() + 2 + 24) % 24;
    const saMin = now.getUTCMinutes();
    const todayStr = now.toISOString().split('T')[0];

    // Run at 17:10 or shortly after (within 3 minutes), only once per day
    // Also run on startup if past 17:10 and not yet cleaned today
    const pastCleanupTime = (saHour > 17) || (saHour === 17 && saMin >= DAILY_CLEANUP_MINUTE);
    const withinWindow = (saHour === 17 && saMin >= DAILY_CLEANUP_MINUTE && saMin <= DAILY_CLEANUP_MINUTE + 3);
    const alreadyDone = cleanupRanDate === todayStr;
    
    if (alreadyDone || (!withinWindow && cleanupRanDate !== null)) return;
    // If cleanupRanDate is null (just started), allow any time past 17:10
    if (cleanupRanDate !== null && !withinWindow && !(pastCleanupTime && cleanupRanDate !== todayStr)) return;

    // Save startup flag BEFORE setting cleanupRanDate
    const isStartupRun = cleanupRanDate === null;
    cleanupRanDate = todayStr;

    console.log(`[cleanup] Running daily auto-clock-out at ${now.toISOString()} (${isStartupRun ? 'startup' : 'scheduled'})...`);

    // On startup, only clean up past dates, NOT today.
    // At 17:10, include today as well (people should have clocked out by then).
    const dateOp = isStartupRun ? '<' : '<=';
    const stragglers = await pool.query(
      `SELECT * FROM attendance WHERE date ${dateOp} $1 AND clock_in IS NOT NULL AND clock_out IS NULL ORDER BY date`,
      [todayStr]
    );

    if (stragglers.rows.length === 0) {
      console.log('[cleanup] No open shifts to clean up.');
      return;
    }

    let cleaned = 0;
    for (const row of stragglers.rows) {
      const employeeId = row.employee_id;
      const shiftDate = new Date(row.date).toISOString().split('T')[0];
      const closeTime = new Date(`${shiftDate}T17:10:00+02:00`); // 5:10 PM SAST on shift date

      // End any active break
      const activeBreak = await pool.query(
        `SELECT * FROM time_logs
         WHERE employee_id = $1 AND date = $2 AND type LIKE '%_start'
           AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type LIKE '%_end')
         ORDER BY id DESC LIMIT 1`,
        [employeeId, shiftDate]
      );
      if (activeBreak.rows.length > 0) {
        const ab = activeBreak.rows[0];
        const key = ab.type.replace('_start', '');
        await pool.query(
          `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $4, $3)`,
          [employeeId, key === 'tea_1' ? 'tea_1_end' : key === 'tea_2' ? 'tea_2_end' : 'lunch_end', shiftDate, closeTime]
        );
      }

      // Close open idle events
      await pool.query(
        `UPDATE idle_events SET idle_end = $3, duration_minutes = EXTRACT(EPOCH FROM ($3 - idle_start)) / 60
         WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL`,
        [employeeId, shiftDate, closeTime]
      );

      // Calculate break minutes
      const breakLogs = await pool.query(
        `SELECT type, timestamp FROM time_logs
         WHERE employee_id = $1 AND date = $2
           AND type IN ('tea_1_start','tea_1_end','tea_2_start','tea_2_end','lunch_start','lunch_end')
         ORDER BY id`,
        [employeeId, shiftDate]
      );
      let tea1Min = 0, tea2Min = 0, lunchMin = 0;
      const breakStarts = {};
      for (const log of breakLogs.rows) {
        if (log.type.endsWith('_start')) {
          breakStarts[log.type.replace('_start', '')] = new Date(log.timestamp);
        } else if (log.type.endsWith('_end')) {
          const key = log.type.replace('_end', '');
          if (breakStarts[key]) {
            const diff = (new Date(log.timestamp) - breakStarts[key]) / 60000;
            if (key === 'tea_1') tea1Min += diff;
            else if (key === 'tea_2') tea2Min += diff;
            else if (key === 'lunch') lunchMin += diff;
            delete breakStarts[key];
          }
        }
      }

      // Calculate idle minutes
      const idleRows = await pool.query(
        `SELECT COALESCE(SUM(COALESCE(duration_minutes, 0)), 0) as total_idle
         FROM idle_events WHERE employee_id = $1 AND date = $2`,
        [employeeId, shiftDate]
      );
      const idleMin = Math.round(parseFloat(idleRows.rows[0].total_idle) || 0);

      const totalBreakMin = Math.round(tea1Min + tea2Min + lunchMin);
      const rawWorkMin = (closeTime - new Date(row.clock_in)) / 60000;
      const workMin = Math.max(0, Math.round(rawWorkMin - totalBreakMin - idleMin));

      await pool.query(
        `UPDATE attendance SET
           clock_out = $1, status = $8,
           total_work_minutes = $2,
           tea_1_minutes = $3, tea_2_minutes = $4, lunch_minutes = $5,
           idle_minutes = $6, notes = 'Auto clocked out (daily cleanup 17:10)',
           updated_at = NOW()
         WHERE id = $7`,
        [closeTime, workMin, Math.round(tea1Min), Math.round(tea2Min), Math.round(lunchMin), idleMin, row.id, row.status]
      );

      await pool.query(
        `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, 'clock_out', $2, $3)`,
        [employeeId, closeTime, shiftDate]
      );
      cleaned++;
    }

    console.log(`[cleanup] Auto-clocked out ${cleaned} shift(s).`);

    // ─── Also mark absent employees who never clocked in ───
    if (!isStartupRun) {
      // Only do this for today's date (not startup catch-up)
      const absentResult = await pool.query(`
        INSERT INTO attendance (employee_id, date, status, notes)
        SELECT e.id, $1::date, 'absent', 'Auto marked absent (daily cleanup 17:10)'
        FROM employees e
        WHERE e.terminated_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM attendance a
            WHERE a.employee_id = e.id AND a.date = $1::date
          )
          AND NOT EXISTS (
            SELECT 1 FROM leave_requests lr
            WHERE lr.employee_id = e.id
              AND lr.status = 'Approved'
              AND $1::date BETWEEN lr.start_date AND lr.end_date
          )
        ON CONFLICT (employee_id, date) DO NOTHING
        RETURNING employee_id
      `, [todayStr]);
      if (absentResult.rows.length > 0) {
        console.log(`[cleanup] Marked ${absentResult.rows.length} employee(s) as absent for ${todayStr}.`);
      }
    }
  } catch (err) {
    console.error('[cleanup] Error during daily cleanup:', err.message);
  }
}

// Check every 30 seconds (faster than 60s to catch the 17:10 window more reliably)
setInterval(runDailyCleanup, 30 * 1000);
// Startup cleanup REMOVED — it was closing today's shifts on every deploy/restart.
// The /today endpoint now handles stale shifts when users log in.
console.log('[cleanup] Daily auto-clock-out scheduler started (runs at 17:10 SA time, + on startup).');

app.use('/api/documents', require('./routes/documents'));
app.use('/api/users', require('./routes/users'));
app.use('/api/franchises', require('./routes/franchises'));
app.use('/api/employee-documents', require('./routes/employeeDocuments'));
app.use('/api/leave', require('./routes/leave'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/time', require('./routes/time'));





