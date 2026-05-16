export default function EmptyState({ icon, title, subtitle, action, onAction }) {
  return (
    <div style={{ padding: '64px 32px', textAlign: 'center' }}>
      <div style={{
        width: '56px', height: '56px', borderRadius: '16px',
        background: 'linear-gradient(135deg, #e0e7ff, #ede9fe)',
        border: '1px solid #c7d2fe',
        display: 'flex', alignItems: 'center',
        justifyContent: 'center', margin: '0 auto 18px', fontSize: '24px',
        boxShadow: '0 4px 14px rgba(99,102,241,0.12)',
      }}>
        {icon}
      </div>
      <p style={{
        color: '#0f172a', fontSize: '15px', fontWeight: '600',
        fontFamily: 'Sora', margin: '0 0 6px', letterSpacing: '-0.2px',
      }}>{title}</p>
      <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 22px', lineHeight: '1.6' }}>{subtitle}</p>
      {action && onAction && (
        <button onClick={onAction} style={{
          padding: '10px 22px', borderRadius: '10px', border: 'none',
          background: 'linear-gradient(135deg, #6366f1, #4f46e5)',
          color: 'white', fontSize: '13px',
          fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer',
          boxShadow: '0 2px 10px rgba(99,102,241,0.3)',
        }}>
          {action}
        </button>
      )}
    </div>
  );
}
