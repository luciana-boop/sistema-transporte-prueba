// FILE: src/app/(dashboard)/gastos/page.tsx
// MODIFICADO: agrega moneda, cuenta origen, tipo pago
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Download } from 'lucide-react';
import { gastosApi, pedidosApi } from '@/services/api';
import { formatDate, getErrorMessage, TIPO_GASTO_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { MonedaBadge, CuentaSelector, TipoPagoSelector, MonedaSelector } from '@/components/shared/FinancialSelectors';
import { useAuthStore } from '@/store/auth.store';
import { useMoneda } from '@/hooks/useMoneda';
import type { TipoGasto } from '@/types';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const schema = z.object({
  pedidoId: z.string().optional(),
  tipoGasto: z.enum(['COMBUSTIBLE', 'VIATICOS', 'PEAJE', 'MANTENIMIENTO', 'OTROS']),
  monto: z.string().min(1, 'Monto requerido'),
  descripcion: z.string().min(2, 'Descripción requerida'),
  comprobante: z.string().optional(),
  fecha: z.string().optional(),
  monedaId: z.string().optional(),
  cuentaId: z.string().optional(),
  tipoPagoId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function GastosPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const { defaultSimbolo, formatWithSimbolo } = useMoneda();
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [showForm, setShowForm] = useState(false);

  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['gastos', filtroTipo],
    queryFn: () => gastosApi.listar({ tipoGasto: filtroTipo as TipoGasto || undefined }).then((r) => r.data.data),
  });

  const { data: resumen } = useQuery({
    queryKey: ['gastos', 'resumen'],
    queryFn: () => gastosApi.resumen().then((r) => r.data.data),
  });

  const { data: pedidos = [] } = useQuery({
    queryKey: ['pedidos'],
    queryFn: () => pedidosApi.listar().then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipoGasto: 'COMBUSTIBLE' },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['gastos'] });

  const exportExcel = () => {
    const rows = filtered.map((g) => ({
      '#': g.id, Tipo: TIPO_GASTO_LABEL[g.tipoGasto], Descripción: g.descripcion,
      Pedido: g.pedido ? `#${g.pedido.id}` : '', [`Monto ${defaultSimbolo}`]: Number(g.monto),
      Comprobante: g.comprobante ?? '', Fecha: formatDate(g.fecha),
      Usuario: g.usuario?.nombre,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
    XLSX.writeFile(wb, `gastos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const createMutation = useMutation({
    mutationFn: (d: FormData) => gastosApi.crear({
      pedidoId: d.pedidoId ? parseInt(d.pedidoId) : undefined,
      tipoGasto: d.tipoGasto as TipoGasto,
      monto: parseFloat(d.monto),
      descripcion: d.descripcion,
      comprobante: d.comprobante,
      fecha: d.fecha,
    }),
    onSuccess: () => { toast.success('Gasto registrado'); setShowForm(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => gastosApi.eliminar(id),
    onSuccess: () => { toast.success('Gasto eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const filtered = gastos.filter((g) =>
    search ? g.descripcion.toLowerCase().includes(search.toLowerCase()) : true
  );

  const chartData = resumen?.resumenPorTipo.map((r) => ({
    name: TIPO_GASTO_LABEL[r.tipoGasto] ?? r.tipoGasto,
    total: r.totalMonto,
  })) ?? [];

  const totalGastos = filtered.reduce((s, g) => s + Number(g.monto), 0);

  return (
    <div className="page-container">
      <PageHeader
        title="Gastos"
        description="Liquidación de gastos operativos"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
            <Button onClick={() => { setShowForm(true); reset(); }}><Plus className="w-4 h-4" /> Registrar gasto</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total gastos" value={`${defaultSimbolo} ${totalGastos.toFixed(2)}`} color="red" />
        <StatCard label="Registros" value={filtered.length} color="default" />
        <StatCard
          label="Mayor tipo"
          value={resumen?.resumenPorTipo.length
            ? TIPO_GASTO_LABEL[resumen.resumenPorTipo.sort((a, b) => b.totalMonto - a.totalMonto)[0].tipoGasto]
            : '—'}
          color="yellow"
        />
      </div>

      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Gastos por tipo</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${defaultSimbolo}${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${defaultSimbolo} ${v.toFixed(2)}`, 'Total']} />
              <Bar dataKey="total" fill="hsl(221,83%,53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar descripción..." className="pl-9 w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="w-44">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_GASTO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </div>

      {isLoading ? <TableSkeleton rows={6} cols={7} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th><Th>Tipo</Th><Th>Descripción</Th><Th>Pedido</Th>
              <Th>Monto</Th><Th>Fecha</Th>
              {usuario?.rol === 'ADMIN' && <Th>Acc.</Th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((g) => (
              <Tr key={g.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{g.id}</span></Td>
                <Td><Badge value={g.tipoGasto} label={TIPO_GASTO_LABEL[g.tipoGasto]} /></Td>
                <Td>
                  <div>
                    <p className="text-sm">{g.descripcion}</p>
                    {g.comprobante && <p className="text-xs text-muted-foreground">{g.comprobante}</p>}
                  </div>
                </Td>
                <Td>
                  {g.pedido
                    ? <span className="text-xs text-muted-foreground">#{g.pedido.id} {g.pedido.origen} → {g.pedido.destino}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </Td>
                <Td><span className="font-semibold text-red-500">{defaultSimbolo} {Number(g.monto).toFixed(2)}</span></Td>
                <Td><span className="text-xs text-muted-foreground">{formatDate(g.fecha)}</span></Td>
                {usuario?.rol === 'ADMIN' && (
                  <Td>
                    <button
                      onClick={() => { if (confirm('¿Eliminar gasto?')) deleteMutation.mutate(g.id); }}
                      className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                )}
              </Tr>
            )) : (
              <tr><td colSpan={7}><EmptyState message="No se encontraron gastos" /></td></tr>
            )}
          </tbody>
        </Table>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="Registrar gasto">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipo de gasto" required error={errors.tipoGasto?.message}>
              <Select {...register('tipoGasto')}>
                {Object.entries(TIPO_GASTO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Monto" required error={errors.monto?.message}>
              <Input type="number" step="0.01" placeholder="0.00" {...register('monto')} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Descripción" required error={errors.descripcion?.message}>
                <Input placeholder="Descripción del gasto" {...register('descripcion')} />
              </FormField>
            </div>
            <FormField label="Moneda">
              <MonedaSelector placeholder="Moneda..." {...register('monedaId')} />
            </FormField>
            <FormField label="Cuenta origen">
              <CuentaSelector placeholder="Cuenta origen..." {...register('cuentaId')} />
            </FormField>
            <FormField label="Tipo de pago">
              <TipoPagoSelector placeholder="Método pago..." {...register('tipoPagoId')} />
            </FormField>
            <FormField label="Comprobante">
              <Input placeholder="N° factura, boleta..." {...register('comprobante')} />
            </FormField>
            <FormField label="Fecha">
              <Input type="date" {...register('fecha')} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Pedido asociado (opcional)">
                <Select {...register('pedidoId')}>
                  <option value="">Sin pedido</option>
                  {pedidos.map((p) => (
                    <option key={p.id} value={p.id}>#{p.id} — {p.origen} → {p.destino}</option>
                  ))}
                </Select>
              </FormField>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); reset(); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>Registrar gasto</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
