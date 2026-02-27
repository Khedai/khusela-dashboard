export const card = {
  background: 'white',
  borderRadius: '12px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
  overflow: 'hidden',
};

export const pageTitle = {
  fontFamily: 'Sora',
  fontSize: '22px',
  fontWeight: '700',
  color: '#0f172a',
  margin: 0,
};

export const sectionLabel = {
  color: '#94a3b8',
  fontSize: '10px',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};

export const tableHeader = {
  padding: '10px 22px',
  color: '#94a3b8',
  fontSize: '11px',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  background: '#f8fafc',
  textAlign: 'left',
};

export const tableCell = {
  padding: '13px 22px',
  color: '#0f172a',
  fontSize: '13.5px',
  borderTop: '1px solid #f1f5f9',
};

export const input = {
  width: '100%',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '10px 13px',
  fontSize: '13.5px',
  color: '#0f172a',
  fontFamily: 'DM Sans',
  outline: 'none',
  background: 'white',
};

export const primaryBtn = {
  background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
  border: 'none',
  borderRadius: '8px',
  padding: '10px 18px',
  color: 'white',
  fontSize: '13.5px',
  fontWeight: '600',
  fontFamily: 'DM Sans',
  cursor: 'pointer',
  boxShadow: '0 2px 8px rgba(59,130,246,0.25)',
};

export const ghostBtn = {
  background: '#f1f5f9',
  border: 'none',
  borderRadius: '8px',
  padding: '10px 18px',
  color: '#475569',
  fontSize: '13.5px',
  fontWeight: '500',
  fontFamily: 'DM Sans',
  cursor: 'pointer',
};

export const badge = (type) => {
  const map = {
    Admin:     { background: '#f5f3ff', color: '#7c3aed' },
    HR:        { background: '#eff6ff', color: '#2563eb' },
    Consultant:{ background: '#f0fdf4', color: '#16a34a' },
    Active:    { background: '#f0fdf4', color: '#16a34a' },
    Inactive:  { background: '#fef2f2', color: '#dc2626' },
    Draft:     { background: '#f1f5f9', color: '#64748b' },
    Submitted: { background: '#eff6ff', color: '#2563eb' },
    'Pending Docs': { background: '#fffbeb', color: '#d97706' },
    Approved:  { background: '#f0fdf4', color: '#16a34a' },
    Rejected:  { background: '#fef2f2', color: '#dc2626' },
  };
  return {
    ...(map[type] || { background: '#f1f5f9', color: '#64748b' }),
    padding: '3px 10px',
    borderRadius: '20px',
    fontSize: '11px',
    fontWeight: '600',
    whiteSpace: 'nowrap',
    display: 'inline-block',
  };
};

export const formSection = {
  marginBottom: '28px',
};

export const formSectionTitle = {
  fontSize: '11px',
  fontWeight: '600',
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '14px',
  paddingBottom: '8px',
  borderBottom: '1px solid #f1f5f9',
};