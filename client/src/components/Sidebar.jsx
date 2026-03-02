import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';

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
  padding: '10px 14px',
  borderRadius: '7px',
  marginBottom: '2px',
  textDecoration: 'none',
  fontSize: '14px',
  fontWeight: isActive ? '600' : '400',
  color: isActive ? 'white' : '#64748b',
  background: isActive ? 'rgba(59,130,246,0.18)' : 'transparent',
  borderLeft: isActive ? '3px solid #3b82f6' : '3px solid transparent',
});

function SidebarContent({ user, onNavigate }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
    onNavigate?.();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '24px 18px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '9px', marginBottom: '16px' }}>
          <div style={{
            width: '30px', height: '30px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: '7px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
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
          <NavLink key={item.to} to={item.to} end={item.end} onClick={onNavigate}
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
              <NavLink key={item.to} to={item.to} onClick={onNavigate}
                style={({ isActive }) => linkStyle(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      {/* Logout */}
      <div style={{ padding: '10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button onClick={handleLogout} style={{
          width: '100%', padding: '10px 14px', borderRadius: '7px',
          border: 'none', background: 'transparent', color: '#475569',
          fontSize: '14px', cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.color = '#f87171'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  // Desktop sidebar
  if (!isMobile) {
    return (
      <div style={{
        width: '224px', minWidth: '224px', height: '100vh',
        background: '#0f172a', borderRight: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        <SidebarContent user={user} />
      </div>
    );
  }

  // Mobile — hamburger + drawer
  return (
    <>
      {/* Top bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: '#0f172a', borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '14px 18px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '26px', height: '26px',
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ color: 'white', fontWeight: '800', fontSize: '12px', fontFamily: 'Sora' }}>K</span>
          </div>
          <span style={{ color: 'white', fontSize: '16px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
        </div>
        <button onClick={() => setOpen(true)} style={{
          background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '7px',
          padding: '7px 10px', cursor: 'pointer', color: 'white', fontSize: '16px',
        }}>
          ☰
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }} />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '260px', background: '#0f172a', zIndex: 300,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
        boxShadow: open ? '4px 0 24px rgba(0,0,0,0.4)' : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 14px 0' }}>
          <button onClick={() => setOpen(false)} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '6px',
            padding: '6px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: '14px',
          }}>
            ✕
          </button>
        </div>
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </div>
    </>
  );
}