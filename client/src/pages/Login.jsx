import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { username, password });
      login(res.data.user, res.data.token);
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
    }}>
      {/* Left panel — branding */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '64px',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ maxWidth: '480px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '48px',
          }}>
            <div style={{
              width: '40px', height: '40px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              borderRadius: '10px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'white', fontWeight: '800', fontSize: '18px', fontFamily: 'Sora' }}>K</span>
            </div>
            <span style={{ color: 'white', fontSize: '22px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
          </div>

          <h1 style={{
            fontFamily: 'Sora',
            fontSize: '42px',
            fontWeight: '800',
            color: 'white',
            lineHeight: '1.15',
            marginBottom: '20px',
          }}>
            Debt Management<br />
            <span style={{ color: '#3b82f6' }}>Made Simple.</span>
          </h1>

          <p style={{
            color: '#94a3b8',
            fontSize: '16px',
            lineHeight: '1.7',
            marginBottom: '48px',
          }}>
            Manage client applications, track employee records, and streamline your franchise operations — all in one place.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              { icon: '🏢', label: 'Multi-franchise support' },
              { icon: '🔐', label: 'Role-based access control' },
              { icon: '📋', label: 'Digital application processing' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <span style={{ color: '#64748b', fontSize: '14px' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div style={{
        width: '480px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '64px 48px',
        background: 'rgba(255,255,255,0.03)',
        backdropFilter: 'blur(20px)',
      }}>
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{
            fontFamily: 'Sora',
            fontSize: '26px',
            fontWeight: '700',
            color: 'white',
            marginBottom: '8px',
          }}>
            Sign in
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px' }}>
            Enter your credentials to access the dashboard
          </p>
        </div>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '10px',
            padding: '12px 16px',
            marginBottom: '20px',
            color: '#fca5a5',
            fontSize: '14px',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: '500', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              placeholder="Enter your username"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '14px 16px',
                color: 'white',
                fontSize: '15px',
                outline: 'none',
                fontFamily: 'DM Sans',
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <div>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', fontWeight: '500', marginBottom: '8px', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Enter your password"
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '14px 16px',
                color: 'white',
                fontSize: '15px',
                outline: 'none',
                fontFamily: 'DM Sans',
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#1d4ed8' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              border: 'none',
              borderRadius: '10px',
              padding: '15px',
              color: 'white',
              fontSize: '15px',
              fontWeight: '600',
              fontFamily: 'DM Sans',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.8 : 1,
              marginTop: '4px',
              boxShadow: '0 4px 24px rgba(59,130,246,0.35)',
            }}
          >
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}