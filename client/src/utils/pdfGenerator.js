import { jsPDF } from 'jspdf';

const BRAND_BLUE = [37, 99, 235];
const DARK = [15, 23, 42];
const MID = [100, 116, 139];
const LIGHT = [241, 245, 249];
const WHITE = [255, 255, 255];
const LINE = [226, 232, 240];

// ─── SHARED HELPERS ───────────────────────────────────────

function addHeader(doc, title, subtitle) {
  // Blue top bar
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, 210, 22, 'F');

  // K logo box
  doc.setFillColor(255, 255, 255, 0.2);
  doc.roundedRect(8, 4, 14, 14, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('K', 15, 13.5, { align: 'center' });

  // Company name
  doc.setFontSize(13);
  doc.text('Khusela', 26, 13);

  // Title on right
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 202, 9, { align: 'right' });
  if (subtitle) {
    doc.setFontSize(8);
    doc.text(subtitle, 202, 15, { align: 'right' });
  }

  // Generated date
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-ZA')}`, 202, 20, { align: 'right' });
}

function addSectionTitle(doc, title, y) {
  doc.setFillColor(...LIGHT);
  doc.rect(8, y, 194, 7, 'F');
  doc.setTextColor(...BRAND_BLUE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 12, y + 5);
  return y + 10;
}

function addField(doc, label, value, x, y, width = 85) {
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x, y);

  // Underline / box for the value
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(x, y + 1, x + width, y + 1);

  doc.setTextColor(...DARK);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', value ? 'bold' : 'normal');
  doc.text(value || (value === '' ? '' : ''), x, y - 0.5);

  return y + 8;
}

function addEmptyField(doc, label, x, y, width = 85) {
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x, y);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(x, y + 5, x + width, y + 5);
  return y + 11;
}

function addCheckbox(doc, label, checked, x, y) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.4);
  doc.rect(x, y - 3.5, 4, 4);
  if (checked) {
    doc.setTextColor(...BRAND_BLUE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('✓', x + 0.5, y);
  }
  doc.setTextColor(...DARK);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x + 6, y);
}

function addFooter(doc, pageNum) {
  const pageHeight = doc.internal.pageSize.height;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(8, pageHeight - 10, 202, pageHeight - 10);
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.text('Khusela Dashboard — Confidential', 8, pageHeight - 5);
  doc.text(`Page ${pageNum}`, 202, pageHeight - 5, { align: 'right' });
}

// ─── EMPLOYEE FORM ────────────────────────────────────────

export function generateEmployeeForm(employee) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const e = employee || {};
  const isTemplate = !employee;

  addHeader(doc, 'Employee Record', isTemplate ? 'Template' : `${e.first_name || ''} ${e.last_name || ''}`);

  let y = 30;
  const F = (label, val, x, yPos, w) =>
    isTemplate ? addEmptyField(doc, label, x, yPos, w) : addField(doc, label, val, x, yPos, w);

  // Personal
  y = addSectionTitle(doc, 'Personal Information', y);
  let leftY = y, rightY = y;
  leftY = F('Title', e.title, 12, leftY, 30);
  rightY = F('Marital Status', e.marital_status, 110, rightY, 85);
  leftY = F('First Name', e.first_name, 12, leftY, 85);
  rightY = F('Last Name', e.last_name, 110, rightY, 85);
  leftY = F('ID Number', e.id_number, 12, leftY, 85);
  rightY = F('Tax Number', e.tax_number, 110, rightY, 85);
  leftY = F('Date of Birth', e.birth_date?.split('T')[0], 12, leftY, 85);
  rightY = F('Email', e.email, 110, rightY, 85);
  leftY = F('Home Phone', e.home_phone, 12, leftY, 85);
  rightY = F('Alternate Phone', e.alternate_phone, 110, rightY, 85);
  y = Math.max(leftY, rightY) + 4;

  // Address
  y = addSectionTitle(doc, 'Address', y);
  y = F('Street Address', e.address_street, 12, y, 185);
  leftY = y; rightY = y;
  leftY = F('City', e.address_city, 12, leftY, 85);
  rightY = F('Postal Code', e.postal_code, 110, rightY, 85);
  y = Math.max(leftY, rightY) + 4;

  // Health
  y = addSectionTitle(doc, 'Health', y);
  y = F('Allergies / Health Concerns', e.allergies_health_concerns, 12, y, 185);
  y += 4;

  // Emergency Contact
  y = addSectionTitle(doc, 'Emergency Contact', y);
  leftY = y; rightY = y;
  leftY = F('Title', e.ec_title, 12, leftY, 30);
  rightY = F('Relationship', e.ec_relationship, 110, rightY, 85);
  leftY = F('First Name', e.ec_first_name, 12, leftY, 85);
  rightY = F('Last Name', e.ec_last_name, 110, rightY, 85);
  leftY = F('Primary Phone', e.ec_primary_phone, 12, leftY, 85);
  rightY = F('Alternate Phone', e.ec_alternate_phone, 110, rightY, 85);
  leftY = F('Address', e.ec_address, 12, leftY, 185);
  y = Math.max(leftY, rightY) + 4;

  // Check if we need a new page
  if (y > 240) {
    addFooter(doc, 1);
    doc.addPage();
    addHeader(doc, 'Employee Record', isTemplate ? 'Template' : `${e.first_name || ''} ${e.last_name || ''}`);
    y = 30;
  }

  // Banking
  y = addSectionTitle(doc, 'Bank Details', y);
  leftY = y; rightY = y;
  leftY = F('Bank Name', e.bank_name, 12, leftY, 85);
  rightY = F('Branch Name', e.branch_name, 110, rightY, 85);
  leftY = F('Branch Code', e.branch_code, 12, leftY, 85);
  rightY = F('Account Type', e.account_type, 110, rightY, 85);
  leftY = F('Account Name', e.account_name, 12, leftY, 85);
  rightY = F('Account Number', e.account_number, 110, rightY, 85);
  y = Math.max(leftY, rightY) + 8;

  // Signature block
  if (!isTemplate) {
    doc.setDrawColor(...LINE);
    doc.line(12, y + 10, 85, y + 10);
    doc.line(110, y + 10, 190, y + 10);
    doc.setTextColor(...MID);
    doc.setFontSize(7);
    doc.text('Employee Signature', 12, y + 14);
    doc.text('Date', 110, y + 14);
  }

  addFooter(doc, doc.internal.pages.length - 1);

  const name = isTemplate
    ? 'Employee_Form_Template.pdf'
    : `Employee_${e.first_name || 'Record'}_${e.last_name || ''}.pdf`;

  doc.save(name);
}

// ─── APPLICATION FORM ─────────────────────────────────────

export function generateApplicationForm(application, creditors) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const a = application || {};
  const creds = creditors || [];
  const isTemplate = !application;

  const clientName = isTemplate ? 'Template' : `${a.first_name || ''} ${a.last_name || ''}`;
  addHeader(doc, 'Application Form', clientName);

  let y = 30;
  const F = (label, val, x, yPos, w) =>
    isTemplate ? addEmptyField(doc, label, x, yPos, w) : addField(doc, label, val, x, yPos, w);

  // Application meta
  y = addSectionTitle(doc, 'Application Details', y);
  let leftY = y, rightY = y;
  leftY = F('Date', a.date?.split('T')[0], 12, leftY, 85);
  rightY = F('Branch', a.branch, 110, rightY, 85);
  leftY = F('Extension Number', a.ext_number, 12, leftY, 85);
  rightY = F('Consultant', `${a.consultant_first || ''} ${a.consultant_last || ''}`, 110, rightY, 85);
  y = Math.max(leftY, rightY) + 2;

  // Application type checkboxes
  y = addSectionTitle(doc, 'Application Type', y);
  const types = [
    ['MED', a.is_med], ['Debt Review', a.is_dreview],
    ['DRR', a.is_drr], ['3-in-1', a.is_3in1], ['Rent To', a.is_rent_to]
  ];
  types.forEach(([label, val], i) => {
    addCheckbox(doc, label, isTemplate ? false : val, 12 + (i * 38), y);
  });
  if (!isTemplate && a.other_type) {
    addField(doc, 'Other', a.other_type, 12, y + 8, 85);
    y += 16;
  } else if (isTemplate) {
    addEmptyField(doc, 'Other', 12, y + 8, 85);
    y += 16;
  } else {
    y += 8;
  }
  y += 4;

  // Client details
  y = addSectionTitle(doc, 'Client Details', y);
  leftY = y; rightY = y;
  leftY = F('First Name', a.first_name, 12, leftY, 85);
  rightY = F('Last Name', a.last_name, 110, rightY, 85);
  leftY = F('ID Number', a.client_id_number || a.id_number, 12, leftY, 85);
  rightY = F('Marital Status', a.client_marital_status || a.marital_status, 110, rightY, 85);
  leftY = F('Cell', a.cell, 12, leftY, 85);
  rightY = F('WhatsApp', a.client_whatsapp, 110, rightY, 85);
  leftY = F('Email', a.client_email || a.email, 12, leftY, 85);
  rightY = F('Employer', a.employer, 110, rightY, 85);
  leftY = F('Address', a.address, 12, leftY, 185);
  y = Math.max(leftY, rightY) + 4;

  // Financials
  y = addSectionTitle(doc, 'Income', y);
  leftY = y; rightY = y;
  leftY = F('Gross Salary', a.gross_salary && `R ${parseFloat(a.gross_salary).toLocaleString()}`, 12, leftY, 85);
  rightY = F('Nett Salary', a.nett_salary && `R ${parseFloat(a.nett_salary).toLocaleString()}`, 110, rightY, 85);
  leftY = F('Spouse Salary', a.spouse_salary && `R ${parseFloat(a.spouse_salary).toLocaleString()}`, 12, leftY, 85);
  y = Math.max(leftY, rightY) + 4;

  y = addSectionTitle(doc, 'Monthly Expenses', y);
  leftY = y; rightY = y;
  const expFields = [
    ['Groceries', a.exp_groceries], ['Rent / Bond', a.exp_rent_bond],
    ['Transport', a.exp_transport], ['School Fees', a.exp_school_fees],
    ['Rates', a.exp_rates], ['Water & Electricity', a.exp_water_elec],
  ];
  expFields.forEach(([label, val], i) => {
    const x = i % 2 === 0 ? 12 : 110;
    const formatted = val && `R ${parseFloat(val).toLocaleString()}`;
    if (i % 2 === 0) leftY = F(label, formatted, x, leftY, 85);
    else rightY = F(label, formatted, x, rightY, 85);
  });
  y = Math.max(leftY, rightY);

  // Total expenses highlight box
  if (!isTemplate && a.total_expenses) {
    doc.setFillColor(239, 246, 255);
    doc.setDrawColor(191, 219, 254);
    doc.roundedRect(12, y, 185, 9, 1, 1, 'FD');
    doc.setTextColor(...BRAND_BLUE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Monthly Expenses', 16, y + 6);
    doc.text(`R ${parseFloat(a.total_expenses).toLocaleString()}`, 193, y + 6, { align: 'right' });
    y += 13;
  } else { y += 6; }

  // New page for banking + creditors
  addFooter(doc, 1);
  doc.addPage();
  addHeader(doc, 'Application Form', clientName);
  y = 30;

  // Banking
  y = addSectionTitle(doc, 'Banking & Debit Order', y);
  leftY = y; rightY = y;
  leftY = F('Bank', a.bank, 12, leftY, 85);
  rightY = F('Account Number', a.account_no, 110, rightY, 85);
  leftY = F('Account Type', a.account_type, 12, leftY, 85);
  rightY = F('Debt Review Status', a.debt_review_status, 110, rightY, 85);
  leftY = F('Debit Order Date', a.debit_order_date, 12, leftY, 85);
  rightY = F('Debit Order Amount', a.debit_order_amount && `R ${parseFloat(a.debit_order_amount).toLocaleString()}`, 110, rightY, 85);
  y = Math.max(leftY, rightY) + 4;

  // Documents received
  y = addSectionTitle(doc, 'Documents Received', y);
  addCheckbox(doc, 'ID Copy', isTemplate ? false : a.has_id_copy, 12, y + 4);
  addCheckbox(doc, 'Payslip', isTemplate ? false : a.has_payslip, 70, y + 4);
  addCheckbox(doc, 'Proof of Address', isTemplate ? false : a.has_proof_of_address, 128, y + 4);
  y += 12;

  // Creditors
  const creditorList = isTemplate
    ? Array(5).fill({ creditor_name: '', account_num_ref: '', balance_of_acc: '', amount: '' })
    : creds;

  if (creditorList.length > 0) {
    y = addSectionTitle(doc, 'Creditors', y);

    // Table header
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(12, y, 185, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('Creditor Name', 14, y + 5);
    doc.text('Account / Ref', 85, y + 5);
    doc.text('Balance', 135, y + 5);
    doc.text('Monthly Amount', 167, y + 5);
    y += 7;

    creditorList.forEach((c, i) => {
      if (y > 265) {
        addFooter(doc, 2);
        doc.addPage();
        addHeader(doc, 'Application Form', clientName);
        y = 30;
      }
      const bg = i % 2 === 0 ? WHITE : LIGHT;
      doc.setFillColor(...bg);
      doc.rect(12, y, 185, 8, 'F');
      doc.setDrawColor(...LINE);
      doc.rect(12, y, 185, 8);

      doc.setTextColor(...DARK);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(c.creditor_name || '', 14, y + 5.5);
      doc.text(c.account_num_ref || '', 85, y + 5.5);
      doc.text(c.balance_of_acc ? `R ${parseFloat(c.balance_of_acc).toLocaleString()}` : '', 135, y + 5.5);
      doc.text(c.amount ? `R ${parseFloat(c.amount).toLocaleString()}` : '', 167, y + 5.5);
      y += 8;
    });

    // Totals row
    if (!isTemplate && creds.length > 0) {
      const totalBalance = creds.reduce((s, c) => s + (parseFloat(c.balance_of_acc) || 0), 0);
      const totalAmount = creds.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
      doc.setFillColor(239, 246, 255);
      doc.rect(12, y, 185, 8, 'F');
      doc.setTextColor(...BRAND_BLUE);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('TOTAL', 14, y + 5.5);
      doc.text(`R ${totalBalance.toLocaleString()}`, 135, y + 5.5);
      doc.text(`R ${totalAmount.toLocaleString()}`, 167, y + 5.5);
      y += 12;
    } else { y += 6; }
  }

  // Signature block
  y += 4;
  doc.setDrawColor(...LINE);
  doc.line(12, y + 10, 85, y + 10);
  doc.line(110, y + 10, 190, y + 10);
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.text('Client Signature', 12, y + 14);
  doc.text('Date', 110, y + 14);

  addFooter(doc, doc.internal.pages.length - 1);

  const name = isTemplate
    ? 'Application_Form_Template.pdf'
    : `Application_${a.first_name || 'Form'}_${a.last_name || ''}.pdf`;

  doc.save(name);
}