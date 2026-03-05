import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useIsMobile } from '../utils/useIsMobile';
import axios from 'axios';
import api from '../utils/api';
import { Link } from 'react-router-dom';

export default function Login() {
  const { login } = useAuth();
  const isMobile = useIsMobile();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const publicApi = axios.create({ baseURL: import.meta.env.VITE_API_URL, withCredentials: true });
      const res = await publicApi.post('/auth/login', { username, password });
      login(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid username or password.');
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100%', display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>
      {/* Branding panel */}
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
        padding: isMobile ? '40px 20px' : '64px 48px',
        background: 'rgba(255,255,255,0.03)',
        flex: isMobile ? 1 : 'none',
        boxSizing: 'border-box',
        overflowX: 'hidden',
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

        {/* Persistent error — stays until user types again */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: '10px',
            padding: '14px 16px',
            marginBottom: '24px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '12px',
          }}>
            <span style={{ color: '#fca5a5', fontSize: '14px', lineHeight: '1.4' }}>{error}</span>
            <button
              onClick={() => setError('')}
              style={{
                background: 'none', border: 'none', color: '#f87171',
                cursor: 'pointer', fontSize: '16px', padding: 0, lineHeight: 1, flexShrink: 0,
              }}
            >
              ✕
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Username */}
          <div>
            <label style={{
              display: 'block', color: '#94a3b8', fontSize: '12px',
              fontWeight: '500', marginBottom: '7px', letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => { setUsername(e.target.value); setError(''); }}
              required
              placeholder="Enter your username"
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

          {/* Password with toggle */}
          <div>
            <label style={{
              display: 'block', color: '#94a3b8', fontSize: '12px',
              fontWeight: '500', marginBottom: '7px', letterSpacing: '0.05em', textTransform: 'uppercase',
            }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                required
                placeholder="Enter your password"
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                  padding: '13px 48px 13px 15px', color: 'white', fontSize: '15px',
                  outline: 'none', fontFamily: 'DM Sans', boxSizing: 'border-box',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(p => !p)}
                style={{
                  position: 'absolute', right: '14px', top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#64748b', fontSize: '13px', fontFamily: 'DM Sans',
                  fontWeight: '500', padding: '2px 4px', lineHeight: 1,
                }}
                onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
                onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#1d4ed8' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              border: 'none', borderRadius: '10px', padding: '14px',
              color: 'white', fontSize: '15px', fontWeight: '600',
              fontFamily: 'DM Sans', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.8 : 1, marginTop: '4px',
              boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
          <p style={{ textAlign: 'center', color: '#475569', fontSize: '13px', margin: 0 }}>
            Don't have an account?{' '}
            <Link to="/signup" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: '600' }}>
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}