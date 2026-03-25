import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// Attach CSRF token from cookie as a header on every mutating request
function getCsrfToken() {
  const match = document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config) => {
  const token = getCsrfToken();
  if (token) config.headers['x-csrf-token'] = token;
  return config;
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