// FILE: src/app/(dashboard)/liquidaciones/page.tsx
// CAMBIO v2 (P3):
//   - Pago total de liquidación usando SOLO cajas abiertas (sin cuentas bancarias)
//   - Modal de pago con selector de caja abierta
//   - Acciones de reintegro y devolución post-pago
//   - Historial financiero en vista detalle
//   - No se permiten pagos parciales

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Eye, Printer, Download, Package, X, CreditCard, ArrowDownLeft, ArrowUpRight, History } from 'lucide-react';
import { liquidacionesApi, conductoresApi, vehiculosApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import type { Liquidacion, PedidoResumen } from '@/types';
import * as XLSX from 'xlsx';

const detalleSchema = z.object({
  categoria: z.enum(['PEAJE', 'BALANZA', 'VIATICO', 'TOLDO', 'OTROS']),
  descripcion: z.string().min(1, 'Descripción requerida'),
  monto: z.string().min(1, 'Monto requerido'),
});

const schema = z.object({
  conductorId: z.string().min(1, 'Conductor requerido'),
  placaTracto: z.string().min(1, 'Placa tracto requerida'),
  placaCarreta: z.string().optional(),
  montoEntregado: z.string().min(1, 'Monto entregado requerido'),
  reciboAnticipo: z.string().optional(),
  fecha: z.string().min(1, 'Fecha requerida'),
  guiaReferencia: z.string().optional(),
  observaciones: z.string().optional(),
  detalles: z.array(detalleSchema),
});
type FormData = z.infer<typeof schema>;

const CATEGORIA_LABEL: Record<string, string> = {
  PEAJE: 'Peaje', BALANZA: 'Balanza', VIATICO: 'Viático', TOLDO: 'Toldo', OTROS: 'Otros',
};

export default function LiquidacionesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  // MEJORA 1: filtros de fecha — por defecto hoy
  const [filtroDesde, setFiltroDesde] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<Liquidacion | null>(null);

  // P3: estados para modales de pago
  const [showPagarModal, setShowPagarModal] = useState<Liquidacion | null>(null);
  const [showReintegroModal, setShowReintegroModal] = useState<Liquidacion | null>(null);
  const [showDevolucionModal, setShowDevolucionModal] = useState<Liquidacion | null>(null);
  const [showHistorial, setShowHistorial] = useState<Liquidacion | null>(null);
  const [cajaSeleccionada, setCajaSeleccionada] = useState('');
  const [montoMovimiento, setMontoMovimiento] = useState('');
  const [conceptoMovimiento, setConceptoMovimiento] = useState('');

  // ─── Pedidos seleccionados para la nueva liquidación ────────────────────────
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<PedidoResumen[]>([]);
  const [pedidoSelectorId, setPedidoSelectorId] = useState<string>('');
  const [errorPedidos, setErrorPedidos] = useState<string>('');

  const { data: liquidaciones = [], isLoading } = useQuery({
    queryKey: ['liquidaciones', filtroDesde, filtroHasta],
    queryFn: () => liquidacionesApi.listar({
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
    }).then((r) => r.data.data),
  });

  const { data: conductores = [] } = useQuery({
    queryKey: ['conductores'],
    queryFn: () => conductoresApi.listar({ activo: true }).then((r) => r.data.data),
  });

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos'],
    queryFn: () => vehiculosApi.listar({ activo: true }).then((r) => r.data.data),
  });

  // Pedidos disponibles (ACTIVO, sin liquidación)
  const { data: pedidosDisponibles = [] } = useQuery({
    queryKey: ['liquidaciones-pedidos-disponibles'],
    queryFn: () => liquidacionesApi.pedidosDisponibles().then((r) => r.data.data),
    enabled: showForm, // solo cargar cuando el formulario esté abierto
  });

  // P3: cajas abiertas para selector de pago
  const { data: cajasAbiertas = [] } = useQuery({
    queryKey: ['liquidaciones-cajas-abiertas'],
    queryFn: () => liquidacionesApi.cajasAbiertas().then((r) => r.data.data),
    enabled: !!showPagarModal || !!showReintegroModal || !!showDevolucionModal,
    refetchOnWindowFocus: false,
  });

  // P3: historial financiero
  const { data: historialData, isLoading: loadingHistorial } = useQuery({
    queryKey: ['liquidacion-historial', showHistorial?.id],
    queryFn: () => liquidacionesApi.historialFinanciero(showHistorial!.id).then((r) => r.data.data),
    enabled: !!showHistorial,
  });

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      detalles: [{ categoria: 'PEAJE', descripcion: '', monto: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'detalles' });

  // Auto-fill vehicle preferences when conductor is selected
  const watchConductorId = watch('conductorId');
  useEffect(() => {
    if (!watchConductorId || !conductores.length) return;
    const conductor = (conductores as any[]).find((c: any) => String(c.id) === watchConductorId);
    if (conductor) {
      if (conductor.tractoPreferencia) setValue('placaTracto', conductor.tractoPreferencia);
      if (conductor.carretaPreferencia) setValue('placaCarreta', conductor.carretaPreferencia);
    }
  }, [watchConductorId, conductores, setValue]);

  // Cálculos automáticos
  const watchDetalles = watch('detalles');
  const watchEntregado = watch('montoEntregado');
  const totalGastos = watchDetalles.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
  const entregado = parseFloat(watchEntregado || '0');
  const diferencia = entregado - totalGastos;
  const devolucion = diferencia > 0 ? diferencia : 0;
  const reintegro = diferencia < 0 ? Math.abs(diferencia) : 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['liquidaciones'] });
    qc.invalidateQueries({ queryKey: ['liquidaciones-pedidos-disponibles'] });
  };

  // ─── Manejo de pedidos en el formulario ──────────────────────────────────────

  const agregarPedido = () => {
    setErrorPedidos('');
    if (!pedidoSelectorId) return;

    const id = parseInt(pedidoSelectorId);

    // Validación: no duplicar
    if (pedidosSeleccionados.some((p) => p.id === id)) {
      setErrorPedidos('Este pedido ya fue agregado a la liquidación');
      return;
    }

    const pedido = pedidosDisponibles.find((p) => p.id === id);
    if (!pedido) {
      setErrorPedidos('Pedido no encontrado');
      return;
    }

    setPedidosSeleccionados((prev) => [...prev, pedido]);
    setPedidoSelectorId('');
  };

  const quitarPedido = (pedidoId: number) => {
    setPedidosSeleccionados((prev) => prev.filter((p) => p.id !== pedidoId));
    setErrorPedidos('');
  };

  const resetForm = () => {
    reset();
    setPedidosSeleccionados([]);
    setPedidoSelectorId('');
    setErrorPedidos('');
  };

  const createMutation = useMutation({
    mutationFn: (d: FormData) =>
      liquidacionesApi.crear({
        conductorId: parseInt(d.conductorId),
        placaTracto: d.placaTracto,
        placaCarreta: d.placaCarreta,
        montoEntregado: parseFloat(d.montoEntregado),
        reciboAnticipo: d.reciboAnticipo,
        fecha: d.fecha,
        guiaReferencia: d.guiaReferencia,
        observaciones: d.observaciones,
        detalles: d.detalles.map((det) => ({
          categoria: det.categoria as 'PEAJE' | 'BALANZA' | 'VIATICO' | 'TOLDO' | 'OTROS',
          descripcion: det.descripcion,
          monto: parseFloat(det.monto),
        })),
        pedidoIds: pedidosSeleccionados.map((p) => p.id),
      }),
    onSuccess: () => {
      toast.success('Liquidación creada');
      setShowForm(false);
      resetForm();
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => liquidacionesApi.eliminar(id),
    onSuccess: () => { toast.success('Liquidación eliminada'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // P3: mutaciones financieras
  const pagarMutation = useMutation({
    mutationFn: ({ id, cajaId }: { id: number; cajaId: number }) =>
      liquidacionesApi.pagar(id, { cajaId }),
    onSuccess: () => {
      toast.success('Liquidación pagada correctamente');
      setShowPagarModal(null);
      setCajaSeleccionada('');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const reintegroMutation = useMutation({
    mutationFn: ({ id, cajaId, monto, concepto }: { id: number; cajaId: number; monto: number; concepto: string }) =>
      liquidacionesApi.reintegro(id, { cajaId, monto, concepto }),
    onSuccess: () => {
      toast.success('Reintegro registrado');
      setShowReintegroModal(null);
      setCajaSeleccionada('');
      setMontoMovimiento('');
      setConceptoMovimiento('');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const devolucionMutation = useMutation({
    mutationFn: ({ id, cajaId, monto, concepto }: { id: number; cajaId: number; monto: number; concepto: string }) =>
      liquidacionesApi.devolucion(id, { cajaId, monto, concepto }),
    onSuccess: () => {
      toast.success('Devolución registrada');
      setShowDevolucionModal(null);
      setCajaSeleccionada('');
      setMontoMovimiento('');
      setConceptoMovimiento('');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const exportExcel = () => {
    const rows = liquidaciones.map((l) => ({
      '#': l.id, Fecha: formatDate(l.fecha), Conductor: l.conductor?.nombre,
      'Placa tracto': l.placaTracto, 'Placa carreta': l.placaCarreta ?? '',
      'Entregado S/': Number(l.montoEntregado), 'Total gastos S/': Number(l.totalGastos),
      'Devolución S/': Number(l.devolucion), 'Reintegro S/': Number(l.reintegro),
      'N° Pedidos': (l.pedidos ?? []).length,
      Guía: l.guiaReferencia ?? '', Observaciones: l.observaciones ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidaciones');
    XLSX.writeFile(wb, `liquidaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filtered = liquidaciones.filter((l) =>
    search
      ? l.conductor?.nombre.toLowerCase().includes(search.toLowerCase()) ||
        l.placaTracto.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  const handlePrint = (liq: Liquidacion) => {
    const pedidoRows = (liq.pedidos ?? [])
      .map(
        (lp) =>
          `<tr><td>#${lp.pedido.id}</td><td>${lp.pedido.cliente.razonSocial}</td>` +
          `<td>${lp.pedido.origen}</td><td>${lp.pedido.destino}</td></tr>`,
      )
      .join('');

    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>Liquidación #${liq.id}</title>
      <style>body{font-family:sans-serif;padding:20px;font-size:13px}h2{margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
      th{background:#f5f5f5}.totals{margin-top:16px;text-align:right}
      .totals p{margin:4px 0}.bold{font-weight:700}h3{margin-top:16px;font-size:13px}</style></head>
      <body>
        <h2>Liquidación de Gastos #${liq.id}</h2>
        <p>Fecha: ${formatDate(liq.fecha)} | Conductor: ${liq.conductor?.nombre}</p>
        <p>Tracto: ${liq.placaTracto}${liq.placaCarreta ? ' | Carreta: ' + liq.placaCarreta : ''}</p>
        ${liq.guiaReferencia ? `<p>Guía: ${liq.guiaReferencia}</p>` : ''}
        <table>
          <tr><th>Categoría</th><th>Descripción</th><th>Monto</th></tr>
          ${(liq.detalles || []).map((d) => `<tr><td>${CATEGORIA_LABEL[d.categoria]}</td><td>${d.descripcion}</td><td style="text-align:right">S/ ${Number(d.monto).toFixed(2)}</td></tr>`).join('')}
          ${liq.toldo ? `<tr><td>Toldo</td><td>Gasto de toldo</td><td style="text-align:right">S/ ${Number(liq.toldo).toFixed(2)}</td></tr>` : ''}
        </table>
        ${pedidoRows ? `
        <h3>Pedidos Relacionados</h3>
        <table>
          <tr><th>Pedido</th><th>Cliente</th><th>Origen</th><th>Destino</th></tr>
          ${pedidoRows}
        </table>` : ''}
        <div class="totals">
          <p>Monto entregado: <span class="bold">S/ ${Number(liq.montoEntregado).toFixed(2)}</span></p>
          <p>Total gastos: <span class="bold">S/ ${Number(liq.totalGastos).toFixed(2)}</span></p>
          ${liq.devolucion > 0 ? `<p style="color:green">Devolución: <span class="bold">S/ ${Number(liq.devolucion).toFixed(2)}</span></p>` : ''}
          ${liq.reintegro > 0 ? `<p style="color:red">Reintegro: <span class="bold">S/ ${Number(liq.reintegro).toFixed(2)}</span></p>` : ''}
        </div>
        ${liq.observaciones ? `<p style="margin-top:12px"><b>Obs:</b> ${liq.observaciones}</p>` : ''}
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  // Pedidos disponibles que aún no fueron seleccionados en el formulario actual
  const pedidosParaSelector = pedidosDisponibles.filter(
    (p) => !pedidosSeleccionados.some((s) => s.id === p.id),
  );

  return (
    <div className="page-container">
      <PageHeader
        title="Liquidaciones"
        description={`${liquidaciones.length} liquidación${liquidaciones.length !== 1 ? 'es' : ''}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
            <Button onClick={() => { setShowForm(true); resetForm(); }}>
              <Plus className="w-4 h-4" /> Nueva liquidación
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total liquidaciones" value={liquidaciones.length} color="default" />
        <StatCard label="Total entregado" value={formatCurrency(liquidaciones.reduce((s, l) => s + Number(l.montoEntregado), 0))} color="blue" />
        <StatCard label="Total gastos" value={formatCurrency(liquidaciones.reduce((s, l) => s + Number(l.totalGastos), 0))} color="red" />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar conductor, placa..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" className="w-36" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" className="w-36" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
        </div>
        {(filtroDesde || filtroHasta) && (
          <button onClick={() => { setFiltroDesde(''); setFiltroHasta(''); }} className="text-xs text-muted-foreground hover:text-foreground underline">
            Limpiar fechas
          </button>
        )}
      </div>

      {isLoading ? <TableSkeleton rows={5} cols={8} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Fecha</Th>
              <Th>Conductor</Th>
              <Th>Tracto</Th>
              <Th>Pedidos</Th>
              <Th>Entregado</Th>
              <Th>Total gastos</Th>
              <Th>Devolución / Reintegro</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((l) => (
              <Tr key={l.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{l.id}</span></Td>
                <Td><span className="text-sm">{formatDate(l.fecha)}</span></Td>
                <Td><span className="font-medium text-sm">{l.conductor?.nombre}</span></Td>
                <Td><span className="font-mono text-xs">{l.placaTracto}</span></Td>
                <Td>
                  {(l.pedidos ?? []).length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 font-medium">
                      <Package className="w-3 h-3" />
                      {(l.pedidos ?? []).length}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </Td>
                <Td><span className="text-sm">{formatCurrency(Number(l.montoEntregado))}</span></Td>
                <Td><span className="font-semibold">{formatCurrency(Number(l.totalGastos))}</span></Td>
                <Td>
                  {Number(l.devolucion) > 0 && (
                    <span className="text-emerald-500 font-medium text-sm">+{formatCurrency(Number(l.devolucion))}</span>
                  )}
                  {Number(l.reintegro) > 0 && (
                    <span className="text-red-500 font-medium text-sm">-{formatCurrency(Number(l.reintegro))}</span>
                  )}
                  {Number(l.devolucion) === 0 && Number(l.reintegro) === 0 && (
                    <span className="text-muted-foreground text-xs">Exacto</span>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button onClick={() => setViewing(l)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver detalle">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handlePrint(l)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Imprimir">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    {/* P3: Pagar — solo si PENDIENTE */}
                    {l.estado === 'PENDIENTE' && (
                      <button
                        onClick={() => { setShowPagarModal(l); setCajaSeleccionada(''); }}
                        className="p-1.5 rounded-md hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 transition-all"
                        title="Registrar pago"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* P3: Reintegro — solo si PAGADA y tiene reintegro */}
                    {l.estado === 'PAGADA' && Number(l.reintegro) > 0 && (
                      <button
                        onClick={() => { setShowReintegroModal(l); setCajaSeleccionada(''); setMontoMovimiento(String(Number(l.reintegro))); }}
                        className="p-1.5 rounded-md hover:bg-blue-50 text-blue-600 hover:text-blue-700 transition-all"
                        title={`Reintegro: ${formatCurrency(Number(l.reintegro))}`}
                      >
                        <ArrowDownLeft className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* P3: Devolución — solo si PAGADA y tiene devolución */}
                    {l.estado === 'PAGADA' && Number(l.devolucion) > 0 && (
                      <button
                        onClick={() => { setShowDevolucionModal(l); setCajaSeleccionada(''); setMontoMovimiento(String(Number(l.devolucion))); }}
                        className="p-1.5 rounded-md hover:bg-amber-50 text-amber-600 hover:text-amber-700 transition-all"
                        title={`Devolución: ${formatCurrency(Number(l.devolucion))}`}
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* P3: Historial financiero */}
                    <button
                      onClick={() => setShowHistorial(l)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                      title="Historial financiero"
                    >
                      <History className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm('¿Eliminar liquidación?')) deleteMutation.mutate(l.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={9}><EmptyState message="No hay liquidaciones" /></td></tr>}
          </tbody>
        </Table>
      )}

      {/* ─── Create Modal ──────────────────────────────────────────────────── */}
      <Modal open={showForm} onClose={() => { setShowForm(false); resetForm(); }} title="Nueva liquidación" maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          {/* Cabecera */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Conductor" required error={errors.conductorId?.message}>
              <Select {...register('conductorId')}>
                <option value="">Seleccionar...</option>
                {conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </FormField>
            <FormField label="Fecha" required error={errors.fecha?.message}>
              <Input type="date" {...register('fecha')} />
            </FormField>
            <FormField label="Placa Tracto" required error={errors.placaTracto?.message}>
              <Select {...register('placaTracto')}>
                <option value="">Seleccionar...</option>
                {vehiculos.filter(v => v.tipo === 'TRACTO').map((v) => <option key={v.id} value={v.placa}>{v.placa} — {v.marca}</option>)}
                <option value="_manual">Otra placa (ingresar)</option>
              </Select>
            </FormField>
            <FormField label="Placa Carreta" error={errors.placaCarreta?.message}>
              <Select {...register('placaCarreta')}>
                <option value="">Sin carreta</option>
                {vehiculos.filter(v => v.tipo === 'CARRETA').map((v) => <option key={v.id} value={v.placa}>{v.placa}</option>)}
              </Select>
            </FormField>
            <FormField label="Monto entregado (S/)" required error={errors.montoEntregado?.message}>
              <Input type="number" step="0.01" placeholder="0.00" {...register('montoEntregado')} />
            </FormField>
            <FormField label="Recibo anticipo" error={errors.reciboAnticipo?.message}>
              <Input placeholder="N° recibo" {...register('reciboAnticipo')} />
            </FormField>
            <FormField label="Guía de referencia" error={errors.guiaReferencia?.message}>
              <Input placeholder="Número de guía" {...register('guiaReferencia')} />
            </FormField>
          </div>

          {/* ─── NUEVO: Pedidos relacionados ──────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Package className="w-4 h-4 text-muted-foreground" />
                Pedidos relacionados
                <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
              </p>
            </div>

            {/* Selector de pedido */}
            <div className="flex gap-2 mb-2">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={pedidoSelectorId}
                onChange={(e) => { setPedidoSelectorId(e.target.value); setErrorPedidos(''); }}
              >
                <option value="">Seleccionar pedido...</option>
                {pedidosParaSelector.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} — {p.cliente.razonSocial} | {p.origen} → {p.destino}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={agregarPedido}
                disabled={!pedidoSelectorId}
              >
                <Plus className="w-3.5 h-3.5" /> Agregar
              </Button>
            </div>

            {errorPedidos && (
              <p className="text-xs text-destructive mb-2">{errorPedidos}</p>
            )}

            {/* Lista de pedidos seleccionados */}
            {pedidosSeleccionados.length > 0 ? (
              <div className="rounded-lg border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">#</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Cliente</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Origen</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Destino</th>
                      <th className="px-3 py-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidosSeleccionados.map((p) => (
                      <tr key={p.id} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-muted-foreground">#{p.id}</td>
                        <td className="px-3 py-2 font-medium">{p.cliente.razonSocial}</td>
                        <td className="px-3 py-2">{p.origen}</td>
                        <td className="px-3 py-2">{p.destino}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => quitarPedido(p.id)}
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                            title="Quitar pedido"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic py-1">
                Sin pedidos asociados. Puedes agregar uno o más arriba.
              </p>
            )}
          </div>

          {/* Detalle dinámico */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Detalle de gastos</p>
              <Button type="button" variant="secondary" size="sm"
                onClick={() => append({ categoria: 'PEAJE', descripcion: '', monto: '' })}>
                <Plus className="w-3 h-3" /> Agregar
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-8 gap-2 items-start">
                  <div className="col-span-2">
                    <Select {...register(`detalles.${index}.categoria`)}>
                      <option value="PEAJE">Peaje</option>
                      <option value="BALANZA">Balanza</option>
                      <option value="VIATICO">Viático</option>
                      <option value="TOLDO">Toldo</option>
                      <option value="OTROS">Otros</option>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input placeholder="Descripción" {...register(`detalles.${index}.descripcion`)} />
                    {errors.detalles?.[index]?.descripcion && (
                      <p className="text-xs text-destructive mt-0.5">{errors.detalles[index]?.descripcion?.message}</p>
                    )}
                  </div>
                  <div className="col-span-1">
                    <Input type="number" step="0.01" placeholder="0.00" {...register(`detalles.${index}.monto`)} />
                  </div>
                  <div className="col-span-1 flex items-center pt-0.5">
                    <button type="button" onClick={() => remove(index)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cálculos automáticos */}
          <div className="bg-muted/40 rounded-xl p-4 grid grid-cols-4 gap-3 text-center">
            <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-bold">{formatCurrency(totalGastos)}</p></div>
            <div><p className="text-xs text-muted-foreground">Entregado</p><p className="font-bold">{formatCurrency(entregado)}</p></div>
            <div><p className="text-xs text-muted-foreground">Devolución</p><p className={`font-bold ${devolucion > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>{formatCurrency(devolucion)}</p></div>
            <div><p className="text-xs text-muted-foreground">Reintegro</p><p className={`font-bold ${reintegro > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{formatCurrency(reintegro)}</p></div>
          </div>

          <FormField label="Observaciones" error={errors.observaciones?.message}>
            <Textarea placeholder="Notas adicionales..." {...register('observaciones')} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>Crear liquidación</Button>
          </div>
        </form>
      </Modal>

      {/* ─── View Modal ────────────────────────────────────────────────────── */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Liquidación #${viewing?.id}`} maxWidth="max-w-lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Conductor</p><p className="font-medium">{viewing.conductor?.nombre}</p></div>
              <div><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium">{formatDate(viewing.fecha)}</p></div>
              <div><p className="text-xs text-muted-foreground">Tracto</p><p className="font-mono font-medium">{viewing.placaTracto}</p></div>
              {viewing.placaCarreta && <div><p className="text-xs text-muted-foreground">Carreta</p><p className="font-mono font-medium">{viewing.placaCarreta}</p></div>}
              {viewing.guiaReferencia && <div><p className="text-xs text-muted-foreground">Guía</p><p className="font-medium">{viewing.guiaReferencia}</p></div>}
              {viewing.reciboAnticipo && <div><p className="text-xs text-muted-foreground">Recibo anticipo</p><p className="font-medium">{viewing.reciboAnticipo}</p></div>}
            </div>

            {/* NUEVO: Pedidos relacionados en vista detalle */}
            {(viewing.pedidos ?? []).length > 0 && (
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5 mb-2">
                  <Package className="w-4 h-4 text-muted-foreground" />
                  Pedidos relacionados
                </p>
                <Table>
                  <thead>
                    <tr>
                      <Th>Pedido</Th>
                      <Th>Cliente</Th>
                      <Th>Origen</Th>
                      <Th>Destino</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewing.pedidos ?? []).map((lp) => (
                      <Tr key={lp.id}>
                        <Td><span className="font-mono text-xs text-muted-foreground">#{lp.pedido.id}</span></Td>
                        <Td><span className="text-sm font-medium">{lp.pedido.cliente.razonSocial}</span></Td>
                        <Td><span className="text-sm">{lp.pedido.origen}</span></Td>
                        <Td><span className="text-sm">{lp.pedido.destino}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}

            <Table>
              <thead><tr><Th>Categoría</Th><Th>Descripción</Th><Th className="text-right">Monto</Th></tr></thead>
              <tbody>
                {(viewing.detalles || []).map((d, i) => (
                  <Tr key={i}>
                    <Td><span className="text-xs">{CATEGORIA_LABEL[d.categoria]}</span></Td>
                    <Td><span className="text-sm">{d.descripcion}</span></Td>
                    <Td className="text-right"><span className="text-sm font-medium">{formatCurrency(Number(d.monto))}</span></Td>
                  </Tr>
                ))}
                {viewing.toldo != null && Number(viewing.toldo) > 0 && (
                  <Tr><Td><span className="text-xs">Toldo</span></Td><Td>—</Td><Td className="text-right"><span className="text-sm font-medium">{formatCurrency(Number(viewing.toldo))}</span></Td></Tr>
                )}
              </tbody>
            </Table>
            <div className="grid grid-cols-4 gap-3 bg-muted/40 rounded-xl p-3 text-center">
              <div><p className="text-xs text-muted-foreground">Entregado</p><p className="font-bold text-sm">{formatCurrency(Number(viewing.montoEntregado))}</p></div>
              <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-bold text-sm">{formatCurrency(Number(viewing.totalGastos))}</p></div>
              <div><p className="text-xs text-muted-foreground">Devolución</p><p className={`font-bold text-sm ${Number(viewing.devolucion) > 0 ? 'text-emerald-500' : ''}`}>{formatCurrency(Number(viewing.devolucion))}</p></div>
              <div><p className="text-xs text-muted-foreground">Reintegro</p><p className={`font-bold text-sm ${Number(viewing.reintegro) > 0 ? 'text-red-500' : ''}`}>{formatCurrency(Number(viewing.reintegro))}</p></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => handlePrint(viewing)}>
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── P3: Modal Pagar ─────────────────────────────────────────────────── */}
      <Modal
        open={!!showPagarModal}
        onClose={() => { setShowPagarModal(null); setCajaSeleccionada(''); }}
        title="Registrar pago de liquidación"
      >
        {showPagarModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p className="font-semibold">{showPagarModal.conductor?.nombre}</p>
              <p className="text-muted-foreground">Monto a pagar (total): <span className="font-bold text-foreground">{formatCurrency(Number(showPagarModal.montoEntregado))}</span></p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              ⚠️ Solo se aceptan <strong>cajas abiertas</strong>. Los pagos son siempre por el total — no se admiten pagos parciales.
            </div>
            <FormField label="Caja de pago" required>
              <Select value={cajaSeleccionada} onChange={(e) => setCajaSeleccionada(e.target.value)}>
                <option value="">Seleccionar caja...</option>
                {cajasAbiertas.length === 0 && <option disabled>No hay cajas abiertas</option>}
                {cajasAbiertas.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre ?? `Caja #${c.id}`} — {c.usuario?.nombre} — Saldo: {formatCurrency(c.saldoActual)}
                  </option>
                ))}
              </Select>
            </FormField>
            {cajasAbiertas.length === 0 && (
              <p className="text-xs text-destructive">No hay cajas abiertas. Abra una caja desde el módulo Caja antes de registrar el pago.</p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setShowPagarModal(null); setCajaSeleccionada(''); }}>Cancelar</Button>
              <Button
                disabled={!cajaSeleccionada || pagarMutation.isPending || cajasAbiertas.length === 0}
                onClick={() => {
                  if (!cajaSeleccionada) return;
                  pagarMutation.mutate({ id: showPagarModal.id, cajaId: parseInt(cajaSeleccionada) });
                }}
              >
                {pagarMutation.isPending ? 'Registrando...' : `Pagar ${formatCurrency(Number(showPagarModal.montoEntregado))}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── P3: Modal Reintegro ─────────────────────────────────────────────── */}
      <Modal
        open={!!showReintegroModal}
        onClose={() => { setShowReintegroModal(null); setCajaSeleccionada(''); setMontoMovimiento(''); }}
        title="Registrar reintegro"
      >
        {showReintegroModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p className="font-semibold">{showReintegroModal.conductor?.nombre}</p>
              <p className="text-muted-foreground">Reintegro calculado: <span className="font-bold text-blue-500">{formatCurrency(Number(showReintegroModal.reintegro))}</span></p>
              <p className="text-xs text-muted-foreground mt-1">El conductor devuelve el exceso de efectivo a la empresa.</p>
            </div>
            <FormField label="Caja receptora" required>
              <Select value={cajaSeleccionada} onChange={(e) => setCajaSeleccionada(e.target.value)}>
                <option value="">Seleccionar caja...</option>
                {cajasAbiertas.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre ?? `Caja #${c.id}`} — {c.usuario?.nombre}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Monto (S/)" required>
              <Input type="number" step="0.01" value={montoMovimiento} onChange={(e) => setMontoMovimiento(e.target.value)} />
            </FormField>
            <FormField label="Concepto">
              <Input value={conceptoMovimiento} onChange={(e) => setConceptoMovimiento(e.target.value)} placeholder="Reintegro liquidación..." />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setShowReintegroModal(null); setCajaSeleccionada(''); setMontoMovimiento(''); }}>Cancelar</Button>
              <Button
                disabled={!cajaSeleccionada || !montoMovimiento || reintegroMutation.isPending}
                onClick={() => {
                  if (!cajaSeleccionada || !montoMovimiento) return;
                  reintegroMutation.mutate({ id: showReintegroModal.id, cajaId: parseInt(cajaSeleccionada), monto: parseFloat(montoMovimiento), concepto: conceptoMovimiento });
                }}
              >
                {reintegroMutation.isPending ? 'Registrando...' : 'Registrar reintegro'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── P3: Modal Devolución ─────────────────────────────────────────────── */}
      <Modal
        open={!!showDevolucionModal}
        onClose={() => { setShowDevolucionModal(null); setCajaSeleccionada(''); setMontoMovimiento(''); }}
        title="Registrar devolución"
      >
        {showDevolucionModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p className="font-semibold">{showDevolucionModal.conductor?.nombre}</p>
              <p className="text-muted-foreground">Devolución calculada: <span className="font-bold text-emerald-500">{formatCurrency(Number(showDevolucionModal.devolucion))}</span></p>
              <p className="text-xs text-muted-foreground mt-1">La empresa debe pagar este monto adicional al conductor.</p>
            </div>
            <FormField label="Caja de origen" required>
              <Select value={cajaSeleccionada} onChange={(e) => setCajaSeleccionada(e.target.value)}>
                <option value="">Seleccionar caja...</option>
                {cajasAbiertas.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre ?? `Caja #${c.id}`} — {c.usuario?.nombre} — Saldo: {formatCurrency(c.saldoActual)}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Monto (S/)" required>
              <Input type="number" step="0.01" value={montoMovimiento} onChange={(e) => setMontoMovimiento(e.target.value)} />
            </FormField>
            <FormField label="Concepto">
              <Input value={conceptoMovimiento} onChange={(e) => setConceptoMovimiento(e.target.value)} placeholder="Devolución liquidación..." />
            </FormField>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setShowDevolucionModal(null); setCajaSeleccionada(''); setMontoMovimiento(''); }}>Cancelar</Button>
              <Button
                disabled={!cajaSeleccionada || !montoMovimiento || devolucionMutation.isPending}
                onClick={() => {
                  if (!cajaSeleccionada || !montoMovimiento) return;
                  devolucionMutation.mutate({ id: showDevolucionModal.id, cajaId: parseInt(cajaSeleccionada), monto: parseFloat(montoMovimiento), concepto: conceptoMovimiento });
                }}
              >
                {devolucionMutation.isPending ? 'Registrando...' : 'Registrar devolución'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── P3: Modal Historial Financiero ──────────────────────────────────── */}
      <Modal
        open={!!showHistorial}
        onClose={() => setShowHistorial(null)}
        title={`Historial financiero — Liquidación #${showHistorial?.id}`}
        maxWidth="max-w-xl"
      >
        {showHistorial && (
          <div className="flex flex-col gap-4">
            {loadingHistorial ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : historialData ? (
              <>
                <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-lg p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Estado</p><p className="font-semibold">{historialData.liquidacion.estado}</p></div>
                  <div><p className="text-xs text-muted-foreground">Monto entregado</p><p className="font-semibold">{formatCurrency(historialData.liquidacion.montoEntregado)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-semibold">{formatCurrency(historialData.liquidacion.totalGastos)}</p></div>
                  {historialData.liquidacion.reintegro > 0 && <div><p className="text-xs text-muted-foreground">Reintegro</p><p className="font-semibold text-blue-500">{formatCurrency(historialData.liquidacion.reintegro)}</p></div>}
                  {historialData.liquidacion.devolucion > 0 && <div><p className="text-xs text-muted-foreground">Devolución</p><p className="font-semibold text-emerald-500">{formatCurrency(historialData.liquidacion.devolucion)}</p></div>}
                </div>
                {historialData.movimientos.length > 0 ? (
                  <Table>
                    <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Concepto</Th><Th>Caja</Th><Th className="text-right">Monto</Th></tr></thead>
                    <tbody>
                      {historialData.movimientos.map((m) => (
                        <Tr key={m.id}>
                          <Td><span className="text-xs text-muted-foreground">{formatDate(m.fecha)}</span></Td>
                          <Td><span className={`text-xs font-medium ${m.tipo === 'INGRESO' ? 'text-emerald-500' : 'text-red-500'}`}>{m.tipo}</span></Td>
                          <Td><span className="text-xs">{m.concepto}</span></Td>
                          <Td><span className="text-xs text-muted-foreground">{m.caja?.nombre ?? `#${m.caja?.id}`}</span></Td>
                          <Td className="text-right"><span className="text-sm font-semibold">{formatCurrency(m.monto)}</span></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                ) : (
                  <EmptyState message="Sin movimientos financieros registrados" />
                )}
              </>
            ) : null}
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setShowHistorial(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
