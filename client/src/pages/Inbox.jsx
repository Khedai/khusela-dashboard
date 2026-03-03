import { useState, useEffect } from 'react';
import api from '../utils/api';
import { useIsMobile } from '../utils/useIsMobile';
import * as S from '../utils/styles';

export default function Inbox() {
  const isMobile = useIsMobile();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'unread'
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch {
    } finally { setLoading(false); }
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setSuccess('All notifications marked as read.');
  };

  const markOneRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString('en-ZA');
  };

  const iconForTitle = (title) => {
    if (title?.toLowerCase().includes('leave')) return { bg: '#eff6ff', color: '#2563eb', letter: 'L' };
    if (title?.toLowerCase().includes('approved')) return { bg: '#f0fdf4', color: '#16a34a', letter: 'A' };
    if (title?.toLowerCase().includes('rejected')) return { bg: '#fef2f2', color: '#dc2626', letter: 'R' };
    return { bg: '#f5f3ff', color: '#7c3aed', letter: 'N' };
  };

  return (
    <div style={{ maxWidth: '720px' }}>
      {/* Header */}
      <div style={S.pageHeader(isMobile)}>
        <div>
          <h2 style={S.pageTitle}>Inbox</h2>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '4px 0 0' }}>
            {unreadCount > 0 ? `${unreadCount} unread message${unreadCount > 1 ? 's' : ''}` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={S.ghostBtn}>
            Mark all as read
          </button>
        )}
      </div>

      {success && (
        <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>
          {success}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        background: 'white', borderRadius: '10px', padding: '4px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)', width: 'fit-content',
      }}>
        {[
          { key: 'all', label: `All (${notifications.length})` },
          { key: 'unread', label: `Unread (${unreadCount})` },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            style={{
              padding: '7px 16px', borderRadius: '7px', border: 'none',
              fontSize: '13px', fontWeight: '500', fontFamily: 'DM Sans', cursor: 'pointer',
              background: filter === tab.key ? '#0f172a' : 'transparent',
              color: filter === tab.key ? 'white' : '#64748b',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <p style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading...</p>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '60px 32px', textAlign: 'center' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: '#f1f5f9', display: 'flex', alignItems: 'center',
              justifyContent: 'center', margin: '0 auto 16px', fontSize: '20px',
            }}>
              ✓
            </div>
            <p style={{ color: '#0f172a', fontSize: '15px', fontWeight: '600', fontFamily: 'Sora', margin: '0 0 6px' }}>
              {filter === 'unread' ? 'No unread messages' : 'No notifications yet'}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>
              {filter === 'unread' ? 'You\'re all caught up.' : 'Notifications will appear here.'}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((n, i) => {
              const icon = iconForTitle(n.title);
              return (
                <div
                  key={n.id}
                  onClick={() => !n.is_read && markOneRead(n.id)}
                  style={{
                    display: 'flex', gap: '14px', alignItems: 'flex-start',
                    padding: '16px 20px',
                    borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                    background: n.is_read ? 'white' : '#f8faff',
                    cursor: n.is_read ? 'default' : 'pointer',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (!n.is_read) e.currentTarget.style.background = '#eff6ff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = n.is_read ? 'white' : '#f8faff'; }}
                >
                  {/* Icon */}
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '10px',
                    background: icon.bg, color: icon.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '13px', fontWeight: '700', fontFamily: 'Sora',
                    flexShrink: 0,
                  }}>
                    {icon.letter}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '4px' }}>
                      <p style={{
                        margin: 0, fontSize: '14px', fontWeight: n.is_read ? '500' : '700',
                        color: '#0f172a', lineHeight: '1.3',
                      }}>
                        {n.title}
                      </p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <span style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>
                          {timeAgo(n.created_at)}
                        </span>
                        {!n.is_read && (
                          <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: '#2563eb', flexShrink: 0,
                          }} />
                        )}
                      </div>
                    </div>
                    <p style={{
                      margin: 0, fontSize: '13px', color: '#64748b', lineHeight: '1.5',
                    }}>
                      {n.message}
                    </p>
                    {!n.is_read && (
                      <button
                        onClick={(e) => { e.stopPropagation(); markOneRead(n.id); }}
                        style={{
                          marginTop: '8px', background: 'none', border: 'none',
                          color: '#2563eb', fontSize: '12px', cursor: 'pointer',
                          fontFamily: 'DM Sans', fontWeight: '600', padding: 0,
                        }}
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}