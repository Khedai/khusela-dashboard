const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sanitize } = require('../utils/sanitize');

router.use(verifyToken);

// ─── GET PENDING COUNT (MUST BE BEFORE /:id) ──────────────
router.get('/pending-count', async (req, res) => {
  try {
    const params = [];
    let where = `WHERE a.status IN ('Submitted', 'Pending Docs')`;

    if (req.user.role === 'Consultant') {
      const empResult = await pool.query(
        'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
        [req.user.id]
      );
      const empId = empResult.rows[0]?.id;
      if (empId) {
        where += ` AND a.consultant_id = $1`;
        params.push(empId);
      }
    } else if (req.user.role === 'HR') {
      where += ` AND a.franchise_id = $1`;
      params.push(req.user.franchise_id);
    }

    const result = await pool.query(
      `SELECT COUNT(*) FROM applications a ${where}`,
      params
    );
    res.json({ count: parseInt(result.rows[0].count) });
  } catch (err) {
    res.status(500).json({ count: 0 });
  }
});

// ─── GET ALL APPLICATIONS ─────────────────────────────────
router.get('/', verifyToken, async (req, res) => {
  try {
    const { franchise_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let query = `
      SELECT 
        a.id, a.date, a.status,
        a.is_med, a.is_dreview, a.is_drr, a.is_3in1, a.is_rent_to,
        a.gross_salary, a.nett_salary, a.total_expenses,
        a.mandate_status, a.mandate_signed, a.mandate_signed_date,
        a.franchise_id,
        c.first_name, c.last_name, c.cell, c.id_number,
        e.first_name AS consultant_first, e.last_name AS consultant_last,
        f.franchise_name
      FROM applications a
      LEFT JOIN clients c ON a.client_id = c.id
      LEFT JOIN employees e ON a.consultant_id = e.id
      LEFT JOIN franchises f ON a.franchise_id = f.id
    `;

    const params = [];
    const conditions = [];

    if (franchise_id) {
      conditions.push(`a.franchise_id = $${params.length + 1}`);
      params.push(franchise_id);
    } else if (req.user.role === 'Consultant') {
      // Consultants always locked to their franchise — no override
      conditions.push(`a.franchise_id = $${params.length + 1}`);
      params.push(req.user.franchise_id || null);
    }

    // Never show unassigned applications to non-admins
    if (req.user.role !== 'Admin') {
      conditions.push(`a.franchise_id IS NOT NULL`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    // Count query for total
    const countQuery = query
      .replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) FROM')
      .replace(/ORDER BY.*$/, '');
    const countResult = await pool.query(countQuery.split('ORDER')[0], params);
    const total = parseInt(countResult.rows[0].count);

    query += ` ORDER BY a.created_at DESC`;

    // Add pagination to main query
    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), offset);

    const result = await pool.query(query, params);
    res.json({
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch applications.' });
  }
});

// ─── GET NOTES FOR AN APPLICATION (MUST BE BEFORE /:id) ───
router.get('/:id/notes', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        n.id, n.note, n.created_at,
        u.username, u.role,
        f.franchise_name
       FROM application_notes n
       LEFT JOIN users u ON n.user_id = u.id
       LEFT JOIN franchises f ON u.franchise_id = f.id
       WHERE n.application_id = $1
       ORDER BY n.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to fetch notes.' });
  }
});

// ─── POST NEW NOTE ────────────────────────────────────────
router.post('/:id/notes', async (req, res) => {
  const { note } = req.body;
  if (!note?.trim()) {
    return res.status(400).json({ error: 'Note cannot be empty.' });
  }

  try {
    // Verify access — consultants can only note their own applications
    if (req.user.role === 'Consultant') {
      const empResult = await pool.query(
        'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
        [req.user.id]
      );
      const empId = empResult.rows[0]?.id;
      const appCheck = await pool.query(
        'SELECT consultant_id FROM applications WHERE id = $1',
        [req.params.id]
      );
      if (appCheck.rows[0]?.consultant_id !== empId) {
        return res.status(403).json({ error: 'You can only add notes to your own applications.' });
      }
    }

    // HR can only note own franchise applications
    if (req.user.role === 'HR') {
      const appCheck = await pool.query(
        'SELECT franchise_id FROM applications WHERE id = $1',
        [req.params.id]
      );
      if (appCheck.rows[0]?.franchise_id !== req.user.franchise_id) {
        return res.status(403).json({ error: 'You can only add notes to applications in your franchise.' });
      }
    }

    const result = await pool.query(
      `INSERT INTO application_notes (application_id, user_id, note)
       VALUES ($1, $2, $3)
       RETURNING id, note, created_at`,
      [req.params.id, req.user.id, note.trim()]
    );

    // Return with user info attached
    res.status(201).json({
      ...result.rows[0],
      username: req.user.username,
      role: req.user.role,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to add note.' });
  }
});

// ─── DELETE NOTE — ONLY AUTHOR OR ADMIN ──────────────────
router.delete('/:id/notes/:noteId', async (req, res) => {
  try {
    const noteCheck = await pool.query(
      'SELECT user_id FROM application_notes WHERE id = $1',
      [req.params.noteId]
    );
    if (noteCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found.' });
    }
    if (req.user.role !== 'Admin' && noteCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only delete your own notes.' });
    }
    await pool.query('DELETE FROM application_notes WHERE id = $1', [req.params.noteId]);
    res.json({ message: 'Note deleted.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note.' });
  }
});

// ─── GET SINGLE APPLICATION WITH CREDITORS ────────────────
router.get('/:id', requireRole('Admin', 'HR', 'Consultant'), async (req, res) => {
  try {
    // Get application + client + consultant info
    const appResult = await pool.query(
      `SELECT 
        a.*,
        c.first_name, c.last_name, c.cell, c.whatsapp,
        c.email AS client_email, c.id_number AS client_id_number,
        c.address AS client_address, c.employer, c.marital_status AS client_marital_status,
        e.first_name AS consultant_first, e.last_name AS consultant_last
       FROM applications a
       LEFT JOIN clients c ON a.client_id = c.id
       LEFT JOIN employees e ON a.consultant_id = e.id
       WHERE a.id = $1`,
      [req.params.id]
    );

    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    // Get all creditors for this application
    const creditorsResult = await pool.query(
      `SELECT * FROM application_creditors 
       WHERE application_id = $1 
       ORDER BY created_at ASC`,
      [req.params.id]
    );

    res.json({
      application: appResult.rows[0],
      creditors: creditorsResult.rows
    });

  } catch (err) {
    console.error('Get application error:', err.message);
    res.status(500).json({ error: 'Failed to fetch application.' });
  }
});

// ─── GET APPLICATION LOGS ─────────────────────────────────
router.get('/:id/logs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.username
       FROM application_logs l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE l.application_id = $1
       ORDER BY l.created_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logs.' });
  }
});


// ─── CREATE APPLICATION (with client + creditors) ─────────
router.post('/', requireRole('Admin', 'HR', 'Consultant'), async (req, res) => {
  const {
    // Client info
    client_first_name, client_last_name, client_id_number,
    client_cell, client_whatsapp, client_email, client_address,
    client_employer, client_marital_status,

    // Application meta
    consultant_id, franchise_id, ext_number, branch,

    // Application type
    is_med, is_dreview, is_drr, is_3in1, is_rent_to, other_type,

    // Financials
    gross_salary, nett_salary, spouse_salary,
    exp_groceries, exp_rent_bond, exp_transport,
    exp_school_fees, exp_rates, exp_water_elec,

    // Banking
    bank, account_no, account_type, debt_review_status,

    // Debit order
    debit_order_date, debit_order_amount,

    // Docs checklist
    has_id_copy, has_payslip, has_proof_of_address,

    // Status
    status,

    // Creditors array: [{ creditor_name, account_num_ref, balance_of_acc, amount }]
    creditors
  } = req.body;

  if (!client_first_name || !client_last_name) {
    return res.status(400).json({ error: 'Client first and last name are required.' });
  }

  // Franchise required if neither provided on body nor available on user
  if (!req.body.franchise_id && !req.user?.franchise_id) {
    return res.status(400).json({ error: 'Franchise is required. Please select a franchise.' });
  }

  let finalConsultantId = consultant_id || null;
  if (req.user?.role === 'Consultant' && !finalConsultantId) {
    const empResult = await pool.query(
      'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
      [req.user.id]
    );
    if (empResult.rows.length > 0) {
      finalConsultantId = empResult.rows[0].id;
    }
  }

  // Auto-assign franchise from logged-in user if not provided
  const franchiseId = req.body.franchise_id || req.user?.franchise_id || null;

  // Use a transaction so if creditors fail, the whole thing rolls back
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert client (create if new, reuse if ID number already exists)
    let clientId;
    if (client_id_number) {
      const existing = await client.query(
        'SELECT id FROM clients WHERE id_number = $1',
        [client_id_number]
      );
      if (existing.rows.length > 0) {
        clientId = existing.rows[0].id;
      }
    }

    if (!clientId) {
      const clientResult = await client.query(
        `INSERT INTO clients 
          (first_name, last_name, id_number, cell, whatsapp, email, address, employer, marital_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id`,
        [
          sanitize(client_first_name), sanitize(client_last_name), sanitize(client_id_number) || null,
          sanitize(client_cell), sanitize(client_whatsapp), sanitize(client_email), sanitize(client_address),
          sanitize(client_employer), sanitize(client_marital_status)
        ]
      );
      clientId = clientResult.rows[0].id;
    }

    // 2. Create the application
    const appResult = await client.query(
      `INSERT INTO applications (
        client_id, consultant_id, franchise_id,
        ext_number, branch,
        is_med, is_dreview, is_drr, is_3in1, is_rent_to, other_type,
        gross_salary, nett_salary, spouse_salary,
        exp_groceries, exp_rent_bond, exp_transport,
        exp_school_fees, exp_rates, exp_water_elec,
        bank, account_no, account_type, debt_review_status,
        debit_order_date, debit_order_amount,
        has_id_copy, has_payslip, has_proof_of_address,
        status
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
        $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,
        $27,$28,$29,$30
      ) RETURNING *`,
      [
        clientId, finalConsultantId, franchiseId,
        sanitize(ext_number), sanitize(branch),
        is_med || false, is_dreview || false, is_drr || false,
        is_3in1 || false, is_rent_to || false, sanitize(other_type) || null,
        gross_salary || null, nett_salary || null, spouse_salary || null,
        exp_groceries || null, exp_rent_bond || null, exp_transport || null,
        exp_school_fees || null, exp_rates || null, exp_water_elec || null,
        sanitize(bank), sanitize(account_no), sanitize(account_type), sanitize(debt_review_status),
        sanitize(debit_order_date), debit_order_amount || null,
        has_id_copy || false, has_payslip || false, has_proof_of_address || false,
        sanitize(status) || 'Draft'
      ]
    );

    const applicationId = appResult.rows[0].id;

    // 3. Insert creditors if provided
    if (creditors && creditors.length > 0) {
      for (const creditor of creditors) {
        await client.query(
          `INSERT INTO application_creditors
            (application_id, creditor_name, account_num_ref, balance_of_acc, amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [
            applicationId,
            sanitize(creditor.creditor_name) || null,
            sanitize(creditor.account_num_ref) || null,
            creditor.balance_of_acc || null,
            creditor.amount || null
          ]
        );
      }
    }

    await client.query('COMMIT');

    res.status(201).json({
      message: 'Application created successfully.',
      application_id: applicationId,
      client_id: clientId
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create application error:', err.message);
    res.status(500).json({ error: 'Failed to create application.' });
  } finally {
    client.release();
  }
});

// ─── EDIT APPLICATION DETAILS ─────────────────────────────
router.patch('/:id', async (req, res) => {
  const b = req.body;

  // Accept both aliased names (from GET /:id) and direct names
  const first_name     = b.first_name     ?? b.client_first_name ?? null;
  const last_name      = b.last_name      ?? b.client_last_name  ?? null;
  const id_number      = b.id_number      ?? b.client_id_number  ?? null;
  const cell           = b.cell           ?? b.client_cell       ?? null;
  const whatsapp       = b.whatsapp       ?? b.client_whatsapp   ?? null;
  const email          = b.email          ?? b.client_email      ?? null;
  const address        = b.address        ?? b.client_address    ?? null;
  const employer       = b.employer       ?? b.client_employer   ?? null;
  const marital_status = b.marital_status ?? b.client_marital_status ?? null;

  try {
    // HR can only edit own franchise applications
    if (req.user.role === 'HR') {
      const appCheck = await pool.query(
        'SELECT franchise_id FROM applications WHERE id = $1',
        [req.params.id]
      );
      if (appCheck.rows[0]?.franchise_id !== req.user.franchise_id) {
        return res.status(403).json({ error: 'You can only edit applications in your franchise.' });
      }
    }

    // Consultants can only edit their own applications
    if (req.user.role === 'Consultant') {
      const empResult = await pool.query(
        'SELECT id FROM employees WHERE user_id = $1 LIMIT 1',
        [req.user.id]
      );
      const empId = empResult.rows[0]?.id;
      const appCheck = await pool.query(
        'SELECT consultant_id FROM applications WHERE id = $1',
        [req.params.id]
      );
      if (appCheck.rows[0]?.consultant_id !== empId) {
        return res.status(403).json({ error: 'You can only edit your own applications.' });
      }
    }

    // Update client record first
    const appData = await pool.query(
      'SELECT client_id FROM applications WHERE id = $1',
      [req.params.id]
    );
    const clientId = appData.rows[0]?.client_id;

    if (clientId) {
      await pool.query(
        `UPDATE clients SET
          first_name = $1, last_name = $2, id_number = $3,
          cell = $4, whatsapp = $5, email = $6,
          address = $7, employer = $8, marital_status = $9
         WHERE id = $10`,
        [sanitize(first_name), sanitize(last_name), sanitize(id_number), sanitize(cell), sanitize(whatsapp),
         sanitize(email), sanitize(address), sanitize(employer), sanitize(marital_status), clientId]
      );
    }

    // Update application (total_expenses is a generated column — do NOT set it)
    const result = await pool.query(
      `UPDATE applications SET
        date = $1, franchise_id = $2, consultant_id = $3,
        is_med = $4, is_dreview = $5, is_drr = $6,
        is_3in1 = $7, is_rent_to = $8,
        gross_salary = $9, nett_salary = $10, spouse_salary = $11,
        exp_groceries = $12, exp_rent_bond = $13, exp_transport = $14,
        exp_school_fees = $15, exp_rates = $16, exp_water_elec = $17,
        bank = $18, account_no = $19, account_type = $20,
        debit_order_date = $21, debit_order_amount = $22,
        debt_review_status = $23
       WHERE id = $24 RETURNING *`,
      [
        sanitize(b.date), b.franchise_id, b.consultant_id,
        b.is_med, b.is_dreview, b.is_drr, b.is_3in1, b.is_rent_to,
        b.gross_salary, b.nett_salary, b.spouse_salary,
        b.exp_groceries, b.exp_rent_bond, b.exp_transport,
        b.exp_school_fees, b.exp_rates, b.exp_water_elec,
        sanitize(b.bank), sanitize(b.account_no), sanitize(b.account_type),
        sanitize(b.debit_order_date), b.debit_order_amount, sanitize(b.debt_review_status),
        req.params.id
      ]
    );

    // Log the edit
    await pool.query(
      `INSERT INTO application_logs (application_id, user_id, action, note)
       VALUES ($1, $2, 'edited', $3)`,
      [req.params.id, req.user.id, 'Application details updated']
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to update application.' });
  }
});

// ─── UPDATE APPLICATION STATUS ────────────────────────────
router.patch('/:id/status', requireRole('Admin', 'HR'), async (req, res) => {
  const { status, note } = req.body;

  try {
    // Mandate check
    if (status === 'Approved') {
      const mandateCheck = await pool.query(
        'SELECT mandate_status FROM applications WHERE id = $1',
        [req.params.id]
      );
      if (mandateCheck.rows[0]?.mandate_status !== 'Verified') {
        return res.status(400).json({
          error: 'Cannot approve until mandate is verified.'
        });
      }
    }

    // Get current status before update
    const current = await pool.query(
      'SELECT status FROM applications WHERE id = $1',
      [req.params.id]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }
    const oldStatus = current.rows[0].status;

    // Update status
    const result = await pool.query(
      `UPDATE applications SET status = $1 WHERE id = $2 RETURNING *`,
      [status, req.params.id]
    );

    // Log the change
    await pool.query(
      `INSERT INTO application_logs (application_id, user_id, action, old_value, new_value, note)
       VALUES ($1, $2, 'status_change', $3, $4, $5)`,
      [req.params.id, req.user.id, oldStatus, status, note || null]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to update status.' });
  }
});

// ─── MANDATE STATUS UPDATE (Admin/HR only) ───────────────
router.patch('/:id/mandate', verifyToken, requireRole('Admin', 'HR'), async (req, res) => {
  const { mandate_status } = req.body;
  const validStatuses = ['Pending', 'Uploaded', 'Verified'];

  if (!validStatuses.includes(mandate_status)) {
    return res.status(400).json({ error: 'Invalid mandate status.' });
  }

  try {
    const result = await pool.query(
      `UPDATE applications 
       SET mandate_status = $1,
           mandate_signed = $2,
           mandate_signed_date = $3
       WHERE id = $4 RETURNING *`,
      [
        mandate_status,
        mandate_status === 'Verified',
        mandate_status === 'Verified' ? new Date() : null,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: 'Failed to update mandate status.' });
  }
});

// ─── DELETE APPLICATION ───────────────────────────────────
router.delete('/:id', requireRole('Admin'), async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM applications WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    res.json({ message: 'Application deleted.' });
  } catch (err) {
    console.error('Delete application error:', err.message);
    res.status(500).json({ error: 'Failed to delete application.' });
  }
});

module.exports = router;