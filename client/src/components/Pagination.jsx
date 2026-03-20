export default function Pagination({ page, totalPages, total, limit, onPageChange }) {
  if (totalPages <= 1) return null;

  const pages = [];
  const delta = 2;
  const left = Math.max(1, page - delta);
  const right = Math.min(totalPages, page + delta);

  for (let i = left; i <= right; i++) pages.push(i);

  const btnStyle = (active) => ({
    padding: '6px 11px', borderRadius: '7px', border: 'none',
    fontSize: '12px', fontWeight: active ? '700' : '500',
    fontFamily: 'DM Sans', cursor: active ? 'default' : 'pointer',
    background: active ? '#0f172a' : 'white',
    color: active ? 'white' : '#64748b',
    boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
  });

  const arrowStyle = (disabled) => ({
    ...btnStyle(false),
    opacity: disabled ? 0.3 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  });

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 20px', borderTop: '1px solid #f1f5f9',
      background: 'white', flexWrap: 'wrap', gap: '10px',
    }}>
      <span style={{ color: '#94a3b8', fontSize: '12px' }}>
        Showing {Math.min((page - 1) * limit + 1, total)}–{Math.min(page * limit, total)} of {total}
      </span>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button
          onClick={() => onPageChange(1)}
          disabled={page === 1}
          style={arrowStyle(page === 1)}
        >«</button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          style={arrowStyle(page === 1)}
        >‹</button>

        {left > 1 && (
          <>
            <button onClick={() => onPageChange(1)} style={btnStyle(false)}>1</button>
            {left > 2 && <span style={{ color: '#94a3b8', padding: '0 4px' }}>…</span>}
          </>
        )}

        {pages.map(p => (
          <button key={p} onClick={() => onPageChange(p)} style={btnStyle(p === page)}>
            {p}
          </button>
        ))}

        {right < totalPages && (
          <>
            {right < totalPages - 1 && <span style={{ color: '#94a3b8', padding: '0 4px' }}>…</span>}
            <button onClick={() => onPageChange(totalPages)} style={btnStyle(false)}>
              {totalPages}
            </button>
          </>
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          style={arrowStyle(page === totalPages)}
        >›</button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page === totalPages}
          style={arrowStyle(page === totalPages)}
        >»</button>
      </div>
    </div>
  );
}

