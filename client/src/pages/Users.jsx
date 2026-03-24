import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import api from '../utils/api';
import * as S from '../utils/styles';

const ROLES = ['Admin', 'HR', 'Consultant'];

export default function Users() {
  const { user } = useAuth();
  const isMobile = useIsMobile();

  const [users, setUsers] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list | create
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'Consultant',
    franchise_id: '',
  });

  useEffect(() => {
    fetchUsers();
    fetchFranchises();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch { setError('Failed to load users.'); }
    finally { setLoading(false); }
  };

  const fetchFranchises = async () => {
    try {
      const res = await api.get('/franchises');
      setFranchises(res.data);
    } catch { }
  };

  const handleCreate = async () => {
    if (!form.username || !form.password || !form.role) {
      setError('Username, password and role are required.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!form.franchise_id && form.role !== 'Admin') {
      setError('Please assign a franchise.');
      return;
    }
    setCreating(true); setError(''); setSuccess('');
    try {
      await api.post('/auth/signup', form);
      setSuccess(`Account created for @${form.username}.`);
      setForm({ username: '', password: '', role: 'Consultant', franchise_id: '' });
      setView('list');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account.');
    } finally { setCreating(false); }
  };

  const handleToggle = async (u) => {
    if (!window.confirm(`${u.is_active ? 'Deactivate' : 'Activate'} @${u.username}?`)) return;
    setTogglingId(u.id); setError(''); setSuccess('');
    try {
      await api.patch(`/users/${u.id}/toggle`);
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_active: !x.is_active } : x));
      setSuccess(`@${u.username} ${u.is_active ? 'deactivated' : 'activated'}.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user.');
    } finally { setTogglingId(null); }
  };

  const handleResetPassword = async (u) => {
    const newPassword = window.prompt(`Set new password for @${u.username}:`);
    if (!newPassword) return;
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setResettingId(u.id); setError(''); setSuccess('');
    try {
      await api.patch(`/users/${u.id}/reset-password`, { password: newPassword });
      setSuccess(`Password updated for @${u.username}.`);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password.');
    } finally { setResettingId(null); }
  };

  const roleColor = (role) => {
    if (role === 'Admin') return { background: '#f5f3ff', color: '#7c3aed' };
    if (role === 'HR') return { background: '#eff6ff', color: '#2563eb' };
    return { background: '#f0fdf4', color: '#16a34a' };
  };

  const passwordStrength = (p) => {
    if (!p) return null;
    if (p.length < 8) return { label: 'Too short', color: '#dc2626', width: '25%' };
    let score = 0;
    if (p.length >= 10) score++;
    if (/[A-Z]/.test(p)) score++;
    if (/[0-9]/.test(p)) score++;
    if (/[^A-Za-z0-9]/.test(p)) score++;
    if (score <= 1) return { label: 'Weak', color: '#f59e0b', width: '40%' };
    if (score === 2) return { label: 'Fair', color: '#3b82f6', width: '65%' };
    if (score === 3) return { label: 'Strong', color: '#10b981', width: '85%' };
    return { label: 'Very strong', color: '#16a34a', width: '100%' };
  };

  const strength = passwordStrength(form.password);

  // ── CREATE VIEW ─────────────────────────────────────────
  if (view === 'create') {
    return (
      <div style={{ maxWidth: '520px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
          <button onClick={() => { setView('list'); setError(''); }}
            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
            ← Back
          </button>
          <h2 style={{ ...S.pageTitle, margin: 0 }}>Create Account</h2>
        </div>

        {error && (
          <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', padding: '24px' }}>

          {/* Username */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: '12px', fontWeight: '500', marginBottom: '5px' }}>
              Username *
            </label>
            <input
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
              placeholder="e.g. john_smith"
              style={S.input}
              autoComplete="off"
            />
          </div>

          {/* Role */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: '12px', fontWeight: '500', marginBottom: '5px' }}>
              Role *
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {ROLES.map(r => (
                <button key={r} onClick={() => setForm(p => ({ ...p, role: r }))}
                  style={{
                    flex: 1, padding: '10px', borderRadius: '8px',
                    border: `2px solid ${form.role === r ? '#2563eb' : '#e2e8f0'}`,
                    background: form.role === r ? '#eff6ff' : 'white',
                    color: form.role === r ? '#2563eb' : '#64748b',
                    fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer',
                  }}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Franchise */}
          {form.role !== 'Admin' && (
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', fontWeight: '500', marginBottom: '5px' }}>
                Franchise *
              </label>
              <select
                value={form.franchise_id}
                onChange={e => setForm(p => ({ ...p, franchise_id: e.target.value }))}
                style={S.input}
              >
                <option value="">— Select Franchise —</option>
                {franchises.map(f => (
                  <option key={f.id} value={f.id}>{f.franchise_name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Password */}
          <div style={{ marginBottom: '8px' }}>
            <label style={{ display: 'block', color: '#64748b', fontSize: '12px', fontWeight: '500', marginBottom: '5px' }}>
              Password *
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="Min. 8 characters"
                style={{ ...S.input, paddingRight: '44px' }}
                autoComplete="new-password"
              />
              <button onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '14px',
                }}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Password strength */}
          {form.password && strength && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ height: '3px', background: '#f1f5f9', borderRadius: '2px', overflow: 'hidden', marginBottom: '4px' }}>
                <div style={{ height: '100%', width: strength.width, background: strength.color, borderRadius: '2px', transition: 'all 0.3s' }} />
              </div>
              <p style={{ margin: 0, fontSize: '11px', color: strength.color, fontWeight: '500' }}>{strength.label}</p>
            </div>
          )}

          {/* Info box */}
          <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
            <p style={{ margin: 0, color: '#64748b', fontSize: '12px', lineHeight: '1.6' }}>
              The employee record will be created automatically. HR and Consultants can log in immediately after account creation. Share the username and password with the employee directly.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => { setView('list'); setError(''); }} style={S.ghostBtn}>
              Cancel
            </button>
            <button onClick={handleCreate} disabled={creating}
              style={{ ...S.primaryBtn, flex: 1, opacity: creating ? 0.7 : 1 }}>
              {creating ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LIST VIEW ───────────────────────────────────────────
  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={S.pageTitle}>User Management</h2>
          <p style={{ color: '#64748b', fontSize: '13px', margin: '-8px 0 0' }}>
            {users.length} account{users.length !== 1 ? 's' : ''} total
          </p>
        </div>
        <button onClick={() => { setView('create'); setError(''); setSuccess(''); }} style={S.primaryBtn}>
          + Create Account
        </button>
      </div>

      {error && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>
          {success}
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8' }}>No users found.</div>
        ) : isMobile ? (
          <div>
            {users.map((u, i) => (
              <div key={u.id} style={{ padding: '14px 18px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div>
                    <span style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a' }}>@{u.username}</span>
                    <span style={{ ...roleColor(u.role), padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600', marginLeft: '8px' }}>
                      {u.role}
                    </span>
                  </div>
                  <span style={{
                    padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                    background: u.is_active ? '#f0fdf4' : '#fef2f2',
                    color: u.is_active ? '#16a34a' : '#dc2626',
                  }}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p style={{ margin: '0 0 8px', fontSize: '12px', color: '#64748b' }}>
                  {u.franchise_name || 'No franchise'}
                </p>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button onClick={() => handleResetPassword(u)} disabled={resettingId === u.id}
                    style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>
                    {resettingId === u.id ? 'Saving...' : 'Reset Password'}
                  </button>
                  {u.id !== user?.id && (
                    <button onClick={() => handleToggle(u)} disabled={togglingId === u.id}
                      style={{ background: 'none', border: 'none', color: u.is_active ? '#dc2626' : '#16a34a', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>
                      {togglingId === u.id ? '...' : u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Username', 'Role', 'Franchise', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 22px', textAlign: 'left',
                    color: '#94a3b8', fontSize: '11px', fontWeight: '600',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="table-row" style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 22px', fontWeight: '600', color: '#0f172a' }}>
                    @{u.username}
                    {u.id === user?.id && (
                      <span style={{ color: '#94a3b8', fontWeight: '400', fontSize: '12px', marginLeft: '6px' }}>(you)</span>
                    )}
                  </td>
                  <td style={{ padding: '12px 22px' }}>
                    <span style={{ ...roleColor(u.role), padding: '3px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 22px', color: '#64748b' }}>
                    {u.franchise_name || '—'}
                  </td>
                  <td style={{ padding: '12px 22px' }}>
                    <span style={{
                      padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                      background: u.is_active ? '#f0fdf4' : '#fef2f2',
                      color: u.is_active ? '#16a34a' : '#dc2626',
                    }}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 22px' }}>
                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                      <button onClick={() => handleResetPassword(u)} disabled={resettingId === u.id}
                        style={{ background: 'none', border: 'none', color: '#7c3aed', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>
                        {resettingId === u.id ? 'Saving...' : 'Reset Password'}
                      </button>
                      {u.id !== user?.id && (
                        <button onClick={() => handleToggle(u)} disabled={togglingId === u.id}
                          style={{ background: 'none', border: 'none', color: u.is_active ? '#dc2626' : '#16a34a', fontSize: '13px', fontWeight: '500', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>
                          {togglingId === u.id ? '...' : u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                    </div>
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