import { useEffect, useRef, useState } from 'react';

const IDLE_MS   = 30 * 60 * 1000; // 30 min → auto-logout
const WARN_MS   = 25 * 60 * 1000; // 25 min → show warning
const EVENTS    = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];

/**
 * Watches for user inactivity.
 * - After WARN_MS of idle: `warning` becomes true
 * - After IDLE_MS of idle: calls `onLogout`
 * Reset happens on any user interaction.
 */
export function useIdleTimeout(onLogout, enabled = true) {
  const [warning, setWarning] = useState(false);
  const idleTimer  = useRef(null);
  const warnTimer  = useRef(null);

  const reset = () => {
    setWarning(false);
    clearTimeout(idleTimer.current);
    clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => setWarning(true), WARN_MS);
    idleTimer.current = setTimeout(() => onLogout(), IDLE_MS);
  };

  useEffect(() => {
    if (!enabled) return;
    EVENTS.forEach(e => window.addEventListener(e, reset, { passive: true }));
    reset(); // start the timers immediately
    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, reset));
      clearTimeout(idleTimer.current);
      clearTimeout(warnTimer.current);
    };
  }, [enabled]);

  return { warning, resetIdle: reset };
}
