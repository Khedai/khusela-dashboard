const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// ─── GET MY NOTIFICATIONS (with self-healing leave status sync) ─────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [req.user.id]
    );

    const notifications = result.rows;

    // ── Self-healing: sync leave-request-linked notifications with actual status ──
    // Extract leave request IDs from notification links that mention "Leave Request"
    const leaveIds = [];
    const notifMap = new Map(); // leaveRequestId -> [notification objects]
    for (const n of notifications) {
      const isLeave = /leave/i.test(n.title || '') || /leave/i.test(n.message || '');
      if (!isLeave) continue;
      // Extract leave request ID from link like "/leave?request=123"
      const match = (n.link || '').match(/request=([^&]+)/);
      if (!match) continue;
      const leaveId = match[1];
      leaveIds.push(leaveId);
      if (!notifMap.has(leaveId)) notifMap.set(leaveId, []);
      notifMap.get(leaveId).push(n);
    }

    if (leaveIds.length > 0) {
      try {
        // Batch-fetch current leave request statuses
        const leaveResult = await pool.query(
          `SELECT id, status, leave_type, days_requested, start_date FROM leave_requests WHERE id = ANY($1)`,
          [leaveIds]
        );
        const statusMap = {};
        for (const lr of leaveResult.rows) {
          statusMap[lr.id] = lr;
        }

        // For any notification whose title still says Pending but the leave is finalized, fix it
        const updates = [];
        for (const [leaveId, notifs] of notifMap.entries()) {
          const lr = statusMap[leaveId];
          if (!lr || lr.status === 'Pending') continue; // still pending, nothing to fix
          for (const n of notifs) {
            const titleLower = (n.title || '').toLowerCase();
            if (!titleLower.includes('pending')) continue; // already updated

            const startLabel = (lr.start_date || '').split('T')[0];
            const newTitle = `New Leave Request — ${lr.status}`;
            const newMsg = `${lr.leave_type} leave (${lr.days_requested} day(s) starting ${startLabel}) has been ${lr.status.toLowerCase()}.`;

            // Exact-match UPDATE by notification PK — never fuzzy
            updates.push(
              pool.query(
                `UPDATE notifications SET title = $1, message = $2, is_read = TRUE WHERE id = $3`,
                [newTitle, newMsg, n.id]
              )
            );
            // Also update the in-memory object so the response is already corrected
            n.title = newTitle;
            n.message = newMsg;
            n.is_read = true;
          }
        }
        if (updates.length > 0) {
          await Promise.all(updates);
        }
      } catch (syncErr) {
        // Self-healing failure must never break the API — log and continue
        console.error('Notification self-heal error:', syncErr.message);
      }
    }

    res.json(notifications);
  } catch (err) {
    console.error('GET /notifications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// ─── MARK ALL AS READ ─────────────────────────────────────
router.patch('/read-all', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE user_id = $1',
      [req.user.id]
    );
    res.json({ message: 'All marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update.' });
  }
});

// ─── CLEANUP STALE LEAVE NOTIFICATIONS (Admin only) ──────
// Marks as read any unread leave notifications where the linked
// leave_requests status is no longer 'Pending'.  Run once or
// periodically to clear historic pile-ups.
router.patch('/cleanup-leave-stale', requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE is_read = FALSE
         AND link LIKE '/leave?request=%'
         AND EXISTS (
           SELECT 1 FROM leave_requests lr
           WHERE lr.status <> 'Pending'
             AND '/leave?request=' || lr.id = notifications.link
         )`
    );
    res.json({
      message: `Cleanup complete. ${result.rowCount} stale leave notification(s) marked as read.`
    });
  } catch (err) {
    console.error('Cleanup stale leave notifications error:', err.message);
    res.status(500).json({ error: 'Failed to cleanup stale notifications.' });
  }
});

// ─── MARK ONE AS READ ─────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update.' });
  }
});

module.exports = router;