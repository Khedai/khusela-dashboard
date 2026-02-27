import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/employees', label: 'Employees', roles: ['Admin', 'HR'] },
  { to: '/applications', label: 'Applications', roles: ['Admin', 'HR', 'Consultant'] },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'User Management' },
  { to: '/franchises', label: 'Franchises' },
];

const linkStyle = (isActive) => ({
  display: 'block',
  padding: '9px 14px',
  borderRadius: '7px',
  marginBottom: '2px',
  textDecoration: 'none',
  fontSize: '13.5px',
  fontWeight: isActive ? '600' : '400',
  color: isActive ? 'white' : '#64748b',
  background: isActive ? 'rgba(59,130,246,0.18)' : 'transparent',
  borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
  letterSpacing: '0.01em',
});

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div style={{
      width: '224px',
      minWidth: '224px',
      height: '100vh',
      background: '#0f172a',
      display: 'flex',
      flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* Logo */}
      <div style={{ padding: '24px 18px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '16px' }}>
          <div style={{
            width: '30px', height: '30px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: '7px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span style={{ color: 'white', fontWeight: '800', fontSize: '14px', fontFamily: 'Sora' }}>K</span>
          </div>
          <span style={{ color: 'white', fontSize: '17px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '7px', padding: '9px 11px' }}>
          <p style={{ color: '#475569', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>
            {user?.role}
          </p>
          <p style={{ color: 'white', fontSize: '13px', fontWeight: '600', margin: 0 }}>
            {user?.username}
          </p>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
        <p style={{ color: '#334155', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.09em', padding: '0 10px', marginBottom: '6px' }}>
          Menu
        </p>
        {NAV_ITEMS.filter(i => i.roles.includes(user?.role)).map(item => (
          <NavLink key={item.to} to={item.to} end={item.end}
            style={({ isActive }) => linkStyle(isActive)}>
            {item.label}
          </NavLink>
        ))}

        {user?.role === 'Admin' && (
          <>
            <p style={{ color: '#334155', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.09em', padding: '14px 10px 6px', margin: 0 }}>
              Admin
            </p>
            {ADMIN_ITEMS.map(item => (
              <NavLink key={item.to} to={item.to}
                style={({ isActive }) => linkStyle(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Logout */}
      <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => { logout(); navigate('/login'); }}
          style={{
            width: '100%', padding: '9px 14px', borderRadius: '7px',
            border: 'none', background: 'transparent',
            color: '#475569', fontSize: '13.5px', cursor: 'pointer',
            textAlign: 'left', fontFamily: 'DM Sans',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}