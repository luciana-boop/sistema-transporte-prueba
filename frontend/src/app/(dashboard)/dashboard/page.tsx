// FILE: src/app/(dashboard)/dashboard/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi, cuentasApi } from '@/services/api';
import { useConfig } from '@/hooks/useConfig';
import { usePermisosStore } from '@/store/permisos.store';
import { formatCurrency, formatDate, rangoMes } from '@/lib/utils';
import { MonedaBadge, TipoCuentaBadge } from '@/components/shared/FinancialSelectors';
import {
  StatCard, StatCardSkeleton, TableSkeleton, EmptyState,
  Table, Th, Td, Tr, PageHeader, Input, Modal, Badge, MonthSelector,
} from '@/components/shared';
import { DollarSign, TrendingUp, Package, Users, ArrowUpRight, AlertCircle, Trophy, Medal, Fuel, Eye } from 'lucide-react';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

const FINANCIERO_COLORS: Record<string, string> = {
  Facturado:    '#2563eb',
  Cobrado:      '#10b981',
  'Por cobrar': '#f59e0b',
  Gastos:       '#ef4444',
  Utilidad:     '#0ea5e9',
};

function lunesDe(fecha: Date) {
  const dia = fecha.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + diff);
  return lunes.toISOString().split('T')[0];
}

export default function DashboardPage() {
  const config = useConfig();

  const modulos = usePermisosStore((s) => s.modulos);
  const tieneModulo = usePermisosStore((s) => s.tieneModulo);
  const accesoDashboard = modulos === null || tieneModulo('dashboard');

  const hoy = new Date();
  const [year, setYear] = useState(hoy.getFullYear());
  const [month, setMonth] = useState(hoy.getMonth() + 1);
  const { desde, hasta } = rangoMes(year, month);

  const { data: dash, isLoading } = useQuery({
    queryKey: ['reportes', 'dashboard', desde, hasta],
    queryFn: () => reportesApi.dashboard({ desde, hasta }).then((r) => r.data.data),
  });

  const { data: resumenCuentas } = useQuery({
    queryKey: ['cuentas', 'resumen'],
    queryFn: () => cuentasApi.getResumen().then(r => r.data.data).catch(() => null),
  });

  const [desdeSemana, setDesdeSemana] = useState(() => lunesDe(new Date()));
  const [hastaSemana, setHastaSemana] = useState(() => new Date().toISOString().split('T')[0]);

  const { data: tablaSemanal, isLoading: loadTablaSemanal } = useQuery({
    queryKey: ['reportes', 'tabla-semanal', desdeSemana, hastaSemana],
    queryFn: () => reportesApi.tablaSemanal({ desde: desdeSemana, hasta: hastaSemana }).then((r) => r.data.data),
  });

  const { data: conductorMes, isLoading: loadConductorMes } = useQuery({
    queryKey: ['reportes', 'conductor-del-mes'],
    queryFn: () => reportesApi.conductorDelMes().then((r) => r.data.data),
  });

  // Detalle de conductor
  const [conductorDetalle, setConductorDetalle] = useState<{ id: number; nombre: string } | null>(null);
  const { data: detalleData, isLoading: loadDetalle } = useQuery({
    queryKey: ['reportes', 'detalle-conductor', conductorDetalle?.id, desdeSemana, hastaSemana],
    queryFn: () =>
      reportesApi
        .detalleConductorSemanal(conductorDetalle!.id, { desde: desdeSemana, hasta: hastaSemana })
        .then((r) => r.data.data),
    enabled: !!conductorDetalle,
  });

  if (!accesoDashboard) {
    return (
      <div className="flex items-center justify-center h-full">
        <EmptyState message="Seleccione un módulo para trabajar" />
      </div>
    );
  }

  const financieroData = dash
    ? [
        { name: 'Facturado', valor: dash.financiero.facturado },
        { name: 'Cobrado', valor: dash.financiero.cobrado },
        { name: 'Por cobrar', valor: dash.financiero.porCobrar },
        { name: 'Gastos', valor: dash.financiero.gastos },
        { name: 'Utilidad', valor: dash.financiero.utilidadBruta },
      ]
    : [];

  return (
    <div className="page-container">
      <PageHeader title="Dashboard" description={config.nombreEmpresa ? `${config.nombreEmpresa} — Resumen del período seleccionado` : "Resumen del período seleccionado"} />

      {/* Filtro por mes */}
      <div className="flex flex-wrap gap-3 items-center">
        <MonthSelector year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        {(year !== hoy.getFullYear() || month !== hoy.getMonth() + 1) && (
          <button
            onClick={() => { setYear(hoy.getFullYear()); setMonth(hoy.getMonth() + 1); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ↺ Mes actual
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Facturado" value={formatCurrency(dash?.financiero.facturado ?? 0)} sub="Período seleccionado" icon={DollarSign} color="blue" />
            <StatCard label="Cobrado" value={formatCurrency(dash?.financiero.cobrado ?? 0)} sub="Ingresos reales" icon={TrendingUp} color="green" />
            <StatCard label="Por cobrar" value={formatCurrency(dash?.financiero.porCobrar ?? 0)} sub="Saldo pendiente" icon={AlertCircle} color="yellow" />
            <StatCard label="Clientes activos" value={dash?.clientes.total ?? 0} sub="Total registrados" icon={Users} color="default" />
          </>
        )}
      </div>

      {/* Segunda fila: pedidos + utilidad */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard label="Pedidos del período" value={dash?.pedidos.totalMes ?? 0} sub="Nuevos registros" icon={Package} color="default" />
            <StatCard label="Utilidad bruta" value={formatCurrency(dash?.financiero.utilidadBruta ?? 0)} sub="Facturado − Gastos" icon={ArrowUpRight} color={(dash?.financiero.utilidadBruta ?? 0) >= 0 ? 'green' : 'red'} />
          </>
        )}
      </div>

      {/* Saldos por cuenta */}
      {resumenCuentas && resumenCuentas.cuentas.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold mb-3">Saldos por cuenta</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {resumenCuentas.cuentas.map((c: any) => (
              <div key={c.id} className="flex flex-col gap-2 bg-muted/20 rounded-lg p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground truncate">{c.nombre}</p>
                  <TipoCuentaBadge tipo={c.tipoCuenta} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <MonedaBadge codigo={c.moneda?.codigo} simbolo={c.moneda?.simbolo} />
                  <span className={`font-bold text-sm ${Number(c.saldoActual) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                    {c.moneda?.simbolo} {Number(c.saldoActual).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold mb-4">Resumen financiero del período</p>
          {isLoading ? (
            <div className="skeleton h-48 rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={financieroData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--muted)/0.4)' }}
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => [formatCurrency(v), 'Monto']}
                />
                <Bar dataKey="valor" radius={[10, 10, 0, 0]}>
                  {financieroData.map((d) => (
                    <Cell key={d.name} fill={FINANCIERO_COLORS[d.name] ?? 'hsl(var(--primary))'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Conductor del mes */}
        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <p className="text-sm font-semibold mb-4">
            Conductor del mes{conductorMes?.periodo ? ` — ${conductorMes.periodo.nombreMes}` : ''}
          </p>
          {loadConductorMes ? (
            <div className="skeleton h-48 rounded-lg" />
          ) : conductorMes?.ganador ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-amber-500/10 rounded-lg p-3">
                <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{conductorMes.ganador.nombre}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2">
                    <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" /> {conductorMes.ganador.viajes} viajes</span>
                    <span className="inline-flex items-center gap-1"><Fuel className="w-3 h-3" /> {formatCurrency(conductorMes.ganador.combustiblePromedio)}/viaje</span>
                  </p>
                </div>
              </div>
              {conductorMes.ranking.length > 1 && (
                <div className="space-y-1.5">
                  {conductorMes.ranking.slice(1).map((c, i) => {
                    const posicion = i + 2;
                    const estilos =
                      posicion === 2
                        ? { wrap: 'bg-slate-400/10', icon: 'bg-slate-400/20 text-slate-400' }
                        : posicion === 3
                        ? { wrap: 'bg-orange-700/10', icon: 'bg-orange-700/20 text-orange-700' }
                        : { wrap: 'bg-muted/40', icon: 'bg-muted text-muted-foreground' };
                    return (
                      <div key={c.conductorId} className={`flex items-center gap-3 rounded-lg p-2.5 ${estilos.wrap}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${estilos.icon}`}>
                          {posicion <= 3 ? <Medal className="w-4 h-4" /> : posicion}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{c.nombre}</p>
                          <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <span className="inline-flex items-center gap-1"><Package className="w-3 h-3" /> {c.viajes} viajes</span>
                            <span className="inline-flex items-center gap-1"><Fuel className="w-3 h-3" /> {formatCurrency(c.combustiblePromedio)}/viaje</span>
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <EmptyState message="Sin viajes registrados este mes" />
          )}
        </div>
      </div>

      {/* Tabla semanal */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <p className="text-sm font-semibold">Tabla semanal por conductor</p>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" className="w-36" value={desdeSemana} onChange={(e) => setDesdeSemana(e.target.value)} max={hastaSemana} />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input type="date" className="w-36" value={hastaSemana} onChange={(e) => setHastaSemana(e.target.value)} min={desdeSemana} />
            </div>
            <button
              onClick={() => {
                setDesdeSemana(lunesDe(new Date()));
                setHastaSemana(new Date().toISOString().split('T')[0]);
              }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ↺ Esta semana
            </button>
          </div>
        </div>
        {loadTablaSemanal ? (
          <TableSkeleton rows={5} cols={6} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Conductor</Th>
                <Th>Pedidos</Th>
                <Th>Facturado</Th>
                <Th>Gastos</Th>
                <Th>Rentabilidad</Th>
                <Th>Detalle</Th>
              </tr>
            </thead>
            <tbody>
              {tablaSemanal && tablaSemanal.conductores.length > 0 ? (
                tablaSemanal.conductores.map((c) => (
                  <Tr key={c.conductorId}>
                    <Td><span className="font-medium">{c.nombre}</span></Td>
                    <Td><span className="text-muted-foreground">{c.cantidadPedidos}</span></Td>
                    <Td><span className="text-emerald-500 font-medium">{formatCurrency(c.ingreso)}</span></Td>
                    <Td><span className="text-destructive font-medium">{formatCurrency(c.costos)}</span></Td>
                    <Td>
                      <span className={`font-semibold ${c.rentabilidad >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        {formatCurrency(c.rentabilidad)}
                      </span>
                    </Td>
                    <Td>
                      <button
                        onClick={() => setConductorDetalle({ id: c.conductorId, nombre: c.nombre })}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> Ver
                      </button>
                    </Td>
                  </Tr>
                ))
              ) : (
                <tr><td colSpan={6}><EmptyState message="Sin liquidaciones en el rango seleccionado" /></td></tr>
              )}
            </tbody>
          </Table>
        )}
      </div>

      {/* Modal detalle conductor */}
      <Modal
        open={!!conductorDetalle}
        onClose={() => setConductorDetalle(null)}
        title={conductorDetalle ? `Detalle — ${conductorDetalle.nombre}` : ''}
        maxWidth="max-w-4xl"
      >
        {loadDetalle ? (
          <TableSkeleton rows={5} cols={4} />
        ) : detalleData ? (
          <div className="flex flex-col gap-5">
            {/* Resumen */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Pedidos</p>
                <p className="font-bold text-lg">{detalleData.resumen.cantidadPedidos}</p>
              </div>
              <div className="bg-emerald-500/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Facturado</p>
                <p className="font-bold text-lg text-emerald-500">{formatCurrency(detalleData.resumen.totalIngreso)}</p>
              </div>
              <div className="bg-destructive/10 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Costos totales</p>
                <p className="font-bold text-lg text-destructive">{formatCurrency(detalleData.resumen.totalCostos)}</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Combustible</p>
                <p className="font-bold text-lg text-orange-500">{formatCurrency(detalleData.resumen.totalCombustible)}</p>
              </div>
              <div className="bg-muted/20 rounded-lg p-3 text-center">
                <p className="text-xs text-muted-foreground">Liquidaciones</p>
                <p className="font-bold text-lg">{detalleData.resumen.cantidadLiquidaciones}</p>
              </div>
              <div className={`rounded-lg p-3 text-center ${detalleData.resumen.rentabilidad >= 0 ? 'bg-emerald-500/10' : 'bg-destructive/10'}`}>
                <p className="text-xs text-muted-foreground">Rentabilidad</p>
                <p className={`font-bold text-lg ${detalleData.resumen.rentabilidad >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                  {formatCurrency(detalleData.resumen.rentabilidad)}
                </p>
              </div>
            </div>

            {/* Pedidos */}
            {detalleData.pedidos.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Pedidos realizados</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border"><Th>#</Th><Th>Cliente</Th><Th>Ruta</Th><Th>Tarifa</Th><Th>Estado</Th><Th>Fecha</Th></tr></thead>
                    <tbody>
                      {detalleData.pedidos.map((p: any) => (
                        <Tr key={p.id}>
                          <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                          <Td><span className="text-sm">{p.cliente}</span></Td>
                          <Td><span className="text-xs text-muted-foreground">{p.origen} → {p.destino}</span></Td>
                          <Td><span className="font-medium text-emerald-500">{formatCurrency(p.tarifa)}</span></Td>
                          <Td><Badge value={p.estado} label={p.estado} /></Td>
                          <Td><span className="text-xs text-muted-foreground">{formatDate(p.fechaPedido)}</span></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Facturación */}
            {detalleData.facturas.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Facturación asociada</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border"><Th>N° Factura</Th><Th>Total</Th><Th>Estado</Th></tr></thead>
                    <tbody>
                      {detalleData.facturas.map((f: any) => (
                        <Tr key={f.id}>
                          <Td><span className="font-mono text-xs">{f.numeroFactura}</span></Td>
                          <Td><span className="font-medium">{formatCurrency(Number(f.total))}</span></Td>
                          <Td><Badge value={f.estado} label={f.estado} /></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Liquidaciones */}
            {detalleData.liquidaciones.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Liquidaciones</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border"><Th>#</Th><Th>Fecha</Th><Th>Gastos</Th><Th>Entregado</Th><Th>Devolución</Th><Th>Reintegro</Th><Th>Estado</Th></tr></thead>
                    <tbody>
                      {detalleData.liquidaciones.map((l: any) => (
                        <Tr key={l.id}>
                          <Td><span className="font-mono text-xs text-muted-foreground">#{l.id}</span></Td>
                          <Td><span className="text-xs text-muted-foreground">{formatDate(l.fecha)}</span></Td>
                          <Td><span className="text-destructive">{formatCurrency(l.totalGastos)}</span></Td>
                          <Td><span className="font-medium">{formatCurrency(l.montoEntregado)}</span></Td>
                          <Td><span className="text-emerald-500">{l.devolucion > 0 ? formatCurrency(l.devolucion) : '—'}</span></Td>
                          <Td><span className="text-orange-500">{l.reintegro > 0 ? formatCurrency(l.reintegro) : '—'}</span></Td>
                          <Td><Badge value={l.estado} label={l.estado} /></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Combustible */}
            {detalleData.combustible.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Combustible</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-border"><Th>Vehículo</Th><Th>Monto</Th><Th>Litros</Th><Th>Fecha</Th></tr></thead>
                    <tbody>
                      {detalleData.combustible.map((c: any) => (
                        <Tr key={c.id}>
                          <Td><span className="text-sm">{c.vehiculo ?? '—'}</span></Td>
                          <Td><span className="font-medium text-orange-500">{formatCurrency(c.monto)}</span></Td>
                          <Td><span className="text-sm text-muted-foreground">{c.litros != null ? `${c.litros} L` : '—'}</span></Td>
                          <Td><span className="text-xs text-muted-foreground">{formatDate(c.fecha)}</span></Td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {detalleData.pedidos.length === 0 && detalleData.liquidaciones.length === 0 && (
              <EmptyState message="Sin datos en el período seleccionado" />
            )}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
