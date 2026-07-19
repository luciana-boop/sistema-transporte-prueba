// FILE: src/app/(dashboard)/vehiculos/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, AlertTriangle, Download } from 'lucide-react';
import { vehiculosApi, fetchAllPages } from '@/services/api';
import { formatDate, getErrorMessage, PAGE_SIZE } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, AuditInfo, Pagination,
} from '@/components/shared';
import type { Vehiculo } from '@/types';
import * as XLSX from 'xlsx';

const schema = z.object({
  placa: z.string().min(2, 'Placa requerida').toUpperCase(),
  tipo: z.enum(['TRACTO', 'CARRETA']),
  marca: z.string().optional(),
  modelo: z.string().optional(),
  anio: z.string().optional(),
  // TUCE / Cert. Habilitación Vehicular (MTC) — se declara en la guía SUNAT.
  tuce: z.string().optional(),
  soat: z.string().optional(),
  vencimientoSoat: z.string().optional(),
  revisionTecnica: z.string().optional(),
  vencimientoRevision: z.string().optional(),
  ultimoMantenimiento: z.string().optional(),
  proximoMantenimiento: z.string().optional(),
  estado: z.string().default('OPERATIVO'),
  observaciones: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function diasHasta(fechaStr?: string): number {
  if (!fechaStr) return 999;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(fechaStr).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));
}

function AlertaFecha({ fecha, label }: { fecha?: string; label: string }) {
  if (!fecha) return <span className="text-xs text-muted-foreground">—</span>;
  const dias = diasHasta(fecha);
  const alerta = dias <= 30;
  return (
    <div className="flex items-center gap-1">
      {alerta && <AlertTriangle className="w-3 h-3 text-yellow-500 shrink-0" />}
      <span className={`text-xs ${alerta ? 'text-yellow-600 dark:text-yellow-400 font-medium' : 'text-muted-foreground'}`}>
        {formatDate(fecha)}{alerta && dias > 0 ? ` (${dias}d)` : alerta ? ' (VENCIDO)' : ''}
      </span>
    </div>
  );
}

export default function VehiculosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehiculo | null>(null);

  const limit = PAGE_SIZE;
  const { data, isLoading } = useQuery({
    queryKey: ['vehiculos', search, filtroTipo, page],
    queryFn: () => vehiculosApi.listar({ search: search || undefined, tipo: filtroTipo || undefined, page, limit }).then((r) => r.data.data),
  });
  const vehiculos = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'TRACTO', estado: 'OPERATIVO' },
  });

  const exportExcel = async () => {
    const todos = await fetchAllPages((p) => vehiculosApi.listar({ search: search || undefined, tipo: filtroTipo || undefined, ...p }).then((r) => r.data.data));
    const rows = todos.map((v) => ({
      '#': v.id, Placa: v.placa, Tipo: v.tipo, Marca: v.marca, Modelo: v.modelo, Año: v.anio,
      SOAT: v.soat ?? '', 'Venc. SOAT': v.vencimientoSoat ? formatDate(v.vencimientoSoat) : '',
      'Rev. Técnica': v.revisionTecnica ?? '', 'Venc. Rev.': v.vencimientoRevision ? formatDate(v.vencimientoRevision) : '',
      Estado: v.estado,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Vehículos');
    XLSX.writeFile(wb, `vehiculos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['vehiculos'] });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => vehiculosApi.crear({ ...d, anio: d.anio ? parseInt(d.anio) : null, activo: true }),
    onSuccess: () => { toast.success('Vehículo creado'); setShowForm(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: (d: FormData) => vehiculosApi.actualizar(editing!.id, { ...d, anio: d.anio ? parseInt(d.anio) : null }),
    onSuccess: () => { toast.success('Vehículo actualizado'); setEditing(null); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => vehiculosApi.eliminar(id),
    onSuccess: () => { toast.success('Vehículo eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (v: Vehiculo) => {
    setEditing(v);
    const fix = (s?: string) => s?.split('T')[0] ?? '';
    setValue('placa', v.placa); setValue('tipo', v.tipo); setValue('marca', v.marca ?? '');
    setValue('modelo', v.modelo ?? ''); setValue('anio', v.anio != null ? String(v.anio) : ''); setValue('estado', v.estado);
    setValue('tuce', (v as any).tuce ?? '');
    setValue('soat', v.soat ?? ''); setValue('vencimientoSoat', fix(v.vencimientoSoat));
    setValue('revisionTecnica', v.revisionTecnica ?? ''); setValue('vencimientoRevision', fix(v.vencimientoRevision));
    setValue('ultimoMantenimiento', fix(v.ultimoMantenimiento)); setValue('proximoMantenimiento', fix(v.proximoMantenimiento));
    setValue('observaciones', v.observaciones ?? '');
  };

  const onSubmit = (d: FormData) => editing ? updateMutation.mutate(d) : createMutation.mutate(d);

  return (
    <div className="page-container">
      <PageHeader
        title="Vehículos"
        description={`${total} vehículo${total !== 1 ? 's' : ''} registrados`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
            <Button onClick={() => { setShowForm(true); reset(); }}>
              <Plus className="w-4 h-4" /> Nuevo vehículo
            </Button>
          </div>
        }
      />

      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar placa, marca..." className="pl-9 w-64" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <Select value={filtroTipo} onChange={(e) => { setFiltroTipo(e.target.value); setPage(1); }} className="w-36">
          <option value="">Todos los tipos</option>
          <option value="TRACTO">Tracto</option>
          <option value="CARRETA">Carreta</option>
        </Select>
      </div>

      {isLoading ? <TableSkeleton rows={5} cols={8} /> : (
        <Table>
          <thead>
            <tr>
              <Th>Placa</Th>
              <Th>Tipo</Th>
              <Th>Marca / Modelo</Th>
              <Th>Año</Th>
              <Th>Venc. SOAT</Th>
              <Th>Venc. Rev. Téc.</Th>
              <Th>Estado</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {vehiculos.length > 0 ? vehiculos.map((v) => (
              <Tr key={v.id}>
                <Td><span className="font-mono text-sm font-bold">{v.placa}</span></Td>
                <Td><Badge value={v.tipo} label={v.tipo === 'TRACTO' ? 'Tracto' : 'Carreta'} /></Td>
                <Td>
                  <div>
                    <p className="text-sm font-medium">{v.marca || '—'}</p>
                    <p className="text-xs text-muted-foreground">{v.modelo}</p>
                  </div>
                </Td>
                <Td><span className="text-sm">{v.anio ?? '—'}</span></Td>
                <Td><AlertaFecha fecha={v.vencimientoSoat} label="SOAT" /></Td>
                <Td><AlertaFecha fecha={v.vencimientoRevision} label="Revisión" /></Td>
                <Td><Badge value={v.activo ? 'ACTIVO' : 'INACTIVO'} label={v.estado || (v.activo ? 'Operativo' : 'Inactivo')} /></Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(v)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm('¿Eliminar vehículo?')) deleteMutation.mutate(v.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={8}><EmptyState message="No se encontraron vehículos" /></td></tr>}
          </tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null); reset(); }} title={editing ? 'Editar vehículo' : 'Nuevo vehículo'} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Placa" required error={errors.placa?.message}>
              <Input placeholder="ABC-123" {...register('placa')} className="uppercase" />
            </FormField>
            <FormField label="Tipo" required error={errors.tipo?.message}>
              <Select {...register('tipo')}>
                <option value="TRACTO">Tracto</option>
                <option value="CARRETA">Carreta</option>
              </Select>
            </FormField>
            <FormField label="Estado" error={errors.estado?.message}>
              <Select {...register('estado')}>
                <option value="OPERATIVO">Operativo</option>
                <option value="MANTENIMIENTO">En mantenimiento</option>
                <option value="INACTIVO">Inactivo</option>
              </Select>
            </FormField>
            <FormField label="Marca" error={errors.marca?.message}>
              <Input placeholder="Volvo" {...register('marca')} />
            </FormField>
            <FormField label="Modelo" error={errors.modelo?.message}>
              <Input placeholder="FH 460" {...register('modelo')} />
            </FormField>
            <FormField label="Año" error={errors.anio?.message}>
              <Input type="number" placeholder="2020" min={1990} max={2030} {...register('anio')} />
            </FormField>
          </div>

          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-1">Documentación</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="N° SOAT" error={errors.soat?.message}>
              <Input placeholder="Número de póliza" {...register('soat')} />
            </FormField>
            <FormField label="Vencimiento SOAT" error={errors.vencimientoSoat?.message}>
              <Input type="date" {...register('vencimientoSoat')} />
            </FormField>
            <FormField label="N° TUCE / Habilitación Vehicular" hint="Tarjeta Única de Circulación (MTC) — va en la guía SUNAT" error={errors.tuce?.message}>
              <Input placeholder="15M24012314E" {...register('tuce')} />
            </FormField>
            <FormField label="N° Rev. Técnica" error={errors.revisionTecnica?.message}>
              <Input placeholder="Número de certificado" {...register('revisionTecnica')} />
            </FormField>
            <FormField label="Vencimiento Rev. Técnica" error={errors.vencimientoRevision?.message}>
              <Input type="date" {...register('vencimientoRevision')} />
            </FormField>
            <FormField label="Último mantenimiento" error={errors.ultimoMantenimiento?.message}>
              <Input type="date" {...register('ultimoMantenimiento')} />
            </FormField>
            <FormField label="Próximo mantenimiento" error={errors.proximoMantenimiento?.message}>
              <Input type="date" {...register('proximoMantenimiento')} />
            </FormField>
          </div>

          <FormField label="Observaciones" error={errors.observaciones?.message}>
            <Textarea placeholder="Notas adicionales..." {...register('observaciones')} />
          </FormField>

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
              {editing ? 'Guardar cambios' : 'Crear vehículo'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
