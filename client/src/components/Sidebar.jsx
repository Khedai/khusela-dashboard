import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import logo from '../assets/khusela-logo.png';
import api from '../utils/api';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/employees', label: 'Employees', roles: ['Admin', 'HR'] },
  { to: '/applications', label: 'Applications', roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/leave', label: 'Leave', roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/inbox', label: 'Inbox', roles: ['Admin', 'HR', 'Consultant'] },
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
  const { logout, franchise } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
    onNavigate?.();
  };

  const [notifications, setNotifications] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const unread = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    fetchNotifications();
    fetchPendingCount();
    const interval = setInterval(() => {
      fetchNotifications();
      fetchPendingCount();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch { }
  };

  const fetchPendingCount = async () => {
    try {
      const res = await api.get('/applications/pending-count');
      setPendingCount(res.data.count);
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '24px 18px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
       <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: '8px' }}>
          <img
            src={logo}
            alt="Khusela"
            style={{
              width: '140px',
              height: 'auto',
              filter: 'brightness(0) invert(1)',
              display: 'block',
            }}
          />
        </div>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '7px', padding: '9px 11px' }}>
          <p style={{ color: '#475569', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 2px' }}>
            {user?.role}
          </p>
          <p style={{ color: 'white', fontSize: '13px', fontWeight: '600', margin: '0 0 6px' }}>
            {user?.username}
          </p>
          {/* Branch identifier */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.22)',
            borderRadius: '5px',
            padding: '4px 8px',
          }}>
            <span style={{ fontSize: '9px', color: '#3b82f6', lineHeight: 1 }}>📍</span>
            <span style={{
              color: '#93c5fd',
              fontSize: '11px',
              fontWeight: '600',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '148px',
              display: 'block',
            }}>
              {user?.role === 'Admin'
                ? 'All Branches'
                : franchise?.franchise_name || 'No branch assigned'}
            </span>
          </div>
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
            <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {item.label}
              {item.to === '/inbox' && unread > 0 && (
                <span style={{
                  background: '#dc2626', color: 'white', borderRadius: '10px',
                  fontSize: '10px', fontWeight: '700', padding: '1px 6px',
                  minWidth: '18px', textAlign: 'center', lineHeight: '16px',
                }}>
                  {unread}
                </span>
              )}
              {item.to === '/applications' && pendingCount > 0 && (
                <span style={{
                  background: '#d97706', color: 'white',
                  borderRadius: '10px', fontSize: '10px',
                  fontWeight: '700', padding: '1px 6px',
                }}>
                  {pendingCount}
                </span>
              )}
            </span>
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

      {/* Inbox badge shown in nav; dropdown removed (Inbox page handles details) */}

      {/* Logout */}
      <div style={{ padding: '8px 10px 10px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '9px 14px', borderRadius: '7px',
            border: 'none', background: 'transparent', color: '#475569',
            fontSize: '13.5px', cursor: 'pointer', textAlign: 'left', fontFamily: 'DM Sans',
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
          <img src={logo} alt="Khusela" style={{ width: '34px', height: '34px', objectFit: 'contain', borderRadius: '6px', filter: 'brightness(0) invert(1)' }} />
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