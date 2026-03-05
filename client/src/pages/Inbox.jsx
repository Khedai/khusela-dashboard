import { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import * as S from '../utils/styles';
import { generateApplicationForm } from '../utils/pdfGenerator';

export default function Inbox() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isManager = user?.role === 'Admin' || user?.role === 'HR';

  const [tab, setTab] = useState('notifications'); // notifications | inbox | sent | compose
  const [notifications, setNotifications] = useState([]);
  const [messages, setMessages] = useState([]);
  const [sentMessages, setSentMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  // Compose state
  const [compose, setCompose] = useState({
    recipient: '', subject: '', body: '', application_id: ''
  });
  const [userSearch, setUserSearch] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [applications, setApplications] = useState([]);
  const [sending, setSending] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchAll();
    if (isManager) fetchApplications();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [notifRes] = await Promise.all([
        api.get('/notifications'),
      ]);
      setNotifications(notifRes.data);

      if (isManager) {
        const [inboxRes, sentRes] = await Promise.all([
          api.get('/messages/inbox'),
          api.get('/messages/sent'),
        ]);
        setMessages(inboxRes.data);
        setSentMessages(sentRes.data);
      }
    } catch {}
    finally { setLoading(false); }
  };

  const fetchApplications = async () => {
    try {
      const res = await api.get('/applications');
      setApplications(res.data);
    } catch {}
  };

  const searchUsers = async (q) => {
    if (!q || q.length < 1) { setUserSearch([]); return; }
    setSearchLoading(true);
    try {
      const res = await api.get(`/messages/search-users?q=${q.replace('@', '')}`);
      setUserSearch(res.data);
    } catch {}
    finally { setSearchLoading(false); }
  };

  const handleSend = async () => {
    if (!compose.recipient || !compose.body) {
      setError('Recipient and message are required.');
      return;
    }
    setSending(true); setError(''); setSuccess('');
    try {
      await api.post('/messages/send', {
        recipient_username: compose.recipient,
        subject: compose.subject,
        body: compose.body,
        application_id: compose.application_id || undefined,
      });
      setSuccess('Message sent successfully.');
      setCompose({ recipient: '', subject: '', body: '', application_id: '' });
      setTab('sent');
      fetchAll();
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to send message.';
      setError(`Error: ${msg}`);
      console.error('Send error:', err.response?.data || err);
    } finally { setSending(false); }
  };

  const markNotifRead = async (id) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const markMessageRead = async (id) => {
    await api.patch(`/messages/${id}/read`);
    setMessages(prev => prev.map(m => m.id === id ? { ...m, is_read: true } : m));
  };

  const deleteMessage = async (id) => {
    if (!window.confirm('Delete this message?')) return;
    await api.delete(`/messages/${id}`);
    setMessages(prev => prev.filter(m => m.id !== id));
    setSentMessages(prev => prev.filter(m => m.id !== id));
    setSelectedMessage(null);
  };

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

  const unreadNotifs = notifications.filter(n => !n.is_read).length;
  const unreadMessages = messages.filter(m => !m.is_read).length;

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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', background: 'white', borderRadius: '10px', padding: '4px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', width: 'fit-content', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelectedMessage(null); setError(''); setSuccess(''); }}
            style={{
              padding: '7px 14px', borderRadius: '7px', border: 'none',
              fontSize: '13px', fontWeight: '500', fontFamily: 'DM Sans', cursor: 'pointer',
              background: tab === t.key ? '#0f172a' : 'transparent',
              color: tab === t.key ? 'white' : '#64748b',
              display: 'flex', alignItems: 'center', gap: '6px',
            }}>
            {t.label}
            {t.count > 0 && (
              <span style={{ background: '#dc2626', color: 'white', borderRadius: '10px', fontSize: '10px', fontWeight: '700', padding: '1px 6px' }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── NOTIFICATIONS ── */}
      {tab === 'notifications' && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'Sora', fontSize: '13px', fontWeight: '600', color: '#0f172a' }}>
              {unreadNotifs > 0 ? `${unreadNotifs} unread` : 'All caught up'}
            </span>
            {unreadNotifs > 0 && (
              <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>
          {loading ? (
            <p style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontSize: '14px' }}>Loading...</p>
          ) : notifications.length === 0 ? (
            <EmptyState icon="✓" title="No notifications" subtitle="Notifications will appear here." />
          ) : notifications.map((n, i) => (
            <div key={n.id} onClick={() => !n.is_read && markNotifRead(n.id)}
              style={{
                display: 'flex', gap: '14px', alignItems: 'flex-start',
                padding: '14px 20px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
                background: n.is_read ? 'white' : '#f8faff',
                cursor: n.is_read ? 'default' : 'pointer',
              }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                  <p style={{ margin: 0, fontSize: '13.5px', fontWeight: n.is_read ? '500' : '700', color: '#0f172a' }}>{n.title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#94a3b8', fontSize: '11px' }}>{timeAgo(n.created_at)}</span>
                    {!n.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2563eb' }} />}
                  </div>
                </div>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', lineHeight: '1.5' }}>{n.message}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MESSAGES INBOX ── */}
      {tab === 'inbox' && isManager && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          {selectedMessage ? (
            <MessageDetail
              message={selectedMessage}
              onBack={() => setSelectedMessage(null)}
              onDelete={deleteMessage}
              timeAgo={timeAgo}
              isSent={false}
              applications={applications}
            />
          ) : loading ? (
            <p style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>Loading...</p>
          ) : messages.length === 0 ? (
            <EmptyState icon="✉" title="No messages" subtitle="Messages from other HR and Admin staff will appear here." />
          ) : messages.map((m, i) => (
            <MessageRow key={m.id} message={m} i={i} timeAgo={timeAgo} isSent={false}
              onClick={() => { setSelectedMessage(m); markMessageRead(m.id); }} />
          ))}
        </div>
      )}

      {/* ── SENT ── */}
      {tab === 'sent' && isManager && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          {selectedMessage ? (
            <MessageDetail
              message={selectedMessage}
              onBack={() => setSelectedMessage(null)}
              onDelete={deleteMessage}
              timeAgo={timeAgo}
              isSent={true}
              applications={applications}
            />
          ) : sentMessages.length === 0 ? (
            <EmptyState icon="📤" title="No sent messages" subtitle="Messages you send will appear here." />
          ) : sentMessages.map((m, i) => (
            <MessageRow key={m.id} message={m} i={i} timeAgo={timeAgo} isSent={true}
              onClick={() => setSelectedMessage(m)} />
          ))}
        </div>
      )}

      {/* ── COMPOSE ── */}
      {tab === 'compose' && isManager && (
        <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 22px', borderBottom: '1px solid #f1f5f9' }}>
            <h3 style={{ fontFamily: 'Sora', fontSize: '14px', fontWeight: '600', color: '#0f172a', margin: 0 }}>New Message</h3>
            <p style={{ color: '#94a3b8', fontSize: '12px', margin: '4px 0 0' }}>
              Send to HR or Admin staff using @username
            </p>
          </div>

          <div style={{ padding: '22px' }}>

            {/* Recipient with autocomplete */}
            <div style={{ marginBottom: '16px', position: 'relative' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>
                To * (type @username)
              </label>
              <input
                ref={searchRef}
                value={compose.recipient}
                onChange={e => {
                  setCompose(p => ({ ...p, recipient: e.target.value }));
                  searchUsers(e.target.value);
                }}
                placeholder="@username"
                style={S.input}
              />
              {/* Autocomplete dropdown */}
              {userSearch.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                  background: 'white', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  border: '1px solid #e2e8f0', overflow: 'hidden', marginTop: '4px',
                }}>
                  {searchLoading ? (
                    <p style={{ padding: '12px', color: '#94a3b8', fontSize: '13px', margin: 0 }}>Searching...</p>
                  ) : userSearch.map(u => (
                    <div key={u.id}
                      onClick={() => {
                        setCompose(p => ({ ...p, recipient: u.username }));
                        setUserSearch([]);
                      }}
                      style={{
                        padding: '10px 14px', cursor: 'pointer', display: 'flex',
                        justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: '1px solid #f8fafc',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div>
                        <span style={{ fontWeight: '600', fontSize: '13.5px', color: '#0f172a' }}>@{u.username}</span>
                        <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>{u.franchise_name}</span>
                      </div>
                      <span style={{
                        background: u.role === 'Admin' ? '#f5f3ff' : '#eff6ff',
                        color: u.role === 'Admin' ? '#7c3aed' : '#2563eb',
                        fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px',
                      }}>{u.role}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subject */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Subject</label>
              <input
                value={compose.subject}
                onChange={e => setCompose(p => ({ ...p, subject: e.target.value }))}
                placeholder="Optional subject..."
                style={S.input}
              />
            </div>

            {/* Attach application */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>
                Attach Application (optional)
              </label>
              <select
                value={compose.application_id}
                onChange={e => setCompose(p => ({ ...p, application_id: e.target.value }))}
                style={S.input}
              >
                <option value="">— No application attached —</option>
                {applications.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.first_name} {a.last_name} — {a.franchise_name || 'No branch'} — {a.status}
                  </option>
                ))}
              </select>
            </div>

            {/* Message body */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', color: '#64748b', fontSize: '12px', marginBottom: '5px' }}>Message *</label>
              <textarea
                value={compose.body}
                onChange={e => setCompose(p => ({ ...p, body: e.target.value }))}
                placeholder="Type your message..."
                rows={6}
                style={{ ...S.input, resize: 'vertical', lineHeight: '1.6' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={handleSend} disabled={sending}
                style={{ ...S.primaryBtn, opacity: sending ? 0.7 : 1, cursor: sending ? 'not-allowed' : 'pointer' }}>
                {sending ? 'Sending...' : 'Send Message'}
              </button>
              <button onClick={() => setTab('notifications')} style={S.ghostBtn}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Message Row ────────────────────────────────────────────
function MessageRow({ message: m, i, timeAgo, isSent, onClick }) {
  return (
    <div onClick={onClick}
      style={{
        padding: '14px 20px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
        cursor: 'pointer', background: (!isSent && !m.is_read) ? '#f8faff' : 'white',
        display: 'flex', gap: '14px', alignItems: 'flex-start',
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
      onMouseLeave={e => e.currentTarget.style.background = (!isSent && !m.is_read) ? '#f8faff' : 'white'}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
          <span style={{ fontWeight: (!isSent && !m.is_read) ? '700' : '500', fontSize: '13.5px', color: '#0f172a' }}>
            {isSent ? `To: @${m.recipient_username}` : `@${m.sender_username}`}
            {isSent
              ? m.recipient_franchise && <span style={{ color: '#94a3b8', fontWeight: '400', fontSize: '12px', marginLeft: '6px' }}>({m.recipient_franchise})</span>
              : m.sender_franchise && <span style={{ color: '#94a3b8', fontWeight: '400', fontSize: '12px', marginLeft: '6px' }}>({m.sender_franchise})</span>
            }
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#94a3b8', fontSize: '11px', whiteSpace: 'nowrap' }}>{timeAgo(m.created_at)}</span>
            {!isSent && !m.is_read && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />}
          </div>
        </div>
        {m.subject && <p style={{ margin: '0 0 2px', fontSize: '12.5px', fontWeight: '600', color: '#334155' }}>{m.subject}</p>}
        <p style={{ margin: 0, fontSize: '12.5px', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.body}
        </p>
        {m.app_client_first && (
          <span style={{ display: 'inline-block', marginTop: '4px', background: '#eff6ff', color: '#2563eb', fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '4px' }}>
            📎 {m.app_client_first} {m.app_client_last}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Message Detail ─────────────────────────────────────────
function MessageDetail({ message: m, onBack, onDelete, timeAgo, isSent, applications }) {
  const attachedApp = applications.find(a => a.id === m.application_id);

  return (
    <div>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '13px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '500', padding: 0 }}>
          ← Back
        </button>
        <button onClick={() => onDelete(m.id)} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '12px', cursor: 'pointer', fontFamily: 'DM Sans', fontWeight: '600', padding: 0 }}>
          Delete
        </button>
      </div>

      <div style={{ padding: '22px' }}>
        {m.subject && (
          <h3 style={{ fontFamily: 'Sora', fontSize: '16px', fontWeight: '700', color: '#0f172a', margin: '0 0 12px' }}>{m.subject}</h3>
        )}

        <div style={{ display: 'flex', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ color: '#94a3b8', fontSize: '11px', margin: '0 0 2px' }}>{isSent ? 'To' : 'From'}</p>
            <p style={{ color: '#0f172a', fontSize: '13.5px', fontWeight: '600', margin: 0 }}>
              @{isSent ? m.recipient_username : m.sender_username}
              <span style={{ color: '#94a3b8', fontWeight: '400', marginLeft: '6px' }}>
                ({isSent ? m.recipient_franchise : m.sender_franchise})
              </span>
            </p>
          </div>
          <div>
            <p style={{ color: '#94a3b8', fontSize: '11px', margin: '0 0 2px' }}>Date</p>
            <p style={{ color: '#0f172a', fontSize: '13.5px', margin: 0 }}>{timeAgo(m.created_at)}</p>
          </div>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '18px', marginBottom: '20px', lineHeight: '1.7', color: '#334155', fontSize: '14px', whiteSpace: 'pre-wrap' }}>
          {m.body}
        </div>

        {/* Attached application */}
        {m.application_id && (
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px' }}>
            <p style={{ color: '#94a3b8', fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px' }}>
              Attached Application
            </p>
            {attachedApp ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <p style={{ fontWeight: '600', fontSize: '14px', color: '#0f172a', margin: '0 0 2px' }}>
                    {attachedApp.first_name} {attachedApp.last_name}
                  </p>
                  <p style={{ color: '#64748b', fontSize: '12px', margin: 0 }}>
                    {attachedApp.franchise_name} · {attachedApp.status}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await api.get(`/applications/${attachedApp.id}`);
                      generateApplicationForm(res.data.application, res.data.creditors);
                    } catch {}
                  }}
                  style={{ ...S.primaryBtn, fontSize: '12px', padding: '7px 14px' }}
                >
                  Download PDF
                </button>
              </div>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>Application details unavailable.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────
function EmptyState({ icon, title, subtitle }) {
  return (
    <div style={{ padding: '60px 32px', textAlign: 'center' }}>
      <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '20px' }}>
        {icon}
      </div>
      <p style={{ color: '#0f172a', fontSize: '15px', fontWeight: '600', fontFamily: 'Sora', margin: '0 0 6px' }}>{title}</p>
      <p style={{ color: '#94a3b8', fontSize: '13px', margin: 0 }}>{subtitle}</p>
    </div>
  );
}