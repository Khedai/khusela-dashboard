import { jsPDF } from 'jspdf';
import khuselaLogoUrl from '../assets/khusela-logo.png';

const BRAND_BLUE = [37, 99, 235];
const DARK = [15, 23, 42];
const MID = [100, 116, 139];
const LIGHT = [241, 245, 249];
const WHITE = [255, 255, 255];
const LINE = [226, 232, 240];

// ─── SHARED HELPERS ───────────────────────────────────────

let _logoData = null;
async function getLogoData() {
  if (_logoData) return _logoData;
  try {
    const res = await fetch(khuselaLogoUrl);
    const blob = await res.blob();
    _logoData = await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
    return _logoData;
  } catch (err) {
    return null;
  }
}

async function addHeader(doc, title, subtitle) {
  // Blue top bar
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, 210, 22, 'F');

  // Try to draw the real logo image
  const logoData = await getLogoData();
  if (logoData) {
    // place logo at left with white padding
    try {
      doc.addImage(logoData, 'PNG', 8, 4, 28, 14);
      // Do not draw the textual "Khusela" here — the logo image already contains the name.
    } catch (e) {
      // fallback to letter mark
      doc.setFillColor(255, 255, 255, 0.2);
      doc.roundedRect(8, 4, 14, 14, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('K', 15, 13.5, { align: 'center' });
      doc.setFontSize(13);
      doc.text('Khusela', 26, 13);
    }
  } else {
    // fallback to letter mark
    doc.setFillColor(255, 255, 255, 0.2);
    doc.roundedRect(8, 4, 14, 14, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('K', 15, 13.5, { align: 'center' });
    doc.setFontSize(13);
    doc.text('Khusela', 26, 13);
  }

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
  // Label — small grey caption above the line
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x, y);

  // Value — larger dark text below the label
  doc.setTextColor(...DARK);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', value ? 'bold' : 'normal');
  doc.text(value || '', x, y + 5);

  // Underline beneath the value
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(x, y + 6.5, x + width, y + 6.5);

  return y + 11;
}

function addEmptyField(doc, label, x, y, width = 85) {
  // Label
  doc.setTextColor(...MID);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(label, x, y);

  // Empty line with more breathing room
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.line(x, y + 6.5, x + width, y + 6.5);

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

export async function generateEmployeeForm(employee) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const e = employee || {};
  const isTemplate = !employee;

  await addHeader(doc, 'Employee Record', isTemplate ? 'Template' : `${e.first_name || ''} ${e.last_name || ''}`);

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

  const hasSecondaryEC = isTemplate || e.sec_first_name || e.sec_last_name || e.sec_primary_phone;
  if (hasSecondaryEC) {
    // If we're already low on the page (e.g. y > 210), start a new page for secondary contact
    if (y > 210) {
      addFooter(doc, doc.internal.pages.length - 1);
      doc.addPage();
      await addHeader(doc, 'Employee Record', isTemplate ? 'Template' : `${e.first_name || ''} ${e.last_name || ''}`);
      y = 30;
    }
    y = addSectionTitle(doc, 'Secondary Emergency Contact', y);
    leftY = y; rightY = y;
    leftY = F('Title', e.sec_title, 12, leftY, 30);
    rightY = F('Relationship', e.sec_relationship, 110, rightY, 85);
    leftY = F('First Name', e.sec_first_name, 12, leftY, 85);
    rightY = F('Last Name', e.sec_last_name, 110, rightY, 85);
    leftY = F('Primary Phone', e.sec_primary_phone, 12, leftY, 85);
    rightY = F('Alternate Phone', e.sec_alternate_phone, 110, rightY, 85);
    leftY = F('Address', e.sec_address, 12, leftY, 185);
    y = Math.max(leftY, rightY) + 4;
  }

  // Check if we need a new page
  if (y > 240) {
    addFooter(doc, doc.internal.pages.length - 1);
    doc.addPage();
    await addHeader(doc, 'Employee Record', isTemplate ? 'Template' : `${e.first_name || ''} ${e.last_name || ''}`);
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

export async function generateApplicationForm(application, creditors) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const a = application || {};
  const creds = creditors || [];
  const isTemplate = !application;

  const clientName = isTemplate ? 'Template' : `${a.first_name || ''} ${a.last_name || ''}`;
  await addHeader(doc, 'Application Form', clientName);

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
  await addHeader(doc, 'Application Form', clientName);
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

// ─── ATTENDANCE REPORT ────────────────────────────────────

function fmtTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const sa = new Date(d.getTime() + 2 * 60 * 60 * 1000);
  const h = String(sa.getUTCHours()).padStart(2, '0');
  const m = String(sa.getUTCMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function fmtHours(minutes) {
  if (!minutes && minutes !== 0) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min.toString().padStart(2, '0')}m`;
}

function fmtDecimalHours(minutes) {
  if (!minutes && minutes !== 0) return '0.0';
  return (Math.round(minutes) / 60).toFixed(1);
}

/**
 * Generate a branded PDF attendance report.
 * @param {Object} data - Report data from GET /time/report
 * @param {string} [employeeName] - If provided, generates individual detailed report
 */
export async function generateAttendanceReport(data, employeeName) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const { period, start_date, end_date, summary, employees } = data;
  const periodLabel = period === 'monthly' ? 'Monthly' : 'Weekly';

  const reportTitle = employeeName
    ? `${periodLabel} Attendance — ${employeeName}`
    : `${periodLabel} Attendance Report`;

  await addHeader(doc, reportTitle, `${start_date} to ${end_date}`);

  let y = 28;

  if (!employeeName) {
    // ═════════ OVERALL REPORT ═════════

    // Summary cards
    y = addSectionTitle(doc, 'Summary', y);

    const summaryItems = [
      { label: 'Employees', value: String(summary.total_employees) },
      { label: 'Present Days', value: String(summary.total_present_days) },
      { label: 'Late Days', value: String(summary.total_late_days) },
      { label: 'Absent Days', value: String(summary.total_absent_days) },
      { label: 'Total Work Hours', value: summary.total_work_hours },
      { label: 'Avg Hours / Day', value: summary.avg_work_hours_per_day },
    ];

    const cardWidth = 61;
    const cardHeight = 16;
    const startX = 12;
    const gapX = 5;
    const gapY = 4;

    summaryItems.forEach((item, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = startX + col * (cardWidth + gapX);
      const cy = y + row * (cardHeight + gapY);

      doc.setFillColor(...LIGHT);
      doc.setDrawColor(...LINE);
      doc.roundedRect(cx, cy, cardWidth, cardHeight, 1.5, 1.5, 'FD');

      doc.setTextColor(...MID);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(item.label, cx + 3, cy + 5);

      doc.setTextColor(...DARK);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(item.value, cx + 3, cy + 12);
    });
    y += 2 * (cardHeight + gapY) + 6;

    // Employee table
    if (y > 240) {
      addFooter(doc, doc.internal.pages.length - 1);
      doc.addPage();
      await addHeader(doc, reportTitle, `${start_date} to ${end_date}`);
      y = 28;
    }

    y = addSectionTitle(doc, 'Employee Breakdown', y);

    // Table header
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(12, y, 185, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Employee', 14, y + 5);
    doc.text('Branch', 64, y + 5);
    doc.text('Present', 100, y + 5);
    doc.text('Late', 113, y + 5);
    doc.text('Absent', 126, y + 5);
    doc.text('Hours', 142, y + 5);
    doc.text('Avg/Day', 159, y + 5);
    doc.text('T1/T2/L', 176, y + 5);
    y += 7;

    employees.forEach((emp, i) => {
      if (y > 272) {
        addFooter(doc, doc.internal.pages.length - 1);
        doc.addPage();
        addHeader(doc, reportTitle, `${start_date} to ${end_date}`);
        y = 28;
      }

      const bg = i % 2 === 0 ? WHITE : LIGHT;
      doc.setFillColor(...bg);
      doc.rect(12, y, 185, 7, 'F');
      doc.setDrawColor(...LINE);
      doc.rect(12, y, 185, 7);

      const workingDays = emp.days_present;
      const avgH = workingDays > 0
        ? (emp.total_work_minutes / workingDays / 60).toFixed(1)
        : '0.0';
      const breaks = `${emp.total_tea_1}/${emp.total_tea_2}/${emp.total_lunch}`;

      doc.setTextColor(...DARK);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.text(`${emp.first_name} ${emp.last_name}`, 14, y + 5);
      doc.text(emp.franchise_name, 64, y + 5);
      doc.text(String(emp.days_present), 102, y + 5);
      doc.text(String(emp.days_late), 115, y + 5);
      doc.text(String(emp.days_absent), 128, y + 5);
      doc.text(fmtDecimalHours(emp.total_work_minutes), 144, y + 5);
      doc.text(avgH, 161, y + 5);
      doc.setFontSize(6.5);
      doc.text(breaks, 178, y + 5);
      y += 7;
    });

  } else {
    // ═════════ INDIVIDUAL REPORT ═════════

    if (employees.length === 0) {
      doc.setTextColor(...MID);
      doc.setFontSize(10);
      doc.text('No attendance records found for this period.', 12, y);
      addFooter(doc, 1);
      doc.save(`Attendance_${period || 'weekly'}_${employeeName.replace(/\s+/g, '_')}.pdf`);
      return;
    }

    const emp = employees[0];

    // Summary cards
    y = addSectionTitle(doc, 'Summary', y);

    const items = [
      { label: 'Present Days', value: String(emp.days_present) },
      { label: 'Late Days', value: String(emp.days_late) },
      { label: 'Absent Days', value: String(emp.days_absent) },
      { label: 'Total Work', value: fmtHours(emp.total_work_minutes) },
      { label: 'Avg / Day', value: emp.days_present > 0 ? fmtHours(emp.total_work_minutes / emp.days_present) : '—' },
      { label: 'Branch', value: emp.franchise_name },
    ];

    const cw = 61;
    const ch = 14;
    items.forEach((item, i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const cx = 12 + col * (cw + 5);
      const cy = y + row * (ch + 4);

      doc.setFillColor(...LIGHT);
      doc.setDrawColor(...LINE);
      doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'FD');

      doc.setTextColor(...MID);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.text(item.label, cx + 3, cy + 4.5);

      doc.setTextColor(...DARK);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(item.value, cx + 3, cy + 11);
    });
    y += 2 * (ch + 4) + 8;

    // Daily breakdown table
    if (y > 245) {
      addFooter(doc, doc.internal.pages.length - 1);
      doc.addPage();
      await addHeader(doc, reportTitle, `${start_date} to ${end_date}`);
      y = 28;
    }

    y = addSectionTitle(doc, 'Daily Breakdown', y);

    // Table header
    doc.setFillColor(...BRAND_BLUE);
    doc.rect(12, y, 185, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'bold');
    doc.text('Date', 14, y + 5);
    doc.text('Status', 40, y + 5);
    doc.text('In', 62, y + 5);
    doc.text('Out', 78, y + 5);
    doc.text('Work', 94, y + 5);
    doc.text('Tea 1', 118, y + 5);
    doc.text('Tea 2', 134, y + 5);
    doc.text('Lunch', 150, y + 5);
    doc.text('Location', 166, y + 5);
    y += 7;

    emp.daily.forEach((day, i) => {
      if (y > 272) {
        addFooter(doc, doc.internal.pages.length - 1);
        doc.addPage();
        addHeader(doc, reportTitle, `${start_date} to ${end_date}`);
        y = 28;
      }

      const bg = i % 2 === 0 ? WHITE : LIGHT;
      doc.setFillColor(...bg);
      doc.rect(12, y, 185, 7, 'F');
      doc.setDrawColor(...LINE);
      doc.rect(12, y, 185, 7);

      // Status color
      let statusColor = DARK;
      if (day.status === 'late') statusColor = [217, 119, 6];
      else if (day.status === 'absent') statusColor = [220, 38, 38];
      else if (day.status === 'present') statusColor = [22, 163, 74];

      doc.setTextColor(...statusColor);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'bold');
      const dateFormatted = new Date(day.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
      doc.text(dateFormatted, 14, y + 5);

      doc.text(day.status.charAt(0).toUpperCase() + day.status.slice(1), 40, y + 5);

      doc.setTextColor(...DARK);
      doc.setFont('helvetica', 'normal');
      doc.text(fmtTime(day.clock_in), 62, y + 5);
      doc.text(fmtTime(day.clock_out), 78, y + 5);
      doc.text(fmtHours(day.work_minutes), 94, y + 5);
      doc.text(fmtHours(day.tea_1_minutes), 118, y + 5);
      doc.text(fmtHours(day.tea_2_minutes), 134, y + 5);
      doc.text(fmtHours(day.lunch_minutes), 150, y + 5);

      doc.setFontSize(6);
      doc.text(day.location_name || '—', 166, y + 5);
      y += 7;
    });
  }

  addFooter(doc, doc.internal.pages.length - 1);

  const scope = employeeName
    ? employeeName.replace(/\s+/g, '_')
    : 'Overall';
  const safePeriod = period || 'weekly';
  doc.save(`Attendance_${safePeriod}_${scope}_${start_date}_to_${end_date}.pdf`);
}