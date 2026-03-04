import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useIsMobile } from '../utils/useIsMobile';
import api from '../utils/api';
import axios from 'axios';

// Plain axios for public endpoints — no auth interceptor
const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
});

export default function Signup() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [franchises, setFranchises] = useState([]);
  const [form, setForm] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    role: 'Consultant',
    franchise_id: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    publicApi.get('/franchises')
      .then(res => setFranchises(res.data))
      .catch(() => {});
  }, []);

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setError('');
  };

  const validate = () => {
    if (!form.username.trim()) return 'Username is required.';
    if (!/^[a-zA-Z0-9_]+$/.test(form.username)) return 'Username can only contain letters, numbers and underscores.';
    if (form.password.length < 6) return 'Password must be at least 6 characters.';
    if (form.password !== form.confirmPassword) return 'Passwords do not match.';
    if (!form.franchise_id) return 'Please select your franchise.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setLoading(true); setError('');
    try {
      await publicApi.post('/auth/signup', {
        username: form.username,
        password: form.password,
        role: form.role,
        franchise_id: form.franchise_id,
      });
      setSuccess('Account created! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create account.');
    } finally { setLoading(false); }
  };

  const inputStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    padding: '13px 15px',
    color: 'white',
    fontSize: '15px',
    outline: 'none',
    fontFamily: 'DM Sans',
    boxSizing: 'border-box',
  };

  const labelStyle = {
    display: 'block',
    color: '#94a3b8',
    fontSize: '12px',
    fontWeight: '500',
    marginBottom: '7px',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  };

  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
      boxSizing: 'border-box',
      overflowX: 'hidden',
    }}>
      {/* Branding panel — desktop only */}
      {!isMobile && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '64px',
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
            <h1 style={{ fontFamily: 'Sora', fontSize: '36px', fontWeight: '800', color: 'white', lineHeight: '1.2', marginBottom: '16px' }}>
              Join the team.
            </h1>
            <p style={{ color: '#94a3b8', fontSize: '15px', lineHeight: '1.7', marginBottom: '32px' }}>
              Create your account to start managing debt applications and client records for your branch.
            </p>
            {[
              'Select your franchise branch',
              'Choose your role — HR or Consultant',
              'Start processing applications immediately',
            ].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6', flexShrink: 0 }} />
                <span style={{ color: '#64748b', fontSize: '14px' }}>{item}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Form panel */}
      <div style={{
        width: isMobile ? '100%' : '480px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: isMobile ? '32px 20px' : '48px',
        background: 'rgba(255,255,255,0.03)',
        flex: isMobile ? 1 : 'none',
        boxSizing: 'border-box',
        overflowX: 'hidden',
      }}>
        {/* Mobile logo */}
        {isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '32px', justifyContent: 'center' }}>
            <div style={{
              width: '36px', height: '36px',
              background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ color: 'white', fontWeight: '800', fontSize: '16px', fontFamily: 'Sora' }}>K</span>
            </div>
            <span style={{ color: 'white', fontSize: '20px', fontWeight: '700', fontFamily: 'Sora' }}>Khusela</span>
          </div>
        )}

        <div style={{ marginBottom: '28px' }}>
          <h2 style={{ fontFamily: 'Sora', fontSize: '22px', fontWeight: '700', color: 'white', marginBottom: '6px' }}>
            Create account
          </h2>
          <p style={{ color: '#64748b', fontSize: '14px' }}>Fill in your details to get started</p>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
          }}>
            <span style={{ color: '#fca5a5', fontSize: '13.5px', lineHeight: '1.4' }}>{error}</span>
            <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '15px', padding: 0, flexShrink: 0 }}>✕</button>
          </div>
        )}

        {/* Success */}
        {success && (
          <div style={{
            background: 'rgba(22,163,74,0.12)', border: '1px solid rgba(22,163,74,0.4)',
            borderRadius: '10px', padding: '12px 16px', marginBottom: '20px',
            color: '#86efac', fontSize: '13.5px',
          }}>
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

          {/* Username */}
          <div>
            <label style={labelStyle}>Username</label>
            <input
              name="username"
              value={form.username}
              onChange={handleChange}
              required
              placeholder="e.g. john_smith"
              autoComplete="username"
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
            <p style={{ color: '#475569', fontSize: '11px', margin: '5px 0 0' }}>
              Letters, numbers and underscores only
            </p>
          </div>

          {/* Role */}
          <div>
            <label style={labelStyle}>Role</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {['Consultant', 'HR'].map(r => (
                <label key={r} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '12px 14px', borderRadius: '10px', cursor: 'pointer',
                  border: `1px solid ${form.role === r ? '#3b82f6' : 'rgba(255,255,255,0.1)'}`,
                  background: form.role === r ? 'rgba(59,130,246,0.12)' : 'transparent',
                }}>
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={form.role === r}
                    onChange={handleChange}
                    style={{ accentColor: '#3b82f6' }}
                  />
                  <div>
                    <p style={{ color: form.role === r ? '#93c5fd' : '#94a3b8', fontSize: '13px', fontWeight: '600', margin: 0 }}>{r}</p>
                    <p style={{ color: '#475569', fontSize: '11px', margin: '1px 0 0' }}>
                      {r === 'Consultant' ? 'Process applications' : 'Manage employees'}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Franchise */}
          <div>
            <label style={labelStyle}>Franchise / Branch</label>
            <select
              name="franchise_id"
              value={form.franchise_id}
              onChange={handleChange}
              required
              style={{
                ...inputStyle,
                appearance: 'none',
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 14px center',
                paddingRight: '36px',
                cursor: 'pointer',
              }}
              onFocus={e => e.target.style.borderColor = '#3b82f6'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            >
              <option value="" style={{ background: '#1e293b' }}>— Select your branch —</option>
              {franchises.map(f => (
                <option key={f.id} value={f.id} style={{ background: '#1e293b', color: 'white' }}>
                  {f.franchise_name}
                </option>
              ))}
            </select>
          </div>

          {/* Password */}
          <div>
            <label style={labelStyle}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={handleChange}
                required
                placeholder="Minimum 6 characters"
                autoComplete="new-password"
                style={{ ...inputStyle, paddingRight: '52px' }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button type="button" onClick={() => setShowPassword(p => !p)} style={{
                position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                fontSize: '12px', fontFamily: 'DM Sans', fontWeight: '500', padding: '2px 4px',
              }}>
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>

            {/* Password strength bar */}
            {form.password.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px', transition: 'width 0.3s ease',
                    width: form.password.length < 6 ? '25%' : form.password.length < 10 ? '60%' : '100%',
                    background: form.password.length < 6 ? '#dc2626' : form.password.length < 10 ? '#d97706' : '#16a34a',
                  }} />
                </div>
                <p style={{
                  color: form.password.length < 6 ? '#f87171' : form.password.length < 10 ? '#fbbf24' : '#86efac',
                  fontSize: '11px', margin: '4px 0 0',
                }}>
                  {form.password.length < 6 ? 'Too short' : form.password.length < 10 ? 'Good' : 'Strong'}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label style={labelStyle}>Confirm Password</label>
            <div style={{ position: 'relative' }}>
              <input
                name="confirmPassword"
                type={showConfirm ? 'text' : 'password'}
                value={form.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Re-enter your password"
                autoComplete="new-password"
                style={{
                  ...inputStyle,
                  paddingRight: '52px',
                  borderColor: form.confirmPassword && form.confirmPassword !== form.password
                    ? 'rgba(239,68,68,0.5)'
                    : form.confirmPassword && form.confirmPassword === form.password
                    ? 'rgba(22,163,74,0.5)'
                    : 'rgba(255,255,255,0.1)',
                }}
                onFocus={e => e.target.style.borderColor = '#3b82f6'}
                onBlur={e => {
                  e.target.style.borderColor = form.confirmPassword !== form.password
                    ? 'rgba(239,68,68,0.5)' : 'rgba(22,163,74,0.5)';
                }}
              />
              <button type="button" onClick={() => setShowConfirm(p => !p)} style={{
                position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', color: '#64748b', cursor: 'pointer',
                fontSize: '12px', fontFamily: 'DM Sans', fontWeight: '500', padding: '2px 4px',
              }}>
                {showConfirm ? 'Hide' : 'Show'}
              </button>
            </div>
            {form.confirmPassword && form.confirmPassword !== form.password && (
              <p style={{ color: '#f87171', fontSize: '11px', margin: '4px 0 0' }}>Passwords do not match</p>
            )}
            {form.confirmPassword && form.confirmPassword === form.password && (
              <p style={{ color: '#86efac', fontSize: '11px', margin: '4px 0 0' }}>Passwords match</p>
            )}
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#1d4ed8' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
              border: 'none', borderRadius: '10px', padding: '14px',
              color: 'white', fontSize: '15px', fontWeight: '600',
              fontFamily: 'DM Sans', cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.8 : 1,
              boxShadow: '0 4px 20px rgba(59,130,246,0.35)',
              marginTop: '4px',
            }}
          >
            {loading ? 'Creating account...' : 'Create Account →'}
          </button>

          {/* Login link */}
          <p style={{ textAlign: 'center', color: '#475569', fontSize: '13px', margin: 0 }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#60a5fa', textDecoration: 'none', fontWeight: '600' }}>
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}