const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

// ─── PUBLIC: GET ALL WITH COUNTS ─────────────────────────
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        f.id, f.franchise_name, f.location,
        COUNT(DISTINCT e.id) FILTER (WHERE e.franchise_id IS NOT NULL) AS user_count,
        COUNT(DISTINCT a.id) FILTER (WHERE a.franchise_id IS NOT NULL) AS application_count
      FROM franchises f
      LEFT JOIN employees e ON e.franchise_id = f.id
      LEFT JOIN applications a ON a.franchise_id = f.id
      GROUP BY f.id
      ORDER BY f.franchise_name ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch franchises.' });
  }
});

// ─── PUBLIC: GET SINGLE ───────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, franchise_name, location FROM franchises WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch franchise.' });
  }
});

// ─── ADMIN ONLY: CREATE ───────────────────────────────────
router.post('/', verifyToken, requireRole('Admin'), async (req, res) => {
  const { franchise_name, location } = req.body;
  if (!franchise_name) return res.status(400).json({ error: 'Franchise name is required.' });
  try {
    const result = await pool.query(
      `INSERT INTO franchises (franchise_name, location) VALUES ($1, $2) RETURNING *`,
      [franchise_name, location || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create franchise.' });
  }
});

// ─── ADMIN ONLY: UPDATE ───────────────────────────────────
router.put('/:id', verifyToken, requireRole('Admin'), async (req, res) => {
  const { franchise_name, location } = req.body;
  try {
    const result = await pool.query(
      `UPDATE franchises SET franchise_name = $1, location = $2 WHERE id = $3 RETURNING *`,
      [franchise_name, location, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update franchise.' });
  }
});

// ─── ADMIN ONLY: DELETE ───────────────────────────────────
router.delete('/:id', verifyToken, requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM franchises WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    res.json({ message: 'Franchise deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete franchise.' });
  }
});

module.exports = router;