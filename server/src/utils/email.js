const nodemailer = require('nodemailer');

// Create transporter lazily so missing config just disables email silently
let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: parseInt(SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true', // true = SSL/465, false = STARTTLS/587
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    tls: { rejectUnauthorized: false } // allow self-signed certs on company mail
  });

  return _transporter;
}

/**
 * Send an email. Fire-and-forget — logs errors but never throws.
 * @param {string|string[]} to
 * @param {string} subject
 * @param {string} html
 */
async function sendEmail(to, subject, html) {
  const transporter = getTransporter();
  if (!transporter) {
    // SMTP not configured — skip silently
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  try {
    await transporter.sendMail({ from, to, subject, html });
  } catch (err) {
    console.error('[email] Failed to send email:', err.message);
  }
}

// ─── Templates ───────────────────────────────────────────────

function leaveRequestEmail({ empName, leaveType, days, startDate, endDate, reason }) {
  return {
    subject: `[Leave Request] ${empName} — ${leaveType} (${days} day${days !== 1 ? 's' : ''})`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1d4ed8;">New Leave Request Submitted</h2>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <tr><td style="padding:8px;font-weight:bold;width:180px;">Employee</td><td style="padding:8px;">${empName}</td></tr>
          <tr style="background:#f3f4f6;"><td style="padding:8px;font-weight:bold;">Leave Type</td><td style="padding:8px;">${leaveType}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">Days Requested</td><td style="padding:8px;">${days}</td></tr>
          <tr style="background:#f3f4f6;"><td style="padding:8px;font-weight:bold;">From</td><td style="padding:8px;">${startDate}</td></tr>
          <tr><td style="padding:8px;font-weight:bold;">To</td><td style="padding:8px;">${endDate}</td></tr>
          ${reason ? `<tr style="background:#f3f4f6;"><td style="padding:8px;font-weight:bold;">Reason</td><td style="padding:8px;">${reason}</td></tr>` : ''}
        </table>
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">
          Please log in to the Khusela HR dashboard to approve or reject this request.
        </p>
      </div>
    `
  };
}

function leaveDecisionEmail({ empName, leaveType, days, status, rejectionReason }) {
  const approved = status === 'Approved';
  const color = approved ? '#16a34a' : '#dc2626';
  return {
    subject: `[Leave ${status}] Your ${leaveType} leave request has been ${status.toLowerCase()}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:${color};">Leave Request ${status}</h2>
        <p>Hi ${empName},</p>
        <p>Your <strong>${leaveType}</strong> leave request for <strong>${days} day${days !== 1 ? 's' : ''}</strong> has been <strong style="color:${color};">${status.toLowerCase()}</strong>.</p>
        ${!approved && rejectionReason ? `<p><strong>Reason:</strong> ${rejectionReason}</p>` : ''}
        <p style="margin-top:24px;color:#6b7280;font-size:13px;">
          Log in to the Khusela HR dashboard to view your leave history.
        </p>
      </div>
    `
  };
}

module.exports = { sendEmail, leaveRequestEmail, leaveDecisionEmail };
