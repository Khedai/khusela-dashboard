import { useState, useEffect } from 'react';
import api from '../utils/api';

export default function Franchises() {
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ franchise_name: '', location: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchFranchises(); }, []);

  const fetchFranchises = async () => {
    try {
      const res = await api.get('/franchises');
      setFranchises(res.data);
    } catch (err) {
      setError('Failed to load franchises.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      if (editing) {
        await api.put(`/franchises/${editing.id}`, form);
        setSuccess('Franchise updated.');
      } else {
        await api.post('/franchises', form);
        setSuccess('Franchise created.');
      }
      setShowForm(false);
      setEditing(null);
      setForm({ franchise_name: '', location: '' });
      fetchFranchises();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save franchise.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (franchise) => {
    setEditing(franchise);
    setForm({ franchise_name: franchise.franchise_name, location: franchise.location || '' });
    setShowForm(true);
    setError('');
    setSuccess('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this franchise? This cannot be undone.')) return;
    try {
      await api.delete(`/franchises/${id}`);
      setSuccess('Franchise deleted.');
      fetchFranchises();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete franchise.');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-3">Franchise Management</h2>
        <button
          onClick={() => { setShowForm(!showForm); setEditing(null);
            setForm({ franchise_name: '', location: '' }); setError(''); setSuccess(''); }}
          className="text-white text-sm font-medium py-2 px-4 rounded-lg"
          style={{ backgroundColor: '#2563eb' }}
        >
          {showForm && !editing ? 'Cancel' : '+ Add Franchise'}
        </button>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      {showForm && (
        <div className="bg-white rounded-xl shadow p-6 mb-6 max-w-lg">
          <h3 className="font-semibold text-gray-700 mb-4">
            {editing ? 'Edit Franchise' : 'New Franchise'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Franchise Name *</label>
              <input
                type="text"
                value={form.franchise_name}
                onChange={e => setForm(p => ({ ...p, franchise_name: e.target.value }))}
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
              <input
                type="text"
                value={form.location}
                onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full text-white font-medium py-2 px-4 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#2563eb' }}
            >
              {submitting ? 'Saving...' : editing ? 'Update Franchise' : 'Create Franchise'}
            </button>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-gray-500 text-sm">Loading franchises...</p>
        ) : franchises.length === 0 ? (
          <p className="text-gray-500 text-sm">No franchises yet.</p>
        ) : franchises.map(f => (
          <div key={f.id} className="bg-white rounded-xl shadow p-5">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-gray-800">{f.franchise_name}</h3>
                <p className="text-sm text-gray-500 mt-1">{f.location || 'No location set'}</p>
              </div>
            </div>
            <div className="flex gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600">{f.user_count}</p>
                <p className="text-xs text-gray-500">Users</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{f.application_count}</p>
                <p className="text-xs text-gray-500">Applications</p>
              </div>
            </div>
            <div className="flex gap-3 pt-3 border-t">
              <button onClick={() => handleEdit(f)}
                className="text-xs text-blue-600 hover:underline font-medium">
                Edit
              </button>
              <button onClick={() => handleDelete(f.id)}
                className="text-xs text-red-500 hover:underline font-medium">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Alert({ type, message }) {
  const styles = type === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-green-50 border-green-200 text-green-700';
  return <div className={`border px-4 py-3 rounded-lg mb-4 text-sm ${styles}`}>{message}</div>;
}