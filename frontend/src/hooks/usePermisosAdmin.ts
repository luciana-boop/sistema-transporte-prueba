// FILE: frontend/src/hooks/usePermisosAdmin.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import api from '@/services/api';
import type { ModuloKey, AccionKey } from '@/config/permisos.config';

export interface PermisoModuloItem  { key: ModuloKey;  habilitado: boolean }
export interface PermisoAccionItem  { key: AccionKey;  habilitado: boolean }

export interface PermisosAdminData {
  usuario:  { nombre: string; email: string; rol: string };
  esAdmin:  boolean;
  modulos:  PermisoModuloItem[];
  acciones: PermisoAccionItem[];
}

export function usePermisosAdmin(usuarioId: number) {
  const [data,      setData]      = useState<PermisosAdminData | null>(null);
  const [cargando,  setCargando]  = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  // ─── Cargar permisos del usuario ──────────────────────────────────────────
  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await api.get(`/api/permisos/${usuarioId}`);
      setData(res.data.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar permisos');
    } finally {
      setCargando(false);
    }
  }, [usuarioId]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Guardar permisos ─────────────────────────────────────────────────────
  const guardar = useCallback(async (
    modulos:  PermisoModuloItem[],
    acciones: PermisoAccionItem[],
  ): Promise<{ ok: boolean; mensaje: string }> => {
    setGuardando(true);
    try {
      const res = await api.put(`/api/permisos/${usuarioId}`, { modulos, acciones });
      return { ok: true, mensaje: res.data.message ?? 'Permisos guardados' };
    } catch (e: any) {
      const msg = e?.response?.data?.error ?? (e instanceof Error ? e.message : 'Error al guardar');
      return { ok: false, mensaje: msg };
    } finally {
      setGuardando(false);
    }
  }, [usuarioId]);

  return { data, cargando, guardando, error, guardar, recargar: cargar };
}
