import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import Spinner from '../components/Spinner';

function fmtTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(minutes) {
  if (minutes === null || minutes === undefined) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h}h ${min.toString().padStart(2, '0')}m`;
}

function formatLiveTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function isTea1WindowClosed() {
  const now = new Date();
  const saHour = (now.getUTCHours() + 2 + 24) % 24;
  const saMin = now.getUTCMinutes();
  return (saHour > 10) || (saHour === 10 && saMin >= 30);
}

function getLunchLabel() {
  return new Date().getDay() === 5 ? 'Lunch (60 min)' : 'Lunch (30 min)';
}
const BREAK_LABELS = { tea_1: 'Tea 1 (15 min)', tea_2: 'Tea 2 (15 min)', lunch: getLunchLabel() };
const BREAK_ORDER = ['tea_1', 'lunch', 'tea_2'];
const MONITORING_ONLY = ['ayabonga', 'ayabulela', 'admin'];

export default function TimeTracker() {
  const { user } = useAuth();
  const username = (user?.username || '').toLowerCase();
  if (MONITORING_ONLY.includes(username)) return <AdminView user={user} />;
  return <EmployeeView />;
}

// ════════════════════════════════════════════════════
//  ADMIN VIEW
// ════════════════════════════════════════════════════
function toTimeInput(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  return d.toTimeString().slice(0, 5); // HH:MM
}

function AdminView({ user }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [statusFilter, setStatusFilter] = useState('');
  const [absentLoading, setAbsentLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [savingId, setSavingId] = useState(null);
  const LIMIT = 25;

  const fetchData = async (p = page) => {
    setLoading(true);
    try {
      const params = [`page=${p}`, `limit=${LIMIT}`];
      if (dateFilter) params.push(`date=${dateFilter}`);
      if (statusFilter) params.push(`status=${statusFilter}`);
      const res = await api.get(`/time/attendance?${params.join('&')}`);
      setData(res.data.data || []);
      setPagination(res.data.pagination);
    } catch { setError('Failed to load attendance data.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); fetchData(1); }, [dateFilter, statusFilter]);
  useEffect(() => { fetchData(page); }, [page]);

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditValues({
      clock_in: toTimeInput(row.clock_in),
      tea_1_minutes: row.tea_1_minutes != null ? String(Math.round(row.tea_1_minutes)) : '',
      tea_2_minutes: row.tea_2_minutes != null ? String(Math.round(row.tea_2_minutes)) : '',
      lunch_minutes: row.lunch_minutes != null ? String(Math.round(row.lunch_minutes)) : '',
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditValues({}); };

  const saveEdit = async (row) => {
    setSavingId(row.id); setError(''); setSuccess('');
    try {
      const payload = {};
      if (editValues.clock_in && editValues.clock_in !== toTimeInput(row.clock_in)) {
        // Reconstruct ISO datetime from the existing date + new time
        const dateStr = new Date(row.date).toISOString().split('T')[0];
        payload.clock_in = new Date(`${dateStr}T${editValues.clock_in}:00`).toISOString();
      }
      if (editValues.tea_1_minutes !== '' && Number(editValues.tea_1_minutes) !== Math.round(row.tea_1_minutes || 0)) {
        payload.tea_1_minutes = Number(editValues.tea_1_minutes);
      }
      if (editValues.tea_2_minutes !== '' && Number(editValues.tea_2_minutes) !== Math.round(row.tea_2_minutes || 0)) {
        payload.tea_2_minutes = Number(editValues.tea_2_minutes);
      }
      if (editValues.lunch_minutes !== '' && Number(editValues.lunch_minutes) !== Math.round(row.lunch_minutes || 0)) {
        payload.lunch_minutes = Number(editValues.lunch_minutes);
      }

      if (Object.keys(payload).length === 0) { cancelEdit(); return; }

      await api.patch(`/time/attendance/${row.id}`, payload);
      setSuccess('Attendance updated.');
      setEditingId(null); setEditValues({});
      fetchData(page);
    } catch (err) { setError(err.response?.data?.error || 'Failed to update.'); }
    finally { setSavingId(null); }
  };

  const editableStyle = (isEditing) => ({
    padding: '10px 12px',
    color: '#334155',
    fontSize: '13px',
    cursor: isEditing ? 'default' : 'pointer',
    background: isEditing ? '#eff6ff' : undefined,
  });

  const handleMarkAbsent = async () => {
    if (!window.confirm(`Mark all unclocked employees as absent for ${dateFilter}?`)) return;
    setAbsentLoading(true); setError(''); setSuccess('');
    try { const res = await api.post('/time/absent/run', { date: dateFilter }); setSuccess(res.data.message); fetchData(page); }
    catch { setError('Failed to mark absent.'); }
    finally { setAbsentLoading(false); }
  };

  const presentCount = data.filter(d => (d.status === 'present' || d.status === 'late') && !d.clock_out).length;
  const lateCount = data.filter(d => d.status === 'late' && !d.clock_out).length;
  const clockedOutCount = data.filter(d => (d.status === 'present' || d.status === 'late') && d.clock_out).length;
  const absentCount = data.filter(d => d.status === 'absent').length;
  const todayStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontFamily: 'Sora', fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Time Tracker — Monitoring</h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{todayStr}</p>
        <p style={{ color: '#6366f1', fontSize: '11px', margin: '4px 0 0', fontStyle: 'italic' }}>
          Click on Clock In, Tea 1, Tea 2, or Lunch to edit manually.
        </p>
      </div>
      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>{success}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <StatCard label="Working" value={presentCount} color="#16a34a" bg="#f0fdf4" />
        <StatCard label="Late" value={lateCount} color="#d97706" bg="#fff7ed" />
        <StatCard label="Done" value={clockedOutCount} color="#64748b" bg="#f8fafc" />
        <StatCard label="Absent" value={absentCount} color="#dc2626" bg="#fef2f2" />
        <StatCard label="Total" value={data.length} color="#0f172a" bg="#f1f5f9" />
      </div>
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 20px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div><label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</label><input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a' }} /></div>
        <div><label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a' }}><option value="">All</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option></select></div>
        <div style={{ flex: 1 }} />
        <button onClick={handleMarkAbsent} disabled={absentLoading} style={{ padding: '10px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans', cursor: absentLoading ? 'not-allowed' : 'pointer', opacity: absentLoading ? 0.7 : 1 }}>{absentLoading ? 'Marking...' : 'Mark All Absent'}</button>
      </div>
      {loading ? <Spinner size="lg" dark label="Loading attendance..." />
      : data.length === 0 ? <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}><p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No attendance records for the selected filters.</p></div>
      : <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', position: 'relative' }}>
            <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 1 }}>
                {['Employee','Branch','Date','Status','Clock In','Live Work','Clock Out','Work','Tea 1','Tea 2','Lunch','Location',''].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', background: '#f8fafc' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.map(row => {
                  const isEditing = editingId === row.id;
                  return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'white' }}>{row.first_name} {row.last_name}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{row.franchise_name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px', whiteSpace: 'nowrap' }}>{new Date(row.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {(() => {
                        if (row.status === 'absent') return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#fef2f2', color: '#dc2626' }}>Absent</span>;
                        if (row.clock_out) return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#f1f5f9', color: '#64748b' }}>Done</span>;
                        if (row.active_break_type) {
                          const bm = { tea_1: 'Tea 1', tea_2: 'Tea 2', lunch: 'Lunch' };
                          return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#fffbeb', color: '#d97706' }}>{bm[row.active_break_type] || 'On Break'}</span>;
                        }
                        if (row.status === 'late') return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#fff7ed', color: '#c2410c' }}>Late</span>;
                        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#f0fdf4', color: '#16a34a' }}>Working</span>;
                      })()}
                    </td>
                    <td style={editableStyle(isEditing)} onClick={() => row.clock_in && !isEditing && startEdit(row)} title={row.clock_in ? 'Click to edit clock-in time' : ''}>
                      {isEditing ? (
                        <input type="time" value={editValues.clock_in} onChange={e => setEditValues(v => ({ ...v, clock_in: e.target.value }))}
                          style={{ width: '100px', padding: '4px 6px', border: '1px solid #93c5fd', borderRadius: '5px', fontSize: '12px', fontFamily: 'DM Sans' }} />
                      ) : fmtTime(row.clock_in)}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#0f172a', fontSize: '14px', fontWeight: '700', fontFamily: '"Courier New", monospace' }}>
                      {!row.clock_out && row.clock_in
                        ? formatLiveTime(Math.floor((Date.now() - new Date(row.clock_in).getTime()) / 1000))
                        : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtTime(row.clock_out)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtDuration(row.total_work_minutes)}</td>
                    <td style={editableStyle(isEditing)} onClick={() => !isEditing && startEdit(row)} title="Click to edit Tea 1 minutes">
                      {isEditing ? (
                        <input type="number" min="0" value={editValues.tea_1_minutes} onChange={e => setEditValues(v => ({ ...v, tea_1_minutes: e.target.value }))}
                          style={{ width: '56px', padding: '4px 6px', border: '1px solid #93c5fd', borderRadius: '5px', fontSize: '12px', fontFamily: 'DM Sans' }} />
                      ) : fmtDuration(row.tea_1_minutes)}
                    </td>
                    <td style={editableStyle(isEditing)} onClick={() => !isEditing && startEdit(row)} title="Click to edit Tea 2 minutes">
                      {isEditing ? (
                        <input type="number" min="0" value={editValues.tea_2_minutes} onChange={e => setEditValues(v => ({ ...v, tea_2_minutes: e.target.value }))}
                          style={{ width: '56px', padding: '4px 6px', border: '1px solid #93c5fd', borderRadius: '5px', fontSize: '12px', fontFamily: 'DM Sans' }} />
                      ) : fmtDuration(row.tea_2_minutes)}
                    </td>
                    <td style={editableStyle(isEditing)} onClick={() => !isEditing && startEdit(row)} title="Click to edit Lunch minutes">
                      {isEditing ? (
                        <input type="number" min="0" value={editValues.lunch_minutes} onChange={e => setEditValues(v => ({ ...v, lunch_minutes: e.target.value }))}
                          style={{ width: '56px', padding: '4px 6px', border: '1px solid #93c5fd', borderRadius: '5px', fontSize: '12px', fontFamily: 'DM Sans' }} />
                      ) : fmtDuration(row.lunch_minutes)}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '11px' }}>{row.location_name || (row.latitude ? `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}` : '—')}</td>
                    <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <button onClick={() => saveEdit(row)} disabled={savingId === row.id}
                            style={{ padding: '4px 10px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', opacity: savingId === row.id ? 0.6 : 1 }}>
                            {savingId === row.id ? '...' : 'Save'}
                          </button>
                          <button onClick={cancelEdit}
                            style={{ padding: '4px 10px', background: '#e2e8f0', color: '#475569', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans' }}>
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(row)}
                          style={{ padding: '4px 8px', background: 'none', border: '1px solid #e2e8f0', borderRadius: '5px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans', color: '#6366f1' }}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
          {pagination && pagination.pages > 1 && <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
              <button key={p} onClick={() => setPage(p)} style={{ padding: '5px 12px', borderRadius: '6px', border: p === page ? '1px solid #6366f1' : '1px solid #e2e8f0', background: p === page ? '#eef2ff' : 'white', color: p === page ? '#4f46e5' : '#64748b', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans' }}>{p}</button>
            ))}
          </div>}
        </div>}
    </div>
  );
}

// ════════════════════════════════════════════════════
//  EMPLOYEE VIEW
// ════════════════════════════════════════════════════
function isSmallScreen() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 768;
}

// ── Browser notification helpers ────────────────────
function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/favicon.ico', badge: '/favicon.ico' });
  }
}

function getBreakReminder(completedBreaks) {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const day = now.getDay();

  // Tea 1: remind from 9:30–10:00 and during window 10:00–10:30
  if (!completedBreaks.includes('tea_1')) {
    if (h === 9 && m >= 30) return { title: '⏰ Tea 1 Coming Up', body: 'Tea 1 is from 10:00–10:30. Remember to clock your break!' };
    if (h === 10 && m <= 30) return { title: '☕ Tea 1 Now!', body: 'Tea 1 window is open (10:00–10:30). Tap to start your 15-min break.' };
  }

  // Lunch: remind from 11:30–13:30 (earlier window since lunch can be taken after tea 1)
  if (!completedBreaks.includes('lunch') && completedBreaks.includes('tea_1')) {
    if (h === 11 && m >= 30) return { title: '🍽️ Lunch Break', body: `Time for lunch! Remember to clock out for ${day === 5 ? '60' : '30'} min.` };
    if (h === 12 && m <= 30) return { title: '🍽️ Lunch Break', body: `Lunch time — don't forget to clock your ${day === 5 ? '60' : '30'}-min break.` };
    if (h === 13 && m <= 30) return { title: '🍽️ Lunch Reminder', body: `Still haven't taken lunch? Clock out for ${day === 5 ? '60' : '30'} min now.` };
  }

  // Tea 2: remind from 14:30–15:30 (after lunch)
  if (!completedBreaks.includes('tea_2') && completedBreaks.includes('lunch')) {
    if (h === 14 && m >= 30) return { title: '☕ Tea 2 Ahead', body: 'Tea 2 break coming up. 15 min to recharge!' };
    if (h === 15 && m <= 30) return { title: '☕ Tea 2 Time!', body: 'Time for your afternoon tea break. 15 min — clock it!' };
  }

  return null;
}

function EmployeeView() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [liveSeconds, setLiveSeconds] = useState(0);
  const timerRef = useRef(null);
  const breakStartRef = useRef(null);
  const activeBreakTypeRef = useRef(null);
  const [actionLoading, setActionLoading] = useState('');
  const [displayBreakSeconds, setDisplayBreakSeconds] = useState(0);
  const notifSentRef = useRef({});
  const notifIntervalRef = useRef(null);

  const stopTimer = () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setLiveSeconds(prev => prev + 1);
      if (breakStartRef.current) {
        const raw = Math.floor((Date.now() - breakStartRef.current) / 1000);
        setDisplayBreakSeconds(raw);
      }
    }, 1000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/time/today');
      setStatus(res.data);
      if (res.data.attendance?.clock_in && !res.data.attendance?.clock_out) {
        setLiveSeconds(Math.floor((Date.now() - new Date(res.data.attendance.clock_in).getTime()) / 1000));
        startTimer();
      } else { stopTimer(); setLiveSeconds(0); }
      if (res.data.activeBreak?.startedAt) {
        breakStartRef.current = new Date(res.data.activeBreak.startedAt).getTime();
        activeBreakTypeRef.current = res.data.activeBreak.type;
      } else {
        breakStartRef.current = null;
        activeBreakTypeRef.current = null;
      }
      setHistoryRefreshKey(k => k + 1);
    } catch (err) { console.error('fetch status error:', err); }
    finally { setLoading(false); }
  }, []);

  // Derived status values — must be above useEffects that reference them
  const isClockedIn = status?.attendance?.clock_in && !status?.attendance?.clock_out;
  const isClockedOut = status?.attendance?.clock_out;
  const activeBreak = status?.activeBreak;
  const completedBreaks = status?.completedBreaks || [];
  const tea1ExpiredGlobal = !completedBreaks.includes('tea_1') && isTea1WindowClosed();
  const nextAvailableBreak = BREAK_ORDER.find(b => {
    if (b === 'tea_1' && tea1ExpiredGlobal) return false;
    return !completedBreaks.includes(b);
  });

  useEffect(() => { setIsMobile(isSmallScreen()); const r = () => setIsMobile(isSmallScreen()); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => { fetchStatus(); return () => { stopTimer(); if (notifIntervalRef.current) clearInterval(notifIntervalRef.current); }; }, [fetchStatus]);

  // Request notification permission on mount
  useEffect(() => { requestNotificationPermission(); }, []);

  // Send break reminder notifications every 15 min while clocked in and not on break
  useEffect(() => {
    if (!isClockedIn || activeBreak) {
      if (notifIntervalRef.current) { clearInterval(notifIntervalRef.current); notifIntervalRef.current = null; }
      return;
    }
    const checkAndNotify = () => {
      const reminder = getBreakReminder(completedBreaks);
      if (reminder) {
        const key = `${reminder.title}`;
        const now = Date.now();
        // Only send each reminder type max once every 20 minutes
        if (!notifSentRef.current[key] || (now - notifSentRef.current[key] > 20 * 60 * 1000)) {
          notifSentRef.current[key] = now;
          sendNotification(reminder.title, reminder.body);
        }
      }
    };
    checkAndNotify(); // immediate check
    notifIntervalRef.current = setInterval(checkAndNotify, 15 * 60 * 1000); // every 15 min
    return () => { if (notifIntervalRef.current) { clearInterval(notifIntervalRef.current); notifIntervalRef.current = null; } };
  }, [isClockedIn, activeBreak, completedBreaks]);

  const handleClockIn = async () => {
    setError(''); setSuccess(''); setActionLoading('clock-in');
    try {
      let lat = null, lng = null;
      if ('geolocation' in navigator) {
        try { const pos = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })); lat = pos.coords.latitude; lng = pos.coords.longitude; } catch {}
      }
      const res = await api.post('/time/clock-in', { latitude: lat, longitude: lng });
      setSuccess(`Clocked in at ${fmtTime(res.data.clock_in)}`);
      await fetchStatus();
    } catch (err) { setError(err.response?.data?.error || 'Failed to clock in.'); }
    finally { setActionLoading(''); }
  };

  const handleClockOut = async () => {
    if (!window.confirm('Clock out for the day?')) return;
    setError(''); setSuccess(''); setActionLoading('clock-out');
    try {
      const res = await api.post('/time/clock-out');
      setSuccess(`Clocked out at ${fmtTime(res.data.clock_out)}. Total work: ${fmtDuration(res.data.total_work_minutes)}`);
      stopTimer(); breakStartRef.current = null; setLiveSeconds(0); setDisplayBreakSeconds(0);
      if (notifIntervalRef.current) { clearInterval(notifIntervalRef.current); notifIntervalRef.current = null; }
      await fetchStatus();
    } catch (err) { setError(err.response?.data?.error || 'Failed to clock out.'); }
    finally { setActionLoading(''); }
  };

  const handleStartBreak = async (breakType) => {
    if (!window.confirm(`Start ${BREAK_LABELS[breakType]} break now?`)) return;
    setError(''); setSuccess(''); setActionLoading(breakType);
    try { await api.post('/time/break/start', { break_type: breakType }); await fetchStatus(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to start break.'); }
    finally { setActionLoading(''); }
  };

  const handleEndBreak = async () => {
    if (!window.confirm('End your current break and resume work?')) return;
    setError(''); setSuccess(''); setActionLoading('break-end');
    try { await api.post('/time/break/end'); breakStartRef.current = null; setDisplayBreakSeconds(0); await fetchStatus(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to end break.'); }
    finally { setActionLoading(''); }
  };

  const completedBreakMinutes = 
    (status?.attendance?.tea_1_minutes || 0) + 
    (status?.attendance?.tea_2_minutes || 0) + 
    (status?.attendance?.lunch_minutes || 0);
  
  const displayWorkSeconds = Math.max(0, 
    liveSeconds - 
    (activeBreak ? displayBreakSeconds : 0) - 
    (completedBreakMinutes * 60)
  );
  const todayStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  const activeReminder = isClockedIn && !activeBreak ? getBreakReminder(completedBreaks) : null;

  if (loading) return <Spinner size="lg" dark label="Loading time tracker..." />;

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontFamily: 'Sora', fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Time Tracker</h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{todayStr}</p>
      </div>
      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>{success}</div>}

      {/* Break reminder banner */}
      {activeReminder && (
        <div style={{ padding: '14px 18px', borderRadius: '12px', background: 'linear-gradient(135deg, #eff6ff, #dbeafe)', border: '1px solid #93c5fd', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '28px', flexShrink: 0 }}>{activeReminder.title.match(/^[^\s]+/)?.[0] || '⏰'}</span>
          <div>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#1e40af' }}>{activeReminder.title.replace(/^[^\s]+\s/, '')}</p>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#3b82f6' }}>{activeReminder.body}</p>
          </div>
        </div>
      )}

      {/* Status card with digital live clock */}
      <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Today's Status</p>
          <StatusBadge isClockedIn={isClockedIn} isClockedOut={isClockedOut} statusData={status} />
        </div>
        <div style={{ padding: '20px 22px' }}>
          {isClockedIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <StatusRow label="Clocked In" value={fmtTime(status?.attendance?.clock_in)} />
              {/* Digital monospace clock face with ambient glow */}
              <style>{`
                @keyframes glowPulse {
                  0%, 100% { opacity: 0.4; }
                  50% { opacity: 0.7; }
                }
              `}</style>
              <div style={{
                background: '#0f172a', borderRadius: '14px', padding: '18px 24px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '12px', margin: '4px 0',
                position: 'relative', overflow: 'hidden',
                boxShadow: activeBreak
                  ? '0 0 40px rgba(245,158,11,0.25), 0 0 80px rgba(245,158,11,0.08)'
                  : '0 0 40px rgba(74,222,128,0.25), 0 0 80px rgba(74,222,128,0.08)',
                transition: 'box-shadow 0.6s ease',
              }}>
                {/* Ambient glow layer */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: activeBreak
                    ? 'radial-gradient(ellipse at center, rgba(245,158,11,0.12) 0%, transparent 70%)'
                    : 'radial-gradient(ellipse at center, rgba(74,222,128,0.12) 0%, transparent 70%)',
                  animation: 'glowPulse 2.5s ease-in-out infinite',
                  pointerEvents: 'none',
                  transition: 'background 0.6s ease',
                }} />
                <div style={{
                  fontFamily: '"Courier New", monospace', fontSize: '36px', fontWeight: '700',
                  color: activeBreak ? '#fbbf24' : '#4ade80',
                  letterSpacing: '3px', lineHeight: 1,
                  position: 'relative', zIndex: 1,
                  transition: 'color 0.6s ease',
                }}>
                  {formatLiveTime(displayWorkSeconds)}
                </div>
                <div style={{
                  color: '#64748b', fontSize: '11px', fontWeight: '600',
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                  position: 'relative', zIndex: 1,
                }}>
                  <div>{activeBreak ? 'break' : 'work'}</div>
                  <div>{activeBreak ? 'time' : 'time'}</div>
                </div>
              </div>
              {activeBreak && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: '#92400e', fontWeight: '600' }}>{activeBreak.type === 'tea_1' ? 'Tea 1' : activeBreak.type === 'tea_2' ? 'Tea 2' : 'Lunch'} in progress</span>
                  <span style={{ fontSize: '14px', color: '#92400e', fontWeight: '700', fontFamily: '"Courier New", monospace' }}>{formatLiveTime(displayBreakSeconds)}</span>
                </div>)}
            </div>
          ) : isClockedOut ? (
            <>
              <StatusRow label="Clocked In" value={fmtTime(status?.attendance?.clock_in)} />
              <StatusRow label="Clocked Out" value={fmtTime(status?.attendance?.clock_out)} />
              <StatusRow label="Total Work" value={fmtDuration(status?.attendance?.total_work_minutes)} highlight />
              <StatusRow label="Tea 1" value={fmtDuration(status?.attendance?.tea_1_minutes)} />
              <StatusRow label="Tea 2" value={fmtDuration(status?.attendance?.tea_2_minutes)} />
              <StatusRow label="Lunch" value={fmtDuration(status?.attendance?.lunch_minutes)} />
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ padding: '14px 16px', borderRadius: '8px', background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>⏰</span>
                <div><p style={{ margin: 0, fontSize: '14px', color: '#c2410c', fontWeight: '700' }}>Don't forget to clock in!</p><p style={{ margin: '2px 0 0', fontSize: '12px', color: '#9a3412' }}>You need to clock in to start tracking your work hours for today.</p></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* How it works */}
      <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '14px 22px', borderBottom: '1px solid #f1f5f9', background: '#f0f9ff' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>How it works</p></div>
        <div style={{ padding: '14px 22px', fontSize: '12px', color: '#475569', lineHeight: '1.6' }}>
          <p style={{ margin: '0 0 4px' }}><strong>1.</strong> Click <strong>Clock In</strong> when you start work. Clock-in after <strong>08:30</strong> is marked as late.</p>
          <p style={{ margin: '0 0 4px' }}><strong>2.</strong> Take <strong>Tea 1</strong> between <strong>10:00 – 10:30</strong>. After 10:30, Tea 1 is unavailable — go straight to Lunch.</p>
          <p style={{ margin: '0 0 4px' }}><strong>3.</strong> Take <strong>Lunch</strong> (30 min, or 60 min on Fridays).</p>
          <p style={{ margin: '0 0 4px' }}><strong>4.</strong> Take <strong>Tea 2</strong> after Lunch.</p>
          <p style={{ margin: '0 0 4px' }}><strong>5.</strong> Click <strong>Clock Out</strong> when you're done for the day. If you forget, the system auto-clocks you out at 17:10.</p>
        </div>
      </div>

      {/* Actions with tactile button patterns */}
      {!isClockedOut && <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Actions</p></div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!isClockedIn ? (
            isMobile ? <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>Clock in from your work computer</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#3b82f6' }}>Mobile clock-in is disabled to ensure you're at your workstation.</p>
            </div>
            : <button onClick={handleClockIn} disabled={!!actionLoading} style={{
              width: '100%', padding: '14px 16px',
              background: 'linear-gradient(135deg, #16a34a, #15803d)',
              color: 'white', border: 'none', borderRadius: '10px',
              fontSize: '15px', fontWeight: '700', fontFamily: 'DM Sans',
              cursor: actionLoading ? 'wait' : 'pointer',
              opacity: actionLoading ? 0.6 : 1,
              boxShadow: '0 3px 12px rgba(22,163,74,0.3)',
              transition: 'transform 0.12s, box-shadow 0.12s',
            }}
              onMouseEnter={e => { if (!actionLoading) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(22,163,74,0.35)'; } }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 3px 12px rgba(22,163,74,0.3)'; }}>
              {actionLoading === 'clock-in' ? 'Clocking in...' : '⏰ Clock In'}
            </button>
          ) : <>
            <button onClick={handleClockOut} disabled={!!actionLoading} style={{
              width: '100%', padding: '14px 16px',
              background: 'linear-gradient(135deg, #64748b, #475569)',
              color: 'white', border: 'none', borderRadius: '10px',
              fontSize: '15px', fontWeight: '700', fontFamily: 'DM Sans',
              cursor: actionLoading ? 'wait' : 'pointer',
              opacity: actionLoading ? 0.6 : 1,
              boxShadow: '0 3px 12px rgba(100,116,139,0.25)',
            }}>
              {actionLoading === 'clock-out' ? 'Clocking out...' : 'Clock Out'}
            </button>
            {activeBreak ? <button onClick={handleEndBreak} disabled={actionLoading === 'break-end'} style={{
              width: '100%', padding: '12px 16px',
              background: 'linear-gradient(135deg, #d97706, #b45309)',
              color: 'white', border: 'none', borderRadius: '10px',
              fontSize: '14px', fontWeight: '700', fontFamily: 'DM Sans',
              cursor: actionLoading === 'break-end' ? 'wait' : 'pointer',
              opacity: actionLoading === 'break-end' ? 0.6 : 1,
              boxShadow: '0 3px 12px rgba(217,119,6,0.3)',
            }}>
              {actionLoading === 'break-end' ? 'Ending break...' : `▶ End ${activeBreak.type === 'tea_1' ? 'Tea 1' : activeBreak.type === 'tea_2' ? 'Tea 2' : 'Lunch'} Break`}
            </button>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ color: '#64748b', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 0' }}>Breaks</p>
                {BREAK_ORDER.map(b => {
                  const done = completedBreaks.includes(b);
                  const tea1Expired = b === 'tea_1' && !done && isTea1WindowClosed();
                  const available = b === nextAvailableBreak && !done && !tea1Expired;
                  const blocked = !available || done || tea1Expired;
                  return <button key={b} onClick={() => handleStartBreak(b)} disabled={blocked || !!actionLoading}
                    style={{
                      width: '100%', padding: '12px 16px',
                      background: '#f59e0b', color: 'white', border: 'none', borderRadius: '10px',
                      fontSize: '14px', fontWeight: '600', fontFamily: 'DM Sans',
                      cursor: blocked ? 'not-allowed' : actionLoading ? 'wait' : 'pointer',
                      opacity: blocked ? 0.35 : actionLoading ? 0.6 : 1,
                      boxShadow: blocked ? 'none' : '0 3px 12px rgba(245,158,11,0.3)',
                    }}>
                    {actionLoading === b ? 'Starting...' : BREAK_LABELS[b]}{done ? ' (done)' : ''}{tea1Expired ? ' (expired — after 10:30)' : ''}{!done && !available && !tea1Expired ? ' (locked)' : ''}
                  </button>;
                })}
              </div>}
          </>}
        </div>
      </div>}

      {/* Today's Breakdown */}
      {isClockedOut && status?.attendance && <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Today's Breakdown</p></div>
        <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <StatBox label="Work" value={fmtDuration(status.attendance.total_work_minutes)} color="#3b82f6" />
          <StatBox label="Tea 1" value={fmtDuration(status.attendance.tea_1_minutes)} color="#8b5cf6" />
          <StatBox label="Tea 2" value={fmtDuration(status.attendance.tea_2_minutes)} color="#8b5cf6" />
          <StatBox label="Lunch" value={fmtDuration(status.attendance.lunch_minutes)} color="#f59e0b" />
        </div>
      </div>}

      {!status && !loading && <div style={{ padding: '14px 16px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', marginTop: '16px' }}><p style={{ margin: 0, fontSize: '13px', color: '#92400e' }}>Your user account is not linked to an active employee record. Contact an Admin to link your account.</p></div>}
      <MyHistory refreshKey={historyRefreshKey} />
    </div>
  );
}

// ════════════════════════════════════════════════════
//  MY HISTORY
// ════════════════════════════════════════════════════
function MyHistory({ refreshKey = 0 }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const LIMIT = 10;

  const fetchHistory = async (p = page) => {
    setLoading(true);
    try { const res = await api.get(`/time/my-history?page=${p}&limit=${LIMIT}`); setData(res.data.data || []); setPagination(res.data.pagination); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchHistory(page); }, [page, refreshKey]);

  if (loading && data.length === 0) return null;

  return (
    <div style={{ background: 'white', borderRadius: '14px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflow: 'hidden', marginTop: '16px' }}>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>My History</p>
        {pagination && <span style={{ color: '#94a3b8', fontSize: '11px' }}>{pagination.total} record{pagination.total !== 1 ? 's' : ''}</span>}
      </div>
      {data.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No attendance records yet.</div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Date','Status','Clock In','Clock Out','Work','Tea 1','Tea 2','Lunch'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: '700', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>{data.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{new Date(row.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                  <td style={{ padding: '8px 10px' }}><span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', background: row.status === 'present' ? '#f0fdf4' : row.status === 'late' ? '#fff7ed' : '#fef2f2', color: row.status === 'present' ? '#16a34a' : row.status === 'late' ? '#c2410c' : '#dc2626' }}>{row.status === 'present' ? 'Present' : row.status === 'late' ? 'Late' : 'Absent'}</span></td>
                  <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtTime(row.clock_in)}</td>
                  <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtTime(row.clock_out)}</td>
                  <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.total_work_minutes)}</td>
                  <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.tea_1_minutes)}</td>
                  <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.tea_2_minutes)}</td>
                  <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.lunch_minutes)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {pagination && pagination.pages > 1 && (
            <div style={{ padding: '8px 16px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', gap: '5px', flexWrap: 'wrap' }}>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)} style={{ padding: '3px 10px', borderRadius: '5px', border: p === page ? '1px solid #6366f1' : '1px solid #e2e8f0', background: p === page ? '#eef2ff' : 'white', color: p === page ? '#4f46e5' : '#64748b', fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans' }}>{p}</button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Shared sub-components ──────────────────────────
function StatusBadge({ isClockedIn, isClockedOut, statusData }) {
  if (isClockedIn) {
    const isLate = statusData?.attendance?.status === 'late';
    return <span style={{ background: isLate ? '#fff7ed' : '#f0fdf4', color: isLate ? '#c2410c' : '#16a34a', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: isLate ? '1px solid #fed7aa' : '1px solid #bbf7d0' }}>{isLate ? 'Working (Late)' : 'Working'}</span>;
  }
  if (isClockedOut) return <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: '1px solid #e2e8f0' }}>Done</span>;
  return <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: '1px solid #fecaca' }}>Not Clocked In</span>;
}
function StatusRow({ label, value, highlight }) { return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#64748b', fontSize: '13px' }}>{label}</span><span style={{ color: highlight ? '#0f172a' : '#1e293b', fontSize: highlight ? '18px' : '14px', fontWeight: highlight ? '700' : '500', fontFamily: highlight ? '"Courier New", monospace' : 'inherit' }}>{value}</span></div>; }
function StatBox({ label, value, color }) { return <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', border: '1px solid #e2e8f0' }}><p style={{ margin: '0 0 3px', color: '#64748b', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p><p style={{ margin: 0, color, fontSize: '16px', fontWeight: '700' }}>{value}</p></div>; }
function StatCard({ label, value, color, bg }) { return <div style={{ background: bg, borderRadius: '10px', padding: '14px 16px', border: `1px solid ${color}20` }}><p style={{ margin: '0 0 6px', fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{label}</p><p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color }}>{value}</p></div>; }