const router = require('express').Router();
const multer = require('multer');
const multerS3 = require('multer-s3');
const { DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const s3Client = require('../config/r2');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
require('dotenv').config();

const ALLOWED_MIME_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

const MAX_SIZE = 20 * 1024 * 1024; // 20MB

const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: process.env.R2_BUCKET_NAME,
    key: (req, file, cb) => {
      const ext = ALLOWED_MIME_TYPES[file.mimetype] || 'bin';
      const key = `docs/${Date.now()}-${Math.random().toString(36).substring(2)}.${ext}`;
      cb(null, key);
    },
  }),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES[file.mimetype]) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed. Accepted: JPG, PNG, PDF, DOC, DOCX, XLS, XLSX`));
    }
  },
});

const ALLOWED_DOC_TYPES = [
  'ID Copy',
  'Payslip', 
  'Proof of Address',
  'Bank Statement',
  'Signed Mandate',
  'Other',
];

// ─── UPLOAD FILE ─────────────────────────────────────────
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided.' });
  }

  const { application_id, employee_id, doc_type } = req.body;

  if (!doc_type) {
    return res.status(400).json({ error: 'doc_type is required.' });
  }

  if (!ALLOWED_DOC_TYPES.includes(doc_type)) {
    return res.status(400).json({ error: `Invalid doc_type. Allowed: ${ALLOWED_DOC_TYPES.join(', ')}` });
  }

  try {
    // multerS3 already uploads the object; we only persist its key
    const fileKey = req.file.key;

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
router.get('/application/:application_id', verifyToken, async (req, res) => {
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
// Accepts either a document id (for backwards compat) or a raw R2 object key.
router.get('/download/:keyOrId', verifyToken, async (req, res) => {
  try {
    const { keyOrId } = req.params;

    const result = await pool.query('SELECT * FROM documents WHERE id = $1', [keyOrId]);
    const doc = result.rows[0];

    // Generate a signed URL valid for 15 minutes
    const objectKey = doc?.file_key || doc?.r2_url || doc?.file_key;
    const signedUrl = await getSignedUrl(
      s3Client,
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: objectKey || keyOrId,
      }),
      { expiresIn: 900 }
    );

    // If requested with a doc id, return the document too (existing frontend behavior).
    if (doc) {
      return res.json({ url: signedUrl, document: doc });
    }

    return res.json({ url: signedUrl });
  } catch (err) {
    console.error('Download URL error:', err.message);
    res.status(500).json({ error: 'Failed to generate download URL.' });
  }
});

// ─── DELETE DOCUMENT ──────────────────────────────────────
router.delete('/:id', verifyToken, async (req, res) => {
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
    const objectKey = doc?.file_key || doc?.r2_url;
    await s3Client.send(new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: objectKey,
    }));

    // Delete from database
    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);

    res.json({ message: 'Document deleted.' });
  } catch (err) {
    console.error('Delete document error:', err.message);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

// ─── LEAVE REQUEST DOCUMENTS ─────────────────────────────

// Upload doc for a leave request
router.post('/leave/:leaveId', verifyToken, upload.single('file'), async (req, res) => {
  try {
    const { leaveId } = req.params;
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    // Verify access — consultant can only upload to their own leave request
    if (req.user.role === 'Consultant') {
      const empResult = await pool.query('SELECT id FROM employees WHERE user_id = $1 LIMIT 1', [
        req.user.id,
      ]);
      const empId = empResult.rows[0]?.id;
      const leaveCheck = await pool.query('SELECT employee_id FROM leave_requests WHERE id = $1', [
        leaveId,
      ]);
      if (leaveCheck.rows[0]?.employee_id !== empId) {
        return res
          .status(403)
          .json({ error: 'You can only upload documents for your own leave requests.' });
      }
    }

    const fileKey = req.file.key;
    const result = await pool.query(
      `INSERT INTO documents (leave_request_id, doc_type, file_name, r2_url, uploaded_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *, r2_url as file_key`,
      [
        leaveId,
        req.body.doc_type || 'Supporting Document',
        req.file.originalname,
        fileKey,
        req.user.id,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message || 'Upload failed.' });
  }
});

// List docs for a leave request
router.get('/leave/:leaveId', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *, r2_url as file_key FROM documents
       WHERE leave_request_id = $1
       ORDER BY uploaded_at DESC`,
      [req.params.leaveId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
});

// ─── EMPLOYEE FOLDER DOCUMENTS ───────────────────────────

const FOLDER_CATEGORIES = ['Identity', 'Employment Contract', 'Banking', 'Medical', 'Leave', 'Disciplinary', 'Other'];

// Upload to employee folder
router.post(
  '/employee-folder/:employeeId',
  verifyToken,
  requireRole('Admin', 'HR'),
  upload.single('file'),
  async (req, res) => {
    try {
      const { employeeId } = req.params;
      if (!req.file) return res.status(400).json({ error: 'No file provided.' });
      const { folder_category, doc_type } = req.body;

      // HR can only upload to own franchise employees
      if (req.user.role === 'HR') {
        const empCheck = await pool.query('SELECT franchise_id FROM employees WHERE id = $1', [
          employeeId,
        ]);
        if (empCheck.rows[0]?.franchise_id !== req.user.franchise_id) {
          return res
            .status(403)
            .json({ error: 'You can only upload documents for employees in your franchise.' });
        }
      }

      if (!FOLDER_CATEGORIES.includes(folder_category)) {
        return res.status(400).json({ error: 'Invalid folder category.' });
      }

      const fileKey = req.file.key;
      const result = await pool.query(
        `INSERT INTO documents (employee_id, doc_type, file_name, r2_url, uploaded_by, folder_category)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *, r2_url as file_key`,
        [
          employeeId,
          doc_type || folder_category,
          req.file.originalname,
          fileKey,
          req.user.id,
          folder_category,
        ]
      );

      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: err.message || 'Upload failed.' });
    }
  }
);

// List employee folder docs — grouped by category
router.get('/employee-folder/:employeeId', verifyToken, requireRole('Admin', 'HR'), async (req, res) => {
  try {
    // HR franchise check
    if (req.user.role === 'HR') {
      const empCheck = await pool.query('SELECT franchise_id FROM employees WHERE id = $1', [
        req.params.employeeId,
      ]);
      if (empCheck.rows[0]?.franchise_id !== req.user.franchise_id) {
        return res.status(403).json({ error: 'Access denied.' });
      }
    }

    const result = await pool.query(
      `SELECT *, r2_url as file_key FROM documents
       WHERE employee_id = $1
       AND leave_request_id IS NULL
       ORDER BY folder_category, uploaded_at DESC`,
      [req.params.employeeId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents.' });
  }
});

// Delete any document — Admin/HR only
router.delete('/folder/:docId', verifyToken, requireRole('Admin', 'HR'), async (req, res) => {
  try {
    const doc = await pool.query('SELECT * FROM documents WHERE id = $1', [req.params.docId]);
    if (doc.rows.length === 0) return res.status(404).json({ error: 'Document not found.' });

    // Delete from R2
    const objectKey = doc.rows[0].file_key || doc.rows[0].r2_url;
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: objectKey,
      })
    );

    await pool.query('DELETE FROM documents WHERE id = $1', [req.params.docId]);
    res.json({ message: 'Deleted.' });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to delete document.' });
  }
});

module.exports = router;