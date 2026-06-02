// FILE: src/app/(dashboard)/cobranza/page.tsx
// MODIFICADO: flujo cliente→factura filtrada, pagos parciales, estado PARCIAL
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Download } from 'lucide-react';
import { cobranzaApi, clientesApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage, METODO_PAGO_LABEL, ESTADO_FACTURA_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import type { MetodoPago } from '@/types';
import * as XLSX from 'xlsx';

const schema = z.object({
  clienteId: z.string().min(1, 'Selecciona un cliente'),
  facturaId: z.string().min(1, 'Selecciona una factura'),
  monto: z.string().min(1, 'Monto requerido'),
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE']),
  referencia: z.string().optional(),
  observaciones: z.string().optional(),
  fechaPago: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function CobranzaPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'pagos' | 'cpc'>('pagos');
  const [showForm, setShowForm] = useState(false);
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<any>(null);

  const { data: pagos = [], isLoading: loadPagos } = useQuery({
    queryKey: ['pagos'],
    queryFn: () => cobranzaApi.listar().then((r) => r.data.data),
  });

  const { data: cpc = [], isLoading: loadCpc } = useQuery({
    queryKey: ['cuentas-por-cobrar'],
    queryFn: () => cobranzaApi.cuentasPorCobrar().then((r) => r.data.data),
    enabled: tab === 'cpc',
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => clientesApi.listar({ activo: true }).then((r) => r.data.data),
  });

  const { data: facturasPendientes = [] } = useQuery({
    queryKey: ['facturas-pendientes-cliente', clienteSeleccionado],
    queryFn: () =>
      clienteSeleccionado
        ? cobranzaApi.facturasPorCliente(parseInt(clienteSeleccionado)).then((r) => r.data.data)
        : Promise.resolve([]),
    enabled: !!clienteSeleccionado,
  });

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { metodoPago: 'EFECTIVO' },
  });

  const watchCliente = watch('clienteId');
  const watchFactura = watch('facturaId');

  useEffect(() => {
    setClienteSeleccionado(watchCliente || '');
    setValue('facturaId', '');
    setFacturaSeleccionada(null);
  }, [watchCliente, setValue]);

  useEffect(() => {
    if (watchFactura && facturasPendientes.length > 0) {
      const f = facturasPendientes.find((fp: any) => String(fp.id) === watchFactura);
      setFacturaSeleccionada(f ?? null);
      if (f) setValue('monto', String(f.saldoPendiente.toFixed(2)));
    }
  }, [watchFactura, facturasPendientes, setValue]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pagos'] });
    qc.invalidateQueries({ queryKey: ['facturas'] });
    qc.invalidateQueries({ queryKey: ['cuentas-por-cobrar'] });
    qc.invalidateQueries({ queryKey: ['facturas-pendientes-cliente'] });
  };

  const createMutation = useMutation({
    mutationFn: (d: FormData) => cobranzaApi.registrarPago({
      facturaId: parseInt(d.facturaId),
      monto: parseFloat(d.monto),
      metodoPago: d.metodoPago as MetodoPago,
      referencia: d.referencia,
      observaciones: d.observaciones,
      fechaPago: d.fechaPago,
    }),
    onSuccess: () => {
      toast.success('Pago registrado');
      setShowForm(false);
      reset();
      setClienteSeleccionado('');
      setFacturaSeleccionada(null);
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const exportExcel = () => {
    const rows = pagos.map((p) => ({
      '#': p.id, Factura: p.factura?.numeroFactura, Cliente: p.cliente?.razonSocial,
      'Monto S/': Number(p.monto), Método: METODO_PAGO_LABEL[p.metodoPago] ?? p.metodoPago,
      Referencia: p.referencia ?? '', Fecha: formatDate(p.fechaPago),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cobranza');
    XLSX.writeFile(wb, `cobranza_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const totalCobrado = pagos.reduce((s, p) => s + Number(p.monto), 0);
  const totalVencido = cpc.filter((c) => c.vencida).reduce((s, c) => s + c.saldoPendiente, 0);

  return (
    <div className="page-container">
      <PageHeader
        title="Cobranza"
        description="Gestión de pagos y cuentas por cobrar"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}>
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button onClick={() => { setShowForm(true); reset(); setClienteSeleccionado(''); setFacturaSeleccionada(null); }}>
              <Plus className="w-4 h-4" /> Registrar pago
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total cobrado" value={formatCurrency(totalCobrado)} color="green" />
        <StatCard label="Total vencido" value={formatCurrency(totalVencido)} color="red" />
        <StatCard label="Pendientes de cobro" value={cpc.length} color="yellow" />
      </div>

      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {[{ id: 'pagos', label: 'Pagos registrados' }, { id: 'cpc', label: 'Cuentas por cobrar' }].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'pagos' | 'cpc')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pagos' ? (
        loadPagos ? <TableSkeleton rows={6} cols={6} /> : (
          <Table>
            <thead>
              <tr><Th>#</Th><Th>Factura</Th><Th>Cliente</Th><Th>Monto</Th><Th>Método</Th><Th>Fecha</Th></tr>
            </thead>
            <tbody>
              {pagos.length > 0 ? pagos.map((p) => (
                <Tr key={p.id}>
                  <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                  <Td><span className="font-mono text-xs">{p.factura?.numeroFactura}</span></Td>
                  <Td><span className="text-sm font-medium">{p.cliente?.razonSocial}</span></Td>
                  <Td><span className="font-semibold text-emerald-500">{formatCurrency(Number(p.monto))}</span></Td>
                  <Td><Badge value={p.metodoPago} label={METODO_PAGO_LABEL[p.metodoPago]} /></Td>
                  <Td><span className="text-xs text-muted-foreground">{formatDate(p.fechaPago)}</span></Td>
                </Tr>
              )) : <tr><td colSpan={6}><EmptyState message="No hay pagos registrados" /></td></tr>}
            </tbody>
          </Table>
        )
      ) : (
        loadCpc ? <TableSkeleton rows={5} cols={7} /> : (
          <Table>
            <thead>
              <tr><Th>Factura</Th><Th>Cliente</Th><Th>Total</Th><Th>Pagado</Th><Th>Saldo</Th><Th>Vencimiento</Th><Th>Estado</Th></tr>
            </thead>
            <tbody>
              {cpc.length > 0 ? cpc.map((c) => (
                <Tr key={c.facturaId}>
                  <Td><span className="font-mono text-xs">{c.numeroFactura}</span></Td>
                  <Td><span className="text-sm font-medium">{c.cliente?.razonSocial}</span></Td>
                  <Td><span className="text-sm">{formatCurrency(c.total)}</span></Td>
                  <Td><span className="text-sm text-emerald-500">{formatCurrency(c.pagado)}</span></Td>
                  <Td><span className="font-semibold text-primary">{formatCurrency(c.saldoPendiente)}</span></Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      {c.vencida && <AlertTriangle className="w-3 h-3 text-destructive" />}
                      <span className={`text-xs ${c.vencida ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                        {formatDate(c.fechaVencimiento)}{c.vencida ? ` (+${c.diasVencida}d)` : ''}
                      </span>
                    </div>
                  </Td>
                  <Td><Badge value={c.estado} label={ESTADO_FACTURA_LABEL[c.estado] ?? c.estado} /></Td>
                </Tr>
              )) : <tr><td colSpan={7}><EmptyState message="No hay cuentas por cobrar" /></td></tr>}
            </tbody>
          </Table>
        )
      )}

      {/* Pago Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); reset(); setClienteSeleccionado(''); setFacturaSeleccionada(null); }} title="Registrar pago" maxWidth="max-w-lg">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          {/* Step 1: Select client */}
          <FormField label="1. Seleccionar cliente" required error={errors.clienteId?.message}>
            <Select {...register('clienteId')}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.razonSocial} — {c.ruc}</option>
              ))}
            </Select>
          </FormField>

          {/* Step 2: Select invoice filtered by client */}
          <FormField label="2. Seleccionar factura con saldo pendiente" required error={errors.facturaId?.message}>
            <Select {...register('facturaId')} disabled={!clienteSeleccionado || facturasPendientes.length === 0}>
              <option value="">
                {!clienteSeleccionado
                  ? 'Primero selecciona un cliente'
                  : facturasPendientes.length === 0
                  ? 'Sin facturas pendientes para este cliente'
                  : 'Seleccionar factura...'}
              </option>
              {facturasPendientes.map((f: any) => (
                <option key={f.id} value={f.id}>
                  {f.numeroFactura} — Saldo: {formatCurrency(f.saldoPendiente)} ({f.vencida ? '⚠ VENCIDA' : 'Vigente'})
                </option>
              ))}
            </Select>
          </FormField>

          {/* Factura detail preview */}
          {facturaSeleccionada && (
            <div className="bg-muted/40 rounded-lg p-3 grid grid-cols-3 gap-2 text-center text-sm border border-border">
              <div><p className="text-xs text-muted-foreground">Total factura</p><p className="font-medium">{formatCurrency(facturaSeleccionada.total)}</p></div>
              <div><p className="text-xs text-muted-foreground">Ya pagado</p><p className="font-medium text-emerald-500">{formatCurrency(facturaSeleccionada.pagado)}</p></div>
              <div><p className="text-xs text-muted-foreground">Saldo pendiente</p><p className="font-bold text-primary">{formatCurrency(facturaSeleccionada.saldoPendiente)}</p></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Monto a pagar (S/)" required error={errors.monto?.message}>
              <Input type="number" step="0.01" placeholder="0.00" {...register('monto')} disabled={!facturaSeleccionada} />
            </FormField>
            <FormField label="Método de pago" required error={errors.metodoPago?.message}>
              <Select {...register('metodoPago')}>
                {Object.entries(METODO_PAGO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Referencia"><Input placeholder="N° transferencia..." {...register('referencia')} /></FormField>
            <FormField label="Fecha de pago"><Input type="date" {...register('fechaPago')} /></FormField>
          </div>
          <FormField label="Observaciones"><Textarea placeholder="Notas..." {...register('observaciones')} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); reset(); setClienteSeleccionado(''); setFacturaSeleccionada(null); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending} disabled={!facturaSeleccionada}>
              Registrar pago
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
