import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const STAT_CARDS = [
  { key: 'total', label: 'Total Applications', color: '#3b82f6', bg: '#eff6ff' },
  { key: 'approved', label: 'Approved', color: '#16a34a', bg: '#f0fdf4' },
  { key: 'pendingDocs', label: 'Pending Docs', color: '#d97706', bg: '#fffbeb' },
  { key: 'submitted', label: 'Submitted', color: '#7c3aed', bg: '#f5f3ff' },
  { key: 'draft', label: 'Draft', color: '#64748b', bg: '#f8fafc' },
  { key: 'rejected', label: 'Rejected', color: '#dc2626', bg: '#fef2f2' },
];

const STATUS_STYLES = {
  Draft: { background: '#f1f5f9', color: '#64748b' },
  Submitted: { background: '#eff6ff', color: '#2563eb' },
  'Pending Docs': { background: '#fffbeb', color: '#d97706' },
  Approved: { background: '#f0fdf4', color: '#16a34a' },
  Rejected: { background: '#fef2f2', color: '#dc2626' },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [appsRes, empsRes] = await Promise.all([
        api.get('/applications'),
        user?.role !== 'Consultant' ? api.get('/employees') : Promise.resolve({ data: [] })
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
    } catch (err) {
      console.error('Dashboard error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading...</p>;

  const today = new Date().toLocaleDateString('en-ZA', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  return (
    <div style={{ maxWidth: '1200px' }}>

      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>{today}</p>
        <h2 style={{ fontFamily: 'Sora', fontSize: '28px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
          Welcome back, <span style={{ color: '#2563eb' }}>{user?.username}</span>
        </h2>
      </div>

      {/* Stat Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '32px',
      }}>
        {STAT_CARDS.map(card => (
          stats[card.key] !== undefined && (
            <div key={card.key} style={{
              background: 'white',
              borderRadius: '14px',
              padding: '24px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
              borderLeft: `4px solid ${card.color}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                background: card.bg,
                marginBottom: '4px',
              }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: card.color }} />
              </div>
              <p style={{ color: '#64748b', fontSize: '13px', fontWeight: '500', margin: 0 }}>{card.label}</p>
              <p style={{ color: card.color, fontSize: '36px', fontWeight: '700', fontFamily: 'Sora', margin: 0, lineHeight: 1 }}>
                {stats[card.key]}
              </p>
            </div>
          )
        ))}
        {user?.role !== 'Consultant' && (
          <div style={{
            background: 'white',
            borderRadius: '14px',
            padding: '24px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            borderLeft: '4px solid #0891b2',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              background: '#ecfeff', display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: '12px',
            }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#0891b2' }} />
            </div>
            <p style={{ color: '#64748b', fontSize: '13px', fontWeight: '500', margin: '0 0 8px' }}>Total Employees</p>
            <p style={{ color: '#0891b2', fontSize: '36px', fontWeight: '700', fontFamily: 'Sora', margin: 0, lineHeight: 1 }}>
              {stats.employees}
            </p>
          </div>
        )}
      </div>

      {/* Recent Applications */}
      <div style={{
        background: 'white',
        borderRadius: '14px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h3 style={{ fontFamily: 'Sora', fontSize: '15px', fontWeight: '600', color: '#0f172a', margin: 0 }}>
            Recent Applications
          </h3>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Last {recent.length} entries</span>
        </div>

        {recent.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>
            No applications yet. Create one to get started.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Client', 'Date', 'Nett Salary', 'Total Expenses', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '12px 24px', textAlign: h === 'Nett Salary' || h === 'Total Expenses' ? 'right' : 'left',
                    color: '#94a3b8', fontSize: '11px', fontWeight: '600',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.map((app, i) => (
                <tr key={app.id} style={{ borderTop: '1px solid #f1f5f9' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '14px 24px', fontWeight: '500', color: '#0f172a' }}>
                    {app.first_name} {app.last_name}
                  </td>
                  <td style={{ padding: '14px 24px', color: '#64748b' }}>
                    {app.date?.split('T')[0]}
                  </td>
                  <td style={{ padding: '14px 24px', color: '#0f172a', textAlign: 'right', fontWeight: '500' }}>
                    {app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '14px 24px', color: '#0f172a', textAlign: 'right' }}>
                    {app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '14px 24px' }}>
                    <span style={{
                      ...STATUS_STYLES[app.status],
                      padding: '4px 10px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: '600',
                    }}>
                      {app.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}