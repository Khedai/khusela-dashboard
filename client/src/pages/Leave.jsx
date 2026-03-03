import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import * as S from '../utils/styles';

const LEAVE_TYPES = ['Annual', 'Sick', 'Family Responsibility', 'Unpaid', 'Study', 'Maternity/Paternity'];

const STATUS_STYLES = {
  Pending:  { background: '#fffbeb', color: '#d97706' },
  Approved: { background: '#f0fdf4', color: '#16a34a' },
  Rejected: { background: '#fef2f2', color: '#dc2626' },
};

function workingDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

export default function Leave() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isManager = user?.role === 'Admin' || user?.role === 'HR';

  const [requests, setRequests] = useState([]);
  const [myEmployee, setMyEmployee] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [success, setSuccess] = useState('');
  const [tab, setTab] = useState(isManager ? 'all' : 'mine');

  const [form, setForm] = useState({
    leave_type: 'Annual', start_date: '', end_date: '', reason: ''
  });

  useEffect(() => { fetchData(); }, []);
  const fetchData = async () => {
    try {
      if (isManager) {
        const res = await api.get('/leave/requests');
        setRequests(res.data);
      } else {
        // Find the employee record linked to this login account
        const empRes = await api.get('/leave/my-employee');
        setMyEmployee(empRes.data);
        const [reqRes, balRes] = await Promise.all([
          api.get(`/leave/my-requests/${empRes.data.id}`),
          api.get(`/leave/balance/${empRes.data.id}`)
        ]);
        setRequests(reqRes.data);
        setBalance(balRes.data);
      }
    } catch (err) {
      if (err.response?.status === 404 && !isManager) {
        setError('Your account is not linked to an employee record. Ask your Admin to link your account in the Employees section.');
      } else {
        setError('Failed to load leave data.');
      }
    } finally {
      setLoading(false);
    }
  };

  const daysRequested = form.start_date && form.end_date
    ? workingDays(form.start_date, form.end_date)
    : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!myEmployee) { setError('Employee record not linked to your account.'); return; }
    if (daysRequested <= 0) { setError('Please select valid dates.'); return; }
    setSubmitting(true); setError(''); setWarning(''); setSuccess('');
    try {
      const res = await api.post('/leave/request', {
        employee_id: myEmployee.id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        days_requested: daysRequested,
        reason: form.reason,
      });
      if (res.data.warning) setWarning(res.data.warning);
      setSuccess('Leave request submitted successfully.');
      setShowForm(false);
      setForm({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit.');
    } finally { setSubmitting(false); }
  };

  const handleAction = async (id, status) => {
    try {
      await api.patch(`/leave/request/${id}`, { status, rejection_reason: rejectionReason });
      setRejecting(null); setRejectionReason('');
      setSuccess(`Request ${status.toLowerCase()} successfully.`);
      fetchData();
    } catch { setError('Failed to update request.'); }
  };

  const allRequests = isManager ? requests : requests;
  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  return (
    <div style={{ maxWidth: '1000px' }}>
      {/* Header */}
      <div style={S.pageHeader(isMobile)}>
        <div>
          <h2 style={S.pageTitle}>Leave Management</h2>
          {pendingCount > 0 && isManager && (
            <p style={{ color: '#d97706', fontSize: '13px', margin: '4px 0 0', fontWeight: '500' }}>
              {pendingCount} pending request{pendingCount > 1 ? 's' : ''} awaiting action
            </p>
          )}
        </div>
        {!isManager && (
          <button onClick={() => { setShowForm(!showForm); setError(''); setWarning(''); }}
            style={S.primaryBtn}>
            {showForm ? 'Cancel' : '+ Apply for Leave'}
          </button>
        )}
      </div>

      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}
      {warning && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', fontSize: '13.5px', marginBottom: '16px' }}>{warning}</div>}
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>{success}</div>}

      {/* Leave Balance for Consultants */}
      {!isManager && balance && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Annual Leave', total: balance.annual_total, used: balance.annual_used, color: '#2563eb' },
            { label: 'Sick Leave', total: balance.sick_total, used: balance.sick_used, color: '#d97706' },
            { label: 'Family Responsibility', total: balance.family_total, used: balance.family_used, color: '#16a34a' },
          ].map(b => {
            const remaining = b.total - b.used;
            return (
              <div key={b.label} style={{ background: 'white', borderRadius: '10px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderTop: `3px solid ${b.color}` }}>
                <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>{b.label}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '4px' }}>
                  <span style={{ fontFamily: 'Sora', fontSize: '28px', fontWeight: '700', color: remaining <= 0 ? '#dc2626' : '#0f172a', lineHeight: 1 }}>{remaining}</span>
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>/ {b.total} days left</span>
                </div>
                <div style={{ height: '4px', borderRadius: '2px', background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: '2px', background: remaining <= 0 ? '#dc2626' : b.color, width: `${Math.min((b.used / b.total) * 100, 100)}%` }} />
                </div>
                <p style={{ color: '#94a3b8', fontSize: '11px', margin: '4px 0 0' }}>{b.used} days used</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Apply for Leave Form */}
      {showForm && !isManager && (
        <div style={{ ...S.card, marginBottom: '24px', overflow: 'visible' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Apply for Leave</h3>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: '20px 22px' }}>
            <div style={S.responsiveGrid(isMobile)}>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Leave Type *</label>
                <select value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))} style={S.input}>
                  {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div />
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Start Date *</label>
                <input type="date" value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]} required style={S.input} />
              </div>
              <div>
                <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>End Date *</label>
                <input type="date" value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                  min={form.start_date || new Date().toISOString().split('T')[0]} required style={S.input} />
              </div>
            </div>

            {daysRequested > 0 && (
              <div style={{ margin: '14px 0', padding: '12px 16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#1d4ed8', fontSize: '13px', fontWeight: '500' }}>Working days requested</span>
                <span style={{ color: '#1d4ed8', fontSize: '18px', fontWeight: '700', fontFamily: 'Sora' }}>{daysRequested}</span>
              </div>
            )}

            <div style={{ marginTop: '14px' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Reason</label>
              <textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                rows={3} placeholder="Optional reason for leave..."
                style={{ ...S.input, resize: 'vertical' }} />
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="submit" disabled={submitting} style={S.primaryBtn}>{submitting ? 'Submitting...' : 'Submit Request'}</button>
              <button type="button" onClick={() => setShowForm(false)} style={S.ghostBtn}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Requests Table */}
      <div style={S.card}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9' }}>
          <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
            {isManager ? 'All Leave Requests' : 'My Leave Requests'}
          </h3>
        </div>

        {loading ? (
          <p style={{ padding: '24px', color: '#94a3b8', fontSize: '14px' }}>Loading...</p>
        ) : allRequests.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No leave requests yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr>
                  {[
                    ...(isManager ? ['Employee'] : []),
                    'Type', 'Dates', 'Days', 'Reason', 'Status',
                    ...(isManager ? ['Action'] : [])
                  ].map(h => <th key={h} style={S.tableHeader}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {allRequests.map(r => (
                  <tr key={r.id}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    {isManager && (
                      <td style={{ ...S.tableCell, fontWeight: '500' }}>{r.first_name} {r.last_name}</td>
                    )}
                    <td style={S.tableCell}>{r.leave_type}</td>
                    <td style={{ ...S.tableCell, whiteSpace: 'nowrap', color: '#64748b' }}>
                      {r.start_date?.split('T')[0]} → {r.end_date?.split('T')[0]}
                    </td>
                    <td style={{ ...S.tableCell, textAlign: 'center' }}>{r.days_requested}</td>
                    <td style={{ ...S.tableCell, color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.reason || '—'}
                    </td>
                    <td style={S.tableCell}>
                      <span style={{ ...STATUS_STYLES[r.status], padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', display: 'inline-block' }}>
                        {r.status}
                      </span>
                      {r.rejection_reason && (
                        <p style={{ color: '#dc2626', fontSize: '11px', margin: '3px 0 0' }}>{r.rejection_reason}</p>
                      )}
                    </td>
                    {isManager && (
                      <td style={S.tableCell}>
                        {r.status === 'Pending' ? (
                          rejecting === r.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                              <input
                                placeholder="Rejection reason..."
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                style={{ ...S.input, padding: '5px 9px', fontSize: '12px' }}
                              />
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={() => handleAction(r.id, 'Rejected')}
                                  style={{ ...S.primaryBtn, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', fontSize: '11px', padding: '5px 10px', boxShadow: 'none' }}>
                                  Confirm
                                </button>
                                <button onClick={() => { setRejecting(null); setRejectionReason(''); }} style={{ ...S.ghostBtn, fontSize: '11px', padding: '5px 10px' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button onClick={() => handleAction(r.id, 'Approved')}
                                style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>
                                Approve
                              </button>
                              <button onClick={() => setRejecting(r.id)}
                                style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>
                                Reject
                              </button>
                            </div>
                          )
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                            {r.approved_by_username ? `by ${r.approved_by_username}` : '—'}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}