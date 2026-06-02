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

      // Flag de hidratación — inicia en false, pasa a true
      // cuando Zustand termina de leer localStorage
      _hasHydrated: false,
      setHasHydrated: (state) => set({ _hasHydrated: state }),

      setAuth: (token, usuario) => {
        // Se eliminó la escritura manual duplicada en localStorage.
        // El middleware persist ya maneja esto bajo 'auth-storage'.
        // Si algún archivo del proyecto lee 'auth_token' directamente,
        // avisame y lo migramos en ese archivo — no acá.
        set({ token, usuario, isAuthenticated: true });
      },

      logout: () => {
        // Solo limpiamos lo que persist no maneja automáticamente.
        // persist borrará 'auth-storage' al detectar el estado reseteado.
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('auth_user');
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
        // y solo pasa a true cuando onRehydrateStorage se dispara
      }),
      onRehydrateStorage: () => (state) => {
        // Este callback se ejecuta cuando Zustand termina de leer
        // localStorage. Recién en este momento es seguro evaluar auth.
        state?.setHasHydrated(true);
      },
    }
  )
);
