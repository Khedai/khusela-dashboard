import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import * as S from '../utils/styles';

const EMPTY_FORM = {
  ext_number: '', branch: '',
  is_med: false, is_dreview: false, is_drr: false,
  is_3in1: false, is_rent_to: false, other_type: '',
  client_first_name: '', client_last_name: '', client_id_number: '',
  client_cell: '', client_whatsapp: '', client_email: '',
  client_address: '', client_employer: '', client_marital_status: '',
  gross_salary: '', nett_salary: '', spouse_salary: '',
  exp_groceries: '', exp_rent_bond: '', exp_transport: '',
  exp_school_fees: '', exp_rates: '', exp_water_elec: '',
  bank: '', account_no: '', account_type: '', debt_review_status: '',
  debit_order_date: '', debit_order_amount: '',
  has_id_copy: false, has_payslip: false, has_proof_of_address: false,
  status: 'Draft'
};

const EMPTY_CREDITOR = { creditor_name: '', account_num_ref: '', balance_of_acc: '', amount: '' };
const STEPS = ['Call Info', 'Applicant', 'Financials', 'Creditors', 'Documents'];

// ── Validation rules ──────────────────────────────────────
const SA_ID_REGEX = /^\d{13}$/;
const PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStep(step, form, creditors) {
  const errs = {};

  if (step === 0) {
    if (!form.ext_number.trim()) errs.ext_number = 'Extension number is required.';
    if (!form.branch.trim()) errs.branch = 'Branch is required.';
    const anyType = form.is_med || form.is_dreview || form.is_drr || form.is_3in1 || form.is_rent_to || form.other_type.trim();
    if (!anyType) errs.app_type = 'Select at least one application type.';
  }

  if (step === 1) {
    if (!form.client_first_name.trim()) errs.client_first_name = 'First name is required.';
    if (!form.client_last_name.trim()) errs.client_last_name = 'Last name is required.';
    if (form.client_id_number && !SA_ID_REGEX.test(form.client_id_number))
      errs.client_id_number = 'ID number must be exactly 13 digits.';
    if (form.client_cell && !PHONE_REGEX.test(form.client_cell))
      errs.client_cell = 'Enter a valid SA phone number (e.g. 0821234567).';
    if (form.client_whatsapp && !PHONE_REGEX.test(form.client_whatsapp))
      errs.client_whatsapp = 'Enter a valid SA phone number.';
    if (form.client_email && !EMAIL_REGEX.test(form.client_email))
      errs.client_email = 'Enter a valid email address.';
    if (!form.client_employer.trim()) errs.client_employer = 'Employer is required.';
  }

  if (step === 2) {
    if (!form.gross_salary) errs.gross_salary = 'Gross salary is required.';
    else if (isNaN(form.gross_salary) || Number(form.gross_salary) <= 0)
      errs.gross_salary = 'Enter a valid positive amount.';
    if (!form.nett_salary) errs.nett_salary = 'Nett salary is required.';
    else if (isNaN(form.nett_salary) || Number(form.nett_salary) <= 0)
      errs.nett_salary = 'Enter a valid positive amount.';
    if (form.nett_salary && form.gross_salary && Number(form.nett_salary) > Number(form.gross_salary))
      errs.nett_salary = 'Nett salary cannot exceed gross salary.';
    ['exp_groceries', 'exp_rent_bond', 'exp_transport', 'exp_school_fees', 'exp_rates', 'exp_water_elec'].forEach(f => {
      if (form[f] && (isNaN(form[f]) || Number(form[f]) < 0))
        errs[f] = 'Enter a valid amount.';
    });
    if (!form.bank.trim()) errs.bank = 'Bank name is required.';
    if (!form.account_no.trim()) errs.account_no = 'Account number is required.';
    if (!form.account_type) errs.account_type = 'Account type is required.';
  }

  if (step === 3) {
    creditors.forEach((c, i) => {
      if (!c.creditor_name.trim()) errs[`creditor_name_${i}`] = 'Creditor name is required.';
      if (c.balance_of_acc && (isNaN(c.balance_of_acc) || Number(c.balance_of_acc) < 0))
        errs[`balance_of_acc_${i}`] = 'Enter a valid amount.';
      if (c.amount && (isNaN(c.amount) || Number(c.amount) < 0))
        errs[`amount_${i}`] = 'Enter a valid amount.';
    });
  }

  return errs;
}

export default function Applications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'form' | 'detail'
  const [selectedApp, setSelectedApp] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creditors, setCreditors] = useState([{ ...EMPTY_CREDITOR }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchApplications(); }, []);

  const fetchApplications = async () => {
    try {
      const res = await api.get('/applications');
      setApplications(res.data);
    } catch { setError('Failed to load applications.'); }
    finally { setLoading(false); }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    if (fieldErrors[name]) setFieldErrors(p => ({ ...p, [name]: undefined }));
  };

  const handleCreditorChange = (index, e) => {
    const updated = [...creditors];
    updated[index][e.target.name] = e.target.value;
    setCreditors(updated);
    const key = `${e.target.name}_${index}`;
    if (fieldErrors[key]) setFieldErrors(p => ({ ...p, [key]: undefined }));
  };

  const totalExpenses = () => {
    return ['exp_groceries','exp_rent_bond','exp_transport','exp_school_fees','exp_rates','exp_water_elec']
      .reduce((sum, f) => sum + (parseFloat(form[f]) || 0), 0);
  };

  const handleNext = () => {
    const errs = validateStep(step, form, creditors);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      setError('Please fix the errors below before continuing.');
      return;
    }
    setFieldErrors({});
    setError('');
    setStep(s => s + 1);
  };

  const handleSubmit = async () => {
    const errs = validateStep(4, form, creditors);
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setSubmitting(true); setError('');
    try {
      await api.post('/applications', { ...form, creditors });
      setSuccess('Application submitted successfully.');
      setView('list'); setForm(EMPTY_FORM);
      setCreditors([{ ...EMPTY_CREDITOR }]); setStep(0);
      fetchApplications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit application.');
    } finally { setSubmitting(false); }
  };

  // ── Detail view ───────────────────────────────────────────
  if (view === 'detail' && selectedApp) {
    const a = selectedApp.application;
    const creds = selectedApp.creditors;
    return (
      <div style={{ maxWidth: '800px' }}>
        <BackBtn onClick={() => setView('list')} />
        <div style={S.card}>
          <div style={{ padding: '22px 26px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ ...S.pageTitle, fontSize: '18px' }}>{a.first_name} {a.last_name}</h2>
              <p style={{ color: '#64748b', fontSize: '13px', margin: '3px 0 0' }}>
                {a.date?.split('T')[0]} · {a.branch || 'No branch'} · Ext {a.ext_number || '—'}
              </p>
            </div>
            <span style={S.badge(a.status)}>{a.status}</span>
          </div>
          <div style={{ padding: '24px 26px' }}>

            <DetailSection title="Application Type">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', gridColumn: 'span 2' }}>
                {[['is_med','MED'],['is_dreview','Debt Review'],['is_drr','DRR'],['is_3in1','3-in-1'],['is_rent_to','Rent To']].filter(([k]) => a[k]).map(([k,label]) => (
                  <span key={k} style={{ ...S.badge('Submitted'), background: '#eff6ff', color: '#2563eb' }}>{label}</span>
                ))}
                {a.other_type && <span style={S.badge('Submitted')}>{a.other_type}</span>}
              </div>
            </DetailSection>

            <DetailSection title="Client Details">
              <DR label="ID Number" value={a.client_id_number} />
              <DR label="Cell" value={a.cell} />
              <DR label="WhatsApp" value={a.client_whatsapp} />
              <DR label="Email" value={a.client_email} />
              <DR label="Employer" value={a.employer} />
              <DR label="Marital Status" value={a.client_marital_status} />
            </DetailSection>

            <DetailSection title="Financials">
              <DR label="Gross Salary" value={a.gross_salary && `R ${parseFloat(a.gross_salary).toLocaleString()}`} />
              <DR label="Nett Salary" value={a.nett_salary && `R ${parseFloat(a.nett_salary).toLocaleString()}`} />
              <DR label="Spouse Salary" value={a.spouse_salary && `R ${parseFloat(a.spouse_salary).toLocaleString()}`} />
              <DR label="Total Expenses" value={a.total_expenses && `R ${parseFloat(a.total_expenses).toLocaleString()}`} />
              <DR label="Debit Order Amount" value={a.debit_order_amount && `R ${parseFloat(a.debit_order_amount).toLocaleString()}`} />
              <DR label="Debit Order Date" value={a.debit_order_date} />
            </DetailSection>

            <DetailSection title="Banking">
              <DR label="Bank" value={a.bank} />
              <DR label="Account No" value={a.account_no} />
              <DR label="Account Type" value={a.account_type} />
              <DR label="Debt Review Status" value={a.debt_review_status} />
            </DetailSection>

            <DetailSection title="Documents Received">
              <DR label="ID Copy" value={a.has_id_copy ? 'Yes' : 'No'} highlight={a.has_id_copy} />
              <DR label="Payslip" value={a.has_payslip ? 'Yes' : 'No'} highlight={a.has_payslip} />
              <DR label="Proof of Address" value={a.has_proof_of_address ? 'Yes' : 'No'} highlight={a.has_proof_of_address} />
            </DetailSection>

            {creds.length > 0 && (
              <div style={S.formSection}>
                <p style={S.formSectionTitle}>Creditors ({creds.length})</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Creditor', 'Ref', 'Balance', 'Monthly Amount'].map(h => (
                        <th key={h} style={{ ...S.tableHeader, padding: '9px 14px' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {creds.map((c, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ ...S.tableCell, padding: '10px 14px' }}>{c.creditor_name}</td>
                        <td style={{ ...S.tableCell, padding: '10px 14px', color: '#64748b' }}>{c.account_num_ref}</td>
                        <td style={{ ...S.tableCell, padding: '10px 14px', textAlign: 'right' }}>R {parseFloat(c.balance_of_acc || 0).toLocaleString()}</td>
                        <td style={{ ...S.tableCell, padding: '10px 14px', textAlign: 'right' }}>R {parseFloat(c.amount || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(user?.role === 'Admin' || user?.role === 'HR') && (
              <div>
                <p style={S.formSectionTitle}>Update Status</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['Draft','Submitted','Pending Docs','Approved','Rejected'].map(s => (
                    <button key={s} onClick={async () => {
                      await api.patch(`/applications/${a.id}/status`, { status: s });
                      const res = await api.get(`/applications/${a.id}`);
                      setSelectedApp(res.data); fetchApplications();
                    }} style={{
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                      cursor: 'pointer', fontFamily: 'DM Sans',
                      background: a.status === s ? '#2563eb' : 'white',
                      color: a.status === s ? 'white' : '#64748b',
                      border: `1px solid ${a.status === s ? '#2563eb' : '#e2e8f0'}`,
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Wizard form ───────────────────────────────────────────
  if (view === 'form') {
    return (
      <div style={{ maxWidth: '800px' }}>
        <BackBtn onClick={() => { setView('list'); setStep(0); setFieldErrors({}); setError(''); }} />

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px', gap: '4px' }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <div style={{
                width: '26px', height: '26px', borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '11px', fontWeight: '700',
                background: i === step ? '#2563eb' : i < step ? '#16a34a' : '#f1f5f9',
                color: i <= step ? 'white' : '#94a3b8',
              }}>
                {i < step ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: '12px', fontWeight: i === step ? '600' : '400', color: i === step ? '#2563eb' : '#94a3b8', marginRight: '4px' }}>
                {s}
              </span>
              {i < STEPS.length - 1 && <div style={{ width: '20px', height: '1px', background: '#e2e8f0', marginRight: '4px' }} />}
            </div>
          ))}
        </div>

        {error && (
          <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ ...S.card, overflow: 'visible' }}>
          <div style={{ padding: '18px 26px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontFamily: 'Sora', fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              Step {step + 1} — {STEPS[step]}
            </h3>
          </div>

          <div style={{ padding: '24px 26px' }}>

            {/* Step 1 — Call Info */}
            {step === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <WField label="Extension Number *" name="ext_number" value={form.ext_number} onChange={handleChange} error={fieldErrors.ext_number} />
                  <WField label="Branch *" name="branch" value={form.branch} onChange={handleChange} error={fieldErrors.branch} />
                </div>
                <div>
                  <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '8px', fontWeight: '500' }}>
                    Application Type * {fieldErrors.app_type && <ErrText msg={fieldErrors.app_type} />}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[['is_med','MED'],['is_dreview','Debt Review'],['is_drr','DRR'],['is_3in1','3-in-1'],['is_rent_to','Rent To']].map(([name, label]) => (
                      <label key={name} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: `1px solid ${form[name] ? '#2563eb' : '#e2e8f0'}`,
                        background: form[name] ? '#eff6ff' : 'white',
                        fontSize: '13px', color: form[name] ? '#2563eb' : '#475569', fontWeight: form[name] ? '600' : '400',
                      }}>
                        <input type="checkbox" name={name} checked={form[name]} onChange={handleChange} style={{ accentColor: '#2563eb' }} />
                        {label}
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: '10px' }}>
                    <WField label="Other (specify)" name="other_type" value={form.other_type} onChange={handleChange} />
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 — Applicant */}
            {step === 1 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <WField label="First Name *" name="client_first_name" value={form.client_first_name} onChange={handleChange} error={fieldErrors.client_first_name} />
                <WField label="Last Name *" name="client_last_name" value={form.client_last_name} onChange={handleChange} error={fieldErrors.client_last_name} />
                <WField label="ID Number (13 digits)" name="client_id_number" value={form.client_id_number} onChange={handleChange} error={fieldErrors.client_id_number} placeholder="8001015009087" />
                <WField label="Cell" name="client_cell" value={form.client_cell} onChange={handleChange} error={fieldErrors.client_cell} placeholder="0821234567" />
                <WField label="WhatsApp" name="client_whatsapp" value={form.client_whatsapp} onChange={handleChange} error={fieldErrors.client_whatsapp} placeholder="0821234567" />
                <WField label="Email" name="client_email" value={form.client_email} onChange={handleChange} error={fieldErrors.client_email} type="email" />
                <WField label="Employer *" name="client_employer" value={form.client_employer} onChange={handleChange} error={fieldErrors.client_employer} />
                <WField label="Marital Status" name="client_marital_status" value={form.client_marital_status} onChange={handleChange}
                  type="select" options={['','Single','Married','Divorced','Widowed']} />
                <div style={{ gridColumn: 'span 2' }}>
                  <WField label="Address" name="client_address" value={form.client_address} onChange={handleChange} />
                </div>
              </div>
            )}

            {/* Step 3 — Financials */}
            {step === 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <WField label="Gross Salary *" name="gross_salary" value={form.gross_salary} onChange={handleChange} type="number" error={fieldErrors.gross_salary} placeholder="0.00" />
                <WField label="Nett Salary *" name="nett_salary" value={form.nett_salary} onChange={handleChange} type="number" error={fieldErrors.nett_salary} placeholder="0.00" />
                <WField label="Spouse Salary" name="spouse_salary" value={form.spouse_salary} onChange={handleChange} type="number" placeholder="0.00" />
                <div style={{ gridColumn: 'span 2', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                  <p style={S.formSectionTitle}>Monthly Expenses</p>
                </div>
                {[
                  ['Groceries','exp_groceries'],['Rent / Bond','exp_rent_bond'],
                  ['Transport','exp_transport'],['School Fees','exp_school_fees'],
                  ['Rates','exp_rates'],['Water & Electricity','exp_water_elec'],
                ].map(([label, name]) => (
                  <WField key={name} label={label} name={name} value={form[name]} onChange={handleChange} type="number" error={fieldErrors[name]} placeholder="0.00" />
                ))}
                <div style={{ gridColumn: 'span 2', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#1d4ed8', fontSize: '13px', fontWeight: '600' }}>Total Monthly Expenses</span>
                  <span style={{ color: '#1d4ed8', fontSize: '22px', fontWeight: '700', fontFamily: 'Sora' }}>
                    R {totalExpenses().toLocaleString()}
                  </span>
                </div>
                <div style={{ gridColumn: 'span 2', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                  <p style={S.formSectionTitle}>Banking & Debit Order</p>
                </div>
                <WField label="Bank *" name="bank" value={form.bank} onChange={handleChange} error={fieldErrors.bank} />
                <WField label="Account Number *" name="account_no" value={form.account_no} onChange={handleChange} error={fieldErrors.account_no} />
                <WField label="Account Type *" name="account_type" value={form.account_type} onChange={handleChange}
                  type="select" options={['','Cheque','Savings','Transmission']} error={fieldErrors.account_type} />
                <WField label="Debt Review Status" name="debt_review_status" value={form.debt_review_status} onChange={handleChange} />
                <WField label="Debit Order Date" name="debit_order_date" value={form.debit_order_date} onChange={handleChange} />
                <WField label="Debit Order Amount" name="debit_order_amount" value={form.debit_order_amount} onChange={handleChange} type="number" placeholder="0.00" />
              </div>
            )}

            {/* Step 4 — Creditors */}
            {step === 3 && (
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {creditors.map((c, i) => (
                    <div key={i} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Creditor {i + 1}
                        </span>
                        {creditors.length > 1 && (
                          <button onClick={() => setCreditors(p => p.filter((_, idx) => idx !== i))}
                            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>
                            Remove
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <WField label="Creditor Name *" name="creditor_name" value={c.creditor_name}
                          onChange={e => handleCreditorChange(i, e)} error={fieldErrors[`creditor_name_${i}`]} />
                        <WField label="Account / Ref No" name="account_num_ref" value={c.account_num_ref}
                          onChange={e => handleCreditorChange(i, e)} />
                        <WField label="Balance of Account" name="balance_of_acc" value={c.balance_of_acc}
                          onChange={e => handleCreditorChange(i, e)} type="number" error={fieldErrors[`balance_of_acc_${i}`]} placeholder="0.00" />
                        <WField label="Monthly Amount" name="amount" value={c.amount}
                          onChange={e => handleCreditorChange(i, e)} type="number" error={fieldErrors[`amount_${i}`]} placeholder="0.00" />
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setCreditors(p => [...p, { ...EMPTY_CREDITOR }])}
                  style={{ marginTop: '12px', width: '100%', padding: '11px', borderRadius: '10px', border: '2px dashed #e2e8f0', background: 'transparent', color: '#64748b', fontSize: '13.5px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#2563eb'; e.currentTarget.style.color = '#2563eb'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; }}>
                  + Add Another Creditor
                </button>
              </div>
            )}

            {/* Step 5 — Documents */}
            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: '#64748b', fontSize: '13.5px', marginBottom: '8px' }}>
                  Confirm which documents have been received from the applicant.
                </p>
                {[['has_id_copy','ID Copy'],['has_payslip','Payslip'],['has_proof_of_address','Proof of Address']].map(([name, label]) => (
                  <label key={name} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                    border: `1px solid ${form[name] ? '#2563eb' : '#e2e8f0'}`,
                    background: form[name] ? '#eff6ff' : 'white',
                  }}>
                    <input type="checkbox" name={name} checked={form[name]} onChange={handleChange}
                      style={{ width: '16px', height: '16px', accentColor: '#2563eb' }} />
                    <span style={{ fontSize: '13.5px', fontWeight: form[name] ? '600' : '400', color: form[name] ? '#2563eb' : '#475569' }}>
                      {label}
                    </span>
                    {form[name] && <span style={{ marginLeft: 'auto', color: '#16a34a', fontSize: '12px', fontWeight: '600' }}>Received</span>}
                  </label>
                ))}
                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Initial Status</label>
                  <select name="status" value={form.status} onChange={handleChange} style={{ ...S.input, width: '200px' }}>
                    {['Draft','Submitted','Pending Docs'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div style={{ padding: '16px 26px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => { setStep(s => s - 1); setFieldErrors({}); setError(''); }} disabled={step === 0}
              style={{ ...S.ghostBtn, opacity: step === 0 ? 0.4 : 1 }}>
              ← Previous
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={handleNext} style={S.primaryBtn}>Next →</button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                style={{ ...S.primaryBtn, background: 'linear-gradient(135deg, #16a34a, #15803d)', boxShadow: '0 2px 8px rgba(22,163,74,0.25)', opacity: submitting ? 0.7 : 1 }}>
                {submitting ? 'Submitting...' : 'Submit Application'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Applications table ────────────────────────────────────
  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={S.pageTitle}>Applications</h2>
        <button onClick={() => { setView('form'); setSuccess(''); setError(''); setStep(0); setFieldErrors({}); }} style={S.primaryBtn}>
          + New Application
        </button>
      </div>

      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>{success}</div>}
      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}

      <div style={S.card}>
        {loading ? (
          <p style={{ padding: '24px', color: '#94a3b8', fontSize: '14px' }}>Loading...</p>
        ) : applications.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center' }}>
            <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '12px' }}>No applications yet.</p>
            <button onClick={() => setView('form')} style={S.primaryBtn}>Create First Application</button>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr>
                {['Client','Date','Type','Nett Salary','Total Expenses','Status',''].map(h => (
                  <th key={h} style={{ ...S.tableHeader, textAlign: ['Nett Salary','Total Expenses'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {applications.map(app => (
                <tr key={app.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...S.tableCell, fontWeight: '500' }}>{app.first_name} {app.last_name}</td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{app.date?.split('T')[0]}</td>
                  <td style={{ ...S.tableCell, color: '#64748b', fontSize: '12px' }}>
                    {[app.is_med && 'MED', app.is_dreview && 'D.Review', app.is_drr && 'DRR', app.is_3in1 && '3-in-1'].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ ...S.tableCell, textAlign: 'right' }}>
                    {app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ ...S.tableCell, textAlign: 'right' }}>
                    {app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}
                  </td>
                  <td style={S.tableCell}><span style={S.badge(app.status)}>{app.status}</span></td>
                  <td style={S.tableCell}>
                    <button onClick={async () => {
                      const res = await api.get(`/applications/${app.id}`);
                      setSelectedApp(res.data); setView('detail');
                    }} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Helper components ─────────────────────────────────────

function WField({ label, name, value, onChange, type = 'text', options, error, placeholder }) {
  return (
    <div>
      <label style={{ display: 'block', color: error ? '#dc2626' : '#64748b', fontSize: '12px', marginBottom: '5px' }}>{label}</label>
      {type === 'select' ? (
        <select name={name} value={value} onChange={onChange}
          style={{ ...S.input, borderColor: error ? '#fca5a5' : '#e2e8f0' }}>
          {options.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
        </select>
      ) : (
        <input type={type} name={name} value={value} onChange={onChange} placeholder={placeholder}
          style={{ ...S.input, borderColor: error ? '#fca5a5' : '#e2e8f0', background: error ? '#fef2f2' : 'white' }} />
      )}
      {error && <p style={{ color: '#dc2626', fontSize: '11px', margin: '4px 0 0' }}>{error}</p>}
    </div>
  );
}

function ErrText({ msg }) {
  return <span style={{ color: '#dc2626', fontSize: '11px', marginLeft: '6px', fontWeight: '400' }}>{msg}</span>;
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', marginBottom: '16px', padding: 0, fontWeight: '500' }}>
      ← Back
    </button>
  );
}

function DetailSection({ title, children }) {
  return (
    <div style={S.formSection}>
      <p style={S.formSectionTitle}>{title}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>{children}</div>
    </div>
  );
}

function DR({ label, value, highlight }) {
  return (
    <div>
      <span style={{ color: '#94a3b8', fontSize: '12px' }}>{label}</span>
      <p style={{ color: highlight ? '#16a34a' : '#0f172a', fontSize: '13.5px', margin: '2px 0 0', fontWeight: highlight ? '600' : '500' }}>
        {value || '—'}
      </p>
    </div>
  );
}