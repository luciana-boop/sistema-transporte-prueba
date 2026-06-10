// FILE: frontend/src/hooks/usePermisos.ts

'use client';

import { useEffect } from 'react';
import api from '@/services/api';
import { useAuthStore }     from '@/store/auth.store';
import { usePermisosStore } from '@/store/permisos.store';
import type { ModuloKey, AccionKey } from '@/config/permisos.config';

// Llama a GET /api/auth/mis-permisos y puebla el permisosStore.
// Debe usarse una sola vez, en el DashboardLayout o en el Sidebar.
export function usePermisos() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const _hasHydrated   = useAuthStore((s) => s._hasHydrated);

  const setPermisos  = usePermisosStore((s) => s.setPermisos);
  const setCargando  = usePermisosStore((s) => s.setCargando);
  const setError     = usePermisosStore((s) => s.setError);
  const resetPermisos = usePermisosStore((s) => s.resetPermisos);
  const modulos      = usePermisosStore((s) => s.modulos);

  useEffect(() => {
    // Esperar a que Zustand auth termine de hidratar
    if (!_hasHydrated) return;

    // Si no hay sesión, limpiar permisos
    if (!isAuthenticated) {
      resetPermisos();
      return;
    }

    // Si ya se cargaron los permisos en esta sesión, no volver a pedir
    if (modulos !== null) return;

    const cargarPermisos = async () => {
      setCargando(true);
      try {
        const res = await api.get('/api/auth/mis-permisos');
        const data = res.data.data as { modulos: ModuloKey[]; acciones: AccionKey[] };
        setPermisos(data.modulos, data.acciones);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Error al cargar permisos';
        console.error('[usePermisos]', msg);
        // En caso de error, dejamos permisos vacíos (seguro por defecto)
        setError(msg);
        setPermisos([], []);
      }
    };

    cargarPermisos();
  }, [_hasHydrated, isAuthenticated]);
  // modulos, setCargando, setPermisos, setError, resetPermisos son estables (no se listan)
}
