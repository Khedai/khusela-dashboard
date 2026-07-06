import React from 'react';

// Reusable shimmer skeleton for loading states.
// Shows the page layout immediately while data loads in the background.

const baseCss = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;

let styleInjected = false;
let smallScreen = typeof window !== 'undefined' && window.innerWidth < 768;

export function SkeletonBlock({ width = '100%', height = '14px', radius = '6px', style = {} }) {
  if (!styleInjected) {
    styleInjected = true;
    // Inject shimmer keyframes once (scoped via data-skeleton)
    const el = document.createElement('style');
    el.setAttribute('data-skeleton', '');
    el.textContent = baseCss;
    document.head.appendChild(el);
  }
  return (
    <div
      style={{
        width, height, borderRadius: radius,
        background: 'linear-gradient(90deg, #e8ecf1 25%, #f1f3f6 50%, #e8ecf1 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

export function SkeletonStatCard({ lines = 2, style = {} }) {
  return (
    <div style={{
      background: 'white', borderRadius: '12px', padding: '16px 18px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
      border: '1px solid #f1f5f9', ...style,
    }}>
      <SkeletonBlock width="50%" height="10px" style={{ marginBottom: '8px' }} />
      <SkeletonBlock width="40%" height="26px" radius="8px" />
      {lines > 1 && <SkeletonBlock width="28%" height="10px" style={{ marginTop: '10px' }} />}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, style = {} }) {
  const isMobile = smallScreen;
  return (
    <div style={{ padding: '0', ...style }}>
      {/* Header */}
      <div style={{
        display: 'flex', gap: '12px', padding: '10px 22px', background: '#f8fafc',
        borderBottom: '1px solid #f1f5f9',
      }}>
        {Array.from({ length: isMobile ? 2 : cols }).map((_, i) => (
          <SkeletonBlock key={i} width={i === 0 ? '35%' : `${100 / cols}%`} height="11px" radius="4px" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{
          display: 'flex', gap: '12px', padding: '12px 22px',
          borderBottom: '1px solid #f1f5f9',
        }}>
          {Array.from({ length: isMobile ? 2 : cols }).map((_, i) => (
            <SkeletonBlock key={i} width={i === 0 ? '35%' : `${100 / cols}%`} height={i === 0 ? '14px' : '12px'} radius="5px" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCardGrid({ count = 3, style = {} }) {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
      gap: '14px', ...style,
    }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          background: 'white', borderRadius: '14px', padding: '20px 22px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.03)',
          border: '1px solid #f1f5f9',
        }}>
          <SkeletonBlock width="60%" height="15px" style={{ marginBottom: '8px' }} />
          <SkeletonBlock width="80%" height="13px" style={{ marginBottom: '14px' }} />
          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <SkeletonBlock width="80px" height="32px" radius="10px" />
            <SkeletonBlock width="60px" height="32px" radius="10px" />
          </div>
          <div style={{ paddingTop: '14px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: '14px' }}>
            <SkeletonBlock width="40px" height="13px" />
            <SkeletonBlock width="50px" height="13px" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonDetail({ sections = 4, style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', ...style }}>
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} style={{
          background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}>
          <div style={{ padding: '10px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
            <SkeletonBlock width="30%" height="12px" />
          </div>
          <div style={{ padding: '14px 20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px 24px' }}>
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j}>
                <SkeletonBlock width="40%" height="11px" style={{ marginBottom: '4px' }} />
                <SkeletonBlock width="70%" height="14px" radius="5px" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonInbox({ rows = 5, style = {} }) {
  return (
    <div style={{
      background: 'white', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      overflow: 'hidden', ...style,
    }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          padding: '14px 20px', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none',
          display: 'flex', gap: '14px', alignItems: 'flex-start',
          borderLeft: i < 2 ? '3px solid #4f46e5' : '3px solid transparent',
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <SkeletonBlock width="35%" height="14px" />
              <SkeletonBlock width="12%" height="10px" />
            </div>
            <SkeletonBlock width="90%" height="12px" style={{ marginBottom: '4px' }} />
            <SkeletonBlock width="65%" height="12px" />
          </div>
        </div>
      ))}
    </div>
  );
}