// FILE: src/app/(dashboard)/dashboard/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { reportesApi, cuentasApi } from '@/services/api';
import { useConfig } from '@/hooks/useConfig';
import { usePermisosStore } from '@/store/permisos.store';
import { formatCurrency } from '@/lib/utils';
import { MonedaBadge, TipoCuentaBadge } from '@/components/shared/FinancialSelectors';
import {
  StatCard, StatCardSkeleton, TableSkeleton, EmptyState,
  Table, Th, Td, Tr, PageHeader, Input,
} from '@/components/shared';
import { DollarSign, TrendingUp, Package, Users, ArrowUpRight, AlertCircle, Trophy, Fuel } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';

// Lunes de la semana que contiene la fecha dada, en formato YYYY-MM-DD.
function lunesDe(fecha: Date) {
  const dia = fecha.getDay();
  const diff = dia === 0 ? -6 : 1 - dia;
  const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + diff);
  return lunes.toISOString().split('T')[0];
}

export default function DashboardPage() {
  const config = useConfig();

  // Acceso al módulo "dashboard" — un usuario puede estar autenticado
  // pero no tener permiso para este módulo (p.ej. un secretario configurado
  // para trabajar solo con Pedidos). En ese caso no debe verse el panel
  // ni dispararse sus consultas; se muestra una pantalla neutra.
  const modulos = usePermisosStore((s) => s.modulos);
  const tieneModulo = usePermisosStore((s) => s.tieneModulo);
  const accesoDashboard = modulos === null || tieneModulo('dashboard');

  // Filtro de fechas del Dashboard — por defecto "inicio de mes a fecha actual",
  // editable por el usuario.
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0];
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().split('T')[0]);

  const { data: dash, isLoading } = useQuery({
    queryKey: ['reportes', 'dashboard', desde, hasta],
    queryFn: () => reportesApi.dashboard({ desde, hasta }).then((r) => r.data.data),
  });

  const { data: resumenCuentas } = useQuery({
    queryKey: ['cuentas', 'resumen'],
    queryFn: () => cuentasApi.getResumen().then(r => r.data.data).catch(() => null),
  });

  // Tabla semanal — por defecto la semana actual (lunes a hoy), editable.
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

  // Permisos ya cargados y el usuario no tiene acceso a este módulo:
  // pantalla neutra en lugar del panel (que fallaría con 403 en sus consultas).
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

      {/* Filtro de fechas */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" className="w-36" value={desde} onChange={(e) => setDesde(e.target.value)} max={hasta} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" className="w-36" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde} />
        </div>
        <button
          onClick={() => {
            const d = new Date(); d.setDate(1);
            setDesde(d.toISOString().split('T')[0]);
            setHasta(new Date().toISOString().split('T')[0]);
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ↺ Mes actual
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Facturado"
              value={formatCurrency(dash?.financiero.facturado ?? 0)}
              sub="Período seleccionado"
              icon={DollarSign}
              color="blue"
            />
            <StatCard
              label="Cobrado"
              value={formatCurrency(dash?.financiero.cobrado ?? 0)}
              sub="Ingresos reales"
              icon={TrendingUp}
              color="green"
            />
            <StatCard
              label="Por cobrar"
              value={formatCurrency(dash?.financiero.porCobrar ?? 0)}
              sub="Saldo pendiente"
              icon={AlertCircle}
              color="yellow"
            />
            <StatCard
              label="Clientes activos"
              value={dash?.clientes.total ?? 0}
              sub="Total registrados"
              icon={Users}
              color="default"
            />
          </>
        )}
      </div>

      {/* Segunda fila: pedidos + utilidad */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 2 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Pedidos del período"
              value={dash?.pedidos.totalMes ?? 0}
              sub="Nuevos registros"
              icon={Package}
              color="default"
            />
            <StatCard
              label="Utilidad bruta"
              value={formatCurrency(dash?.financiero.utilidadBruta ?? 0)}
              sub="Cobrado − Gastos"
              icon={ArrowUpRight}
              color={( dash?.financiero.utilidadBruta ?? 0) >= 0 ? 'green' : 'red'}
            />
          </>
        )}
      </div>

      {/* Saldos por cuenta */}
      {resumenCuentas && resumenCuentas.cuentas.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
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
        {/* Financiero bar */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Resumen financiero del período</p>
          {isLoading ? (
            <div className="skeleton h-48 rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={financieroData}>
                <defs>
                  <linearGradient id="colorValor" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(221,83%,53%)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(221,83%,53%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v/1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [formatCurrency(v), 'Monto']}
                />
                <Area type="monotone" dataKey="valor" stroke="hsl(221,83%,53%)" strokeWidth={2} fill="url(#colorValor)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Conductor del mes */}
        <div className="bg-card border border-border rounded-xl p-5">
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
                  {conductorMes.ranking.slice(1).map((c, i) => (
                    <div key={c.conductorId} className="flex items-center justify-between text-xs px-1">
                      <span className="text-muted-foreground truncate">{i + 2}. {c.nombre}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">{c.viajes} viajes · {formatCurrency(c.combustiblePromedio)}/viaje</span>
                    </div>
                  ))}
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
          <TableSkeleton rows={5} cols={3} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Conductor</Th>
                <Th>Pedidos</Th>
                <Th>Rentabilidad</Th>
              </tr>
            </thead>
            <tbody>
              {tablaSemanal && tablaSemanal.conductores.length > 0 ? (
                tablaSemanal.conductores.map((c) => (
                  <Tr key={c.conductorId}>
                    <Td><span className="font-medium">{c.nombre}</span></Td>
                    <Td><span className="text-muted-foreground">{c.cantidadPedidos}</span></Td>
                    <Td>
                      <span className={`font-semibold ${c.rentabilidad >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                        {formatCurrency(c.rentabilidad)}
                      </span>
                    </Td>
                  </Tr>
                ))
              ) : (
                <tr><td colSpan={3}><EmptyState message="Sin liquidaciones en el rango seleccionado" /></td></tr>
              )}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
