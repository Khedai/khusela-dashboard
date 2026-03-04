import { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user')); } catch { return null; }
  });
  const [employeeId, setEmployeeId] = useState(() => localStorage.getItem('employeeId') || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/verify')
      .then(() => setLoading(false))
      .catch(() => { logout(); setLoading(false); });
  }, []);

  // Fetch employee record after login for non-admins
  const fetchEmployeeId = async (role) => {
    if (role === 'Admin') return;
    try {
      const res = await api.get('/leave/my-employee');
      setEmployeeId(res.data.id);
      localStorage.setItem('employeeId', res.data.id);
    } catch {
      // Not linked yet — that's ok
    }
  };

  const login = (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('loginTime', Date.now().toString());
    setUser(userData);
    fetchEmployeeId(userData.role);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('loginTime');
    setUser(null);
    setEmployeeId(null);
  };

  return (
    <AuthContext.Provider value={{ user, employeeId, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}