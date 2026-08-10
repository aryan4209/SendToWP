import axios from "axios";

const TOKEN_KEY = "sendtowp.token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Registered by AuthProvider so an expired or revoked token drops the user back
// to the sign-in screen instead of leaving the UI stuck on errors.
let onUnauthorized = null;
export const setUnauthorizedHandler = (handler) => {
  onUnauthorized = handler;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isAuthCall = error.config?.url?.startsWith("/auth/");
    if (error.response?.status === 401 && !isAuthCall && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export const errorMessage = (error) =>
  error.response?.data?.message ||
  error.message ||
  "Something went wrong";

export default api;
