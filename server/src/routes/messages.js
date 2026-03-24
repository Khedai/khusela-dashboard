const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sanitize } = require('../utils/sanitize');

router.use(verifyToken);
router.use(requireRole('Admin', 'HR'));

// ─── SEARCH USERS BY @USERNAME ────────────────────────────
router.get('/search-users', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.role, f.franchise_name
       FROM users u
       LEFT JOIN franchises f ON u.franchise_id = f.id
       WHERE u.role IN ('Admin', 'HR')
         AND u.is_active = TRUE
         AND u.id != $1
         AND u.username ILIKE $2
       LIMIT 8`,
      [req.user.id, `%${q}%`]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ─── SEND MESSAGE ─────────────────────────────────────────
router.post('/send', async (req, res) => {
  const { recipient_username, subject, body, application_id } = req.body;

  if (!recipient_username || !body) {
    return res.status(400).json({ error: 'Recipient and message body are required.' });
  }

  try {
    // Find recipient
    const recipientResult = await pool.query(
      `SELECT id, username, role FROM users 
       WHERE username = $1 AND role IN ('Admin', 'HR') AND is_active = TRUE`,
      [recipient_username.replace('@', '')]
    );

    if (recipientResult.rows.length === 0) {
      return res.status(404).json({ error: `User @${recipient_username.replace('@', '')} not found or is not HR/Admin.` });
    }

    const recipient = recipientResult.rows[0];

    // Validate application_id belongs to sender's accessible data
    if (application_id) {
      const appCheck = await pool.query(
        'SELECT id FROM applications WHERE id = $1',
        [application_id]
      );
      if (appCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Application not found.' });
      }
    }

    // Insert message
    const result = await pool.query(
      `INSERT INTO messages (sender_id, recipient_id, subject, body, application_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.user.id, recipient.id, sanitize(subject) || null, sanitize(body), application_id || null]
    );

    // Get sender info for notification
    const sender = await pool.query(
      `SELECT u.username, f.franchise_name FROM users u
       LEFT JOIN franchises f ON u.franchise_id = f.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    const senderName = sender.rows[0]?.username || 'Someone';
    const senderFranchise = sender.rows[0]?.franchise_name || '';

    // Notify recipient via notifications
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, link)
       VALUES ($1, $2, $3, $4)`,
      [
        recipient.id,
        `Message from @${senderName}`,
        `${senderName} (${senderFranchise}): ${body.substring(0, 80)}${body.length > 80 ? '...' : ''}`,
        '/inbox'
      ]
    );

    res.status(201).json({ message: 'Message sent.', data: result.rows[0] });
  } catch (err) {
    console.error('Send message error:', err.message, err.stack);
    res.status(500).json({ error: err.message || 'Failed to send message.' });
  }
});

// ─── GET INBOX MESSAGES ───────────────────────────────────
router.get('/inbox', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        m.*,
        u.username AS sender_username,
        f.franchise_name AS sender_franchise,
        c.first_name AS app_client_first,
        c.last_name AS app_client_last
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       LEFT JOIN franchises f ON u.franchise_id = f.id
       LEFT JOIN applications a ON m.application_id = a.id
       LEFT JOIN clients c ON a.client_id = c.id
       WHERE m.recipient_id = $1
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages.' });
  }
});

// ─── GET SENT MESSAGES ────────────────────────────────────
router.get('/sent', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        m.*,
        u.username AS recipient_username,
        f.franchise_name AS recipient_franchise,
        c.first_name AS app_client_first,
        c.last_name AS app_client_last
       FROM messages m
       LEFT JOIN users u ON m.recipient_id = u.id
       LEFT JOIN franchises f ON u.franchise_id = f.id
       LEFT JOIN applications a ON m.application_id = a.id
       LEFT JOIN clients c ON a.client_id = c.id
       WHERE m.sender_id = $1
       ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch sent messages.' });
  }
});

// ─── MARK MESSAGE AS READ ─────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    await pool.query(
      'UPDATE messages SET is_read = TRUE WHERE id = $1 AND recipient_id = $2',
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update.' });
  }
});

// ─── DELETE MESSAGE ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await pool.query(
      `DELETE FROM messages 
       WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
      [req.params.id, req.user.id]
    );
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

module.exports = router;