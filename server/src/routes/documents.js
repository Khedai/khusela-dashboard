const router = require('express').Router();
const multer = require('multer');
const { PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const r2Client = require('../config/r2');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/auth');
require('dotenv').config();

// Store file in memory temporarily before sending to R2
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG and PDF files are allowed.'));
    }
  }
});

router.use(verifyToken);

// ─── UPLOAD FILE ─────────────────────────────────────────
router.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided.' });
  }

  const { application_id, employee_id, doc_type } = req.body;

  if (!doc_type) {
    return res.status(400).json({ error: 'doc_type is required.' });
  }

  // Build a unique file key for R2
  const ext = req.file.originalname.split('.').pop();
  const folder = application_id ? `applications/${application_id}` : `employees/${employee_id}`;
  const fileKey = `${folder}/${doc_type}_${Date.now()}.${ext}`;

  try {
    // Upload to R2
    await r2Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    // Save record in documents table
    const result = await pool.query(
      `INSERT INTO documents 
        (application_id, employee_id, doc_type, file_name, r2_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        application_id || null,
        employee_id || null,
        doc_type,
        req.file.originalname,
        fileKey,
        req.user.id
      ]
    );

    res.status(201).json({
      message: 'File uploaded successfully.',
      document: result.rows[0]
    });

  } catch (err) {
    console.error('Upload error:', err.message);
    res.status(500).json({ error: 'File upload failed.' });
  }
});

// ─── GET DOCUMENTS FOR AN APPLICATION ────────────────────
router.get('/application/:application_id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM documents 
       WHERE application_id = $1 
       ORDER BY uploaded_at DESC`,
      [req.params.application_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get documents error:', err.message);
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
});

// ─── GET SIGNED DOWNLOAD URL ──────────────────────────────
router.get('/download/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = result.rows[0];

    // Generate a signed URL valid for 15 minutes
    const signedUrl = await getSignedUrl(
      r2Client,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: doc.r2_url,
      }),
      { expiresIn: 900 }
    );

    res.json({ url: signedUrl, document: doc });
  } catch (err) {
    console.error('Download URL error:', err.message);
    res.status(500).json({ error: 'Failed to generate download URL.' });
  }
});

// ─── DELETE DOCUMENT ──────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM documents WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found.' });
    }

    const doc = result.rows[0];

    // Delete from R2
    await r2Client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: doc.r2_url,
    }));

    // Delete from database
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

    res.json({ message: 'Document deleted.' });
  } catch (err) {
    console.error('Delete document error:', err.message);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

module.exports = router;