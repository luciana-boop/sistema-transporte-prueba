// FILE: src/app/(dashboard)/cobranza/page.tsx
// MODIFICADO: flujo cliente→factura filtrada, pagos parciales, estado PARCIAL
// NUEVO: columna referencia, búsqueda libre, filtros de fecha, editar pago, anular pago
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, AlertTriangle, Download, Search, Edit2, XCircle, Eye } from 'lucide-react';
import { cobranzaApi, clientesApi, cuentasApi, fetchAllPages } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage, METODO_PAGO_LABEL, ESTADO_FACTURA_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
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
  // CHAT 9: obligatorios
  cuentaId: z.string().min(1, 'Debe seleccionar una cuenta de destino'),
  monedaId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const editSchema = z.object({
  metodoPago: z.enum(['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'CHEQUE']),
  referencia: z.string().optional(),
  observaciones: z.string().optional(),
  fechaPago: z.string().optional(),
});
type EditFormData = z.infer<typeof editSchema>;

export default function CobranzaPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const [tab, setTab] = useState<'pagos' | 'cpc'>('pagos');
  const [showForm, setShowForm] = useState(false);
  const [editingPago, setEditingPago] = useState<any>(null);
  const [clienteSeleccionado, setClienteSeleccionado] = useState('');
  const [facturaSeleccionada, setFacturaSeleccionada] = useState<any>(null);

  // Filtros y búsqueda — PROBLEMA 8: consistentes en ambas secciones (Desde/Hasta/Cliente/Estado + búsqueda)
  const [searchText, setSearchText] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroCliente, setFiltroCliente] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  // MEJORA 4 / P8: vista de detalle (una por sección, mismos campos)
  const [viewing, setViewing] = useState<any>(null);
  const [viewingCpc, setViewingCpc] = useState<any>(null);

  const [pagosPage, setPagosPage] = useState(1);
  const [cpcPage, setCpcPage] = useState(1);
  const pageLimit = 20;

  const cambiarTab = (t: 'pagos' | 'cpc') => {
    setTab(t);
    // El set de estados disponibles difiere entre secciones (CPC solo muestra deudas activas)
    setFiltroEstado('');
  };

  const limpiarFiltros = () => {
    setSearchText('');
    setFiltroDesde('');
    setFiltroHasta('');
    setFiltroCliente('');
    setFiltroEstado('');
    setPagosPage(1);
    setCpcPage(1);
  };
  const hayFiltrosActivos = !!(searchText || filtroDesde || filtroHasta || filtroCliente || filtroEstado);

  const { data: pagosRaw = [], isLoading: loadPagos } = useQuery({
    queryKey: ['pagos', filtroDesde, filtroHasta, filtroCliente, filtroEstado],
    queryFn: () => fetchAllPages((p) => cobranzaApi.listar({
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
      clienteId: filtroCliente ? parseInt(filtroCliente) : undefined,
      estado: (filtroEstado as any) || undefined,
      ...p,
    }).then((r) => r.data.data)),
  });

  // Búsqueda libre — mismo comportamiento en ambas secciones: cliente, factura (y referencia para pagos)
  const pagos = pagosRaw.filter((p) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      p.cliente?.razonSocial?.toLowerCase().includes(q) ||
      p.factura?.numeroFactura?.toLowerCase().includes(q) ||
      p.referencia?.toLowerCase().includes(q)
    );
  });
  const pagosTotalPages = Math.ceil(pagos.length / pageLimit);
  const pagosPagina = pagos.slice((pagosPage - 1) * pageLimit, pagosPage * pageLimit);

  const { data: cpcRaw = [], isLoading: loadCpc } = useQuery({
    queryKey: ['cuentas-por-cobrar', filtroDesde, filtroHasta, filtroCliente, filtroEstado],
    queryFn: () => fetchAllPages((p) => cobranzaApi.cuentasPorCobrar({
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
      clienteId: filtroCliente ? parseInt(filtroCliente) : undefined,
      estado: (filtroEstado as any) || undefined,
      ...p,
    }).then((r) => r.data.data)),
    enabled: tab === 'cpc',
  });

  const cpc = cpcRaw.filter((c) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      c.cliente?.razonSocial?.toLowerCase().includes(q) ||
      c.numeroFactura?.toLowerCase().includes(q)
    );
  });
  const cpcTotalPages = Math.ceil(cpc.length / pageLimit);
  const cpcPagina = cpc.slice((cpcPage - 1) * pageLimit, cpcPage * pageLimit);

  // P8: detalle enriquecido — el listado no incluye cuenta/moneda/movimiento generado
  const { data: detallePago, isLoading: loadDetallePago } = useQuery({
    queryKey: ['cobranza-pago-detalle', viewing?.id],
    queryFn: () => cobranzaApi.obtener(viewing!.id).then((r) => r.data.data),
    enabled: !!viewing,
  });

  const { data: detalleCpc, isLoading: loadDetalleCpc } = useQuery({
    queryKey: ['cobranza-cpc-detalle', viewingCpc?.facturaId],
    queryFn: () => cobranzaApi.detalleCuentaPorCobrar(viewingCpc!.facturaId).then((r) => r.data.data),
    enabled: !!viewingCpc,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => clientesApi.listar({ activo: true, limit: 100 }).then((r) => r.data.data.items),
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas', 'activas'],
    queryFn: () => cuentasApi.getCuentas({ activo: true }).then((r) => r.data.data),
  });

  const { data: facturasPendientes = [] } = useQuery({
    queryKey: ['facturas-pendientes-cliente', clienteSeleccionado],
    queryFn: () =>
      clienteSeleccionado
        ? cobranzaApi.facturasPorCliente(parseInt(clienteSeleccionado)).then((r) => r.data.data)
        : Promise.resolve([]),
    enabled: !!clienteSeleccionado,
  });

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { metodoPago: 'EFECTIVO' },
  });

  const { register: regEdit, handleSubmit: handleEdit, reset: resetEdit, setValue: setEditVal, formState: { errors: editErrors, isSubmitting: editSubmitting } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

  const watchCliente = watch('clienteId');
  const watchFactura = watch('facturaId');
  // FIX ERROR 1: observar cuentaId para autocompletar monedaId
  const watchedCuentaId = useWatch({ control, name: 'cuentaId' });

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

  // FIX ERROR 1: autocompletar monedaId cuando cambia la cuenta seleccionada
  useEffect(() => {
    if (!watchedCuentaId) return;
    const cuenta = (cuentas as any[]).find((c) => String(c.id) === watchedCuentaId);
    if (cuenta) {
      setValue('monedaId', String(cuenta.monedaId), { shouldValidate: false });
    }
  }, [watchedCuentaId, cuentas, setValue]);

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
      // CHAT 9: obligatorios
      cuentaId: parseInt(d.cuentaId),
      monedaId: d.monedaId ? parseInt(d.monedaId) : 1,
    }),
    onSuccess: () => {
      toast.success('Pago registrado');
      setShowForm(false);
      reset();
      setClienteSeleccionado('');
      setFacturaSeleccionada(null);
      invalidate();
      qc.invalidateQueries({ queryKey: ['cuentas'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: (d: EditFormData) => (cobranzaApi as any).actualizar(editingPago!.id, d),
    onSuccess: () => {
      toast.success('Pago actualizado');
      setEditingPago(null);
      resetEdit();
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const anularMutation = useMutation({
    mutationFn: ({ id, motivo }: { id: number; motivo?: string }) =>
      (cobranzaApi as any).anular(id, { motivo }),
    onSuccess: () => {
      toast.success('Pago anulado');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (p: any) => {
    setEditingPago(p);
    setEditVal('metodoPago', p.metodoPago);
    setEditVal('referencia', p.referencia ?? '');
    setEditVal('observaciones', p.observaciones ?? '');
    setEditVal('fechaPago', p.fechaPago ? new Date(p.fechaPago).toISOString().split('T')[0] : '');
  };

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

  const totalCobrado = pagosRaw.reduce((s, p) => s + Number(p.monto), 0);
  const totalVencido = cpcRaw.filter((c) => c.vencida).reduce((s, c) => s + c.saldoPendiente, 0);

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
        <StatCard label="Pendientes de cobro" value={cpcRaw.length} color="yellow" />
      </div>

      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit">
        {[{ id: 'pagos', label: 'Pagos registrados' }, { id: 'cpc', label: 'Cuentas por cobrar' }].map((t) => (
          <button
            key={t.id}
            onClick={() => cambiarTab(t.id as 'pagos' | 'cpc')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* P8: Filtros y búsqueda — mismo comportamiento en ambas secciones */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={tab === 'pagos' ? 'Buscar por cliente, factura o referencia…' : 'Buscar por cliente o factura…'}
            className="pl-9 w-72"
            value={searchText}
            onChange={(e) => { setSearchText(e.target.value); setPagosPage(1); setCpcPage(1); }}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" className="w-36" value={filtroDesde} onChange={(e) => { setFiltroDesde(e.target.value); setPagosPage(1); setCpcPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" className="w-36" value={filtroHasta} onChange={(e) => { setFiltroHasta(e.target.value); setPagosPage(1); setCpcPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Cliente</label>
          <Select className="w-48" value={filtroCliente} onChange={(e) => { setFiltroCliente(e.target.value); setPagosPage(1); setCpcPage(1); }}>
            <option value="">Todos</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Estado</label>
          <Select className="w-44" value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPagosPage(1); setCpcPage(1); }}>
            <option value="">Todos</option>
            {(tab === 'pagos'
              ? (Object.keys(ESTADO_FACTURA_LABEL) as Array<keyof typeof ESTADO_FACTURA_LABEL>)
              : (['EMITIDA', 'PENDIENTE', 'PARCIAL'] as Array<keyof typeof ESTADO_FACTURA_LABEL>)
            ).map((v) => <option key={v} value={v}>{ESTADO_FACTURA_LABEL[v]}</option>)}
          </Select>
        </div>
        {hayFiltrosActivos && (
          <button onClick={limpiarFiltros} className="text-xs text-muted-foreground hover:text-foreground underline">
            Limpiar filtros
          </button>
        )}
      </div>

      {tab === 'pagos' && (
        <>
          {loadPagos ? <TableSkeleton rows={6} cols={7} /> : (
            <Table>
              <thead>
                <tr>
                  <Th>#</Th><Th>Factura</Th><Th>Cliente</Th><Th>Monto</Th>
                  <Th>Método</Th><Th>Referencia</Th><Th>Fecha</Th>
                  {usuario?.rol === 'ADMIN' && <Th className="text-right">Acciones</Th>}
                </tr>
              </thead>
              <tbody>
                {pagosPagina.length > 0 ? pagosPagina.map((p) => (
                  <Tr key={p.id}>
                    <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                    <Td><span className="font-mono text-xs">{p.factura?.numeroFactura}</span></Td>
                    <Td><span className="text-sm font-medium">{p.cliente?.razonSocial}</span></Td>
                    <Td><span className="font-semibold text-emerald-500">{formatCurrency(Number(p.monto))}</span></Td>
                    <Td><Badge value={p.metodoPago} label={METODO_PAGO_LABEL[p.metodoPago]} /></Td>
                    <Td>
                      <span className="text-xs text-muted-foreground font-mono">
                        {p.referencia ?? '—'}
                      </span>
                    </Td>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(p.fechaPago)}</span></Td>
                    {usuario?.rol === 'ADMIN' && (
                      <Td>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewing(p)}
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                            title="Ver detalle"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const motivo = prompt('Motivo de anulación (opcional):') ?? undefined;
                              if (confirm('¿Anular este pago? La factura volverá al estado anterior.')) {
                                anularMutation.mutate({ id: p.id, motivo });
                              }
                            }}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                            title="Anular pago"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </Td>
                    )}
                  </Tr>
                )) : <tr><td colSpan={8}><EmptyState message="No hay pagos registrados" /></td></tr>}
              </tbody>
            </Table>
          )}
          {pagosTotalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={pagosPage <= 1} onClick={() => setPagosPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {pagosPage} de {pagosTotalPages}</span>
              <Button variant="secondary" size="sm" disabled={pagosPage >= pagosTotalPages} onClick={() => setPagosPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          )}
        </>
      )}

      {tab === 'cpc' && (
        loadCpc ? <TableSkeleton rows={5} cols={8} /> : (
          <>
          <Table>
            <thead>
              <tr>
                <Th>Factura</Th><Th>Cliente</Th><Th>Total</Th><Th>Pagado</Th><Th>Saldo</Th>
                <Th>Vencimiento</Th><Th>Estado</Th><Th className="text-right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {cpcPagina.length > 0 ? cpcPagina.map((c) => (
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
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewingCpc(c)}
                        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                        title="Ver detalle"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              )) : <tr><td colSpan={8}><EmptyState message="No hay cuentas por cobrar" /></td></tr>}
            </tbody>
          </Table>
          {cpcTotalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" size="sm" disabled={cpcPage <= 1} onClick={() => setCpcPage((p) => p - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">Página {cpcPage} de {cpcTotalPages}</span>
              <Button variant="secondary" size="sm" disabled={cpcPage >= cpcTotalPages} onClick={() => setCpcPage((p) => p + 1)}>
                Siguiente
              </Button>
            </div>
          )}
          </>
        )
      )}

      {/* Modal: Registrar pago */}
      <Modal open={showForm} onClose={() => { setShowForm(false); reset(); setClienteSeleccionado(''); setFacturaSeleccionada(null); }} title="Registrar pago" maxWidth="max-w-lg">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="1. Seleccionar cliente" required error={errors.clienteId?.message}>
            <Select {...register('clienteId')}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>{c.razonSocial} — {c.ruc}</option>
              ))}
            </Select>
          </FormField>

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
            <FormField label="Cuenta de destino" required error={errors.cuentaId?.message}>
              <Select {...register('cuentaId')}>
                <option value="">Seleccionar cuenta...</option>
                {cuentas.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} ({c.moneda?.simbolo} {c.moneda?.codigo}) — Saldo: {c.moneda?.simbolo} {Number(c.saldoActual).toFixed(2)}
                  </option>
                ))}
              </Select>
            </FormField>
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

      {/* Modal: Editar pago */}
      <Modal open={!!editingPago} onClose={() => { setEditingPago(null); resetEdit(); }} title="Editar pago" maxWidth="max-w-md">
        {editingPago && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/40 rounded-lg p-3 text-sm border border-border">
              <p className="font-medium">{editingPago.factura?.numeroFactura}</p>
              <p className="text-muted-foreground text-xs">{editingPago.cliente?.razonSocial} · {formatCurrency(Number(editingPago.monto))}</p>
              <p className="text-xs text-amber-600 mt-1">⚠ El monto no puede editarse para mantener integridad financiera.</p>
            </div>
            <form onSubmit={handleEdit((d) => updateMutation.mutate(d))} className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Método de pago" required error={editErrors.metodoPago?.message}>
                  <Select {...regEdit('metodoPago')}>
                    {Object.entries(METODO_PAGO_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Fecha de pago" error={editErrors.fechaPago?.message}>
                  <Input type="date" {...regEdit('fechaPago')} />
                </FormField>
              </div>
              <FormField label="Referencia">
                <Input placeholder="N° transferencia..." {...regEdit('referencia')} />
              </FormField>
              <FormField label="Observaciones">
                <Textarea placeholder="Notas..." {...regEdit('observaciones')} />
              </FormField>
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="secondary" type="button" onClick={() => { setEditingPago(null); resetEdit(); }}>Cancelar</Button>
                <Button type="submit" loading={editSubmitting || updateMutation.isPending}>
                  Guardar cambios
                </Button>
              </div>
            </form>
          </div>
        )}
      </Modal>

      {/* MEJORA 4 / P8: Modal de detalle de pago — Cliente/Factura/Fecha/Cuenta utilizada/Moneda/Método de pago/Usuario/Observaciones/Movimiento financiero generado */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Cobro — ${viewing?.factura?.numeroFactura ?? ''}`} maxWidth="max-w-lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            {loadDetallePago ? <p className="text-sm text-muted-foreground">Cargando detalle…</p> : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                  <p className="font-semibold text-sm">{viewing.cliente?.razonSocial}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Factura</p>
                  <p className="font-mono font-bold text-sm">{viewing.factura?.numeroFactura}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Monto cobrado</p>
                  <p className="font-bold text-lg text-emerald-500">{formatCurrency(Number(viewing.monto))}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fecha</p>
                  <p className="text-sm">{formatDate(viewing.fechaPago)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cuenta utilizada</p>
                  <p className="text-sm">{detallePago?.movimiento?.cuenta?.nombre ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Moneda</p>
                  <p className="text-sm">{detallePago?.movimiento?.moneda ? `${detallePago.movimiento.moneda.nombre} (${detallePago.movimiento.moneda.simbolo})` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Método de pago</p>
                  <p className="font-medium text-sm">{METODO_PAGO_LABEL[viewing.metodoPago as keyof typeof METODO_PAGO_LABEL] ?? viewing.metodoPago}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Usuario</p>
                  <p className="text-sm">{viewing.usuario?.nombre ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Movimiento financiero generado</p>
                  <p className="text-sm font-mono">{detallePago?.movimiento?.referencia ?? 'No se generó un movimiento financiero'}</p>
                </div>
                {viewing.referencia && (
                  <div className="col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">Referencia</p>
                    <p className="text-sm font-mono">{viewing.referencia}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Observaciones</p>
                  <p className="text-sm bg-muted/30 rounded p-2">{viewing.observaciones || '—'}</p>
                </div>
                {viewing.anulado && (
                  <div className="col-span-2 bg-destructive/10 rounded-lg p-3">
                    <p className="text-xs font-semibold text-destructive uppercase">Pago anulado</p>
                    {viewing.motivoAnulacion && <p className="text-xs text-muted-foreground mt-1">{viewing.motivoAnulacion}</p>}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* P8: Modal de detalle de cuenta por cobrar — mismos campos que el detalle de pago (experiencia uniforme) */}
      <Modal open={!!viewingCpc} onClose={() => setViewingCpc(null)} title={`Cuenta por cobrar — ${viewingCpc?.numeroFactura ?? ''}`} maxWidth="max-w-lg">
        {viewingCpc && (
          <div className="flex flex-col gap-4">
            {loadDetalleCpc ? <p className="text-sm text-muted-foreground">Cargando detalle…</p> : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                  <p className="font-semibold text-sm">{detalleCpc?.cliente?.razonSocial ?? viewingCpc.cliente?.razonSocial}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Factura</p>
                  <p className="font-mono font-bold text-sm">{detalleCpc?.numeroFactura ?? viewingCpc.numeroFactura}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fecha</p>
                  <p className="text-sm">{detalleCpc ? formatDate(detalleCpc.fecha) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Saldo pendiente</p>
                  <p className="font-semibold text-sm text-primary">{formatCurrency(viewingCpc.saldoPendiente)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cuenta utilizada</p>
                  <p className="text-sm">{detalleCpc?.cuenta?.nombre ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Moneda</p>
                  <p className="text-sm">{detalleCpc?.moneda ? `${detalleCpc.moneda.nombre} (${detalleCpc.moneda.simbolo})` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Método de pago</p>
                  <p className="text-sm">{detalleCpc?.ultimoPago ? (METODO_PAGO_LABEL[detalleCpc.ultimoPago.metodoPago as keyof typeof METODO_PAGO_LABEL] ?? detalleCpc.ultimoPago.metodoPago) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Usuario</p>
                  <p className="text-sm">{detalleCpc?.ultimoPago?.usuario?.nombre ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Movimiento financiero generado</p>
                  <p className="text-sm font-mono">{detalleCpc?.movimiento?.referencia ?? 'No se generó un movimiento financiero'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Observaciones</p>
                  <p className="text-sm bg-muted/30 rounded p-2">{detalleCpc?.observaciones || '—'}</p>
                </div>
                {detalleCpc && !detalleCpc.ultimoPago && (
                  <div className="col-span-2 bg-muted/30 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">
                      Esta factura aún no registra cobros. La cuenta, moneda, método de pago y movimiento financiero se completarán cuando se registre el primer pago.
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setViewingCpc(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
