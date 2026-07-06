import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const fmtDate = (dateStr) => {
  if (!dateStr) return '—';
  const s = String(dateStr).split('T')[0];
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const isAdmin = user?.role === 'Admin';

  const [requests, setRequests] = useState([]);
  const [myEmployee, setMyEmployee] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actioning, setActioning] = useState({});
  const [rejecting, setRejecting] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [success, setSuccess] = useState('');

  const [form, setForm] = useState({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [leaveDocs, setLeaveDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [reqNotes, setReqNotes] = useState([]);
  const [reqNotesLoading, setReqNotesLoading] = useState(false);
  const [newReqNote, setNewReqNote] = useState('');
  const [postingReqNote, setPostingReqNote] = useState(false);
  const [deletingReqNoteId, setDeletingReqNoteId] = useState(null);

  const [reqBalance, setReqBalance] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const LIMIT = 20;

  const [allBalances, setAllBalances] = useState([]);
  const [balancesLoading, setBalancesLoading] = useState(false);
  const [balanceSearch, setBalanceSearch] = useState('');

  useEffect(() => { fetchData(page); }, [page]);

  const handlePageChange = (p) => { setPage(p); window.scrollTo(0, 0); };

  const fetchBalances = async () => {
    setBalancesLoading(true);
    try { const res = await api.get('/leave/balances'); setAllBalances(Array.isArray(res.data) ? res.data : []); }
    catch (err) { console.error('Balances error:', err.response?.data || err.message); }
    finally { setBalancesLoading(false); }
  };

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      let emp = null; let bal = null;
      try {
        const empRes = await api.get('/leave/my-employee');
        emp = empRes.data;
        const [balRes] = await Promise.all([api.get(`/leave/balance/${emp.id}`)]);
        bal = balRes.data;
      } catch { emp = null; bal = null; }
      setMyEmployee(emp); setBalance(bal);

      if (isAdmin) {
        const [reqsRes] = await Promise.all([api.get(`/leave/requests?page=${p}&limit=${LIMIT}`)]);
        setRequests(reqsRes.data.data ? reqsRes.data.data : reqsRes.data);
        if (reqsRes.data.pagination) setPagination(reqsRes.data.pagination);
        fetchBalances();
      } else if (emp) {
        const reqRes = await api.get(`/leave/my-requests/${emp.id}`);
        setRequests(reqRes.data);
      }
    } catch { setError('Failed to load leave data.'); }
    finally { setLoading(false); }
  };

  const daysRequested = form.start_date && form.end_date ? workingDays(form.start_date, form.end_date) : 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!myEmployee) { setError('Employee record not linked to your account.'); return; }
    if (daysRequested <= 0) { setError('Please select valid dates.'); return; }
    setSubmitting(true); setError(''); setWarning(''); setSuccess('');
    try {
      const res = await api.post('/leave/request', { employee_id: myEmployee.id, leave_type: form.leave_type, start_date: form.start_date, end_date: form.end_date, days_requested: daysRequested, reason: form.reason });
      if (res.data.warning) setWarning(res.data.warning);
      setSuccess('Leave request submitted successfully.');
      setShowForm(false); setForm({ leave_type: 'Annual', start_date: '', end_date: '', reason: '' });
      fetchData(page);
    } catch (err) { setError(err.response?.data?.error || 'Failed to submit.'); }
    finally { setSubmitting(false); }
  };

  const handleAction = async (id, status) => {
    const msg = status === 'Approved' ? 'Approve this leave request? Days will be deducted from their balance.' : 'Reject this leave request?';
    if (!window.confirm(msg)) return;
    setActioning(a => ({ ...a, [id]: status }));
    try {
      await api.patch(`/leave/request/${id}`, { status, rejection_reason: rejectionReason });
      setRejecting(null); setRejectionReason('');
      setSuccess(`Request ${status.toLowerCase()} successfully.`);
      fetchData(page);
      try { window.dispatchEvent(new Event('refreshNotifications')); } catch (e) {}
      try { window.dispatchEvent(new Event('refreshPendingCount')); } catch (e) {}
    } catch { setError('Failed to update request.'); }
    finally { setActioning(a => { const n = { ...a }; delete n[id]; return n; }); }
  };

  const openLeaveDetail = async (req) => {
    setSelectedRequest(req); setReqNotes([]); setNewReqNote(''); setReqBalance(null);
    setLoadingDocs(true); setReqNotesLoading(true);
    try {
      const [docsRes, notesRes] = await Promise.all([api.get(`/documents/leave/${req.id}`), api.get(`/leave/request/${req.id}/notes`)]);
      setLeaveDocs(Array.isArray(docsRes.data) ? docsRes.data : []); setReqNotes(Array.isArray(notesRes.data) ? notesRes.data : []);
    } catch { /* ignore */ }
    finally { setLoadingDocs(false); setReqNotesLoading(false); }
    if (isAdmin && req.employee_id) { try { const balRes = await api.get(`/leave/balance/${req.employee_id}`); setReqBalance(balRes.data); } catch { /* ignore */ } }
  };

  useEffect(() => {
    const requestId = searchParams.get('request');
    if (!requestId || loading) return;
    if (selectedRequest && String(selectedRequest.id) === requestId) return;
    const req = requests.find(r => String(r.id) === requestId);
    if (req) openLeaveDetail(req);
  }, [searchParams, requests, loading, selectedRequest]);

  const postReqNote = async () => { if (!newReqNote.trim() || postingReqNote || !selectedRequest) return; setPostingReqNote(true); try { const res = await api.post(`/leave/request/${selectedRequest.id}/notes`, { note: newReqNote.trim() }); setReqNotes(prev => [res.data, ...prev]); setNewReqNote(''); } catch (err) { setError(err.response?.data?.error || 'Failed to post note.'); } finally { setPostingReqNote(false); } };
  const deleteReqNote = async (noteId) => { setDeletingReqNoteId(noteId); try { await api.delete(`/leave/request/${selectedRequest.id}/notes/${noteId}`); setReqNotes(prev => prev.filter(n => n.id !== noteId)); } catch (err) { setError(err.response?.data?.error || 'Failed to delete comment.'); } finally { setDeletingReqNoteId(null); } };
  const handleLeaveDocDelete = async (docId) => { if (!window.confirm('Delete this document?')) return; try { await api.delete(`/documents/folder/${docId}`); setLeaveDocs(prev => prev.filter(d => d.id !== docId)); } catch { /* ignore */ } };
  const getDocDownloadUrl = async (key) => { try { const res = await api.get(`/documents/download/${encodeURIComponent(key)}`); window.open(res.data.url, '_blank'); } catch { /* ignore */ } };

  const [viewTab, setViewTab] = useState('list');
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const allRequests = requests;
  const pendingCount = requests.filter(r => r.status === 'Pending').length;

  // ── Leave Request Detail Panel ────────────────────────────
  if (selectedRequest) {
    const isHR = isAdmin;
    const isPending = selectedRequest.status === 'Pending';

    return (
      <div style={{ maxWidth: '700px' }}>
        <button onClick={() => { setSelectedRequest(null); setLeaveDocs([]); setError(''); setSearchParams({}); }}
          style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: '0 0 16px', display: 'block' }}>
          ← Back
        </button>

        {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}

        <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ fontFamily: 'Sora', fontSize: '15px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>{selectedRequest.leave_type} Leave</h3>
              <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>{selectedRequest.first_name} {selectedRequest.last_name} · {fmtDate(selectedRequest.start_date)} → {fmtDate(selectedRequest.end_date)} · {selectedRequest.days_requested} day{selectedRequest.days_requested !== 1 ? 's' : ''}</p>
            </div>
            <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', background: STATUS_STYLES[selectedRequest.status]?.background, color: STATUS_STYLES[selectedRequest.status]?.color, border: `1px solid ${STATUS_STYLES[selectedRequest.status]?.color}30` }}>{selectedRequest.status}</span>
          </div>
          {selectedRequest.reason && (
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9' }}>
              <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Reason</p>
              <p style={{ color: '#334155', fontSize: '13px', margin: 0 }}>{selectedRequest.reason}</p>
            </div>
          )}
          {selectedRequest.rejection_reason && (
            <div style={{ padding: '14px 20px', background: '#fef2f2' }}>
              <p style={{ color: '#dc2626', fontSize: '12px', fontWeight: '600', margin: '0 0 2px' }}>Rejection Reason</p>
              <p style={{ color: '#991b1b', fontSize: '13px', margin: 0 }}>{selectedRequest.rejection_reason}</p>
            </div>
          )}
        </div>

        {/* Balance view with slim progress bars */}
        {isAdmin && reqBalance && (
          <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
              <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>{selectedRequest.first_name}'s Leave Balance</p>
              <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#94a3b8' }}>{new Date().getFullYear()} · remaining days</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[
                { label: 'Annual', total: Math.round(reqBalance.annual_total), used: Math.round(reqBalance.annual_used), color: '#2563eb' },
                { label: 'Sick', total: Math.round(reqBalance.sick_total), used: Math.round(reqBalance.sick_used), color: '#0891b2' },
                { label: 'Family Resp.', total: Math.round(reqBalance.family_total), used: Math.round(reqBalance.family_used), color: '#16a34a' },
              ].map((b, i) => {
                const remaining = Math.round((b.total || 0) - (b.used || 0));
                const pct = b.total ? Math.min(((b.used || 0) / b.total) * 100, 100) : 0;
                return (
                  <div key={b.label} style={{ padding: '14px 16px', borderRight: i < 2 ? '1px solid #f1f5f9' : 'none' }}>
                    <p style={{ margin: '0 0 6px', fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{b.label}</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '3px', marginBottom: '8px' }}>
                      <span style={{ fontFamily: 'Sora', fontSize: '22px', fontWeight: '700', color: remaining <= 0 ? '#dc2626' : '#0f172a', lineHeight: 1 }}>{remaining}</span>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>/ {b.total}</span>
                    </div>
                    <div style={{ height: '4px', borderRadius: '3px', background: '#f1f5f9', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '3px', background: remaining <= 0 ? '#dc2626' : b.color, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                    </div>
                    <p style={{ margin: '5px 0 0', fontSize: '10px', color: '#94a3b8' }}>{b.used} used</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Supporting Documents */}
        <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 2px' }}>Supporting Documents</h3><p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>Sick notes, medical certificates, supporting letters</p></div>
            {leaveDocs.length > 0 && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '20px', fontSize: '11px', fontWeight: '700', padding: '2px 9px' }}>{leaveDocs.length}</span>}
          </div>
          <div style={{ padding: '16px 20px' }}>
            <div style={{ marginBottom: '16px' }}><FileUpload uploadUrl={`/documents/leave/${selectedRequest.id}`} extraFields={{ doc_type: selectedRequest.leave_type === 'Sick' ? 'Sick Note' : 'Supporting Document' }} onUploadComplete={(doc) => setLeaveDocs(prev => [doc, ...prev])} label="Attach Supporting Document" /></div>
            {loadingDocs ? <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '16px' }}>Loading...</p>
            : leaveDocs.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', padding: '16px 0' }}>No documents attached yet.</p>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {leaveDocs.map(doc => (
                <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: '20px' }}>{getIcon(doc.file_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '500', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.file_name}</p><p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>{doc.doc_type} · {fmtDate(doc.uploaded_at)} {new Date(doc.uploaded_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}</p></div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button onClick={() => getDocDownloadUrl(doc.file_key)} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>Download</button>
                    {isHR && <button onClick={() => handleLeaveDocDelete(doc.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', padding: 0 }}>Delete</button>}
                  </div>
                </div>
              ))}
            </div>}
          </div>
        </div>

        {/* Action Request */}
        {isHR && isPending && (
          <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', padding: '20px', marginBottom: '16px' }}>
            <p style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: '0 0 12px' }}>Action Request</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={async (e) => { e.stopPropagation(); await api.patch(`/leave/request/${selectedRequest.id}`, { status: 'Approved' }); setSelectedRequest(prev => ({ ...prev, status: 'Approved' })); fetchData(page); try { window.dispatchEvent(new Event('refreshNotifications')); } catch (e) {} try { window.dispatchEvent(new Event('refreshPendingCount')); } catch (e) {} }}
                style={{ flex: 1, padding: '11px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#16a34a,#15803d)', color: 'white', fontSize: '13px', fontWeight: '700', fontFamily: 'DM Sans', cursor: 'pointer', boxShadow: '0 2px 8px rgba(22,163,74,0.25)' }}>Approve</button>
              <button onClick={async (e) => { e.stopPropagation(); const reason = window.prompt('Reason for rejection (optional):'); await api.patch(`/leave/request/${selectedRequest.id}`, { status: 'Rejected', rejection_reason: reason || '' }); setSelectedRequest(prev => ({ ...prev, status: 'Rejected', rejection_reason: reason })); fetchData(page); try { window.dispatchEvent(new Event('refreshNotifications')); } catch (e) {} try { window.dispatchEvent(new Event('refreshPendingCount')); } catch (e) {} }}
                style={{ flex: 1, padding: '11px 20px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: 'white', fontSize: '13px', fontWeight: '700', fontFamily: 'DM Sans', cursor: 'pointer', boxShadow: '0 2px 8px rgba(220,38,38,0.25)' }}>Reject</button>
            </div>
          </div>
        )}

        {/* Decision Reversal Warning Block */}
        {isHR && !isPending && (
          <div style={{
            background: '#fffdf5', borderRadius: '14px', padding: '20px', marginTop: '16px',
            border: '1px solid #fde68a', boxShadow: '0 2px 8px rgba(251,191,36,0.08)',
          }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '20px', flexShrink: 0 }}>↩️</span>
              <div>
                <p style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#92400e', margin: '0 0 6px' }}>Reverse Decision</p>
                <p style={{ color: '#a16207', fontSize: '12px', margin: 0, lineHeight: '1.6' }}>
                  This request is currently <strong style={{ color: '#0f172a' }}>{selectedRequest.status}</strong>. Reversing will change it to <strong style={{ color: '#0f172a' }}>{selectedRequest.status === 'Approved' ? 'Rejected' : 'Approved'}</strong>.
                  {selectedRequest.status === 'Approved' && ' This will restore the leave balance automatically.'}
                  {selectedRequest.status === 'Rejected' && ' This will deduct days from the current leave balance.'}
                </p>
              </div>
            </div>
            <button onClick={async (e) => {
              e.stopPropagation(); const newStatus = selectedRequest.status === 'Approved' ? 'Rejected' : 'Approved';
              const msg = `Are you sure you want to reverse this leave request from "${selectedRequest.status}" to "${newStatus}"?`;
              if (!window.confirm(msg)) return;
              try { await api.patch(`/leave/request/${selectedRequest.id}/reverse`); setSelectedRequest(prev => ({ ...prev, status: newStatus })); setSuccess(`Decision reversed to "${newStatus}" successfully.`); fetchData(page); try { window.dispatchEvent(new Event('refreshNotifications')); } catch (e) {} try { window.dispatchEvent(new Event('refreshPendingCount')); } catch (e) {}
              } catch (err) { setError(err.response?.data?.error || 'Failed to reverse decision.'); }
            }}
              style={{ width: '100%', padding: '11px 20px', borderRadius: '10px', border: '1px solid #f59e0b', background: '#fffbeb', color: '#d97706', fontSize: '13px', fontWeight: '700', fontFamily: 'DM Sans', cursor: 'pointer', transition: 'background 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.background = '#fef3c7'}
              onMouseLeave={e => e.currentTarget.style.background = '#fffbeb'}>
              {selectedRequest.status === 'Approved' ? '↩ Reverse to Rejected' : '↩ Reverse to Approved'}
            </button>
          </div>
        )}

        {/* Leave Notes */}
        <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginTop: '16px' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: '0 0 2px' }}>Notes</h3><p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>Internal notes visible to HR and Admin only</p></div>
            {reqNotes.length > 0 && <span style={{ background: '#f1f5f9', color: '#64748b', borderRadius: '20px', fontSize: '11px', fontWeight: '700', padding: '2px 9px' }}>{reqNotes.length}</span>}
          </div>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f8fafc' }}>
            <textarea value={newReqNote} onChange={e => setNewReqNote(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) postReqNote(); }} placeholder="Add a note... (Ctrl+Enter to post)" rows={3} style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a', resize: 'vertical', lineHeight: '1.6', boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
              <span style={{ color: '#94a3b8', fontSize: '11px' }}>Ctrl+Enter to post quickly</span>
              <button onClick={postReqNote} disabled={postingReqNote || !newReqNote.trim()} style={{ padding: '7px 18px', borderRadius: '8px', border: 'none', background: newReqNote.trim() ? '#4f46e5' : '#f1f5f9', color: newReqNote.trim() ? 'white' : '#94a3b8', fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans', cursor: newReqNote.trim() ? 'pointer' : 'default', opacity: postingReqNote ? 0.7 : 1 }}>{postingReqNote ? 'Posting...' : 'Post Note'}</button>
            </div>
          </div>
          {reqNotesLoading ? <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>Loading...</div>
          : reqNotes.length === 0 ? <div style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No notes yet. Add one above.</div>
          : <div>{reqNotes.map((note) => {
            const roleColors = { Admin: { bg: '#f5f3ff', color: '#7c3aed' }, HR: { bg: '#eff6ff', color: '#2563eb' }, Consultant: { bg: '#f0fdf4', color: '#16a34a' } };
            const rc = roleColors[note.role] || roleColors.Consultant;
            return (
              <div key={note.id} style={{ padding: '14px 20px', borderTop: '1px solid #f8fafc', background: note.username === user?.username ? '#fafbff' : 'white' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: rc.bg, color: rc.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0, border: `2px solid ${rc.color}30` }}>{note.username?.charAt(0).toUpperCase()}</div>
                    <div><span style={{ fontWeight: '600', fontSize: '13px', color: '#0f172a' }}>@{note.username}</span><span style={{ background: rc.bg, color: rc.color, padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', marginLeft: '6px', border: `1px solid ${rc.color}30` }}>{note.role}</span>{note.franchise_name && <span style={{ color: '#94a3b8', fontSize: '11px', marginLeft: '6px' }}>· {note.franchise_name}</span>}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(note.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    {(note.username === user?.username || user?.role === 'Admin') && <button onClick={() => deleteReqNote(note.id)} disabled={deletingReqNoteId === note.id} style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 0, fontSize: '14px', lineHeight: 1 }} onMouseEnter={e => e.target.style.color = '#dc2626'} onMouseLeave={e => e.target.style.color = '#cbd5e1'}>{deletingReqNoteId === note.id ? '...' : '×'}</button>}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '13.5px', color: '#334155', lineHeight: '1.6', whiteSpace: 'pre-wrap', paddingLeft: '36px' }}>{note.note}</p>
              </div>
            );
          })}</div>}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px' }}>
      <div style={S.pageHeader(isMobile)}>
        <div>
          <h2 style={S.pageTitle}>Leave Management</h2>
        </div>
      </div>

      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}
      {warning && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fffbeb', color: '#d97706', border: '1px solid #fde68a', fontSize: '13.5px', marginBottom: '16px' }}>{warning}</div>}
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>{success}</div>}

      {!loading && !isAdmin && !myEmployee && (
        <div style={{ padding: '14px 16px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', marginBottom: '20px', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <span style={{ fontSize: '18px', lineHeight: 1 }}>ℹ️</span>
          <div><p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: '600', color: '#1e40af' }}>No employee record linked</p><p style={{ margin: 0, fontSize: '12.5px', color: '#3b82f6' }}>Your account isn't linked to an employee profile yet. Ask an Admin to link your user account to your employee record so you can apply for leave and view your balance.</p></div>
        </div>
      )}

      {/* Balance Cards with slim progress bars */}
      {balance && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
          {[
            { label: 'Annual Leave', total: Math.round(balance.annual_total), used: Math.round(balance.annual_used), color: '#2563eb' },
            { label: 'Sick Leave', total: Math.round(balance.sick_total), used: Math.round(balance.sick_used), color: '#d97706' },
            { label: 'Family Responsibility', total: Math.round(balance.family_total), used: Math.round(balance.family_used), color: '#16a34a' },
          ].map(b => {
            const remaining = Math.round(b.total - b.used);
            const pct = b.total ? Math.min(((b.used || 0) / b.total) * 100, 100) : 0;
            return (
              <div key={b.label} style={{ background: 'white', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
                <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 8px' }}>{b.label}</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '8px' }}>
                  <span style={{ fontFamily: 'Sora', fontSize: '28px', fontWeight: '700', color: remaining <= 0 ? '#dc2626' : '#0f172a', lineHeight: 1 }}>{remaining}</span>
                  <span style={{ color: '#94a3b8', fontSize: '12px' }}>/ {b.total} days</span>
                </div>
                <div style={{ height: '5px', borderRadius: '3px', background: '#f1f5f9', overflow: 'hidden', marginBottom: '4px' }}>
                  <div style={{ height: '100%', borderRadius: '3px', background: remaining <= 0 ? '#dc2626' : b.color, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                </div>
                <p style={{ color: '#94a3b8', fontSize: '11px', margin: '4px 0 0' }}>{b.used} days used</p>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div style={{ ...S.card, marginBottom: '24px', overflow: 'visible' }}>
          <div style={{ padding: '18px 22px', borderBottom: '1px solid #f1f5f9' }}><h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Apply for Leave</h3></div>
          <form onSubmit={handleSubmit} style={{ padding: '20px 22px' }}>
            <div style={S.responsiveGrid(isMobile)}>
              <div><label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Leave Type *</label><select value={form.leave_type} onChange={e => setForm(p => ({ ...p, leave_type: e.target.value }))} style={S.input}>{LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div />
              <div><label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Start Date *</label><DatePicker value={form.start_date} onChange={v => setForm(p => ({ ...p, start_date: v }))} minDate={new Date().toISOString().split('T')[0]} placeholder="YYYY/MM/DD" /></div>
              <div><label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>End Date *</label><DatePicker value={form.end_date} onChange={v => setForm(p => ({ ...p, end_date: v }))} minDate={form.start_date || new Date().toISOString().split('T')[0]} placeholder="YYYY/MM/DD" /></div>
            </div>
            {daysRequested > 0 && <div style={{ margin: '14px 0', padding: '12px 16px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe', display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#1d4ed8', fontSize: '13px', fontWeight: '500' }}>Working days requested</span><span style={{ color: '#1d4ed8', fontSize: '18px', fontWeight: '700', fontFamily: 'Sora' }}>{daysRequested}</span></div>}
            <div style={{ marginTop: '14px' }}><label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Reason</label><textarea value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} rows={3} placeholder="Optional reason for leave..." style={{ ...S.input, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '16px' }}>
              <button type="submit" disabled={submitting} className="btn-primary" style={{ ...S.primaryBtn, display: 'flex', alignItems: 'center', gap: '8px' }}>{submitting ? <><Spinner size="sm" inline /> Submitting...</> : 'Submit Request'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn-ghost" style={S.ghostBtn}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={S.card}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{viewTab === 'balances' ? 'Employee Leave Balances' : isAdmin ? 'All Leave Requests' : 'My Leave Requests'}</h3>
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: '8px', padding: '3px', gap: '2px' }}>
            {[{ key: 'list', label: 'List' }, { key: 'calendar', label: 'Calendar' }, ...(isAdmin ? [{ key: 'balances', label: 'Balances' }] : [])].map(opt => (
              <button key={opt.key} onClick={() => setViewTab(opt.key)} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer', background: viewTab === opt.key ? 'white' : 'transparent', color: viewTab === opt.key ? '#0f172a' : '#94a3b8', boxShadow: viewTab === opt.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{opt.label}</button>
            ))}
          </div>
        </div>

        {loading ? <Spinner size="lg" dark label="Loading leave data..." />
        : viewTab === 'balances' && isAdmin ? (
          balancesLoading ? <Spinner size="lg" dark label="Loading balances..." />
          : <div>
            <div style={{ padding: '12px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input placeholder="Search employees..." value={balanceSearch} onChange={e => setBalanceSearch(e.target.value)} style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', fontFamily: 'DM Sans', width: '100%', maxWidth: '280px', boxSizing: 'border-box', outline: 'none', color: '#0f172a' }} />
              <button onClick={fetchBalances} disabled={balancesLoading} title="Refresh balances" style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '7px 13px', cursor: balancesLoading ? 'default' : 'pointer', color: '#64748b', fontSize: '12px', fontFamily: 'DM Sans', whiteSpace: 'nowrap', opacity: balancesLoading ? 0.5 : 1 }}>{balancesLoading ? '...' : '↻ Refresh'}</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
                <thead><tr>{['Employee', 'Franchise', 'Annual', 'Sick', 'Family Resp.'].map(h => <th key={h} style={S.tableHeader}>{h}</th>)}</tr></thead>
                <tbody>{allBalances.filter(e => { if (!balanceSearch.trim()) return true; const s = balanceSearch.toLowerCase(); return `${e.first_name} ${e.last_name}`.toLowerCase().includes(s) || (e.franchise_name || '').toLowerCase().includes(s); }).map(e => {
                  const annualLeft = (e.annual_total || 0) - (e.annual_used || 0);
                  const sickLeft = (e.sick_total || 0) - (e.sick_used || 0);
                  const familyLeft = (e.family_total || 0) - (e.family_used || 0);
                  const balCell = (left, total, color) => (
                    <td style={S.tableCell}><div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><span style={{ fontWeight: '700', fontSize: '14px', color: left <= 0 ? '#dc2626' : '#0f172a', fontFamily: 'Sora', minWidth: '28px' }}>{left}</span><div style={{ flex: 1, maxWidth: '80px' }}><div style={{ height: '4px', borderRadius: '2px', background: '#f1f5f9', overflow: 'hidden' }}><div style={{ height: '100%', borderRadius: '2px', background: left <= 0 ? '#dc2626' : color, width: `${total ? Math.min(((total - left) / total) * 100, 100) : 0}%`, transition: 'width 0.3s' }} /></div></div><span style={{ fontSize: '11px', color: '#94a3b8' }}>/ {total}</span></div></td>
                  );
                  return <tr key={e.employee_id} className="table-row"><td style={{ ...S.tableCell, fontWeight: '500' }}>{e.first_name} {e.last_name}</td><td style={{ ...S.tableCell, color: '#64748b' }}>{e.franchise_name || '—'}</td>{balCell(annualLeft, e.annual_total, '#2563eb')}{balCell(sickLeft, e.sick_total, '#0891b2')}{balCell(familyLeft, e.family_total, '#16a34a')}</tr>;
                })}</tbody>
              </table>
              {allBalances.length === 0 && <p style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No employees found.</p>}
            </div>
          </div>
        ) : viewTab === 'calendar' ? (
          <LeaveCalendar requests={allRequests} year={calYear} month={calMonth} onPrev={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(y => y - 1); } else setCalMonth(m => m - 1); }} onNext={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(y => y + 1); } else setCalMonth(m => m + 1); }} isAdmin={isAdmin} onSelect={openLeaveDetail} />
        ) : allRequests.length === 0 ? (
          <EmptyState icon="—" title="No leave requests yet" subtitle={isAdmin ? 'Leave requests from your team will appear here.' : 'Submit your first leave request using the button above.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead><tr>{[...(isAdmin ? ['Employee'] : []), 'Type', 'Dates', 'Days', 'Reason', 'Status', ...(isAdmin ? ['Action'] : ['Documents'])].map(h => <th key={h} style={S.tableHeader}>{h}</th>)}</tr></thead>
              <tbody>{allRequests.map(r => (
                <tr key={r.id} className="table-row" onClick={() => openLeaveDetail(r)} style={{ cursor: 'pointer' }}>
                  {isAdmin && <td style={{ ...S.tableCell, fontWeight: '500' }}>{r.first_name} {r.last_name}</td>}
                  <td style={S.tableCell}>{r.leave_type}</td>
                  <td style={{ ...S.tableCell, whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDate(r.start_date)} → {fmtDate(r.end_date)}</td>
                  <td style={{ ...S.tableCell, textAlign: 'center' }}>{r.days_requested}</td>
                  <td style={{ ...S.tableCell, color: '#64748b', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.reason || '—'}</td>
                  <td style={S.tableCell}><span style={{ ...STATUS_STYLES[r.status], padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', display: 'inline-block', border: `1px solid ${STATUS_STYLES[r.status]?.color}30` }}>{r.status}</span>{r.rejection_reason && <p style={{ color: '#dc2626', fontSize: '11px', margin: '3px 0 0' }}>{r.rejection_reason}</p>}</td>
                  {isAdmin ? (
                    <td style={S.tableCell}>
                      <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '8px' }}><button onClick={(e) => { e.stopPropagation(); openLeaveDetail(r); }} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>View</button></div>
                      {r.status === 'Pending' ? (
                        rejecting === r.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '180px' }}>
                            <input placeholder="Rejection reason..." value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} onClick={(e) => e.stopPropagation()} style={{ ...S.input, padding: '5px 9px', fontSize: '12px' }} />
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'Rejected'); }} style={{ ...S.primaryBtn, background: 'linear-gradient(135deg,#dc2626,#b91c1c)', fontSize: '11px', padding: '5px 10px', boxShadow: 'none' }}>Confirm</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejecting(null); setRejectionReason(''); }} style={{ ...S.ghostBtn, fontSize: '11px', padding: '5px 10px' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            {actioning[r.id] ? <><Spinner size="sm" dark inline /><span style={{ color: '#94a3b8', fontSize: '12px' }}>{actioning[r.id]}…</span></>
                            : <>
                              <button onClick={(e) => { e.stopPropagation(); handleAction(r.id, 'Approved'); }} className="btn-success btn-link" style={{ background: 'none', border: 'none', color: '#16a34a', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: '4px' }}>Approve</button>
                              <button onClick={(e) => { e.stopPropagation(); setRejecting(r.id); }} className="btn-danger btn-link" style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: '4px' }}>Reject</button>
                            </>}
                          </div>
                        )
                      ) : <span style={{ color: '#94a3b8', fontSize: '12px' }}>{r.approved_by_username ? `by ${r.approved_by_username}` : '—'}</span>}
                    </td>
                  ) : (
                    <td style={S.tableCell}><button onClick={(e) => { e.stopPropagation(); openLeaveDetail(r); }} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>View / Attach Docs</button></td>
                  )}
                </tr>
              ))}</tbody>
            </table>
            {isAdmin && pagination && <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} limit={pagination.limit} onPageChange={handlePageChange} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── DatePicker ──
const DP_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DP_WEEKDAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];
const dpNavBtn = { background: '#f1f5f9', border: 'none', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: '16px', color: '#0f172a', lineHeight: 1 };
const dpSelStyle = { border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px 8px', fontFamily: 'DM Sans', fontSize: '13px', color: '#0f172a', background: 'white', cursor: 'pointer', outline: 'none' };

function DatePicker({ value, onChange, placeholder = 'YYYY/MM/DD', minDate }) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(value ? parseInt(value.slice(0,4)) : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(value ? parseInt(value.slice(5,7)) - 1 : today.getMonth());
  const triggerRef = useRef(null);
  const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
  const selected = value || null;

  const openPicker = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const spaceBelow = window.innerHeight - rect.bottom;
      const popupH = 320;
      setPopupPos({ top: spaceBelow >= popupH ? rect.bottom + window.scrollY + 4 : rect.top + window.scrollY - popupH - 4, left: Math.min(rect.left + window.scrollX, window.innerWidth + window.scrollX - 280) });
    }
    setOpen(o => !o);
  };

  useEffect(() => { if (!open) return; const close = (e) => { if (!e.target.closest('[data-dp-popup]') && !e.target.closest('[data-dp-trigger]')) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, [open]);

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) { const d = i - startDow + 1; cells.push(d >= 1 && d <= lastDay.getDate() ? d : null); }

  const fmt = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const display = selected ? `${selected.slice(0,4)}/${selected.slice(5,7)}/${selected.slice(8,10)}` : '';
  const isDisabled = (y, m, d) => { if (!minDate) return false; return fmt(y, m, d) < minDate; };
  const years = []; for (let y = today.getFullYear() - 5; y <= today.getFullYear() + 10; y++) years.push(y);

  return (
    <>
      <div ref={triggerRef} data-dp-trigger onClick={openPicker} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', background: 'white', cursor: 'pointer', fontFamily: 'DM Sans', fontSize: '13.5px', color: display ? '#0f172a' : '#94a3b8', userSelect: 'none', minWidth: '140px' }}>
        <span>{display || placeholder}</span>
        <span style={{ color: '#94a3b8', fontSize: '14px', marginLeft: '8px' }}>📅</span>
      </div>
      {open && (
        <div data-dp-popup style={{ position: 'fixed', top: popupPos.top, left: popupPos.left, zIndex: 9999, background: 'white', borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.14)', padding: '14px', width: '270px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '6px' }}>
            <button style={dpNavBtn} onClick={() => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y-1); } else setViewMonth(m => m-1); }}>‹</button>
            <div style={{ display: 'flex', gap: '4px', flex: 1, justifyContent: 'center' }}>
              <select value={viewMonth} onChange={e => setViewMonth(+e.target.value)} style={dpSelStyle}>{DP_MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
              <select value={viewYear} onChange={e => setViewYear(+e.target.value)} style={dpSelStyle}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
            </div>
            <button style={dpNavBtn} onClick={() => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y+1); } else setViewMonth(m => m+1); }}>›</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: '4px' }}>{DP_WEEKDAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: '700', color: '#94a3b8', padding: '2px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d}</div>)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px' }}>
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const ds = fmt(viewYear, viewMonth, d);
              const isSel = ds === selected;
              const isToday = ds === today.toISOString().split('T')[0];
              const disabled = isDisabled(viewYear, viewMonth, d);
              return <button key={i} disabled={disabled} onClick={() => { onChange(ds); setOpen(false); }} style={{ border: 'none', borderRadius: '6px', padding: '5px 0', textAlign: 'center', fontSize: '12px', fontFamily: 'DM Sans', cursor: disabled ? 'default' : 'pointer', background: isSel ? '#0f172a' : isToday ? '#eff6ff' : 'transparent', color: isSel ? 'white' : isToday ? '#2563eb' : disabled ? '#cbd5e1' : '#0f172a', fontWeight: isSel || isToday ? '700' : '400' }}>{d}</button>;
            })}
          </div>
          {selected && <button onClick={() => { onChange(''); setOpen(false); }} style={{ marginTop: '10px', width: '100%', background: 'none', border: '1px solid #e2e8f0', borderRadius: '7px', padding: '5px', fontSize: '12px', color: '#94a3b8', fontFamily: 'DM Sans', cursor: 'pointer' }}>Clear</button>}
        </div>
      )}
    </>
  );
}

// ── Compact Leave Calendar ──
const CAL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const CAL_DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const STATUS_CAL = { Approved: { bg: '#dcfce7', color: '#16a34a', border: '#bbf7d0' }, Pending: { bg: '#fef9c3', color: '#ca8a04', border: '#fde68a' }, Rejected: { bg: '#fee2e2', color: '#dc2626', border: '#fecaca' } };

function LeaveCalendar({ requests, year, month, onPrev, onNext, isAdmin, onSelect }) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;
  const cells = [];
  for (let i = 0; i < totalCells; i++) { const dayNum = i - startDow + 1; cells.push(dayNum >= 1 && dayNum <= lastDay.getDate() ? dayNum : null); }
  const dateStr = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const dayEvents = {};
  requests.forEach(r => { const start = r.start_date?.split('T')[0]; const end = r.end_date?.split('T')[0]; if (!start || !end) return; for (let d = 1; d <= lastDay.getDate(); d++) { const ds = dateStr(year, month, d); if (ds >= start && ds <= end) { if (!dayEvents[d]) dayEvents[d] = []; dayEvents[d].push(r); } } });
  const today = new Date();
  const isToday = (d) => d === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  return (
    <div style={{ padding: '0 0 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 22px 14px' }}>
        <button onClick={onPrev} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px 12px', cursor: 'pointer', color: '#64748b', fontSize: '14px', fontFamily: 'DM Sans' }}>‹</button>
        <span style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '700', color: '#0f172a' }}>{CAL_MONTHS[month]} {year}</span>
        <button onClick={onNext} style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '5px 12px', cursor: 'pointer', color: '#64748b', fontSize: '14px', fontFamily: 'DM Sans' }}>›</button>
      </div>
      <div style={{ display: 'flex', gap: '16px', padding: '0 22px 12px', flexWrap: 'wrap' }}>{Object.entries(STATUS_CAL).map(([s, c]) => <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><div style={{ width: '10px', height: '10px', borderRadius: '3px', background: c.bg, border: `1px solid ${c.border}` }} /><span style={{ fontSize: '11px', color: '#64748b', fontWeight: '600' }}>{s}</span></div>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', padding: '0 16px' }}>{CAL_DAYS.map(d => <div key={d} style={{ textAlign: 'center', padding: '4px 4px', fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>)}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: '2px', padding: '0 16px 8px' }}>
        {cells.map((d, i) => {
          const events = d ? (dayEvents[d] || []) : [];
          return (
            <div key={i} style={{ minHeight: '52px', borderRadius: '8px', background: d ? (isToday(d) ? '#eff6ff' : '#fafafa') : 'transparent', border: d ? (isToday(d) ? '1.5px solid #bfdbfe' : '1px solid #f1f5f9') : 'none', padding: '3px' }}>
              {d && <>
                <div style={{ fontSize: '10px', fontWeight: isToday(d) ? '700' : '400', color: isToday(d) ? '#2563eb' : '#64748b', textAlign: 'right', marginBottom: '2px', lineHeight: 1 }}>{d}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  {events.slice(0, 2).map(r => {
                    const cs = STATUS_CAL[r.status] || STATUS_CAL.Pending;
                    return <button key={r.id} onClick={() => onSelect(r)} title={`${isAdmin ? `${r.first_name} ${r.last_name} — ` : ''}${r.leave_type} (${r.status})`} style={{ display: 'block', width: '100%', border: `1px solid ${cs.border}`, borderRadius: '3px', background: cs.bg, color: cs.color, fontSize: '8px', fontWeight: '600', fontFamily: 'DM Sans', padding: '1px 3px', textAlign: 'left', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '1.2' }}>{isAdmin ? `${r.first_name?.charAt(0)}. ${r.last_name}` : r.leave_type}</button>;
                  })}
                  {events.length > 2 && <span style={{ fontSize: '8px', color: '#94a3b8', textAlign: 'center' }}>+{events.length - 2}</span>}
                </div>
              </>}
            </div>
          );
        })}
      </div>
    </div>
  );
}