import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useIdleTimeout } from '../utils/useIdleTimeout';

const WARNING_BEFORE_MS = 5 * 60 * 1000;  // warn 5 min before token expiry
const TOKEN_LIFE_MS     = 8 * 60 * 60 * 1000; // 8 hours

export default function SessionWarning() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ── Token-expiry warning ───────────────────────────────
  const [tokenShow, setTokenShow]   = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(300);
  const intervalRef = useRef(null);

  useEffect(() => {
    const loginTime = parseInt(localStorage.getItem('loginTime') || Date.now());
    const expiresAt = loginTime + TOKEN_LIFE_MS;
    const warnAt    = expiresAt - WARNING_BEFORE_MS;

    const checkTime = () => {
      const now       = Date.now();
      const remaining = Math.floor((expiresAt - now) / 1000);
      if (now >= expiresAt) { doLogout(); return; }
      if (now >= warnAt)    { setTokenShow(true); setSecondsLeft(remaining); }
    };

    intervalRef.current = setInterval(checkTime, 1000);
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleExtend = () => {
    localStorage.setItem('loginTime', Date.now().toString());
    setTokenShow(false);
    window.location.reload();
  };

  const doLogout = () => { logout(); navigate('/login'); };

  // ── Idle timeout warning ───────────────────────────────
  const { warning: idleWarning, resetIdle } = useIdleTimeout(doLogout, !!user);
  const [idleCountdown, setIdleCountdown] = useState(300);
  const idleRef = useRef(null);

  useEffect(() => {
    if (idleWarning) {
      setIdleCountdown(300);
      idleRef.current = setInterval(() => {
        setIdleCountdown(p => {
          if (p <= 1) { clearInterval(idleRef.current); return 0; }
          return p - 1;
        });
      }, 1000);
    } else {
      clearInterval(idleRef.current);
    }
    return () => clearInterval(idleRef.current);
  }, [idleWarning]);

  // ── Which banner to show ───────────────────────────────
  const show = tokenShow || idleWarning;
  if (!show) return null;

  const isIdle    = idleWarning && !tokenShow;
  const mins      = isIdle ? Math.floor(idleCountdown / 60) : Math.floor(secondsLeft / 60);
  const secs      = isIdle ? idleCountdown % 60             : secondsLeft % 60;
  const label     = isIdle ? 'Idle timeout' : 'Session expiring soon';
  const sublabel  = isIdle
    ? `No activity detected. You'll be logged out in ${mins}:${secs.toString().padStart(2, '0')}.`
    : `Your session expires in ${mins}:${secs.toString().padStart(2, '0')}. Any unsaved work will be lost.`;

  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999,
      background: '#0f172a', borderRadius: '12px', padding: '16px 20px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      border: `1px solid ${isIdle ? 'rgba(251,191,36,0.35)' : 'rgba(239,68,68,0.3)'}`,
      maxWidth: '320px',
    }}>
      <p style={{ color: isIdle ? '#fcd34d' : '#fca5a5', fontSize: '13px', fontWeight: '700', margin: '0 0 4px', fontFamily: 'Sora' }}>
        {label}
      </p>
      <p style={{ color: '#94a3b8', fontSize: '12px', margin: '0 0 14px', lineHeight: '1.4' }}>
        {sublabel}
      </p>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => { isIdle ? resetIdle() : handleExtend(); }}
          style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)', border: 'none', borderRadius: '7px', padding: '7px 14px', color: 'white', fontSize: '12px', fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer' }}
        >
          {isIdle ? "I'm still here" : 'Stay logged in'}
        </button>
        <button
          onClick={doLogout}
          style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '7px', padding: '7px 14px', color: '#94a3b8', fontSize: '12px', fontFamily: 'DM Sans', cursor: 'pointer' }}
        >
          Log out
        </button>
      </div>
    </div>
  );
}
