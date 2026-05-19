import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import logo from '../assets/khusela-logo.png';
import api from '../utils/api';

// ─── Minimal SVG icons ────────────────────────────
const Icon = ({ path, size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0 }}>
    <path d={path} />
  </svg>
);

const ICONS = {
  Dashboard:         'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  Employees:         'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  Applications:      'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2l6 6 M16 13H8 M16 17H8 M10 9H8',
  Leave:             'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z',
  Inbox:             'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6',
  'User Management': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M16 3.13a4 4 0 0 1 0 7.75 M21 15l-3-3 3-3',
  Franchises:        'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
};

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', end: true, roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/employees', label: 'Employees', roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/applications', label: 'Applications', roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/leave', label: 'Leave', roles: ['Admin', 'HR', 'Consultant'] },
  { to: '/inbox', label: 'Inbox', roles: ['Admin', 'HR', 'Consultant'] },
];

const ADMIN_ITEMS = [
  { to: '/users', label: 'User Management' },
  { to: '/franchises', label: 'Franchises' },
];

const ROLE_COLOR = {
  Admin:      { bg: 'rgba(99,102,241,0.18)', color: '#a5b4fc' },
  HR:         { bg: 'rgba(56,189,248,0.15)', color: '#7dd3fc' },
  Consultant: { bg: 'rgba(52,211,153,0.15)', color: '#6ee7b7' },
};

function NavItem({ to, label, end, onNavigate, badge }) {
  const iconPath = ICONS[label];
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '9px 12px',
        borderRadius: '10px',
        marginBottom: '2px',
        textDecoration: 'none',
        fontSize: '13.5px',
        fontWeight: isActive ? '600' : '400',
        color: isActive ? '#fff' : '#8892a4',
        background: isActive
          ? 'linear-gradient(135deg, rgba(99,102,241,0.28), rgba(79,70,229,0.22))'
          : 'transparent',
        border: isActive ? '1px solid rgba(99,102,241,0.25)' : '1px solid transparent',
        boxShadow: isActive ? '0 2px 10px rgba(99,102,241,0.18)' : 'none',
        transition: 'all 160ms ease',
      })}
    >
      {iconPath && <Icon path={iconPath} size={15} />}
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{
          background: label === 'Inbox' ? '#ef4444' : '#f59e0b',
          color: 'white',
          borderRadius: '10px',
          fontSize: '10px',
          fontWeight: '700',
          padding: '1px 6px',
          minWidth: '18px',
          textAlign: 'center',
          lineHeight: '16px',
        }}>
          {badge}
        </span>
      )}
    </NavLink>
  );
}

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
    } catch { }
  };

  const roleStyle = ROLE_COLOR[user?.role] || ROLE_COLOR.Consultant;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Logo */}
      <div style={{ padding: '22px 16px 16px' }}>
        <img
          src={logo}
          alt="Khusela"
          style={{ width: '130px', height: 'auto', filter: 'brightness(0) invert(1)', display: 'block', marginBottom: '20px' }}
        />

        {/* User card */}
        <div style={{
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '12px',
          padding: '12px 13px',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ marginBottom: '8px' }}>
            <p style={{ color: 'white', fontSize: '13px', fontWeight: '600', margin: '0 0 4px', lineHeight: 1.3 }}>
              {user?.username}
            </p>
            <span style={{
              display: 'inline-block',
              background: roleStyle.bg, color: roleStyle.color,
              fontSize: '10px', fontWeight: '700', padding: '1px 7px',
              borderRadius: '10px', letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}>
              {user?.role}
            </span>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.2)',
            borderRadius: '7px',
            padding: '4px 8px',
          }}>
            <span style={{ fontSize: '9px', color: '#818cf8' }}>◉</span>
            <span style={{
              color: '#a5b4fc', fontSize: '11px', fontWeight: '500',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              maxWidth: '148px', display: 'block',
            }}>
              {user?.role === 'Admin' ? 'All Branches' : franchise?.franchise_name || 'No branch assigned'}
            </span>
          </div>
        </div>
      </div>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 16px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, padding: '14px 10px', overflowY: 'auto' }}>
        <p style={{
          color: '#3d4a5c', fontSize: '10px', fontWeight: '700',
          textTransform: 'uppercase', letterSpacing: '0.1em',
          padding: '0 10px', marginBottom: '6px', marginTop: '2px',
        }}>
          Menu
        </p>
        {NAV_ITEMS.filter(i => i.roles.includes(user?.role)).map(item => (
          <NavItem
            key={item.to}
            to={item.to}
            label={item.label}
            end={item.end}
            onNavigate={onNavigate}
            badge={item.to === '/inbox' ? unread : item.to === '/applications' ? pendingCount : 0}
          />
        ))}

        {user?.role === 'Admin' && (
          <>
            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '12px 2px 10px' }} />
            <p style={{
              color: '#3d4a5c', fontSize: '10px', fontWeight: '700',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              padding: '0 10px', marginBottom: '6px',
            }}>
              Admin
            </p>
            {ADMIN_ITEMS.filter(i => !i.roles || i.roles.includes(user?.role)).map(item => (
              <NavItem key={item.to} to={item.to} label={item.label} onNavigate={onNavigate} badge={0} />
            ))}
          </>
        )}
      </nav>

      {/* Sign out */}
      <div style={{ padding: '8px 10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: '10px',
            border: '1px solid transparent', background: 'transparent',
            color: '#64748b', fontSize: '13px', cursor: 'pointer',
            textAlign: 'left', fontFamily: 'DM Sans', fontWeight: '500',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.08)';
            e.currentTarget.style.color = '#f87171';
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = '#64748b';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <Icon path="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" size={14} />
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

  if (!isMobile) {
    return (
      <div style={{
        width: '230px', minWidth: '230px', height: '100vh',
        background: 'linear-gradient(180deg, #0c1220 0%, #0f1828 100%)',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}>
        <SidebarContent user={user} />
      </div>
    );
  }

  return (
    <>
      {/* Mobile top bar */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'linear-gradient(90deg, #0c1220, #0f1828)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        padding: '12px 18px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', height: '56px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src={logo} alt="Khusela" style={{ width: '32px', height: '32px', objectFit: 'contain', filter: 'brightness(0) invert(1)' }} />
          <span style={{ color: 'white', fontSize: '16px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
        </div>
        <button onClick={() => setOpen(true)} style={{
          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px', padding: '7px 11px', cursor: 'pointer', color: '#94a3b8', fontSize: '15px',
        }}>
          ☰
        </button>
      </div>

      {/* Overlay */}
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          zIndex: 200, backdropFilter: 'blur(3px)',
        }} />
      )}

      {/* Drawer */}
      <div style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: '264px',
        background: 'linear-gradient(180deg, #0c1220 0%, #0f1828 100%)',
        zIndex: 300,
        transform: open ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        boxShadow: open ? '6px 0 32px rgba(0,0,0,0.45)' : 'none',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0' }}>
          <button onClick={() => setOpen(false)} style={{
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '7px', padding: '5px 10px', cursor: 'pointer', color: '#94a3b8', fontSize: '13px',
          }}>
            ✕
          </button>
        </div>
        <SidebarContent user={user} onNavigate={() => setOpen(false)} />
      </div>
    </>
  );
}
