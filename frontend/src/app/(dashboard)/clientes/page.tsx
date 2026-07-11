// FILE: src/app/(dashboard)/clientes/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Edit2, Trash2, Download, Eye, UserPlus } from 'lucide-react';
import { clientesApi, fetchAllPages } from '@/services/api';
import { getErrorMessage, CONDICION_PAGO_LABEL, PAGE_SIZE } from '@/lib/utils';
import { buscarPorCodigo, detectarUbigeo, type UbigeoEntry } from '@/lib/ubigeo';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, AuditInfo, Pagination,
} from '@/components/shared';
import type { Cliente, CondicionPago } from '@/types';
import * as XLSX from 'xlsx';

const contactoSchema = z.object({
  nombre: z.string().min(2, 'Nombre requerido'),
  telefono: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
});
type ContactoFormData = z.infer<typeof contactoSchema>;

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

// Aislado en su propio componente: sus mutaciones invalidan/refetchean la
// consulta de contactos, y si esa lógica vivía en el formulario base de
// cliente, cada refetch reasignaba el ref de react-hook-form en TODOS los
// inputs base (razonSocial, ruc, etc.) — provocando que, en una carrera con
// la limpieza interna de RHF, el valor de esos campos se vaciara solo. Al
// vivir en un componente separado, sus re-renders no tocan el formulario base.
function ContactosEditor({ clienteId }: { clienteId: number }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ['cliente-detalle', clienteId],
    queryFn: () => clientesApi.obtener(clienteId).then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<ContactoFormData>({
    resolver: zodResolver(contactoSchema),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['cliente-detalle', clienteId] });
  const cerrarForm = () => { setShowForm(false); setEditingId(null); reset(); };

  const agregarMutation = useMutation({
    mutationFn: (d: ContactoFormData) => clientesApi.agregarContacto(clienteId, d),
    onSuccess: () => { toast.success('Contacto agregado'); cerrarForm(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const actualizarMutation = useMutation({
    mutationFn: (d: ContactoFormData) => clientesApi.actualizarContacto(editingId!, d),
    onSuccess: () => { toast.success('Contacto actualizado'); cerrarForm(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const eliminarMutation = useMutation({
    mutationFn: (contactoId: number) => clientesApi.eliminarContacto(contactoId),
    onSuccess: () => { toast.success('Contacto eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const onSubmit = (d: ContactoFormData) => (editingId ? actualizarMutation.mutate(d) : agregarMutation.mutate(d));
  const abrirEditar = (ct: { id: number; nombre: string; telefono?: string | null; email?: string | null }) => {
    setEditingId(ct.id);
    reset({ nombre: ct.nombre, telefono: ct.telefono ?? '', email: ct.email ?? '' });
    setShowForm(true);
  };

  return (
    <div className="pt-2 border-t border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contactos</p>
        {!showForm && (
          <Button size="sm" variant="secondary" type="button" onClick={() => { setEditingId(null); reset({ nombre: '', telefono: '', email: '' }); setShowForm(true); }}>
            <UserPlus className="w-3.5 h-3.5" /> Agregar contacto
          </Button>
        )}
      </div>

      {showForm && (
        <div
          className="grid grid-cols-3 gap-2 items-start bg-muted/30 rounded-lg p-3 mb-2"
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        >
          <FormField label="Nombre" error={errors.nombre?.message}>
            <Input placeholder="Nombre del contacto" {...register('nombre')} />
          </FormField>
          <FormField label="Teléfono" error={errors.telefono?.message}>
            <Input placeholder="01-234 5678" {...register('telefono')} />
          </FormField>
          <FormField label="Correo" error={errors.email?.message}>
            <Input type="email" placeholder="correo@empresa.com" {...register('email')} />
          </FormField>
          <div className="col-span-3 flex justify-end gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={cerrarForm}>Cancelar</Button>
            <Button
              type="button"
              size="sm"
              loading={isSubmitting || agregarMutation.isPending || actualizarMutation.isPending}
              onClick={handleSubmit(onSubmit)}
            >
              {editingId ? 'Guardar cambios' : 'Guardar contacto'}
            </Button>
          </div>
        </div>
      )}

      {data?.contactos && data.contactos.length > 0 ? (
        <div className="flex flex-col gap-1">
          {data.contactos.map((ct) => (
            <div key={ct.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-2">
              <div>
                <p className="font-medium">{ct.nombre}</p>
                <p className="text-xs text-muted-foreground">{[ct.telefono, ct.email].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => abrirEditar(ct)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                  title="Modificar contacto"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => { if (confirm('¿Eliminar contacto?')) eliminarMutation.mutate(ct.id); }}
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                  title="Eliminar contacto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && <p className="text-xs text-muted-foreground">Sin contactos adicionales registrados.</p>
      )}
    </div>
  );
}

export default function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);

  const limit = PAGE_SIZE;
  const { data, isLoading } = useQuery({
    queryKey: ['clientes', search, page],
    queryFn: () => clientesApi.listar({ search: search || undefined, page, limit }).then((r) => r.data.data),
  });
  const clientes = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const { data: viewing } = useQuery({
    queryKey: ['cliente-detalle', viewingId],
    queryFn: () => clientesApi.obtener(viewingId!).then((r) => r.data.data),
    enabled: !!viewingId,
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const direccionVal = watch('direccion');
  const ubigeoVal = watch('ubigeo');
  const [candidatosUbigeo, setCandidatosUbigeo] = useState<UbigeoEntry[]>([]);

  // Autocompleta el ubigeo detectando el nombre del distrito dentro de la dirección escrita.
  // Solo actúa si el ubigeo sigue vacío (no pisa un valor ya ingresado/editado).
  useEffect(() => {
    if (ubigeoVal || !direccionVal || direccionVal.trim().length < 6) { setCandidatosUbigeo([]); return; }
    const t = setTimeout(() => {
      const res = detectarUbigeo(direccionVal);
      if (res.estado === 'encontrado') { setValue('ubigeo', res.entry.ubigeo); setCandidatosUbigeo([]); }
      else if (res.estado === 'ambiguo') setCandidatosUbigeo(res.candidatos);
      else setCandidatosUbigeo([]);
    }, 400);
    return () => clearTimeout(t);
  }, [direccionVal, ubigeoVal, setValue]);

  const ubigeoResuelto = buscarPorCodigo(ubigeoVal);

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
    onSuccess: () => { toast.success('Cliente actualizado'); closeEditModal(); invalidate(); },
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

  const closeEditModal = () => { setShowForm(false); setEditing(null); reset(); };

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
                    <button onClick={() => setViewingId(c.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver detalle">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
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

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* Ver cliente (solo lectura) */}
      <Modal
        open={!!viewingId}
        onClose={() => setViewingId(null)}
        title={viewing ? viewing.razonSocial : 'Cliente'}
        maxWidth="max-w-2xl"
      >
        {viewing && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <Badge value={viewing.activo ? 'ABIERTA' : 'CERRADA'} label={viewing.activo ? 'Activo' : 'Inactivo'} />
              <span className="text-sm text-muted-foreground">{CONDICION_PAGO_LABEL[viewing.condicionPago]}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Razón social</p>
                <p className="font-semibold">{viewing.razonSocial}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">RUC</p>
                <p className="font-medium font-mono text-sm">{viewing.ruc}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Ubigeo</p>
                <p className="font-medium">{viewing.ubigeo ?? '—'}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Dirección</p>
                <p className="font-medium">{viewing.direccion}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Teléfono</p>
                <p className="font-medium">{viewing.telefono ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="font-medium">{viewing.email ?? '—'}</p>
              </div>
            </div>

            {/* Contactos (solo lectura — se agregan/modifican desde Editar) */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Contactos</p>
              {viewing.contactos && viewing.contactos.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {viewing.contactos.map((ct) => (
                    <div key={ct.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-2">
                      <div>
                        <p className="font-medium">{ct.nombre}</p>
                        <p className="text-xs text-muted-foreground">{[ct.telefono, ct.email].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Sin contactos adicionales registrados.</p>
              )}
            </div>

            <AuditInfo
              creadoPor={viewing.creadoPor}
              creadoEn={viewing.creadoEn}
              actualizadoPor={viewing.actualizadoPor}
              actualizadoEn={viewing.actualizadoEn}
            />

            <div className="flex justify-between pt-2 border-t border-border">
              <Button size="sm" variant="secondary" onClick={() => { const c = viewing; setViewingId(null); openEdit(c); }}>
                <Edit2 className="w-3.5 h-3.5" /> Editar
              </Button>
              <Button variant="secondary" onClick={() => setViewingId(null)} className="ml-auto">Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={closeEditModal} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <div className="flex flex-col gap-4">
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
            <FormField label="Ubigeo" hint="Código INEI de 6 dígitos — se detecta desde la dirección o se puede escribir a mano" error={errors.ubigeo?.message}>
              <Input placeholder="150101" maxLength={6} {...register('ubigeo')} />
              {ubigeoVal?.length === 6 && (
                <p className={`text-xs ${ubigeoResuelto ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {ubigeoResuelto
                    ? `✓ ${ubigeoResuelto.distrito}, ${ubigeoResuelto.provincia}, ${ubigeoResuelto.departamento}`
                    : 'Código no reconocido en el padrón INEI'}
                </p>
              )}
              {candidatosUbigeo.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-xs text-muted-foreground">¿Cuál distrito?</span>
                  {candidatosUbigeo.slice(0, 5).map((c) => (
                    <button
                      key={c.ubigeo}
                      type="button"
                      onClick={() => { setValue('ubigeo', c.ubigeo); setCandidatosUbigeo([]); }}
                      className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent"
                    >
                      {c.distrito} ({c.provincia})
                    </button>
                  ))}
                </div>
              )}
            </FormField>
            <FormField label="Teléfono" error={errors.telefono?.message}>
              <Input placeholder="01-234 5678" {...register('telefono')} />
            </FormField>
            <FormField label="Email" error={errors.email?.message}>
              <Input type="email" placeholder="contacto@empresa.com" {...register('email')} />
            </FormField>
          </div>
        </form>

        {/* Contactos — fuera del <form> base a propósito: sus propias mutaciones
            no deben mutar el DOM dentro del <form> que contiene los campos del
            cliente (ver nota en ContactosEditor). Solo disponible al editar un
            cliente ya existente. */}
        {editing && <ContactosEditor key={editing.id} clienteId={editing.id} />}

        {editing && (
          <AuditInfo
            creadoPor={editing.creadoPor}
            creadoEn={editing.creadoEn}
            actualizadoPor={editing.actualizadoPor}
            actualizadoEn={editing.actualizadoEn}
          />
        )}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="secondary" type="button" onClick={closeEditModal}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit(onSubmit)} loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
            {editing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
        </div>
      </Modal>
    </div>
  );
}
