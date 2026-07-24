import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import api from '../utils/api';
import { can } from '../utils/access';
import { C } from '../utils/styles';
import Spinner from '../components/Spinner';
import { SkeletonStatCard, SkeletonTable } from '../components/Skeleton';

const AVATAR_PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#dc2626'];

const getInitials = (firstName, lastName) => {
  return `${firstName?.charAt(0) || ''}${lastName?.charAt(0) || ''}`.toUpperCase() || '?';
};

const avatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const formatDays = (val) => {
  const num = parseFloat(val);
  if (isNaN(num)) return '0';
  return num % 1 === 0 ? Math.round(num).toString() : num.toFixed(1);
};

const safeNum = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
};

const STATUS_STYLES = {
  Draft: { background: '#f8fafc', color: '#475569', border: '1px solid rgba(148,163,184,0.25)' },
  Submitted: { background: '#eff6ff', color: '#1d4ed8', border: '1px solid rgba(37,99,235,0.2)' },
  'Pending Docs': { background: '#fffbeb', color: '#b45309', border: '1px solid rgba(217,119,6,0.25)' },
  Approved: { background: '#f0fdf4', color: '#15803d', border: '1px solid rgba(22,163,74,0.2)' },
  Rejected: { background: '#fef2f2', color: '#b91c1c', border: '1px solid rgba(220,38,38,0.25)' },
};

const CARD_SHADOW = C.cardShadow;

const CARDS = [
  { key: 'total', label: 'Total', color: '#3b82f6' },
  { key: 'approved', label: 'Approved', color: '#16a34a' },
  { key: 'submitted', label: 'Submitted', color: '#7c3aed' },
  { key: 'pendingDocs', label: 'Pending Docs', color: '#d97706' },
  { key: 'draft', label: 'Draft', color: '#64748b' },
  { key: 'rejected', label: 'Rejected', color: '#dc2626' },
];

export default function Dashboard() {
  const { user, employeeId } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(can(user, 'dashboard.viewAll'));

  useEffect(() => { fetchData(); }, [showAll]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const useFilter = !can(user, 'dashboard.viewAll') || !showAll;

      const appsUrl  = useFilter && user?.franchise_id
        ? `/applications?franchise_id=${user.franchise_id}&limit=1000`
        : '/applications?limit=1000';
      const empsUrl  = useFilter && user?.franchise_id
        ? `/employees?franchise_id=${user.franchise_id}&limit=1000`
        : '/employees?limit=1000';

      const [appsRes, empsRes] = await Promise.all([
        api.get(appsUrl),
        can(user, 'dashboard.employeeCount') ? api.get(empsUrl) : Promise.resolve({ data: { data: [] } })
      ]);
      const apps = Array.isArray(appsRes.data) ? appsRes.data : (appsRes.data.data ?? []);
      const emps = Array.isArray(empsRes.data) ? empsRes.data : (empsRes.data.data ?? []);
      setStats({
        total: apps.length,
        draft: apps.filter(a => a.status === 'Draft').length,
        submitted: apps.filter(a => a.status === 'Submitted').length,
        pendingDocs: apps.filter(a => a.status === 'Pending Docs').length,
        approved: apps.filter(a => a.status === 'Approved').length,
        rejected: apps.filter(a => a.status === 'Rejected').length,
        employees: emps.length,
      });
      setRecent(apps.slice(0, 6));
      if (user?.role === 'Consultant' && employeeId) {
        try {
          const balRes = await api.get(`/leave/balance/${employeeId}`);
          setLeaveBalance(balRes.data);
        } catch { }
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const [widgetCollapsed, setWidgetCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem('dashWidgets') || '{}'); } catch { return {}; }
  });

  const toggleWidget = (key) => {
    setWidgetCollapsed(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('dashWidgets', JSON.stringify(next));
      return next;
    });
  };

  if (loading) return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ marginBottom: '24px' }}>
        <SkeletonStatCard style={{ width: '180px', display: 'inline-block' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <SkeletonStatCard key={i} lines={1} />
        ))}
      </div>
      <div style={{ background: 'white', borderRadius: '12px', overflow: 'hidden' }}>
        <SkeletonTable rows={5} cols={5} />
      </div>
    </div>
  );
  if (!stats) return <p style={{ color: '#94a3b8', fontSize: '14px' }}>Unable to load dash</p>;

  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const cols = isMobile ? '1fr 1fr' : 'repeat(4, 1fr)';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const pendingLeaveCount = stats?.pendingLeave || 0;

  const WidgetSection = ({ title, visible, children, style = {} }) => {
    if (!visible) return null;
    const isCollapsed = widgetCollapsed[title];
    return (
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <p style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '600', color: '#0f172a', margin: 0 }}>{title}</p>
          <button onClick={() => toggleWidget(title)} style={{ background: 'none', border: 'none', color: '#475569', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: '2px 8px', borderRadius: '6px' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            {isCollapsed ? 'Show' : 'Hide'}
          </button>
        </div>
        {!isCollapsed && <div style={style}>{children}</div>}
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>{today}</p>
        <h2 style={{ fontFamily: 'Sora', fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
          {greeting}, <span style={{ color: '#2563eb' }}>{user?.username}</span>
          {pendingLeaveCount > 0 && <span style={{ color: '#475569', fontSize: '14px', fontWeight: '400', fontFamily: 'DM Sans', display: 'block', marginTop: '4px' }}>You have {pendingLeaveCount} pending leave request{pendingLeaveCount !== 1 ? 's' : ''} waiting for your review.</span>}
        </h2>
      </div>

      {user?.role === 'Admin' && !showAll && (
        <UnassignedWarning />
      )}

      {/* Toggle: My Franchise / All */}
      {can(user, 'dashboard.viewAll') && user?.franchise_id && (
        <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center' }}>
          <div style={{
            display: 'flex', background: 'white', borderRadius: '10px',
            padding: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', alignSelf: 'flex-start'
          }}>
            <button
              onClick={() => setShowAll(false)}
              style={{
                padding: '7px 14px', borderRadius: '7px', border: 'none',
                fontSize: '12px', fontWeight: '500', fontFamily: 'DM Sans', cursor: 'pointer',
                background: !showAll ? '#0f172a' : 'transparent',
                color: !showAll ? 'white' : '#64748b',
              }}
            >
              {user?.franchise?.franchise_name || 'My Franchise'}
            </button>
            <button
              onClick={() => setShowAll(true)}
              style={{
                padding: '7px 14px', borderRadius: '7px', border: 'none',
                fontSize: '12px', fontWeight: '500', fontFamily: 'DM Sans', cursor: 'pointer',
                background: showAll ? '#0f172a' : 'transparent',
                color: showAll ? 'white' : '#64748b',
              }}
            >
              All Franchises
            </button>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <WidgetSection title="Overview" visible={true}>
        <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '12px' }}>
        {CARDS.map(card => (
          <div
            key={card.key}
            className="card-hover"
            onClick={() => card.key !== 'total' && navigate(`/applications?status=${encodeURIComponent(card.label)}`)}
            style={{
              background: 'white', borderRadius: '14px', padding: isMobile ? '16px' : '18px 20px',
              boxShadow: CARD_SHADOW,
              border: '1px solid rgba(226, 232, 240, 0.8)',
              cursor: card.key !== 'total' ? 'pointer' : 'default',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '4px', height: '100%',
              background: card.color, borderRadius: '4px 0 0 4px', opacity: 0.85
            }} />
            <p style={{ color: '#64748b', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
              {card.label}
            </p>
            <p style={{ color: '#0f172a', fontSize: isMobile ? '24px' : '28px', fontWeight: '800', fontFamily: 'Sora', margin: 0, lineHeight: 1, tracking: '-0.02em' }}>
              {stats[card.key]}
            </p>
          </div>
        ))}
        {user?.role !== 'Consultant' && (
          <div className="card-hover" style={{
            background: 'white', borderRadius: '14px', padding: isMobile ? '16px' : '18px 20px',
            boxShadow: CARD_SHADOW,
            border: '1px solid rgba(226, 232, 240, 0.8)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, width: '4px', height: '100%',
              background: '#6366f1', borderRadius: '4px 0 0 4px', opacity: 0.85
            }} />
            <p style={{ color: '#64748b', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px' }}>
              Employees
            </p>
            <p style={{ color: '#0f172a', fontSize: isMobile ? '24px' : '28px', fontWeight: '800', fontFamily: 'Sora', margin: 0, lineHeight: 1 }}>
              {stats.employees}
            </p>
          </div>
        )}
        </div>
      </WidgetSection>

      {user?.role === 'Consultant' && leaveBalance && (
        <WidgetSection title={`My Leave Balance — ${new Date().getFullYear()}`} visible={true}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Annual Leave', total: leaveBalance.annual_total, used: leaveBalance.annual_used, color: '#2563eb' },
              { label: 'Sick Leave', total: leaveBalance.sick_total, used: leaveBalance.sick_used, color: '#d97706' },
              { label: 'Family Responsibility', total: leaveBalance.family_total, used: leaveBalance.family_used, color: '#16a34a' },
            ].map(b => {
              const remaining = safeNum(b.total) - safeNum(b.used);
              const pct = safeNum(b.total) > 0 ? Math.min((safeNum(b.used) / safeNum(b.total)) * 100, 100) : 0;
              return (
                <div key={b.label} style={{
                  background: 'white', borderRadius: '12px', padding: '14px 16px',
                  boxShadow: CARD_SHADOW,
                  border: '1px solid #f1f5f9',
                }}>
                  <p style={{ color: '#475569', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
                    {b.label}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontFamily: 'Sora', fontSize: '22px', fontWeight: '700', color: remaining <= 0 ? '#dc2626' : '#0f172a', lineHeight: 1 }}>
                      {formatDays(remaining)}
                    </span>
                    <span style={{ color: '#475569', fontSize: '11px' }}>/ {formatDays(safeNum(b.total))} days</span>
                  </div>
                  <div style={{ height: '5px', borderRadius: '3px', background: '#f1f5f9', overflow: 'hidden', marginTop: '6px' }}>
                    <div style={{ height: '100%', borderRadius: '3px', background: remaining <= 0 ? '#dc2626' : b.color, width: `${pct}%`, transition: 'width 0.4s ease' }} />
                  </div>
                  <p style={{ color: '#475569', fontSize: '10px', margin: '4px 0 0' }}>{formatDays(safeNum(b.used))} used</p>
                </div>
              );
            })}
          </div>
        </WidgetSection>
      )}

      {/* Recent Applications */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: CARD_SHADOW, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Recent Applications</h3>
          <span style={{ color: '#475569', fontSize: '12px' }}>Latest {recent.length}</span>
        </div>

        {recent.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No applications yet.</div>
        ) : isMobile ? (
          // Mobile: stacked cards instead of table
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.map((app, idx) => (
              <div key={app.id} style={{
                padding: '16px 18px',
                borderBottom: idx < recent.length - 1 ? '1px solid #f1f5f9' : 'none',
                background: 'white',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: avatarColor(`${app.first_name} ${app.last_name}`), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', flexShrink: 0 }}>
                    {getInitials(app.first_name, app.last_name)}
                  </div>
                  <span style={{ fontWeight: '700', color: '#0f172a', fontSize: '14px', fontFamily: 'Sora' }}>{app.first_name} {app.last_name}</span>
                </div>
                  <span style={{
                    ...STATUS_STYLES[app.status],
                    padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700',
                    border: STATUS_STYLES[app.status].border,
                  }}>
                    {app.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '20px', fontSize: '12px', color: '#64748b', alignItems: 'center' }}>
                  <span>{app.date?.split('T')[0]?.replace(/-/g, '/')}</span>
                  {app.nett_salary && (
                    <span style={{ fontWeight: '600', color: '#0f172a' }}>
                      R {parseFloat(app.nett_salary).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Client', 'Date', 'Nett Salary', 'Total Expenses', 'Status'].map(h => (
                    <th key={h} style={{
                      padding: '10px 22px', textAlign: ['Nett Salary', 'Total Expenses'].includes(h) ? 'right' : 'left',
                      color: '#94a3b8', fontSize: '11px', fontWeight: '600',
                      textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map(app => (
                  <tr key={app.id} style={{ borderTop: '1px solid #f1f5f9' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '12px 22px', fontWeight: '500', color: '#0f172a' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: avatarColor(`${app.first_name} ${app.last_name}`), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', flexShrink: 0 }}>
                        {getInitials(app.first_name, app.last_name)}
                      </div>
                      {app.first_name} {app.last_name}
                    </div>
                  </td>
                  <td style={{ padding: '12px 22px', color: '#475569' }}>{app.date?.split('T')[0]?.replace(/-/g, '/')}</td>
                    <td style={{ padding: '12px 22px', textAlign: 'right' }}>{app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}</td>
                    <td style={{ padding: '12px 22px', textAlign: 'right' }}>{app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}</td>
                    <td style={{ padding: '12px 22px' }}>
                      <span style={{
                        ...STATUS_STYLES[app.status],
                        background: STATUS_STYLES[app.status].background,
                        padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                        border: STATUS_STYLES[app.status].border,
                      }}>
                        {app.status}
                      </span>
                    </td>
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

function UnassignedWarning() {
  const [counts, setCounts] = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/employees?limit=1000'),
      api.get('/applications?limit=1000'),
    ]).then(([emps, apps]) => {
      const empList = Array.isArray(emps.data) ? emps.data : (emps.data.data ?? []);
      const appList = Array.isArray(apps.data) ? apps.data : (apps.data.data ?? []);
      setCounts({
        employees: empList.filter(e => !e.franchise_id).length,
        applications: appList.filter(a => !a.franchise_id).length,
      });
    }).catch(() => { });
  }, []);

  if (!counts || (counts.employees === 0 && counts.applications === 0)) return null;

  return (
    <div style={{
      padding: '14px 18px', borderRadius: '12px', marginBottom: '16px',
      background: '#fff9db', border: '1px solid #ffe066',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexWrap: 'wrap', gap: '10px', boxShadow: '0 1px 6px rgba(255,224,102,0.18)',
    }}>
      <div>
        <p style={{ color: '#b45309', fontSize: '13px', fontWeight: '700', margin: '0 0 3px' }}>
          Unassigned Records
        </p>
        <p style={{ color: '#92400e', fontSize: '12px', margin: 0, lineHeight: '1.5' }}>
          {counts.employees > 0 && `${counts.employees} employee${counts.employees > 1 ? 's' : ''}`}
          {counts.employees > 0 && counts.applications > 0 && ' · '}
          {counts.applications > 0 && `${counts.applications} application${counts.applications > 1 ? 's' : ''}`}
          {' '}not assigned to any franchise.
        </p>
      </div>
      <a href="/employees" style={{
        color: '#b45309', fontSize: '12px', fontWeight: '700', textDecoration: 'none',
        padding: '7px 16px', borderRadius: '8px', background: 'white',
        border: '1px solid #fcd34d', transition: 'background 0.15s',
        whiteSpace: 'nowrap',
      }}>
        Fix in Employees &rarr;
      </a>
    </div>
  );
}