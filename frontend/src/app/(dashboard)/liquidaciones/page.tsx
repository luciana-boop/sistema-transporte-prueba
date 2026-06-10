'use client';

// Flujo v4: CREADA → PAGADA → RENDIDA → CERRADA
//   CREADA  → [Pagar Liquidación]
//   PAGADA  → [Rendir Gastos]
//   RENDIDA → [Devolución / Reintegro] (cerrar)
//   CERRADA → solo lectura

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus, Search, Trash2, Eye, Printer, Download, Package, X,
  CreditCard, History, ClipboardList, CheckCircle, Lock,
} from 'lucide-react';
import { liquidacionesApi, conductoresApi, vehiculosApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import type { Liquidacion, PedidoResumen } from '@/types';
import * as XLSX from 'xlsx';

// ─── Esquemas ─────────────────────────────────────────────────────────────────

const schema = z.object({
  conductorId: z.string().min(1, 'Conductor requerido'),
  placaTracto: z.string().min(1, 'Placa tracto requerida'),
  placaCarreta: z.string().optional(),
  montoEntregado: z.string().min(1, 'Monto entregado requerido'),
  reciboAnticipo: z.string().optional(),
  fecha: z.string().min(1, 'Fecha requerida'),
  guiaReferencia: z.string().optional(),
  observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const detalleSchema = z.object({
  categoria: z.enum(['PEAJE', 'BALANZA', 'VIATICO', 'TOLDO', 'OTROS']),
  descripcion: z.string().min(1, 'Descripción requerida'),
  monto: z.string().min(1, 'Monto requerido'),
});

const rendirSchema = z.object({
  detalles: z.array(detalleSchema).min(1, 'Debe agregar al menos un gasto'),
  observaciones: z.string().optional(),
});
type RendirFormData = z.infer<typeof rendirSchema>;

// ─── Constantes de estado ─────────────────────────────────────────────────────

const ESTADO_LABEL: Record<string, string> = {
  CREADA: 'Pendiente pago',
  PAGADA: 'Pagada',
  RENDIDA: 'Rendida',
  CERRADA: 'Cerrada',
  // legacy
  PENDIENTE_RENDICION: 'Sin rendir',
  PENDIENTE: 'Por pagar',
};

const ESTADO_COLOR: Record<string, string> = {
  CREADA: 'text-slate-600 bg-slate-50 border-slate-200',
  PAGADA: 'text-blue-600 bg-blue-50 border-blue-200',
  RENDIDA: 'text-amber-600 bg-amber-50 border-amber-200',
  CERRADA: 'text-emerald-600 bg-emerald-50 border-emerald-200',
  PENDIENTE_RENDICION: 'text-amber-600 bg-amber-50 border-amber-200',
  PENDIENTE: 'text-blue-600 bg-blue-50 border-blue-200',
};

const CATEGORIA_LABEL: Record<string, string> = {
  PEAJE: 'Peaje', BALANZA: 'Balanza', VIATICO: 'Viático', TOLDO: 'Toldo', OTROS: 'Otros',
};

// ─── Página ───────────────────────────────────────────────────────────────────

export default function LiquidacionesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);

  // Modales
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<Liquidacion | null>(null);
  const [showPagarModal, setShowPagarModal] = useState<Liquidacion | null>(null);
  const [showRendirModal, setShowRendirModal] = useState<Liquidacion | null>(null);
  const [showCerrarModal, setShowCerrarModal] = useState<Liquidacion | null>(null);
  const [showHistorial, setShowHistorial] = useState<Liquidacion | null>(null);

  // Estado modales de pago / cierre
  const [cajaSeleccionada, setCajaSeleccionada] = useState('');
  const [montoPagado, setMontoPagado] = useState('');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().split('T')[0]);
  const [fechaCierre, setFechaCierre] = useState(() => new Date().toISOString().split('T')[0]);

  // Pedidos en formulario de creación
  const [pedidosSeleccionados, setPedidosSeleccionados] = useState<PedidoResumen[]>([]);
  const [pedidoSelectorId, setPedidoSelectorId] = useState('');
  const [errorPedidos, setErrorPedidos] = useState('');

  // ─── Queries ────────────────────────────────────────────────────────────────

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

  const { data: pedidosDisponibles = [] } = useQuery({
    queryKey: ['liquidaciones-pedidos-disponibles'],
    queryFn: () => liquidacionesApi.pedidosDisponibles().then((r) => r.data.data),
    enabled: showForm,
  });

  const { data: cajasAbiertas = [] } = useQuery({
    queryKey: ['liquidaciones-cajas-abiertas'],
    queryFn: () => liquidacionesApi.cajasAbiertas().then((r) => r.data.data),
    enabled: !!showPagarModal || !!showCerrarModal,
    refetchOnWindowFocus: false,
  });

  const { data: historialData, isLoading: loadingHistorial } = useQuery({
    queryKey: ['liquidacion-historial', showHistorial?.id],
    queryFn: () => liquidacionesApi.historialFinanciero(showHistorial!.id).then((r) => r.data.data),
    enabled: !!showHistorial,
  });

  // ─── Formulario creación ─────────────────────────────────────────────────────

  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fecha: new Date().toISOString().split('T')[0] },
  });

  const watchConductorId = watch('conductorId');
  useEffect(() => {
    if (!watchConductorId || !conductores.length) return;
    const conductor = (conductores as any[]).find((c: any) => String(c.id) === watchConductorId);
    if (conductor) {
      if (conductor.tractoPreferencia) setValue('placaTracto', conductor.tractoPreferencia);
      if (conductor.carretaPreferencia) setValue('placaCarreta', conductor.carretaPreferencia);
    }
  }, [watchConductorId, conductores, setValue]);

  // ─── Formulario rendición ─────────────────────────────────────────────────────

  const {
    register: rendirRegister,
    handleSubmit: rendirHandleSubmit,
    reset: rendirReset,
    watch: rendirWatch,
    control: rendirControl,
    formState: { errors: rendirErrors, isSubmitting: rendirIsSubmitting },
  } = useForm<RendirFormData>({
    resolver: zodResolver(rendirSchema),
    defaultValues: { detalles: [{ categoria: 'PEAJE', descripcion: '', monto: '' }] },
  });

  const { fields: rendirFields, append: rendirAppend, remove: rendirRemove } =
    useFieldArray({ control: rendirControl, name: 'detalles' });

  const rendirWatchDetalles = rendirWatch('detalles');
  const rendirTotal = rendirWatchDetalles.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
  const rendirEntregado = showRendirModal ? Number(showRendirModal.montoPagado ?? showRendirModal.montoEntregado) : 0;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['liquidaciones'] });
    qc.invalidateQueries({ queryKey: ['liquidaciones-pedidos-disponibles'] });
  };

  const resetForm = () => {
    reset({ fecha: new Date().toISOString().split('T')[0] });
    setPedidosSeleccionados([]);
    setPedidoSelectorId('');
    setErrorPedidos('');
  };

  // ─── Pedidos en formulario ───────────────────────────────────────────────────

  const agregarPedido = () => {
    setErrorPedidos('');
    if (!pedidoSelectorId) return;
    const id = parseInt(pedidoSelectorId);
    if (pedidosSeleccionados.some((p) => p.id === id)) {
      setErrorPedidos('Este pedido ya fue agregado');
      return;
    }
    const pedido = pedidosDisponibles.find((p) => p.id === id);
    if (!pedido) { setErrorPedidos('Pedido no encontrado'); return; }
    setPedidosSeleccionados((prev) => [...prev, pedido]);
    setPedidoSelectorId('');
  };

  const quitarPedido = (id: number) => setPedidosSeleccionados((prev) => prev.filter((p) => p.id !== id));

  const pedidosParaSelector = pedidosDisponibles.filter(
    (p) => !pedidosSeleccionados.some((s) => s.id === p.id),
  );

  // ─── Mutations ───────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (d: FormData) => liquidacionesApi.crear({
      conductorId: parseInt(d.conductorId),
      placaTracto: d.placaTracto,
      placaCarreta: d.placaCarreta,
      montoEntregado: parseFloat(d.montoEntregado),
      reciboAnticipo: d.reciboAnticipo,
      fecha: d.fecha,
      guiaReferencia: d.guiaReferencia,
      observaciones: d.observaciones,
      pedidoIds: pedidosSeleccionados.map((p) => p.id),
    }),
    onSuccess: () => { toast.success('Liquidación creada'); setShowForm(false); resetForm(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const pagarMutation = useMutation({
    mutationFn: ({ id, cajaId, monto, fecha }: { id: number; cajaId: number; monto?: number; fecha?: string }) =>
      liquidacionesApi.pagar(id, { cajaId, montoPagado: monto, fechaPago: fecha }),
    onSuccess: () => {
      toast.success('Pago registrado — listo para rendir gastos');
      setShowPagarModal(null); setCajaSeleccionada(''); setMontoPagado('');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const rendirMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: RendirFormData }) =>
      liquidacionesApi.rendir(id, {
        detalles: data.detalles.map((d) => ({
          categoria: d.categoria as any,
          descripcion: d.descripcion,
          monto: parseFloat(d.monto),
        })),
        observaciones: data.observaciones,
      }),
    onSuccess: () => {
      toast.success('Gastos rendidos — listo para cerrar la liquidación');
      setShowRendirModal(null);
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cerrarMutation = useMutation({
    mutationFn: ({ id, cajaId, fecha }: { id: number; cajaId: number; fecha?: string }) =>
      liquidacionesApi.cerrar(id, { cajaId, fecha }),
    onSuccess: (res) => {
      const liq = res.data.data;
      if (Number(liq.devolucion) > 0) toast.success(`Liquidación cerrada — Devolución: ${formatCurrency(Number(liq.devolucion))}`);
      else if (Number(liq.reintegro) > 0) toast.success(`Liquidación cerrada — Reintegro: ${formatCurrency(Number(liq.reintegro))}`);
      else toast.success('Liquidación cerrada');
      setShowCerrarModal(null); setCajaSeleccionada('');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => liquidacionesApi.eliminar(id),
    onSuccess: () => { toast.success('Liquidación eliminada'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  const openRendirModal = (liq: Liquidacion) => {
    setShowRendirModal(liq);
    if (liq.detalles?.length > 0) {
      rendirReset({
        detalles: liq.detalles.map((d) => ({
          categoria: d.categoria as any,
          descripcion: d.descripcion,
          monto: String(d.monto),
        })),
        observaciones: liq.observaciones ?? '',
      });
    } else {
      rendirReset({ detalles: [{ categoria: 'PEAJE', descripcion: '', monto: '' }], observaciones: '' });
    }
  };

  const exportExcel = () => {
    const rows = liquidaciones.map((l) => ({
      '#': l.id, Fecha: formatDate(l.fecha), Conductor: l.conductor?.nombre,
      'Placa tracto': l.placaTracto, Estado: ESTADO_LABEL[l.estado] ?? l.estado,
      'Entregado S/': Number(l.montoEntregado), 'Pagado S/': l.montoPagado ? Number(l.montoPagado) : '',
      'Total gastos S/': Number(l.totalGastos), 'Devolución S/': Number(l.devolucion),
      'Reintegro S/': Number(l.reintegro),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidaciones');
    XLSX.writeFile(wb, `liquidaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const handlePrint = (liq: Liquidacion) => {
    const pedidoRows = (liq.pedidos ?? []).map(
      (lp) => `<tr><td>#${lp.pedido.id}</td><td>${lp.pedido.cliente.razonSocial}</td><td>${lp.pedido.origen}</td><td>${lp.pedido.destino}</td></tr>`,
    ).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<html><head><title>Liquidación #${liq.id}</title>
      <style>body{font-family:sans-serif;padding:20px;font-size:13px}h2{margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
      th{background:#f5f5f5}.totals{margin-top:16px;text-align:right}.totals p{margin:4px 0}.bold{font-weight:700}h3{margin-top:16px;font-size:13px}</style></head>
      <body>
        <h2>Liquidación #${liq.id}</h2>
        <p>Fecha: ${formatDate(liq.fecha)} | Estado: ${ESTADO_LABEL[liq.estado] ?? liq.estado}</p>
        <p>Conductor: ${liq.conductor?.nombre} | Tracto: ${liq.placaTracto}${liq.placaCarreta ? ' | Carreta: ' + liq.placaCarreta : ''}</p>
        <table><tr><th>Categoría</th><th>Descripción</th><th>Monto</th></tr>
        ${(liq.detalles || []).map((d) => `<tr><td>${CATEGORIA_LABEL[d.categoria]}</td><td>${d.descripcion}</td><td>S/ ${Number(d.monto).toFixed(2)}</td></tr>`).join('')}
        </table>
        ${pedidoRows ? `<h3>Pedidos</h3><table><tr><th>Pedido</th><th>Cliente</th><th>Origen</th><th>Destino</th></tr>${pedidoRows}</table>` : ''}
        <div class="totals">
          <p>Monto entregado: <span class="bold">S/ ${Number(liq.montoEntregado).toFixed(2)}</span></p>
          ${liq.montoPagado ? `<p>Monto pagado: <span class="bold">S/ ${Number(liq.montoPagado).toFixed(2)}</span></p>` : ''}
          <p>Total gastos: <span class="bold">S/ ${Number(liq.totalGastos).toFixed(2)}</span></p>
          ${Number(liq.devolucion) > 0 ? `<p style="color:green">Devolución: <span class="bold">S/ ${Number(liq.devolucion).toFixed(2)}</span></p>` : ''}
          ${Number(liq.reintegro) > 0 ? `<p style="color:red">Reintegro: <span class="bold">S/ ${Number(liq.reintegro).toFixed(2)}</span></p>` : ''}
        </div>
      </body></html>`);
    w.document.close(); w.print();
  };

  const filtered = liquidaciones.filter((l) =>
    search
      ? l.conductor?.nombre.toLowerCase().includes(search.toLowerCase()) ||
        l.placaTracto.toLowerCase().includes(search.toLowerCase())
      : true,
  );

  // ─── Cálculo diferencia para cierre ──────────────────────────────────────────
  const calcularDiferenciaCierre = (liq: Liquidacion) => {
    const pagado = Number(liq.montoPagado ?? liq.montoEntregado);
    const rendido = Number(liq.montoRendido ?? liq.totalGastos);
    const diff = pagado - rendido;
    return { pagado, rendido, diff, devolucion: diff > 0 ? diff : 0, reintegro: diff < 0 ? Math.abs(diff) : 0 };
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="page-container">
      <PageHeader
        title="Liquidaciones"
        description={`${liquidaciones.length} liquidación${liquidaciones.length !== 1 ? 'es' : ''}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
            <Button onClick={() => { setShowForm(true); resetForm(); }}><Plus className="w-4 h-4" /> Nueva liquidación</Button>
          </div>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total liquidaciones" value={liquidaciones.length} color="default" />
        <StatCard label="Total entregado" value={formatCurrency(liquidaciones.reduce((s, l) => s + Number(l.montoEntregado), 0))} color="blue" />
        <StatCard label="Total gastos" value={formatCurrency(liquidaciones.reduce((s, l) => s + Number(l.totalGastos), 0))} color="red" />
        <StatCard label="Cerradas" value={liquidaciones.filter((l) => l.estado === 'CERRADA').length} color="default" />
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

      {isLoading ? <TableSkeleton rows={5} cols={9} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th><Th>Fecha</Th><Th>Conductor</Th><Th>Tracto</Th><Th>Pedidos</Th>
              <Th>Entregado</Th><Th>Total gastos</Th><Th>Ajuste</Th><Th>Estado</Th><Th>Acciones</Th>
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
                      <Package className="w-3 h-3" />{(l.pedidos ?? []).length}
                    </span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </Td>
                <Td><span className="text-sm">{formatCurrency(Number(l.montoEntregado))}</span></Td>
                <Td><span className="font-semibold">{formatCurrency(Number(l.totalGastos))}</span></Td>
                <Td>
                  {l.estado === 'CERRADA' && Number(l.devolucion) > 0 && (
                    <span className="text-emerald-500 font-medium text-sm">+{formatCurrency(Number(l.devolucion))}</span>
                  )}
                  {l.estado === 'CERRADA' && Number(l.reintegro) > 0 && (
                    <span className="text-red-500 font-medium text-sm">-{formatCurrency(Number(l.reintegro))}</span>
                  )}
                  {(l.estado !== 'CERRADA' || (Number(l.devolucion) === 0 && Number(l.reintegro) === 0)) && (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </Td>
                <Td>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLOR[l.estado] ?? 'text-muted-foreground bg-muted border-border'}`}>
                    {ESTADO_LABEL[l.estado] ?? l.estado}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setViewing(l)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver detalle">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {/* Paso 2: Pagar (solo CREADA o estados legacy) */}
                    {(l.estado === 'CREADA' || l.estado === 'PENDIENTE_RENDICION' || l.estado === 'PENDIENTE') && (
                      <button
                        onClick={() => { setShowPagarModal(l); setCajaSeleccionada(''); setMontoPagado(String(Number(l.montoEntregado))); setFechaPago(new Date().toISOString().split('T')[0]); }}
                        className="p-1.5 rounded-md hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-all"
                        title="Pagar liquidación"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Paso 3: Rendir (solo PAGADA) */}
                    {l.estado === 'PAGADA' && (
                      <button
                        onClick={() => openRendirModal(l)}
                        className="p-1.5 rounded-md hover:bg-amber-50 text-amber-500 hover:text-amber-700 transition-all"
                        title="Rendir gastos"
                      >
                        <ClipboardList className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {/* Paso 4: Cerrar (solo RENDIDA) */}
                    {l.estado === 'RENDIDA' && (
                      <button
                        onClick={() => { setShowCerrarModal(l); setCajaSeleccionada(''); setFechaCierre(new Date().toISOString().split('T')[0]); }}
                        className="p-1.5 rounded-md hover:bg-purple-50 text-purple-500 hover:text-purple-700 transition-all"
                        title="Cerrar liquidación (registrar ajuste)"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {l.estado === 'CERRADA' && (
                      <span className="p-1.5 text-muted-foreground/40" title="Liquidación cerrada">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                    <button onClick={() => setShowHistorial(l)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Historial">
                      <History className="w-3.5 h-3.5" />
                    </button>
                    {(l.estado === 'CREADA' || l.estado === 'PENDIENTE_RENDICION' || l.estado === 'PENDIENTE') && (
                      <button onClick={() => { if (confirm('¿Eliminar liquidación?')) deleteMutation.mutate(l.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={10}><EmptyState message="No hay liquidaciones" /></td></tr>}
          </tbody>
        </Table>
      )}

      {/* ─── Modal: Nueva Liquidación ────────────────────────────────────────── */}
      <Modal open={showForm} onClose={() => { setShowForm(false); resetForm(); }} title="Nueva liquidación" maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
            <strong>Paso 1 de 4 — Anticipo.</strong> Registrá el monto entregado al conductor antes del viaje.
            El pago formal, la rendición de gastos y el ajuste final se harán en pasos posteriores.
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Conductor" required error={errors.conductorId?.message}>
              <Select {...register('conductorId')}>
                <option value="">Seleccionar...</option>
                {conductores.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </FormField>
            <FormField label="Fecha" required error={errors.fecha?.message}>
              <Input type="date" {...register('fecha')} />
            </FormField>
            <FormField label="Placa Tracto" required error={errors.placaTracto?.message}>
              <Select {...register('placaTracto')}>
                <option value="">Seleccionar...</option>
                {vehiculos.filter((v: any) => v.tipo === 'TRACTO').map((v: any) => <option key={v.id} value={v.placa}>{v.placa} — {v.marca}</option>)}
              </Select>
            </FormField>
            <FormField label="Placa Carreta" error={errors.placaCarreta?.message}>
              <Select {...register('placaCarreta')}>
                <option value="">Sin carreta</option>
                {vehiculos.filter((v: any) => v.tipo === 'CARRETA').map((v: any) => <option key={v.id} value={v.placa}>{v.placa}</option>)}
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

          {/* Pedidos */}
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Package className="w-4 h-4 text-muted-foreground" /> Pedidos relacionados <span className="text-xs font-normal text-muted-foreground">(opcional)</span></p>
            <div className="flex gap-2 mb-2">
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={pedidoSelectorId}
                onChange={(e) => { setPedidoSelectorId(e.target.value); setErrorPedidos(''); }}
              >
                <option value="">Seleccionar pedido...</option>
                {pedidosParaSelector.map((p) => <option key={p.id} value={p.id}>#{p.id} — {p.cliente.razonSocial} | {p.origen} → {p.destino}</option>)}
              </select>
              <Button type="button" variant="secondary" size="sm" onClick={agregarPedido} disabled={!pedidoSelectorId}><Plus className="w-3.5 h-3.5" /> Agregar</Button>
            </div>
            {errorPedidos && <p className="text-xs text-destructive mb-2">{errorPedidos}</p>}
            {pedidosSeleccionados.length > 0 ? (
              <Table>
                <thead><tr><Th>#</Th><Th>Cliente</Th><Th>Origen</Th><Th>Destino</Th><Th className="w-8">&nbsp;</Th></tr></thead>
                <tbody>
                  {pedidosSeleccionados.map((p) => (
                    <Tr key={p.id}>
                      <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                      <Td><span className="text-sm font-medium">{p.cliente.razonSocial}</span></Td>
                      <Td><span className="text-sm">{p.origen}</span></Td>
                      <Td><span className="text-sm">{p.destino}</span></Td>
                      <Td><button type="button" onClick={() => quitarPedido(p.id)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button></Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            ) : <p className="text-xs text-muted-foreground italic">Sin pedidos asociados.</p>}
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

      {/* ─── Modal: Pagar Liquidación (CREADA→PAGADA) ─────────────────────────── */}
      <Modal open={!!showPagarModal} onClose={() => { setShowPagarModal(null); setCajaSeleccionada(''); }} title="Paso 2 — Pagar liquidación">
        {showPagarModal && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/30 rounded-lg p-3 text-sm">
              <p className="font-semibold">{showPagarModal.conductor?.nombre}</p>
              <p className="text-muted-foreground text-xs">Monto entregado (anticipo): <span className="font-bold text-foreground">{formatCurrency(Number(showPagarModal.montoEntregado))}</span></p>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-700">
              Registrá el pago efectivo al conductor. El monto puede diferir del anticipo original.
            </div>
            <FormField label="Caja de pago" required>
              <Select value={cajaSeleccionada} onChange={(e) => setCajaSeleccionada(e.target.value)}>
                <option value="">Seleccionar caja...</option>
                {cajasAbiertas.length === 0 && <option disabled>No hay cajas abiertas</option>}
                {cajasAbiertas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre ?? `Caja #${c.id}`} — {c.usuario?.nombre} — Saldo: {formatCurrency(c.saldoActual)}</option>)}
              </Select>
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Monto pagado (S/)" required>
                <Input type="number" step="0.01" value={montoPagado} onChange={(e) => setMontoPagado(e.target.value)} placeholder="0.00" />
              </FormField>
              <FormField label="Fecha de pago" required>
                <Input type="date" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
              </FormField>
            </div>
            {cajasAbiertas.length === 0 && <p className="text-xs text-destructive">Abra una caja antes de registrar el pago.</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setShowPagarModal(null); setCajaSeleccionada(''); }}>Cancelar</Button>
              <Button
                disabled={!cajaSeleccionada || !montoPagado || pagarMutation.isPending || cajasAbiertas.length === 0}
                onClick={() => pagarMutation.mutate({ id: showPagarModal.id, cajaId: parseInt(cajaSeleccionada), monto: parseFloat(montoPagado), fecha: fechaPago })}
              >
                {pagarMutation.isPending ? 'Registrando...' : `Confirmar pago ${montoPagado ? formatCurrency(parseFloat(montoPagado)) : ''}`}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Modal: Rendir Gastos (PAGADA→RENDIDA) ────────────────────────────── */}
      <Modal open={!!showRendirModal} onClose={() => setShowRendirModal(null)} title="Paso 3 — Rendir gastos del viaje" maxWidth="max-w-2xl">
        {showRendirModal && (
          <form onSubmit={rendirHandleSubmit((d) => rendirMutation.mutate({ id: showRendirModal.id, data: d }))} className="flex flex-col gap-4">
            <div className="bg-muted/30 rounded-lg p-3 grid grid-cols-3 gap-2 text-sm">
              <div><p className="text-xs text-muted-foreground">Conductor</p><p className="font-medium">{showRendirModal.conductor?.nombre}</p></div>
              <div><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium">{formatDate(showRendirModal.fecha)}</p></div>
              <div><p className="text-xs text-muted-foreground">Monto pagado</p><p className="font-bold">{formatCurrency(Number(showRendirModal.montoPagado ?? showRendirModal.montoEntregado))}</p></div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
              <strong>Paso 3 de 4 — Rendición.</strong> Registrá todos los gastos reales del viaje con sus comprobantes.
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">Detalle de gastos</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => rendirAppend({ categoria: 'PEAJE', descripcion: '', monto: '' })}><Plus className="w-3 h-3" /> Agregar</Button>
              </div>
              {rendirErrors.detalles?.root && <p className="text-xs text-destructive mb-1">{rendirErrors.detalles.root.message}</p>}
              <div className="flex flex-col gap-2">
                {rendirFields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-8 gap-2 items-start">
                    <div className="col-span-2">
                      <Select {...rendirRegister(`detalles.${index}.categoria`)}>
                        <option value="PEAJE">Peaje</option>
                        <option value="BALANZA">Balanza</option>
                        <option value="VIATICO">Viático</option>
                        <option value="TOLDO">Toldo</option>
                        <option value="OTROS">Otros</option>
                      </Select>
                    </div>
                    <div className="col-span-4">
                      <Input placeholder="Descripción" {...rendirRegister(`detalles.${index}.descripcion`)} />
                      {rendirErrors.detalles?.[index]?.descripcion && <p className="text-xs text-destructive mt-0.5">{rendirErrors.detalles[index]?.descripcion?.message}</p>}
                    </div>
                    <div className="col-span-1">
                      <Input type="number" step="0.01" placeholder="0.00" {...rendirRegister(`detalles.${index}.monto`)} />
                    </div>
                    <div className="col-span-1 flex items-center pt-0.5">
                      <button type="button" onClick={() => rendirRemove(index)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/40 rounded-xl p-4 grid grid-cols-3 gap-3 text-center">
              <div><p className="text-xs text-muted-foreground">Monto pagado</p><p className="font-bold">{formatCurrency(rendirEntregado)}</p></div>
              <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-bold">{formatCurrency(rendirTotal)}</p></div>
              <div>
                <p className="text-xs text-muted-foreground">Diferencia estimada</p>
                <p className={`font-bold ${rendirEntregado - rendirTotal > 0 ? 'text-emerald-500' : rendirEntregado - rendirTotal < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                  {rendirEntregado - rendirTotal > 0 ? `+${formatCurrency(rendirEntregado - rendirTotal)}` : rendirEntregado - rendirTotal < 0 ? `-${formatCurrency(Math.abs(rendirEntregado - rendirTotal))}` : 'Exacto'}
                </p>
              </div>
            </div>

            <FormField label="Observaciones">
              <Textarea placeholder="Observaciones del viaje..." {...rendirRegister('observaciones')} />
            </FormField>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" type="button" onClick={() => setShowRendirModal(null)}>Cancelar</Button>
              <Button type="submit" loading={rendirIsSubmitting || rendirMutation.isPending}>Confirmar rendición</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ─── Modal: Cerrar Liquidación (RENDIDA→CERRADA) ─────────────────────── */}
      <Modal open={!!showCerrarModal} onClose={() => { setShowCerrarModal(null); setCajaSeleccionada(''); }} title="Paso 4 — Cerrar liquidación">
        {showCerrarModal && (() => {
          const { pagado, rendido, diff, devolucion, reintegro } = calcularDiferenciaCierre(showCerrarModal);
          return (
            <div className="flex flex-col gap-4">
              <div className="bg-muted/30 rounded-lg p-3 text-sm">
                <p className="font-semibold">{showCerrarModal.conductor?.nombre}</p>
              </div>

              <div className="grid grid-cols-3 gap-3 bg-muted/40 rounded-xl p-4 text-center">
                <div><p className="text-xs text-muted-foreground">Monto pagado</p><p className="font-bold">{formatCurrency(pagado)}</p></div>
                <div><p className="text-xs text-muted-foreground">Total rendido</p><p className="font-bold">{formatCurrency(rendido)}</p></div>
                <div>
                  {Math.abs(diff) < 0.01 ? (
                    <><p className="text-xs text-muted-foreground">Resultado</p><p className="font-bold text-emerald-500">Exacto</p></>
                  ) : diff > 0 ? (
                    <><p className="text-xs text-muted-foreground">Devolución</p><p className="font-bold text-emerald-500">+{formatCurrency(devolucion)}</p><p className="text-xs text-emerald-600">El conductor devuelve dinero</p></>
                  ) : (
                    <><p className="text-xs text-muted-foreground">Reintegro</p><p className="font-bold text-red-500">-{formatCurrency(reintegro)}</p><p className="text-xs text-red-600">La empresa paga adicional</p></>
                  )}
                </div>
              </div>

              {Math.abs(diff) >= 0.01 && (
                <div className={`rounded-lg p-3 text-xs ${diff > 0 ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                  {diff > 0
                    ? `Se registrará un INGRESO de ${formatCurrency(devolucion)} en la caja seleccionada (el conductor devuelve el excedente).`
                    : `Se registrará un EGRESO de ${formatCurrency(reintegro)} en la caja seleccionada (la empresa paga el faltante al conductor).`}
                </div>
              )}

              <FormField label="Caja para el ajuste" required>
                <Select value={cajaSeleccionada} onChange={(e) => setCajaSeleccionada(e.target.value)}>
                  <option value="">Seleccionar caja...</option>
                  {cajasAbiertas.length === 0 && <option disabled>No hay cajas abiertas</option>}
                  {cajasAbiertas.map((c: any) => <option key={c.id} value={c.id}>{c.nombre ?? `Caja #${c.id}`} — {c.usuario?.nombre} — Saldo: {formatCurrency(c.saldoActual)}</option>)}
                </Select>
              </FormField>
              <FormField label="Fecha de cierre">
                <Input type="date" value={fechaCierre} onChange={(e) => setFechaCierre(e.target.value)} />
              </FormField>
              {cajasAbiertas.length === 0 && <p className="text-xs text-destructive">Abra una caja para registrar el ajuste.</p>}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="secondary" onClick={() => { setShowCerrarModal(null); setCajaSeleccionada(''); }}>Cancelar</Button>
                <Button
                  disabled={!cajaSeleccionada || cerrarMutation.isPending || cajasAbiertas.length === 0}
                  onClick={() => cerrarMutation.mutate({ id: showCerrarModal.id, cajaId: parseInt(cajaSeleccionada), fecha: fechaCierre })}
                >
                  {cerrarMutation.isPending ? 'Cerrando...' : 'Confirmar cierre'}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* ─── Modal: Ver Detalle ───────────────────────────────────────────────── */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Liquidación #${viewing?.id}`} maxWidth="max-w-lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            <span className={`inline-flex w-fit items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${ESTADO_COLOR[viewing.estado] ?? 'text-muted-foreground bg-muted border-border'}`}>
              {ESTADO_LABEL[viewing.estado] ?? viewing.estado}
            </span>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Conductor</p><p className="font-medium">{viewing.conductor?.nombre}</p></div>
              <div><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium">{formatDate(viewing.fecha)}</p></div>
              <div><p className="text-xs text-muted-foreground">Tracto</p><p className="font-mono font-medium">{viewing.placaTracto}</p></div>
              {viewing.placaCarreta && <div><p className="text-xs text-muted-foreground">Carreta</p><p className="font-mono font-medium">{viewing.placaCarreta}</p></div>}
              <div><p className="text-xs text-muted-foreground">Monto entregado</p><p className="font-bold">{formatCurrency(Number(viewing.montoEntregado))}</p></div>
              {viewing.montoPagado != null && <div><p className="text-xs text-muted-foreground">Monto pagado</p><p className="font-bold text-blue-600">{formatCurrency(Number(viewing.montoPagado))}</p></div>}
              {viewing.fechaPago && <div><p className="text-xs text-muted-foreground">Fecha pago</p><p className="font-medium">{formatDate(viewing.fechaPago)}</p></div>}
              {viewing.fechaRendicion && <div><p className="text-xs text-muted-foreground">Fecha rendición</p><p className="font-medium">{formatDate(viewing.fechaRendicion)}</p></div>}
            </div>

            {(viewing.pedidos ?? []).length > 0 && (
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Package className="w-4 h-4 text-muted-foreground" /> Pedidos</p>
                <Table>
                  <thead><tr><Th>Pedido</Th><Th>Cliente</Th><Th>Origen</Th><Th>Destino</Th></tr></thead>
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

            {viewing.detalles?.length > 0 && (
              <>
                <Table>
                  <thead><tr><Th>Categoría</Th><Th>Descripción</Th><Th className="text-right">Monto</Th></tr></thead>
                  <tbody>
                    {viewing.detalles.map((d, i) => (
                      <Tr key={i}>
                        <Td><span className="text-xs">{CATEGORIA_LABEL[d.categoria]}</span></Td>
                        <Td><span className="text-sm">{d.descripcion}</span></Td>
                        <Td className="text-right"><span className="text-sm font-medium">{formatCurrency(Number(d.monto))}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
                <div className="grid grid-cols-4 gap-3 bg-muted/40 rounded-xl p-3 text-center">
                  <div><p className="text-xs text-muted-foreground">Pagado</p><p className="font-bold text-sm">{formatCurrency(Number(viewing.montoPagado ?? viewing.montoEntregado))}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-bold text-sm">{formatCurrency(Number(viewing.totalGastos))}</p></div>
                  <div><p className="text-xs text-muted-foreground">Devolución</p><p className={`font-bold text-sm ${Number(viewing.devolucion) > 0 ? 'text-emerald-500' : ''}`}>{formatCurrency(Number(viewing.devolucion))}</p></div>
                  <div><p className="text-xs text-muted-foreground">Reintegro</p><p className={`font-bold text-sm ${Number(viewing.reintegro) > 0 ? 'text-red-500' : ''}`}>{formatCurrency(Number(viewing.reintegro))}</p></div>
                </div>
              </>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => handlePrint(viewing)}><Printer className="w-4 h-4" /> Imprimir</Button>
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─── Modal: Historial Financiero ─────────────────────────────────────── */}
      <Modal open={!!showHistorial} onClose={() => setShowHistorial(null)} title={`Historial — Liquidación #${showHistorial?.id}`} maxWidth="max-w-xl">
        {showHistorial && (
          <div className="flex flex-col gap-4">
            {loadingHistorial ? <p className="text-sm text-muted-foreground">Cargando...</p> : historialData ? (
              <>
                <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-lg p-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Estado</p><p className="font-semibold">{ESTADO_LABEL[historialData.liquidacion.estado] ?? historialData.liquidacion.estado}</p></div>
                  <div><p className="text-xs text-muted-foreground">Monto entregado</p><p className="font-semibold">{formatCurrency(historialData.liquidacion.montoEntregado)}</p></div>
                  {historialData.liquidacion.montoPagado != null && <div><p className="text-xs text-muted-foreground">Monto pagado</p><p className="font-semibold text-blue-600">{formatCurrency(historialData.liquidacion.montoPagado)}</p></div>}
                  {historialData.liquidacion.montoRendido != null && <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-semibold">{formatCurrency(historialData.liquidacion.montoRendido)}</p></div>}
                  {historialData.liquidacion.reintegro > 0 && <div><p className="text-xs text-muted-foreground">Reintegro</p><p className="font-semibold text-red-500">{formatCurrency(historialData.liquidacion.reintegro)}</p></div>}
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
                ) : <EmptyState message="Sin movimientos financieros registrados" />}
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
