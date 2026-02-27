import { useState, useEffect } from 'react';
import api from '../utils/api';
import * as S from '../utils/styles';

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
    try { const res = await api.get('/franchises'); setFranchises(res.data); }
    catch { setError('Failed to load franchises.'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSubmitting(true); setError('');
    try {
      if (editing) { await api.put(`/franchises/${editing.id}`, form); setSuccess('Franchise updated.'); }
      else { await api.post('/franchises', form); setSuccess('Franchise created.'); }
      setShowForm(false); setEditing(null); setForm({ franchise_name: '', location: '' });
      fetchFranchises();
    } catch (err) { setError(err.response?.data?.error || 'Failed.'); }
    finally { setSubmitting(false); }
  };

  const handleEdit = (f) => {
    setEditing(f); setForm({ franchise_name: f.franchise_name, location: f.location || '' });
    setShowForm(true); setError(''); setSuccess('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this franchise? This cannot be undone.')) return;
    try { await api.delete(`/franchises/${id}`); setSuccess('Deleted.'); fetchFranchises(); }
    catch (err) { setError(err.response?.data?.error || 'Failed.'); }
  };

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={S.pageTitle}>Franchises</h2>
        <button
          onClick={() => { setShowForm(!showForm); setEditing(null); setForm({ franchise_name: '', location: '' }); setError(''); setSuccess(''); }}
          style={S.primaryBtn}>
          {showForm && !editing ? 'Cancel' : '+ Add Franchise'}
        </button>
      </div>

      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>{success}</div>}

      {showForm && (
        <div style={{ ...S.card, marginBottom: '24px', overflow: 'visible' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
              {editing ? 'Edit Franchise' : 'New Franchise'}
            </h3>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Franchise Name *</label>
              <input value={form.franchise_name} onChange={e => setForm(p => ({ ...p, franchise_name: e.target.value }))}
                required style={S.input} />
            </div>
            <div>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Location</label>
              <input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} style={S.input} />
            </div>
            <div style={{ gridColumn: 'span 2', display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={submitting} style={S.primaryBtn}>
                {submitting ? 'Saving...' : editing ? 'Update' : 'Create Franchise'}
              </button>
              <button type="button" onClick={() => { setShowForm(false); setEditing(null); }} style={S.ghostBtn}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading...</p>
      ) : franchises.length === 0 ? (
        <p style={{ color: '#94a3b8', fontSize: '14px' }}>No franchises yet.</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
          {franchises.map(f => (
            <div key={f.id} style={{ background: 'white', borderRadius: '12px', padding: '20px 22px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <h3 style={{ fontFamily: 'Sora', fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: '0 0 4px' }}>{f.franchise_name}</h3>
              <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 18px' }}>{f.location || 'No location set'}</p>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '18px' }}>
                <div>
                  <p style={{ fontFamily: 'Sora', fontSize: '22px', fontWeight: '700', color: '#2563eb', margin: 0, lineHeight: 1 }}>{f.user_count}</p>
                  <p style={{ color: '#94a3b8', fontSize: '11px', margin: '3px 0 0' }}>Users</p>
                </div>
                <div>
                  <p style={{ fontFamily: 'Sora', fontSize: '22px', fontWeight: '700', color: '#16a34a', margin: 0, lineHeight: 1 }}>{f.application_count}</p>
                  <p style={{ color: '#94a3b8', fontSize: '11px', margin: '3px 0 0' }}>Applications</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '14px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
                <button onClick={() => handleEdit(f)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>Edit</button>
                <button onClick={() => handleDelete(f.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}