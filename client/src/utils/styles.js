// ─── Design Tokens ────────────────────────────────────────
export const C = {
  primary:      '#6366f1',
  primaryDark:  '#4f46e5',
  primaryLight: '#e0e7ff',
  primaryGlow:  'rgba(99,102,241,0.28)',
  bg:           '#eef1f8',
  card:         '#ffffff',
  sidebar:      '#0c1220',
  text:         '#0f172a',
  textSub:      '#64748b',
  textMuted:    '#475569',
  border:       '#e4e8f0',
  borderLight:  'rgba(0,0,0,0.05)',
  success:      '#10b981',
  warning:      '#f59e0b',
  danger:       '#ef4444',
  // Soft dual-layered shadow for cards
  cardShadow:   '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 4px 6px -2px rgba(0, 0, 0, 0.02)',
};

export const card = {
  background: C.card,
  borderRadius: '16px',
  border: `1px solid ${C.border}`,
  boxShadow: C.cardShadow,
  overflow: 'hidden',
};

export const pageTitle = {
  fontFamily: 'Sora',
  fontSize: '22px',
  fontWeight: '700',
  color: C.text,
  margin: 0,
  letterSpacing: '-0.3px',
};

export const sectionLabel = {
  color: C.textMuted,
  fontSize: '10px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
};

export const tableHeader = {
  padding: '11px 22px',
  color: C.textMuted,
  fontSize: '11px',
  fontWeight: '700',
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  background: '#f7f9fc',
  textAlign: 'left',
  borderBottom: `1px solid ${C.border}`,
};

export const tableCell = {
  padding: '13px 22px',
  color: C.text,
  fontSize: '13.5px',
  borderTop: `1px solid #f3f6fb`,
};

export const input = {
  width: '100%',
  border: `1px solid ${C.border}`,
  borderRadius: '10px',
  padding: '10px 13px',
  fontSize: '13.5px',
  color: C.text,
  fontFamily: 'DM Sans',
  outline: 'none',
  background: '#fafbfe',
  transition: 'border-color 150ms, box-shadow 150ms',
};

export const primaryBtn = {
  background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
  border: 'none',
  borderRadius: '10px',
  padding: '10px 20px',
  color: 'white',
  fontSize: '13.5px',
  fontWeight: '600',
  fontFamily: 'DM Sans',
  cursor: 'pointer',
  boxShadow: `0 2px 10px ${C.primaryGlow}`,
  letterSpacing: '0.01em',
};

export const ghostBtn = {
  background: '#f1f4fb',
  border: `1px solid ${C.border}`,
  borderRadius: '10px',
  padding: '10px 18px',
  color: C.textSub,
  fontSize: '13.5px',
  fontWeight: '500',
  fontFamily: 'DM Sans',
  cursor: 'pointer',
};

export const badge = (type) => {
  const map = {
    Admin:           { background: '#ede9fe', color: '#7c3aed' },
    HR:              { background: '#e0e7ff', color: '#4338ca' },
    Consultant:      { background: '#d1fae5', color: '#065f46' },
    Active:          { background: '#d1fae5', color: '#065f46' },
    Inactive:        { background: '#fee2e2', color: '#991b1b' },
    Draft:           { background: '#f8fafc', color: '#475569' },
    Submitted:       { background: '#eff6ff', color: '#1d4ed8' },
    'Pending Docs':  { background: '#fffbeb', color: '#b45309' },
    Approved:        { background: '#f0fdf4', color: '#15803d' },
    Rejected:        { background: '#fef2f2', color: '#b91c1c' },
    Pending:         { background: '#fffbeb', color: '#b45309' },
  };
  return {
    ...(map[type] || { background: '#f1f5f9', color: '#475569' }),
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '700',
    whiteSpace: 'nowrap',
    display: 'inline-block',
    letterSpacing: '0.02em',
  };
};

export const formSection = {
  marginBottom: '28px',
};

export const formSectionTitle = {
  fontSize: '11px',
  fontWeight: '700',
  color: C.textMuted,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  marginBottom: '14px',
  paddingBottom: '8px',
  borderBottom: `1px solid ${C.border}`,
};

export const responsiveGrid = (isMobile) => ({
  display: 'grid',
  gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
  gap: '14px',
});

export const pageHeader = (isMobile) => ({
  display: 'flex',
  flexDirection: isMobile ? 'column' : 'row',
  justifyContent: isMobile ? 'flex-start' : 'space-between',
  alignItems: isMobile ? 'flex-start' : 'center',
  gap: '12px',
  marginBottom: '24px',
});
