// FILE: src/app/(dashboard)/clientes/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, Download } from 'lucide-react';
import { clientesApi, fetchAllPages } from '@/services/api';
import { getErrorMessage, CONDICION_PAGO_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select,
} from '@/components/shared';
import type { Cliente, CondicionPago } from '@/types';
import * as XLSX from 'xlsx';

const schema = z.object({
  razonSocial: z.string().min(2, 'Mínimo 2 caracteres'),
  ruc: z.string().min(11, 'RUC debe tener 11 dígitos').max(11),
  direccion: z.string().min(3, 'Dirección requerida'),
  ubigeo: z.string().optional(),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  condicionPago: z.enum(['CONTADO','CREDITO_15','CREDITO_30','CREDITO_60']).default('CONTADO'),
});
type FormData = z.infer<typeof schema>;

export default function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);

  const limit = 20;
  const { data, isLoading } = useQuery({
    queryKey: ['clientes', search, page],
    queryFn: () => clientesApi.listar({ search: search || undefined, page, limit }).then((r) => r.data.data),
  });
  const clientes = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const exportExcel = async () => {
    const todos = await fetchAllPages((p) => clientesApi.listar({ search: search || undefined, ...p }).then((r) => r.data.data));
    const rows = todos.map((c) => ({
      '#': c.id, 'Razón social': c.razonSocial, RUC: c.ruc,
      Dirección: c.direccion, Ubigeo: c.ubigeo ?? '', Teléfono: c.telefono ?? '', Email: c.email ?? '',
      'Cond. pago': CONDICION_PAGO_LABEL[c.condicionPago], Estado: c.activo ? 'Activo' : 'Inactivo',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, `clientes_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['clientes'] });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => clientesApi.crear(d),
    onSuccess: () => { toast.success('Cliente creado'); setShowForm(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => clientesApi.actualizar(editing!.id, d),
    onSuccess: () => { toast.success('Cliente actualizado'); setEditing(null); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientesApi.eliminar(id),
    onSuccess: () => { toast.success('Cliente eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (c: Cliente) => {
    setEditing(c);
    setValue('razonSocial', c.razonSocial);
    setValue('ruc', c.ruc);
    setValue('direccion', c.direccion);
    setValue('ubigeo', c.ubigeo ?? '');
    setValue('telefono', c.telefono ?? '');
    setValue('email', c.email ?? '');
    setValue('condicionPago', c.condicionPago as CondicionPago);
  };

  const onSubmit = (d: FormData) => editing ? updateMutation.mutate(d) : createMutation.mutate(d);

  const modalOpen = showForm || !!editing;

  return (
    <div className="page-container">
      <PageHeader
        title="Clientes"
        description={`${total} cliente${total !== 1 ? 's' : ''} registrados`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
            <Button onClick={() => { setShowForm(true); reset(); }} className="gap-2">
              <Plus className="w-4 h-4" /> Nuevo cliente
            </Button>
          </div>
        }
      />

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, RUC..."
          className="pl-9"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Razón social</Th>
              <Th>RUC</Th>
              <Th>Teléfono</Th>
              <Th>Cond. pago</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {clientes.length > 0 ? clientes.map((c) => (
              <Tr key={c.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{c.id}</span></Td>
                <Td>
                  <div>
                    <p className="font-medium">{c.razonSocial}</p>
                    {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                  </div>
                </Td>
                <Td><span className="font-mono text-xs">{c.ruc}</span></Td>
                <Td><span className="text-sm">{c.telefono ?? '—'}</span></Td>
                <Td><span className="text-xs text-muted-foreground">{CONDICION_PAGO_LABEL[c.condicionPago]}</span></Td>
                <Td><Badge value={c.activo ? 'ABIERTA' : 'CERRADA'} label={c.activo ? 'Activo' : 'Inactivo'} /></Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Editar">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm('¿Eliminar cliente?')) deleteMutation.mutate(c.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all" title="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </Tr>
            )) : (
              <tr><td colSpan={7}><EmptyState message="No se encontraron clientes" /></td></tr>
            )}
          </tbody>
        </Table>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Siguiente
          </Button>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => { setShowForm(false); setEditing(null); reset(); }} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <FormField label="Razón social" required error={errors.razonSocial?.message}>
                <Input placeholder="Empresa S.A.C." {...register('razonSocial')} />
              </FormField>
            </div>
            <FormField label="RUC" required error={errors.ruc?.message}>
              <Input placeholder="20123456789" maxLength={11} {...register('ruc')} />
            </FormField>
            <FormField label="Condición de pago" error={errors.condicionPago?.message}>
              <Select {...register('condicionPago')}>
                {Object.entries(CONDICION_PAGO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </FormField>
            <div className="col-span-2">
              <FormField label="Dirección" required error={errors.direccion?.message}>
                <Input placeholder="Av. Ejemplo 123, Lima" {...register('direccion')} />
              </FormField>
            </div>
            <FormField label="Ubigeo" hint="Código INEI de 6 dígitos — se usa para autocompletar el destino en Guías" error={errors.ubigeo?.message}>
              <Input placeholder="150101" maxLength={6} {...register('ubigeo')} />
            </FormField>
            <FormField label="Teléfono" error={errors.telefono?.message}>
              <Input placeholder="01-234 5678" {...register('telefono')} />
            </FormField>
            <FormField label="Email" error={errors.email?.message}>
              <Input type="email" placeholder="contacto@empresa.com" {...register('email')} />
            </FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setEditing(null); reset(); }}>
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
