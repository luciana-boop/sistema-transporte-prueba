// FILE: src/app/(dashboard)/combustible/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Fuel } from 'lucide-react';
import { combustibleApi, vehiculosApi, conductoresApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';

const schema = z.object({
  vehiculoId: z.string().min(1, 'Vehículo requerido'),
  conductorId: z.string().optional(),
  fecha: z.string().min(1, 'Fecha requerida'),
  galones: z.string().min(1, 'Galones/litros requerido'),
  monto: z.string().min(1, 'Monto requerido'),
  kilometraje: z.string().optional(),
  grifo: z.string().optional(),
  observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function CombustiblePage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filtroVehiculo, setFiltroVehiculo] = useState('');

  const { data: registros = [], isLoading } = useQuery({
    queryKey: ['combustible', filtroVehiculo],
    queryFn: () =>
      combustibleApi
        .listar({ vehiculoId: filtroVehiculo ? parseInt(filtroVehiculo) : undefined })
        .then((r) => r.data.data),
  });

  const { data: resumen } = useQuery({
    queryKey: ['combustible', 'resumen'],
    queryFn: () => combustibleApi.resumen().then((r) => r.data.data),
  });

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos'],
    queryFn: () => vehiculosApi.listar({ activo: true }).then((r) => r.data.data),
  });

  const { data: conductores = [] } = useQuery({
    queryKey: ['conductores'],
    queryFn: () => conductoresApi.listar({ activo: true }).then((r) => r.data.data),
  });

  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fecha: new Date().toISOString().split('T')[0] },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['combustible'] });

  const createMutation = useMutation({
    mutationFn: (d: FormData) =>
      combustibleApi.crear({
        vehiculoId: parseInt(d.vehiculoId),
        conductorId: d.conductorId ? parseInt(d.conductorId) : undefined,
        fecha: d.fecha,
        galones: parseFloat(d.galones),
        monto: parseFloat(d.monto),
        kilometraje: d.kilometraje ? parseFloat(d.kilometraje) : undefined,
        grifo: d.grifo,
        observaciones: d.observaciones,
      }),
    onSuccess: () => {
      toast.success('Carga registrada');
      setShowForm(false);
      reset();
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => combustibleApi.eliminar(id),
    onSuccess: () => { toast.success('Registro eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const filtered = registros.filter((r) =>
    search
      ? r.vehiculo?.placa.toLowerCase().includes(search.toLowerCase()) ||
        r.grifo?.toLowerCase().includes(search.toLowerCase()) ||
        r.conductor?.nombre.toLowerCase().includes(search.toLowerCase())
      : true
  );

  const chartData = (resumen?.porVehiculo ?? []).map((v: any) => ({
    name: v.placa,
    monto: v.totalMonto,
    galones: v.totalGalones,
  }));

  const totalGalones = registros.reduce((s, r) => s + Number(r.galones), 0);
  const totalMonto = registros.reduce((s, r) => s + Number(r.monto), 0);
  const rendimiento =
    totalGalones > 0 ? (totalMonto / totalGalones).toFixed(2) : '—';

  return (
    <div className="page-container">
      <PageHeader
        title="Combustible"
        description="Control de consumo y gasto por vehículo"
        action={
          <Button onClick={() => { setShowForm(true); reset(); }}>
            <Plus className="w-4 h-4" /> Registrar carga
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total galones"
          value={totalGalones.toFixed(2)}
          sub="Total cargado"
          icon={Fuel}
          color="blue"
        />
        <StatCard
          label="Gasto total"
          value={formatCurrency(totalMonto)}
          sub="Período seleccionado"
          color="red"
        />
        <StatCard
          label="Costo promedio"
          value={rendimiento === '—' ? '—' : `S/${rendimiento}`}
          sub="Por galón/litro"
          color="yellow"
        />
        <StatCard
          label="Cargas registradas"
          value={registros.length}
          color="default"
        />
      </div>

      {/* Gráfico por vehículo */}
      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Gasto por vehículo</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatCurrency(v), 'Gasto']}
              />
              <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                {chartData.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar placa, grifo..."
            className="pl-9 w-64"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={filtroVehiculo}
          onChange={(e) => setFiltroVehiculo(e.target.value)}
          className="w-44"
        >
          <option value="">Todos los vehículos</option>
          {vehiculos.map((v) => (
            <option key={v.id} value={v.id}>{v.placa} — {v.marca}</option>
          ))}
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Fecha</Th>
              <Th>Vehículo</Th>
              <Th>Conductor</Th>
              <Th>Galones/L</Th>
              <Th>Monto</Th>
              <Th>Grifo</Th>
              <Th>Km</Th>
              {usuario?.rol === 'ADMIN' && <Th>Acc.</Th>}
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((r) => (
                <Tr key={r.id}>
                  <Td><span className="font-mono text-xs text-muted-foreground">#{r.id}</span></Td>
                  <Td><span className="text-sm">{formatDate(r.fecha)}</span></Td>
                  <Td>
                    <div>
                      <p className="font-mono text-sm font-bold">{r.vehiculo?.placa}</p>
                      <p className="text-xs text-muted-foreground">{r.vehiculo?.marca}</p>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-sm">{r.conductor?.nombre ?? '—'}</span>
                  </Td>
                  <Td>
                    <span className="font-semibold">{Number(r.galones).toFixed(2)}</span>
                  </Td>
                  <Td>
                    <span className="font-semibold text-red-500">
                      {formatCurrency(Number(r.monto))}
                    </span>
                  </Td>
                  <Td><span className="text-sm">{r.grifo ?? '—'}</span></Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">
                      {r.kilometraje ? `${r.kilometraje.toLocaleString()} km` : '—'}
                    </span>
                  </Td>
                  {usuario?.rol === 'ADMIN' && (
                    <Td>
                      <button
                        onClick={() => {
                          if (confirm('¿Eliminar registro?')) deleteMutation.mutate(r.id);
                        }}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </Td>
                  )}
                </Tr>
              ))
            ) : (
              <tr>
                <td colSpan={9}>
                  <EmptyState message="No se encontraron registros de combustible" />
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      {/* Create Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); reset(); }}
        title="Registrar carga de combustible"
      >
        <form
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="flex flex-col gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FormField label="Vehículo" required error={errors.vehiculoId?.message}>
                <Select {...register('vehiculoId')}>
                  <option value="">Seleccionar vehículo</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.placa} — {v.marca} {v.modelo}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Conductor" error={errors.conductorId?.message}>
              <Select {...register('conductorId')}>
                <option value="">Sin conductor</option>
                {conductores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Fecha" required error={errors.fecha?.message}>
              <Input type="date" {...register('fecha')} />
            </FormField>
            <FormField label="Galones / Litros" required error={errors.galones?.message}>
              <Input
                type="number"
                step="0.01"
                placeholder="50.00"
                {...register('galones')}
              />
            </FormField>
            <FormField label="Monto (S/)" required error={errors.monto?.message}>
              <Input
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register('monto')}
              />
            </FormField>
            <FormField label="Kilometraje" error={errors.kilometraje?.message}>
              <Input
                type="number"
                placeholder="125000"
                {...register('kilometraje')}
              />
            </FormField>
            <FormField label="Grifo / Proveedor" error={errors.grifo?.message}>
              <Input placeholder="Primax, Repsol..." {...register('grifo')} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Observaciones" error={errors.observaciones?.message}>
                <Textarea
                  placeholder="Notas adicionales..."
                  {...register('observaciones')}
                />
              </FormField>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="secondary"
              type="button"
              onClick={() => { setShowForm(false); reset(); }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isSubmitting || createMutation.isPending}
            >
              Registrar carga
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
