const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// ─── Break durations (minutes) ─────────────────────────
const TEA_DURATION = 15;
const LUNCH_DURATION = 30;

// ─── Middleware: block monitoring-only admins from clocking ───
const MONITORING_ONLY_ADMINS = ['ayabonga', 'ayabulela'];
const blockMonitoringAdmin = (req, res, next) => {
  const username = (req.user.username || '').toLowerCase();
  if (MONITORING_ONLY_ADMINS.includes(username)) {
    return res.status(403).json({ error: 'Your account is monitoring-only. Use the dashboard to view attendance.' });
  }
  next();
};

// ─── Helper: get employee_id from user ─────────────────
async function getEmployeeId(userId) {
  const res = await pool.query('SELECT id FROM employees WHERE user_id = $1 AND terminated_at IS NULL', [userId]);
  return res.rows[0]?.id || null;
}

// ─── CLOCK IN ──────────────────────────────────────────
router.post('/clock-in', blockMonitoringAdmin, async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'No active employee record linked to your account.' });

    const today = new Date().toISOString().split('T')[0];

    // Check if already clocked in today
    const existing = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [employeeId, today]
    );
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already clocked in today.' });
    }

    // Check if on approved leave today
    const onLeave = await pool.query(
      `SELECT 1 FROM leave_requests
       WHERE employee_id = $1 AND status = 'Approved'
         AND $2::date BETWEEN start_date AND end_date`,
      [employeeId, today]
    );
    if (onLeave.rows.length > 0) {
      return res.status(400).json({ error: 'You are on approved leave today. No clock-in needed.' });
    }

    const { latitude, longitude } = req.body;
    const now = new Date();
    const result = await pool.query(
      `INSERT INTO attendance (employee_id, date, status, clock_in, latitude, longitude)
       VALUES ($1, $2, 'present', $3, $4, $5)
       ON CONFLICT (employee_id, date) DO UPDATE
       SET status = 'present', clock_in = $3, clock_out = NULL, total_work_minutes = NULL,
           latitude = COALESCE($4, attendance.latitude), longitude = COALESCE($5, attendance.longitude)
       RETURNING *`,
      [employeeId, today, now, latitude || null, longitude || null]
    );

    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date)
       VALUES ($1, 'clock_in', $2, $3)`,
      [employeeId, now, today]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('clock-in error:', err.message);
    res.status(500).json({ error: 'Failed to clock in.' });
  }
});

// ─── CLOCK OUT ─────────────────────────────────────────
router.post('/clock-out', blockMonitoringAdmin, async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'No active employee record linked to your account.' });

    const today = new Date().toISOString().split('T')[0];
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2 AND clock_in IS NOT NULL',
      [employeeId, today]
    );
    if (attendance.rows.length === 0) {
      return res.status(400).json({ error: 'Not clocked in today.' });
    }

    const row = attendance.rows[0];
    if (row.clock_out) {
      return res.status(400).json({ error: 'Already clocked out today.' });
    }

    // End any active break first
    const activeBreak = await pool.query(
      `SELECT * FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type LIKE '%_start'
         AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type LIKE '%_end' AND type NOT LIKE '%_start')
       ORDER BY id DESC LIMIT 1`,
      [employeeId, today]
    );
    let breakMinutesToAdd = 0;
    // Simplified: just count break durations from time_logs for today
    const breakLogs = await pool.query(
      `SELECT type, timestamp FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type IN ('tea_1_start','tea_1_end','tea_2_start','tea_2_end','lunch_start','lunch_end')
       ORDER BY id`,
      [employeeId, today]
    );
     let tea1Min = 0, tea2Min = 0, lunchMin = 0;
     const breakStarts = {};
     for (const log of breakLogs.rows) {
       if (log.type.endsWith('_start')) {
         breakStarts[log.type.replace('_start', '')] = new Date(log.timestamp);
       } else if (log.type.endsWith('_end')) {
         const key = log.type.replace('_end', '');
         if (breakStarts[key]) {
           const diff = Math.min((new Date(log.timestamp) - breakStarts[key]) / 60000, key === 'lunch' ? LUNCH_DURATION : TEA_DURATION);
           if (key === 'tea_1') tea1Min += diff;
           else if (key === 'tea_2') tea2Min += diff;
           else if (key === 'lunch') lunchMin += diff;
           delete breakStarts[key];
         }
       }
     }
     // Handle any still-active break at clock-out time
     if (activeBreak.rows.length > 0) {
       const ab = activeBreak.rows[0];
       const key = ab.type.replace('_start', '');
       const diff = Math.min((new Date() - new Date(ab.timestamp)) / 60000, key === 'lunch' ? LUNCH_DURATION : TEA_DURATION);
       if (key === 'tea_1') tea1Min += diff;
       else if (key === 'tea_2') tea2Min += diff;
       else if (key === 'lunch') lunchMin += diff;
      await pool.query(
        `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, NOW(), $3)`,
        [employeeId, key === 'tea_1' ? 'tea_1_end' : key === 'tea_2' ? 'tea_2_end' : 'lunch_end', today]
      );
    }

    // Calculate idle minutes
    const idleRows = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(duration_minutes, EXTRACT(EPOCH FROM (COALESCE(idle_end, NOW()) - idle_start)) / 60)), 0) as total_idle
       FROM idle_events WHERE employee_id = $1 AND date = $2`,
      [employeeId, today]
    );
    const idleMin = Math.round(parseFloat(idleRows.rows[0].total_idle) || 0);

    // Close any open idle events
    await pool.query(
      `UPDATE idle_events SET idle_end = NOW(), duration_minutes = EXTRACT(EPOCH FROM (NOW() - idle_start)) / 60
       WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL`,
      [employeeId, today]
    );

    const now = new Date();
    const totalBreakMin = Math.round(tea1Min + tea2Min + lunchMin);
    const rawWorkMin = (now - new Date(row.clock_in)) / 60000;
    const workMin = Math.max(0, Math.round(rawWorkMin - totalBreakMin - idleMin));

    const result = await pool.query(
      `UPDATE attendance SET
         clock_out = $1, status = 'present',
         total_work_minutes = $2,
         tea_1_minutes = $3, tea_2_minutes = $4, lunch_minutes = $5,
         idle_minutes = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [now, workMin, Math.round(tea1Min), Math.round(tea2Min), Math.round(lunchMin), idleMin, row.id]
    );

    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, 'clock_out', $2, $3)`,
      [employeeId, now, today]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('clock-out error:', err.message);
    res.status(500).json({ error: 'Failed to clock out.' });
  }
});

// ─── START BREAK ───────────────────────────────────────
router.post('/break/start', blockMonitoringAdmin, async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'No active employee record linked to your account.' });

    const { break_type } = req.body; // 'tea_1', 'tea_2', 'lunch'
    if (!['tea_1', 'tea_2', 'lunch'].includes(break_type)) {
      return res.status(400).json({ error: 'Invalid break type. Use: tea_1, tea_2, or lunch.' });
    }

    const today = new Date().toISOString().split('T')[0];

    // Verify clocked in and not clocked out
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2 AND clock_in IS NOT NULL AND clock_out IS NULL',
      [employeeId, today]
    );
    if (attendance.rows.length === 0) {
      return res.status(400).json({ error: 'Must be clocked in to take a break.' });
    }

    // Check this break type hasn't already been started (without matching end)
    const breakTypeStart = `${break_type}_start`;
    const breakTypeEnd = `${break_type}_end`;

    // Check active break of same type
    const existingStart = await pool.query(
      `SELECT 1 FROM time_logs
       WHERE employee_id = $1 AND date = $2 AND type = $3
         AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type = $4)
       LIMIT 1`,
      [employeeId, today, breakTypeStart, breakTypeEnd]
    );
    if (existingStart.rows.length > 0) {
      return res.status(400).json({ error: `${break_type.replace('_', ' ')} break already started.` });
    }

    // Check no other break is currently active
    const activeBreak = await pool.query(
      `SELECT type FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type IN ('tea_1_start','tea_2_start','lunch_start')
         AND id > COALESCE(
           (SELECT MAX(id) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type IN ('tea_1_end','tea_2_end','lunch_end')),
           0
         )
       LIMIT 1`,
      [employeeId, today]
    );
    if (activeBreak.rows.length > 0) {
      return res.status(400).json({ error: `Already on a break (${activeBreak.rows[0].type.replace('_start', '')}). End it first.` });
    }

    // Enforce order: tea_1 before tea_2
    if (break_type === 'tea_2') {
      const tea1Done = await pool.query(
        `SELECT 1 FROM time_logs WHERE employee_id = $1 AND date = $2 AND type = 'tea_1_end' LIMIT 1`,
        [employeeId, today]
      );
      if (tea1Done.rows.length === 0) {
        return res.status(400).json({ error: 'Complete Tea 1 before starting Tea 2.' });
      }
    }

    // Enforce that each break type is only used once per day
    const alreadyCompleted = await pool.query(
      `SELECT 1 FROM time_logs WHERE employee_id = $1 AND date = $2 AND type = $3 LIMIT 1`,
      [employeeId, today, breakTypeEnd]
    );
    if (alreadyCompleted.rows.length > 0) {
      return res.status(400).json({ error: `${break_type.replace('_', ' ')} break already completed for today.` });
    }

    const now = new Date();
    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $3, $4)`,
      [employeeId, breakTypeStart, now, today]
    );

    const duration = break_type === 'lunch' ? LUNCH_DURATION : TEA_DURATION;
    res.json({ message: `${break_type.replace('_', ' ')} break started (${duration} min)`, break_type, duration });
  } catch (err) {
    console.error('break start error:', err.message);
    res.status(500).json({ error: 'Failed to start break.' });
  }
});

// ─── END BREAK ─────────────────────────────────────────
router.post('/break/end', blockMonitoringAdmin, async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'No active employee record linked to your account.' });

    const today = new Date().toISOString().split('T')[0];

    // Find active break
    const activeBreak = await pool.query(
      `SELECT * FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type IN ('tea_1_start','tea_2_start','lunch_start')
         AND id > COALESCE(
           (SELECT MAX(id) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type IN ('tea_1_end','tea_2_end','lunch_end')),
           0
         )
       ORDER BY id DESC LIMIT 1`,
      [employeeId, today]
    );
    if (activeBreak.rows.length === 0) {
      return res.status(400).json({ error: 'No active break to end.' });
    }

    const ab = activeBreak.rows[0];
    const breakType = ab.type.replace('_start', '');
    const endType = `${breakType}_end`;
    const now = new Date();
    const durationMin = Math.round((now - new Date(ab.timestamp)) / 60000);

    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $3, $4)`,
      [employeeId, endType, now, today]
    );

    res.json({ message: `${breakType.replace('_', ' ')} break ended (${durationMin} min)`, break_type: breakType, duration: durationMin });
  } catch (err) {
    console.error('break end error:', err.message);
    res.status(500).json({ error: 'Failed to end break.' });
  }
});

// ─── IDLE EVENT ────────────────────────────────────────
router.post('/idle', blockMonitoringAdmin, async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'No active employee record linked to your account.' });

    const { action } = req.body; // 'start' or 'end'
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();

    if (action === 'start') {
      const result = await pool.query(
        `INSERT INTO idle_events (employee_id, idle_start, date) VALUES ($1, $2, $3) RETURNING *`,
        [employeeId, now, today]
      );
      return res.json(result.rows[0]);
    } else if (action === 'end') {
      const active = await pool.query(
        `SELECT * FROM idle_events WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL ORDER BY idle_start DESC LIMIT 1`,
        [employeeId, today]
      );
      if (active.rows.length === 0) {
        return res.status(400).json({ error: 'No active idle session.' });
      }
      const idleRow = active.rows[0];
      const durMin = Math.round((now - new Date(idleRow.idle_start)) / 60000);
      const result = await pool.query(
        `UPDATE idle_events SET idle_end = $1, duration_minutes = $2 WHERE id = $3 RETURNING *`,
        [now, durMin, idleRow.id]
      );
      return res.json(result.rows[0]);
    } else {
      return res.status(400).json({ error: 'Invalid action. Use "start" or "end".' });
    }
  } catch (err) {
    console.error('idle error:', err.message);
    res.status(500).json({ error: 'Failed to record idle event.' });
  }
});

// ─── GET TODAY'S STATUS (self) ─────────────────────────
router.get('/today', async (req, res) => {
  try {
    // Try to get employee record for any role (admins like Letasha can clock in too)
    const employeeId = await getEmployeeId(req.user.id);

    // If no employee record, still return success for monitoring admins
    if (!employeeId) {
      const username = (req.user.username || '').toLowerCase();
      const MONITORING_ONLY_ADMINS = ['ayabonga', 'ayabulela'];
      if (MONITORING_ONLY_ADMINS.includes(username)) {
        return res.json({
          attendance: null, activeBreak: null, activeIdle: null,
          completedBreaks: [], totalIdleMinutes: 0, role: 'Admin',
        });
      }
      return res.status(400).json({ error: 'No active employee record linked to your account.' });
    }

    const today = new Date().toISOString().split('T')[0];
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
      [employeeId, today]
    );
    const row = attendance.rows[0] || null;

    // Get active break
    const activeBreak = await pool.query(
      `SELECT type, timestamp FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type IN ('tea_1_start','tea_2_start','lunch_start')
         AND id > COALESCE(
           (SELECT MAX(id) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type IN ('tea_1_end','tea_2_end','lunch_end')),
           0
         )
       ORDER BY id DESC LIMIT 1`,
      [employeeId, today]
    );

    // Get active idle
    const activeIdle = await pool.query(
      `SELECT * FROM idle_events WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL ORDER BY idle_start DESC LIMIT 1`,
      [employeeId, today]
    );

    // Get completed breaks for today
    const breakLogs = await pool.query(
      `SELECT type FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type IN ('tea_1_end','tea_2_end','lunch_end')
       ORDER BY id`,
      [employeeId, today]
    );
    const completedBreaks = breakLogs.rows.map(r => r.type.replace('_end', ''));

    // Get idle total for today
    const idleTotal = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(duration_minutes, 0)), 0) as total_idle
       FROM idle_events WHERE employee_id = $1 AND date = $2`,
      [employeeId, today]
    );

    res.json({
      attendance: row,
      activeBreak: activeBreak.rows[0] ? {
        type: activeBreak.rows[0].type.replace('_start', ''),
        startedAt: activeBreak.rows[0].timestamp,
      } : null,
      activeIdle: activeIdle.rows[0] || null,
      completedBreaks,
      totalIdleMinutes: Math.round(parseFloat(idleTotal.rows[0].total_idle) || 0),
    });
  } catch (err) {
    console.error('today status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch status.' });
  }
});

// ─── GET ATTENDANCE (Admin/HR) ─────────────────────────
router.get('/attendance', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const { employee_id, date, start_date, end_date, status, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    const conditions = [];

    if (employee_id) { params.push(employee_id); conditions.push(`a.employee_id = $${params.length}`); }
    if (date) { params.push(date); conditions.push(`a.date = $${params.length}`); }
    if (start_date) { params.push(start_date); conditions.push(`a.date >= $${params.length}`); }
    if (end_date) { params.push(end_date); conditions.push(`a.date <= $${params.length}`); }
    if (status) { params.push(status); conditions.push(`a.status = $${params.length}`); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = [...params];
    const listParams = [...params, parseInt(limit), offset];

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM attendance a ${where}`, countParams
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(
      `SELECT a.*, e.first_name, e.last_name, f.franchise_name,
              ab.type AS active_break_type, ab.timestamp AS active_break_since,
              ie.id AS active_idle_id
       FROM attendance a
       JOIN employees e ON a.employee_id = e.id
       LEFT JOIN franchises f ON e.franchise_id = f.id
       LEFT JOIN LATERAL (
         SELECT type, timestamp FROM time_logs tl
         WHERE tl.employee_id = a.employee_id
           AND tl.date = a.date
           AND tl.type IN ('tea_1_start','tea_2_start','lunch_start')
           AND tl.id > COALESCE(
             (SELECT MAX(tl2.id) FROM time_logs tl2 WHERE tl2.employee_id = a.employee_id AND tl2.date = a.date AND tl2.type IN ('tea_1_end','tea_2_end','lunch_end')),
             0
           )
         ORDER BY tl.id DESC LIMIT 1
       ) ab ON true
       LEFT JOIN LATERAL (
         SELECT id FROM idle_events ie2
         WHERE ie2.employee_id = a.employee_id
           AND ie2.date = a.date
           AND ie2.idle_end IS NULL
         LIMIT 1
       ) ie ON true
       ${where}
       ORDER BY a.date DESC, e.first_name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      listParams
    );

    res.json({
      data: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    console.error('attendance fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch attendance.' });
  }
});

// ─── MARK ABSENT (Admin/HR) ────────────────────────────
router.post('/absent/run', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Find employees who haven't clocked in today, are active (not terminated),
    // and are not on approved leave today
    const result = await pool.query(`
      INSERT INTO attendance (employee_id, date, status)
      SELECT e.id, $1::date, 'absent'
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
    `, [today]);

    res.json({
      message: `Marked ${result.rows.length} employees as absent for ${today}.`,
      absentCount: result.rows.length,
      date: today,
    });
  } catch (err) {
    console.error('absent marking error:', err.message);
    res.status(500).json({ error: 'Failed to mark absent.' });
  }
});

module.exports = router;