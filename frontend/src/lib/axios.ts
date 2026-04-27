import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const AUTH_ENDPOINTS = ['/auth/login/', '/auth/register/', '/auth/refresh/'];

function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const requestUrl: string | undefined = error.config?.url;
    const isAuthCall = isAuthEndpoint(requestUrl);
    const onLoginPage = window.location.pathname === '/login';

    if (error.response?.status === 401 && !isAuthCall && !onLoginPage) {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
