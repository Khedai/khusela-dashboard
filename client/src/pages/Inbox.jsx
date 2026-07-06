import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import * as S from '../utils/styles';
import { generateApplicationForm } from '../utils/pdfGenerator';
import Spinner from '../components/Spinner';

const AVATAR_PALETTE = ['#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a', '#0891b2', '#ca8a04', '#dc2626'];

const getInitials = (username) => {
  return (username || '?').charAt(0).toUpperCase();
};

const avatarColor = (name) => {
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

export default function Inbox() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const isManager = user?.role === 'Admin' || user?.role === 'HR' || user?.role === 'Consultant';

  const [tab, setTab] = useState('notifications');
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const [compose, setCompose] = useState({ recipient: '', subject: '', body: '', application_id: '' });
  const [userSearch, setUserSearch] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [sending, setSending] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchAll();
    if (isManager) fetchApplications();
    window.addEventListener('refreshNotifications', fetchAll);
    const interval = setInterval(fetchAll, 15000);
    return () => {
      window.removeEventListener('refreshNotifications', fetchAll);
      clearInterval(interval);
    };
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [notifRes] = await Promise.all([api.get('/notifications')]);
      const notifData = Array.isArray(notifRes.data) ? notifRes.data : notifRes.data?.data || [];
      setNotifications(notifData);

      if (isManager) {
        const [inboxRes, sentRes] = await Promise.all([api.get('/messages/inbox'), api.get('/messages/sent')]);
        setMessages(Array.isArray(inboxRes.data) ? inboxRes.data : inboxRes.data?.data || []);
        setSentMessages(Array.isArray(sentRes.data) ? sentRes.data : sentRes.data?.data || []);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const fetchApplications = async () => {
    try {
      const res = await api.get('/applications');
      setApplications(Array.isArray(res.data) ? res.data : res.data?.data || []);
    } catch {}
  };

  const searchUsers = async (q) => {
    if (!q || q.length < 1) { setUserSearch([]); return; }
    setSearchLoading(true);
    try { const res = await api.get(`/messages/search-users?q=${q.replace('@', '')}`); setUserSearch(res.data); } catch {}
    finally { setSearchLoading(false); }
  };

  const handleSend = async () => {
    if (!compose.recipient || !compose.body) { setError('Recipient and message are required.'); return; }
    setSending(true); setError(''); setSuccess('');
    try {
      await api.post('/messages/send', { recipient_username: compose.recipient, subject: compose.subject, body: compose.body, application_id: compose.application_id || undefined });
      setSuccess('Message sent successfully.');
      setCompose({ recipient: '', subject: '', body: '', application_id: '' });
      setTab('sent');
      fetchAll();
    } catch (err) {
      setError(`Error: ${err.response?.data?.error || err.message || 'Failed to send message.'}`);
    } finally { setSending(false); }
  };

  const markNotifRead = async (id) => { await api.patch(`/notifications/${id}/read`); setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n)); };
  const markAllRead = async () => { await api.patch('/notifications/read-all'); setNotifications(prev => prev.map(n => ({ ...n, is_read: true }))); };
  const markMessageRead = async (id) => { await api.patch(`/messages/${id}/read`); setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m)); };
  const deleteMessage = async (id) => { if (!window.confirm('Delete this message?')) return; await api.delete(`/messages/${id}`); setMessages(prev => prev.filter(m => m.id !== id)); setSentMessages(prev => prev.filter(m => m.id !== id)); setSelectedMessage(null); };

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

  const [notifFilter, setNotifFilter] = useState('all');

  const unreadNotifs = notifications.filter(n => !n.is_read).length;
  const unreadMessages = messages.filter(m => !m.is_read).length;

  const filteredNotifications = notifications.filter(n => {
    if (notifFilter === 'unread') return !n.is_read;
    if (notifFilter === 'leave') return /leave/i.test(n.title + ' ' + (n.message || ''));
    if (notifFilter === 'applications') return /application/i.test(n.title + ' ' + (n.message || '')) || (n.link && n.link.startsWith('/applications'));
    return true;
  });

  const NOTIF_FILTERS = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', count: unreadNotifs },
    { key: 'leave', label: 'Leave' },
    { key: 'applications', label: 'Applications' },
  ];

  const TABS = [
    { key: 'notifications', label: 'Notifications', count: unreadNotifs },
    ...(isManager ? [
      { key: 'inbox', label: 'Messages', count: unreadMessages },
      { key: 'sent', label: 'Sent', count: 0 },
      { key: 'compose', label: '+ Compose', count: 0 },
    ] : []),
  ];

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={S.pageTitle}>Inbox</h2>
      </div>

      {success && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', fontSize: '13.5px', marginBottom: '16px' }}>{success}</div>}
      {error && <div style={{ padding: '11px 14px', borderRadius: '8px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: '13.5px', marginBottom: '16px' }}>{error}</div>}

      {/* Segmented capsule-styled tab bar */}
      <div style={{
        display: 'flex', background: '#f1f5f9', borderRadius: '12px', padding: '4px',
        marginBottom: '20px', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.04)',
        flexWrap: 'wrap',
      }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelectedMessage(null); setError(''); setSuccess(''); }}
            style={{
              flex: '1', padding: '9px 16px', borderRadius: '10px', border: 'none',
              fontSize: '13px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer',
              background: tab === t.key ? 'white' : 'transparent',
              color: tab === t.key ? '#0f172a' : '#64748b',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              boxShadow: tab === t.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
              minWidth: '90px',
            }}>
            {t.label}
            {t.count > 0 && (
              <span style={{
                background: tab === t.key ? '#4f46e5' : '#cbd5e1',
                color: 'white', borderRadius: '10px', fontSize: '10px', fontWeight: '700', padding: '1px 6px', minWidth: '18px', textAlign: 'center',
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── NOTIFICATIONS ── */}
      {tab === 'notifications' && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: S.C.cardShadow, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
              {unreadNotifs > 0 ? `${unreadNotifs} unread` : 'All caught up'}
            </span>
            {unreadNotifs > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>

          <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {NOTIF_FILTERS.map(f => (
              <button key={f.key} onClick={() => setNotifFilter(f.key)}
                style={{
                  padding: '5px 14px', borderRadius: '20px', border: 'none',
                  fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer',
                  background: notifFilter === f.key ? '#4f46e5' : '#f1f5f9',
                  color: notifFilter === f.key ? 'white' : '#64748b',
                  display: 'flex', alignItems: 'center', gap: '5px',
                  transition: 'background 0.15s, color 0.15s',
                }}>
                {f.label}
                {f.count > 0 && (
                  <span style={{ background: notifFilter === f.key ? 'rgba(255,255,255,0.25)' : '#ef4444', color: 'white', borderRadius: '10px', fontSize: '10px', fontWeight: '700', padding: '1px 5px' }}>{f.count}</span>
                )}
              </button>
            ))}
          </div>

          {loading ? <Spinner dark label="Loading notifications..." />
          : filteredNotifications.length === 0 ? <EmptyState icon="✓" title="No notifications" subtitle={notifFilter === 'all' ? 'Notifications will appear here.' : `No ${notifFilter} notifications.`} />
          : filteredNotifications.map((n, i) => (
            <div key={n.id} onClick={async () => { if (!n.is_read) await markNotifRead(n.id); if (n.link) navigate(n.link); }}
              style={{
                display: 'flex', gap: '14px', alignItems: 'flex-start',
                padding: '14px 20px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                background: n.is_read ? 'white' : '#f8faff',
                cursor: n.link ? 'pointer' : (n.is_read ? 'default' : 'pointer'),
                borderLeft: !n.is_read ? '3px solid #4f46e5' : '3px solid transparent',
                transition: 'background 0.15s',
              }}>
              {/* Avatar */}
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: avatarColor(n.title), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0, marginTop: '2px' }}>
                {getInitials(n.title?.replace(/:/g, '').trim().split(' ')[0] || 'N')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <p style={{ margin: 0, fontSize: '13.5px', fontWeight: n.is_read ? '500' : '700', color: '#0f172a' }}>{n.title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#475569', fontSize: '11px' }}>{timeAgo(n.created_at)}</span>
                    {!n.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4f46e5' }} />}
                  </div>
                </div>
                <p style={{ margin: '5px 0 0', fontSize: '12.5px', color: '#475569', lineHeight: '1.5' }}>{n.message}</p>
                {(() => {
                  const txt = (n.title + ' ' + (n.message || '')).toLowerCase();
                  const isLeave = /leave/i.test(n.title) || /leave/i.test(n.message || '');
                  const isApp = /application/i.test(txt) || (n.link && n.link.startsWith('/applications'));
                  if (!isLeave && !isApp) return null;
                  let leaveStatus = '';
                  if (isLeave) { const statusMatch = (n.title || '').match(/—\s*(\w+)/); if (statusMatch) leaveStatus = statusMatch[1]; }
                  const statusColors = { Pending: { bg: '#fffbeb', color: '#b45309' }, Approved: { bg: '#f0fdf4', color: '#15803d' }, Rejected: { bg: '#fef2f2', color: '#b91c1c' } };
                  const sc = statusColors[leaveStatus] || (isLeave ? statusColors.Approved : { bg: '#eff6ff', color: '#2563eb' });
                  const label = isLeave ? (leaveStatus ? `LEAVE · ${leaveStatus}` : 'LEAVE') : 'APPLICATION';
                  return <span style={{ display: 'inline-block', marginTop: '5px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.04em', padding: '2px 7px', borderRadius: '4px', background: sc.bg, color: sc.color }}>{label}</span>;
                })()}
                {/* Quick-action buttons for leave notifications */}
                {(() => {
                  const isLeavePending = /leave/i.test(n.title) && /pending|submitted/i.test(n.title);
                  const requestIdMatch = (n.link || '').match(/request=(\d+)/);
                  const requestId = requestIdMatch ? requestIdMatch[1] : null;
                  if (!isLeavePending || !requestId || !isManager) return null;
                  return (
                    <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                      <QuickActionBtn requestId={requestId} status="Approved" color="#16a34a" icon="✓" fetchAll={fetchAll} />
                      <QuickRejectBtn requestId={requestId} fetchAll={fetchAll} />
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MESSAGES INBOX ── */}
      {tab === 'inbox' && isManager && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: S.C.cardShadow, overflow: 'hidden' }}>
          {selectedMessage ? (
            <MessageDetail message={selectedMessage} onBack={() => setSelectedMessage(null)} onDelete={deleteMessage} timeAgo={timeAgo} isSent={false} applications={applications} />
          ) : loading ? <Spinner dark label="Loading messages..." />
          : messages.length === 0 ? <EmptyState icon="✉" title="No messages" subtitle="Messages from other staff will appear here." />
          : messages.map((m, i) => (
            <div key={m.id} onClick={() => { setSelectedMessage(m); markMessageRead(m.id); }}
              style={{
                padding: '14px 20px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                cursor: 'pointer', background: !m.is_read ? '#f8faff' : 'white',
                display: 'flex', gap: '14px', alignItems: 'flex-start',
                borderLeft: !m.is_read ? '3px solid #4f46e5' : '3px solid transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = !m.is_read ? '#f8faff' : 'white'}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: avatarColor(m.sender_username), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0, marginTop: '2px' }}>
                {getInitials(m.sender_username)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ fontWeight: !m.is_read ? '700' : '500', fontSize: '13.5px', color: '#0f172a' }}>
                    @{m.sender_username}
                    {m.sender_franchise && <span style={{ color: '#475569', fontWeight: '400', fontSize: '12px', marginLeft: '6px' }}>({m.sender_franchise})</span>}
                    {m.sender_role && (
                      <span style={{
                        background: m.sender_role === 'Admin' ? '#f5f3ff' : m.sender_role === 'HR' ? '#eff6ff' : '#f0fdf4',
                        color: m.sender_role === 'Admin' ? '#7c3aed' : m.sender_role === 'HR' ? '#2563eb' : '#16a34a',
                        padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', marginLeft: '6px',
                        border: `1px solid ${m.sender_role === 'Admin' ? '#e0d9fc' : m.sender_role === 'HR' ? '#d0dfff' : '#c6f6d5'}`,
                      }}>
                        {m.sender_role}
                      </span>
                    )}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#475569', fontSize: '11px', whiteSpace: 'nowrap' }}>{timeAgo(m.created_at)}</span>
                    {!m.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#4f46e5', flexShrink: 0 }} />}
                  </div>
                </div>
                {m.subject && <p style={{ margin: '0 0 2px', fontSize: '12.5px', fontWeight: '600', color: '#334155' }}>{m.subject}</p>}
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</p>
                {m.app_client_first && <span style={{ display: 'inline-block', marginTop: '4px', background: '#eff6ff', color: '#2563eb', fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px' }}>Attached: {m.app_client_first} {m.app_client_last}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── SENT ── */}
      {tab === 'sent' && isManager && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: S.C.cardShadow, overflow: 'hidden' }}>
          {selectedMessage ? (
            <MessageDetail message={selectedMessage} onBack={() => setSelectedMessage(null)} onDelete={deleteMessage} timeAgo={timeAgo} isSent={true} applications={applications} />
          ) : sentMessages.length === 0 ? <EmptyState icon="blank" title="No sent messages" subtitle="Messages you send will appear here." />
          : sentMessages.map((m, i) => (
            <div key={m.id} onClick={() => setSelectedMessage(m)}
              style={{
                padding: '14px 20px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                cursor: 'pointer', background: 'white', display: 'flex', gap: '14px', alignItems: 'flex-start',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: avatarColor(m.recipient_username), color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', flexShrink: 0, marginTop: '2px' }}>
                {getInitials(m.recipient_username)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ fontWeight: '500', fontSize: '13.5px', color: '#0f172a' }}>
                    To: @{m.recipient_username}
                    {m.recipient_franchise && <span style={{ color: '#475569', fontWeight: '400', fontSize: '12px', marginLeft: '6px' }}>({m.recipient_franchise})</span>}
                  </span>
                  <span style={{ color: '#475569', fontSize: '11px', whiteSpace: 'nowrap' }}>{timeAgo(m.created_at)}</span>
                </div>
                {m.subject && <p style={{ margin: '0 0 2px', fontSize: '12.5px', fontWeight: '600', color: '#334155' }}>{m.subject}</p>}
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.body}</p>
                {m.app_client_first && <span style={{ display: 'inline-block', marginTop: '4px', background: '#eff6ff', color: '#2563eb', fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px' }}>Attached: {m.app_client_first} {m.app_client_last}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── COMPOSE ── */}
      {tab === 'compose' && isManager && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: S.C.cardShadow, overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>New Message</h3>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>Send to any staff member using @username</p>
          </div>
          <div style={{ padding: '22px' }}>
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>To * (type @username)</label>
              <input ref={searchRef} value={compose.recipient} onChange={e => { setCompose(p => ({ ...p, recipient: e.target.value })); searchUsers(e.target.value); }} placeholder="@username" style={S.input} />
              {userSearch.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100, background: 'white', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: '4px' }}>
                  {searchLoading ? <p style={{ padding: '12px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>Searching...</p>
                  : userSearch.map(u => (
                    <div key={u.id} onClick={() => { setCompose(p => ({ ...p, recipient: u.username })); setUserSearch([]); }}
                      style={{ padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div><span style={{ fontWeight: '600', fontSize: '13.5px', color: '#0f172a' }}>@{u.username}</span><span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>{u.franchise_name}</span></div>
                      <span style={{ background: u.role === 'Admin' ? '#f5f3ff' : '#eff6ff', color: u.role === 'Admin' ? '#7c3aed' : '#2563eb', fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px' }}>{u.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ marginBottom: '16px' }}><label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Subject</label><input value={compose.subject} onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))} placeholder="Optional subject..." style={S.input} /></div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Attach Application (optional)</label>
              <select value={compose.application_id} onChange={e => setCompose(p => ({ ...p, application_id: e.target.value }))} style={S.input}>
                <option value="">— No application attached —</option>
                {applications.map(a => (<option key={a.id} value={a.id}>{a.first_name} {a.last_name} — {a.franchise_name || 'No branch'} — {a.status}</option>))}
              </select>
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Message *</label>
              <textarea value={compose.body} onChange={e => setCompose(p => ({ ...p, body: e.target.value }))} placeholder="Type your message..." rows={6} style={{ ...S.input, resize: 'vertical', lineHeight: '1.6' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSend} disabled={sending} style={{ ...S.primaryBtn, opacity: sending ? 0.7 : 1, cursor: sending ? 'not-allowed' : 'pointer' }}>{sending ? 'Sending...' : 'Send Message'}</button>
              <button onClick={() => setTab('notifications')} style={S.ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Message Detail — Modern workspace inbox drawer ──────────
function MessageDetail({ message: m, onBack, onDelete, timeAgo, isSent, applications }) {
  const attachedApp = applications.find(a => a.id === m.application_id);

  return (
    <div>
      <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafcff' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0, display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span>←</span> Back
        </button>
        <button onClick={() => onDelete(m.id)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>Delete</button>
      </div>

      <div style={{ padding: '24px 26px' }}>
        {m.subject && <h3 style={{ fontFamily: 'Sora', fontSize: '17px', fontWeight: '700', color: '#0f172a', margin: '0 0 16px' }}>{m.subject}</h3>}

        {/* From/To metadata card */}
        <div style={{
          display: 'flex', gap: '20px', marginBottom: '20px', flexWrap: 'wrap',
          background: '#f8fafc', borderRadius: '10px', padding: '16px 20px', border: '1px solid #eef2f7',
        }}>
          <div>
            <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>{isSent ? 'To' : 'From'}</p>
            <p style={{ color: '#0f172a', fontSize: '14px', fontWeight: '700', margin: 0 }}>
              @{isSent ? m.recipient_username : m.sender_username}
            </p>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '2px 0 0' }}>
              {isSent ? m.recipient_franchise : m.sender_franchise}
              {m.sender_role && !isSent && (
                <span style={{
                  background: m.sender_role === 'Admin' ? '#f5f3ff' : m.sender_role === 'HR' ? '#eff6ff' : '#f0fdf4',
                  color: m.sender_role === 'Admin' ? '#7c3aed' : m.sender_role === 'HR' ? '#2563eb' : '#16a34a',
                  padding: '1px 7px', borderRadius: '10px', fontSize: '10px', fontWeight: '700', marginLeft: '8px',
                }}>
                  {m.sender_role}
                </span>
              )}
            </p>
          </div>
          <div>
            <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px' }}>Date</p>
            <p style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: '600', margin: 0 }}>{timeAgo(m.created_at)}</p>
            <p style={{ color: '#94a3b8', fontSize: '11px', margin: '2px 0 0' }}>{new Date(m.created_at).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}</p>
          </div>
        </div>

        {/* Message body */}
        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '20px 22px', marginBottom: '20px', lineHeight: '1.8', color: '#334155', fontSize: '14px', whiteSpace: 'pre-wrap', border: '1px solid #eef2f7' }}>
          {m.body}
        </div>

        {/* Attached application */}
        {m.application_id && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 18px', background: '#fafcff' }}>
            <p style={{ color: '#94a3b8', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 10px' }}>Attached Application</p>
            {attachedApp ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a', margin: '0 0 2px' }}>{attachedApp.first_name} {attachedApp.last_name}</p>
                  <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>{attachedApp.franchise_name} · {attachedApp.status}</p>
                </div>
                <button onClick={async () => { try { const res = await api.get(`/applications/${attachedApp.id}`); generateApplicationForm(res.data.application, res.data.creditors); } catch {} }} style={{ ...S.primaryBtn, fontSize: '12px', padding: '7px 14px' }}>
                  Download PDF
                </button>
              </div>
            ) : <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Application details unavailable.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ padding: '60px 32px', textAlign: 'center' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '20px' }}>{icon}</div>
      <p style={{ color: '#0f172a', fontSize: '15px', fontWeight: '600', fontFamily: 'Sora', margin: '0 0 6px' }}>{title}</p>
      <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>{subtitle}</p>
    </div>
  );
}

// ── Quick-action inline buttons for leave notifications ──
function QuickActionBtn({ requestId, status, color, icon, fetchAll }) {
  const [acting, setActing] = useState(false);
  const handle = async (e) => {
    e.stopPropagation();
    if (acting) return;
    setActing(true);
    try {
      await api.patch(`/leave/request/${requestId}`, { status });
      window.dispatchEvent(new Event('refreshNotifications'));
      window.dispatchEvent(new Event('refreshPendingCount'));
      fetchAll?.();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };
  return (
    <button onClick={handle} disabled={acting}
      style={{
        background: color, border: 'none', borderRadius: '6px',
        color: 'white', fontSize: '11px', fontWeight: '700',
        padding: '5px 12px', cursor: acting ? 'default' : 'pointer',
        fontFamily: 'DM Sans', opacity: acting ? 0.6 : 1,
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>
      {icon} {acting ? '...' : status === 'Approved' ? 'Approve' : 'Reject'}
    </button>
  );
}

function QuickRejectBtn({ requestId, fetchAll }) {
  const [acting, setActing] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');

  const handleReject = async (e) => {
    e.stopPropagation();
    if (acting) return;
    setActing(true);
    try {
      await api.patch(`/leave/request/${requestId}`, { status: 'Rejected', rejection_reason: reason });
      setShowReason(false); setReason('');
      window.dispatchEvent(new Event('refreshNotifications'));
      window.dispatchEvent(new Event('refreshPendingCount'));
      fetchAll?.();
    } catch { /* ignore */ }
    finally { setActing(false); }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    setShowReason(true);
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    setShowReason(false);
    setReason('');
  };

  if (showReason) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <input
          placeholder="Reason (optional)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          style={{
            padding: '4px 8px', borderRadius: '6px', border: '1px solid #e2e8f0',
            fontSize: '11px', fontFamily: 'DM Sans', outline: 'none',
            width: '160px',
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={handleReject} disabled={acting}
            style={{
              background: '#dc2626', border: 'none', borderRadius: '6px',
              color: 'white', fontSize: '11px', fontWeight: '700',
              padding: '5px 12px', cursor: acting ? 'default' : 'pointer',
              fontFamily: 'DM Sans',
            }}>
            ✓ Confirm
          </button>
          <button onClick={handleCancel}
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: '6px',
              color: '#475569', fontSize: '11px', fontWeight: '600',
              padding: '5px 12px', cursor: 'pointer',
              fontFamily: 'DM Sans',
            }}>
            ✕ Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button onClick={handleClick}
      style={{
        background: '#dc2626', border: 'none', borderRadius: '6px',
        color: 'white', fontSize: '11px', fontWeight: '700',
        padding: '5px 12px', cursor: 'pointer',
        fontFamily: 'DM Sans',
        display: 'flex', alignItems: 'center', gap: '4px',
      }}>
      ✕ Reject
    </button>
  );
}
