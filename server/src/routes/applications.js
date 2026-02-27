const router = require('express').Router();
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/auth');

router.use(verifyToken);

// ─── GET ALL APPLICATIONS ─────────────────────────────────
router.get('/', requireRole('Admin', 'HR', 'Consultant'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        a.id, a.date, a.status, a.time_of_call,
        a.is_med, a.is_dreview, a.is_drr, a.is_3in1,
        a.gross_salary, a.nett_salary, a.total_expenses,
        a.debit_order_amount, a.debit_order_date,
        c.first_name, c.last_name, c.cell, c.id_number,
        e.first_name AS consultant_first, e.last_name AS consultant_last,
        f.franchise_name
       FROM applications a
       LEFT JOIN clients c ON a.client_id = c.id
       LEFT JOIN employees e ON a.consultant_id = e.id
       LEFT JOIN franchises f ON a.franchise_id = f.id
       ORDER BY a.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Get applications error:', err.message);
    res.status(500).json({ error: 'Failed to fetch applications.' });
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
          client_first_name, client_last_name, client_id_number || null,
          client_cell, client_whatsapp, client_email, client_address,
          client_employer, client_marital_status
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
        clientId, consultant_id || null, franchise_id || null,
        ext_number, branch,
        is_med || false, is_dreview || false, is_drr || false,
        is_3in1 || false, is_rent_to || false, other_type || null,
        gross_salary || null, nett_salary || null, spouse_salary || null,
        exp_groceries || null, exp_rent_bond || null, exp_transport || null,
        exp_school_fees || null, exp_rates || null, exp_water_elec || null,
        bank, account_no, account_type, debt_review_status,
        debit_order_date, debit_order_amount || null,
        has_id_copy || false, has_payslip || false, has_proof_of_address || false,
        status || 'Draft'
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
            creditor.creditor_name || null,
            creditor.account_num_ref || null,
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

// ─── UPDATE APPLICATION STATUS ────────────────────────────
router.patch('/:id/status', requireRole('Admin', 'HR'), async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['Draft', 'Submitted', 'Pending Docs', 'Approved', 'Rejected'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status value.' });
  }

  try {
    const result = await pool.query(
      `UPDATE applications SET status = $1, updated_at = NOW()
       WHERE id = $2 RETURNING id, status`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found.' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Update status error:', err.message);
    res.status(500).json({ error: 'Failed to update status.' });
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