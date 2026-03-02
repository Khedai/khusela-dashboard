import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import api from '../utils/api';

export default function Login() {
  const { login } = useAuth();
  const isMobile = useIsMobile();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100%', display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      {/* Branding panel — hidden on mobile, shown on desktop */}
      {!isMobile && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          justifyContent: 'center', padding: '64px',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '48px' }}>
              <div style={{
                width: '40px', height: '40px',
                background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
                borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ color: 'white', fontWeight: '800', fontSize: '18px', fontFamily: 'Sora' }}>K</span>
              </div>
              <span style={{ color: 'white', fontSize: '22px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
            </div>
            <h1 style={{ fontFamily: 'Sora', fontSize: '40px', fontWeight: '800', color: 'white', lineHeight: '1.15', marginBottom: '20px' }}>
              Debt Management<br />
              <span style={{ color: '#3b82f6' }}>Made Simple.</span>
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.7', marginBottom: '40px' }}>
              Manage client applications, track employee records, and streamline your franchise operations.
            </p>
            {['Multi-franchise support', 'Role-based access control', 'Digital application processing'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                <span style={{ color: '#64748b', fontSize: '14px' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Login form */}
      <div style={{
        width: isMobile ? '100%' : '440px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: isMobile ? '40px 24px' : '64px 48px',
        background: 'rgba(255,255,255,0.03)',
        flex: isMobile ? 1 : 'none',
      }}>
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '40px', justifyContent: 'center' }}>
            <div style={{
              width: '38px', height: '38px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              borderRadius: '9px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'white', fontWeight: '800', fontSize: '17px', fontFamily: 'Sora' }}>K</span>
            </div>
            <span style={{ color: 'white', fontSize: '20px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
          </div>
        )}

        <div style={{ marginBottom: '32px' }}>
          <h2 style={{ fontFamily: 'Sora', fontSize: '24px', fontWeight: '700', color: 'white', marginBottom: '6px' }}>
            Sign in
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px' }}>Enter your credentials to continue</p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
            color: '#fca5a5', fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {[
            { label: 'Username', value: username, set: setUsername, type: 'text', placeholder: 'Enter your username' },
            { label: 'Password', value: password, set: setPassword, type: 'password', placeholder: 'Enter your password' },
          ].map(f => (
            <div key={f.label}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '12px', fontWeight: '500', marginBottom: '7px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {f.label}
              </label>
              <input
                type={f.type} value={f.value} onChange={e => f.set(e.target.value)}
                required placeholder={f.placeholder}
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                  padding: '13px 15px', color: 'white', fontSize: '15px',
                  outline: 'none', fontFamily: 'DM Sans', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>
          ))}
          <button type="submit" disabled={loading} style={{
            width: '100%', background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            border: 'none', borderRadius: '10px', padding: '14px',
            color: 'white', fontSize: '15px', fontWeight: '600',
            fontFamily: 'DM Sans', cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.8 : 1, marginTop: '4px',
            boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
          }}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}