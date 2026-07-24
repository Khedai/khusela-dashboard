import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import api from '../utils/api';
import { can } from '../utils/access';
import { C, card, pageTitle, primaryBtn, ghostBtn, pageHeader } from '../utils/styles';
import Spinner from '../components/Spinner';
import { SkeletonStatCard } from '../components/Skeleton';

const PINNED_COLORS = {
  true:  { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.3)', icon: '#f59e0b' },
  false: { bg: 'transparent', border: 'rgba(0,0,0,0.04)', icon: 'transparent' },
};

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs  = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── PWA / Browser notification helpers ─────────────
function notifyAnnouncement(title, body) {
  // Sound: short chime
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch { /* audio not available */ }

  // Title flash
  const origTitle = document.title;
  let toggle = false;
  const flash = setInterval(() => {
    document.title = toggle ? '📢 New Announcement!' : origTitle;
    toggle = !toggle;
  }, 800);
  setTimeout(() => { clearInterval(flash); document.title = origTitle; }, 8000);

  // Browser Notification API
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/android-chrome-192x192.png',
      badge: '/android-chrome-192x192.png',
      tag: 'announcement',
    });
  }
}

function requestNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

export default function Announcements() {
  const { user, franchise } = useAuth();
  const isMobile = useIsMobile();
  const [announcements, setAnnouncements] = useState([]);
  const [franchises, setFranchises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Default to "Khusela" franchise for admins
  const [selectedFranchiseId, setSelectedFranchiseId] = useState(() => {
    return localStorage.getItem('announcementsFilterFranchiseId') || '';
  });

  // Track which announcement IDs we've already seen (for new-arrival notifications)
  const knownIdsRef = useRef(new Set());
  const userIdRef = useRef(user?.id);

  // Form state
  const [formTitle, setFormTitle] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formFranchiseId, setFormFranchiseId] = useState('');
  const [formPinned, setFormPinned] = useState(false);

  const canCreate = can(user, 'announcements.create');
  const canEdit = can(user, 'announcements.edit');
  const canDelete = can(user, 'announcements.delete');

  const fetchAnnouncements = useCallback(async (fid) => {
    setLoading(true);
    try {
      const params = {};
      if (user?.role === 'Admin' && fid) {
        params.franchise_id = fid;
      }
      const res = await api.get('/announcements', { params });
      const newList = res.data;
      setAnnouncements(newList);

      // Detect genuinely new announcements (not from self)
      const freshIds = new Set(newList.map(a => a.id));
      for (const ann of newList) {
        if (!knownIdsRef.current.has(ann.id)) {
          // Brand new announcement — notify if NOT created by self
          const authorUsername = (ann.author_name || '').toLowerCase();
          const myUsername = (user?.username || '').toLowerCase();
          if (authorUsername !== myUsername) {
            const franchiseLabel = ann.franchise_name ? ` [${ann.franchise_name}]` : '';
            notifyAnnouncement(
              `📢 ${ann.title}`,
              `${ann.message.substring(0, 150)}${ann.message.length > 150 ? '...' : ''}${franchiseLabel}`
            );
          }
        }
      }
      knownIdsRef.current = freshIds;
    } catch (e) {
      console.error('Failed to fetch announcements:', e);
    }
    setLoading(false);
  }, [user?.role, user?.username]);

  const fetchFranchises = useCallback(async () => {
    if (user?.role !== 'Admin') return;
    try {
      const res = await api.get('/franchises');
      const list = res.data || [];
      setFranchises(list);

      // Auto-select Khusela if no saved filter and Khusela exists
      const savedFilter = localStorage.getItem('announcementsFilterFranchiseId');
      if (!savedFilter) {
        const khusela = list.find(f =>
          f.franchise_name?.toLowerCase().includes('khusela')
        );
        if (khusela) {
          setSelectedFranchiseId(khusela.id);
          localStorage.setItem('announcementsFilterFranchiseId', khusela.id);
        }
      }
    } catch {}
  }, [user?.role]);

  useEffect(() => {
    fetchAnnouncements(selectedFranchiseId);
  }, [selectedFranchiseId, fetchAnnouncements]);

  useEffect(() => {
    fetchFranchises();
    requestNotificationPermission();
  }, [fetchFranchises]);

  // ─── Poll for new announcements every 20 seconds ───
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAnnouncements(selectedFranchiseId);
    }, 20000);
    return () => clearInterval(interval);
  }, [selectedFranchiseId, fetchAnnouncements]);

  const openCreate = () => {
    setEditing(null);
    setError('');
    setFormTitle('');
    setFormMessage('');
    // Default to currently selected franchise for admins, or user's franchise
    setFormFranchiseId(selectedFranchiseId || franchise?.id || '');
    setFormPinned(false);
    setShowModal(true);
  };

  const openEdit = (ann) => {
    setEditing(ann);
    setError('');
    setFormTitle(ann.title);
    setFormMessage(ann.message);
    setFormFranchiseId(ann.franchise_id || '');
    setFormPinned(ann.is_pinned);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!formTitle.trim()) { setError('Title is required.'); return; }
    if (!formMessage.trim()) { setError('Message is required.'); return; }
    if (user?.role === 'Admin' && !formFranchiseId) { setError('Please select a franchise.'); return; }

    setSubmitting(true);
    try {
      if (editing) {
        await api.put(`/announcements/${editing.id}`, {
          title: formTitle.trim(),
          message: formMessage.trim(),
          is_pinned: formPinned,
          franchise_id: user?.role === 'Admin' ? formFranchiseId : undefined,
        });
      } else {
        await api.post('/announcements', {
          title: formTitle.trim(),
          message: formMessage.trim(),
          is_pinned: formPinned,
          franchise_id: user?.role === 'Admin' ? formFranchiseId : undefined,
        });
      }
      closeModal();
      fetchAnnouncements(selectedFranchiseId);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong.');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await api.delete(`/announcements/${id}`);
      fetchAnnouncements(selectedFranchiseId);
    } catch {}
  };

  const handlePin = async (id) => {
    try {
      await api.patch(`/announcements/${id}/pin`);
      fetchAnnouncements(selectedFranchiseId);
    } catch {}
  };

  const handleFilterChange = (fid) => {
    setSelectedFranchiseId(fid);
    localStorage.setItem('announcementsFilterFranchiseId', fid);
  };

  if (loading) {
    return (
      <div>
        <h1 style={pageTitle}>Announcements</h1>
        <SkeletonStatCard />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div style={pageHeader(isMobile)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={pageTitle}>Announcements</h1>
          {/* Franchise dropdown (Admin only) */}
          {user?.role === 'Admin' && franchises.length > 0 && (
            <select
              value={selectedFranchiseId}
              onChange={e => handleFilterChange(e.target.value)}
              style={{
                padding: '8px 14px',
                border: `1px solid ${C.primary}`,
                borderRadius: '10px',
                fontSize: '13px',
                fontWeight: '600',
                color: C.primary,
                fontFamily: 'DM Sans',
                outline: 'none',
                background: C.primaryLight,
                cursor: 'pointer',
              }}
            >
              <option value="">All Franchises</option>
              {franchises.map(f => (
                <option key={f.id} value={f.id}>{f.franchise_name}</option>
              ))}
            </select>
          )}
        </div>
        {canCreate && (
          <button onClick={openCreate} style={primaryBtn}>
            + New Announcement
          </button>
        )}
      </div>

      {/* Announcements list */}
      {announcements.length === 0 ? (
        <div style={{
          ...card,
          padding: '48px 24px',
          textAlign: 'center',
          color: C.textSub,
          fontSize: '14px',
        }}>
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>📢</div>
          <p style={{ margin: 0, fontWeight: '600', color: C.text, fontSize: '15px' }}>No announcements yet</p>
          <p style={{ margin: '4px 0 0', fontSize: '13px' }}>
            {canCreate ? 'Click "New Announcement" to create one.' : 'Check back later for updates.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {announcements.map(ann => {
            const pinned = PINNED_COLORS[ann.is_pinned] || PINNED_COLORS.false;
            return (
              <div
                key={ann.id}
                style={{
                  ...card,
                  padding: '20px 22px',
                  background: pinned.bg,
                  border: `1px solid ${pinned.border}`,
                  position: 'relative',
                }}
              >
                {/* Pin indicator */}
                {ann.is_pinned && (
                  <div style={{
                    position: 'absolute', top: '-1px', right: '18px',
                    background: '#f59e0b', color: '#fff',
                    fontSize: '10px', fontWeight: '700',
                    padding: '2px 8px', borderRadius: '0 0 6px 6px',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    📌 Pinned
                  </div>
                )}

                {/* Title + Franchise badge */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <h3 style={{
                    margin: 0, fontSize: '15px', fontWeight: '700', color: C.text,
                    flex: 1, minWidth: '200px', lineHeight: 1.4,
                    paddingRight: ann.is_pinned ? '80px' : '0',
                  }}>
                    {ann.title}
                  </h3>
                  {ann.franchise_name && user?.role === 'Admin' && (
                    <span style={{
                      display: 'inline-block',
                      background: C.primaryLight, color: C.primaryDark,
                      fontSize: '10px', fontWeight: '700', padding: '2px 9px',
                      borderRadius: '10px', letterSpacing: '0.03em',
                      textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>
                      {ann.franchise_name}
                    </span>
                  )}
                </div>

                {/* Message */}
                <p style={{
                  margin: '0 0 12px', fontSize: '14px', color: C.textMuted,
                  lineHeight: 1.6, whiteSpace: 'pre-wrap',
                }}>
                  {ann.message}
                </p>

                {/* Footer: author, time, actions */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: '10px',
                  borderTop: `1px solid rgba(0,0,0,0.04)`,
                  paddingTop: '10px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: C.textSub }}>
                      By <strong>{ann.author_name || 'Unknown'}</strong>
                    </span>
                    <span style={{ color: C.border, fontSize: '12px' }}>·</span>
                    <span style={{ fontSize: '12px', color: C.textSub }}>{formatDate(ann.created_at)}</span>
                  </div>

                  {/* Admin actions */}
                  {(canEdit || canDelete) && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {canEdit && (
                        <>
                          <button
                            onClick={() => handlePin(ann.id)}
                            style={{ ...ghostBtn, padding: '5px 12px', fontSize: '12px' }}
                            title={ann.is_pinned ? 'Unpin' : 'Pin'}
                          >
                            {ann.is_pinned ? '📌 Unpin' : '📌 Pin'}
                          </button>
                          <button
                            onClick={() => openEdit(ann)}
                            style={{ ...ghostBtn, padding: '5px 12px', fontSize: '12px' }}
                          >
                            ✏️ Edit
                          </button>
                        </>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(ann.id)}
                          style={{
                            ...ghostBtn,
                            padding: '5px 12px',
                            fontSize: '12px',
                            color: C.danger,
                            borderColor: 'rgba(239,68,68,0.25)',
                          }}
                        >
                          🗑️ Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <>
          <div onClick={closeModal} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            zIndex: 500, backdropFilter: 'blur(3px)',
          }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 501, width: isMobile ? '92%' : '480px', maxWidth: '100vw',
            maxHeight: '90vh', overflowY: 'auto',
            ...card, padding: '24px 26px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: C.text }}>
                {editing ? 'Edit Announcement' : 'New Announcement'}
              </h2>
              <button onClick={closeModal} style={{
                background: 'none', border: 'none', fontSize: '18px',
                cursor: 'pointer', color: C.textSub, padding: '4px',
              }}>
                ✕
              </button>
            </div>

            {error && (
              <div style={{
                background: '#fef2f2', color: '#b91c1c', borderRadius: '8px',
                padding: '10px 14px', fontSize: '13px', fontWeight: '500',
                marginBottom: '14px', border: '1px solid rgba(220,38,38,0.2)',
              }}>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Franchise selector (Admin only) */}
              {user?.role === 'Admin' && (
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: C.textMuted, marginBottom: '5px' }}>
                    Franchise
                  </label>
                  <select
                    value={formFranchiseId}
                    onChange={e => setFormFranchiseId(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      border: `1px solid ${C.border}`,
                      borderRadius: '10px',
                      padding: '10px 13px',
                      fontSize: '13.5px',
                      color: C.text,
                      fontFamily: 'DM Sans',
                      outline: 'none',
                      background: '#fafbfe',
                    }}
                  >
                    <option value="">Select a franchise...</option>
                    {franchises.map(f => (
                      <option key={f.id} value={f.id}>{f.franchise_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: C.textMuted, marginBottom: '5px' }}>
                  Title *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  maxLength={200}
                  required
                  placeholder="e.g. Early closure today"
                  style={{
                    width: '100%',
                    border: `1px solid ${C.border}`,
                    borderRadius: '10px',
                    padding: '10px 13px',
                    fontSize: '13.5px',
                    color: C.text,
                    fontFamily: 'DM Sans',
                    outline: 'none',
                    background: '#fafbfe',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {/* Message */}
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: C.textMuted, marginBottom: '5px' }}>
                  Message *
                </label>
                <textarea
                  value={formMessage}
                  onChange={e => setFormMessage(e.target.value)}
                  required
                  rows={5}
                  placeholder="Write your announcement..."
                  style={{
                    width: '100%',
                    border: `1px solid ${C.border}`,
                    borderRadius: '10px',
                    padding: '10px 13px',
                    fontSize: '13.5px',
                    color: C.text,
                    fontFamily: 'DM Sans',
                    outline: 'none',
                    background: '#fafbfe',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    minHeight: '100px',
                  }}
                />
              </div>

              {/* Pin checkbox (Admin only) */}
              {canEdit && (
                <div style={{ marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="checkbox"
                    id="pinCheck"
                    checked={formPinned}
                    onChange={e => setFormPinned(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: C.primary }}
                  />
                  <label htmlFor="pinCheck" style={{ fontSize: '13px', color: C.textMuted, fontWeight: '500', cursor: 'pointer' }}>
                    📌 Pin this announcement
                  </label>
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={closeModal} style={ghostBtn}>
                  Cancel
                </button>
                <button type="submit" disabled={submitting} style={{
                  ...primaryBtn,
                  opacity: submitting ? 0.6 : 1,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                }}>
                  {submitting ? 'Saving...' : editing ? 'Save Changes' : 'Post Announcement'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}