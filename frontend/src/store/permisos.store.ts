// FILE: frontend/src/store/permisos.store.ts

import { create } from 'zustand';
import type { ModuloKey, AccionKey } from '@/config/permisos.config';

interface PermisosStore {
  // null = todavía no se cargaron; [] = se cargaron pero no tiene ninguno
  modulos:  ModuloKey[] | null;
  acciones: AccionKey[] | null;
  cargando: boolean;
  error:    string | null;

  // Acciones
  setPermisos:  (modulos: ModuloKey[], acciones: AccionKey[]) => void;
  setCargando:  (v: boolean) => void;
  setError:     (msg: string | null) => void;
  resetPermisos: () => void;

  // Helpers de consulta — usan el estado actual
  tieneModulo: (key: ModuloKey) => boolean;
  tieneAccion: (key: AccionKey) => boolean;
}

export const usePermisosStore = create<PermisosStore>((set, get) => ({
  modulos:  null,
  acciones: null,
  cargando: false,
  error:    null,

  setPermisos: (modulos, acciones) =>
    set({ modulos, acciones, cargando: false, error: null }),

  setCargando: (v) => set({ cargando: v }),
  setError:    (msg) => set({ error: msg, cargando: false }),

  // Llamar al hacer logout para limpiar el estado
  resetPermisos: () =>
    set({ modulos: null, acciones: null, cargando: false, error: null }),

  tieneModulo: (key) => {
    const { modulos } = get();
    if (modulos === null) return false; // todavía cargando
    return modulos.includes(key);
  },

  tieneAccion: (key) => {
    const { acciones } = get();
    if (acciones === null) return false;
    return acciones.includes(key);
  },
}));
