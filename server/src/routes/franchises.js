const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// ─── GET ALL FRANCHISES ───────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.*, 
              COUNT(DISTINCT u.id) AS user_count,
              COUNT(DISTINCT a.id) AS application_count
       FROM franchises f
       LEFT JOIN users u ON u.franchise_id = f.id
       LEFT JOIN applications a ON a.franchise_id = f.id
       GROUP BY f.id
       ORDER BY f.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get franchises error:', err.message);
    res.status(500).json({ error: 'Failed to fetch franchises.' });
  }
});

// ─── CREATE FRANCHISE ─────────────────────────────────────
router.post('/', requireRole('Admin'), async (req, res) => {
  const { franchise_name, location } = req.body;
  if (!franchise_name) {
    return res.status(400).json({ error: 'Franchise name is required.' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO franchises (franchise_name, location)
       VALUES ($1, $2) RETURNING *`,
      [franchise_name, location || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Create franchise error:', err.message);
    res.status(500).json({ error: 'Failed to create franchise.' });
  }
});

// ─── UPDATE FRANCHISE ─────────────────────────────────────
router.put('/:id', requireRole('Admin'), async (req, res) => {
  const { franchise_name, location } = req.body;
  try {
    const result = await pool.query(
      `UPDATE franchises SET franchise_name = $1, location = $2
       WHERE id = $3 RETURNING *`,
      [franchise_name, location, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Franchise not found.' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update franchise error:', err.message);
    res.status(500).json({ error: 'Failed to update franchise.' });
  }
});

// ─── DELETE FRANCHISE ─────────────────────────────────────
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM franchises WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Franchise not found.' });
    }
    res.json({ message: 'Franchise deleted.' });
  } catch (err) {
    console.error('Delete franchise error:', err.message);
    res.status(500).json({ error: 'Failed to delete franchise.' });
  }
});

module.exports = router;