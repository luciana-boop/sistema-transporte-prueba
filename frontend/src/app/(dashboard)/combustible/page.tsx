// FILE: src/app/(dashboard)/combustible/page.tsx
// CHAT 9:
//   - cuentaId ahora OBLIGATORIO (Zod required)
//   - monedaId se autocompleta y envía con el payload
//   - Muestra saldo disponible de la cuenta seleccionada
//   - Validación de saldo insuficiente antes de enviar

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Fuel, Eye } from 'lucide-react';
import { combustibleApi, vehiculosApi, conductoresApi, cuentasApi, liquidacionesApi } from '@/services/api';
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
  // P4: asociación opcional a la liquidación del conductor seleccionado
  liquidacionId: z.string().optional(),
  fecha: z.string().min(1, 'Fecha requerida'),
  galones: z.string().min(1, 'Galones/litros requerido'),
  monto: z.string().min(1, 'Monto requerido'),
  kilometraje: z.string().optional(),
  grifo: z.string().optional(),
  observaciones: z.string().optional(),
  // CHAT 9: obligatorios
  cuentaId: z.string().min(1, 'Debe seleccionar una cuenta'),
  monedaId: z.string().optional(),
  tipoPagoId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4'];

export default function CombustiblePage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [filtroVehiculo, setFiltroVehiculo] = useState('');
  const [viewing, setViewing] = useState<{ id: number } | null>(null);

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

  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas', 'activas'],
    queryFn: () => cuentasApi.getCuentas({ activo: true }).then((r) => r.data.data).catch(() => []),
  });

  // P9: detalle de solo lectura de una carga de combustible
  const { data: detalle, isLoading: detalleLoading } = useQuery({
    queryKey: ['combustible', 'detalle', viewing?.id],
    queryFn: () => combustibleApi.obtener(viewing!.id).then((r) => r.data.data),
    enabled: !!viewing,
  });

  const {
    register, handleSubmit, reset, setValue, control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fecha: new Date().toISOString().split('T')[0] },
  });

  const watchedCuentaId = useWatch({ control, name: 'cuentaId' });
  const cuentaSeleccionada = (cuentas as any[]).find((c) => String(c.id) === watchedCuentaId);

  // Autocompletar monedaId cuando se selecciona la cuenta
  useEffect(() => {
    if (!watchedCuentaId) return;
    const cuenta = (cuentas as any[]).find((c) => String(c.id) === watchedCuentaId);
    if (cuenta) {
      setValue('monedaId', String(cuenta.monedaId), { shouldValidate: false });
    }
  }, [watchedCuentaId, cuentas, setValue]);

  // P4: liquidaciones del conductor seleccionado, para asociar la carga
  const watchedConductorId = useWatch({ control, name: 'conductorId' });
  const { data: liquidacionesConductor = [] } = useQuery({
    queryKey: ['liquidaciones', 'por-conductor', watchedConductorId],
    queryFn: () => liquidacionesApi.listar({ conductorId: parseInt(watchedConductorId!) }).then((r) => r.data.data),
    enabled: !!watchedConductorId,
  });

  // Si cambia el conductor, limpiar la liquidación seleccionada (pertenecía al conductor anterior)
  useEffect(() => {
    setValue('liquidacionId', '', { shouldValidate: false });
  }, [watchedConductorId, setValue]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['combustible'] });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => {
      const monto = parseFloat(d.monto);
      // Validar saldo en cliente antes de enviar
      if (cuentaSeleccionada && Number(cuentaSeleccionada.saldoActual) < monto) {
        throw new Error(
          `Saldo insuficiente en la cuenta seleccionada. ` +
          `Saldo disponible: ${cuentaSeleccionada.moneda?.simbolo} ${Number(cuentaSeleccionada.saldoActual).toFixed(2)}`
        );
      }
      return combustibleApi.crear({
        vehiculoId: parseInt(d.vehiculoId),
        conductorId: d.conductorId ? parseInt(d.conductorId) : undefined,
        liquidacionId: d.liquidacionId ? parseInt(d.liquidacionId) : undefined,
        fecha: d.fecha,
        galones: parseFloat(d.galones),
        monto,
        kilometraje: d.kilometraje ? parseFloat(d.kilometraje) : undefined,
        grifo: d.grifo,
        observaciones: d.observaciones,
        cuentaId: parseInt(d.cuentaId),
        monedaId: d.monedaId ? parseInt(d.monedaId) : 1,
        tipoPagoId: d.tipoPagoId ? parseInt(d.tipoPagoId) : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Carga registrada');
      setShowForm(false);
      reset();
      invalidate();
      qc.invalidateQueries({ queryKey: ['cuentas'] });
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
  const rendimiento = totalGalones > 0 ? (totalMonto / totalGalones).toFixed(2) : '—';

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total galones" value={totalGalones.toFixed(2)} sub="Total cargado" icon={Fuel} color="blue" />
        <StatCard label="Gasto total" value={formatCurrency(totalMonto)} sub="Período seleccionado" color="red" />
        <StatCard label="Costo promedio" value={rendimiento === '—' ? '—' : `S/${rendimiento}`} sub="Por galón/litro" color="yellow" />
        <StatCard label="Cargas registradas" value={registros.length} color="default" />
      </div>

      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Gasto por vehículo</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} barSize={36}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `S/${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [formatCurrency(v), 'Gasto']} />
              <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                {chartData.map((_: any, i: number) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar placa, grifo..." className="pl-9 w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filtroVehiculo} onChange={(e) => setFiltroVehiculo(e.target.value)} className="w-44">
          <option value="">Todos los vehículos</option>
          {vehiculos.map((v) => (<option key={v.id} value={v.id}>{v.placa} — {v.marca}</option>))}
        </Select>
      </div>

      {isLoading ? <TableSkeleton rows={6} cols={9} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th><Th>Fecha</Th><Th>Vehículo</Th><Th>Conductor</Th>
              <Th>Galones/L</Th><Th>Monto</Th><Th>Grifo</Th><Th>Km</Th>
              <Th>Acc.</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((r) => (
              <Tr key={r.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{r.id}</span></Td>
                <Td><span className="text-sm">{formatDate(r.fecha)}</span></Td>
                <Td>
                  <div>
                    <p className="font-mono text-sm font-bold">{r.vehiculo?.placa}</p>
                    <p className="text-xs text-muted-foreground">{r.vehiculo?.marca}</p>
                  </div>
                </Td>
                <Td><span className="text-sm">{r.conductor?.nombre ?? '—'}</span></Td>
                <Td><span className="font-semibold">{Number(r.galones).toFixed(2)}</span></Td>
                <Td><span className="font-semibold text-red-500">{formatCurrency(Number(r.monto))}</span></Td>
                <Td><span className="text-sm">{r.grifo ?? '—'}</span></Td>
                <Td><span className="text-xs text-muted-foreground">{r.kilometraje ? `${r.kilometraje.toLocaleString()} km` : '—'}</span></Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setViewing({ id: r.id })}
                      className="p-1.5 rounded-md hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
                      title="Ver detalle"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {usuario?.rol === 'ADMIN' && (
                      <button
                        onClick={() => { if (confirm('¿Eliminar registro?')) deleteMutation.mutate(r.id); }}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="Eliminar"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            )) : (
              <tr><td colSpan={9}><EmptyState message="No se encontraron registros de combustible" /></td></tr>
            )}
          </tbody>
        </Table>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="Registrar carga de combustible">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">

            <div className="col-span-2">
              <FormField label="Vehículo" required error={errors.vehiculoId?.message}>
                <Select {...register('vehiculoId')}>
                  <option value="">Seleccionar vehículo</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>
                  ))}
                </Select>
              </FormField>
            </div>

            <FormField label="Conductor" error={errors.conductorId?.message}>
              <Select {...register('conductorId')}>
                <option value="">Sin conductor</option>
                {conductores.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
              </Select>
            </FormField>

            {/* P4: asociar la carga a una liquidación del conductor seleccionado */}
            <div className="col-span-2">
              <FormField label="Liquidación asociada" error={errors.liquidacionId?.message}>
                <Select {...register('liquidacionId')} disabled={!watchedConductorId}>
                  <option value="">
                    {watchedConductorId ? 'Sin liquidación asociada' : 'Selecciona un conductor primero'}
                  </option>
                  {(liquidacionesConductor as any[]).map((l) => (
                    <option key={l.id} value={l.id}>
                      Liquidación #{l.id} — {formatDate(l.fecha)} ({l.estado})
                    </option>
                  ))}
                </Select>
              </FormField>
              {watchedConductorId && liquidacionesConductor.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1.5">Este conductor no tiene liquidaciones registradas.</p>
              )}
            </div>

            <FormField label="Fecha" required error={errors.fecha?.message}>
              <Input type="date" {...register('fecha')} />
            </FormField>

            <FormField label="Galones / Litros" required error={errors.galones?.message}>
              <Input type="number" step="0.01" placeholder="50.00" {...register('galones')} />
            </FormField>

            <FormField label="Monto" required error={errors.monto?.message}>
              <Input type="number" step="0.01" placeholder="0.00" {...register('monto')} />
            </FormField>

            <FormField label="Kilometraje" error={errors.kilometraje?.message}>
              <Input type="number" placeholder="125000" {...register('kilometraje')} />
            </FormField>

            <FormField label="Grifo / Proveedor" error={errors.grifo?.message}>
              <Input placeholder="Primax, Repsol..." {...register('grifo')} />
            </FormField>

            {/* CHAT 9: Cuenta obligatoria */}
            <div className="col-span-2">
              <FormField label="Cuenta de pago" required error={errors.cuentaId?.message}>
                <Select {...register('cuentaId')}>
                  <option value="">Seleccionar cuenta...</option>
                  {(cuentas as any[]).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.moneda?.simbolo} {c.moneda?.codigo}) — Saldo: {c.moneda?.simbolo} {Number(c.saldoActual).toFixed(2)}
                    </option>
                  ))}
                </Select>
              </FormField>
              {cuentaSeleccionada && (
                <div className="flex items-center justify-between mt-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Saldo disponible</span>
                  <span className={`text-sm font-semibold ${Number(cuentaSeleccionada.saldoActual) <= 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {cuentaSeleccionada.moneda?.simbolo} {Number(cuentaSeleccionada.saldoActual).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <div className="col-span-2">
              <FormField label="Observaciones" error={errors.observaciones?.message}>
                <Textarea placeholder="Notas adicionales..." {...register('observaciones')} />
              </FormField>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); reset(); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>Registrar carga</Button>
          </div>
        </form>
      </Modal>

      {/* P9: vista de detalle de solo lectura — sin acciones de edición */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Carga de combustible #${viewing?.id ?? ''}`} maxWidth="max-w-lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            {detalleLoading ? <p className="text-sm text-muted-foreground">Cargando detalle…</p> : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Vehículo</p>
                  <p className="font-mono font-bold text-sm">{detalle?.vehiculo?.placa ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{detalle?.vehiculo?.marca}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Conductor</p>
                  <p className="text-sm">{detalle?.conductor?.nombre ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Liquidación asociada</p>
                  <p className="text-sm">
                    {detalle?.liquidacion ? `Liquidación #${detalle.liquidacion.id} — ${formatDate(detalle.liquidacion.fecha)} (${detalle.liquidacion.estado})` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Proveedor</p>
                  <p className="text-sm">{detalle?.grifo || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cuenta utilizada</p>
                  <p className="text-sm">{detalle?.movimiento?.cuenta?.nombre ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Moneda</p>
                  <p className="text-sm">{detalle?.movimiento?.moneda ? `${detalle.movimiento.moneda.nombre} (${detalle.movimiento.moneda.simbolo})` : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Monto</p>
                  <p className="font-bold text-lg text-red-500">{detalle ? formatCurrency(Number(detalle.monto)) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Fecha</p>
                  <p className="text-sm">{detalle ? formatDate(detalle.fecha) : '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Movimiento financiero generado</p>
                  <p className="text-sm font-mono">{detalle?.movimiento?.referencia ?? 'No se generó un movimiento financiero'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Usuario</p>
                  <p className="text-sm">{detalle?.movimiento?.usuario?.nombre ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Observaciones</p>
                  <p className="text-sm bg-muted/30 rounded p-2">{detalle?.observaciones || '—'}</p>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" type="button" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
