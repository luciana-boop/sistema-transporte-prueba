// FILE: src/store/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Usuario } from '@/types';

interface AuthStore {
  token: string | null;
  usuario: Usuario | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
  setAuth: (token: string, usuario: Usuario) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      usuario: null,
      isAuthenticated: false,
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      setAuth: (token, usuario) => {
        if (typeof window !== 'undefined') {
          // auth_token: clave dedicada que lee el interceptor de Axios.
          // Es la única fuente que axios.ts conoce — no puede leer
          // los internos de Zustand persist directamente.
          // auth_user se elimina: nadie más lo lee, Zustand persist
          // ya guarda el usuario en auth-storage.
          localStorage.setItem('auth_token', token);
        }
        set({ token, usuario, isAuthenticated: true });
      },

      logout: () => {
        if (typeof window !== 'undefined') {
          // Limpiamos auth_token (interceptor) y auth-storage (Zustand).
          // auth_user ya no se escribe, pero lo removemos por compatibilidad
          // con sesiones anteriores que sí lo tenían.
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
          // auth-storage lo limpia Zustand persist automáticamente
          // al detectar el estado reseteado, pero lo forzamos
          // para garantizar consistencia inmediata.
          localStorage.removeItem('auth-storage');
        }
        set({ token: null, usuario: null, isAuthenticated: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        usuario: state.usuario,
        isAuthenticated: state.isAuthenticated,
        // _hasHydrated NO se persiste — siempre arranca en false
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
