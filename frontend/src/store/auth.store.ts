// FILE: src/store/auth.store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Usuario } from '@/types';

interface AuthStore {
  usuario: Usuario | null;
  isAuthenticated: boolean;
  _hasHydrated: boolean;
  isTokenVerified: boolean;
  setHasHydrated: (state: boolean) => void;
  setTokenVerified: (verified: boolean) => void;
  setAuth: (usuario: Usuario) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      usuario: null,
      isAuthenticated: false,
      _hasHydrated: false,
      isTokenVerified: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),
      setTokenVerified: (verified) => set({ isTokenVerified: verified }),

      setAuth: (usuario) => {
        set({ usuario, isAuthenticated: true, isTokenVerified: true });
      },

      logout: () => {
        set({ usuario: null, isAuthenticated: false, isTokenVerified: false });
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
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
