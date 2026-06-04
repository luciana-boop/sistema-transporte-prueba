// FILE: src/app/(dashboard)/pedidos/page.tsx
// MODIFICADO: solo estados ACTIVO/ANULADO, sin pesoCarga
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Edit2, XCircle, Download } from 'lucide-react';
import { pedidosApi, clientesApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage, ESTADO_PEDIDO_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import * as XLSX from 'xlsx';

const schema = z.object({
  clienteId: z.string().min(1, 'Selecciona un cliente'),
  origen: z.string().min(2, 'Origen requerido'),
  destino: z.string().min(2, 'Destino requerido'),
  tipoCarga: z.string().min(2, 'Tipo de carga requerido'),
  tarifa: z.string().min(1, 'Tarifa requerida'),
  observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function PedidosPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: pedidos = [], isLoading } = useQuery({
    queryKey: ['pedidos', search, filtroEstado],
    queryFn: () => pedidosApi.listar({
      search: search || undefined,
      estado: filtroEstado as any || undefined,
    }).then((r) => r.data.data),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => clientesApi.listar().then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['pedidos'] });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => pedidosApi.crear({
      clienteId: parseInt(d.clienteId),
      origen: d.origen, destino: d.destino, tipoCarga: d.tipoCarga,
      tarifa: parseFloat(d.tarifa), observaciones: d.observaciones,
    }),
    onSuccess: () => { toast.success('Pedido creado'); setShowForm(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => pedidosApi.actualizar(editing!.id, {
      origen: d.origen, destino: d.destino, tipoCarga: d.tipoCarga,
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
    setValue('observaciones', p.observaciones ?? '');
  };

  const exportExcel = () => {
    const rows = pedidos.map((p) => ({
      ID: p.id, Cliente: p.cliente?.razonSocial, Origen: p.origen, Destino: p.destino,
      'Tipo carga': p.tipoCarga, 'Tarifa S/': Number(p.tarifa), Estado: p.estado,
      Fecha: formatDate(p.fechaPedido),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos');
    XLSX.writeFile(wb, `pedidos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Pedidos"
        description={`${pedidos.length} pedido${pedidos.length !== 1 ? 's' : ''}`}
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

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9 w-64" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-44">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_PEDIDO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </div>

      {isLoading ? <TableSkeleton rows={7} cols={7} /> : (
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
                      <span className="text-xs text-muted-foreground italic px-1" title="Tiene factura emitida">
                        Facturado
                      </span>
                    )}
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={8}><EmptyState message="No se encontraron pedidos" /></td></tr>}
          </tbody>
        </Table>
      )}

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
              <Input placeholder="Mercadería general" {...register('tipoCarga')} />
            </FormField>
            <FormField label="Tarifa (S/)" required error={errors.tarifa?.message}>
              <Input type="number" step="0.01" placeholder="1500.00" {...register('tarifa')} />
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
