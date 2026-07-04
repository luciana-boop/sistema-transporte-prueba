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
import { getErrorMessage, CONDICION_PAGO_LABEL, formatCurrency, formatDate } from '@/lib/utils';
import { buscarPorCodigo, detectarUbigeo, type UbigeoEntry } from '@/lib/ubigeo';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, AuditInfo,
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

export default function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Cliente | null>(null);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [showContactoForm, setShowContactoForm] = useState(false);

  const limit = 20;
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

  const {
    register: registerContacto, handleSubmit: handleSubmitContacto, reset: resetContacto,
    formState: { errors: errorsContacto, isSubmitting: isSubmittingContacto },
  } = useForm<ContactoFormData>({ resolver: zodResolver(contactoSchema) });

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
    onSuccess: () => { toast.success('Cliente actualizado'); setEditing(null); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => clientesApi.eliminar(id),
    onSuccess: () => { toast.success('Cliente eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const invalidateDetalle = () => qc.invalidateQueries({ queryKey: ['cliente-detalle', viewingId] });

  const agregarContactoMutation = useMutation({
    mutationFn: (d: ContactoFormData) => clientesApi.agregarContacto(viewingId!, d),
    onSuccess: () => { toast.success('Contacto agregado'); setShowContactoForm(false); resetContacto(); invalidateDetalle(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const eliminarContactoMutation = useMutation({
    mutationFn: (contactoId: number) => clientesApi.eliminarContacto(contactoId),
    onSuccess: () => { toast.success('Contacto eliminado'); invalidateDetalle(); },
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

      {/* Ver cliente (solo lectura) */}
      <Modal
        open={!!viewingId}
        onClose={() => { setViewingId(null); setShowContactoForm(false); resetContacto(); }}
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

            {/* Contactos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contactos</p>
                <Button size="sm" variant="secondary" onClick={() => setShowContactoForm((v) => !v)}>
                  <UserPlus className="w-3.5 h-3.5" /> Agregar contacto
                </Button>
              </div>

              {showContactoForm && (
                <form
                  onSubmit={handleSubmitContacto((d) => agregarContactoMutation.mutate(d))}
                  className="grid grid-cols-3 gap-2 items-start bg-muted/30 rounded-lg p-3 mb-2"
                >
                  <FormField label="Nombre" error={errorsContacto.nombre?.message}>
                    <Input placeholder="Nombre del contacto" {...registerContacto('nombre')} />
                  </FormField>
                  <FormField label="Teléfono" error={errorsContacto.telefono?.message}>
                    <Input placeholder="01-234 5678" {...registerContacto('telefono')} />
                  </FormField>
                  <FormField label="Correo" error={errorsContacto.email?.message}>
                    <Input type="email" placeholder="correo@empresa.com" {...registerContacto('email')} />
                  </FormField>
                  <div className="col-span-3 flex justify-end gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => { setShowContactoForm(false); resetContacto(); }}>Cancelar</Button>
                    <Button type="submit" size="sm" loading={isSubmittingContacto || agregarContactoMutation.isPending}>Guardar contacto</Button>
                  </div>
                </form>
              )}

              {viewing.contactos && viewing.contactos.length > 0 ? (
                <div className="flex flex-col gap-1">
                  {viewing.contactos.map((ct) => (
                    <div key={ct.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-2">
                      <div>
                        <p className="font-medium">{ct.nombre}</p>
                        <p className="text-xs text-muted-foreground">{[ct.telefono, ct.email].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                      <button
                        onClick={() => { if (confirm('¿Eliminar contacto?')) eliminarContactoMutation.mutate(ct.id); }}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="Eliminar contacto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                !showContactoForm && <p className="text-xs text-muted-foreground">Sin contactos adicionales registrados.</p>
              )}
            </div>

            {/* Pedidos y facturas recientes */}
            {viewing.pedidos && viewing.pedidos.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Últimos pedidos</p>
                <div className="flex flex-col gap-1">
                  {viewing.pedidos.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">#{p.id} · {p.origen} → {p.destino} · {formatDate(p.fechaPedido)}</span>
                      <span className="font-medium">{formatCurrency(Number(p.tarifa))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {viewing.facturas && viewing.facturas.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Últimas facturas</p>
                <div className="flex flex-col gap-1">
                  {viewing.facturas.map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-1.5">
                      <span className="text-xs text-muted-foreground">{f.numeroFactura} · {formatDate(f.fechaEmision)}</span>
                      <span className="font-medium">{formatCurrency(Number(f.total))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          {editing && (
            <AuditInfo
              creadoPor={editing.creadoPor}
              creadoEn={editing.creadoEn}
              actualizadoPor={editing.actualizadoPor}
              actualizadoEn={editing.actualizadoEn}
            />
          )}
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
