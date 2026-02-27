import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

const STATUS_STYLES = {
  Draft: { background: '#f1f5f9', color: '#64748b' },
  Submitted: { background: '#eff6ff', color: '#2563eb' },
  'Pending Docs': { background: '#fffbeb', color: '#d97706' },
  Approved: { background: '#f0fdf4', color: '#16a34a' },
  Rejected: { background: '#fef2f2', color: '#dc2626' },
};

const CARDS = [
  { key: 'total',       label: 'Total',        color: '#3b82f6' },
  { key: 'approved',    label: 'Approved',     color: '#16a34a' },
  { key: 'submitted',   label: 'Submitted',    color: '#7c3aed' },
  { key: 'pendingDocs', label: 'Pending Docs', color: '#d97706' },
  { key: 'draft',       label: 'Draft',        color: '#64748b' },
  { key: 'rejected',    label: 'Rejected',     color: '#dc2626' },
];

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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <p style={{ color: '#94a3b8', fontSize: '14px' }}>Loading...</p>;

  const today = new Date().toLocaleDateString('en-ZA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <p style={{ color: '#94a3b8', fontSize: '12px', marginBottom: '4px' }}>{today}</p>
        <h2 style={{ fontFamily: 'Sora', fontSize: '24px', fontWeight: '700', color: '#0f172a', margin: 0 }}>
          Welcome back, <span style={{ color: '#2563eb' }}>{user?.username}</span>
        </h2>
      </div>

      {/* Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
        {CARDS.map(card => (
          <div key={card.key} style={{
            background: 'white',
            borderRadius: '10px',
            padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            borderTop: `3px solid ${card.color}`,
          }}>
            <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
              {card.label}
            </p>
            <p style={{ color: '#0f172a', fontSize: '26px', fontWeight: '700', fontFamily: 'Sora', margin: 0, lineHeight: 1 }}>
              {stats[card.key]}
            </p>
          </div>
        ))}
        {user?.role !== 'Consultant' && (
          <div style={{
            background: 'white', borderRadius: '10px', padding: '16px 18px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)', borderTop: '3px solid #0891b2',
          }}>
            <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px' }}>
              Employees
            </p>
            <p style={{ color: '#0f172a', fontSize: '26px', fontWeight: '700', fontFamily: 'Sora', margin: 0, lineHeight: 1 }}>
              {stats.employees}
            </p>
          </div>
        )}
      </div>

      {/* Recent Applications */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>Recent Applications</h3>
          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Latest {recent.length}</span>
        </div>
        {recent.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>No applications yet.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Client', 'Date', 'Nett Salary', 'Total Expenses', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '10px 22px', textAlign: ['Nett Salary','Total Expenses'].includes(h) ? 'right' : 'left',
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
                  <td style={{ padding: '12px 22px', color: '#0f172a', textAlign: 'right' }}>
                    {app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '12px 22px', color: '#0f172a', textAlign: 'right' }}>
                    {app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}
                  </td>
                  <td style={{ padding: '12px 22px' }}>
                    <span style={{ ...STATUS_STYLES[app.status], padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' }}>
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