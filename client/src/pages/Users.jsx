import { useState, useEffect } from 'react';
import api from '../utils/api';
import * as S from '../utils/styles';

const EMPTY_FORM = { username: '', password: '', role: 'Consultant', franchise_id: '' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [resetPasswords, setResetPasswords] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [u, f] = await Promise.all([api.get('/users'), api.get('/franchises')]);
      setUsers(u.data); setFranchises(f.data);
    } catch { setError('Failed to load.'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSubmitting(true); setError('');
    try {
      await api.post('/users', form);
      setSuccess(`User "${form.username}" created.`);
      setShowForm(false); setForm(EMPTY_FORM);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.');
    } finally { setSubmitting(false); }
  };

  const handleToggle = async (id) => {
    try { await api.patch(`/users/${id}/toggle`); fetchData(); }
    catch { setError('Failed to update user.'); }
  };

  const handleResetPassword = async (id) => {
    const pw = resetPasswords[id];
    if (!pw || pw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    try {
      await api.patch(`/users/${id}/password`, { password: pw });
      setSuccess('Password reset.'); setResetPasswords(p => ({ ...p, [id]: '' }));
    } catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={S.pageTitle}>User Management</h2>
        <button onClick={() => { setShowForm(!showForm); setError(''); setSuccess(''); }} style={S.primaryBtn}>
          {showForm ? 'Cancel' : '+ New User'}
        </button>
      </div>

      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>{success}</div>}

      {showForm && (
        <div style={{ ...S.card, marginBottom: '20px', overflow: 'visible' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Create New User</h3>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Username *</label>
              <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                required style={S.input} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Password *</label>
              <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required style={S.input} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Role *</label>
              <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} style={S.input}>
                <option value="Consultant">Consultant</option>
                <option value="HR">HR</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Franchise</label>
              <select value={form.franchise_id} onChange={e => setForm(p => ({ ...p, franchise_id: e.target.value }))} style={S.input}>
                <option value="">— None —</option>
                {franchises.map(f => <option key={f.id} value={f.id}>{f.franchise_name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '10px', marginTop: '4px' }}>
              <button type="submit" disabled={submitting} style={S.primaryBtn}>
                {submitting ? 'Creating...' : 'Create User'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} style={S.ghostBtn}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={S.card}>
        {loading ? (
          <p style={{ padding: '24px', color: '#94a3b8', fontSize: '14px' }}>Loading...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr>
                {['Username', 'Role', 'Franchise', 'Status', 'Reset Password', ''].map(h => (
                  <th key={h} style={S.tableHeader}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{ opacity: u.is_active ? 1 : 0.5 }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ ...S.tableCell, fontWeight: '500' }}>{u.username}</td>
                  <td style={S.tableCell}><span style={S.badge(u.role)}>{u.role}</span></td>
                  <td style={{ ...S.tableCell, color: '#64748b' }}>{u.franchise_name || '—'}</td>
                  <td style={S.tableCell}><span style={S.badge(u.is_active ? 'Active' : 'Inactive')}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                  <td style={S.tableCell}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input type="password" placeholder="New password"
                        value={resetPasswords[u.id] || ''}
                        onChange={e => setResetPasswords(p => ({ ...p, [u.id]: e.target.value }))}
                        style={{ ...S.input, width: '140px', padding: '6px 10px', fontSize: '12px' }} />
                      <button onClick={() => handleResetPassword(u.id)}
                        style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0, whiteSpace: 'nowrap' }}>
                        Reset
                      </button>
                    </div>
                  </td>
                  <td style={S.tableCell}>
                    <button onClick={() => handleToggle(u.id)}
                      style={{ background: 'none', border: 'none', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0, color: u.is_active ? '#dc2626' : '#16a34a' }}>
                      {u.is_active ? 'Deactivate' : 'Activate'}
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