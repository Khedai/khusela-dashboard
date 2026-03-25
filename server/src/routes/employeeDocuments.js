const router = require('express').Router();
const multer = require('multer');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const r2Client = require('../config/r2');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
require('dotenv').config();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error('Only JPG, PNG and PDF allowed.'));
  }
});

router.use(verifyToken);

// ─── GET DOCUMENTS FOR EMPLOYEE ──────────────────────────
router.get('/:employee_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM documents WHERE employee_id = $1 ORDER BY uploaded_at DESC`,
      [req.params.employee_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
});

// ─── UPLOAD EMPLOYEE DOCUMENT ─────────────────────────────
router.post('/upload', requireRole('Admin', 'HR'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided.' });
  const { employee_id, doc_type } = req.body;
  if (!employee_id || !doc_type) return res.status(400).json({ error: 'employee_id and doc_type required.' });

  // Derive extension from validated MIME type, never from user-supplied filename
  const MIME_TO_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'application/pdf': 'pdf' };
  const ext = MIME_TO_EXT[req.file.mimetype] || 'bin';
  const fileKey = `employees/${employee_id}/${doc_type}_${Date.now()}.${ext}`;

  try {
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    const result = await pool.query(
      `INSERT INTO documents (employee_id, doc_type, file_name, r2_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [employee_id, doc_type, req.file.originalname, fileKey, req.user.id]
    );

    res.status(201).json({ message: 'Uploaded successfully.', document: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Upload failed.' });
  }
});

// ─── DOWNLOAD SIGNED URL ──────────────────────────────────
router.get('/download/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    const doc = result.rows[0];
    const url = await getSignedUrl(r2Client, new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME, Key: doc.r2_url,
    }), { expiresIn: 900 });
    res.json({ url, document: doc });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate URL.' });
  }
});

// ─── DELETE DOCUMENT ──────────────────────────────────────
router.delete('/:id', requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
    const doc = result.rows[0];
    await r2Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: doc.r2_url }));
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete.' });
  }
});

module.exports = router;