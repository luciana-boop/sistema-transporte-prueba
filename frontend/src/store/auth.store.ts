// FILE: src/store/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Usuario } from '@/types';

interface AuthStore {
  usuario: Usuario | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  isTokenVerified: boolean;
  csrfToken: string | null;
  setHasHydrated: (state: boolean) => void;
  setTokenVerified: (verified: boolean) => void;
  setCsrfToken: (csrfToken: string) => void;
  setAuth: (usuario: Usuario, csrfToken: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      usuario: null,
      isAuthenticated: false,
      _hasHydrated: false,
      isTokenVerified: false,
      csrfToken: null,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setTokenVerified: (verified) => set({ isTokenVerified: verified }),
      setCsrfToken: (csrfToken) => set({ csrfToken }),

      setAuth: (usuario, csrfToken) => {
        set({ usuario, isAuthenticated: true, isTokenVerified: true, csrfToken });
      },

      logout: () => {
        set({ usuario: null, isAuthenticated: false, isTokenVerified: false, csrfToken: null });
      },
    }),
    {
      name: 'auth-storage',
      // Nota de seguridad: el JWT de sesión NUNCA se persiste aquí, vive
      // únicamente en una cookie httpOnly. csrfToken no es un secreto de
      // autenticación (ver backend/src/middleware/csrf.middleware.ts,
      // patrón double-submit cookie), por lo que es seguro guardarlo en
      // localStorage junto con el perfil del usuario.
      partialize: (state) => ({
        usuario: state.usuario,
        isAuthenticated: state.isAuthenticated,
        csrfToken: state.csrfToken,
        // _hasHydrated NO se persiste — siempre arranca en false
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
