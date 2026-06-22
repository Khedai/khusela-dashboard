import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import Spinner from '../components/Spinner';

// ─── Helpers ───────────────────────────────────────────
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

function fmtDateFull(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const BREAK_LABELS = { tea_1: '☕ Tea 1 (15 min)', tea_2: '☕ Tea 2 (15 min)', lunch: '🍽 Lunch (30 min)' };
const BREAK_ORDER = ['tea_1', 'tea_2', 'lunch'];

// ─── Main Component ────────────────────────────────────
const MONITORING_ONLY = ['ayabonga', 'ayabulela'];

export default function TimeTracker() {
  const { user } = useAuth();
  const username = (user?.username || '').toLowerCase();
  if (MONITORING_ONLY.includes(username)) return <AdminView user={user} />;
  return <EmployeeView />;
}

// ════════════════════════════════════════════════════════
//  ADMIN VIEW — Attendance Monitoring Dashboard
// ════════════════════════════════════════════════════════
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
    } catch (err) {
      setError('Failed to load attendance data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); fetchData(1); }, [dateFilter, statusFilter]);
  useEffect(() => { fetchData(page); }, [page]);

  const handleMarkAbsent = async () => {
    if (!window.confirm(`Mark all unclocked employees as absent for ${dateFilter}?`)) return;
    setAbsentLoading(true); setError(''); setSuccess('');
    try {
      const res = await api.post('/time/absent/run');
      setSuccess(res.data.message);
      fetchData(page);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to mark absent.');
    } finally {
      setAbsentLoading(false);
    }
  };

  // Stats from current page data
  const presentCount = data.filter(d => d.status === 'present' && !d.clock_out).length;
  const clockedOutCount = data.filter(d => d.status === 'present' && d.clock_out).length;
  const absentCount = data.filter(d => d.status === 'absent').length;

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontFamily: 'Sora', fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>
          ⏱ Time Tracker — Monitoring
        </h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{todayStr}</p>
      </div>

      {error && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>
          {success}
          <button onClick={() => setSuccess('')} style={{ float: 'right', background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>×</button>
        </div>
      )}

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '16px' }}>
        <StatCard label="🟢 Working" value={presentCount} color="#16a34a" bg="#f0fdf4" />
        <StatCard label="⚫ Done" value={clockedOutCount} color="#64748b" bg="#f8fafc" />
        <StatCard label="🔴 Absent" value={absentCount} color="#dc2626" bg="#fef2f2" />
        <StatCard label="📋 Total" value={data.length} color="#0f172a" bg="#f1f5f9" />
      </div>

      {/* Filters & Actions */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '16px 20px', marginBottom: '16px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Date</label>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</label>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '13px', fontFamily: 'DM Sans', color: '#0f172a' }}>
            <option value="">All</option>
            <option value="present">Present</option>
            <option value="absent">Absent</option>
          </select>
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={handleMarkAbsent} disabled={absentLoading}
          title="Mark all employees who haven't clocked in today as absent"
          style={{
            padding: '10px 16px', background: '#dc2626', color: 'white', border: 'none',
            borderRadius: '8px', fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans',
            cursor: absentLoading ? 'not-allowed' : 'pointer', opacity: absentLoading ? 0.7 : 1,
          }}>
          {absentLoading ? 'Marking...' : '🔴 Mark All Absent'}
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <Spinner size="lg" dark label="Loading attendance..." />
      ) : data.length === 0 ? (
        <div style={{ background: 'white', borderRadius: '12px', padding: '40px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0 }}>No attendance records for the selected filters.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={thStyle()}>Employee</th>
                  <th style={thStyle()}>Branch</th>
                  <th style={thStyle()}>Date</th>
                  <th style={thStyle()}>Status</th>
                  <th style={thStyle()}>Clock In</th>
                  <th style={thStyle()}>Clock Out</th>
                  <th style={thStyle()}>Work</th>
                  <th style={thStyle()}>Tea 1</th>
                  <th style={thStyle()}>Tea 2</th>
                  <th style={thStyle()}>Lunch</th>
                  <th style={thStyle()}>Idle</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdStyle()}><strong>{row.first_name} {row.last_name}</strong></td>
                    <td style={tdStyle()}>{row.franchise_name || '—'}</td>
                    <td style={tdStyle()}>{fmtDateShort(row.date)}</td>
                    <td style={tdStyle()}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: row.status === 'present' && row.clock_out ? '#f1f5f9' : row.status === 'present' ? '#f0fdf4' : '#fef2f2',
                        color: row.status === 'present' && row.clock_out ? '#64748b' : row.status === 'present' ? '#16a34a' : '#dc2626',
                      }}>
                        {row.status === 'present' && row.clock_out ? 'Done' : row.status === 'present' ? 'Working' : 'Absent'}
                      </span>
                    </td>
                    <td style={tdStyle()}>{fmtTime(row.clock_in)}</td>
                    <td style={tdStyle()}>{fmtTime(row.clock_out)}</td>
                    <td style={tdStyle()}>{fmtDuration(row.total_work_minutes)}</td>
                    <td style={tdStyle()}>{fmtDuration(row.tea_1_minutes)}</td>
                    <td style={tdStyle()}>{fmtDuration(row.tea_2_minutes)}</td>
                    <td style={tdStyle()}>{fmtDuration(row.lunch_minutes)}</td>
                    <td style={tdStyle()}>{fmtDuration(row.idle_minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.pages > 1 && (
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap' }}>
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setPage(p)}
                  style={{
                    padding: '5px 12px', borderRadius: '6px', border: p === page ? '1px solid #6366f1' : '1px solid #e2e8f0',
                    background: p === page ? '#eef2ff' : 'white', color: p === page ? '#4f46e5' : '#64748b',
                    fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans',
                  }}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════
//  EMPLOYEE VIEW — Clock In/Out + Breaks + Idle
// ════════════════════════════════════════════════════════
function EmployeeView() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [status, setStatus] = useState(null);

  const [liveSeconds, setLiveSeconds] = useState(0);
  const timerRef = useRef(null);

  const [idleSeconds, setIdleSeconds] = useState(0);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const idleTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const IDLE_THRESHOLD = 5 * 60;
  const IDLE_WARN_GRACE = 2 * 60;

  const [activeBreakSeconds, setActiveBreakSeconds] = useState(0);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await api.get('/time/today');
      setStatus(res.data);

      if (res.data.attendance?.clock_in && !res.data.attendance?.clock_out) {
        const clockIn = new Date(res.data.attendance.clock_in).getTime();
        setLiveSeconds(Math.floor((Date.now() - clockIn) / 1000));
        startTimer();
      } else {
        stopTimer();
        setLiveSeconds(0);
      }

      if (res.data.activeBreak) {
        setActiveBreakSeconds(Math.floor((Date.now() - new Date(res.data.activeBreak.startedAt).getTime()) / 1000));
      } else {
        setActiveBreakSeconds(0);
      }
    } catch (err) {
      console.error('fetch status error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    return () => { stopTimer(); clearInterval(idleTimerRef.current); };
  }, [fetchStatus]);

  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setLiveSeconds(prev => prev + 1);
      if (activeBreakSeconds > 0) setActiveBreakSeconds(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    setIdleSeconds(0);
    setShowIdleWarning(false);
    if (isIdle) {
      setIsIdle(false);
      api.post('/time/idle', { action: 'end' }).catch(() => {});
      setSuccess('Welcome back!');
      setTimeout(() => setSuccess(''), 3000);
    }
  }, [isIdle]);

  useEffect(() => {
    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    const handler = () => resetIdle();
    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    return () => events.forEach(e => window.removeEventListener(e, handler));
  }, [resetIdle]);

  useEffect(() => {
    idleTimerRef.current = setInterval(() => {
      const idleTime = Math.floor((Date.now() - lastActivityRef.current) / 1000);
      setIdleSeconds(idleTime);
      if (status?.attendance?.clock_in && !status?.attendance?.clock_out && !isIdle) {
        if (idleTime >= IDLE_THRESHOLD && !showIdleWarning) setShowIdleWarning(true);
        if (idleTime >= IDLE_THRESHOLD + IDLE_WARN_GRACE && !isIdle) {
          setIsIdle(true);
          api.post('/time/idle', { action: 'start' }).catch(() => {});
        }
      }
    }, 1000);
    return () => clearInterval(idleTimerRef.current);
  }, [status, showIdleWarning, isIdle]);

  const handleClockIn = async () => {
    setError(''); setSuccess('');
    try {
      const res = await api.post('/time/clock-in');
      setSuccess(`Clocked in at ${fmtTime(res.data.clock_in)}`);
      await fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clock in.');
    }
  };

  const handleClockOut = async () => {
    if (!window.confirm('Clock out for the day? This will end any active breaks.')) return;
    setError(''); setSuccess('');
    try {
      const res = await api.post('/time/clock-out');
      setSuccess(`Clocked out at ${fmtTime(res.data.clock_out)}. Total work: ${fmtDuration(res.data.total_work_minutes)}`);
      stopTimer();
      setLiveSeconds(0);
      setActiveBreakSeconds(0);
      await fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clock out.');
    }
  };

  const handleStartBreak = async (breakType) => {
    setError(''); setSuccess('');
    try {
      await api.post('/time/break/start', { break_type: breakType });
      await fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start break.');
    }
  };

  const handleEndBreak = async () => {
    setError(''); setSuccess('');
    try {
      await api.post('/time/break/end');
      setActiveBreakSeconds(0);
      await fetchStatus();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to end break.');
    }
  };

  const isClockedIn = status?.attendance?.clock_in && !status?.attendance?.clock_out;
  const isClockedOut = status?.attendance?.clock_out;
  const activeBreak = status?.activeBreak;
  const completedBreaks = status?.completedBreaks || [];
  const nextAvailableBreak = BREAK_ORDER.find(b => !completedBreaks.includes(b));
  const displayWorkSeconds = Math.max(0, liveSeconds - (activeBreak ? activeBreakSeconds : 0) - (isIdle ? idleSeconds - IDLE_THRESHOLD : 0));

  const today = new Date();
  const todayStr = today.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

  if (loading) return <Spinner size="lg" dark label="Loading time tracker..." />;

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontFamily: 'Sora', fontSize: '20px', fontWeight: '700', color: '#0f172a', margin: '0 0 4px' }}>
          ⏱ Time Tracker
        </h2>
        <p style={{ color: '#64748b', fontSize: '13px', margin: 0 }}>{todayStr}</p>
      </div>

      {error && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13px', marginBottom: '16px' }}>
          {error}
          <button onClick={() => setError('')} style={{ float: 'right', background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13px', marginBottom: '16px' }}>
          {success}
          <button onClick={() => setSuccess('')} style={{ float: 'right', background: 'none', border: 'none', color: '#16a34a', cursor: 'pointer', fontWeight: '700', fontSize: '14px' }}>×</button>
        </div>
      )}

      {/* Status Card */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: '16px' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Today's Status</p>
          <StatusBadge isClockedIn={isClockedIn} isClockedOut={isClockedOut} />
        </div>
        <div style={{ padding: '20px 22px' }}>
          {isClockedIn ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <StatusRow label="Clocked In" value={fmtTime(status?.attendance?.clock_in)} />
              <StatusRow label="Work Time" value={formatLiveTime(displayWorkSeconds)} highlight />
              {activeBreak && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#92400e', fontWeight: '600' }}>
                      {activeBreak.type === 'tea_1' ? '☕ Tea 1' : activeBreak.type === 'tea_2' ? '☕ Tea 2' : '🍽 Lunch'} in progress
                    </span>
                    <span style={{ fontSize: '14px', color: '#92400e', fontWeight: '700', fontFamily: 'monospace' }}>
                      {formatLiveTime(activeBreakSeconds)}
                    </span>
                  </div>
                </div>
              )}
              {isIdle && (
                <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#fef2f2', border: '1px solid #fecaca' }}>
                  <span style={{ fontSize: '13px', color: '#991b1b', fontWeight: '600' }}>⏸ Idle — timer paused</span>
                </div>
              )}
              {showIdleWarning && !isIdle && !isClockedOut && <IdleWarning onImHere={resetIdle} />}
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
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, textAlign: 'center', padding: '10px 0' }}>
              You haven't clocked in today.
            </p>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      {!isClockedOut && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden', marginBottom: '16px' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Actions</p>
          </div>
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!isClockedIn ? (
              <button onClick={handleClockIn} style={btnStyle('#16a34a')}>🟢 Clock In</button>
            ) : (
              <>
                <button onClick={handleClockOut} style={btnStyle('#dc2626')}>🛑 Clock Out</button>
                {activeBreak ? (
                  <button onClick={handleEndBreak} style={btnStyle('#d97706')}>
                    ⏹ End {activeBreak.type === 'tea_1' ? 'Tea 1' : activeBreak.type === 'tea_2' ? 'Tea 2' : 'Lunch'} Break
                  </button>
                ) : isIdle ? (
                  <p style={{ color: '#94a3b8', fontSize: '13px', textAlign: 'center', margin: 0 }}>Return to your keyboard to resume.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <p style={{ color: '#64748b', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '4px 0 0' }}>Breaks</p>
                    {BREAK_ORDER.map(b => {
                      const done = completedBreaks.includes(b);
                      const available = b === nextAvailableBreak && !done;
                      const blocked = !available || done;
                      return (
                        <button key={b} onClick={() => handleStartBreak(b)} disabled={blocked}
                          style={{ ...btnStyle('#6366f1'), opacity: blocked ? 0.4 : 1, cursor: blocked ? 'not-allowed' : 'pointer' }}>
                          {BREAK_LABELS[b]}{done && ' ✓'}{!done && !available && ' 🔒'}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {isClockedOut && status?.attendance && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <p style={{ margin: 0, fontFamily: 'Sora', fontSize: '13px', fontWeight: '700', color: '#0f172a' }}>Today's Breakdown</p>
          </div>
          <div style={{ padding: '20px 22px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <StatBox label="Work" value={fmtDuration(status.attendance.total_work_minutes)} color="#3b82f6" />
              <StatBox label="Tea 1" value={fmtDuration(status.attendance.tea_1_minutes)} color="#8b5cf6" />
              <StatBox label="Tea 2" value={fmtDuration(status.attendance.tea_2_minutes)} color="#8b5cf6" />
              <StatBox label="Lunch" value={fmtDuration(status.attendance.lunch_minutes)} color="#f59e0b" />
              <StatBox label="Idle" value={fmtDuration(status.attendance.idle_minutes)} color="#ef4444" />
              <StatBox label="Total Day" value={fmtDuration(
                (status.attendance.total_work_minutes || 0) + (status.attendance.tea_1_minutes || 0) +
                (status.attendance.tea_2_minutes || 0) + (status.attendance.lunch_minutes || 0) +
                (status.attendance.idle_minutes || 0)
              )} color="#0f172a" />
            </div>
          </div>
        </div>
      )}

      {!status && !loading && (
        <div style={{ padding: '14px 16px', borderRadius: '8px', background: '#fffbeb', border: '1px solid #fde68a', marginTop: '16px' }}>
          <p style={{ margin: 0, fontSize: '13px', color: '#92400e' }}>
            Your user account is not linked to an active employee record. Contact an Admin to link your account.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Shared Sub-components ─────────────────────────────
function StatusBadge({ isClockedIn, isClockedOut }) {
  if (isClockedIn) return (
    <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: '1px solid #bbf7d0' }}>🟢 Working</span>
  );
  if (isClockedOut) return (
    <span style={{ background: '#f1f5f9', color: '#64748b', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: '1px solid #e2e8f0' }}>⚫ Done</span>
  );
  return (
    <span style={{ background: '#fef2f2', color: '#dc2626', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '600', border: '1px solid #fecaca' }}>🔴 Not Clocked In</span>
  );
}

function StatusRow({ label, value, highlight }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: '#64748b', fontSize: '13px' }}>{label}</span>
      <span style={{ color: highlight ? '#0f172a' : '#1e293b', fontSize: highlight ? '18px' : '14px', fontWeight: highlight ? '700' : '500', fontFamily: highlight ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  );
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
      <p style={{ margin: '0 0 3px', color: '#64748b', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
      <p style={{ margin: 0, color, fontSize: '16px', fontWeight: '700' }}>{value}</p>
    </div>
  );
}

function StatCard({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: '10px', padding: '14px 16px', border: `1px solid ${color}20` }}>
      <p style={{ margin: '0 0 6px', fontSize: '12px', color: '#64748b', fontWeight: '600' }}>{label}</p>
      <p style={{ margin: 0, fontSize: '22px', fontWeight: '700', color }}>{value}</p>
    </div>
  );
}

function IdleWarning({ onImHere }) {
  return (
    <div style={{ padding: '12px 16px', borderRadius: '8px', background: '#fff7ed', border: '1px solid #fed7aa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
      <span style={{ fontSize: '13px', color: '#9a3412', fontWeight: '600' }}>⚠️ Are you still there? Idle detected.</span>
      <button onClick={onImHere} style={{ background: '#ea580c', color: 'white', border: 'none', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', fontFamily: 'DM Sans' }}>I'm here</button>
    </div>
  );
}

function btnStyle(bg) {
  return { width: '100%', padding: '12px 16px', background: bg, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer', transition: 'background 150ms' };
}

function thStyle() {
  return { padding: '10px 12px', textAlign: 'left', color: '#64748b', fontWeight: '700', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' };
}

function tdStyle() {
  return { padding: '10px 12px', color: '#334155', fontSize: '13px' };
}

function fmtDateShort(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}