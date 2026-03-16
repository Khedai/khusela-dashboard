import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import api from '../utils/api';
import { can } from '../utils/access';

const STATUS_STYLES = {
  Draft: { background: '#f1f5f9', color: '#64748b' },
  Submitted: { background: '#eff6ff', color: '#2563eb' },
  'Pending Docs': { background: '#fffbeb', color: '#d97706' },
  Approved: { background: '#f0fdf4', color: '#16a34a' },
  Rejected: { background: '#fef2f2', color: '#dc2626' },
};

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
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(can(user, 'dashboard.viewAll'));

  useEffect(() => { fetchData(); }, [showAll]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Consultants always see their franchise only — no showAll for them
      const useFilter = !can(user, 'dashboard.viewAll') || !showAll;
      const franchiseParam = (useFilter && user?.franchise_id) ? `?franchise_id=${user.franchise_id}` : '';

      const [appsRes, empsRes] = await Promise.all([
        api.get(`/applications${franchiseParam}`),
        can(user, 'dashboard.employeeCount') ? api.get(`/employees${franchiseParam}`) : Promise.resolve({ data: [] })
      ]);
      const apps = appsRes.data;
      setStats({
        total: apps.length,
        draft: apps.filter(a => a.status === 'Draft').length,
        submitted: apps.filter(a => a.status === 'Submitted').length,
        pendingDocs: apps.filter(a => a.status === 'Pending Docs').length,
        approved: apps.filter(a => a.status === 'Approved').length,
        rejected: apps.filter(a => a.status === 'Rejected').length,
        employees: empsRes.data.length,
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

  if (loading) return <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading...</p>;
  if (!stats) return <p style={{ color: '#94a3b8', fontSize: '14px' }}>Unable to load dash</p>;

  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const cols = isMobile ? '1fr 1fr' : 'repeat(4, 1fr)';

  return (
    <div style={{ maxWidth: '1100px' }}>
      <div style={{ marginBottom: '24px' }}>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>{today}</p>
        <h2 style={{ fontFamily: 'Sora', fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
          Welcome back, <span style={{ color: '#2563eb' }}>{user?.username}</span>
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
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: '10px', marginBottom: '20px' }}>
        {CARDS.map(card => (
          <div key={card.key} style={{
            background: 'white', borderRadius: '10px', padding: isMobile ? '14px' : '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderTop: `3px solid ${card.color}`,
          }}>
            <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 5px' }}>
              {card.label}
            </p>
            <p style={{ color: '#0f172a', fontSize: isMobile ? '22px' : '26px', fontWeight: '700', fontFamily: 'Sora', margin: 0, lineHeight: 1 }}>
              {stats[card.key]}
            </p>
          </div>
        ))}
        {user?.role !== 'Consultant' && (
          <div style={{
            background: 'white', borderRadius: '10px', padding: isMobile ? '14px' : '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderTop: '3px solid #0891b2',
          }}>
            <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 5px' }}>
              Employees
            </p>
            <p style={{ color: '#0f172a', fontSize: isMobile ? '22px' : '26px', fontWeight: '700', fontFamily: 'Sora', margin: 0, lineHeight: 1 }}>
              {stats.employees}
            </p>
          </div>
        )}
      </div>

      {user?.role === 'Consultant' && leaveBalance && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '600', color: '#0f172a', marginBottom: '10px' }}>
            My Leave Balance — {new Date().getFullYear()}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)', gap: '10px' }}>
            {[
              { label: 'Annual Leave', total: leaveBalance.annual_total, used: leaveBalance.annual_used, color: '#2563eb' },
              { label: 'Sick Leave', total: leaveBalance.sick_total, used: leaveBalance.sick_used, color: '#d97706' },
              { label: 'Family Responsibility', total: leaveBalance.family_total, used: leaveBalance.family_used, color: '#16a34a' },
            ].map(b => {
              const remaining = b.total - b.used;
              return (
                <div key={b.label} style={{
                  background: 'white', borderRadius: '10px', padding: '14px 16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderTop: `3px solid ${b.color}`,
                }}>
                  <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
                    {b.label}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontFamily: 'Sora', fontSize: '22px', fontWeight: '700', color: remaining <= 0 ? '#dc2626' : '#0f172a', lineHeight: 1 }}>
                      {remaining}
                    </span>
                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>/ {b.total} days</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Applications */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Recent Applications</h3>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Latest {recent.length}</span>
        </div>

        {recent.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No applications yet.</div>
        ) : isMobile ? (
          // Mobile: stacked cards instead of table
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {recent.map(app => (
              <div key={app.id} style={{ padding: '14px 18px', borderTop: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '600', color: '#0f172a', fontSize: '14px' }}>{app.first_name} {app.last_name}</span>
                  <span style={{ ...STATUS_STYLES[app.status], padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
                    {app.status}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#64748b' }}>
                  <span>{app.date?.split('T')[0]}</span>
                  {app.nett_salary && <span>R {parseFloat(app.nett_salary).toLocaleString()}</span>}
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
                    <td style={{ padding: '12px 22px', fontWeight: '500', color: '#0f172a' }}>{app.first_name} {app.last_name}</td>
                    <td style={{ padding: '12px 22px', color: '#64748b' }}>{app.date?.split('T')[0]}</td>
                    <td style={{ padding: '12px 22px', textAlign: 'right' }}>{app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}</td>
                    <td style={{ padding: '12px 22px', textAlign: 'right' }}>{app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}</td>
                    <td style={{ padding: '12px 22px' }}>
                      <span style={{ ...STATUS_STYLES[app.status], padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
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
      api.get('/employees'),
      api.get('/applications'),
    ]).then(([emps, apps]) => {
      setCounts({
        employees: emps.data.filter(e => !e.franchise_id).length,
        applications: apps.data.filter(a => !a.franchise_id).length,
      });
    }).catch(() => { });
  }, []);

  if (!counts || (counts.employees === 0 && counts.applications === 0)) return null;

  return (
    <div style={{
      padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
      background: '#fffbeb', border: '1px solid #fde68a',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      flexWrap: 'wrap', gap: '8px',
    }}>
      <div>
        <p style={{ color: '#d97706', fontSize: '13px', fontWeight: '600', margin: '0 0 2px' }}>
          Unassigned Records
        </p>
        <p style={{ color: '#92400e', fontSize: '12px', margin: 0 }}>
          {counts.employees > 0 && `${counts.employees} employee${counts.employees > 1 ? 's' : ''}`}
          {counts.employees > 0 && counts.applications > 0 && ' · '}
          {counts.applications > 0 && `${counts.applications} application${counts.applications > 1 ? 's' : ''}`}
          {' '}not assigned to any franchise.
        </p>
      </div>
      <a href="/employees" style={{ color: '#d97706', fontSize: '12px', fontWeight: '600', textDecoration: 'none' }}>
        Fix in Employees →
      </a>
    </div>
  );
}