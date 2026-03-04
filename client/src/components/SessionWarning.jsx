import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const WARNING_BEFORE_MS = 5 * 60 * 1000; // warn 5 min before expiry
const TOKEN_LIFE_MS = 8 * 60 * 60 * 1000; // 8 hours

export default function SessionWarning() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [show, setShow] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const intervalRef = useRef(null);

  useEffect(() => {
    const loginTime = parseInt(localStorage.getItem('loginTime') || Date.now());
    const expiresAt = loginTime + TOKEN_LIFE_MS;
    const warnAt = expiresAt - WARNING_BEFORE_MS;

    const checkTime = () => {
      const now = Date.now();
      const remaining = Math.floor((expiresAt - now) / 1000);

      if (now >= expiresAt) {
        logout();
        navigate('/login');
        return;
      }

      if (now >= warnAt) {
        setShow(true);
        setSecondsLeft(remaining);
      }
    };

    intervalRef.current = setInterval(checkTime, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleExtend = () => {
    // Reset login time — in production you'd call a refresh token endpoint
    localStorage.setItem('loginTime', Date.now().toString());
    setShow(false);
    window.location.reload(); // simplest way to re-trigger auth flow
  };

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  if (!show) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: '#0f172a', borderRadius: '12px', padding: '16px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)', border: '1px solid rgba(239,68,68,0.3)',
      maxWidth: '320px', animation: 'slideIn 0.3s ease',
    }}>
      <p style={{ color: '#fca5a5', fontSize: '13px', fontWeight: '700', margin: '0 0 4px', fontFamily: 'Sora' }}>
        Session expiring soon
      </p>
      <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 14px', lineHeight: '1.4' }}>
        Your session expires in {mins}:{secs.toString().padStart(2, '0')}. Any unsaved work will be lost.
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={handleExtend} style={{
          background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          border: 'none', borderRadius: '7px', padding: '7px 14px',
          color: 'white', fontSize: '12px', fontWeight: '600',
          fontFamily: 'DM Sans', cursor: 'pointer',
        }}>
          Stay logged in
        </button>
        <button onClick={() => { logout(); navigate('/login'); }} style={{
          background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '7px',
          padding: '7px 14px', color: '#94a3b8', fontSize: '12px',
          fontFamily: 'DM Sans', cursor: 'pointer',
        }}>
          Log out
        </button>
      </div>
    </div>
  );
}
