import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';

const EMPTY_FORM = {
  // Step 1
  ext_number: '', branch: '',
  is_med: false, is_dreview: false, is_drr: false,
  is_3in1: false, is_rent_to: false, other_type: '',
  // Step 2
  client_first_name: '', client_last_name: '', client_id_number: '',
  client_cell: '', client_whatsapp: '', client_email: '',
  client_address: '', client_employer: '', client_marital_status: '',
  // Step 3
  gross_salary: '', nett_salary: '', spouse_salary: '',
  exp_groceries: '', exp_rent_bond: '', exp_transport: '',
  exp_school_fees: '', exp_rates: '', exp_water_elec: '',
  bank: '', account_no: '', account_type: '', debt_review_status: '',
  debit_order_date: '', debit_order_amount: '',
  // Step 4 — creditors handled separately
  // Step 5
  has_id_copy: false, has_payslip: false, has_proof_of_address: false,
  status: 'Draft'
};

const EMPTY_CREDITOR = {
  creditor_name: '', account_num_ref: '', balance_of_acc: '', amount: ''
};

const STEPS = ['Call Info', 'Applicant', 'Financials', 'Creditors', 'Documents'];

export default function Applications() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);
  const [creditors, setCreditors] = useState([{ ...EMPTY_CREDITOR }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchApplications(); }, []);

  const fetchApplications = async () => {
    try {
      const res = await api.get('/applications');
      setApplications(res.data);
    } catch (err) {
      setError('Failed to load applications.');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleCreditorChange = (index, e) => {
    const updated = [...creditors];
    updated[index][e.target.name] = e.target.value;
    setCreditors(updated);
  };

  const addCreditor = () => setCreditors(prev => [...prev, { ...EMPTY_CREDITOR }]);

  const removeCreditor = (index) => {
    if (creditors.length === 1) return;
    setCreditors(prev => prev.filter((_, i) => i !== index));
  };

  const totalExpenses = () => {
    const fields = ['exp_groceries', 'exp_rent_bond', 'exp_transport',
      'exp_school_fees', 'exp_rates', 'exp_water_elec'];
    return fields.reduce((sum, f) => sum + (parseFloat(form[f]) || 0), 0).toFixed(2);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      await api.post('/applications', { ...form, creditors });
      setSuccess('Application submitted successfully.');
      setShowForm(false);
      setForm(EMPTY_FORM);
      setCreditors([{ ...EMPTY_CREDITOR }]);
      setStep(0);
      fetchApplications();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  const statusColors = {
    Draft: 'bg-gray-100 text-gray-600',
    Submitted: 'bg-blue-100 text-blue-700',
    'Pending Docs': 'bg-yellow-100 text-yellow-700',
    Approved: 'bg-green-100 text-green-700',
    Rejected: 'bg-red-100 text-red-700'
  };

  // ── Single Application View ───────────────────────────────
  if (selectedApp) {
    const a = selectedApp.application;
    const creds = selectedApp.creditors;
    return (
      <div>
        <button onClick={() => setSelectedApp(null)}
          className="mb-4 text-sm text-blue-600 hover:underline">
          ← Back to Applications
        </button>
        <div className="bg-white rounded-xl shadow p-6 max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800">
              {a.first_name} {a.last_name}
            </h2>
            <span className={`text-xs font-medium px-3 py-1 rounded-full ${statusColors[a.status]}`}>
              {a.status}
            </span>
          </div>

          <ViewSection title="Call Information">
            <ViewRow label="Date" value={a.date?.split('T')[0]} />
            <ViewRow label="Time" value={a.time_of_call?.slice(0,5)} />
            <ViewRow label="Extension" value={a.ext_number} />
            <ViewRow label="Branch" value={a.branch} />
          </ViewSection>

          <ViewSection title="Application Type">
            <div className="col-span-2 flex flex-wrap gap-2">
              {a.is_med && <Badge label="MED" />}
              {a.is_dreview && <Badge label="Debt Review" />}
              {a.is_drr && <Badge label="DRR" />}
              {a.is_3in1 && <Badge label="3-in-1" />}
              {a.is_rent_to && <Badge label="Rent To" />}
              {a.other_type && <Badge label={a.other_type} />}
            </div>
          </ViewSection>

          <ViewSection title="Client Details">
            <ViewRow label="ID Number" value={a.client_id_number} />
            <ViewRow label="Cell" value={a.cell} />
            <ViewRow label="Employer" value={a.employer} />
            <ViewRow label="Marital Status" value={a.client_marital_status} />
          </ViewSection>

          <ViewSection title="Financials">
            <ViewRow label="Gross Salary" value={a.gross_salary && `R ${parseFloat(a.gross_salary).toLocaleString()}`} />
            <ViewRow label="Nett Salary" value={a.nett_salary && `R ${parseFloat(a.nett_salary).toLocaleString()}`} />
            <ViewRow label="Spouse Salary" value={a.spouse_salary && `R ${parseFloat(a.spouse_salary).toLocaleString()}`} />
            <ViewRow label="Total Expenses" value={a.total_expenses && `R ${parseFloat(a.total_expenses).toLocaleString()}`} />
            <ViewRow label="Debit Order Amount" value={a.debit_order_amount && `R ${parseFloat(a.debit_order_amount).toLocaleString()}`} />
            <ViewRow label="Debit Order Date" value={a.debit_order_date} />
          </ViewSection>

          <ViewSection title="Banking">
            <ViewRow label="Bank" value={a.bank} />
            <ViewRow label="Account No" value={a.account_no} />
            <ViewRow label="Account Type" value={a.account_type} />
            <ViewRow label="Debt Review Status" value={a.debt_review_status} />
          </ViewSection>

          <ViewSection title="Documents Checklist">
            <ViewRow label="ID Copy" value={a.has_id_copy ? '✅ Yes' : '❌ No'} />
            <ViewRow label="Payslip" value={a.has_payslip ? '✅ Yes' : '❌ No'} />
            <ViewRow label="Proof of Address" value={a.has_proof_of_address ? '✅ Yes' : '❌ No'} />
          </ViewSection>

          {creds.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 pb-1 border-b">
                Creditors ({creds.length})
              </h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-3 py-2 text-left">Creditor</th>
                    <th className="px-3 py-2 text-left">Ref</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {creds.map((c, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{c.creditor_name}</td>
                      <td className="px-3 py-2 text-gray-500">{c.account_num_ref}</td>
                      <td className="px-3 py-2 text-right">R {parseFloat(c.balance_of_acc || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right">R {parseFloat(c.amount || 0).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(user?.role === 'Admin' || user?.role === 'HR') && (
            <div className="pt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Update Status</label>
              <div className="flex gap-2 flex-wrap">
                {['Draft', 'Submitted', 'Pending Docs', 'Approved', 'Rejected'].map(s => (
                  <button
                    key={s}
                    onClick={async () => {
                      await api.patch(`/applications/${a.id}/status`, { status: s });
                      const res = await api.get(`/applications/${a.id}`);
                      setSelectedApp(res.data);
                      fetchApplications();
                    }}
                    className={`text-xs px-3 py-1 rounded-full border font-medium transition-colors
                      ${a.status === s ? 'border-blue-600 text-blue-600' : 'border-gray-300 text-gray-500 hover:border-blue-400'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Wizard Form ───────────────────────────────────────────
  if (showForm) {
    return (
      <div>
        <button onClick={() => { setShowForm(false); setStep(0); setError(''); }}
          className="mb-4 text-sm text-blue-600 hover:underline">
          ← Back to Applications
        </button>

        {/* Step indicator */}
        <div className="flex items-center mb-6 gap-1">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                ${i === step ? 'text-white' : i < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}
                style={i === step ? { backgroundColor: '#2563eb' } : {}}>
                {i < step ? '✓' : i + 1}
              </div>
              <span className={`text-xs mr-2 ${i === step ? 'font-semibold text-blue-600' : 'text-gray-400'}`}>
                {s}
              </span>
              {i < STEPS.length - 1 && <div className="w-6 h-px bg-gray-300 mr-1" />}
            </div>
          ))}
        </div>

        {error && <Alert type="error" message={error} />}

        <div className="bg-white rounded-xl shadow p-6 max-w-3xl">

          {/* Step 1 — Call Info */}
          {step === 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-700 mb-4">Call Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <AField label="Extension Number" name="ext_number" value={form.ext_number} onChange={handleChange} />
                <AField label="Branch" name="branch" value={form.branch} onChange={handleChange} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Application Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    ['is_med', 'MED'],
                    ['is_dreview', 'Debt Review'],
                    ['is_drr', 'DRR'],
                    ['is_3in1', '3-in-1'],
                    ['is_rent_to', 'Rent To'],
                  ].map(([name, label]) => (
                    <label key={name} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" name={name} checked={form[name]} onChange={handleChange}
                        className="rounded" />
                      {label}
                    </label>
                  ))}
                </div>
                <div className="mt-3">
                  <AField label="Other (specify)" name="other_type" value={form.other_type} onChange={handleChange} />
                </div>
              </div>
            </div>
          )}

          {/* Step 2 — Applicant Details */}
          {step === 1 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-4">Applicant Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <AField label="First Name *" name="client_first_name" value={form.client_first_name} onChange={handleChange} required />
                <AField label="Last Name *" name="client_last_name" value={form.client_last_name} onChange={handleChange} required />
                <AField label="ID Number" name="client_id_number" value={form.client_id_number} onChange={handleChange} />
                <AField label="Cell" name="client_cell" value={form.client_cell} onChange={handleChange} />
                <AField label="WhatsApp" name="client_whatsapp" value={form.client_whatsapp} onChange={handleChange} />
                <AField label="Email" name="client_email" value={form.client_email} onChange={handleChange} type="email" />
                <AField label="Employer" name="client_employer" value={form.client_employer} onChange={handleChange} />
                <AField label="Marital Status" name="client_marital_status" value={form.client_marital_status}
                  onChange={handleChange} type="select"
                  options={['', 'Single', 'Married', 'Divorced', 'Widowed']} />
                <div className="col-span-2">
                  <AField label="Address" name="client_address" value={form.client_address} onChange={handleChange} />
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — Financials */}
          {step === 2 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-4">Income & Expenses</h3>
              <div className="grid grid-cols-2 gap-4">
                <AField label="Gross Salary" name="gross_salary" value={form.gross_salary} onChange={handleChange} type="number" />
                <AField label="Nett Salary" name="nett_salary" value={form.nett_salary} onChange={handleChange} type="number" />
                <AField label="Spouse Salary" name="spouse_salary" value={form.spouse_salary} onChange={handleChange} type="number" />
                <div className="col-span-2 border-t pt-3 mt-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Monthly Expenses</p>
                </div>
                <AField label="Groceries" name="exp_groceries" value={form.exp_groceries} onChange={handleChange} type="number" />
                <AField label="Rent / Bond" name="exp_rent_bond" value={form.exp_rent_bond} onChange={handleChange} type="number" />
                <AField label="Transport" name="exp_transport" value={form.exp_transport} onChange={handleChange} type="number" />
                <AField label="School Fees" name="exp_school_fees" value={form.exp_school_fees} onChange={handleChange} type="number" />
                <AField label="Rates" name="exp_rates" value={form.exp_rates} onChange={handleChange} type="number" />
                <AField label="Water & Electricity" name="exp_water_elec" value={form.exp_water_elec} onChange={handleChange} type="number" />
                <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex justify-between items-center">
                  <span className="text-sm font-semibold text-blue-700">Total Expenses</span>
                  <span className="text-lg font-bold text-blue-700">R {parseFloat(totalExpenses()).toLocaleString()}</span>
                </div>
                <div className="col-span-2 border-t pt-3 mt-1">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Banking & Debit Order</p>
                </div>
                <AField label="Bank" name="bank" value={form.bank} onChange={handleChange} />
                <AField label="Account Number" name="account_no" value={form.account_no} onChange={handleChange} />
                <AField label="Account Type" name="account_type" value={form.account_type} onChange={handleChange}
                  type="select" options={['', 'Cheque', 'Savings', 'Transmission']} />
                <AField label="Debt Review Status" name="debt_review_status" value={form.debt_review_status} onChange={handleChange} />
                <AField label="Debit Order Date" name="debit_order_date" value={form.debit_order_date} onChange={handleChange} />
                <AField label="Debit Order Amount" name="debit_order_amount" value={form.debit_order_amount} onChange={handleChange} type="number" />
              </div>
            </div>
          )}

          {/* Step 4 — Creditors */}
          {step === 3 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-4">Loans & Accounts</h3>
              <div className="space-y-3">
                {creditors.map((c, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-semibold text-gray-500 uppercase">Creditor {i + 1}</span>
                      {creditors.length > 1 && (
                        <button onClick={() => removeCreditor(i)}
                          className="text-xs text-red-500 hover:text-red-700">
                          Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <AField label="Creditor Name" name="creditor_name" value={c.creditor_name}
                        onChange={(e) => handleCreditorChange(i, e)} />
                      <AField label="Account / Ref No" name="account_num_ref" value={c.account_num_ref}
                        onChange={(e) => handleCreditorChange(i, e)} />
                      <AField label="Balance of Account" name="balance_of_acc" value={c.balance_of_acc}
                        onChange={(e) => handleCreditorChange(i, e)} type="number" />
                      <AField label="Monthly Amount" name="amount" value={c.amount}
                        onChange={(e) => handleCreditorChange(i, e)} type="number" />
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={addCreditor}
                className="mt-3 text-sm font-medium py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg w-full text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                + Add Another Creditor
              </button>
            </div>
          )}

          {/* Step 5 — Documents */}
          {step === 4 && (
            <div>
              <h3 className="font-semibold text-gray-700 mb-4">Document Checklist</h3>
              <p className="text-sm text-gray-500 mb-4">
                Confirm which documents have been received from the applicant.
              </p>
              <div className="space-y-3">
                {[
                  ['has_id_copy', 'ID Copy'],
                  ['has_payslip', 'Payslip'],
                  ['has_proof_of_address', 'Proof of Address'],
                ].map(([name, label]) => (
                  <label key={name}
                    className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" name={name} checked={form[name]} onChange={handleChange}
                      className="w-4 h-4" />
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-4">
                <AField label="Initial Status" name="status" value={form.status} onChange={handleChange}
                  type="select" options={['Draft', 'Submitted', 'Pending Docs']} />
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-6 pt-4 border-t">
            <button
              onClick={() => setStep(s => s - 1)}
              disabled={step === 0}
              className="text-sm font-medium py-2 px-4 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 transition-colors"
            >
              ← Previous
            </button>
            {step < STEPS.length - 1 ? (
              <button
                onClick={() => {
                  if (step === 1 && !form.client_first_name) {
                    setError('Client first name is required.');
                    return;
                  }
                  setError('');
                  setStep(s => s + 1);
                }}
                className="text-sm font-medium py-2 px-4 rounded-lg text-white transition-colors"
                style={{ backgroundColor: '#2563eb' }}
              >
                Next →
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="text-sm font-medium py-2 px-4 rounded-lg text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#16a34a' }}
              >
                {submitting ? 'Submitting...' : '✓ Submit Application'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Applications Table ────────────────────────────────────
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-3">Applications</h2>
        <button
          onClick={() => { setShowForm(true); setSuccess(''); setError(''); setStep(0); }}
          className="text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          style={{ backgroundColor: '#2563eb' }}
        >
          + New Application
        </button>
      </div>

      {success && <Alert type="success" message={success} />}
      {error && <Alert type="error" message={error} />}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Loading applications...</p>
        ) : applications.length === 0 ? (
          <p className="p-6 text-gray-500 text-sm">No applications yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
              <tr>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Nett Salary</th>
                <th className="px-4 py-3 text-right">Total Expenses</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {applications.map(app => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {app.first_name} {app.last_name}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {app.date?.split('T')[0]}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {[
                      app.is_med && 'MED',
                      app.is_dreview && 'D.Review',
                      app.is_drr && 'DRR',
                      app.is_3in1 && '3-in-1',
                    ].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[app.status]}`}>
                      {app.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={async () => {
                        const res = await api.get(`/applications/${app.id}`);
                        setSelectedApp(res.data);
                      }}
                      className="text-blue-600 hover:underline text-xs font-medium"
                    >
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

// ── Helper Components ─────────────────────────────────────

function AField({ label, name, value, onChange, type = 'text', options, required }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {type === 'select' ? (
        <select name={name} value={value} onChange={onChange}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          {options.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
        </select>
      ) : (
        <input type={type} name={name} value={value} onChange={onChange} required={required}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      )}
    </div>
  );
}

function ViewSection({ title, children }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 pb-1 border-b">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function ViewRow({ label, value }) {
  return (
    <>
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm text-gray-800">{value || '—'}</span>
    </>
  );
}

function Badge({ label }) {
  return (
    <span className="text-xs font-medium px-2 py-1 rounded-full bg-blue-100 text-blue-700">
      {label}
    </span>
  );
}

function Alert({ type, message }) {
  const styles = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700';
  return (
    <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${styles}`}>
      {message}
    </div>
  );
}