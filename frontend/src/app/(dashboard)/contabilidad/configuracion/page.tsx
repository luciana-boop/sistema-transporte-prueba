'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { contabilidadApi } from '@/services/api';
import { getErrorMessage } from '@/lib/utils';
import { PageHeader, Button, Select } from '@/components/shared';
import type { CuentaContable } from '@/types';

const CLAVES_CONFIG = [
  { clave: 'CAJA_PRINCIPAL',       label: 'Caja y Bancos',           desc: 'Cuenta de caja/efectivo (Activo)',                    tipo: 'ACTIVO'  },
  { clave: 'CUENTAS_POR_COBRAR',   label: 'Cuentas por Cobrar',      desc: 'Clientes pendientes de pago (Activo)',                tipo: 'ACTIVO'  },
  { clave: 'ANTICIPO_CONDUCTORES', label: 'Anticipos a Conductores', desc: 'Anticipos entregados a conductores (Activo)',         tipo: 'ACTIVO'  },
  { clave: 'IGV_POR_PAGAR',        label: 'IGV por Pagar',           desc: 'IGV recaudado pendiente de pago (Pasivo)',            tipo: 'PASIVO'  },
  { clave: 'CUENTAS_POR_PAGAR',    label: 'Cuentas por Pagar',       desc: 'Facturas y obligaciones pendientes de pago (Pasivo)', tipo: 'PASIVO'  },
  { clave: 'INGRESO_FLETE',        label: 'Ingresos por Flete',      desc: 'Ingresos por servicios de transporte (Ingreso)',      tipo: 'INGRESO' },
  { clave: 'GASTO_VIATICOS',       label: 'Viáticos',                desc: 'Gastos de viáticos y alimentación (Gasto)',           tipo: 'GASTO'   },
  { clave: 'GASTO_COMBUSTIBLE',    label: 'Combustible',             desc: 'Gastos de combustible (Gasto)',                       tipo: 'GASTO'   },
  { clave: 'GASTO_MANTENIMIENTO',  label: 'Mantenimiento',           desc: 'Mantenimiento y reparación de vehículos (Gasto)',     tipo: 'GASTO'   },
  { clave: 'GASTO_PEAJES',         label: 'Peajes y Balanzas',       desc: 'Peajes y pesajes (Gasto)',                            tipo: 'GASTO'   },
  { clave: 'GASTO_OTROS',          label: 'Otros Gastos',            desc: 'Gastos operativos no clasificados (Gasto)',           tipo: 'GASTO'   },
];

export default function ConfigContablePage() {
  const qc = useQueryClient();
  const [local, setLocal] = useState<Record<string, string>>({});

  const { data: config = [], isLoading: loadingConfig } = useQuery({
    queryKey: ['config-contable'],
    queryFn: () => contabilidadApi.config.listar().then((r) => r.data.data),
  });

  useEffect(() => {
    if (config.length > 0) {
      const map: Record<string, string> = {};
      (config as any[]).forEach((c: any) => { map[c.clave] = c.cuentaId; });
      setLocal(map);
    }
  }, [config]);

  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-flat'],
    queryFn: () => contabilidadApi.cuentas.listar().then((r) => r.data.data),
  });

  const setMutation = useMutation({
    mutationFn: ({ clave, cuentaId }: { clave: string; cuentaId: string }) =>
      contabilidadApi.config.set(clave, cuentaId),
    onSuccess: () => { toast.success('Configuración guardada'); qc.invalidateQueries({ queryKey: ['config-contable'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const removeMutation = useMutation({
    mutationFn: (clave: string) => contabilidadApi.config.eliminar(clave),
    onSuccess: () => { toast.success('Configuración eliminada'); qc.invalidateQueries({ queryKey: ['config-contable'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const syncMutation = useMutation({
    mutationFn: () => contabilidadApi.sync(),
    onSuccess: (res) => {
      const n = res.data.data?.creados ?? 0;
      toast.success(`Sincronización completa — ${n} asiento${n !== 1 ? 's' : ''} creado${n !== 1 ? 's' : ''}`);
      qc.invalidateQueries({ queryKey: ['asientos'] });
      qc.invalidateQueries({ queryKey: ['balance-comprobacion'] });
      qc.invalidateQueries({ queryKey: ['estado-resultados'] });
      qc.invalidateQueries({ queryKey: ['balance-general'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cuentasPorTipo = (tipo: string) =>
    (cuentas as CuentaContable[]).filter((c) => c.tipo === tipo && c.activa);

  return (
    <div className="page-container">
      <PageHeader
        title="Configuración Contable"
        description="Mapeo de cuentas para asientos automáticos"
        action={
          <Button
            variant="secondary"
            onClick={() => { if (confirm('Esto generará asientos contables para todos los registros históricos (gastos, facturas, liquidaciones) que aún no los tengan. ¿Continuar?')) syncMutation.mutate(); }}
            disabled={syncMutation.isPending}
          >
            {syncMutation.isPending ? 'Sincronizando...' : 'Sincronizar histórico'}
          </Button>
        }
      />

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 max-w-2xl">
        Cuando se registren pagos o cierres de liquidaciones, el sistema usará estas cuentas para generar asientos automáticos de doble entrada.
      </div>

      {loadingConfig ? <p className="text-sm text-muted-foreground">Cargando...</p> : (
        <div className="flex flex-col gap-4 max-w-2xl">
          {CLAVES_CONFIG.map(({ clave, label, desc, tipo }) => {
            const currentCuentaId = local[clave] ?? '';
            return (
              <div key={clave} className="rounded-xl border border-border p-4 flex flex-col gap-3">
                <div>
                  <p className="text-sm font-semibold">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    className="flex-1"
                    value={currentCuentaId}
                    onChange={(e) => setLocal((prev) => ({ ...prev, [clave]: e.target.value }))}
                  >
                    <option value="">Sin asignar</option>
                    {cuentasPorTipo(tipo).map((c) => (
                      <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
                    ))}
                    {/* también mostrar todas si no hay del tipo */}
                    {cuentasPorTipo(tipo).length === 0 && (cuentas as CuentaContable[]).filter((c) => c.activa).map((c) => (
                      <option key={c.id} value={c.id}>{c.codigo} — {c.nombre} ({c.tipo})</option>
                    ))}
                  </Select>
                  <Button
                    size="sm"
                    disabled={!currentCuentaId || setMutation.isPending}
                    onClick={() => setMutation.mutate({ clave, cuentaId: currentCuentaId })}
                  >
                    Guardar
                  </Button>
                  {currentCuentaId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => { removeMutation.mutate(clave); setLocal((p) => { const n = { ...p }; delete n[clave]; return n; }); }}
                    >
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
