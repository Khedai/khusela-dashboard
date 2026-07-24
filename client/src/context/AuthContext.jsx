import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [employeeId, setEmployeeId] = useState(null);
  const [franchise, setFranchise] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verify session cookie on every page load
    const verifySession = async () => {
      try {
        const res = await api.get('/auth/me');
        setUser(res.data.user);
        fetchEmployeeAndFranchise(res.data.user);
      } catch {
        clearLocalState();
      } finally {
        setLoading(false);
      }
    };
    verifySession();
  }, []);

  const clearLocalState = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('loginTime');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('franchise');
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