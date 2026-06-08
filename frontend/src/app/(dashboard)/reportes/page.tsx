// FILE: src/app/(dashboard)/reportes/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi } from '@/services/api';
import { formatCurrency, formatDate, ESTADO_PEDIDO_LABEL, ESTADO_FACTURA_LABEL, METODO_PAGO_LABEL, TIPO_GASTO_LABEL, CLASIFICACION_MES_LABEL } from '@/lib/utils';
import {
  PageHeader, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, StatCard, Input, Select,
} from '@/components/shared';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

const TABS = [
  { id: 'pedidos',     label: 'Pedidos' },
  { id: 'facturacion', label: 'Facturación' },
  { id: 'cobranza',    label: 'Cobranza' },
  { id: 'caja',        label: 'Caja' },
  { id: 'gastos',      label: 'Gastos' },
  { id: 'anual',       label: 'Reporte Anual' },
];

const COLORS = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4'];

export default function ReportesPage() {
  const [tab, setTab] = useState('pedidos');
  // MEJORA 1: últimos 7 días por defecto
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0];
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [anioReporte, setAnioReporte] = useState(() => new Date().getFullYear());

  const params = { desde: desde || undefined, hasta: hasta || undefined };

  const { data: pedidosData, isLoading: lPedidos } = useQuery({
    queryKey: ['reporte', 'pedidos', desde, hasta],
    queryFn: () => reportesApi.pedidos(params).then((r) => r.data.data),
    enabled: tab === 'pedidos',
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

  const { data: gastosData, isLoading: lGastos } = useQuery({
    queryKey: ['reporte', 'gastos', desde, hasta],
    queryFn: () => reportesApi.gastos(params).then((r) => r.data.data),
    enabled: tab === 'gastos',
  });

  const { data: anualData, isLoading: lAnual } = useQuery({
    queryKey: ['reporte', 'anual', anioReporte],
    queryFn: () => reportesApi.anual({ anio: anioReporte }).then((r) => r.data.data),
    enabled: tab === 'anual',
  });

  // Distribución de pedidos por cliente (gráfico circular), derivada del listado
  // ya cargado por el reporte — sin necesidad de un endpoint adicional.
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

  const isLoading = lPedidos || lFac || lCob || lCaja || lGastos || lAnual;

  // El Reporte Anual opera sobre un año completo, no sobre un rango de fechas
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
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StatCard label="Total pedidos" value={pedidosData.totales.cantidad} color="default" />
                <StatCard label="Tarifa total" value={formatCurrency(pedidosData.totales.tarifaTotal)} color="blue" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-semibold mb-4">Pedidos por estado</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pedidosData.resumenEstados.map((e) => ({ name: ESTADO_PEDIDO_LABEL[e.estado], value: e.cantidad }))}
                        cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={3}>
                        {pedidosData.resumenEstados.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-semibold mb-4">Pedidos por cliente</p>
                  {pedidosPorCliente.length > 0 ? (
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie data={pedidosPorCliente}
                          cx="50%" cy="50%" outerRadius={70} dataKey="value" paddingAngle={3}>
                          {pedidosPorCliente.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">
                      Sin pedidos en el período seleccionado
                    </div>
                  )}
                </div>
                <div className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-semibold mb-4">Tarifas por estado</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={pedidosData.resumenEstados.map((e) => ({ name: ESTADO_PEDIDO_LABEL[e.estado], tarifa: e.totalTarifas }))} barSize={28}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v/1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v), 'Tarifa']} />
                      <Bar dataKey="tarifa" fill="hsl(221,83%,53%)" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
          {lPedidos ? <TableSkeleton rows={6} cols={6} /> : (
            <Table>
              <thead><tr><Th>#</Th><Th>Cliente</Th><Th>Origen → Destino</Th><Th>Tarifa</Th><Th>Estado</Th><Th>Fecha</Th></tr></thead>
              <tbody>
                {pedidosData?.pedidos.length ? pedidosData.pedidos.map((p) => (
                  <Tr key={p.id}>
                    <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                    <Td><span className="text-sm font-medium">{p.cliente?.razonSocial}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{p.origen} → {p.destino}</span></Td>
                    <Td><span className="font-semibold">{formatCurrency(Number(p.tarifa))}</span></Td>
                    <Td><Badge value={p.estado} label={ESTADO_PEDIDO_LABEL[p.estado]} /></Td>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(p.fechaPedido)}</span></Td>
                  </Tr>
                )) : <tr><td colSpan={6}><EmptyState /></td></tr>}
              </tbody>
            </Table>
          )}
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
          {lFac ? <TableSkeleton rows={6} cols={6} /> : (
            <Table>
              <thead><tr><Th>N° Factura</Th><Th>Cliente</Th><Th>Subtotal</Th><Th>IGV</Th><Th>Total</Th><Th>Estado</Th><Th>Emisión</Th></tr></thead>
              <tbody>
                {facData?.facturas.length ? facData.facturas.map((f) => (
                  <Tr key={f.id}>
                    <Td><span className="font-mono text-xs">{f.numeroFactura}</span></Td>
                    <Td><span className="text-sm font-medium">{f.cliente?.razonSocial}</span></Td>
                    <Td><span className="text-sm">{formatCurrency(Number(f.subtotal))}</span></Td>
                    <Td><span className="text-sm text-muted-foreground">{formatCurrency(Number(f.igv))}</span></Td>
                    <Td><span className="font-semibold">{formatCurrency(Number(f.total))}</span></Td>
                    <Td><Badge value={f.estado} label={ESTADO_FACTURA_LABEL[f.estado]} /></Td>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(f.fechaEmision)}</span></Td>
                  </Tr>
                )) : <tr><td colSpan={7}><EmptyState /></td></tr>}
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
              <StatCard label="Pagos registrados" value={cobData.totales.cantidad} color="default" />
              <StatCard label="Total cobrado" value={formatCurrency(cobData.totales.totalCobrado)} color="green" />
              {cobData.resumenPorMetodo.map((m) => (
                <StatCard key={m.metodoPago} label={METODO_PAGO_LABEL[m.metodoPago]} value={formatCurrency(m.total)} color="default" />
              ))}
            </div>
          )}
          {lCob ? <TableSkeleton rows={6} cols={5} /> : (
            <Table>
              <thead><tr><Th>Factura</Th><Th>Cliente</Th><Th>Monto</Th><Th>Método</Th><Th>Fecha</Th></tr></thead>
              <tbody>
                {cobData?.pagos.length ? cobData.pagos.map((p) => (
                  <Tr key={p.id}>
                    <Td><span className="font-mono text-xs">{p.factura?.numeroFactura}</span></Td>
                    <Td><span className="text-sm font-medium">{p.cliente?.razonSocial}</span></Td>
                    <Td><span className="font-semibold text-emerald-500">{formatCurrency(Number(p.monto))}</span></Td>
                    <Td><Badge value={p.metodoPago} label={METODO_PAGO_LABEL[p.metodoPago]} /></Td>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(p.fechaPago)}</span></Td>
                  </Tr>
                )) : <tr><td colSpan={5}><EmptyState /></td></tr>}
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

      {/* ── GASTOS ── */}
      {tab === 'gastos' && (
        <div className="flex flex-col gap-4">
          {gastosData && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <StatCard label="Total gastos" value={formatCurrency(gastosData.totales.totalGastos)} color="red" />
                <StatCard label="Registros" value={gastosData.totales.cantidad} color="default" />
              </div>
              {gastosData.resumenPorTipo.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-semibold mb-4">Distribución de gastos</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={gastosData.resumenPorTipo.map((r) => ({ name: TIPO_GASTO_LABEL[r.tipoGasto], total: r.total }))} barSize={36}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v/1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v), 'Total']} />
                      <Bar dataKey="total" fill="hsl(0,84%,60%)" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
          {lGastos ? <TableSkeleton rows={6} cols={5} /> : (
            <Table>
              <thead><tr><Th>Tipo</Th><Th>Descripción</Th><Th>Vehículo</Th><Th>Monto</Th><Th>Fecha</Th></tr></thead>
              <tbody>
                {gastosData?.gastos.length ? gastosData.gastos.map((g) => (
                  <Tr key={g.id}>
                    <Td><Badge value={g.tipoGasto} label={TIPO_GASTO_LABEL[g.tipoGasto]} /></Td>
                    <Td><span className="text-sm">{g.descripcion}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{g.vehiculo ? g.vehiculo.placa : '—'}</span></Td>
                    <Td><span className="font-semibold text-red-500">{formatCurrency(Number(g.monto))}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(g.fecha)}</span></Td>
                  </Tr>
                )) : <tr><td colSpan={5}><EmptyState /></td></tr>}
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

              {/* Resumen mensual */}
              <div className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold mb-1">Resumen mensual {anualData.anio}</p>
                <p className="text-xs text-muted-foreground mb-4">Cobrado, gastos y utilidad por mes (línea punteada: promedio anual de utilidad)</p>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={anualData.meses.map((m) => ({ name: m.nombreMes.slice(0, 3), cobrado: m.cobrado, gastos: m.gastos, utilidad: m.utilidad }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v/1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number, name: string) => [formatCurrency(v), name]} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="cobrado" name="Cobrado" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="gastos" name="Gastos" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="utilidad" name="Utilidad" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Tabla anual con clasificación */}
              <div>
                <p className="text-sm font-semibold mb-1">Tabla anual {anualData.anio}</p>
                <p className="text-xs text-muted-foreground mb-3">
                  Cada mes se clasifica comparando su utilidad (cobrado − gastos) contra el promedio anual de {formatCurrency(anualData.promedioUtilidadMensual)}:
                  {' '}<span className="font-medium text-emerald-500">Buen mes</span> (10% o más por encima),
                  {' '}<span className="font-medium text-yellow-500">Mes regular</span> (cercano al promedio),
                  {' '}<span className="font-medium text-destructive">Mal mes</span> (10% o más por debajo).
                </p>
                <Table>
                  <thead>
                    <tr>
                      <Th>Mes</Th>
                      <Th>Pedidos</Th>
                      <Th>Facturado</Th>
                      <Th>Cobrado</Th>
                      <Th>Gastos</Th>
                      <Th>Utilidad</Th>
                      <Th>Clasificación</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {anualData.meses.map((m) => (
                      <Tr key={m.mes}>
                        <Td><span className="text-sm font-medium">{m.nombreMes}</span></Td>
                        <Td><span className="text-sm">{m.pedidos}</span></Td>
                        <Td><span className="text-sm">{formatCurrency(m.facturado)}</span></Td>
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
    </div>
  );
}
