// FILE: src/app/(dashboard)/conductores/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, AlertTriangle, Download } from 'lucide-react';
import { conductoresApi, fetchAllPages } from '@/services/api';
import { formatDate, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, AuditInfo,
} from '@/components/shared';
import type { Conductor } from '@/types';
import * as XLSX from 'xlsx';

const schema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  dni: z.string().length(8, 'DNI debe tener 8 dígitos'),
  licencia: z.string().min(2, 'Licencia requerida'),
  vencimientoLicencia: z.string().min(1, 'Fecha de vencimiento requerida'),
  telefono: z.string().optional(),
  direccion: z.string().optional(),
  observaciones: z.string().optional(),
  tractoPreferencia: z.string().optional(),
  carretaPreferencia: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function diasHasta(fechaStr: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr);
  return Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ConductoresPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Conductor | null>(null);

  const limit = 20;
  const { data, isLoading } = useQuery({
    queryKey: ['conductores', search, page],
    queryFn: () => conductoresApi.listar({ search: search || undefined, page, limit }).then((r) => r.data.data),
  });
  const conductores = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos'],
    queryFn: () => import('@/services/api').then(m => m.vehiculosApi.listar({ activo: true, limit: 100 })).then((r) => r.data.data.items),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['conductores'] });

  const exportExcel = async () => {
    const todos = await fetchAllPages((p) => conductoresApi.listar({ search: search || undefined, ...p }).then((r) => r.data.data));
    const rows = todos.map((cond) => ({
      '#': cond.id, Nombre: cond.nombre, DNI: cond.dni, Licencia: cond.licencia,
      'Venc. Licencia': cond.vencimientoLicencia ? formatDate(cond.vencimientoLicencia) : '',
      Teléfono: cond.telefono ?? '', Dirección: cond.direccion ?? '',
      'Tracto pref.': (cond as any).tractoPreferencia ?? '',
      'Carreta pref.': (cond as any).carretaPreferencia ?? '',
      Estado: cond.activo ? 'Activo' : 'Inactivo',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conductores');
    XLSX.writeFile(wb, `conductores_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const createMutation = useMutation({
    mutationFn: (d: FormData) => conductoresApi.crear({ ...d, activo: true }),
    onSuccess: () => { toast.success('Conductor creado'); setShowForm(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => conductoresApi.actualizar(editing!.id, d),
    onSuccess: () => { toast.success('Conductor actualizado'); setEditing(null); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => conductoresApi.eliminar(id),
    onSuccess: () => { toast.success('Conductor eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (c: Conductor) => {
    setEditing(c);
    setValue('nombre', c.nombre);
    setValue('dni', c.dni);
    setValue('licencia', c.licencia);
    setValue('vencimientoLicencia', c.vencimientoLicencia?.split('T')[0] ?? '');
    setValue('telefono', c.telefono ?? '');
    setValue('direccion', c.direccion ?? '');
    setValue('observaciones', c.observaciones ?? '');
    setValue('tractoPreferencia', c.tractoPreferencia ?? '');
    setValue('carretaPreferencia', c.carretaPreferencia ?? '');
  };

  const onSubmit = (d: FormData) => editing ? updateMutation.mutate(d) : createMutation.mutate(d);
  const modalOpen = showForm || !!editing;

  return (
    <div className="page-container">
      <PageHeader
        title="Conductores"
        description={`${total} conductor${total !== 1 ? 'es' : ''} registrados`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
            <Button onClick={() => { setShowForm(true); reset(); }}>
              <Plus className="w-4 h-4" /> Nuevo conductor
            </Button>
          </div>
        }
      />

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar por nombre, DNI..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
      </div>

      {isLoading ? <TableSkeleton rows={5} cols={7} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Nombre</Th>
              <Th>DNI</Th>
              <Th>Licencia</Th>
              <Th>Venc. Licencia</Th>
              <Th>Teléfono</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {conductores.length > 0 ? conductores.map((c) => {
              const dias = c.vencimientoLicencia ? diasHasta(c.vencimientoLicencia) : 999;
              const alerta = dias <= 30;
              return (
                <Tr key={c.id}>
                  <Td><span className="font-mono text-xs text-muted-foreground">#{c.id}</span></Td>
                  <Td><span className="font-medium text-sm">{c.nombre}</span></Td>
                  <Td><span className="font-mono text-xs">{c.dni}</span></Td>
                  <Td><span className="text-xs">{c.licencia}</span></Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {alerta && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
                      <span className={`text-xs ${alerta ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}`}>
                        {c.vencimientoLicencia ? formatDate(c.vencimientoLicencia) : '—'}
                        {alerta && dias > 0 && ` (${dias}d)`}
                        {alerta && dias <= 0 && ' (VENCIDA)'}
                      </span>
                    </div>
                  </Td>
                  <Td><span className="text-sm">{c.telefono ?? '—'}</span></Td>
                  <Td><Badge value={c.activo ? 'ACTIVO' : 'INACTIVO'} label={c.activo ? 'Activo' : 'Inactivo'} /></Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => { if (confirm('¿Eliminar conductor?')) deleteMutation.mutate(c.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Td>
                </Tr>
              );
            }) : (
              <tr><td colSpan={8}><EmptyState message="No se encontraron conductores" /></td></tr>
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

      <Modal open={modalOpen} onClose={() => { setShowForm(false); setEditing(null); reset(); }} title={editing ? 'Editar conductor' : 'Nuevo conductor'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <FormField label="Nombre completo" required error={errors.nombre?.message}>
                <Input placeholder="Juan Pérez García" {...register('nombre')} />
              </FormField>
            </div>
            <FormField label="DNI" required error={errors.dni?.message}>
              <Input placeholder="12345678" maxLength={8} {...register('dni')} />
            </FormField>
            <FormField label="Teléfono" error={errors.telefono?.message}>
              <Input placeholder="999 888 777" {...register('telefono')} />
            </FormField>
            <FormField label="N° Licencia" required error={errors.licencia?.message}>
              <Input placeholder="Q12345678" {...register('licencia')} />
            </FormField>
            <FormField label="Vencimiento licencia" required error={errors.vencimientoLicencia?.message}>
              <Input type="date" {...register('vencimientoLicencia')} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Dirección" error={errors.direccion?.message}>
                <Input placeholder="Av. Ejemplo 123, Lima" {...register('direccion')} />
              </FormField>
            </div>
            <FormField label="Tracto de preferencia" error={(errors as any).tractoPreferencia?.message}>
              <Select {...register('tractoPreferencia' as any)}>
                <option value="">Sin preferencia</option>
                {vehiculos.filter((v: any) => v.tipo === 'TRACTO').map((v: any) => (
                  <option key={v.id} value={v.placa}>{v.placa} — {v.marca} {v.modelo}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Carreta de preferencia" error={(errors as any).carretaPreferencia?.message}>
              <Select {...register('carretaPreferencia' as any)}>
                <option value="">Sin preferencia</option>
                {vehiculos.filter((v: any) => v.tipo === 'CARRETA').map((v: any) => (
                  <option key={v.id} value={v.placa}>{v.placa}</option>
                ))}
              </Select>
            </FormField>
            <div className="col-span-2">
              <FormField label="Observaciones" error={errors.observaciones?.message}>
                <Textarea placeholder="Notas adicionales..." {...register('observaciones')} />
              </FormField>
            </div>
          </div>
          {editing && (
            <AuditInfo
              creadoPor={editing.creadoPor}
              creadoEn={editing.creadoEn}
              actualizadoPor={editing.actualizadoPor}
              actualizadoEn={editing.actualizadoEn}
            />
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setEditing(null); reset(); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Guardar cambios' : 'Crear conductor'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
