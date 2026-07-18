// FILE: src/app/(dashboard)/pedidos/page.tsx
// MEJORA 1: filtros de fecha inicializados en hoy.
// MEJORA 4: modal de detalle completo con rentabilidad.
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Edit2, XCircle, Download, Eye, X } from 'lucide-react';
import { pedidosApi, clientesApi, vehiculosApi, configuracionApi, fetchAllPages } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage, ESTADO_PEDIDO_LABEL, PAGE_SIZE } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, AuditInfo, Pagination,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import * as XLSX from 'xlsx';

const today = () => new Date().toISOString().split('T')[0];

const schema = z.object({
  clienteId: z.string().min(1, 'Selecciona un cliente'),
  origen: z.string().min(2, 'Origen requerido'),
  destino: z.string().min(2, 'Destino requerido'),
  tipoCarga: z.string().min(2, 'Tipo de carga requerido'),
  vehiculoId: z.string().optional(),
  tarifa: z.string().min(1, 'Tarifa requerida'),
  observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function PedidosPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  // MEJORA 1: por defecto hoy
  const [filtroDesde, setFiltroDesde] = useState(today);
  const [filtroHasta, setFiltroHasta] = useState(today);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [viewing, setViewing] = useState<any>(null);
  const [page, setPage] = useState(1);

  const limit = PAGE_SIZE;
  const { data, isLoading } = useQuery({
    queryKey: ['pedidos', search, filtroEstado, filtroDesde, filtroHasta, page],
    queryFn: () => pedidosApi.listar({
      search: search || undefined,
      estado: filtroEstado as any || undefined,
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
      page, limit,
    }).then((r) => r.data.data),
  });
  const pedidos = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const { data: rentabilidad } = useQuery({
    queryKey: ['pedido-rentabilidad', viewing?.id],
    queryFn: () => pedidosApi.rentabilidad(viewing!.id).then((r) => r.data.data),
    enabled: !!viewing?.id,
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => clientesApi.listar({ limit: 100 }).then((r) => r.data.data.items),
  });

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos', 'activos'],
    queryFn: () => vehiculosApi.listar({ activo: true, limit: 100 }).then((r) => r.data.data.items),
  });

  const { data: tiposCarga = [] } = useQuery({
    queryKey: ['tablas', 'tipo_carga'],
    queryFn: () => configuracionApi.getTablaMaestra('tipo_carga').then((r) => r.data.data),
    staleTime: 10 * 60 * 1000,
  });

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['pedidos'] });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => pedidosApi.crear({
      clienteId: parseInt(d.clienteId),
      origen: d.origen, destino: d.destino, tipoCarga: d.tipoCarga,
      vehiculoId: d.vehiculoId ? parseInt(d.vehiculoId) : undefined,
      tarifa: parseFloat(d.tarifa), observaciones: d.observaciones,
    }),
    onSuccess: () => { toast.success('Pedido creado'); setShowForm(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => pedidosApi.actualizar(editing!.id, {
      origen: d.origen, destino: d.destino, tipoCarga: d.tipoCarga,
      vehiculoId: d.vehiculoId ? parseInt(d.vehiculoId) : null,
      tarifa: parseFloat(d.tarifa), observaciones: d.observaciones,
    }),
    onSuccess: () => { toast.success('Pedido actualizado'); setEditing(null); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const anularMutation = useMutation({
    mutationFn: (id: number) => pedidosApi.anular(id),
    onSuccess: () => { toast.success('Pedido anulado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (p: any) => {
    setEditing(p);
    setValue('clienteId', String(p.clienteId));
    setValue('origen', p.origen); setValue('destino', p.destino);
    setValue('tipoCarga', p.tipoCarga); setValue('tarifa', String(p.tarifa));
    setValue('vehiculoId', p.vehiculoId ? String(p.vehiculoId) : '');
    setValue('observaciones', p.observaciones ?? '');
  };

  const exportExcel = async () => {
    const todos = await fetchAllPages((p) => pedidosApi.listar({
      search: search || undefined,
      estado: filtroEstado as any || undefined,
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
      ...p,
    }).then((r) => r.data.data));
    const rows = todos.map((p) => ({
      ID: p.id, Cliente: p.cliente?.razonSocial, Origen: p.origen, Destino: p.destino,
      'Tipo carga': p.tipoCarga, 'Tarifa S/': Number(p.tarifa), Estado: p.estado,
      Fecha: formatDate(p.fechaPedido),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    XLSX.writeFile(wb, `pedidos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const limpiarFiltros = () => {
    setSearch(''); setFiltroEstado(''); setFiltroDesde(''); setFiltroHasta(''); setPage(1);
  };
  const hayFiltros = !!(search || filtroEstado || filtroDesde || filtroHasta);

  return (
    <div className="page-container">
      <PageHeader
        title="Pedidos"
        description={`${total} pedido${total !== 1 ? 's' : ''}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}>
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button onClick={() => { setShowForm(true); reset(); }}>
              <Plus className="w-4 h-4" /> Nuevo pedido
            </Button>
          </div>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9 w-56" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPage(1); }} className="w-44">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_PEDIDO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" className="w-36" value={filtroDesde} onChange={(e) => { setFiltroDesde(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" className="w-36" value={filtroHasta} onChange={(e) => { setFiltroHasta(e.target.value); setPage(1); }} />
        </div>
        {hayFiltros && (
          <button onClick={limpiarFiltros} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
            <X className="w-3 h-3" /> Limpiar
          </button>
        )}
      </div>

      {isLoading ? <TableSkeleton rows={7} cols={8} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th><Th>Cliente</Th><Th>Origen → Destino</Th>
              <Th>Tipo carga</Th><Th>Tarifa</Th><Th>Estado</Th><Th>Fecha</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length > 0 ? pedidos.map((p) => (
              <Tr key={p.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{p.id}</span></Td>
                <Td><span className="font-medium text-sm">{p.cliente?.razonSocial}</span></Td>
                <Td><span className="text-xs text-muted-foreground">{p.origen} → {p.destino}</span></Td>
                <Td><span className="text-xs">{p.tipoCarga}</span></Td>
                <Td><span className="font-semibold text-sm">{formatCurrency(Number(p.tarifa))}</span></Td>
                <Td><Badge value={p.estado} label={ESTADO_PEDIDO_LABEL[p.estado] ?? p.estado} /></Td>
                <Td><span className="text-xs text-muted-foreground">{formatDate(p.fechaPedido)}</span></Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewing(p)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver detalle">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {p.estado === 'ACTIVO' && (
                      <>
                        <button onClick={() => openEdit(p)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Editar">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {usuario?.rol === 'ADMIN' && (
                          <button
                            onClick={() => { if (confirm('¿Anular pedido?')) anularMutation.mutate(p.id); }}
                            className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                            title="Anular pedido"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </>
                    )}
                    {p.estado === 'FACTURADO' && (
                      <span className="text-xs text-muted-foreground italic px-1">Facturado</span>
                    )}
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={8}><EmptyState message="No se encontraron pedidos" /></td></tr>}
          </tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* MEJORA 4: Modal de detalle */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Pedido #${viewing?.id}`} maxWidth="max-w-2xl">
        {viewing && (
          <div className="flex flex-col gap-5">
            {/* Estado + fecha */}
            <div className="flex items-center justify-between">
              <Badge value={viewing.estado} label={ESTADO_PEDIDO_LABEL[viewing.estado] ?? viewing.estado} />
              <span className="text-sm text-muted-foreground">{formatDate(viewing.fechaPedido)}</span>
            </div>

            {/* Datos principales */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                <p className="font-semibold">{viewing.cliente?.razonSocial}</p>
                <p className="text-xs text-muted-foreground">{viewing.cliente?.ruc}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Origen</p>
                <p className="font-medium">{viewing.origen}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Destino</p>
                <p className="font-medium">{viewing.destino}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tipo de carga</p>
                <p className="font-medium">{viewing.tipoCarga}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tarifa</p>
                <p className="font-semibold text-lg">{formatCurrency(Number(viewing.tarifa))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Vehículo</p>
                <p className="font-medium">{viewing.vehiculo?.placa ?? 'Sin vehículo asignado'}</p>
              </div>
            </div>

            {/* Rentabilidad — P5: por conductor (ganancia = facturado del pedido,
                gastos = liquidación del conductor + combustible asociado a esa liquidación) */}
            {rentabilidad && (
              <div className="bg-muted/30 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Rentabilidad</p>
                  {rentabilidad.conductor && (
                    <span className="text-xs text-muted-foreground">Conductor: <span className="font-medium text-foreground">{rentabilidad.conductor.nombre}</span></span>
                  )}
                </div>
                {!rentabilidad.conductor && (
                  <p className="text-xs text-muted-foreground mb-3">Este pedido aún no está incluido en ninguna liquidación, por lo que no se pueden estimar sus gastos asociados.</p>
                )}
                {rentabilidad.conductor && rentabilidad.cantidadPedidosLiquidacion > 1 && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Esta liquidación agrupa {rentabilidad.cantidadPedidosLiquidacion} pedidos: los gastos y el combustible mostrados corresponden solo a la parte proporcional (1/{rentabilidad.cantidadPedidosLiquidacion}) que le toca a este pedido.
                  </p>
                )}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Ganancia (facturado)</p>
                    <p className="font-semibold text-sm">{formatCurrency(rentabilidad.ganancia)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Gastos liquidación</p>
                    <p className="font-semibold text-sm text-red-500">{formatCurrency(rentabilidad.totalGastosLiquidacion)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Combustible</p>
                    <p className="font-semibold text-sm text-red-500">{formatCurrency(rentabilidad.totalCombustible)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Utilidad neta</p>
                    <p className={`font-bold text-sm ${rentabilidad.utilidadNeta >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                      {formatCurrency(rentabilidad.utilidadNeta)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 text-center">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rentabilidad.margenPorcentaje >= 0 ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'}`}>
                    Margen: {rentabilidad.margenPorcentaje.toFixed(1)}%
                  </span>
                </div>
              </div>
            )}

            {/* Observaciones */}
            {viewing.observaciones && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Observaciones</p>
                <p className="text-sm bg-muted/30 rounded p-2">{viewing.observaciones}</p>
              </div>
            )}

            <AuditInfo
              creadoPor={viewing.creadoPor}
              creadoEn={viewing.creadoEn}
              actualizadoPor={viewing.actualizadoPor}
              actualizadoEn={viewing.actualizadoEn}
            />

            <div className="flex justify-between pt-2 border-t border-border">
              {viewing.estado === 'ACTIVO' && (
                <Button size="sm" variant="secondary" onClick={() => { setViewing(null); openEdit(viewing); }}>
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
              <Button variant="secondary" onClick={() => setViewing(null)} className="ml-auto">Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal crear/editar */}
      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null); reset(); }} title={editing ? 'Editar pedido' : 'Nuevo pedido'} maxWidth="max-w-xl">
        <form onSubmit={handleSubmit((d) => editing ? updateMutation.mutate(d) : createMutation.mutate(d))} className="flex flex-col gap-4">
          {!editing && (
            <FormField label="Cliente" required error={errors.clienteId?.message}>
              <Select {...register('clienteId')}>
                <option value="">Seleccionar cliente</option>
                {clientes.filter((c) => c.activo).map((c) => (
                  <option key={c.id} value={c.id}>{c.razonSocial} — {c.ruc}</option>
                ))}
              </Select>
            </FormField>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Origen" required error={errors.origen?.message}>
              <Input placeholder="Lima - Callao" {...register('origen')} />
            </FormField>
            <FormField label="Destino" required error={errors.destino?.message}>
              <Input placeholder="Trujillo" {...register('destino')} />
            </FormField>
            <FormField label="Tipo de carga" required error={errors.tipoCarga?.message}>
              <Select {...register('tipoCarga')}>
                <option value="">Seleccionar tipo de carga</option>
                {tiposCarga.map((t) => (
                  <option key={t.codigo} value={t.codigo}>{t.nombre}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Tarifa (S/)" required error={errors.tarifa?.message}>
              <Input type="number" step="0.01" placeholder="1500.00" {...register('tarifa')} />
            </FormField>
            <FormField label="Vehículo" error={errors.vehiculoId?.message} hint="Placa asignada al viaje (opcional)">
              <Select {...register('vehiculoId')}>
                <option value="">Sin vehículo asignado</option>
                {vehiculos.filter((v: any) => v.tipo === 'TRACTO').map((v) => (
                  <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>
                ))}
              </Select>
            </FormField>
          </div>
          <FormField label="Observaciones"><Textarea placeholder="Notas..." {...register('observaciones')} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setEditing(null); reset(); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Guardar cambios' : 'Crear pedido'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
