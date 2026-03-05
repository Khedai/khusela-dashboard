import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// Cookie handles authentication; if session expires, clear local state and redirect
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Avoid redirecting during verify/login calls (prevents infinite loop)
    const isVerify = error.config?.url?.includes('/auth/verify');
    const isLogin = error.config?.url?.includes('/auth/login');

    if (error.response?.status === 401 && !isVerify && !isLogin) {
      localStorage.removeItem('user');
      localStorage.removeItem('employeeId');
      localStorage.removeItem('franchise');
      localStorage.removeItem('loginTime');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;