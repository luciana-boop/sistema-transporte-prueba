// FILE: src/lib/axios.ts
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Request interceptor — attach JWT
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      // Lee auth_token: clave dedicada escrita por auth.store.ts en setAuth.
      // No se acopla a los internos de Zustand persist (auth-storage).
      const token = localStorage.getItem('auth_token');
      if (token) config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      // Limpiamos tanto las claves manuales como el storage de Zustand,
      // para que el store quede en estado inicial y no haya sesión fantasma.
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('auth-storage'); // ← NUEVO: limpia Zustand persist
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
