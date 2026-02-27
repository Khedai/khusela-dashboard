import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [appsRes, empsRes] = await Promise.all([
        api.get('/applications'),
        user?.role !== 'Consultant' ? api.get('/employees') : Promise.resolve({ data: [] })
      ]);

      const apps = appsRes.data;
      const emps = empsRes.data;

      setStats({
        total: apps.length,
        draft: apps.filter(a => a.status === 'Draft').length,
        submitted: apps.filter(a => a.status === 'Submitted').length,
        pendingDocs: apps.filter(a => a.status === 'Pending Docs').length,
        approved: apps.filter(a => a.status === 'Approved').length,
        rejected: apps.filter(a => a.status === 'Rejected').length,
        employees: emps.length,
      });

      setRecent(apps.slice(0, 5));
    } catch (err) {
      console.error('Dashboard fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const statusColors = {
    Draft: 'bg-gray-100 text-gray-600',
    Submitted: 'bg-blue-100 text-blue-700',
    'Pending Docs': 'bg-yellow-100 text-yellow-700',
    Approved: 'bg-green-100 text-green-700',
    Rejected: 'bg-red-100 text-red-700'
  };

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-800">
          Welcome back, {user?.username}
        </h2>
        <p className="text-gray-500 text-sm mt-1">
          {user?.role} · {new Date().toLocaleDateString('en-ZA', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
          })}
        </p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total Applications" value={stats.total} color="#2563eb" />
        <StatCard label="Approved" value={stats.approved} color="#16a34a" />
        <StatCard label="Pending Docs" value={stats.pendingDocs} color="#d97706" />
        <StatCard label="Rejected" value={stats.rejected} color="#dc2626" />
      </div>

      {/* Second row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Draft" value={stats.draft} color="#6b7280" />
        <StatCard label="Submitted" value={stats.submitted} color="#7c3aed" />
        {user?.role !== 'Consultant' && (
          <StatCard label="Total Employees" value={stats.employees} color="#0891b2" />
        )}
      </div>

      {/* Recent Applications */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Recent Applications</h3>
        </div>
        {recent.length === 0 ? (
          <p className="px-6 py-4 text-sm text-gray-500">No applications yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Client</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-right">Nett Salary</th>
                <th className="px-4 py-3 text-right">Total Expenses</th>
                <th className="px-4 py-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {recent.map(app => (
                <tr key={app.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {app.first_name} {app.last_name}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {app.date?.split('T')[0]}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {app.nett_salary ? `R ${parseFloat(app.nett_salary).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-600">
                    {app.total_expenses ? `R ${parseFloat(app.total_expenses).toLocaleString()}` : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[app.status]}`}>
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

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}