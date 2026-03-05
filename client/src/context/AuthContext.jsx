import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [employeeId, setEmployeeId] = useState(() => localStorage.getItem('employeeId') || null);
  const [franchise, setFranchise] = useState(() => {
    try { return JSON.parse(localStorage.getItem('franchise')); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify session cookie on every page load
    // Clear any stale token from older client versions
    localStorage.removeItem('token');
    const stored = localStorage.getItem('user');

    api.get('/auth/verify')
      .then(() => {
        if (stored) setUser(JSON.parse(stored));
        setLoading(false);
      })
      .catch((err) => {
        // Only clear state if it's actually a 401 (expired/missing cookie)
        // Not a network error (backend asleep on Render free tier)
        if (err.response?.status === 401) {
          clearLocalState();
        } else if (stored) {
          // Network error or server waking up — keep existing state
          setUser(JSON.parse(stored));
        }
        setLoading(false);
      });
  }, []);

  const clearLocalState = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('franchise');
    localStorage.removeItem('loginTime');
    setUser(null);
    setEmployeeId(null);
    setFranchise(null);
  };

  const fetchEmployeeAndFranchise = async (userData) => {
    if (userData.franchise_id) {
      try {
        const res = await api.get(`/franchises/${userData.franchise_id}`);
        setFranchise(res.data);
        localStorage.setItem('franchise', JSON.stringify(res.data));
      } catch {}
    }
    if (userData.role !== 'Admin') {
      try {
        const res = await api.get('/leave/my-employee');
        setEmployeeId(res.data.id);
        localStorage.setItem('employeeId', res.data.id);
      } catch {}
    }
  };

  const login = (userData) => {
    // No token passed in — it's in the httpOnly cookie
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('loginTime', Date.now().toString());
    setUser(userData);
    fetchEmployeeAndFranchise(userData);
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout'); // clears the cookie server-side
    } catch {}
    clearLocalState();
  };

  return (
    <AuthContext.Provider value={{ user, employeeId, franchise, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}