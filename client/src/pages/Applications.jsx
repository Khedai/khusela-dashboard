import { useState, useEffect } from 'react';
import api from '../utils/api';
import { can } from '../utils/access';
import { useAuth } from '../context/AuthContext';
import * as S from '../utils/styles';
import Spinner from '../components/Spinner';
import DocumentUpload from '../components/DocumentUpload';
import { generateApplicationForm } from '../utils/pdfGenerator';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import { useUnsavedWarning } from '../utils/useUnsavedWarning';

const EMPTY_FORM = {
  franchise_id: '',
  is_med: false, is_dreview: false, is_drr: false,
  other_type: '',
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
const getSteps = (f) => {
  const s = ['Call Info', 'Applicant', 'Financials', 'Creditors'];
  if (!f.is_med) s.push('Documents');
  return s;
};

// ── Validation rules ──────────────────────────────────────
const SA_ID_REGEX = /^\d{13}$/;
const PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateStep(step, form, creditors) {
  const errs = {};

  if (step === 0) {
    if (!form.franchise_id) errs.franchise_id = 'Please select a franchise.';
    const anyType = form.is_med || form.is_dreview || form.is_drr || form.other_type.trim();
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
    if (!form.gross_salary) errs.gross_salary = 'Total monthly salary is required.';
    else if (isNaN(form.gross_salary) || Number(form.gross_salary) <= 0)
      errs.gross_salary = 'Enter a valid positive amount.';
    if (!form.nett_salary) errs.nett_salary = 'Take-home pay is required.';
    else if (isNaN(form.nett_salary) || Number(form.nett_salary) <= 0)
      errs.nett_salary = 'Enter a valid positive amount.';
    if (form.nett_salary && form.gross_salary && Number(form.nett_salary) > Number(form.gross_salary))
      errs.nett_salary = 'Take-home pay cannot exceed total salary.';
    ['exp_groceries', 'exp_rent_bond', 'exp_transport', 'exp_school_fees', 'exp_rates', 'exp_water_elec'].forEach(f => {
      if (form[f] && (isNaN(form[f]) || Number(form[f]) < 0))
        errs[f] = 'Enter a valid amount.';
    });
    if (!form.bank.trim()) errs.bank = 'Bank name is required.';
    if (!form.account_no.trim()) errs.account_no = 'Account number is required.';
    if (!form.account_type) errs.account_type = 'Account type is required.';
  }

  if (step === 3) {
    // Step 3 is either Banking (MED/DRR) or Creditors (Debt Review).
    // Only validate creditors when we actually show the creditors UI.
    if (!(form.is_med || form.is_drr)) {
      creditors.forEach((c, i) => {
        if (!c.creditor_name.trim()) errs[`creditor_name_${i}`] = 'Creditor name is required.';
        if (c.balance_of_acc && (isNaN(c.balance_of_acc) || Number(c.balance_of_acc) < 0))
          errs[`balance_of_acc_${i}`] = 'Enter a valid amount.';
        if (c.amount && (isNaN(c.amount) || Number(c.amount) < 0))
          errs[`amount_${i}`] = 'Enter a valid amount.';
      });
    }
  }

  return errs;
}

export default function Applications() {
  const { user, employeeId, franchise } = useAuth();
  const [applications, setApplications] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'form' | 'detail'
  const [selectedApp, setSelectedApp] = useState(null);
  const [step, setStep] = useState(0);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const LIMIT = 20;

  const getInitialForm = () => ({
    ...EMPTY_FORM,
    consultant_id: user?.role === 'Consultant' ? employeeId || '' : '',
    franchise_id: user?.role !== 'Admin' ? user?.franchise_id || '' : '',
  });
  const [form, setForm] = useState(getInitialForm());
  const [creditors, setCreditors] = useState([{ ...EMPTY_CREDITOR }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [success, setSuccess] = useState('');
  const [viewingId, setViewingId] = useState(null);       // which row's View btn is loading
  const [mandateUpdating, setMandateUpdating] = useState(null); // which mandate status is in-flight

  const [isFormDirty, setIsFormDirty] = useState(false);
  useUnsavedWarning(isFormDirty && view === 'form');

  const STEPS = getSteps(form);

  const [editApp, setEditApp] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [logs, setLogs] = useState([]);
  const [notes, setNotes] = useState([]);
  const [newNote, setNewNote] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState(null);

  useEffect(() => { fetchFranchises(); fetchEmployees(); }, [user]);
  useEffect(() => { setShowAll(can(user, 'applications.viewAll')); }, [user]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
    fetchApplications(1);
  }, [showAll, search]);

  useEffect(() => {
    fetchApplications(page);
  }, [page]);

  const handlePageChange = (p) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  const fetchEmployees = async () => {
    if (user?.role === 'Admin') {
      try {
        const res = await api.get('/employees?limit=1000'); // get all employees for dropdown
        setEmployees(res.data.data ? res.data.data : res.data);
      } catch {}
    }
  };

  const fetchApplications = async (p = page) => {
    try {
      let url = '/applications';
      const useFilter = !can(user, 'applications.viewAll') || !showAll;
      const q = [];
      if (useFilter && user?.franchise_id) q.push(`franchise_id=${user.franchise_id}`);
      q.push(`page=${p}`);
      q.push(`limit=${LIMIT}`);
      
      if (q.length > 0) url += `?${q.join('&')}`;

      const res = await api.get(url);
      setApplications(res.data.data ? res.data.data : res.data);
      if (res.data.pagination) setPagination(res.data.pagination);
    } catch {
      setError('Failed to load applications.');
    } finally {
      setLoading(false);
    }
  };

  const fetchFranchises = async () => {
    try {
      const res = await api.get('/franchises');
      setFranchises(res.data);
    } catch {}
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    setIsFormDirty(true);
    if (fieldErrors[name]) setFieldErrors(p => ({ ...p, [name]: undefined }));
  };

  const handleCreditorChange = (index, e) => {
    const updated = [...creditors];
    updated[index][e.target.name] = e.target.value;
    setCreditors(updated);
    setIsFormDirty(true);
    const key = `${e.target.name}_${index}`;
    if (fieldErrors[key]) setFieldErrors(p => ({ ...p, [key]: undefined }));
  };

  const handleCancelForm = () => {
    if (isFormDirty && !window.confirm('You have unsaved changes. Are you sure you want to leave?')) return;
    setIsFormDirty(false);
    setView('list');
    setStep(0);
    setFieldErrors({});
    setError('');
  };

  const handleEditSave = async () => {
    setEditSaving(true); setError('');
    try {
      await api.patch(`/applications/${selectedApp.application.id}`, editApp);
      // Refresh the detail view
      const res = await api.get(`/applications/${selectedApp.application.id}`);
      setSelectedApp(res.data.application ? res.data : { application: res.data, creditors: selectedApp.creditors });
      fetchApplications(page);
      setView('detail');
      setSuccess('Application updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes.');
    } finally { setEditSaving(false); }
  };

  const fetchLogs = async (id) => {
    try {
      const res = await api.get(`/applications/${id}/logs`);
      setLogs(res.data);
    } catch {}
  };

  const fetchNotes = async (id) => {
    try {
      const res = await api.get(`/applications/${id}/notes`);
      setNotes(res.data);
    } catch {}
  };

  const handlePostNote = async () => {
    if (!newNote.trim() || !selectedApp?.application?.id) return;
    setPostingNote(true);
    try {
      const res = await api.post(`/applications/${selectedApp.application.id}/notes`, { note: newNote });
      setNotes(prev => [res.data, ...prev]);
      setNewNote('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to post note.');
    } finally { setPostingNote(false); }
  };

  const handleDeleteNote = async (noteId) => {
    if (!selectedApp?.application?.id) return;
    if (!window.confirm('Delete this note?')) return;
    setDeletingNoteId(noteId);
    try {
      await api.delete(`/applications/${selectedApp.application.id}/notes/${noteId}`);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch {
      setError('Failed to delete note.');
    } finally { setDeletingNoteId(null); }
  };

  const openDetail = async (app) => {
    setViewingId(app.id);
    try {
      const res = await api.get(`/applications/${app.id}`);
      setSelectedApp(res.data.application ? res.data : { application: res.data, creditors: [] });
      fetchLogs(app.id);
      fetchNotes(app.id);
      setView('detail');
      setSuccess('');
      setError('');
    } finally { setViewingId(null); }
  };

  const totalExpenses = () => {
    return ['exp_groceries', 'exp_rent_bond', 'exp_transport', 'exp_school_fees', 'exp_rates', 'exp_water_elec']
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
    const lastStepIndex = STEPS.length - 1;
    const errs = validateStep(lastStepIndex, form, creditors);
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setSubmitting(true); setError('');
    try {
      await api.post('/applications', {
        ...form,
        // Only persist creditors when Debt Review step is active.
        creditors: (form.is_med || form.is_drr) ? [] : creditors,
        consultant_id: employeeId || undefined,
      });
      setSuccess('Application submitted successfully.');
      setIsFormDirty(false);
      setView('list'); setForm(getInitialForm());
      setCreditors([{ ...EMPTY_CREDITOR }]); setStep(0);
      fetchApplications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit application.');
    } finally { setSubmitting(false); }
  };

  const handleMandateStatusUpdate = async (status) => {
    setMandateUpdating(status);
    try {
      const res = await api.patch(`/applications/${selectedApp.application.id}/mandate`, {
        mandate_status: status,
      });
      setSelectedApp(prev => ({
        ...prev,
        application: {
          ...prev.application,
          mandate_status: res.data.mandate_status,
          mandate_signed: res.data.mandate_signed,
          mandate_signed_date: res.data.mandate_signed_date,
        }
      }));
      // Also update in the list
      setApplications(prev =>
        prev.map(a => a.id === selectedApp.application.id
          ? { ...a, mandate_status: res.data.mandate_status }
          : a
        )
      );
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update mandate status.');
    } finally {
      setMandateUpdating(null);
    }
  };

  // ── Edit view ─────────────────────────────────────────────
  if (view === 'edit' && selectedApp) {
    return (
      <div style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setView('detail')}
              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
              ← Back
            </button>
            <h2 style={{ ...S.pageTitle, margin: 0 }}>
              Edit — {selectedApp.application?.first_name} {selectedApp.application?.last_name}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setView('detail')} style={S.ghostBtn}>Cancel</button>
            <button onClick={handleEditSave} disabled={editSaving}
              style={{ ...S.primaryBtn, opacity: editSaving ? 0.7 : 1 }}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Client Details */}
          <EditSection title="Client Details">
            <EditGrid>
              <EditField label="First Name" value={editApp.first_name} onChange={v => setEditApp(p => ({ ...p, first_name: v }))} />
              <EditField label="Last Name" value={editApp.last_name} onChange={v => setEditApp(p => ({ ...p, last_name: v }))} />
              <EditField label="ID Number" value={editApp.id_number} onChange={v => setEditApp(p => ({ ...p, id_number: v }))} />
              <EditField label="Marital Status" value={editApp.marital_status} onChange={v => setEditApp(p => ({ ...p, marital_status: v }))} type="select" options={['Single', 'Married', 'Divorced', 'Widowed']} />
              <EditField label="Cell" value={editApp.cell} onChange={v => setEditApp(p => ({ ...p, cell: v }))} />
              <EditField label="WhatsApp" value={editApp.whatsapp} onChange={v => setEditApp(p => ({ ...p, whatsapp: v }))} />
              <EditField label="Email" value={editApp.email} onChange={v => setEditApp(p => ({ ...p, email: v }))} />
              <EditField label="Employer" value={editApp.employer} onChange={v => setEditApp(p => ({ ...p, employer: v }))} />
              <EditField label="Address" value={editApp.address} onChange={v => setEditApp(p => ({ ...p, address: v }))} span={2} />
            </EditGrid>
          </EditSection>

          {/* Income */}
          <EditSection title="Income">
            <EditGrid>
              <EditField label="Total Monthly Salary (Before Deductions)" value={editApp.gross_salary} onChange={v => setEditApp(p => ({ ...p, gross_salary: v }))} type="number" />
              <EditField label="Take-Home Pay (After Deductions)" value={editApp.nett_salary} onChange={v => setEditApp(p => ({ ...p, nett_salary: v }))} type="number" />
              <EditField label="Spouse / Partner Monthly Income" value={editApp.spouse_salary} onChange={v => setEditApp(p => ({ ...p, spouse_salary: v }))} type="number" />
            </EditGrid>
          </EditSection>

          {/* Expenses */}
          <EditSection title="Monthly Expenses">
            <EditGrid>
              {[
                ['Groceries', 'exp_groceries'], ['Rent / Bond', 'exp_rent_bond'],
                ['Transport', 'exp_transport'], ['School Fees', 'exp_school_fees'],
                ['Rates', 'exp_rates'], ['Water & Electricity', 'exp_water_elec'],
              ].map(([label, key]) => (
                <EditField key={key} label={label} value={editApp[key]} onChange={v => setEditApp(p => ({ ...p, [key]: v }))} type="number" />
              ))}
            </EditGrid>
          </EditSection>

          {/* Application Type */}
          <EditSection title="Application Type">
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', padding: '4px 0' }}>
              {[['is_med', 'MED (Debt Mediation)'], ['is_dreview', 'Debt Review'], ['is_drr', 'DRR (Debt Removal)']].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', color: '#0f172a' }}>
                  <input type="checkbox" checked={!!editApp[key]} onChange={e => setEditApp(p => ({ ...p, [key]: e.target.checked }))} />
                  {label}
                </label>
              ))}
            </div>
          </EditSection>

          {/* Banking */}
          <EditSection title="Banking & Debit Order">
            <EditGrid>
              <EditField label="Bank" value={editApp.bank} onChange={v => setEditApp(p => ({ ...p, bank: v }))} />
              <EditField label="Account Number" value={editApp.account_no} onChange={v => setEditApp(p => ({ ...p, account_no: v }))} />
              <EditField label="Account Type" value={editApp.account_type} onChange={v => setEditApp(p => ({ ...p, account_type: v }))} type="select" options={['Cheque', 'Savings', 'Transmission']} />
              <EditField label="Debit Order Date" value={editApp.debit_order_date} onChange={v => setEditApp(p => ({ ...p, debit_order_date: v }))} type="date" />
              <EditField label="Debit Order Amount" value={editApp.debit_order_amount} onChange={v => setEditApp(p => ({ ...p, debit_order_amount: v }))} type="number" />
              <EditField
                label="Debt Review Status"
                value={editApp.debt_review_status}
                onChange={v => setEditApp(p => ({ ...p, debt_review_status: v }))}
                type="select"
                options={['Not Under Debt Review', 'Applied for Debt Review', 'Under Debt Review', 'Debt Review Completed', 'Debt Review Withdrawn']}
              />
            </EditGrid>
          </EditSection>

        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button onClick={() => setView('detail')} style={S.ghostBtn}>Cancel</button>
          <button onClick={handleEditSave} disabled={editSaving}
            style={{ ...S.primaryBtn, opacity: editSaving ? 0.7 : 1 }}>
            {editSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

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
                {a.date?.split('T')[0]} · {a.franchise_name || 'No franchise'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {(user?.role === 'Admin' || user?.role === 'HR' ||
                (user?.role === 'Consultant' && a.consultant_id === employeeId)) && (
                <button
                  onClick={() => { setEditApp({ ...a }); setView('edit'); }}
                  style={S.ghostBtn}
                >
                  Edit
                </button>
              )}
              <button onClick={() => generateApplicationForm(a, creds)}
                className="btn-ghost" style={S.ghostBtn}>Download PDF</button>
              <span style={S.badge(a.status)}>{a.status}</span>
            </div>
          </div>
          <div style={{ padding: '24px 26px' }}>

            <DetailSection title="Application Type">
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', gridColumn: 'span 2' }}>
                {[['is_med', 'MED (Debt Mediation)'], ['is_dreview', 'Debt Review'], ['is_drr', 'DRR (Debt Removal)']].filter(([k]) => a[k]).map(([k, label]) => (
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
              <DR label="Total Monthly Salary" value={a.gross_salary && `R ${parseFloat(a.gross_salary).toLocaleString()}`} />
              <DR label="Take-Home Pay" value={a.nett_salary && `R ${parseFloat(a.nett_salary).toLocaleString()}`} />
              <DR label="Spouse / Partner Income" value={a.spouse_salary && `R ${parseFloat(a.spouse_salary).toLocaleString()}`} />
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

            <div style={{ marginTop: '8px' }}>
              <DocumentUpload applicationId={a.id} onUploadComplete={() => {
                api.get(`/documents/application/${a.id}`).then(res => {
                  setSelectedApp(prev => ({ ...prev, documents: res.data }));
                });
              }} />
            </div>

            {/* ── MANDATE SECTION ── */}
            <div style={{
              background: 'white', borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              overflow: 'hidden', marginTop: '16px',
            }}>
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid #f1f5f9',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '700', color: '#0f172a', margin: '0 0 2px' }}>
                    Mandate Document
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
                    Signed client authorization for debt review process
                  </p>
                </div>
                <MandateBadge status={a.mandate_status} />
              </div>

              <div style={{ padding: '20px' }}>

                {/* Status timeline */}
                <div style={{ display: 'flex', gap: '0', marginBottom: '24px' }}>
                  {[
                    { key: 'Pending', label: 'Pending', desc: 'Awaiting client signature' },
                    { key: 'Uploaded', label: 'Uploaded', desc: 'Scanned and uploaded' },
                    { key: 'Verified', label: 'Verified', desc: 'Confirmed by HR/Admin' },
                  ].map((step, i) => {
                    const statuses = ['Pending', 'Uploaded', 'Verified'];
                    const currentIdx = statuses.indexOf(a.mandate_status || 'Pending');
                    const stepIdx = statuses.indexOf(step.key);
                    const isComplete = stepIdx < currentIdx;
                    const isActive = stepIdx === currentIdx;

                    return (
                      <div key={step.key} style={{ flex: 1, display: 'flex', alignItems: 'flex-start', position: 'relative' }}>
                        {/* Connector line */}
                        {i < 2 && (
                          <div style={{
                            position: 'absolute', top: '14px', left: '50%', right: '-50%',
                            height: '2px',
                            background: isComplete ? '#16a34a' : '#e2e8f0',
                            zIndex: 0,
                          }} />
                        )}
                        <div style={{ flex: 1, textAlign: 'center', zIndex: 1 }}>
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '50%',
                            background: isComplete ? '#16a34a' : isActive ? '#2563eb' : '#e2e8f0',
                            color: isComplete || isActive ? 'white' : '#94a3b8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 6px',
                            fontSize: isComplete ? '14px' : '12px', fontWeight: '700',
                          }}>
                            {isComplete ? '✓' : i + 1}
                          </div>
                          <p style={{
                            margin: '0 0 2px', fontSize: '12px', fontWeight: '700',
                            color: isActive ? '#2563eb' : isComplete ? '#16a34a' : '#64748b',
                          }}>
                            {step.label}
                          </p>
                          <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{step.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Instructions */}
                <div style={{
                  background: '#f8fafc', borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
                }}>
                  <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: '700', color: '#0f172a' }}>
                    Process
                  </p>
                  <ol style={{ margin: 0, paddingLeft: '18px', color: '#64748b', fontSize: '12px', lineHeight: '1.8' }}>
                    <li>Download the application PDF using the button below</li>
                    <li>Print and have the client sign both Applicant 1 and 2 signature fields</li>
                    <li>Scan or photograph the signed document</li>
                    <li>Upload it below as <strong>Signed Mandate</strong></li>
                    <li>Mark as Verified once confirmed</li>
                  </ol>
                </div>

                {/* Download PDF button */}
                <div style={{ marginBottom: '20px' }}>
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.get(`/applications/${a.id}`);
                        generateApplicationForm(res.data.application, res.data.creditors);
                      } catch {}
                    }}
                    style={{ ...S.ghostBtn, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    ↓ Download Application PDF
                  </button>
                </div>

                {/* Document upload specifically for mandate */}
                <div style={{ marginBottom: '20px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                    Upload Signed Mandate
                  </p>
                  <DocumentUpload
                    applicationId={a.id}
                    onUploadComplete={() => {
                      // Refresh selection to show new doc (though not strictly needed here as we update mandate status)
                      if (a.mandate_status === 'Pending') {
                        handleMandateStatusUpdate('Uploaded');
                      }
                    }}
                    presetType="Signed Mandate"
                  />
                </div>

                {/* HR/Admin: manually update mandate status */}
                {can(user, 'applications.changeStatus') && (
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: '600', color: '#64748b', marginBottom: '8px' }}>
                      Update Mandate Status
                    </p>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      {['Pending', 'Uploaded', 'Verified'].map(status => {
                        const isActive = a.mandate_status === status;
                        const isLoading = mandateUpdating === status;
                        return (
                          <button
                            key={status}
                            onClick={() => handleMandateStatusUpdate(status)}
                            disabled={isActive || mandateUpdating !== null}
                            style={{
                              padding: '7px 16px', borderRadius: '8px', border: 'none',
                              fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans',
                              cursor: isActive || mandateUpdating ? 'default' : 'pointer',
                              background: isActive ? '#f1f5f9' : '#0f172a',
                              color: isActive ? '#94a3b8' : 'white',
                              opacity: isActive ? 0.6 : mandateUpdating && !isLoading ? 0.5 : 1,
                              display: 'inline-flex', alignItems: 'center', gap: '7px',
                            }}
                          >
                            {isLoading && <Spinner size="sm" inline />}
                            {status}
                          </button>
                        );
                      })}
                    </div>
                    {a.mandate_signed_date && (
                      <p style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: '11px' }}>
                        Verified on {new Date(a.mandate_signed_date).toLocaleDateString('en-ZA')}
                      </p>
                    )}

                  </div>
                )}
              </div>
            </div>

            {/* ── NOTES / COMMENTS ── */}
            <div style={{
              background: 'white', borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              overflow: 'hidden', marginTop: '16px',
            }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 2px' }}>
                    Notes
                  </h3>
                  <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
                    Internal notes visible to HR and Admin only
                  </p>
                </div>
                {notes.length > 0 && (
                  <span style={{
                    background: '#f1f5f9', color: '#64748b',
                    borderRadius: '20px', fontSize: '11px',
                    fontWeight: '700', padding: '2px 9px',
                  }}>
                    {notes.length}
                  </span>
                )}
              </div>

              {/* Compose new note */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #f8fafc' }}>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handlePostNote();
                  }}
                  placeholder="Add a note... (Ctrl+Enter to post)"
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: '8px', border: '1px solid #e2e8f0',
                    fontSize: '13px', fontFamily: 'DM Sans',
                    color: '#0f172a', resize: 'vertical',
                    lineHeight: '1.6', boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>
                    Ctrl+Enter to post quickly
                  </span>
                  <button
                    onClick={handlePostNote}
                    disabled={postingNote || !newNote.trim()}
                    style={{
                      padding: '7px 18px', borderRadius: '8px', border: 'none',
                      background: newNote.trim() ? '#0f172a' : '#f1f5f9',
                      color: newNote.trim() ? 'white' : '#94a3b8',
                      fontSize: '12px', fontWeight: '600',
                      fontFamily: 'DM Sans', cursor: newNote.trim() ? 'pointer' : 'default',
                      opacity: postingNote ? 0.7 : 1,
                    }}
                  >
                    {postingNote ? 'Posting...' : 'Post Note'}
                  </button>
                </div>
              </div>

              {/* Notes list */}
              {notes.length === 0 ? (
                <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
                  No notes yet. Add one above.
                </div>
              ) : (
                <div>
                  {notes.map((note) => {
                    const isOwn = note.username === user?.username;
                    const roleColors = {
                      Admin: { bg: '#f5f3ff', color: '#7c3aed' },
                      HR: { bg: '#eff6ff', color: '#2563eb' },
                      Consultant: { bg: '#f0fdf4', color: '#16a34a' },
                    };
                    const rc = roleColors[note.role] || roleColors.Consultant;

                    return (
                      <div key={note.id} style={{
                        padding: '14px 20px',
                        borderTop: '1px solid #f8fafc',
                        background: isOwn ? '#fafbff' : 'white',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Avatar */}
                            <div style={{
                              width: '28px', height: '28px', borderRadius: '50%',
                              background: rc.bg, color: rc.color,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '11px', fontWeight: '700', flexShrink: 0,
                            }}>
                              {note.username?.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <span style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>
                                @{note.username}
                              </span>
                              <span style={{
                                ...rc, padding: '1px 7px', borderRadius: '4px',
                                fontSize: '10px', fontWeight: '600', marginLeft: '6px',
                              }}>
                                {note.role}
                              </span>
                              {note.franchise_name && (
                                <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '6px' }}>
                                  · {note.franchise_name}
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>
                              {new Date(note.created_at).toLocaleDateString('en-ZA', {
                                day: 'numeric', month: 'short',
                                hour: '2-digit', minute: '2-digit',
                              })}
                            </span>
                            {(isOwn || user?.role === 'Admin') && (
                              <button
                                onClick={() => handleDeleteNote(note.id)}
                                disabled={deletingNoteId === note.id}
                                style={{
                                  background: 'none', border: 'none',
                                  color: '#cbd5e1', cursor: 'pointer', padding: 0,
                                  fontSize: '14px', lineHeight: 1,
                                }}
                                onMouseEnter={e => e.target.style.color = '#dc2626'}
                                onMouseLeave={e => e.target.style.color = '#cbd5e1'}
                              >
                                {deletingNoteId === note.id ? '...' : '×'}
                              </button>
                            )}
                          </div>
                        </div>
                        <p style={{
                          margin: 0, fontSize: '13.5px', color: '#334155',
                          lineHeight: '1.6', whiteSpace: 'pre-wrap',
                          paddingLeft: '36px',
                        }}>
                          {note.note}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {creds.length > 0 && (
              <div style={S.formSection}>
                <p style={S.formSectionTitle}>Creditors ({creds.length})</p>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Creditor', 'Ref', 'Balance', 'Monthly Installment'].map(h => (
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
                {pagination && (
                  <Pagination
                    page={pagination.page}
                    totalPages={pagination.totalPages}
                    total={pagination.total}
                    limit={pagination.limit}
                    onPageChange={handlePageChange}
                  />
                )}
              </div>
            )}

            {(user?.role === 'Admin' || user?.role === 'HR') && (
              <div>
                <p style={S.formSectionTitle}>Update Status</p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {['Draft','Submitted','Pending Docs','Approved','Rejected'].map(s => (
                    <button key={s} onClick={async () => {
                      if (s === a.status) return;
                      if (!window.confirm(`Change status to "${s}"? This will be logged.`)) return;
                      await api.patch(`/applications/${a.id}/status`, { status: s });
                      const res = await api.get(`/applications/${a.id}`);
                      setSelectedApp(res.data);
                      fetchApplications();
                    }} style={{
                      padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                      cursor: a.status === s ? 'default' : 'pointer', fontFamily: 'DM Sans',
                      background: a.status === s ? '#2563eb' : 'white',
                      color: a.status === s ? 'white' : '#64748b',
                      border: `1px solid ${a.status === s ? '#2563eb' : '#e2e8f0'}`,
                      opacity: a.status === s ? 1 : 0.85,
                    }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Audit Trail */}
        {logs.length > 0 && (
          <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: '16px' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
                Activity Log
              </h3>
            </div>
            <div>
              {logs.map((log, i) => (
                <div key={log.id} style={{
                  display: 'flex', gap: '12px', padding: '12px 20px',
                  borderTop: i > 0 ? '1px solid #f8fafc' : 'none',
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: log.action === 'status_change' ? '#eff6ff' : '#f0fdf4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '12px',
                  }}>
                    {log.action === 'status_change' ? '⇄' : '✎'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>
                          {log.action === 'status_change'
                            ? `Status changed: ${log.old_value} → ${log.new_value}`
                            : 'Application edited'}
                        </span>
                        <span style={{ color: '#64748b', fontSize: '12px', marginLeft: '8px' }}>
                          by @{log.username}
                        </span>
                      </div>
                      <span style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleDateString('en-ZA', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    {log.note && (
                      <p style={{ margin: '3px 0 0', color: '#64748b', fontSize: '12px' }}>{log.note}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    );
  }

  // ── Wizard form ───────────────────────────────────────────
  if (view === 'form') {
    return (
      <div style={{ maxWidth: '800px' }}>
        <BackBtn onClick={handleCancelForm} />

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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '14px' }}>
                  {/* Consultant field */}
                  <div>
                    <label style={{ display: 'block', color: fieldErrors.consultant_id ? '#dc2626' : '#64748b', fontSize: '12px', marginBottom: '5px' }}>
                      Consultant
                    </label>
                    {user?.role === 'Consultant' ? (
                      <div style={{
                        ...S.input, background: '#f8fafc', color: '#64748b', cursor: 'not-allowed', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '40px'
                      }}>
                        {user.username} (auto-assigned)
                      </div>
                    ) : (
                      <select
                        name="consultant_id"
                        value={form.consultant_id || ''}
                        onChange={handleChange}
                        style={{ ...S.input, borderColor: fieldErrors.consultant_id ? '#fca5a5' : '#e2e8f0' }}
                      >
                        <option value="">— Select Consultant —</option>
                        {employees.map(e => (
                          <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Franchise field */}
                  <div>
                    <label style={{ display: 'block', color: fieldErrors.franchise_id ? '#dc2626' : '#64748b', fontSize: '12px', marginBottom: '5px' }}>
                      Franchise / Office
                    </label>
                    {user?.role === 'Admin' ? (
                      <select
                        name="franchise_id"
                        value={form.franchise_id || ''}
                        onChange={handleChange}
                        style={{ ...S.input, borderColor: fieldErrors.franchise_id ? '#fca5a5' : '#e2e8f0' }}
                      >
                        <option value="">— Select Franchise —</option>
                        {franchises.map(f => (
                          <option key={f.id} value={f.id}>{f.franchise_name}</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{
                        ...S.input, background: '#f8fafc', color: '#64748b', cursor: 'not-allowed', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0', minHeight: '40px'
                      }}>
                        {franchise?.franchise_name || 'Your franchise'}
                      </div>
                    )}
                    {fieldErrors.franchise_id && <p style={{ color: '#dc2626', fontSize: '11px', margin: '4px 0 0' }}>{fieldErrors.franchise_id}</p>}
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '8px', fontWeight: '500' }}>
                    Application Type * {fieldErrors.app_type && <ErrText msg={fieldErrors.app_type} />}
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[['is_med','MED (Debt Mediation)'],['is_dreview','Debt Review'],['is_drr','DRR (Debt Removal)']].map(([name, label]) => (
                      <label key={name} style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: `1px solid ${form[name] ? '#2563eb' : '#e2e8f0'}`,
                        background: form[name] ? '#eff6ff' : 'white',
                        fontSize: '13px', color: form[name] ? '#2563eb' : '#475569',
                        fontWeight: form[name] ? '600' : '400',
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
                  type="select" options={['', 'Single', 'Married', 'Divorced', 'Widowed']} />
                <div style={{ gridColumn: 'span 2' }}>
                  <WField label="Address" name="client_address" value={form.client_address} onChange={handleChange} />
                </div>
              </div>
            )}

            {/* Step 3 — Financials */}
            {step === 2 && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <WField label="Total Monthly Salary (Before Deductions) *" name="gross_salary" value={form.gross_salary} onChange={handleChange} type="number" error={fieldErrors.gross_salary} placeholder="0.00" />
                <WField label="Take-Home Pay (After Deductions) *" name="nett_salary" value={form.nett_salary} onChange={handleChange} type="number" error={fieldErrors.nett_salary} placeholder="0.00" />
                <WField label="Spouse / Partner Monthly Income" name="spouse_salary" value={form.spouse_salary} onChange={handleChange} type="number" placeholder="0.00" />
                <div style={{ gridColumn: 'span 2', borderTop: '1px solid #f1f5f9', paddingTop: '14px' }}>
                  <p style={S.formSectionTitle}>Monthly Expenses</p>
                </div>
                {[
                  ['Groceries', 'exp_groceries'], ['Rent / Bond', 'exp_rent_bond'],
                  ['Transport', 'exp_transport'], ['School Fees', 'exp_school_fees'],
                  ['Rates', 'exp_rates'], ['Water & Electricity', 'exp_water_elec'],
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
                  type="select" options={['', 'Cheque', 'Savings', 'Transmission']} error={fieldErrors.account_type} />
                <WField
                  label="Debt Review Status"
                  name="debt_review_status"
                  value={form.debt_review_status}
                  onChange={handleChange}
                  type="select"
                  options={['', 'Not Under Debt Review', 'Applied for Debt Review', 'Under Debt Review', 'Debt Review Completed', 'Debt Review Withdrawn']}
                />
                <WField label="Debit Order Date" name="debit_order_date" value={form.debit_order_date} onChange={handleChange} type="date" />
                <WField label="Debit Order Amount" name="debit_order_amount" value={form.debit_order_amount} onChange={handleChange} type="number" placeholder="0.00" />
              </div>
            )}

            {/* Step 4 — Creditors / Banking */}
            {step === 3 && (
              <div>
                {(form.is_med || form.is_drr) ? (
                  /* MED / DRR — banking details only */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div style={{ gridColumn: 'span 2', padding: '10px 14px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                      <p style={{ margin: 0, color: '#1d4ed8', fontSize: '12.5px', fontWeight: '600' }}>
                        {form.is_med ? 'MED (Debt Mediation) — banking details required' : 'DRR (Debt Removal) — banking details required'}
                      </p>
                    </div>
                    <WField label="Bank *" name="bank" value={form.bank} onChange={handleChange} error={fieldErrors.bank} />
                    <WField label="Account Number *" name="account_no" value={form.account_no} onChange={handleChange} error={fieldErrors.account_no} />
                    <WField
                      label="Account Type *"
                      name="account_type"
                      value={form.account_type}
                      onChange={handleChange}
                      type="select"
                      options={['', 'Cheque', 'Savings', 'Transmission']}
                      error={fieldErrors.account_type}
                    />
                    <WField
                      label="Debt Review Status"
                      name="debt_review_status"
                      value={form.debt_review_status}
                      onChange={handleChange}
                      type="select"
                      options={['', 'Not Under Debt Review', 'Applied for Debt Review', 'Under Debt Review', 'Debt Review Completed', 'Debt Review Withdrawn']}
                    />
                    <WField label="Debit Order Date" name="debit_order_date" value={form.debit_order_date} onChange={handleChange} type="date" />
                    <WField label="Debit Order Amount" name="debit_order_amount" value={form.debit_order_amount} onChange={handleChange} type="number" placeholder="0.00" />
                  </div>
                ) : (
                  /* Debt Review — full creditors list */
                  <>
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
                            <WField label="Monthly Installment" name="amount" value={c.amount}
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
                  </>
                )}
              </div>
            )}

            {/* Step 5 — Documents */}
            {step === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ color: '#64748b', fontSize: '13.5px', marginBottom: '8px' }}>
                  Confirm which documents have been received from the applicant.
                </p>
                {[['has_id_copy', 'ID Copy'], ['has_payslip', 'Payslip'], ['has_proof_of_address', 'Proof of Address']].map(([name, label]) => (
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
                    {['Draft', 'Submitted', 'Pending Docs'].map(s => <option key={s} value={s}>{s}</option>)}
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
    const filteredApps = applications.filter(app => {
      const q = search.toLowerCase();
      return (
        `${app.first_name} ${app.last_name}`.toLowerCase().includes(q) ||
        (app.id_number || '').toLowerCase().includes(q) ||
        (app.franchise_name || '').toLowerCase().includes(q) ||
        (app.status || '').toLowerCase().includes(q)
      );
    });

    return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={S.pageTitle}>Applications</h2>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {can(user, 'applications.viewAll') && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#64748b', fontSize: '13px' }}>
              <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
              <span>Show All Branches</span>
            </label>
          )}
          <button onClick={() => generateApplicationForm(null, null)} style={S.ghostBtn}>Empty Template</button>
          <button onClick={() => { setView('form'); setSuccess(''); setError(''); setStep(0); setFieldErrors({}); setForm(getInitialForm()); }}
            className="btn-primary" style={S.primaryBtn}>
            + New Application
          </button>
        </div>
      </div>

      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>{success}</div>}
      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}

      <div style={S.card}>
        <div style={{ padding: '12px 26px 0 26px' }}>
          <input
            type="text"
            placeholder="Search by client name, ID or branch..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ ...S.input, width: '320px', marginBottom: '16px' }}
          />
        </div>
        {loading ? (
          <Spinner size="lg" dark label="Loading applications..." />
        ) : applications.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No applications yet"
            subtitle="Start by creating your first client application."
            action="+ New Application"
            onAction={() => { setView('form'); setStep(0); setForm(getInitialForm()); setIsFormDirty(false); setSuccess(''); setError(''); setFieldErrors({}); }}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr>
                {['Client', 'Date', 'Branch', 'Type', 'Nett Salary', 'Total Expenses', 'Mandate', 'Status', ''].map(h => (
                  <th key={h} style={{ ...S.tableHeader, textAlign: ['Nett Salary', 'Total Expenses'].includes(h) ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredApps.map(app => (
                <tr key={app.id} className="table-row">
                  <td style={{ ...S.tableCell, fontWeight: '500' }}>{app.first_name} {app.last_name}</td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{app.date?.split('T')[0]}</td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{app.franchise_name || '—'}</td>
                  <td style={{ ...S.tableCell, color: '#64748b', fontSize: '12px' }}>
                    {[app.is_med && 'MED', app.is_dreview && 'D.Review', app.is_drr && 'DRR'].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td style={{ ...S.tableCell, textAlign: 'right' }}>
                    {app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ ...S.tableCell, textAlign: 'right' }}>
                    {app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}
                  </td>
                  <td style={S.tableCell}>
                    <MandateBadge status={app.mandate_status} />
                  </td>
                  <td style={S.tableCell}><span style={S.badge(app.status)}>{app.status}</span></td>
                  <td style={S.tableCell}>
                    <button
                      onClick={() => openDetail(app)}
                      disabled={viewingId === app.id}
                      className="btn-link"
                      style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: viewingId === app.id ? 'default' : 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: '4px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      {viewingId === app.id ? <><Spinner size="sm" dark inline /> Opening...</> : 'View'}
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

function MandateBadge({ status }) {
  const styles = {
    Pending:  { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    Uploaded: { background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' },
    Verified: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
  };
  const icons = { Pending: '⏳', Uploaded: '📄', Verified: '✓' };
  const s = styles[status] || styles.Pending;
  return (
    <span style={{
      ...s, padding: '3px 9px', borderRadius: '20px',
      fontSize: '11px', fontWeight: '600',
      display: 'inline-flex', alignItems: 'center', gap: '4px',
    }}>
      {icons[status || 'Pending']} {status || 'Pending'}
    </span>
  );
}

function EditSection({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
        <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{title}</p>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}

function EditGrid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
      {children}
    </div>
  );
}

function EditField({ label, value, onChange, type = 'text', options, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? 'span 2' : 'span 1' }}>
      <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px', fontWeight: '500' }}>
        {label}
      </label>
      {type === 'select' ? (
        <select value={value || ''} onChange={e => onChange(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontFamily: 'DM Sans', background: 'white', color: '#0f172a' }}>
          <option value="">—</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a', boxSizing: 'border-box' }}
        />
      )}
    </div>
  );
}