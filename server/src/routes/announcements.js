const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sanitize } = require('../utils/sanitize');

router.use(verifyToken);

// ─── GET ALL ANNOUNCEMENTS ─────────────────────────────────
router.get('/', async (req, res) => {
  const { franchise_id } = req.query;
  try {
    let query = `
      SELECT a.*, u.username AS author_name, f.franchise_name
      FROM announcements a
      LEFT JOIN users u ON a.author_id = u.id
      LEFT JOIN franchises f ON a.franchise_id = f.id
    `;
    const params = [];
    const conditions = [];

    // Admin sees all; non-admins only see their franchise
    if (req.user.role === 'Admin') {
      if (franchise_id) {
        conditions.push(`a.franchise_id = $${params.length + 1}`);
        params.push(franchise_id);
      }
    } else {
      conditions.push(`a.franchise_id = $${params.length + 1}`);
      params.push(req.user.franchise_id || null);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` ORDER BY a.is_pinned DESC, a.created_at DESC LIMIT 50`;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('GET /announcements error:', err.message);
    res.status(500).json({ error: 'Failed to fetch announcements.' });
  }
});

// ─── GET SINGLE ANNOUNCEMENT ───────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT a.*, u.username AS author_name, f.franchise_name
       FROM announcements a
       LEFT JOIN users u ON a.author_id = u.id
       LEFT JOIN franchises f ON a.franchise_id = f.id
       WHERE a.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }
    const ann = result.rows[0];

    // Non-admin may only view their own franchise's announcements
    if (req.user.role !== 'Admin' && ann.franchise_id !== req.user.franchise_id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json(ann);
  } catch (err) {
    console.error('GET /announcements/:id error:', err.message);
    res.status(500).json({ error: 'Failed to fetch announcement.' });
  }
});

// ─── CREATE ANNOUNCEMENT ───────────────────────────────────
router.post('/', requireRole('Admin', 'HR'), async (req, res) => {
  const { franchise_id, title, message, is_pinned } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  // HR can only post to their own franchise
  const effectiveFranchiseId = req.user.role === 'Admin'
    ? (franchise_id || null)
    : req.user.franchise_id;

  if (!effectiveFranchiseId) {
    return res.status(400).json({ error: 'Franchise is required.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO announcements (franchise_id, author_id, title, message, is_pinned)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [effectiveFranchiseId, req.user.id, sanitize(title.trim()), message.trim(), is_pinned === true]
    );

    // Notify all users in this franchise
    const usersRes = await pool.query(
      `SELECT id FROM users WHERE franchise_id = $1 AND is_active = TRUE`,
      [effectiveFranchiseId]
    );

    const insertNotifs = usersRes.rows.map(u =>
      pool.query(
        `INSERT INTO notifications (user_id, title, message, link, is_read)
         VALUES ($1, $2, $3, $4, FALSE)`,
        [
          u.id,
          'New Announcement',
          `${title.trim()} — ${message.trim().substring(0, 100)}${message.trim().length > 100 ? '...' : ''}`,
          '/announcements',
        ]
      )
    );
    await Promise.all(insertNotifs);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST /announcements error:', err.message);
    res.status(500).json({ error: 'Failed to create announcement.' });
  }
});

// ─── UPDATE ANNOUNCEMENT ───────────────────────────────────
router.put('/:id', requireRole('Admin', 'HR'), async (req, res) => {
  const { title, message, is_pinned, franchise_id } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ error: 'Title is required.' });
  }
  if (!message?.trim()) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  try {
    // Check ownership / franchise
    const check = await pool.query(
      'SELECT author_id, franchise_id FROM announcements WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }

    // HR can only edit their own announcements; Admin can edit any
    if (req.user.role !== 'Admin' && check.rows[0].author_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own announcements.' });
    }

    const effectiveFranchiseId = req.user.role === 'Admin'
      ? (franchise_id || check.rows[0].franchise_id)
      : req.user.franchise_id;

    const result = await pool.query(
      `UPDATE announcements
       SET title = $1, message = $2, is_pinned = $3, franchise_id = $4
       WHERE id = $5
       RETURNING *`,
      [sanitize(title.trim()), message.trim(), is_pinned === true, effectiveFranchiseId, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('PUT /announcements/:id error:', err.message);
    res.status(500).json({ error: 'Failed to update announcement.' });
  }
});

// ─── TOGGLE PIN ────────────────────────────────────────────
router.patch('/:id/pin', requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE announcements SET is_pinned = NOT is_pinned WHERE id = $1 RETURNING *`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('PATCH /announcements/:id/pin error:', err.message);
    res.status(500).json({ error: 'Failed to toggle pin.' });
  }
});

// ─── DELETE ANNOUNCEMENT ───────────────────────────────────
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM announcements WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Announcement not found.' });
    }
    res.json({ message: 'Announcement deleted.' });
  } catch (err) {
    console.error('DELETE /announcements/:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete announcement.' });
  }
});

module.exports = router;