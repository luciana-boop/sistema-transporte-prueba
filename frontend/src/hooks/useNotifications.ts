// FILE: src/hooks/useNotifications.ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { vehiculosApi, conductoresApi, cobranzaApi, configuracionApi, usuariosApi } from '@/services/api';
import { useAuthStore } from '@/store/auth.store';
import { obtenerOcultos, registrarVistos, marcarLeida, marcarTodasLeidas, posponer } from '@/lib/notificationsStorage';

export interface Notification {
  id: string;
  type: 'warning' | 'danger' | 'info';
  category: 'soat' | 'licencia' | 'revision' | 'cobranza' | 'mantenimiento' | 'seguridad';
  title: string;
  message: string;
}

function diasHasta(fechaStr: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function esReciente(fechaHoraStr: string, horas = 24): boolean {
  const transcurridas = (Date.now() - new Date(fechaHoraStr).getTime()) / (1000 * 60 * 60);
  return transcurridas <= horas;
}

export function useNotifications() {
  // ── NUEVO: queries solo se ejecutan cuando auth está confirmada ──
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const _hasHydrated    = useAuthStore((s) => s._hasHydrated);
  const usuario         = useAuthStore((s) => s.usuario);
  const canFetch = _hasHydrated && isAuthenticated;
  const esAdmin = usuario?.rol === 'ADMIN';
  // ────────────────────────────────────────────────────────────────

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos'],
    queryFn: () => vehiculosApi.listar({ limit: 100 }).then((r) => r.data.data.items).catch(() => []),
    staleTime: 5 * 60 * 1000,
    enabled: canFetch, // ← NUEVO
  });

  const { data: conductores = [] } = useQuery({
    queryKey: ['conductores'],
    queryFn: () => conductoresApi.listar({ limit: 100 }).then((r) => r.data.data.items).catch(() => []),
    staleTime: 5 * 60 * 1000,
    enabled: canFetch, // ← NUEVO
  });

  // Trae directamente las facturas con saldo pendiente (sin límite de página fijo,
  // así no se pierden facturas vencidas si hay más de 100 activas).
  const { data: facturasPendientes = [] } = useQuery({
    queryKey: ['facturas-pendientes-notif'],
    queryFn: () => cobranzaApi.facturasPendientesTodas().then((r) => r.data.data).catch(() => []),
    staleTime: 5 * 60 * 1000,
    enabled: canFetch, // ← NUEVO
  });

  const { data: alertasConfig = [] } = useQuery({
    queryKey: ['config', 'alertas'],
    queryFn: () => configuracionApi.getAlertas().then((r) => r.data.data).catch(() => []),
    staleTime: 10 * 60 * 1000,
    enabled: canFetch, // ← NUEVO
  });

  // Solo ADMIN ve intentos de acceso fuera de horario (secretarios no reciben esta notificación).
  const { data: intentosFueraHorario = [] } = useQuery({
    queryKey: ['usuarios', 'intentos-fuera-horario'],
    queryFn: () => usuariosApi.intentosFueraHorario().then((r) => r.data.data).catch(() => []),
    staleTime: 2 * 60 * 1000,
    enabled: canFetch && esAdmin,
  });

  const alertaMap = useMemo(() => {
    const map: Record<string, { dias: number; activo: boolean; nivel: string }> = {
      soat_vencimiento:      { dias: 30, activo: true, nivel: 'warning' },
      revision_vencimiento:  { dias: 30, activo: true, nivel: 'warning' },
      licencia_vencimiento:  { dias: 30, activo: true, nivel: 'warning' },
      factura_vencida:       { dias: 0,  activo: true, nivel: 'danger'  },
      mantenimiento_proximo: { dias: 15, activo: true, nivel: 'info'    },
    };
    for (const a of alertasConfig) {
      map[a.clave] = { dias: a.diasAnticipacion, activo: a.activo, nivel: a.nivel };
    }
    return map;
  }, [alertasConfig]);

  const itemsCrudos = useMemo<Notification[]>(() => {
    const items: Notification[] = [];
    const cfg = (clave: string) => alertaMap[clave] ?? { dias: 30, activo: true, nivel: 'warning' };

    const cfgSoat = cfg('soat_vencimiento');
    if (cfgSoat.activo) {
      vehiculos.forEach((v: any) => {
        if (v.vencimientoSoat) {
          const dias = diasHasta(v.vencimientoSoat);
          if (dias <= cfgSoat.dias) {
            items.push({
              id: `soat-${v.id}`,
              type: dias <= 0 ? 'danger' : (cfgSoat.nivel as any),
              category: 'soat',
              title: `SOAT ${dias <= 0 ? 'vencido' : 'por vencer'}`,
              message: `Vehículo ${v.placa}: ${dias <= 0 ? `vencido hace ${Math.abs(dias)}d` : `vence en ${dias}d`}`,
            });
          }
        }
      });
    }

    const cfgRev = cfg('revision_vencimiento');
    if (cfgRev.activo) {
      vehiculos.forEach((v: any) => {
        if (v.vencimientoRevision) {
          const dias = diasHasta(v.vencimientoRevision);
          if (dias <= cfgRev.dias) {
            items.push({
              id: `rev-${v.id}`,
              type: dias <= 0 ? 'danger' : (cfgRev.nivel as any),
              category: 'revision',
              title: `Rev. técnica ${dias <= 0 ? 'vencida' : 'por vencer'}`,
              message: `Vehículo ${v.placa}: ${dias <= 0 ? `vencida hace ${Math.abs(dias)}d` : `vence en ${dias}d`}`,
            });
          }
        }
      });
    }

    const cfgMant = cfg('mantenimiento_proximo');
    if (cfgMant.activo) {
      vehiculos.forEach((v: any) => {
        if (v.proximoMantenimiento) {
          const dias = diasHasta(v.proximoMantenimiento);
          if (dias >= 0 && dias <= cfgMant.dias) {
            items.push({
              id: `mant-${v.id}`,
              type: cfgMant.nivel as any,
              category: 'mantenimiento',
              title: 'Mantenimiento próximo',
              message: `Vehículo ${v.placa}: mantenimiento en ${dias}d`,
            });
          }
        }
      });
    }

    const cfgLic = cfg('licencia_vencimiento');
    if (cfgLic.activo) {
      conductores.forEach((c: any) => {
        if (c.vencimientoLicencia) {
          const dias = diasHasta(c.vencimientoLicencia);
          if (dias <= cfgLic.dias) {
            items.push({
              id: `lic-${c.id}`,
              type: dias <= 0 ? 'danger' : (cfgLic.nivel as any),
              category: 'licencia',
              title: `Licencia ${dias <= 0 ? 'vencida' : 'por vencer'}`,
              message: `${c.nombre}: ${dias <= 0 ? `vencida hace ${Math.abs(dias)}d` : `vence en ${dias}d`}`,
            });
          }
        }
      });
    }

    const cfgFac = cfg('factura_vencida');
    if (cfgFac.activo) {
      // facturasPendientes ya viene filtrada a estado EMITIDA/PENDIENTE/PARCIAL
      // con saldo pendiente > 0 (ver cobranzaApi.facturasPendientesTodas), y
      // cada factura trae su propio flag `vencida` calculado en el backend.
      const vencidas = facturasPendientes.filter((f: any) => f.vencida);
      if (vencidas.length > 0) {
        items.push({
          id: 'facturas-vencidas',
          type: cfgFac.nivel as any,
          category: 'cobranza',
          title: 'Facturas vencidas',
          message: `${vencidas.length} factura${vencidas.length > 1 ? 's' : ''} con saldo pendiente y vencidas`,
        });
      }
    }

    if (esAdmin) {
      const recientes = intentosFueraHorario.filter((i: any) => esReciente(i.fechaHora));
      if (recientes.length > 0) {
        const nombres = Array.from(new Set(recientes.map((i: any) => i.usuario?.nombre).filter(Boolean)));
        items.push({
          id: 'intentos-fuera-horario',
          type: 'danger',
          category: 'seguridad',
          title: `${recientes.length} intento${recientes.length > 1 ? 's' : ''} de acceso fuera de horario`,
          message: `Últimas 24h: ${nombres.join(', ')}`,
        });
      }
    }

    return items;
  }, [vehiculos, conductores, facturasPendientes, alertaMap, intentosFueraHorario, esAdmin]);

  const usuarioId = usuario?.id;

  // ── Estado local (por usuario): oculta leídas/pospuestas y ordena "nuevas arriba" ──
  const [version, setVersion] = useState(0);

  const notifications = useMemo(() => {
    if (!usuarioId) return [];
    const ocultos = obtenerOcultos(usuarioId);
    const visibles = itemsCrudos.filter((n) => !ocultos.has(n.id));
    const vistos = registrarVistos(usuarioId, visibles.map((n) => n.id));
    return [...visibles].sort((a, b) => (vistos[b.id] ?? 0) - (vistos[a.id] ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsCrudos, usuarioId, version]);

  const leer = (id: string) => {
    if (!usuarioId) return;
    marcarLeida(usuarioId, id);
    setVersion((v) => v + 1);
  };

  const leerTodas = () => {
    if (!usuarioId) return;
    marcarTodasLeidas(usuarioId, notifications.map((n) => n.id));
    setVersion((v) => v + 1);
  };

  const posponerNotificacion = (id: string) => {
    if (!usuarioId) return;
    posponer(usuarioId, id);
    setVersion((v) => v + 1);
  };

  return {
    notifications,
    unreadCount: notifications.length,
    marcarLeida: leer,
    marcarTodasLeidas: leerTodas,
    posponer: posponerNotificacion,
  };
}
