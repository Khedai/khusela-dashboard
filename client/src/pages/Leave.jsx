import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import Spinner from '../components/Spinner';
import Pagination from '../components/Pagination';
import EmptyState from '../components/EmptyState';
import FileUpload from '../components/FileUpload';
import { getIcon } from '../components/fileUploadUtils';
import * as S from '../utils/styles';

const LEAVE_TYPES = ['Annual', 'Sick', 'Family Responsibility', 'Unpaid', 'Study', 'Maternity/Paternity'];

const STATUS_STYLES = {
  Pending: { background: '#fffbeb', color: '#d97706' },
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
  const isManager = user?.role === 'HR';
  const isAdmin = user?.role === 'Admin';

  const [requests, setRequests] = useState([]);
  const [myEmployee, setMyEmployee] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState({}); // { [requestId]: 'Approved'|'Rejected' }
  const [rejecting, setRejecting] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({
    leave_type: 'Annual', start_date: '', end_date: '', reason: ''
  });
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [leaveDocs, setLeaveDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const LIMIT = 20;

  useEffect(() => {
    if (isAdmin) { setLoading(false); return; }
    fetchData(page);
  }, [page]);

  const handlePageChange = (p) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      if (isManager) {
        const res = await api.get(`/leave/requests?page=${p}&limit=${LIMIT}`);
        setRequests(res.data.data ? res.data.data : res.data);
        if (res.data.pagination) setPagination(res.data.pagination);
      } else {
        try {
          const empRes = await api.get('/leave/my-employee');
          setMyEmployee(empRes.data);
          const [reqRes, balRes] = await Promise.all([
            api.get(`/leave/my-requests/${empRes.data.id}`),
            api.get(`/leave/balance/${empRes.data.id}`)
          ]);
          setRequests(reqRes.data);
          setBalance(balRes.data);
        } catch (empErr) {
          if (empErr.response?.status === 404) {
            // No employee record linked — not an error worth showing
            setMyEmployee(null);
          } else {
            setError('Failed to load your leave data.');
          }
        }
      }
    } catch {
      setError('Failed to load leave data.');
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
      fetchData(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to submit.');
    } finally { setSubmitting(false); }
  };

  const handleAction = async (id, status) => {
    const msg = status === 'Approved'
      ? 'Approve this leave request? Days will be deducted from their balance.'
      : 'Reject this leave request?';
    if (!window.confirm(msg)) return;
    setActioning(a => ({ ...a, [id]: status }));
    try {
      await api.patch(`/leave/request/${id}`, { status, rejection_reason: rejectionReason });
      setRejecting(null); setRejectionReason('');
      setSuccess(`Request ${status.toLowerCase()} successfully.`);
      fetchData(page);
    } catch { setError('Failed to update request.'); }
    finally { setActioning(a => { const n = { ...a }; delete n[id]; return n; }); }
  };

  const openLeaveDetail = async (req) => {
    setSelectedRequest(req);
    setLoadingDocs(true);
    try {
      const res = await api.get(`/documents/leave/${req.id}`);
      setLeaveDocs(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
    finally {
      setLoadingDocs(false);
    }
  };

  const handleLeaveDocDelete = async (docId) => {
    if (!window.confirm('Delete this document?')) return;
    try {
      await api.delete(`/documents/folder/${docId}`);
      setLeaveDocs(prev => prev.filter(d => d.id !== docId));
    } catch { /* ignore */ }
  };

  const getDocDownloadUrl = async (key) => {
    try {
      const res = await api.get(`/documents/download/${encodeURIComponent(key)}`);
      window.open(res.data.url, '_blank');
    } catch { /* ignore */ }
  };

  const allRequests = isManager ? requests : requests;
  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  // Admin has no employee record and no leave management role — show info state
  if (isAdmin) {
    return (
      <div style={{ maxWidth: '1000px' }}>
        <div style={S.pageHeader(isMobile)}>
          <h2 style={S.pageTitle}>Leave Management</h2>
        </div>
        <div style={{ ...S.card, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🗓️</div>
          <h3 style={{ fontFamily: 'Sora', fontSize: '16px', fontWeight: '600', color: '#0f172a', margin: '0 0 8px' }}>
            Leave management is handled by HR
          </h3>
          <p style={{ color: '#64748b', fontSize: '14px', maxWidth: '420px', margin: '0 auto' }}>
            As an Admin, you oversee the system but leave requests are managed directly by HR users within their franchise. If you need to apply for leave yourself, ask HR to submit a request on your behalf.
          </p>
        </div>
      </div>
    );
  }

  // ── Leave Request Detail Panel ────────────────────────────
  if (selectedRequest) {
    const isHR = user?.role === 'HR' || user?.role === 'Admin';
    const isPending = selectedRequest.status === 'Pending';

    return (
      <div style={{ maxWidth: '700px' }}>
        <button
          onClick={() => { setSelectedRequest(null); setLeaveDocs([]); }}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563eb',
            fontSize: '13px',
            cursor: 'pointer',
            fontFamily: 'DM Sans',
            fontWeight: '500',
            padding: '0 0 16px',
            display: 'block',
          }}
        >
          Back
        </button>

        {/* Request summary */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <div>
              <h3
                style={{
                  fontFamily: 'Sora',
                  fontSize: '15px',
                  fontWeight: '700',
                  color: '#0f172a',
                  margin: '0 0 4px',
                }}
              >
                {selectedRequest.leave_type} Leave
              </h3>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                {selectedRequest.first_name} {selectedRequest.last_name} ·{' '}
                {selectedRequest.start_date?.split('T')[0]} → {selectedRequest.end_date?.split('T')[0]} ·{' '}
                {selectedRequest.days_requested} day{selectedRequest.days_requested !== 1 ? 's' : ''}
              </p>
            </div>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                background:
                  selectedRequest.status === 'Approved'
                    ? '#f0fdf4'
                    : selectedRequest.status === 'Rejected'
                      ? '#fef2f2'
                      : '#fffbeb',
                color:
                  selectedRequest.status === 'Approved'
                    ? '#16a34a'
                    : selectedRequest.status === 'Rejected'
                      ? '#dc2626'
                      : '#d97706',
              }}
            >
              {selectedRequest.status}
            </span>
          </div>

          {selectedRequest.reason && (
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <p
                style={{
                  color: '#94a3b8',
                  fontSize: '11px',
                  fontWeight: '600',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  margin: '0 0 4px',
                }}
              >
                Reason
              </p>
              <p style={{ color: '#334155', fontSize: '13px', margin: 0 }}>{selectedRequest.reason}</p>
            </div>
          )}

          {selectedRequest.rejection_reason && (
            <div style={{ padding: '14px 20px', background: '#fef2f2' }}>
              <p style={{ color: '#dc2626', fontSize: '12px', fontWeight: '600', margin: '0 0 2px' }}>
                Rejection Reason
              </p>
              <p style={{ color: '#991b1b', fontSize: '13px', margin: 0 }}>{selectedRequest.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* Supporting Documents */}
        <div
          style={{
            background: 'white',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            overflow: 'hidden',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              padding: '14px 20px',
              borderBottom: '1px solid #f1f5f9',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 2px' }}>
                Supporting Documents
              </h3>
              <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
                Sick notes, medical certificates, supporting letters
              </p>
            </div>
            {leaveDocs.length > 0 && (
              <span
                style={{
                  background: '#f1f5f9',
                  color: '#64748b',
                  borderRadius: '20px',
                  fontSize: '11px',
                  fontWeight: '700',
                  padding: '2px 9px',
                }}
              >
                {leaveDocs.length}
              </span>
            )}
          </div>

          <div style={{ padding: '16px 20px' }}>
            <div style={{ marginBottom: '16px' }}>
              <FileUpload
                uploadUrl={`/documents/leave/${selectedRequest.id}`}
                extraFields={{
                  doc_type: selectedRequest.leave_type === 'Sick' ? 'Sick Note' : 'Supporting Document',
                }}
                onUploadComplete={(doc) => setLeaveDocs(prev => [doc, ...prev])}
                label="Attach Supporting Document"
              />
            </div>

            {loadingDocs ? (
              <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '16px' }}>Loading...</p>
            ) : leaveDocs.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>
                No documents attached yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {leaveDocs.map(doc => (
                  <div
                    key={doc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      background: '#f8fafc',
                      border: '1px solid #f1f5f9',
                    }}
                  >
                    <span style={{ fontSize: '20px' }}>{getIcon(doc.file_name)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          margin: '0 0 2px',
                          fontSize: '13px',
                          fontWeight: '500',
                          color: '#0f172a',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {doc.file_name}
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>
                        {doc.doc_type} · {new Date(doc.uploaded_at).toLocaleDateString('en-ZA')}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => getDocDownloadUrl(doc.file_key)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#2563eb',
                          fontSize: '12px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          fontFamily: 'DM Sans',
                          padding: 0,
                        }}
                      >
                        Download
                      </button>
                      {isHR && (
                        <button
                          onClick={() => handleLeaveDocDelete(doc.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#dc2626',
                            fontSize: '12px',
                            fontWeight: '600',
                            cursor: 'pointer',
                            fontFamily: 'DM Sans',
                            padding: 0,
                          }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* HR Approve/Reject */}
        {isHR && isPending && (
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              padding: '20px',
            }}
          >
            <p style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 12px' }}>
              Action Request
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  await api.patch(`/leave/request/${selectedRequest.id}`, { status: 'Approved' });
                  setSelectedRequest(prev => ({ ...prev, status: 'Approved' }));
                  fetchData(page);
                }}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#16a34a',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: '600',
                  fontFamily: 'DM Sans',
                  cursor: 'pointer',
                }}
              >
                Approve
              </button>
              <button
                onClick={async (e) => {
                  e.stopPropagation();
                  const reason = window.prompt('Reason for rejection (optional):');
                  await api.patch(`/leave/request/${selectedRequest.id}`, {
                    status: 'Rejected',
                    rejection_reason: reason || '',
                  });
                  setSelectedRequest(prev => ({ ...prev, status: 'Rejected', rejection_reason: reason }));
                  fetchData(page);
                }}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#dc2626',
                  color: 'white',
                  fontSize: '13px',
                  fontWeight: '600',
                  fontFamily: 'DM Sans',
                  cursor: 'pointer',
                }}
              >
                Reject
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

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
            className="btn-primary" style={S.primaryBtn}>
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
              <button type="submit" disabled={submitting}
                className="btn-primary" style={{ ...S.primaryBtn, display: 'flex', alignItems: 'center', gap: '8px' }}>
                {submitting ? <><Spinner size="sm" inline /> Submitting...</> : 'Submit Request'}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="btn-ghost" style={S.ghostBtn}>Cancel</button>
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
          <Spinner size="lg" dark label="Loading leave data..." />
        ) : allRequests.length === 0 ? (
          <EmptyState
            icon="🗓️"
            title="No leave requests yet"
            subtitle={isManager ? 'Leave requests from your team will appear here.' : 'Submit your first leave request using the button above.'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr>
                  {[
                    ...(isManager ? ['Employee'] : []),
                    'Type', 'Dates', 'Days', 'Reason', 'Status',
                    ...(isManager ? ['Action'] : ['Documents'])
                  ].map(h => <th key={h} style={S.tableHeader}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {allRequests.map(r => (
                  <tr
                    key={r.id}
                    className="table-row"
                    onClick={() => openLeaveDetail(r)}
                    style={{ cursor: 'pointer' }}
                  >
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
                    {isManager ? (
                      <td style={S.tableCell}>
                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '8px' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); openLeaveDetail(r); }}
                            style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}
                          >
                            View
                          </button>
                        </div>
                        {r.status === 'Pending' ? (
                          rejecting === r.id ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                              <input
                                placeholder="Rejection reason..."
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                style={{ ...S.input, padding: '5px 9px', fontSize: '12px' }}
                              />
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'Rejected'); }}
                                  style={{ ...S.primaryBtn, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', fontSize: '11px', padding: '5px 10px', boxShadow: 'none' }}>
                                  Confirm
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); setRejecting(null); setRejectionReason(''); }} style={{ ...S.ghostBtn, fontSize: '11px', padding: '5px 10px' }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                              {actioning[r.id] ? (
                                <><Spinner size="sm" dark inline />
                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>{actioning[r.id]}…</span></>
                              ) : (
                                <>
                                  <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'Approved'); }}
                                    className="btn-success btn-link"
                                    style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: '4px' }}>
                                    Approve
                                  </button>
                                  <button onClick={(e) => { e.stopPropagation(); setRejecting(r.id); }}
                                    className="btn-danger btn-link"
                                    style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: '4px' }}>
                                    Reject
                                  </button>
                                </>
                              )}
                            </div>
                          )
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                            {r.approved_by_username ? `by ${r.approved_by_username}` : '—'}
                          </span>
                        )}
                      </td>
                    ) : (
                      <td style={S.tableCell}>
                        <button
                          onClick={(e) => { e.stopPropagation(); openLeaveDetail(r); }}
                          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}
                        >
                          View / Attach Docs
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {isManager && pagination && (
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
      </div>
    </div>
  );
}