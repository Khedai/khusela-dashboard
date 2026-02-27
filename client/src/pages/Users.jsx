import { useState, useEffect } from 'react';
import api from '../utils/api';

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
      const [usersRes, franchisesRes] = await Promise.all([
        api.get('/users'),
        api.get('/franchises')
      ]);
      setUsers(usersRes.data);
      setFranchises(franchisesRes.data);
    } catch (err) {
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post('/users', form);
      setSuccess(`User "${form.username}" created successfully.`);
      setShowForm(false);
      setForm(EMPTY_FORM);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id) => {
    try {
      await api.patch(`/users/${id}/toggle`);
      fetchData();
    } catch (err) {
      setError('Failed to update user.');
    }
  };

  const handleResetPassword = async (id) => {
    const newPassword = resetPasswords[id];
    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    try {
      await api.patch(`/users/${id}/password`, { password: newPassword });
      setSuccess('Password reset successfully.');
      setResetPasswords(prev => ({ ...prev, [id]: '' }));
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password.');
    }
  };

  const roleColors = {
    Admin: 'bg-purple-100 text-purple-700',
    HR: 'bg-blue-100 text-blue-700',
    Consultant: 'bg-green-100 text-green-700'
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-3">User Management</h2>
        <button
          onClick={() => { setShowForm(!showForm); setError(''); setSuccess(''); }}
          className="text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
          style={{ backgroundColor: '#2563eb' }}
        >
          {showForm ? 'Cancel' : '+ Create New User'}
        </button>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {/* Create User Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow p-6 mb-6 max-w-lg">
          <h3 className="font-semibold text-gray-700 mb-4">New User</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Username *" name="username" value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))} required />
            <Field label="Password *" name="password" value={form.password} type="password"
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))} required />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
              <select
                value={form.role}
                onChange={e => setForm(p => ({ ...p, role: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Consultant">Consultant</option>
                <option value="HR">HR</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Franchise</label>
              <select
                value={form.franchise_id}
                onChange={e => setForm(p => ({ ...p, franchise_id: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— No franchise assigned —</option>
                {franchises.map(f => (
                  <option key={f.id} value={f.id}>{f.franchise_name}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#2563eb' }}
            >
              {submitting ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Loading users...</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Username</th>
                <th className="px-4 py-3 text-left">Role</th>
                <th className="px-4 py-3 text-left">Franchise</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Reset Password</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${roleColors[u.role]}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.franchise_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 items-center">
                      <input
                        type="password"
                        placeholder="New password"
                        value={resetPasswords[u.id] || ''}
                        onChange={e => setResetPasswords(prev => ({ ...prev, [u.id]: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1 text-xs w-32 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleResetPassword(u.id)}
                        className="text-xs text-blue-600 hover:underline font-medium"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleToggle(u.id)}
                      className={`text-xs font-medium hover:underline ${u.is_active ? 'text-red-500' : 'text-green-600'}`}
                    >
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

function Field({ label, name, value, onChange, type = 'text', required }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} name={name} value={value} onChange={onChange} required={required}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
    </div>
  );
}

function Alert({ type, message }) {
  const styles = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700';
  return <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${styles}`}>{message}</div>;
}