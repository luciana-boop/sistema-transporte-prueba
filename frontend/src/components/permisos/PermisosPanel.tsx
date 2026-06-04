// FILE: frontend/src/components/permisos/PermisosPanel.tsx
'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Shield, ShieldCheck, ShieldOff, Save, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULOS_META, ACCIONES_META } from '@/config/permisos.config';
import type {
  PermisoModuloItem,
  PermisoAccionItem,
  PermisosAdminData,
} from '@/hooks/usePermisosAdmin';

interface Props {
  data:      PermisosAdminData;
  guardando: boolean;
  onGuardar: (modulos: PermisoModuloItem[], acciones: PermisoAccionItem[]) => Promise<{ ok: boolean; mensaje: string }>;
}

export function PermisosPanel({ data, guardando, onGuardar }: Props) {
  const [modulos,  setModulos]  = useState<PermisoModuloItem[]>(data.modulos);
  const [acciones, setAcciones] = useState<PermisoAccionItem[]>(data.acciones);
  const [dirty,    setDirty]    = useState(false);

  // Sincronizar si el padre recarga data
  useEffect(() => {
    setModulos(data.modulos);
    setAcciones(data.acciones);
    setDirty(false);
  }, [data]);

  // ─── Handlers ─────────────────────────────────────────────────────────────
  const toggleModulo = (key: string) => {
    setModulos((prev) =>
      prev.map((m) => m.key === key ? { ...m, habilitado: !m.habilitado } : m)
    );
    setDirty(true);
  };

  const toggleAccion = (key: string) => {
    setAcciones((prev) =>
      prev.map((a) => a.key === key ? { ...a, habilitado: !a.habilitado } : a)
    );
    setDirty(true);
  };

  const handleGuardar = async () => {
    const result = await onGuardar(modulos, acciones);
    if (result.ok) {
      toast.success(result.mensaje);
      setDirty(false);
    } else {
      toast.error(result.mensaje);
    }
  };

  // ─── Caso ADMIN ────────────────────────────────────────────────────────────
  if (data.esAdmin) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-blue-800">Usuario Administrador</p>
          <p className="text-sm text-blue-600 mt-1">
            Los administradores tienen acceso total al sistema. Sus permisos no pueden modificarse.
          </p>
        </div>
      </div>
    );
  }

  const modulosHabilitados = modulos.filter((m) => m.habilitado).length;
  const accionesHabilitadas = acciones.filter((a) => a.habilitado).length;

  return (
    <div className="space-y-6">

      {/* ── Resumen ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-primary shrink-0" />
          <div>
            <p className="text-2xl font-bold text-foreground">{modulosHabilitados}</p>
            <p className="text-xs text-muted-foreground">de {modulos.length} módulos activos</p>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
          <Shield className="w-8 h-8 text-orange-500 shrink-0" />
          <div>
            <p className="text-2xl font-bold text-foreground">{accionesHabilitadas}</p>
            <p className="text-xs text-muted-foreground">de {acciones.length} anulaciones activas</p>
          </div>
        </div>
      </div>

      {/* ── Módulos ───────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Módulos visibles</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              El usuario solo verá los módulos habilitados en el menú lateral
            </p>
          </div>
          {/* Activar / desactivar todos */}
          <div className="flex gap-2">
            <button
              onClick={() => { setModulos((p) => p.map((m) => ({ ...m, habilitado: true  }))); setDirty(true); }}
              className="text-xs text-primary hover:underline"
            >
              Todos
            </button>
            <span className="text-muted-foreground text-xs">·</span>
            <button
              onClick={() => { setModulos((p) => p.map((m) => ({ ...m, habilitado: false }))); setDirty(true); }}
              className="text-xs text-muted-foreground hover:underline"
            >
              Ninguno
            </button>
          </div>
        </div>

        <div className="divide-y divide-border">
          {modulos.map((item) => {
            const meta = MODULOS_META[item.key];
            return (
              <label
                key={item.key}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors',
                  item.habilitado
                    ? 'hover:bg-primary/5'
                    : 'hover:bg-muted/50 opacity-60'
                )}
              >
                {/* Checkbox custom */}
                <div className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                  item.habilitado
                    ? 'bg-primary border-primary'
                    : 'border-border bg-background'
                )}>
                  {item.habilitado && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={item.habilitado}
                  onChange={() => toggleModulo(item.key)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{meta?.label ?? item.key}</p>
                  <p className="text-xs text-muted-foreground">{meta?.descripcion}</p>
                </div>
                {item.habilitado
                  ? <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
                  : <ShieldOff   className="w-4 h-4 text-muted-foreground shrink-0" />
                }
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Acciones de anulación ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-orange-200 bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-orange-200 bg-orange-50">
          <h3 className="text-sm font-semibold text-orange-800">Permisos de anulación</h3>
          <p className="text-xs text-orange-600 mt-0.5">
            Acciones sensibles que requieren habilitación explícita. Desactivadas por defecto.
          </p>
        </div>

        <div className="divide-y divide-border">
          {acciones.map((item) => {
            const meta = ACCIONES_META[item.key];
            return (
              <label
                key={item.key}
                className={cn(
                  'flex items-center gap-4 px-5 py-3.5 cursor-pointer transition-colors',
                  item.habilitado
                    ? 'hover:bg-orange-50'
                    : 'hover:bg-muted/50 opacity-60'
                )}
              >
                <div className={cn(
                  'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                  item.habilitado
                    ? 'bg-orange-500 border-orange-500'
                    : 'border-border bg-background'
                )}>
                  {item.habilitado && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={item.habilitado}
                  onChange={() => toggleAccion(item.key)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{meta?.label ?? item.key}</p>
                  <p className="text-xs text-muted-foreground">{meta?.descripcion}</p>
                </div>
                {item.habilitado
                  ? <Shield className="w-4 h-4 text-orange-500 shrink-0" />
                  : <ShieldOff className="w-4 h-4 text-muted-foreground shrink-0" />
                }
              </label>
            );
          })}
        </div>
      </div>

      {/* ── Botón guardar ─────────────────────────────────────────────────── */}
      <div className="flex justify-end">
        <button
          onClick={handleGuardar}
          disabled={!dirty || guardando}
          className={cn(
            'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all',
            dirty && !guardando
              ? 'bg-primary text-white hover:bg-primary/90 shadow-sm'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          )}
        >
          <Save className="w-4 h-4" />
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

    </div>
  );
}
