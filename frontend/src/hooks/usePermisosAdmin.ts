// FILE: frontend/src/hooks/usePermisosAdmin.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth.store';
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
  const token = useAuthStore((s) => s.token);

  const [data,      setData]      = useState<PermisosAdminData | null>(null);
  const [cargando,  setCargando]  = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? '';

  // ─── Cargar permisos del usuario ──────────────────────────────────────────
  const cargar = useCallback(async () => {
    if (!token) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch(`${baseUrl}/api/permisos/${usuarioId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const json = await res.json();
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar permisos');
    } finally {
      setCargando(false);
    }
  }, [token, usuarioId, baseUrl]);

  useEffect(() => { cargar(); }, [cargar]);

  // ─── Guardar permisos ─────────────────────────────────────────────────────
  const guardar = useCallback(async (
    modulos:  PermisoModuloItem[],
    acciones: PermisoAccionItem[],
  ): Promise<{ ok: boolean; mensaje: string }> => {
    if (!token) return { ok: false, mensaje: 'Sin token' };
    setGuardando(true);
    try {
      const res = await fetch(`${baseUrl}/api/permisos/${usuarioId}`, {
        method:  'PUT',
        headers: {
          'Content-Type':  'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ modulos, acciones }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`);
      return { ok: true, mensaje: json.message ?? 'Permisos guardados' };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error al guardar';
      return { ok: false, mensaje: msg };
    } finally {
      setGuardando(false);
    }
  }, [token, usuarioId, baseUrl]);

  return { data, cargando, guardando, error, guardar, recargar: cargar };
}
