import { useState, useEffect, useRef } from 'react';

/**
 * Inline confirmation button that transforms on click.
 * Replaces browser confirm() dialogs for destructive actions.
 * Shows "Confirm? (N)" with a 3-second auto-reset countdown.
 */
export default function ConfirmAction({
  confirmLabel = 'Delete',
  onConfirm,
  disabled = false,
  variant = 'danger',
  style = {},
  size = 'md',
}) {
  const [stage, setStage] = useState('idle');
  const [countdown, setCountdown] = useState(3);
  const timerRef = useRef(null);

  const colors = {
    danger: { idleBg: '#fef2f2', idleColor: '#dc2626', idleBorder: '#fecaca', activeBg: '#dc2626', activeColor: 'white' },
    warning: { idleBg: '#fffbeb', idleColor: '#d97706', idleBorder: '#fde68a', activeBg: '#d97706', activeColor: 'white' },
    default: { idleBg: '#f8fafc', idleColor: '#64748b', idleBorder: '#e2e8f0', activeBg: '#475569', activeColor: 'white' },
  }[variant] || { idleBg: '#fef2f2', idleColor: '#dc2626', idleBorder: '#fecaca', activeBg: '#dc2626', activeColor: 'white' };

  const sizeStyles = size === 'sm'
    ? { padding: '4px 10px', fontSize: '12px', borderRadius: '6px', minHeight: '36px' }
    : { padding: '8px 16px', fontSize: '13px', borderRadius: '8px', minHeight: '44px' };

  useEffect(() => {
    if (stage === 'confirming' && countdown > 0) {
      timerRef.current = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timerRef.current);
    }
    if (stage === 'confirming' && countdown <= 0) {
      setStage('idle');
      setCountdown(3);
    }
  }, [stage, countdown]);

  useEffect(() => { return () => clearTimeout(timerRef.current); }, []);

  const handleClick = () => {
    if (stage === 'idle') {
      setStage('confirming');
      setCountdown(3);
    } else {
      clearTimeout(timerRef.current);
      onConfirm?.();
      setStage('idle');
      setCountdown(3);
    }
  };

  const handleCancel = (e) => {
    e.stopPropagation();
    clearTimeout(timerRef.current);
    setStage('idle');
    setCountdown(3);
  };

  if (stage === 'confirming') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', ...style }}>
        <button onClick={handleClick} disabled={disabled} title={countdown > 0 ? `Confirm in ${countdown}s` : 'Confirm now'}
          style={{ ...sizeStyles, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer', background: colors.activeBg, color: colors.activeColor, fontWeight: '700', fontFamily: 'DM Sans', opacity: disabled ? 0.5 : 1, minWidth: size === 'sm' ? '70px' : '100px', textAlign: 'center', whiteSpace: 'nowrap' }}>
          {countdown > 0 ? `Confirm? (${countdown})` : 'Confirm now'}
        </button>
        <button onClick={handleCancel} disabled={disabled}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: size === 'sm' ? '11px' : '12px', fontWeight: '600', fontFamily: 'DM Sans', padding: '2px 6px', whiteSpace: 'nowrap' }}>
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button onClick={handleClick} disabled={disabled}
      style={{ ...sizeStyles, background: colors.idleBg, color: colors.idleColor, border: `1px solid ${colors.idleBorder}`, fontWeight: '600', fontFamily: 'DM Sans', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1, whiteSpace: 'nowrap', ...style }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = colors.idleColor; e.currentTarget.style.color = 'white'; } }}
      onMouseLeave={e => { e.currentTarget.style.background = colors.idleBg; e.currentTarget.style.color = colors.idleColor; }}>
      {confirmLabel}
    </button>
  );
}