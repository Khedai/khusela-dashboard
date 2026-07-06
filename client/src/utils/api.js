import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials: true,
});

// Attach CSRF token as a header on every mutating request.
// Cookie-based reading fails in cross-domain deployments (Vercel + Render),
// so we fall back to the token stored in localStorage after login.
function getCsrfToken() {
  const cookie = document.cookie.match(/(?:^|; )csrf-token=([^;]+)/);
  if (cookie) return decodeURIComponent(cookie[1]);
  return localStorage.getItem('csrf-token');
}

export function storeCsrfToken(token) {
  if (token) localStorage.setItem('csrf-token', token);
}

api.interceptors.request.use((config) => {
  const token = getCsrfToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers['x-csrf-token'] = token;
  }
  return config;
});

// Session management — only clear on confirmed session expiry, not on transient 401s.
const SESSION_CHECK_KEY = '_sessionCleared';

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const url = error.config?.url || '';
    const method = (error.config?.method || 'get').toLowerCase();

    // Skip interceptor for auth endpoints (prevents infinite loops)
    if (url.includes('/auth/verify') || url.includes('/auth/login')) {
      return Promise.reject(error);
    }

    // Only act on 401 (session expired) — not 403 (CSRF) or 5xx (server)
    if (status !== 401) return Promise.reject(error);

    // For GET requests, try a quick /auth/verify to confirm the session is really dead.
    // Mobile browsers sometimes lose SameSite=None cookies transiently;
    // a single failed GET shouldn't nuke the whole session.
    if (method === 'get') {
      try {
        // Use fetch directly (not axios) to avoid triggering the interceptor again
        const verifyRes = await fetch(
          `${import.meta.env.VITE_API_URL}/auth/verify`,
          { method: 'GET', credentials: 'include' }
        );
        if (verifyRes.ok) {
          // Session is still valid — the failed request was a transient blip.
          // Retry the original request once.
          return api.request(error.config);
        }
      } catch {
        // fetch failed entirely (network down) — don't clear session
        return Promise.reject(error);
      }
    }

    // For mutations (POST/PUT/PATCH/DELETE) - session is confirmed dead.
    // Prevent double-clearing within the same page load.
    const alreadyCleared = sessionStorage.getItem(SESSION_CHECK_KEY);
    if (!alreadyCleared) {
      sessionStorage.setItem(SESSION_CHECK_KEY, '1');
      localStorage.removeItem('user');
      localStorage.removeItem('employeeId');
      localStorage.removeItem('franchise');
      localStorage.removeItem('loginTime');
      localStorage.removeItem('csrf-token');
      window.location.href = '/login';
    }

    return Promise.reject(error);
  }
);

export default api;