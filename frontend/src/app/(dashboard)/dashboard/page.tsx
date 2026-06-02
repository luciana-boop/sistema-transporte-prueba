// FILE: src/app/(dashboard)/dashboard/page.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { reportesApi, pedidosApi, cuentasApi } from '@/services/api';
import { useConfig } from '@/hooks/useConfig';
import { formatCurrency, ESTADO_PEDIDO_LABEL } from '@/lib/utils';
import { MonedaBadge } from '@/components/shared/FinancialSelectors';
import {
  StatCard, StatCardSkeleton, Badge, TableSkeleton, EmptyState,
  Table, Th, Td, Tr, PageHeader,
} from '@/components/shared';
import { DollarSign, TrendingUp, Package, Users, ArrowUpRight, AlertCircle } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { EstadoPedido } from '@/types';

const COLORS_ESTADO: Record<EstadoPedido, string> = {
  ACTIVO:  '#10b981',
  ANULADO: '#ef4444',
};

export default function DashboardPage() {
  const config = useConfig();

  const { data: dash, isLoading } = useQuery({
    queryKey: ['reportes', 'dashboard'],
    queryFn: () => reportesApi.dashboard().then((r) => r.data.data),
  });

  const { data: resumenCuentas } = useQuery({
    queryKey: ['cuentas', 'resumen'],
    queryFn: () => cuentasApi.getResumen().then(r => r.data.data).catch(() => null),
  });

  const { data: pedidosRecientes, isLoading: loadPedidos } = useQuery({
    queryKey: ['pedidos', 'recientes'],
    queryFn: () => pedidosApi.listar({ estado: undefined }).then((r) => r.data.data.slice(0, 8)),
  });

  const pieData = dash?.pedidos.porEstado.map((e) => ({
    name: ESTADO_PEDIDO_LABEL[e.estado] ?? e.estado,
    value: e.cantidad,
    color: COLORS_ESTADO[e.estado as EstadoPedido] ?? '#6b7280',
  })) ?? [];

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
      <PageHeader title="Dashboard" description={config.nombreEmpresa ? `${config.nombreEmpresa} — Resumen del mes actual` : "Resumen del mes actual"} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Facturado"
              value={formatCurrency(dash?.financiero.facturado ?? 0)}
              sub="Este mes"
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
              label="Pedidos este mes"
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

      {/* Saldos por moneda */}
      {resumenCuentas && Object.keys(resumenCuentas.porMoneda).length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-3">Saldos por moneda</p>
          <div className="flex flex-wrap gap-4">
            {Object.entries(resumenCuentas.porMoneda).map(([codigo, info]) => (
              <div key={codigo} className="flex items-center gap-3 bg-muted/30 rounded-lg px-4 py-2.5">
                <MonedaBadge codigo={codigo} simbolo={(info as any).simbolo} />
                <span className={`font-bold text-lg ${(info as any).total >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                  {(info as any).simbolo} {Number((info as any).total).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
            {resumenCuentas.cuentas.slice(0, 4).map((c: any) => (
              <div key={c.id} className="bg-muted/20 rounded-lg p-3">
                <p className="text-xs text-muted-foreground truncate">{c.nombre}</p>
                <p className={`font-semibold text-sm mt-0.5 ${Number(c.saldoActual) >= 0 ? '' : 'text-destructive'}`}>
                  {c.moneda?.simbolo} {Number(c.saldoActual).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Financiero bar */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Resumen financiero del mes</p>
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

        {/* Pedidos por estado */}
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Pedidos por estado</p>
          {isLoading ? (
            <div className="skeleton h-48 rounded-lg" />
          ) : pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={3}>
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos" />
          )}
        </div>
      </div>

      {/* Pedidos recientes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold">Pedidos recientes</p>
        </div>
        {loadPedidos ? (
          <TableSkeleton rows={5} cols={6} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>#</Th>
                <Th>Cliente</Th>
                <Th>Origen → Destino</Th>
                <Th>Tarifa</Th>
                <Th>Estado</Th>
                <Th>Fecha</Th>
              </tr>
            </thead>
            <tbody>
              {pedidosRecientes && pedidosRecientes.length > 0 ? (
                pedidosRecientes.map((p) => (
                  <Tr key={p.id}>
                    <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                    <Td><span className="font-medium">{p.cliente?.razonSocial}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{p.origen} → {p.destino}</span></Td>
                    <Td><span className="font-medium">{formatCurrency(Number(p.tarifa))}</span></Td>
                    <Td><Badge value={p.estado} label={ESTADO_PEDIDO_LABEL[p.estado]} /></Td>
                    <Td><span className="text-xs text-muted-foreground">{new Date(p.fechaPedido).toLocaleDateString('es-PE')}</span></Td>
                  </Tr>
                ))
              ) : (
                <tr><td colSpan={6}><EmptyState /></td></tr>
              )}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
