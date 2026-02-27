import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '⬛', end: true, roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/employees', label: 'Employees', icon: '👥', roles: ['Admin', 'HR'] },
  { to: '/applications', label: 'Applications', icon: '📋', roles: ['Admin', 'HR', 'Consultant'] },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'User Management', icon: '🔐' },
  { to: '/franchises', label: 'Franchises', icon: '🏢' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div style={{
      width: '240px',
      minWidth: '240px',
      height: '100vh',
      background: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.06)',
    }}>
      {/* Logo */}
      <div style={{
        padding: '28px 24px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <div style={{
            width: '34px', height: '34px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ color: 'white', fontWeight: '800', fontSize: '16px', fontFamily: 'Sora' }}>K</span>
          </div>
          <span style={{ color: 'white', fontSize: '18px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px',
          padding: '10px 12px',
        }}>
          <p style={{ color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '2px' }}>
            {user?.role}
          </p>
          <p style={{ color: 'white', fontSize: '13px', fontWeight: '600' }}>
            {user?.username}
          </p>
        </div>
      </div>

      {/* Main Nav */}
      <nav style={{ flex: 1, padding: '16px 12px', overflowY: 'auto' }}>
        <p style={{ color: '#475569', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 12px', marginBottom: '8px' }}>
          Menu
        </p>
        {NAV_ITEMS.filter(item => item.roles.includes(user?.role)).map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 12px',
              borderRadius: '8px',
              marginBottom: '2px',
              textDecoration: 'none',
              fontSize: '14px',
              fontWeight: isActive ? '600' : '400',
              color: isActive ? 'white' : '#64748b',
              background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
              borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
            })}
          >
            <span style={{ fontSize: '14px' }}>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {user?.role === 'Admin' && (
          <>
            <p style={{ color: '#475569', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '16px 12px 8px' }}>
              Admin
            </p>
            {ADMIN_ITEMS.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  marginBottom: '2px',
                  textDecoration: 'none',
                  fontSize: '14px',
                  fontWeight: isActive ? '600' : '400',
                  color: isActive ? 'white' : '#64748b',
                  background: isActive ? 'rgba(59,130,246,0.15)' : 'transparent',
                  borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                })}
              >
                <span style={{ fontSize: '14px' }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Logout */}
      <div style={{ padding: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            color: '#64748b',
            fontSize: '14px',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'DM Sans',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)'; e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#64748b'; }}
        >
          <span>🚪</span> Logout
        </button>
      </div>
    </div>
  );
}