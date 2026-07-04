// FILE: src/app/(dashboard)/cobranza/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Unlink } from 'lucide-react';
import { cobranzaApi } from '@/services/api';
import {
  PageHeader, Button, Table, Th, Td, Tr,
  Modal, FormField, Input, StatCard,
  TableSkeleton, EmptyState,
} from '@/components/shared';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { MovimientoCobranza } from '@/types';

type Tab = 'por_aplicar' | 'aplicado';

export default function CobranzaPage() {
  const { usuario } = useAuthStore();
  const queryClient = useQueryClient();
  const esAdmin = usuario?.rol === 'ADMIN';

  const [tab, setTab] = useState<Tab>('por_aplicar');
  const [aplicandoPago, setAplicandoPago] = useState<MovimientoCobranza | null>(null);
  const [montos, setMontos] = useState<Record<number, string>>({});

  const { data: pagos, isLoading } = useQuery({
    queryKey: ['cobranza', tab],
    queryFn: () => cobranzaApi.listar({ estado: tab }).then((r) => r.data.data),
  });

  const inv = () => queryClient.invalidateQueries({ queryKey: ['cobranza'] });

  const { data: facturasCliente = [] } = useQuery({
    queryKey: ['cobranza', 'facturas-pendientes', aplicandoPago?.cliente.id],
    queryFn: () => cobranzaApi.facturasPendientes(aplicandoPago!.cliente.id).then((r) => r.data.data),
    enabled: !!aplicandoPago,
  });

  const saldoPorAplicar = (p: MovimientoCobranza) => {
    const aplicado = (p.aplicaciones ?? []).reduce((s, a) => s + Number(a.monto), 0);
    return Number(p.monto) - aplicado;
  };

  const cerrarAplicar = () => { setAplicandoPago(null); setMontos({}); };

  const totalAAplicar = useMemo(
    () => Object.values(montos).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [montos],
  );

  const aplicarMutation = useMutation({
    mutationFn: () => cobranzaApi.aplicar(aplicandoPago!.id, {
      aplicaciones: Object.entries(montos)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([facturaId, v]) => ({ facturaId: parseInt(facturaId), monto: parseFloat(v) })),
    }),
    onSuccess: () => { toast.success('Pago aplicado correctamente'); cerrarAplicar(); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const quitarMutation = useMutation({
    mutationFn: (aplicacionId: number) => cobranzaApi.quitarAplicacion(aplicacionId),
    onSuccess: () => { toast.success('Aplicación quitada'); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const totalPorAplicar = tab === 'por_aplicar'
    ? (pagos ?? []).reduce((s, p) => s + saldoPorAplicar(p), 0)
    : 0;

  return (
    <div className="page-container">
      <PageHeader
        title="Cobranza"
        description="Aplica los pagos de clientes (categoría Pago de factura) a una o más facturas"
      />

      <div className="flex gap-1 border-b border-border">
        {(['por_aplicar', 'aplicado'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'por_aplicar' ? 'Pagos por aplicar' : 'Pagos aplicados'}
          </button>
        ))}
      </div>

      {tab === 'por_aplicar' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Pagos pendientes de aplicar" value={String(pagos?.length ?? 0)} />
          <StatCard label="Monto total sin aplicar" value={formatCurrency(totalPorAplicar)} color="yellow" />
        </div>
      )}

      {isLoading ? <TableSkeleton rows={6} cols={5} /> : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th className="text-right">Monto del pago</Th>
              {tab === 'por_aplicar' ? <Th className="text-right">Saldo por aplicar</Th> : <Th>Facturas aplicadas</Th>}
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {(pagos ?? []).length ? pagos!.map((p) => (
              <Tr key={p.id}>
                <Td><span className="text-sm">{formatDate(p.fechaPago)}</span></Td>
                <Td><span className="text-sm font-medium">{p.cliente.razonSocial}</span></Td>
                <Td className="text-right"><span className="font-semibold text-emerald-500">{formatCurrency(Number(p.monto))}</span></Td>
                {tab === 'por_aplicar' ? (
                  <Td className="text-right"><span className="font-semibold text-amber-500">{formatCurrency(saldoPorAplicar(p))}</span></Td>
                ) : (
                  <Td>
                    <div className="flex flex-col gap-1">
                      {p.aplicaciones.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{a.factura.numeroFactura} — {formatCurrency(Number(a.monto))}</span>
                          {esAdmin && (
                            <button
                              onClick={() => { if (confirm('¿Quitar esta aplicación? La factura volverá a tener saldo pendiente.')) quitarMutation.mutate(a.id); }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </Td>
                )}
                <Td className="text-right">
                  {tab === 'por_aplicar' && (
                    <Button size="sm" onClick={() => setAplicandoPago(p)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar a facturas
                    </Button>
                  )}
                </Td>
              </Tr>
            )) : <tr><td colSpan={5}><EmptyState message={tab === 'por_aplicar' ? 'Sin pagos pendientes de aplicar' : 'Sin pagos aplicados'} /></td></tr>}
          </tbody>
        </Table>
      )}

      {/* Modal: Aplicar pago a facturas */}
      <Modal open={!!aplicandoPago} onClose={cerrarAplicar} title="Aplicar pago a facturas" maxWidth="max-w-2xl">
        {aplicandoPago && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">Cliente: <span className="font-medium text-foreground">{aplicandoPago.cliente.razonSocial}</span></p>
              <p className="text-muted-foreground">Saldo por aplicar: <span className="font-semibold text-amber-500">{formatCurrency(saldoPorAplicar(aplicandoPago))}</span></p>
            </div>

            {facturasCliente.length === 0 ? (
              <EmptyState message="Este cliente no tiene facturas con saldo pendiente" />
            ) : (
              <div className="flex flex-col gap-2">
                {facturasCliente.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 border border-border rounded-lg p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{f.numeroFactura}</p>
                      <p className="text-xs text-muted-foreground">Saldo pendiente: {formatCurrency(f.saldoPendiente)}{f.vencida ? ' — vencida' : ''}</p>
                    </div>
                    <FormField label="">
                      <Input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        className="w-32"
                        value={montos[f.id] ?? ''}
                        onChange={(e) => setMontos((p) => ({ ...p, [f.id]: e.target.value }))}
                      />
                    </FormField>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Total a aplicar: <span className="font-semibold text-foreground">{formatCurrency(totalAAplicar)}</span></span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={cerrarAplicar}>Cancelar</Button>
                <Button
                  loading={aplicarMutation.isPending}
                  disabled={totalAAplicar <= 0 || totalAAplicar > saldoPorAplicar(aplicandoPago) + 0.01}
                  onClick={() => aplicarMutation.mutate()}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
