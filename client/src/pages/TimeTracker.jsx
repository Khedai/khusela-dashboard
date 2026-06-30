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
  // Friday (5) = 60 min, else 30 min
  return new Date().getDay() === 5 ? 'Lunch (60 min)' : 'Lunch (30 min)';
}
const BREAK_LABELS = { tea_1: 'Tea 1 (15 min)', tea_2: 'Tea 2 (15 min)', lunch: getLunchLabel() };
const BREAK_ORDER = ['tea_1', 'lunch', 'tea_2'];
const MONITORING_ONLY = ['ayabonga', 'ayabulela'];

export default function TimeTracker() {
  const { user } = useAuth();
  const username = (user?.username || '').toLowerCase();
  if (MONITORING_ONLY.includes(username)) return <AdminView user={user} />;
  return <EmployeeView />;
}

// ════════════════════════════════════════════════════
//  ADMIN VIEW
// ════════════════════════════════════════════════════
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
  const [cleanupLoading, setCleanupLoading] = useState(false);
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

  const handleMarkAbsent = async () => {
    if (!window.confirm(`Mark all unclocked employees as absent for ${dateFilter}?`)) return;
    setAbsentLoading(true); setError(''); setSuccess('');
    try { const res = await api.post('/time/absent/run', { date: dateFilter }); setSuccess(res.data.message); fetchData(page); }
    catch { setError('Failed to mark absent.'); }
    finally { setAbsentLoading(false); }
  };

  const handleCleanup = async () => {
    if (!window.confirm('Auto-clock-out ALL past open shifts at 17:00? This will close every forgotten shift across all dates before today.')) return;
    setCleanupLoading(true); setError(''); setSuccess('');
    try {
      const res = await api.post('/time/cleanup');
      setSuccess(res.data.message + (res.data.details?.length ? `\n${res.data.details.map(d => `${d.employee} (${d.date}): ${d.workMinutes}min`).join('\n')}` : ''));
      fetchData(page);
    } catch { setError('Failed to clean up past shifts.'); }
    finally { setCleanupLoading(false); }
  };

  const presentCount = data.filter(d => (d.status === 'present' || d.status === 'late') && !d.clock_out).length;
  const lateCount = data.filter(d => d.status === 'late' && !d.clock_out).length;
  const clockedOutCount = data.filter(d => (d.status === 'present' || d.status === 'late') && d.clock_out).length;
  const absentCount = data.filter(d => d.status === 'absent').length;
  const todayStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontFamily: 'Sora', fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Time Tracker — Monitoring</h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{todayStr}</p>
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
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</label>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a' }}>
            <option value="">All</option><option value="present">Present</option><option value="late">Late</option><option value="absent">Absent</option>
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleCleanup} disabled={cleanupLoading} style={{ padding: '10px 16px', background: '#d97706', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans', cursor: cleanupLoading ? 'not-allowed' : 'pointer', opacity: cleanupLoading ? 0.7 : 1, marginRight: '8px' }}>
          {cleanupLoading ? 'Cleaning...' : 'Clean Up Past Shifts'}
        </button>
        <button onClick={handleMarkAbsent} disabled={absentLoading} style={{ padding: '10px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans', cursor: absentLoading ? 'not-allowed' : 'pointer', opacity: absentLoading ? 0.7 : 1 }}>
          {absentLoading ? 'Marking...' : 'Mark All Absent'}
        </button>
      </div>
      {loading ? <Spinner size="lg" dark label="Loading attendance..." />
      : data.length === 0 ? <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}><p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No attendance records for the selected filters.</p></div>
      : <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                {['Employee','Branch','Date','Status','Clock In','Clock Out','Work','Tea 1','Tea 2','Lunch','Idle','Location'].map(h => <th key={h} style={{ padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px', fontWeight: '500' }}>{row.first_name} {row.last_name}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{row.franchise_name || '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{new Date(row.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</td>
                    <td style={{ padding: '10px 12px' }}>
                      {(() => {
                        if (row.status === 'absent') {
                          return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#fef2f2', color: '#dc2626' }}>Absent</span>;
                        }
                        if (row.clock_out) {
                          return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#f1f5f9', color: '#64748b' }}>Done</span>;
                        }
                        if (row.active_idle_id) {
                          return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#fef2f2', color: '#dc2626' }}>Idle</span>;
                        }
                        if (row.active_break_type) {
                          const bm = { tea_1: 'Tea 1', tea_2: 'Tea 2', lunch: 'Lunch' };
                          return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#fffbeb', color: '#d97706' }}>{bm[row.active_break_type] || 'On Break'}</span>;
                        }
                        if (row.status === 'late') {
                          return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#fff7ed', color: '#c2410c' }}>Late</span>;
                        }
                        return <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', background: '#f0fdf4', color: '#16a34a' }}>Working</span>;
                      })()}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtTime(row.clock_in)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtTime(row.clock_out)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtDuration(row.total_work_minutes)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtDuration(row.tea_1_minutes)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtDuration(row.tea_2_minutes)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtDuration(row.lunch_minutes)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '13px' }}>{fmtDuration(row.idle_minutes)}</td>
                    <td style={{ padding: '10px 12px', color: '#334155', fontSize: '11px' }}>{row.location_name || (row.latitude ? `${Number(row.latitude).toFixed(4)}, ${Number(row.longitude).toFixed(4)}` : '—')}</td>
                  </tr>
                ))}
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
function isMobileOrTouch() {
  if (typeof window === 'undefined') return false;
  return ('ontouchstart' in window || navigator.maxTouchPoints > 0) || window.innerWidth < 768;
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

  useEffect(() => { setIsMobile(isMobileOrTouch()); const r = () => setIsMobile(isMobileOrTouch()); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r); }, []);
  useEffect(() => { fetchStatus(); return () => { stopTimer(); }; }, [fetchStatus]);

  const handleClockIn = async () => {
    setError(''); setSuccess(''); setActionLoading('clock-in');
    try {
      let lat = null, lng = null;
      if ('geolocation' in navigator) {
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {}
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
      await fetchStatus();
    } catch (err) { setError(err.response?.data?.error || 'Failed to clock out.'); }
    finally { setActionLoading(''); }
  };

  const handleStartBreak = async (breakType) => {
    setError(''); setSuccess(''); setActionLoading(breakType);
    try { await api.post('/time/break/start', { break_type: breakType }); await fetchStatus(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to start break.'); }
    finally { setActionLoading(''); }
  };

  const handleEndBreak = async () => {
    setError(''); setSuccess(''); setActionLoading('break-end');
    try { await api.post('/time/break/end'); breakStartRef.current = null; setDisplayBreakSeconds(0); await fetchStatus(); }
    catch (err) { setError(err.response?.data?.error || 'Failed to end break.'); }
    finally { setActionLoading(''); }
  };

  const isClockedIn = status?.attendance?.clock_in && !status?.attendance?.clock_out;
  const isClockedOut = status?.attendance?.clock_out;
  const activeBreak = status?.activeBreak;
  const completedBreaks = status?.completedBreaks || [];
  const nextAvailableBreak = BREAK_ORDER.find(b => !completedBreaks.includes(b));
  const completedBreakMinutes = 
    (status?.attendance?.tea_1_minutes || 0) + 
    (status?.attendance?.tea_2_minutes || 0) + 
    (status?.attendance?.lunch_minutes || 0);
  const completedIdleMinutes = status?.totalIdleMinutes || 0;
  
  const displayWorkSeconds = Math.max(0, 
    liveSeconds - 
    (activeBreak ? displayBreakSeconds : 0) - 
    (completedBreakMinutes * 60) - 
    (completedIdleMinutes * 60)
  );
  const todayStr = new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return <Spinner size="lg" dark label="Loading time tracker..." />;

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontFamily: 'Sora', fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>Time Tracker</h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{todayStr}</p>
      </div>
      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}
      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>{success}</div>}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Today's Status</p>
          <StatusBadge isClockedIn={isClockedIn} isClockedOut={isClockedOut} statusData={status} />
        </div>
        <div style={{ padding: '20px 22px' }}>
          {isClockedIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <StatusRow label="Clocked In" value={fmtTime(status?.attendance?.clock_in)} />
              <StatusRow label="Work Time" value={formatLiveTime(displayWorkSeconds)} highlight />
              {activeBreak && <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#92400e', fontWeight: '600' }}>{activeBreak.type === 'tea_1' ? 'Tea 1' : activeBreak.type === 'tea_2' ? 'Tea 2' : 'Lunch'} in progress</span>
                <span style={{ fontSize: '14px', color: '#92400e', fontWeight: '700', fontFamily: 'monospace' }}>{formatLiveTime(displayBreakSeconds)}</span>
              </div>}
            </div>
          ) : isClockedOut ? (
            <>
              <StatusRow label="Clocked In" value={fmtTime(status?.attendance?.clock_in)} />
              <StatusRow label="Clocked Out" value={fmtTime(status?.attendance?.clock_out)} />
              <StatusRow label="Total Work" value={fmtDuration(status?.attendance?.total_work_minutes)} highlight />
              <StatusRow label="Tea 1" value={fmtDuration(status?.attendance?.tea_1_minutes)} />
              <StatusRow label="Tea 2" value={fmtDuration(status?.attendance?.tea_2_minutes)} />
              <StatusRow label="Lunch" value={fmtDuration(status?.attendance?.lunch_minutes)} />
              <StatusRow label="Idle" value={fmtDuration(status?.attendance?.idle_minutes)} />
            </>
          ) : <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, textAlign: 'center', padding: '10px 0' }}>You haven't clocked in today.</p>}
        </div>
      </div>
      {!isClockedOut && <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Actions</p></div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {!isClockedIn ? (
            isMobile ? <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#1e40af', fontWeight: '600' }}>Clock in from your work computer</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#3b82f6' }}>Mobile clock-in is disabled to ensure you're at your workstation.</p>
            </div> : <button onClick={handleClockIn} disabled={!!actionLoading} style={{ width: '100%', padding: '12px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', fontFamily: 'DM Sans', cursor: actionLoading ? 'wait' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
              {actionLoading === 'clock-in' ? 'Clocking in...' : 'Clock In'}</button>
          ) : <>
            <button onClick={handleClockOut} disabled={!!actionLoading} style={{ width: '100%', padding: '12px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', fontFamily: 'DM Sans', cursor: actionLoading ? 'wait' : 'pointer', opacity: actionLoading ? 0.6 : 1 }}>
              {actionLoading === 'clock-out' ? 'Clocking out...' : 'Clock Out'}</button>
            {activeBreak ? <button onClick={handleEndBreak} disabled={actionLoading === 'break-end'} style={{ width: '100%', padding: '12px 16px', background: '#d97706', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', fontFamily: 'DM Sans', cursor: actionLoading === 'break-end' ? 'wait' : 'pointer', opacity: actionLoading === 'break-end' ? 0.6 : 1 }}>
              {actionLoading === 'break-end' ? 'Ending break...' : `End ${activeBreak.type === 'tea_1' ? 'Tea 1' : activeBreak.type === 'tea_2' ? 'Tea 2' : 'Lunch'} Break`}</button>
            : <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <p style={{ color: '#64748b', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 0' }}>Breaks</p>
                {BREAK_ORDER.map(b => {
                  const done = completedBreaks.includes(b);
                  const tea1Expired = b === 'tea_1' && !done && isTea1WindowClosed();
                  const available = b === nextAvailableBreak && !done && !tea1Expired;
                  const blocked = !available || done || tea1Expired;
                  return <button key={b} onClick={() => handleStartBreak(b)} disabled={blocked || !!actionLoading}
                    style={{ width: '100%', padding: '12px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', fontFamily: 'DM Sans', cursor: blocked ? 'not-allowed' : actionLoading ? 'wait' : 'pointer', opacity: blocked ? 0.4 : actionLoading ? 0.6 : 1 }}>
                    {actionLoading === b ? 'Starting...' : BREAK_LABELS[b]}{done ? ' (done)' : ''}{tea1Expired ? ' (expired — after 10:30)' : ''}{!done && !available && !tea1Expired ? ' (locked)' : ''}</button>;
                })}
              </div>}
          </>}
        </div>
      </div>}
      {isClockedOut && status?.attendance && <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}><p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Today's Breakdown</p></div>
        <div style={{ padding: '20px 22px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <StatBox label="Work" value={fmtDuration(status.attendance.total_work_minutes)} color="#3b82f6" />
          <StatBox label="Tea 1" value={fmtDuration(status.attendance.tea_1_minutes)} color="#8b5cf6" />
          <StatBox label="Tea 2" value={fmtDuration(status.attendance.tea_2_minutes)} color="#8b5cf6" />
          <StatBox label="Lunch" value={fmtDuration(status.attendance.lunch_minutes)} color="#f59e0b" />
          <StatBox label="Idle" value={fmtDuration(status.attendance.idle_minutes)} color="#ef4444" />
          <StatBox label="Total Day" value={fmtDuration((status.attendance.total_work_minutes||0)+(status.attendance.tea_1_minutes||0)+(status.attendance.tea_2_minutes||0)+(status.attendance.lunch_minutes||0)+(status.attendance.idle_minutes||0))} color="#0f172a" />
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
    try {
      const res = await api.get(`/time/my-history?page=${p}&limit=${LIMIT}`);
      setData(res.data.data || []);
      setPagination(res.data.pagination);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchHistory(page); }, [page, refreshKey]);

  if (loading && data.length === 0) return null;

  return (
    <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: '16px' }}>
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
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  {['Date','Status','Clock In','Clock Out','Work','Tea 1','Tea 2','Lunch','Idle'].map(h => <th key={h} style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b', fontWeight: '700', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.map(row => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{new Date(row.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: '2-digit' })}</td>
                    <td style={{ padding: '8px 10px' }}>
                      <span style={{ display: 'inline-block', padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '700',
                        background: row.status === 'present' ? '#f0fdf4' : row.status === 'late' ? '#fff7ed' : '#fef2f2',
                        color: row.status === 'present' ? '#16a34a' : row.status === 'late' ? '#c2410c' : '#dc2626' }}>
                        {row.status === 'present' ? 'Present' : row.status === 'late' ? 'Late' : 'Absent'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtTime(row.clock_in)}</td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtTime(row.clock_out)}</td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.total_work_minutes)}</td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.tea_1_minutes)}</td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.tea_2_minutes)}</td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.lunch_minutes)}</td>
                    <td style={{ padding: '8px 10px', color: '#334155', fontSize: '12px' }}>{fmtDuration(row.idle_minutes)}</td>
                  </tr>
                ))}
              </tbody>
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
    return <span style={{ background: isLate ? '#fff7ed' : '#f0fdf4', color: isLate ? '#c2410c' : '#16a34a', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: isLate ? '1px solid #fed7aa' : '1px solid #bbf7d0' }}>{isLate ? 'Working (Late)' : 'Working'}</span>;
  }
  if (isClockedOut) return <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: '1px solid #e2e8f0' }}>Done</span>;
  return <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: '1px solid #fecaca' }}>Not Clocked In</span>;
}
function StatusRow({ label, value, highlight }) { return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: '#64748b', fontSize: '13px' }}>{label}</span><span style={{ color: highlight ? '#0f172a' : '#1e293b', fontSize: highlight ? '18px' : '14px', fontWeight: highlight ? '700' : '500', fontFamily: highlight ? 'monospace' : 'inherit' }}>{value}</span></div>; }
function StatBox({ label, value, color }) { return <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', border: '1px solid #e2e8f0' }}><p style={{ margin: '0 0 3px', color: '#64748b', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p><p style={{ margin: 0, color, fontSize: '16px', fontWeight: '700' }}>{value}</p></div>; }
function StatCard({ label, value, color, bg }) { return <div style={{ background: bg, borderRadius: '10px', padding: '14px 16px', border: `1px solid ${color}20` }}><p style={{ margin: '0 0 6px', fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{label}</p><p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color }}>{value}</p></div>; }
