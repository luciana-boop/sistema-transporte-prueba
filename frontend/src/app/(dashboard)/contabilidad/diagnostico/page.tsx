'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw } from 'lucide-react';
import { contabilidadApi } from '@/services/api';
import { formatCurrency, getErrorMessage } from '@/lib/utils';
import { PageHeader, Button, Select } from '@/components/shared';
import type { CuentaContable, DiagnosticoCategoriaSinMapeo, EstadoDiagnostico } from '@/types';

const ESTADO_CFG: Record<EstadoDiagnostico, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  VERDE:    { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', label: 'Todo en orden' },
  AMARILLO: { icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400',    bg: 'bg-amber-500/10 border-amber-500/30',     label: 'Atención' },
  ROJO:     { icon: XCircle,      color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-500/10 border-red-500/30',         label: 'Crítico' },
};

function Semaforo({ estado, size = 'md' }: { estado: EstadoDiagnostico; size?: 'sm' | 'md' }) {
  const cfg = ESTADO_CFG[estado];
  const Icon = cfg.icon;
  return <Icon className={`${size === 'md' ? 'w-6 h-6' : 'w-4 h-4'} ${cfg.color} shrink-0`} />;
}

function SeccionCard({ estado, titulo, resumen, children }: { estado: EstadoDiagnostico; titulo: string; resumen: string; children?: React.ReactNode }) {
  const cfg = ESTADO_CFG[estado];
  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${cfg.bg}`}>
      <div className="flex items-start gap-3">
        <Semaforo estado={estado} />
        <div className="flex-1">
          <p className="font-semibold text-sm">{titulo}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{resumen}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function AsignarMapeoRow({ categoria, cuentas }: { categoria: DiagnosticoCategoriaSinMapeo; cuentas: CuentaContable[] }) {
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [cuentaId, setCuentaId] = useState('');

  const setMutation = useMutation({
    mutationFn: () => contabilidadApi.mapeos.set({
      modulo: categoria.modulo,
      categoriaSlug: categoria.categoriaSlug,
      categoriaNombre: categoria.categoriaNombre,
      cuentaContableId: cuentaId,
    }),
    onSuccess: () => {
      toast.success('Cuenta asignada');
      setEditando(false);
      setCuentaId('');
      qc.invalidateQueries({ queryKey: ['contabilidad-diagnostico'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="flex flex-col gap-2 text-xs bg-background/50 rounded-lg px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="flex-1">{categoria.mensaje}</span>
        {!editando && (
          <Button size="sm" variant="secondary" onClick={() => setEditando(true)}>
            Asignar cuenta
          </Button>
        )}
      </div>
      {editando && (
        <div className="flex items-center gap-2 pl-6">
          <Select className="flex-1" value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
            <option value="">Seleccionar cuenta...</option>
            {cuentas.filter((c) => c.activa).map((c) => (
              <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
            ))}
          </Select>
          <Button size="sm" disabled={!cuentaId || setMutation.isPending} onClick={() => setMutation.mutate()}>
            Guardar
          </Button>
          <Button size="sm" variant="secondary" onClick={() => { setEditando(false); setCuentaId(''); }}>
            Cancelar
          </Button>
        </div>
      )}
    </div>
  );
}

export default function DiagnosticoContablePage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['contabilidad-diagnostico'],
    queryFn: () => contabilidadApi.diagnostico().then((r) => r.data.data),
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-flat'],
    queryFn: () => contabilidadApi.cuentas.listar().then((r) => r.data.data),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="Diagnóstico Contable"
        description="Revisión de la salud de la contabilidad: configuración, asientos y saldos"
        action={
          <Button variant="secondary" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Revisando...' : 'Actualizar'}
          </Button>
        }
      />

      {isLoading && <p className="text-sm text-muted-foreground">Cargando diagnóstico...</p>}

      {data && (
        <div className="flex flex-col gap-4 max-w-4xl">
          {/* Estado general */}
          <div className={`rounded-xl border p-5 flex items-center gap-4 ${ESTADO_CFG[data.estado].bg}`}>
            <Semaforo estado={data.estado} />
            <div>
              <p className="font-semibold text-base">{ESTADO_CFG[data.estado].label}</p>
              <p className="text-xs text-muted-foreground">
                Generado el {new Date(data.generadoEn).toLocaleString('es-PE')}
              </p>
            </div>
          </div>

          {/* A. Configuración */}
          <SeccionCard {...data.secciones.configuracion}>
            <div className="flex flex-col gap-1.5">
              {data.secciones.configuracion.items.map((item) => (
                <div key={item.clave} className="flex items-start gap-2 text-xs bg-background/50 rounded-lg px-3 py-2">
                  <Semaforo estado={item.estado} size="sm" />
                  <span>{item.mensaje}</span>
                </div>
              ))}
            </div>
            {data.secciones.configuracion.categoriasSinMapeo.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold">Categorías sin cuenta contable asignada:</p>
                {data.secciones.configuracion.categoriasSinMapeo.map((categoria) => (
                  <AsignarMapeoRow key={`${categoria.modulo}:${categoria.categoriaSlug}`} categoria={categoria} cuentas={cuentas} />
                ))}
              </div>
            )}
          </SeccionCard>

          {/* B. Integridad de asientos */}
          <SeccionCard {...data.secciones.integridad}>
            {data.secciones.integridad.descuadrados.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold">Asientos descuadrados:</p>
                {data.secciones.integridad.descuadrados.map((d) => (
                  <div key={d.id} className="text-xs bg-background/50 rounded-lg px-3 py-2">
                    <p className="font-medium">#{d.numero} — {d.descripcion} {d.referencia ? `(${d.referencia})` : ''}</p>
                    <p className="text-muted-foreground">{d.mensaje}</p>
                  </div>
                ))}
              </div>
            )}
            {data.secciones.integridad.pendientes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold">Operaciones sin asiento:</p>
                {data.secciones.integridad.pendientes.map((p) => (
                  <div key={p.id} className="text-xs bg-background/50 rounded-lg px-3 py-2">
                    <p className="font-medium">{p.origenTipo} #{p.origenId}</p>
                    <p className="text-muted-foreground">{p.motivo}</p>
                  </div>
                ))}
              </div>
            )}
          </SeccionCard>

          {/* C. Saldos */}
          <SeccionCard {...data.secciones.saldos}>
            {data.secciones.saldos.cuentas.filter((c) => !c.esNormal).length > 0 && (
              <div className="flex flex-col gap-1.5">
                {data.secciones.saldos.cuentas.filter((c) => !c.esNormal).map((c) => (
                  <div key={c.cuentaId} className="text-xs bg-background/50 rounded-lg px-3 py-2">
                    <p className="font-medium">{c.codigo} — {c.nombre}: {formatCurrency(c.saldo)}</p>
                    <p className="text-muted-foreground">{c.mensaje}</p>
                  </div>
                ))}
              </div>
            )}
          </SeccionCard>

          {/* D. Resumen del período */}
          <SeccionCard {...data.secciones.resumen}>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-background/50 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground">Ingresos del mes</p>
                <p className="text-sm font-semibold">{formatCurrency(data.secciones.resumen.totalIngresos)}</p>
              </div>
              <div className="bg-background/50 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground">Gastos del mes</p>
                <p className="text-sm font-semibold">{formatCurrency(data.secciones.resumen.totalGastos)}</p>
              </div>
              <div className="bg-background/50 rounded-lg px-3 py-2">
                <p className="text-xs text-muted-foreground">Resultado</p>
                <p className="text-sm font-semibold">{formatCurrency(data.secciones.resumen.resultado)}</p>
              </div>
            </div>
          </SeccionCard>
        </div>
      )}
    </div>
  );
}
