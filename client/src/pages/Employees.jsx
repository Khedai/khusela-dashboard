import { useState, useEffect } from 'react';
import api from '../utils/api';
import * as S from '../utils/styles';

const EMPTY_FORM = {
  title: '', first_name: '', last_name: '', id_number: '', tax_number: '',
  birth_date: '', marital_status: '', email: '', home_phone: '', alternate_phone: '',
  address_street: '', address_city: '', postal_code: '',
  allergies_health_concerns: '',
  ec_title: '', ec_first_name: '', ec_last_name: '', ec_address: '',
  ec_primary_phone: '', ec_alternate_phone: '', ec_relationship: '',
  bank_name: '', branch_name: '', branch_code: '', account_name: '', account_number: ''
};

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // 'list' | 'form' | 'detail'
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchEmployees(); }, []);

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees');
      setEmployees(res.data);
    } catch { setError('Failed to load employees.'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true); setError('');
    try {
      await api.post('/employees', form);
      setSuccess('Employee onboarded successfully.');
      setView('list'); setForm(EMPTY_FORM);
      fetchEmployees();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save.');
    } finally { setSubmitting(false); }
  };

  const filtered = employees.filter(e =>
    `${e.first_name} ${e.last_name} ${e.id_number || ''} ${e.email || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  // Detail view
  if (view === 'detail' && selected) {
    const e = selected;
    return (
      <div style={{ maxWidth: '800px' }}>
        <BackButton onClick={() => setView('list')} />
        <div style={S.card}>
          <div style={{ padding: '22px 26px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ ...S.pageTitle, fontSize: '18px' }}>{e.title} {e.first_name} {e.last_name}</h2>
              <p style={{ color: '#64748b', fontSize: '13px', margin: '2px 0 0' }}>{e.email || 'No email'}</p>
            </div>
          </div>
          <div style={{ padding: '24px 26px' }}>
            {[
              { title: 'Personal Information', rows: [
                ['ID Number', e.id_number], ['Tax Number', e.tax_number],
                ['Date of Birth', e.birth_date?.split('T')[0]], ['Marital Status', e.marital_status],
                ['Home Phone', e.home_phone], ['Alternate Phone', e.alternate_phone],
              ]},
              { title: 'Address', rows: [
                ['Street', e.address_street], ['City', e.address_city], ['Postal Code', e.postal_code],
              ]},
              { title: 'Health', rows: [['Allergies / Concerns', e.allergies_health_concerns]] },
              { title: 'Emergency Contact', rows: [
                ['Name', [e.ec_title, e.ec_first_name, e.ec_last_name].filter(Boolean).join(' ')],
                ['Relationship', e.ec_relationship], ['Primary Phone', e.ec_primary_phone],
                ['Alternate Phone', e.ec_alternate_phone], ['Address', e.ec_address],
              ]},
              { title: 'Bank Details', rows: [
                ['Bank', e.bank_name], ['Branch', e.branch_name],
                ['Branch Code', e.branch_code], ['Account Name', e.account_name],
                ['Account Number', e.account_number],
              ]},
            ].map(section => (
              <div key={section.title} style={S.formSection}>
                <p style={S.formSectionTitle}>{section.title}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
                  {section.rows.map(([label, value]) => (
                    <div key={label}>
                      <span style={{ color: '#94a3b8', fontSize: '12px' }}>{label}</span>
                      <p style={{ color: '#0f172a', fontSize: '13.5px', margin: '2px 0 0', fontWeight: '500' }}>{value || '—'}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Onboarding form
  if (view === 'form') {
    return (
      <div style={{ maxWidth: '800px' }}>
        <BackButton onClick={() => { setView('list'); setError(''); }} />
        <div style={{ ...S.card, overflow: 'visible' }}>
          <div style={{ padding: '22px 26px', borderBottom: '1px solid #f1f5f9' }}>
            <h2 style={{ ...S.pageTitle, fontSize: '18px' }}>Onboard New Employee</h2>
          </div>
          {error && <AlertBanner type="error" message={error} />}
          <form onSubmit={handleSubmit} style={{ padding: '24px 26px' }}>
            {[
              { title: 'Personal Information', fields: [
                { label: 'Title', name: 'title', type: 'select', options: ['', 'Mr', 'Mrs', 'Ms', 'Dr', 'Prof'] },
                { label: 'First Name *', name: 'first_name', required: true },
                { label: 'Last Name *', name: 'last_name', required: true },
                { label: 'ID Number', name: 'id_number' },
                { label: 'Tax Number', name: 'tax_number' },
                { label: 'Date of Birth', name: 'birth_date', type: 'date' },
                { label: 'Marital Status', name: 'marital_status', type: 'select', options: ['', 'Single', 'Married', 'Divorced', 'Widowed'] },
                { label: 'Email', name: 'email', type: 'email' },
                { label: 'Home Phone', name: 'home_phone' },
                { label: 'Alternate Phone', name: 'alternate_phone' },
              ]},
              { title: 'Address', fields: [
                { label: 'Street Address', name: 'address_street', span: 2 },
                { label: 'City', name: 'address_city' },
                { label: 'Postal Code', name: 'postal_code' },
              ]},
              { title: 'Emergency Contact', fields: [
                { label: 'Title', name: 'ec_title', type: 'select', options: ['', 'Mr', 'Mrs', 'Ms', 'Dr'] },
                { label: 'First Name', name: 'ec_first_name' },
                { label: 'Last Name', name: 'ec_last_name' },
                { label: 'Relationship', name: 'ec_relationship' },
                { label: 'Primary Phone', name: 'ec_primary_phone' },
                { label: 'Alternate Phone', name: 'ec_alternate_phone' },
                { label: 'Address', name: 'ec_address', span: 2 },
              ]},
              { title: 'Bank Details', fields: [
                { label: 'Bank Name', name: 'bank_name' },
                { label: 'Branch Name', name: 'branch_name' },
                { label: 'Branch Code', name: 'branch_code' },
                { label: 'Account Name', name: 'account_name' },
                { label: 'Account Number', name: 'account_number' },
              ]},
            ].map(section => (
              <div key={section.title} style={S.formSection}>
                <p style={S.formSectionTitle}>{section.title}</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {section.fields.map(f => (
                    <div key={f.name} style={{ gridColumn: f.span === 2 ? 'span 2' : 'span 1' }}>
                      <FormField field={f} value={form[f.name]}
                        onChange={e => setForm(p => ({ ...p, [f.name]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div style={{ marginBottom: '24px' }}>
              <p style={S.formSectionTitle}>Health</p>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '6px' }}>Allergies / Health Concerns</label>
              <textarea name="allergies_health_concerns" value={form.allergies_health_concerns}
                onChange={e => setForm(p => ({ ...p, allergies_health_concerns: e.target.value }))}
                rows={3} style={{ ...S.input, resize: 'vertical' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={submitting} style={S.primaryBtn}>
                {submitting ? 'Saving...' : 'Save Employee'}
              </button>
              <button type="button" onClick={() => { setView('list'); setError(''); }} style={S.ghostBtn}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Directory list
  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={S.pageTitle}>Employee Directory</h2>
        <button onClick={() => { setView('form'); setSuccess(''); setError(''); }} style={S.primaryBtn}>
          + Onboard Employee
        </button>
      </div>

      {success && <AlertBanner type="success" message={success} />}
      {error && <AlertBanner type="error" message={error} />}

      <input
        type="text" placeholder="Search by name, ID or email..."
        value={search} onChange={e => setSearch(e.target.value)}
        style={{ ...S.input, width: '320px', marginBottom: '16px' }}
      />

      <div style={S.card}>
        {loading ? (
          <p style={{ padding: '24px', color: '#94a3b8', fontSize: '14px' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <p style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No employees found.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr>
                {['Name', 'ID Number', 'Email', 'Phone', 'Marital Status', ''].map(h => (
                  <th key={h} style={S.tableHeader}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => (
                <tr key={emp.id}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...S.tableCell, fontWeight: '500' }}>{emp.title} {emp.first_name} {emp.last_name}</td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{emp.id_number || '—'}</td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{emp.email || '—'}</td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{emp.home_phone || '—'}</td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{emp.marital_status || '—'}</td>
                  <td style={S.tableCell}>
                    <button onClick={() => { setSelected(emp); setView('detail'); }}
                      style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
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

function FormField({ field, value, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>{field.label}</label>
      {field.type === 'select' ? (
        <select value={value} onChange={onChange} style={{ ...S.input }}>
          {field.options.map(o => <option key={o} value={o}>{o || '— Select —'}</option>)}
        </select>
      ) : (
        <input type={field.type || 'text'} value={value} onChange={onChange}
          required={field.required} style={S.input} />
      )}
    </div>
  );
}

function BackButton({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', marginBottom: '16px', padding: 0 }}>
      ← Back
    </button>
  );
}

function AlertBanner({ type, message }) {
  return (
    <div style={{
      margin: '0 26px 16px',
      padding: '11px 14px',
      borderRadius: '8px',
      fontSize: '13.5px',
      background: type === 'error' ? '#fef2f2' : '#f0fdf4',
      color: type === 'error' ? '#dc2626' : '#16a34a',
      border: `1px solid ${type === 'error' ? '#fecaca' : '#bbf7d0'}`,
    }}>
      {message}
    </div>
  );
}