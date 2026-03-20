export default function EmptyState({ icon, title, subtitle, action, onAction }) {
  return (
    <div style={{ padding: '60px 32px', textAlign: 'center' }}>
      <div style={{
        width: '52px', height: '52px', borderRadius: '14px',
        background: '#f1f5f9', display: 'flex', alignItems: 'center',
        justifyContent: 'center', margin: '0 auto 16px', fontSize: '22px',
      }}>
        {icon}
      </div>
      <p style={{
        color: '#0f172a', fontSize: '15px', fontWeight: '600',
        fontFamily: 'Sora', margin: '0 0 6px',
      }}>{title}</p>
      <p style={{ color: '#94a3b8', fontSize: '13px', margin: '0 0 20px' }}>{subtitle}</p>
      {action && onAction && (
        <button onClick={onAction} style={{
          padding: '9px 20px', borderRadius: '8px', border: 'none',
          background: '#0f172a', color: 'white', fontSize: '13px',
          fontWeight: '600', fontFamily: 'DM Sans', cursor: 'pointer',
        }}>
          {action}
        </button>
      )}
    </div>
  );
}
