const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { reverseGeocode } = require('../utils/geocode');

router.use(verifyToken);

// ─── Break durations (minutes) ─────────────────────────
const TEA_DURATION = 15;
const LUNCH_DURATION_WEEKDAY = 30;
const LUNCH_DURATION_FRIDAY = 60;
const LATE_CLOCK_IN_HOUR = 8; // 8:00 AM threshold for late marking
const LATE_CLOCK_IN_MIN = 30; // Clock-in after 08:30 = late
const TEA1_WINDOW_CLOSE_HOUR = 10; // Tea 1 only available 10:00-10:30 SA time
const TEA1_WINDOW_CLOSE_MIN = 30;
const SA_TIMEZONE_OFFSET = 2; // SAST = UTC+2
const GRACE_MINUTES = 6; // 6-minute padding: clock-in recorded 6 min earlier, timer starts at 00:06:00

function getLunchDuration(date) {
  // Friday (5 in JavaScript getDay()) = 60 min, else 30 min
  const d = date || new Date();
  return d.getDay() === 5 ? LUNCH_DURATION_FRIDAY : LUNCH_DURATION_WEEKDAY;
}

function isLateClockIn(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h > LATE_CLOCK_IN_HOUR) || (h === LATE_CLOCK_IN_HOUR && m >= LATE_CLOCK_IN_MIN);
}

function isTea1WindowClosed() {
  // Check current SA time (UTC+2)
  const now = new Date();
  const saHour = (now.getUTCHours() + SA_TIMEZONE_OFFSET + 24) % 24;
  const saMin = now.getUTCMinutes();
  return (saHour > TEA1_WINDOW_CLOSE_HOUR) || (saHour === TEA1_WINDOW_CLOSE_HOUR && saMin >= TEA1_WINDOW_CLOSE_MIN);
}

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
    const paddedTime = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000); // 6 min earlier
    const clockInStatus = isLateClockIn(paddedTime) ? 'late' : 'present';
    const result = await pool.query(
      `INSERT INTO attendance (employee_id, date, status, clock_in, latitude, longitude)
       VALUES ($1, $2, $6, $3, $4, $5)
       ON CONFLICT (employee_id, date) DO UPDATE
       SET status = $6, clock_in = $3, clock_out = NULL, total_work_minutes = NULL,
           latitude = COALESCE($4, attendance.latitude), longitude = COALESCE($5, attendance.longitude)
       RETURNING *`,
      [employeeId, today, paddedTime, latitude || null, longitude || null, clockInStatus]
    );

    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date)
       VALUES ($1, 'clock_in', $2, $3)`,
      [employeeId, paddedTime, today]
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

    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND clock_in IS NOT NULL AND clock_out IS NULL ORDER BY date DESC LIMIT 1',
      [employeeId]
    );
    if (attendance.rows.length === 0) {
      return res.status(400).json({ error: 'Not clocked in today.' });
    }

    const row = attendance.rows[0];
    const shiftDateStr = new Date(row.date).toISOString().split('T')[0];

    // End any active break first
    const activeBreak = await pool.query(
      `SELECT * FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type LIKE '%_start'
         AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type LIKE '%_end' AND type NOT LIKE '%_start')
       ORDER BY id DESC LIMIT 1`,
      [employeeId, shiftDateStr]
    );
    let breakMinutesToAdd = 0;
    // Simplified: just count break durations from time_logs for today
    const breakLogs = await pool.query(
      `SELECT type, timestamp FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type IN ('tea_1_start','tea_1_end','tea_2_start','tea_2_end','lunch_start','lunch_end')
       ORDER BY id`,
      [employeeId, shiftDateStr]
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
     // Handle any still-active break at clock-out time
     if (activeBreak.rows.length > 0) {
       const ab = activeBreak.rows[0];
       const key = ab.type.replace('_start', '');
       const diff = (new Date() - new Date(ab.timestamp)) / 60000;
       if (key === 'tea_1') tea1Min += diff;
       else if (key === 'tea_2') tea2Min += diff;
       else if (key === 'lunch') lunchMin += diff;
      await pool.query(
        `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, NOW(), $3)`,
        [employeeId, key === 'tea_1' ? 'tea_1_end' : key === 'tea_2' ? 'tea_2_end' : 'lunch_end', shiftDateStr]
      );
    }

    // Calculate idle minutes
    const idleRows = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(duration_minutes, EXTRACT(EPOCH FROM (COALESCE(idle_end, NOW()) - idle_start)) / 60)), 0) as total_idle
       FROM idle_events WHERE employee_id = $1 AND date = $2`,
      [employeeId, shiftDateStr]
    );
    const idleMin = Math.round(parseFloat(idleRows.rows[0].total_idle) || 0);

    // Close any open idle events
    await pool.query(
      `UPDATE idle_events SET idle_end = NOW(), duration_minutes = EXTRACT(EPOCH FROM (NOW() - idle_start)) / 60
       WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL`,
      [employeeId, shiftDateStr]
    );

    const now = new Date();
    const totalBreakMin = Math.round(tea1Min + tea2Min + lunchMin);
    const rawWorkMin = (now - new Date(row.clock_in)) / 60000;
    const workMin = Math.max(0, Math.round(rawWorkMin - totalBreakMin - idleMin));

    const result = await pool.query(
      `UPDATE attendance SET
         clock_out = $1, status = CASE WHEN $8 = 'late' THEN 'late' ELSE 'present' END,
         total_work_minutes = $2,
         tea_1_minutes = $3, tea_2_minutes = $4, lunch_minutes = $5,
         idle_minutes = $6, updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [now, workMin, Math.round(tea1Min), Math.round(tea2Min), Math.round(lunchMin), idleMin, row.id, row.status]
    );

    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, 'clock_out', $2, $3)`,
      [employeeId, now, shiftDateStr]
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

    // Verify clocked in and not clocked out
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND clock_in IS NOT NULL AND clock_out IS NULL ORDER BY date DESC LIMIT 1',
      [employeeId]
    );
    if (attendance.rows.length === 0) {
      return res.status(400).json({ error: 'Must be clocked in to take a break.' });
    }

    const row = attendance.rows[0];
    const shiftDateStr = new Date(row.date).toISOString().split('T')[0];

    // Check this break type hasn't already been started (without matching end)
    const breakTypeStart = `${break_type}_start`;
    const breakTypeEnd = `${break_type}_end`;

    // Check active break of same type
    const existingStart = await pool.query(
      `SELECT 1 FROM time_logs
       WHERE employee_id = $1 AND date = $2 AND type = $3
         AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type = $4)
       LIMIT 1`,
      [employeeId, shiftDateStr, breakTypeStart, breakTypeEnd]
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
      [employeeId, shiftDateStr]
    );
    if (activeBreak.rows.length > 0) {
      return res.status(400).json({ error: `Already on a break (${activeBreak.rows[0].type.replace('_start', '')}). End it first.` });
    }

    // Tea 1 window: must start between 10:00-10:30 SA time
    if (break_type === 'tea_1' && isTea1WindowClosed()) {
      return res.status(400).json({ error: 'Tea 1 window has closed (10:00-10:30 SA time). You can take Lunch instead.' });
    }

    // Enforce order: tea_2 only after lunch (tea_1 no longer required before lunch for late arrivals)
    if (break_type === 'tea_2') {
      const lunchDone = await pool.query(
        `SELECT 1 FROM time_logs WHERE employee_id = $1 AND date = $2 AND type = 'lunch_end' LIMIT 1`,
        [employeeId, shiftDateStr]
      );
      if (lunchDone.rows.length === 0) {
        return res.status(400).json({ error: 'Complete Lunch before starting Tea 2.' });
      }
    }

    // Enforce that each break type is only used once per day
    const alreadyCompleted = await pool.query(
      `SELECT 1 FROM time_logs WHERE employee_id = $1 AND date = $2 AND type = $3 LIMIT 1`,
      [employeeId, shiftDateStr, breakTypeEnd]
    );
    if (alreadyCompleted.rows.length > 0) {
      return res.status(400).json({ error: `${break_type.replace('_', ' ')} break already completed for today.` });
    }

    const now = new Date();
    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $3, $4)`,
      [employeeId, breakTypeStart, now, shiftDateStr]
    );

    const lunchDuration = getLunchDuration(new Date(shiftDateStr));
    const duration = break_type === 'lunch' ? lunchDuration : TEA_DURATION;
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

    // Verify clocked in and not clocked out
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND clock_in IS NOT NULL AND clock_out IS NULL ORDER BY date DESC LIMIT 1',
      [employeeId]
    );
    if (attendance.rows.length === 0) {
      return res.status(400).json({ error: 'Not clocked in.' });
    }

    const row = attendance.rows[0];
    const shiftDateStr = new Date(row.date).toISOString().split('T')[0];

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
      [employeeId, shiftDateStr]
    );
    if (activeBreak.rows.length === 0) {
      return res.status(400).json({ error: 'No active break to end.' });
    }

    const ab = activeBreak.rows[0];
    const breakType = ab.type.replace('_start', '');
    const endType = `${breakType}_end`;
    const now = new Date();
    const rawDuration = (now - new Date(ab.timestamp)) / 60000;
    const durationMin = Math.round(rawDuration);

    await pool.query(
      `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $3, $4)`,
      [employeeId, endType, now, shiftDateStr]
    );

    // Update attendance with this break's duration immediately for near-real-time history
    const column = breakType === 'tea_1' ? 'tea_1_minutes' : breakType === 'tea_2' ? 'tea_2_minutes' : 'lunch_minutes';
    await pool.query(
      `UPDATE attendance SET ${column} = COALESCE(${column}, 0) + $1, updated_at = NOW()
       WHERE employee_id = $2 AND date = $3`,
      [durationMin, employeeId, shiftDateStr]
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

    // Verify clocked in and not clocked out
    const attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND clock_in IS NOT NULL AND clock_out IS NULL ORDER BY date DESC LIMIT 1',
      [employeeId]
    );
    if (attendance.rows.length === 0) {
      return res.status(400).json({ error: 'Must be clocked in to record idle event.' });
    }

    const row = attendance.rows[0];
    const shiftDateStr = new Date(row.date).toISOString().split('T')[0];

    const { action } = req.body; // 'start' or 'end'
    const now = new Date();

    if (action === 'start') {
      const result = await pool.query(
        `INSERT INTO idle_events (employee_id, idle_start, date) VALUES ($1, $2, $3) RETURNING *`,
        [employeeId, now, shiftDateStr]
      );
      return res.json(result.rows[0]);
    } else if (action === 'end') {
      const active = await pool.query(
        `SELECT * FROM idle_events WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL ORDER BY idle_start DESC LIMIT 1`,
        [employeeId, shiftDateStr]
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

    // First check if there is an active shift (clocked in but not clocked out)
    let attendance = await pool.query(
      'SELECT * FROM attendance WHERE employee_id = $1 AND clock_in IS NOT NULL AND clock_out IS NULL ORDER BY date DESC LIMIT 1',
      [employeeId]
    );
    let row = attendance.rows[0] || null;
    let shiftDateStr;

    if (row) {
      shiftDateStr = new Date(row.date).toISOString().split('T')[0];
      const todayStr = new Date().toISOString().split('T')[0];

      // If the active shift is from yesterday (or earlier), auto-close it at 17:10
      if (shiftDateStr < todayStr) {
        const closeTime = new Date(`${shiftDateStr}T17:10:00`);
        console.log(`[today] Auto-closing stale shift for employee ${employeeId}: date=${shiftDateStr}, closing at ${closeTime.toISOString()}`);

        // End any active break
        const activeBreak = await pool.query(
          `SELECT * FROM time_logs
           WHERE employee_id = $1 AND date = $2 AND type LIKE '%_start'
             AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type LIKE '%_end')
           ORDER BY id DESC LIMIT 1`,
          [employeeId, shiftDateStr]
        );
        if (activeBreak.rows.length > 0) {
          const ab = activeBreak.rows[0];
          const key = ab.type.replace('_start', '');
          await pool.query(
            `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $4, $3)`,
            [employeeId, key === 'tea_1' ? 'tea_1_end' : key === 'tea_2' ? 'tea_2_end' : 'lunch_end', shiftDateStr, closeTime]
          );
        }

        // Close open idle events
        await pool.query(
          `UPDATE idle_events SET idle_end = $3, duration_minutes = EXTRACT(EPOCH FROM ($3 - idle_start)) / 60
           WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL`,
          [employeeId, shiftDateStr, closeTime]
        );

        // Calculate break minutes
        const breakLogs = await pool.query(
          `SELECT type, timestamp FROM time_logs
           WHERE employee_id = $1 AND date = $2
             AND type IN ('tea_1_start','tea_1_end','tea_2_start','tea_2_end','lunch_start','lunch_end')
           ORDER BY id`,
          [employeeId, shiftDateStr]
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

        const idleRows = await pool.query(
          `SELECT COALESCE(SUM(COALESCE(duration_minutes, 0)), 0) as total_idle
           FROM idle_events WHERE employee_id = $1 AND date = $2`,
          [employeeId, shiftDateStr]
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
             idle_minutes = $6, notes = 'Auto clocked out (stale shift detected)',
             updated_at = NOW()
           WHERE id = $7`,
          [closeTime, workMin, Math.round(tea1Min), Math.round(tea2Min), Math.round(lunchMin), idleMin, row.id, row.status]
        );

        await pool.query(
          `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, 'clock_out', $2, $3)`,
          [employeeId, closeTime, shiftDateStr]
        );

        // Now fall through to the "no active shift" case
        row = null;
      }
    }

    if (row) {
      // Active shift from today — use it directly (shiftDateStr already set)
    } else {
      // No active today shift — check today's record
      shiftDateStr = new Date().toISOString().split('T')[0];
      const todayRes = await pool.query(
        'SELECT * FROM attendance WHERE employee_id = $1 AND date = $2',
        [employeeId, shiftDateStr]
      );
      row = todayRes.rows[0] || null;
    }

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
      [employeeId, shiftDateStr]
    );

    // Get active idle
    const activeIdle = await pool.query(
      `SELECT * FROM idle_events WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL ORDER BY idle_start DESC LIMIT 1`,
      [employeeId, shiftDateStr]
    );

    // Get completed breaks for today
    const breakLogs = await pool.query(
      `SELECT type FROM time_logs
       WHERE employee_id = $1 AND date = $2
         AND type IN ('tea_1_end','tea_2_end','lunch_end')
       ORDER BY id`,
      [employeeId, shiftDateStr]
    );
    const completedBreaks = breakLogs.rows.map(r => r.type.replace('_end', ''));

    // Get idle total for today
    const idleTotal = await pool.query(
      `SELECT COALESCE(SUM(COALESCE(duration_minutes, 0)), 0) as total_idle
       FROM idle_events WHERE employee_id = $1 AND date = $2`,
      [employeeId, shiftDateStr]
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

    // Reverse geocode unique locations — wait up to 3s for results
    const rows = result.rows;
    const seen = new Set();
    const geocodeTasks = [];
    for (const row of rows) {
      if (row.latitude != null && row.longitude != null) {
        const key = `${row.latitude.toFixed(4)}|${row.longitude.toFixed(4)}`;
        if (!seen.has(key)) {
          seen.add(key);
          geocodeTasks.push(
            reverseGeocode(row.latitude, row.longitude).then(name => {
              // Attach name to all rows with these coords
              for (const r of rows) {
                if (r.latitude != null && r.longitude != null &&
                    r.latitude.toFixed(4) === row.latitude.toFixed(4) &&
                    r.longitude.toFixed(4) === row.longitude.toFixed(4)) {
                  r.location_name = name;
                }
              }
            }).catch(() => {})
          );
        }
      }
    }
    // Wait up to 3 seconds for geocode results, then send response
    if (geocodeTasks.length > 0) {
      await Promise.race([
        Promise.all(geocodeTasks),
        new Promise(r => setTimeout(r, 3000)),
      ]).catch(() => {});
    }

    res.json({
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    console.error('attendance fetch error:', err.message);
    res.status(500).json({ error: 'Failed to fetch attendance.' });
  }
});

// ─── EDIT ATTENDANCE (Admin only — manual adjustments) ──
const ATTENDANCE_EDITABLE = ['clock_in', 'tea_1_minutes', 'tea_2_minutes', 'lunch_minutes'];
router.patch('/attendance/:id', requireRole('Admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const key of ATTENDANCE_EDITABLE) {
      if (updates[key] !== undefined) {
        setClauses.push(`${key} = $${idx}`);
        values.push(updates[key]);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update. Allowed: clock_in, tea_1_minutes, tea_2_minutes, lunch_minutes.' });
    }

    // Add updated_at
    setClauses.push(`updated_at = NOW()`);

    // Add id as last param
    values.push(id);

    const result = await pool.query(
      `UPDATE attendance SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Attendance record not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('edit attendance error:', err.message);
    res.status(500).json({ error: 'Failed to update attendance.' });
  }
});

// ─── GET MY HISTORY (self) ─────────────────────────────
router.get('/my-history', async (req, res) => {
  try {
    const employeeId = await getEmployeeId(req.user.id);
    if (!employeeId) return res.status(400).json({ error: 'No active employee record linked to your account.' });

    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const countRes = await pool.query(
      'SELECT COUNT(*) FROM attendance WHERE employee_id = $1',
      [employeeId]
    );
    const total = parseInt(countRes.rows[0].count);

    const result = await pool.query(
      `SELECT a.*, f.franchise_name
       FROM attendance a
       LEFT JOIN employees e ON a.employee_id = e.id
       LEFT JOIN franchises f ON e.franchise_id = f.id
       WHERE a.employee_id = $1
       ORDER BY a.date DESC
       LIMIT $2 OFFSET $3`,
      [employeeId, parseInt(limit), offset]
    );

    res.json({
      data: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    console.error('my-history error:', err.message);
    res.status(500).json({ error: 'Failed to fetch history.' });
  }
});

// ─── MARK ABSENT + AUTO-CLOCK-OUT (Admin/HR) ───────────
router.post('/absent/run', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const today = req.body.date || new Date().toISOString().split('T')[0];
    const isCurrentDay = today === new Date().toISOString().split('T')[0];
    let now = new Date();
    if (!isCurrentDay) {
      now = new Date(`${today}T17:00:00`);
      if (isNaN(now.getTime())) {
        now = new Date();
      }
    }

    // ── Step 1: Mark employees who never clocked in as absent ──
    const absentResult = await pool.query(`
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

    // ── Step 2: Auto-clock-out employees who clocked in but never clocked out ──
    // Find all attendance rows with clock_in but no clock_out for today
    const stragglers = await pool.query(
      `SELECT * FROM attendance WHERE date = $1 AND clock_in IS NOT NULL AND clock_out IS NULL`,
      [today]
    );

    let autoClockedOut = 0;
    for (const row of stragglers.rows) {
      const employeeId = row.employee_id;

      // End any active break
      const activeBreak = await pool.query(
        `SELECT * FROM time_logs
         WHERE employee_id = $1 AND date = $2 AND type LIKE '%_start'
           AND id > (SELECT COALESCE(MAX(id), 0) FROM time_logs WHERE employee_id = $1 AND date = $2 AND type LIKE '%_end')
         ORDER BY id DESC LIMIT 1`,
        [employeeId, today]
      );
      if (activeBreak.rows.length > 0) {
        const ab = activeBreak.rows[0];
        const key = ab.type.replace('_start', '');
        await pool.query(
          `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, $2, $4, $3)`,
          [employeeId, key === 'tea_1' ? 'tea_1_end' : key === 'tea_2' ? 'tea_2_end' : 'lunch_end', today, now]
        );
      }

      // Close open idle events
      await pool.query(
        `UPDATE idle_events SET idle_end = $3, duration_minutes = EXTRACT(EPOCH FROM ($3 - idle_start)) / 60
         WHERE employee_id = $1 AND date = $2 AND idle_end IS NULL`,
        [employeeId, today, now]
      );

      // Calculate break minutes (uncapped)
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
        [employeeId, today]
      );
      const idleMin = Math.round(parseFloat(idleRows.rows[0].total_idle) || 0);

      const totalBreakMin = Math.round(tea1Min + tea2Min + lunchMin);
      const rawWorkMin = (now - new Date(row.clock_in)) / 60000;
      const workMin = Math.max(0, Math.round(rawWorkMin - totalBreakMin - idleMin));

      await pool.query(
        `UPDATE attendance SET
           clock_out = $1, status = $8,
           total_work_minutes = $2,
           tea_1_minutes = $3, tea_2_minutes = $4, lunch_minutes = $5,
           idle_minutes = $6, notes = 'Auto clocked out by admin',
           updated_at = NOW()
         WHERE id = $7`,
        [now, workMin, Math.round(tea1Min), Math.round(tea2Min), Math.round(lunchMin), idleMin, row.id, row.status]
      );

      await pool.query(
        `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, 'clock_out', $2, $3)`,
        [employeeId, now, today]
      );
      autoClockedOut++;
    }

    res.json({
      message: `Marked ${absentResult.rows.length} absent and auto-clocked out ${autoClockedOut} for ${today}.`,
      absentCount: absentResult.rows.length,
      autoClockedOut,
      date: today,
    });
  } catch (err) {
    console.error('absent marking error:', err.message);
    res.status(500).json({ error: 'Failed to mark absent.' });
  }
});

// ─── CLEANUP PAST OPEN SHIFTS (Admin/HR) ────────────
// Auto-clock-out all employees who forgot to clock out on past dates
router.post('/cleanup', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Find all open shifts on dates before today
    const stragglers = await pool.query(
      `SELECT * FROM attendance WHERE date < $1 AND clock_in IS NOT NULL AND clock_out IS NULL ORDER BY date`,
      [today]
    );

    if (stragglers.rows.length === 0) {
      return res.json({ message: 'No open past shifts to clean up.', cleaned: 0, details: [] });
    }

    const details = [];
    for (const row of stragglers.rows) {
      const employeeId = row.employee_id;
      const shiftDate = new Date(row.date).toISOString().split('T')[0];
      const closeTime = new Date(`${shiftDate}T17:00:00`); // 5 PM on shift date

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
        `UPDATE idle_events SET idle_end = $3, duration_minutes = EXTRACT(EPOCH FROM ($3::timestamp - idle_start)) / 60
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

      // Get employee name for the report
      const empRes = await pool.query('SELECT first_name, last_name FROM employees WHERE id = $1', [employeeId]);
      const empName = empRes.rows[0] ? `${empRes.rows[0].first_name} ${empRes.rows[0].last_name}` : `ID ${employeeId}`;

      await pool.query(
        `UPDATE attendance SET
           clock_out = $1, status = $8,
           total_work_minutes = $2,
           tea_1_minutes = $3, tea_2_minutes = $4, lunch_minutes = $5,
           idle_minutes = $6, notes = 'Auto clocked out (cleanup)',
           updated_at = NOW()
         WHERE id = $7`,
        [closeTime, workMin, Math.round(tea1Min), Math.round(tea2Min), Math.round(lunchMin), idleMin, row.id, row.status]
      );

      await pool.query(
        `INSERT INTO time_logs (employee_id, type, timestamp, date) VALUES ($1, 'clock_out', $2, $3)`,
        [employeeId, closeTime, shiftDate]
      );

      details.push({ employee: empName, date: shiftDate, clockIn: row.clock_in, clockOut: closeTime, workMinutes: workMin });
    }

    res.json({
      message: `Cleaned up ${stragglers.rows.length} open shift(s) across past dates.`,
      cleaned: stragglers.rows.length,
      details,
    });
  } catch (err) {
    console.error('cleanup error:', err.message);
    res.status(500).json({ error: 'Failed to clean up past shifts.' });
  }
});

module.exports = router;
