// FILE: src/app/(dashboard)/reportes/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi } from '@/services/api';
import { formatCurrency, formatDate, ESTADO_PEDIDO_LABEL, ESTADO_FACTURA_LABEL, CLASIFICACION_MES_LABEL } from '@/lib/utils';
import {
  PageHeader, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, StatCard, Input, Select, Modal,
} from '@/components/shared';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend,
} from 'recharts';
import { Eye } from 'lucide-react';

const TABS = [
  { id: 'pedidos',     label: 'Pedidos' },
  { id: 'facturacion', label: 'Facturación' },
  { id: 'cobranza',    label: 'Cobranza' },
  { id: 'caja',        label: 'Caja' },
  { id: 'egresos',     label: 'Egresos' },
  { id: 'anual',       label: 'Reporte Anual' },
];

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

export default function ReportesPage() {
  const [tab, setTab] = useState('pedidos');
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0];
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [anioReporte, setAnioReporte] = useState(() => new Date().getFullYear());

  // Estado para modales de detalle
  const [detalleRentCliente, setDetalleRentCliente] = useState<{ id: number; nombre: string } | null>(null);
  const [detalleFacCliente, setDetalleFacCliente] = useState<{ id: number; nombre: string } | null>(null);

  const params = { desde: desde || undefined, hasta: hasta || undefined };

  const { data: pedidosData, isLoading: lPedidos } = useQuery({
    queryKey: ['reporte', 'pedidos', desde, hasta],
    queryFn: () => reportesApi.pedidos(params).then((r) => r.data.data),
    enabled: tab === 'pedidos',
  });

  const { data: rentCliente, isLoading: lRentCliente } = useQuery({
    queryKey: ['reporte', 'rentabilidad-cliente', desde, hasta],
    queryFn: () => reportesApi.rentabilidadCliente(params).then((r) => r.data.data),
    enabled: tab === 'pedidos',
  });

  const { data: rentClienteDetalle, isLoading: lRentDetalle } = useQuery({
    queryKey: ['reporte', 'rentabilidad-cliente-detalle', detalleRentCliente?.id, desde, hasta],
    queryFn: () => reportesApi.rentabilidadClienteDetalle(detalleRentCliente!.id, params).then((r) => r.data.data),
    enabled: !!detalleRentCliente,
  });

  const { data: facData, isLoading: lFac } = useQuery({
    queryKey: ['reporte', 'facturacion', desde, hasta],
    queryFn: () => reportesApi.facturacion(params).then((r) => r.data.data),
    enabled: tab === 'facturacion',
  });

  const { data: cobData, isLoading: lCob } = useQuery({
    queryKey: ['reporte', 'cobranza', desde, hasta],
    queryFn: () => reportesApi.cobranza(params).then((r) => r.data.data),
    enabled: tab === 'cobranza',
  });

  const { data: cajaData, isLoading: lCaja } = useQuery({
    queryKey: ['reporte', 'caja', desde, hasta],
    queryFn: () => reportesApi.caja(params).then((r) => r.data.data),
    enabled: tab === 'caja',
  });

  const { data: egresosData, isLoading: lEgresos } = useQuery({
    queryKey: ['reporte', 'egresos', desde, hasta],
    queryFn: () => reportesApi.egresos(params).then((r) => r.data.data),
    enabled: tab === 'egresos',
  });

  const { data: anualData, isLoading: lAnual } = useQuery({
    queryKey: ['reporte', 'anual', anioReporte],
    queryFn: () => reportesApi.anual({ anio: anioReporte }).then((r) => r.data.data),
    enabled: tab === 'anual',
  });

  const pedidosPorCliente = useMemo(() => {
    const conteo = new Map<string, number>();
    for (const p of pedidosData?.pedidos ?? []) {
      const nombre = p.cliente?.razonSocial ?? 'Sin cliente';
      conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
    }
    return Array.from(conteo.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [pedidosData]);

  // Facturas del cliente seleccionado para modal de facturación
  const facturasDelCliente = useMemo(() => {
    if (!detalleFacCliente || !facData) return [];
    return (facData.facturas as any[]).filter((f) => f.clienteId === detalleFacCliente.id);
  }, [detalleFacCliente, facData]);

  const aniosDisponibles = useMemo(() => {
    const actual = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => actual - i);
  }, []);

  return (
    <div className="page-container">
      <PageHeader title="Reportes" description="Análisis por módulo y período" />

      {/* Filters */}
      {tab === 'anual' ? (
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Año</label>
          <Select className="w-28" value={anioReporte} onChange={(e) => setAnioReporte(parseInt(e.target.value))}>
            {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Desde</label>
            <Input type="date" className="w-36" value={desde} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Hasta</label>
            <Input type="date" className="w-36" value={hasta} onChange={(e) => setHasta(e.target.value)} />
          </div>
          {(desde || hasta) && (
            <button onClick={() => { setDesde(''); setHasta(''); }} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
              × Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-lg w-fit flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── PEDIDOS ── */}
      {tab === 'pedidos' && (
        <div className="flex flex-col gap-4">
          {pedidosData && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Total pedidos" value={pedidosData.totales.cantidad} color="default" />
              <StatCard label="Tarifa total" value={formatCurrency(pedidosData.totales.tarifaTotal)} color="blue" />
            </div>
          )}

          {/* Gráfico pedidos por cliente */}
          {pedidosPorCliente.length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold mb-4">Pedidos por cliente</p>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pedidosPorCliente} cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={3}>
                    {pedidosPorCliente.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Rentabilidad por cliente */}
          <div>
            <p className="text-sm font-semibold mb-1">Rentabilidad por cliente</p>
            <p className="text-xs text-muted-foreground mb-3">
              Facturación real (sum. facturas activas). Costos distribuidos proporcionalmente entre los pedidos de cada liquidación.
            </p>
            {lRentCliente ? <TableSkeleton rows={4} cols={7} /> : (
              <Table>
                <thead>
                  <tr>
                    <Th>Cliente</Th>
                    <Th>Pedidos</Th>
                    <Th>Facturación</Th>
                    <Th>Costos</Th>
                    <Th>Utilidad</Th>
                    <Th>Margen</Th>
                    <Th>Detalle</Th>
                  </tr>
                </thead>
                <tbody>
                  {rentCliente?.clientes.length ? rentCliente.clientes.map((c) => (
                    <Tr key={c.clienteId}>
                      <Td><span className="text-sm font-medium">{c.razonSocial}</span></Td>
                      <Td><span className="text-sm text-muted-foreground">{c.cantidadPedidos}</span></Td>
                      <Td><span className="font-medium text-emerald-500">{formatCurrency(c.facturacion)}</span></Td>
                      <Td><span className="font-medium text-destructive">{formatCurrency(c.costos)}</span></Td>
                      <Td>
                        <span className={`font-semibold ${c.utilidad >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                          {formatCurrency(c.utilidad)}
                        </span>
                      </Td>
                      <Td>
                        <span className={`text-sm font-medium ${c.margen >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                          {c.margen.toFixed(1)}%
                        </span>
                      </Td>
                      <Td>
                        <button
                          onClick={() => setDetalleRentCliente({ id: c.clienteId, nombre: c.razonSocial })}
                          className="text-xs text-primary hover:underline flex items-center gap-1"
                        >
                          <Eye className="w-3 h-3" /> Ver detalle
                        </button>
                      </Td>
                    </Tr>
                  )) : <tr><td colSpan={7}><EmptyState message="Sin datos en el período" /></td></tr>}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* ── FACTURACIÓN ── */}
      {tab === 'facturacion' && (
        <div className="flex flex-col gap-4">
          {facData && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Facturas" value={facData.totales.cantidad} color="default" />
              <StatCard label="Subtotal" value={formatCurrency(facData.totales.subtotal)} color="default" />
              <StatCard label="IGV" value={formatCurrency(facData.totales.igv)} color="yellow" />
              <StatCard label="Total" value={formatCurrency(facData.totales.total)} color="blue" />
            </div>
          )}

          {/* Tabla agrupada por cliente */}
          {lFac ? <TableSkeleton rows={5} cols={7} /> : (
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Total facturas</Th>
                  <Th>Emitidas</Th>
                  <Th>Pagadas</Th>
                  <Th>Parciales</Th>
                  <Th>Monto total</Th>
                  <Th>Detalle</Th>
                </tr>
              </thead>
              <tbody>
                {facData?.resumenPorCliente.length ? facData.resumenPorCliente.map((c) => (
                  <Tr key={c.clienteId}>
                    <Td><span className="text-sm font-medium">{c.razonSocial}</span></Td>
                    <Td><span className="text-sm">{c.totalFacturas}</span></Td>
                    <Td><span className="text-sm text-blue-500">{c.emitidas}</span></Td>
                    <Td><span className="text-sm text-emerald-500">{c.pagadas}</span></Td>
                    <Td><span className="text-sm text-yellow-500">{c.parciales}</span></Td>
                    <Td><span className="font-semibold">{formatCurrency(c.montoTotal)}</span></Td>
                    <Td>
                      <button
                        onClick={() => setDetalleFacCliente({ id: c.clienteId, nombre: c.razonSocial })}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Ver detalle
                      </button>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={7}><EmptyState message="Sin facturas en el período" /></td></tr>}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* ── COBRANZA ── */}
      {tab === 'cobranza' && (
        <div className="flex flex-col gap-4">
          {cobData && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <StatCard label="Total cobrado" value={formatCurrency(cobData.totales.totalCobrado)} color="green" />
              <StatCard label="Pagos registrados" value={cobData.totales.cantidad} color="default" />
            </div>
          )}

          {/* Tabla resumen por cliente */}
          {lCob ? <TableSkeleton rows={5} cols={5} /> : (
            <Table>
              <thead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Total facturado</Th>
                  <Th>Total cobrado</Th>
                  <Th>Saldo pendiente</Th>
                  <Th>% cobrado</Th>
                </tr>
              </thead>
              <tbody>
                {cobData?.resumenPorCliente.length ? cobData.resumenPorCliente.map((c) => (
                  <Tr key={c.clienteId}>
                    <Td><span className="text-sm font-medium">{c.razonSocial}</span></Td>
                    <Td><span className="font-medium">{formatCurrency(c.totalFacturado)}</span></Td>
                    <Td><span className="font-medium text-emerald-500">{formatCurrency(c.totalCobrado)}</span></Td>
                    <Td>
                      <span className={`font-medium ${c.saldoPendiente > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`}>
                        {formatCurrency(c.saldoPendiente)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted rounded-full h-1.5 max-w-16">
                          <div
                            className="bg-emerald-500 h-1.5 rounded-full"
                            style={{ width: `${Math.min(c.porcentajeCobrado, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium">{c.porcentajeCobrado.toFixed(0)}%</span>
                      </div>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={5}><EmptyState message="Sin cobranza en el período" /></td></tr>}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* ── CAJA ── */}
      {tab === 'caja' && (
        <div className="flex flex-col gap-4">
          {cajaData && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Total ingresos" value={formatCurrency(cajaData.totalesGlobales.ingresos)} color="green" />
              <StatCard label="Total egresos" value={formatCurrency(cajaData.totalesGlobales.egresos)} color="red" />
            </div>
          )}
          {lCaja ? <TableSkeleton rows={5} cols={5} /> : (
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Usuario</Th><Th>Ingresos</Th><Th>Egresos</Th><Th>Saldo calculado</Th><Th>Estado</Th></tr></thead>
              <tbody>
                {cajaData?.cajas.length ? cajaData.cajas.map((c: any) => (
                  <Tr key={c.id}>
                    <Td><span className="text-sm">{formatDate(c.fecha)}</span></Td>
                    <Td><span className="text-sm">{c.usuario?.nombre}</span></Td>
                    <Td><span className="text-emerald-500 font-medium">{formatCurrency(c.ingresos)}</span></Td>
                    <Td><span className="text-red-500 font-medium">{formatCurrency(c.egresos)}</span></Td>
                    <Td><span className="font-semibold">{formatCurrency(c.saldoCalculado)}</span></Td>
                    <Td><Badge value={c.estado} label={c.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'} /></Td>
                  </Tr>
                )) : <tr><td colSpan={6}><EmptyState /></td></tr>}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* ── EGRESOS ── */}
      {tab === 'egresos' && (
        <div className="flex flex-col gap-4">
          {egresosData && (
            <div className="grid grid-cols-2 gap-4">
              <StatCard label="Total egresos" value={formatCurrency(egresosData.totales.totalEgresos)} color="red" />
              <StatCard label="Registros" value={egresosData.totales.cantidad} color="default" />
            </div>
          )}

          {lEgresos ? <TableSkeleton rows={6} cols={4} /> : (
            <Table>
              <thead>
                <tr><Th>Fecha</Th><Th>Concepto</Th><Th>Cuenta</Th><Th className="text-right">Monto</Th></tr>
              </thead>
              <tbody>
                {egresosData?.egresos.length ? egresosData.egresos.map((e: any) => (
                  <Tr key={e.id}>
                    <Td><span className="text-sm">{formatDate(e.fecha)}</span></Td>
                    <Td><span className="text-sm font-medium">{e.concepto}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{e.cuenta?.nombre ?? '—'}</span></Td>
                    <Td className="text-right"><span className="font-semibold text-destructive">{formatCurrency(Number(e.monto))}</span></Td>
                  </Tr>
                )) : <tr><td colSpan={4}><EmptyState message="Sin egresos en el período" /></td></tr>}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* ── REPORTE ANUAL ── */}
      {tab === 'anual' && (
        <div className="flex flex-col gap-4">
          {lAnual ? <TableSkeleton rows={12} cols={7} /> : anualData && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Pedidos del año" value={anualData.totales.pedidos} color="default" />
                <StatCard label="Facturado" value={formatCurrency(anualData.totales.facturado)} color="blue" />
                <StatCard label="Cobrado" value={formatCurrency(anualData.totales.cobrado)} color="green" />
                <StatCard label="Gastos" value={formatCurrency(anualData.totales.gastos)} color="red" />
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Utilidad anual" value={formatCurrency(anualData.totales.utilidad)} color={anualData.totales.utilidad >= 0 ? 'green' : 'red'} />
                <StatCard label="Promedio mensual de utilidad" value={formatCurrency(anualData.promedioUtilidadMensual)} color="default" />
              </div>

              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold mb-1">Resumen mensual {anualData.anio}</p>
                <p className="text-xs text-muted-foreground mb-4">Facturado, gastos y utilidad por mes (utilidad = facturado − gastos)</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={anualData.meses.map((m) => ({ name: m.nombreMes.slice(0, 3), facturado: m.facturado, gastos: m.gastos, utilidad: m.utilidad }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number, name: string) => [formatCurrency(v), name]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="facturado" name="Facturado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div>
                <p className="text-sm font-semibold mb-1">Tabla anual {anualData.anio}</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Utilidad = Facturado − Gastos. Clasificación vs. promedio anual de {formatCurrency(anualData.promedioUtilidadMensual)}:
                  {' '}<span className="font-medium text-emerald-500">Buen mes</span> (10% o más por encima),
                  {' '}<span className="font-medium text-yellow-500">Mes regular</span> (cercano al promedio),
                  {' '}<span className="font-medium text-destructive">Mal mes</span> (10% o más por debajo).
                </p>
                <Table>
                  <thead>
                    <tr>
                      <Th>Mes</Th><Th>Pedidos</Th><Th>Facturado</Th><Th>Cobrado</Th>
                      <Th>Gastos</Th><Th>Utilidad</Th><Th>Clasificación</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {anualData.meses.map((m) => (
                      <Tr key={m.mes}>
                        <Td><span className="text-sm font-medium">{m.nombreMes}</span></Td>
                        <Td><span className="text-sm">{m.pedidos}</span></Td>
                        <Td><span className="text-sm text-blue-500">{formatCurrency(m.facturado)}</span></Td>
                        <Td><span className="text-sm text-emerald-500">{formatCurrency(m.cobrado)}</span></Td>
                        <Td><span className="text-sm text-red-500">{formatCurrency(m.gastos)}</span></Td>
                        <Td><span className={`text-sm font-semibold ${m.utilidad >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{formatCurrency(m.utilidad)}</span></Td>
                        <Td><Badge value={m.clasificacion} label={CLASIFICACION_MES_LABEL[m.clasificacion]} /></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MODAL: Detalle rentabilidad por cliente ── */}
      <Modal
        open={!!detalleRentCliente}
        onClose={() => setDetalleRentCliente(null)}
        title={detalleRentCliente ? `Rentabilidad — ${detalleRentCliente.nombre}` : ''}
        maxWidth="max-w-5xl"
      >
        {lRentDetalle ? (
          <TableSkeleton rows={5} cols={6} />
        ) : rentClienteDetalle ? (
          <div className="flex flex-col gap-5">
            {/* Resumen totales */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Total facturado</p>
                <p className="font-bold text-lg text-emerald-500">{formatCurrency(rentClienteDetalle.totales.totalFacturado)}</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Total costos</p>
                <p className="font-bold text-lg text-destructive">{formatCurrency(rentClienteDetalle.totales.totalCostos)}</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${rentClienteDetalle.totales.totalUtilidad >= 0 ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
                <p className="text-xs text-muted-foreground">Utilidad</p>
                <p className={`font-bold text-lg ${rentClienteDetalle.totales.totalUtilidad >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                  {formatCurrency(rentClienteDetalle.totales.totalUtilidad)}
                </p>
              </div>
            </div>

            {/* Tabla por pedido */}
            {rentClienteDetalle.pedidos.length > 0 ? (
              <div className="overflow-x-auto">
                <p className="text-sm font-semibold mb-2">Detalle por pedido</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <Th>#</Th>
                      <Th>Fecha</Th>
                      <Th>Ruta</Th>
                      <Th>Factura(s)</Th>
                      <Th>Total facturado</Th>
                      <Th>Costos liq.</Th>
                      <Th>Combustible</Th>
                      <Th>Total costos</Th>
                      <Th>Utilidad</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {rentClienteDetalle.pedidos.map((p) => (
                      <Tr key={p.id}>
                        <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                        <Td><span className="text-xs text-muted-foreground">{formatDate(p.fecha)}</span></Td>
                        <Td><span className="text-xs text-muted-foreground">{p.origen} → {p.destino}</span></Td>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            {p.facturas.length > 0 ? p.facturas.map((f: any) => (
                              <span key={f.id} className="text-xs font-mono text-blue-500">{f.numeroFactura}</span>
                            )) : <span className="text-xs text-muted-foreground">Sin factura</span>}
                          </div>
                        </Td>
                        <Td><span className="font-medium text-emerald-500">{formatCurrency(p.totalFacturado)}</span></Td>
                        <Td><span className="text-sm text-destructive">{formatCurrency(p.costos.liquidacion)}</span></Td>
                        <Td><span className="text-sm text-orange-500">{formatCurrency(p.costos.combustible)}</span></Td>
                        <Td><span className="font-medium text-destructive">{formatCurrency(p.costos.total)}</span></Td>
                        <Td>
                          <span className={`font-semibold ${p.utilidad >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                            {formatCurrency(p.utilidad)}
                          </span>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="Sin pedidos en el período" />
            )}
          </div>
        ) : null}
      </Modal>

      {/* ── MODAL: Detalle facturas por cliente ── */}
      <Modal
        open={!!detalleFacCliente}
        onClose={() => setDetalleFacCliente(null)}
        title={detalleFacCliente ? `Facturas — ${detalleFacCliente.nombre}` : ''}
        maxWidth="max-w-3xl"
      >
        <div className="flex flex-col gap-3">
          {facturasDelCliente.length > 0 ? (
            <Table>
              <thead>
                <tr>
                  <Th>N° Factura</Th>
                  <Th>Fecha emisión</Th>
                  <Th>Monto</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {facturasDelCliente.map((f: any) => (
                  <Tr key={f.id}>
                    <Td><span className="font-mono text-xs text-blue-500">{f.numeroFactura}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(f.fechaEmision)}</span></Td>
                    <Td><span className="font-semibold">{formatCurrency(Number(f.total))}</span></Td>
                    <Td><Badge value={f.estado} label={ESTADO_FACTURA_LABEL[f.estado as keyof typeof ESTADO_FACTURA_LABEL] ?? f.estado} /></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState message="Sin facturas para este cliente en el período" />
          )}
        </div>
      </Modal>

    </div>
  );
}
