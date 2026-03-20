import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import { can } from '../utils/access';
import api from '../utils/api';
import * as S from '../utils/styles';
import { generateEmployeeForm } from '../utils/pdfGenerator';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';

const TITLES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof'];
const MARITAL = ['Single', 'Married', 'Divorced', 'Widowed'];
const ACCOUNT_TYPES = ['Cheque', 'Savings', 'Transmission'];

export default function Employees() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [employees, setEmployees] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState('list'); // list | detail | edit
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({});
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const LIMIT = 20;

  useEffect(() => { fetchFranchises(); }, []);

  useEffect(() => {
    setPage(1);
    fetchEmployees(1);
  }, [search]);

  useEffect(() => {
    fetchEmployees(page);
  }, [page]);

  const handlePageChange = (p) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  const fetchEmployees = async (p = page) => {
    setLoading(true);
    try {
      const q = [];
      if (user?.role !== 'Admin' && user?.franchise_id) q.push(`franchise_id=${user.franchise_id}`);
      q.push(`page=${p}`);
      q.push(`limit=${LIMIT}`);

      const res = await api.get(`/employees?${q.join('&')}`);
      setEmployees(res.data.data ? res.data.data : res.data);
      if (res.data.pagination) setPagination(res.data.pagination);
    } catch { setError('Failed to load employees.'); }
    finally { setLoading(false); }
  };

  const fetchFranchises = async () => {
    try {
      const res = await api.get('/franchises');
      setFranchises(res.data);
    } catch {}
  };

  const openDetail = (emp) => {
    setSelected(emp);
    setView('detail');
    setError(''); setSuccess('');
  };

  const openEdit = (emp) => {
    setSelected(emp);
    setForm({ ...emp });
    setView('edit');
    setError(''); setSuccess('');
  };

  const handleSave = async () => {
    if (!form.first_name) {
      setError('First name is required.');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await api.patch(`/employees/${selected.id}`, form);
      setSelected(res.data);
      setEmployees(prev => prev.map(e => e.id === res.data.id ? res.data : e));
      setSuccess('Employee updated successfully.');
      setView('detail');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save changes.');
    } finally { setSaving(false); }
  };

  const f = (key) => form[key] || '';
  const set = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

  const filtered = employees.filter(e => {
    const q = search.toLowerCase();
    return (
      e.first_name?.toLowerCase().includes(q) ||
      e.last_name?.toLowerCase().includes(q) ||
      e.id_number?.toLowerCase().includes(q) ||
      e.email?.toLowerCase().includes(q) ||
      e.job_title?.toLowerCase().includes(q)
    );
  });

  // ── EDIT VIEW ──────────────────────────────────────────
  if (view === 'edit') {
    return (
      <div style={{ maxWidth: '800px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => { setView('detail'); setError(''); }}
              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
              ← Back
            </button>
            <h2 style={{ ...S.pageTitle, margin: 0 }}>
              Edit — {selected?.first_name} {selected?.last_name}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setView('detail'); setError(''); }} style={S.ghostBtn}>Cancel</button>
            <button onClick={handleSave} disabled={saving}
              style={{ ...S.primaryBtn, opacity: saving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>

        {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

        {/* Form sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Personal */}
          <FormSection title="Personal Details">
            <FormGrid>
              <FormField label="Title">
                <select value={f('title')} onChange={set('title')} style={S.input}>
                  <option value="">—</option>
                  {TITLES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="First Name *">
                <input value={f('first_name')} onChange={set('first_name')} style={S.input} />
              </FormField>
              <FormField label="Last Name">
                <input value={f('last_name')} onChange={set('last_name')} style={S.input} />
              </FormField>
              <FormField label="ID Number">
                <input value={f('id_number')} onChange={set('id_number')} style={S.input} maxLength={13} />
              </FormField>
              <FormField label="Tax Number">
                <input value={f('tax_number')} onChange={set('tax_number')} style={S.input} />
              </FormField>
              <FormField label="Date of Birth">
                <input type="date" value={f('birth_date')?.split('T')[0] || ''} onChange={set('birth_date')} style={S.input} />
              </FormField>
              <FormField label="Marital Status">
                <select value={f('marital_status')} onChange={set('marital_status')} style={S.input}>
                  <option value="">—</option>
                  {MARITAL.map(m => <option key={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="Job Title">
                <input value={f('job_title')} onChange={set('job_title')} style={S.input} placeholder="e.g. Debt Consultant" />
              </FormField>
              <FormField label="Employment Date">
                <input type="date" value={f('employment_date')?.split('T')[0] || ''} onChange={set('employment_date')} style={S.input} />
              </FormField>
            </FormGrid>
          </FormSection>

          {/* Contact */}
          <FormSection title="Contact Details">
            <FormGrid>
              <FormField label="Email">
                <input type="email" value={f('email')} onChange={set('email')} style={S.input} />
              </FormField>
              <FormField label="Cell">
                <input value={f('cell')} onChange={set('cell')} style={S.input} placeholder="e.g. 082 123 4567" />
              </FormField>
              <FormField label="WhatsApp">
                <input value={f('whatsapp')} onChange={set('whatsapp')} style={S.input} />
              </FormField>
              <FormField label="Home Phone">
                <input value={f('home_phone')} onChange={set('home_phone')} style={S.input} />
              </FormField>
              <FormField label="Alternate Phone">
                <input value={f('alternate_phone')} onChange={set('alternate_phone')} style={S.input} />
              </FormField>
            </FormGrid>
          </FormSection>

          {/* Address */}
          <FormSection title="Address">
            <FormGrid>
              <FormField label="Street Address" span={2}>
                <input value={f('address_street')} onChange={set('address_street')} style={S.input} />
              </FormField>
              <FormField label="City">
                <input value={f('address_city')} onChange={set('address_city')} style={S.input} />
              </FormField>
              <FormField label="Postal Code">
                <input value={f('postal_code')} onChange={set('postal_code')} style={S.input} />
              </FormField>
            </FormGrid>
          </FormSection>

          {/* Health */}
          <FormSection title="Health">
            <FormField label="Allergies / Health Concerns">
              <textarea
                value={f('allergies_health_concerns')}
                onChange={set('allergies_health_concerns')}
                rows={3} style={{ ...S.input, resize: 'vertical' }}
                placeholder="None"
              />
            </FormField>
          </FormSection>

          {/* Emergency Contact */}
          <FormSection title="Emergency Contact">
            <FormGrid>
              <FormField label="Title">
                <select value={f('ec_title')} onChange={set('ec_title')} style={S.input}>
                  <option value="">—</option>
                  {TITLES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="First Name">
                <input value={f('ec_first_name')} onChange={set('ec_first_name')} style={S.input} />
              </FormField>
              <FormField label="Last Name">
                <input value={f('ec_last_name')} onChange={set('ec_last_name')} style={S.input} />
              </FormField>
              <FormField label="Relationship">
                <input value={f('ec_relationship')} onChange={set('ec_relationship')} style={S.input} placeholder="e.g. Spouse, Parent" />
              </FormField>
              <FormField label="Primary Phone">
                <input value={f('ec_primary_phone')} onChange={set('ec_primary_phone')} style={S.input} />
              </FormField>
              <FormField label="Alternate Phone">
                <input value={f('ec_alternate_phone')} onChange={set('ec_alternate_phone')} style={S.input} />
              </FormField>
              <FormField label="Address" span={2}>
                <input value={f('ec_address')} onChange={set('ec_address')} style={S.input} />
              </FormField>
            </FormGrid>
          </FormSection>

          {/* Banking */}
          <FormSection title="Banking Details">
            <FormGrid>
              <FormField label="Bank Name">
                <input value={f('bank_name')} onChange={set('bank_name')} style={S.input} placeholder="e.g. ABSA, FNB, Nedbank" />
              </FormField>
              <FormField label="Account Name">
                <input value={f('account_name')} onChange={set('account_name')} style={S.input} />
              </FormField>
              <FormField label="Account Number">
                <input value={f('account_number')} onChange={set('account_number')} style={S.input} />
              </FormField>
              <FormField label="Account Type">
                <select value={f('account_type')} onChange={set('account_type')} style={S.input}>
                  <option value="">—</option>
                  {ACCOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </FormField>
              <FormField label="Branch Name">
                <input value={f('branch_name')} onChange={set('branch_name')} style={S.input} />
              </FormField>
              <FormField label="Branch Code">
                <input value={f('branch_code')} onChange={set('branch_code')} style={S.input} />
              </FormField>
            </FormGrid>
          </FormSection>

          {/* Franchise — Admin only */}
          {user?.role === 'Admin' && (
            <FormSection title="Assignment">
              <FormField label="Franchise">
                <select value={f('franchise_id')} onChange={set('franchise_id')} style={S.input}>
                  <option value="">— Unassigned —</option>
                  {franchises.map(fr => (
                    <option key={fr.id} value={fr.id}>{fr.franchise_name}</option>
                  ))}
                </select>
              </FormField>
            </FormSection>
          )}

        </div>

        {/* Bottom save */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button onClick={() => { setView('detail'); setError(''); }} style={S.ghostBtn}>Cancel</button>
          <button onClick={handleSave} disabled={saving}
            style={{ ...S.primaryBtn, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  // ── DETAIL VIEW ────────────────────────────────────────
  if (view === 'detail' && selected) {
    return (
      <div style={{ maxWidth: '800px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setView('list')}
              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
              ← Back
            </button>
            <h2 style={{ ...S.pageTitle, margin: 0 }}>
              {selected.title} {selected.first_name} {selected.last_name}
            </h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={async () => await generateEmployeeForm(selected)} style={S.ghostBtn}>
              ↓ PDF
            </button>
            {can(user, 'employees.edit') && (
              <button onClick={() => openEdit(selected)} style={S.primaryBtn}>
                Edit Details
              </button>
            )}
          </div>
        </div>

        {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>{success}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <DetailSection title="Personal Details" data={[
            { label: 'Title', value: selected.title },
            { label: 'Full Name', value: `${selected.first_name || ''} ${selected.last_name || ''}`.trim() },
            { label: 'ID Number', value: selected.id_number },
            { label: 'Tax Number', value: selected.tax_number },
            { label: 'Date of Birth', value: selected.birth_date?.split('T')[0] },
            { label: 'Marital Status', value: selected.marital_status },
            { label: 'Job Title', value: selected.job_title },
            { label: 'Employment Date', value: selected.employment_date?.split('T')[0] },
            { label: 'Franchise', value: selected.franchise_name },
          ]} />
          <DetailSection title="Contact" data={[
            { label: 'Email', value: selected.email },
            { label: 'Cell', value: selected.cell },
            { label: 'WhatsApp', value: selected.whatsapp },
            { label: 'Home Phone', value: selected.home_phone },
            { label: 'Alternate Phone', value: selected.alternate_phone },
          ]} />
          <DetailSection title="Address" data={[
            { label: 'Street', value: selected.address_street },
            { label: 'City', value: selected.address_city },
            { label: 'Postal Code', value: selected.postal_code },
          ]} />
          <DetailSection title="Emergency Contact" data={[
            { label: 'Name', value: `${selected.ec_title || ''} ${selected.ec_first_name || ''} ${selected.ec_last_name || ''}`.trim() },
            { label: 'Relationship', value: selected.ec_relationship },
            { label: 'Primary Phone', value: selected.ec_primary_phone },
            { label: 'Alternate Phone', value: selected.ec_alternate_phone },
            { label: 'Address', value: selected.ec_address },
          ]} />
          <DetailSection title="Health" data={[
            { label: 'Allergies / Health Concerns', value: selected.allergies_health_concerns || 'None' },
          ]} />
          <DetailSection title="Banking" data={[
            { label: 'Bank', value: selected.bank_name },
            { label: 'Account Name', value: selected.account_name },
            { label: 'Account Number', value: selected.account_number },
            { label: 'Account Type', value: selected.account_type },
            { label: 'Branch Name', value: selected.branch_name },
            { label: 'Branch Code', value: selected.branch_code },
          ]} />
        </div>
      </div>
    );
  }

  // ── LIST VIEW ──────────────────────────────────────────
  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={S.pageTitle}>Employees</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name, ID, email..."
            style={{ ...S.input, width: isMobile ? '100%' : '220px', margin: 0 }}
          />
        </div>
      </div>

      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="👤"
            title="No employees yet"
            subtitle="Add your first employee to get started."
            action="+ Add Employee"
            onAction={() => setView('form')}
          />
        ) : isMobile ? (
          <div>
            {filtered.map((emp, i) => (
              <div key={emp.id} onClick={() => openDetail(emp)}
                style={{ padding: '14px 18px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none', cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <span style={{ fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>
                    {emp.first_name} {emp.last_name}
                  </span>
                  <span style={{ color: '#2563eb', fontSize: '12px', fontWeight: '600' }}>View</span>
                </div>
                <p style={{ margin: 0, fontSize: '12px', color: '#64748b' }}>
                  {emp.job_title || 'No title'} · {emp.franchise_name || 'No branch'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Name', 'ID Number', 'Job Title', 'Cell', 'Franchise', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 22px', textAlign: 'left',
                    color: '#94a3b8', fontSize: '11px', fontWeight: '600',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id} className="table-row" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 22px', fontWeight: '500', color: '#0f172a' }}>
                    {emp.first_name} {emp.last_name}
                  </td>
                  <td style={{ padding: '12px 22px', color: '#64748b' }}>
                    {emp.id_number || '—'}
                  </td>
                  <td style={{ padding: '12px 22px', color: '#64748b' }}>
                    {emp.job_title || '—'}
                  </td>
                  <td style={{ padding: '12px 22px', color: '#64748b' }}>
                    {emp.cell || emp.home_phone || '—'}
                  </td>
                  <td style={{ padding: '12px 22px' }}>
                    {emp.franchise_name ? (
                      <span style={{
                        background: '#eff6ff', color: '#2563eb',
                        padding: '2px 8px', borderRadius: '4px',
                        fontSize: '11px', fontWeight: '600',
                      }}>{emp.franchise_name}</span>
                    ) : '—'}
                  </td>
                  <td style={{ padding: '12px 22px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => openDetail(emp)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
                        View
                      </button>
                      {can(user, 'employees.edit') && (
                        <button onClick={() => openEdit(emp)}
                          style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
                          Edit
                        </button>
                      )}
                    </div>
                  </td>
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
          </>
        )}
      </div>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────

function FormSection({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
        <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{title}</p>
      </div>
      <div style={{ padding: '18px 20px' }}>{children}</div>
    </div>
  );
}

function FormGrid({ children }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
      {children}
    </div>
  );
}

function FormField({ label, children, span }) {
  return (
    <div style={{ gridColumn: span === 2 ? 'span 2' : 'span 1' }}>
      <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px', fontWeight: '500' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function DetailSection({ title, data }) {
  const hasValues = data.some(d => d.value);
  if (!hasValues) return null;
  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
      <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
        <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{title}</p>
      </div>
      <div style={{ padding: '4px 0' }}>
        {data.filter(d => d.value).map((item, i) => (
          <div key={i} style={{
            display: 'flex', padding: '10px 20px',
            borderBottom: i < data.filter(d => d.value).length - 1 ? '1px solid #f8fafc' : 'none',
          }}>
            <span style={{ color: '#94a3b8', fontSize: '12.5px', width: '160px', flexShrink: 0 }}>{item.label}</span>
            <span style={{ color: '#0f172a', fontSize: '13px', fontWeight: '500' }}>{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}