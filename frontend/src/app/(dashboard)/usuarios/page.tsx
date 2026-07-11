// FILE: frontend/src/app/(dashboard)/usuarios/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Key, ShieldAlert, ShieldCheck, Clock, QrCode, Copy, RefreshCw, Ban } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { usuariosApi, conductoresApi } from '@/services/api';
import { formatDatetime, getErrorMessage, cn, PAGE_SIZE } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Pagination,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import type { Rol, Usuario } from '@/types';

const DIAS_SEMANA = [
  { valor: 1, label: 'Lun' },
  { valor: 2, label: 'Mar' },
  { valor: 3, label: 'Mié' },
  { valor: 4, label: 'Jue' },
  { valor: 5, label: 'Vie' },
  { valor: 6, label: 'Sáb' },
  { valor: 7, label: 'Dom' },
];

const HORA_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function validarHorarioCampos(
  d: { restriccionHorarioActiva: boolean; diasPermitidos: number[]; horaInicio: string; horaFin: string },
  ctx: z.RefinementCtx
) {
  if (!d.restriccionHorarioActiva) return;
  if (d.diasPermitidos.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['diasPermitidos'], message: 'Seleccioná al menos un día' });
  }
  if (!HORA_REGEX.test(d.horaInicio)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaInicio'], message: 'Formato HH:mm' });
  }
  if (!HORA_REGEX.test(d.horaFin)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaFin'], message: 'Formato HH:mm' });
  }
  if (HORA_REGEX.test(d.horaInicio) && HORA_REGEX.test(d.horaFin) && d.horaInicio >= d.horaFin) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['horaFin'], message: 'Debe ser posterior a la hora de inicio' });
  }
}

function validarConductorChofer(d: { rol: string; conductorId?: string }, ctx: z.RefinementCtx) {
  if (d.rol === 'CHOFER' && !d.conductorId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['conductorId'], message: 'Seleccioná el conductor vinculado' });
  }
}

const createSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  rol: z.enum(['ADMIN', 'SECRETARIO', 'CHOFER']),
  conductorId: z.string().optional(),
  restriccionHorarioActiva: z.boolean(),
  diasPermitidos: z.array(z.number()),
  horaInicio: z.string(),
  horaFin: z.string(),
}).superRefine((d, ctx) => { validarHorarioCampos(d, ctx); validarConductorChofer(d, ctx); });
const editSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  rol: z.enum(['ADMIN', 'SECRETARIO', 'CHOFER']),
  conductorId: z.string().optional(),
  activo: z.boolean(),
  restriccionHorarioActiva: z.boolean(),
  diasPermitidos: z.array(z.number()),
  horaInicio: z.string(),
  horaFin: z.string(),
}).superRefine((d, ctx) => { validarHorarioCampos(d, ctx); validarConductorChofer(d, ctx); });
const passSchema = z.object({
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmar: z.string().min(6),
}).refine((d) => d.password === d.confirmar, { message: 'Las contraseñas no coinciden', path: ['confirmar'] });

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;
type PassForm = z.infer<typeof passSchema>;

function SelectorDias({ value, onChange, disabled }: { value: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {DIAS_SEMANA.map((d) => {
        const activo = value.includes(d.valor);
        return (
          <button
            key={d.valor}
            type="button"
            disabled={disabled}
            onClick={() => onChange(activo ? value.filter((v) => v !== d.valor) : [...value, d.valor].sort())}
            className={cn(
              'px-2 py-1 rounded-md text-xs font-medium border transition-colors',
              activo ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted',
              disabled && 'opacity-40 cursor-not-allowed'
            )}
          >
            {d.label}
          </button>
        );
      })}
    </div>
  );
}

export default function UsuariosPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { usuario } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Usuario | null>(null);
  const [changingPass, setChangingPass] = useState<number | null>(null);
  const [linkAccesoUser, setLinkAccesoUser] = useState<Usuario | null>(null);
  const [linkGenerado, setLinkGenerado] = useState<string | null>(null);
  const [tieneLinkAcceso, setTieneLinkAcceso] = useState(false);

  const openLinkAcceso = (u: Usuario) => {
    setLinkAccesoUser(u);
    setLinkGenerado(null);
    setTieneLinkAcceso(!!u.tieneLinkAcceso);
  };
  const closeLinkAcceso = () => { setLinkAccesoUser(null); setLinkGenerado(null); };

  useEffect(() => {
    if (usuario?.rol !== 'ADMIN') router.replace('/dashboard');
  }, [usuario, router]);

  const [page, setPage] = useState(1);
  const limit = PAGE_SIZE;
  const { data, isLoading } = useQuery({
    queryKey: ['usuarios', page],
    queryFn: () => usuariosApi.listar({ page, limit }).then((r) => r.data.data),
    enabled: usuario?.rol === 'ADMIN',
  });
  const usuarios = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const createForm = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      rol: 'SECRETARIO',
      restriccionHorarioActiva: false,
      diasPermitidos: [1, 2, 3, 4, 5],
      horaInicio: '08:00',
      horaFin: '18:00',
    },
  });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const passForm = useForm<PassForm>({ resolver: zodResolver(passSchema) });

  // Conductores activos, para vincular a un usuario CHOFER. Solo se necesita
  // mientras alguno de los modales de alta/edición está abierto.
  const { data: conductoresList = [] } = useQuery({
    queryKey: ['conductores', 'activos'],
    queryFn: () => conductoresApi.listar({ activo: true, limit: 200 }).then((r) => r.data.data?.items ?? []),
    enabled: showCreate || !!editing,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['usuarios'] });

  const createMutation = useMutation({
    mutationFn: (d: CreateForm) => usuariosApi.crear({
      ...d,
      conductorId: d.rol === 'CHOFER' && d.conductorId ? Number(d.conductorId) : undefined,
    }),
    onSuccess: () => { toast.success('Usuario creado'); setShowCreate(false); createForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const editMutation = useMutation({
    mutationFn: (d: EditForm) => usuariosApi.actualizar(editing!.id, {
      ...d,
      conductorId: d.rol === 'CHOFER' && d.conductorId ? Number(d.conductorId) : undefined,
    }),
    onSuccess: () => { toast.success('Usuario actualizado'); setEditing(null); editForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const passMutation = useMutation({
    mutationFn: (d: PassForm) => usuariosApi.cambiarPassword(changingPass!, { password: d.password }),
    onSuccess: () => { toast.success('Contraseña actualizada'); setChangingPass(null); passForm.reset(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usuariosApi.eliminar(id),
    onSuccess: () => { toast.success('Usuario eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const generarLinkMutation = useMutation({
    mutationFn: (id: number) => usuariosApi.generarLinkAcceso(id),
    onSuccess: (res) => { setLinkGenerado(res.data.data.token); setTieneLinkAcceso(true); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const revocarLinkMutation = useMutation({
    mutationFn: (id: number) => usuariosApi.revocarLinkAcceso(id),
    onSuccess: () => { toast.success('Link de acceso revocado'); setLinkGenerado(null); setTieneLinkAcceso(false); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (u: Usuario) => {
    setEditing(u);
    editForm.setValue('nombre', u.nombre);
    editForm.setValue('email', u.email);
    editForm.setValue('rol', u.rol);
    editForm.setValue('conductorId', u.conductorId ? String(u.conductorId) : '');
    editForm.setValue('activo', u.activo);
    editForm.setValue('restriccionHorarioActiva', u.restriccionHorarioActiva ?? false);
    editForm.setValue('diasPermitidos', u.diasPermitidos ?? [1, 2, 3, 4, 5]);
    editForm.setValue('horaInicio', u.horaInicio ?? '08:00');
    editForm.setValue('horaFin', u.horaFin ?? '18:00');
  };

  if (usuario?.rol !== 'ADMIN') {
    return (
      <div className="page-container">
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <ShieldAlert className="w-12 h-12 opacity-30" />
          <p className="text-sm">Acceso restringido a administradores</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Usuarios"
        description={`${total} usuario${total !== 1 ? 's' : ''} registrados`}
        action={
          <Button onClick={() => { setShowCreate(true); createForm.reset(); }}>
            <Plus className="w-4 h-4" /> Nuevo usuario
          </Button>
        }
      />

      {isLoading ? (
        <TableSkeleton rows={4} cols={6} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Nombre</Th>
              <Th>Email</Th>
              <Th>Rol</Th>
              <Th>Estado</Th>
              <Th>Acceso</Th>
              <Th>Último acceso</Th>
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {usuarios.length > 0 ? usuarios.map((u) => (
              <Tr key={u.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{u.id}</span></Td>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-primary">{u.nombre.charAt(0).toUpperCase()}</span>
                    </div>
                    <span className="font-medium text-sm">{u.nombre}</span>
                  </div>
                </Td>
                <Td><span className="text-sm text-muted-foreground">{u.email}</span></Td>
                <Td><Badge value={u.rol} label={u.rol} /></Td>
                <Td><Badge value={u.activo ? 'ABIERTA' : 'CERRADA'} label={u.activo ? 'Activo' : 'Inactivo'} /></Td>
                <Td>
                  {u.rol === 'ADMIN' ? (
                    <span className="text-xs text-muted-foreground">Sin restricción</span>
                  ) : u.restriccionHorarioActiva ? (
                    <span className="inline-flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                      <Clock className="w-3.5 h-3.5" />
                      {DIAS_SEMANA.filter((d) => u.diasPermitidos?.includes(d.valor)).map((d) => d.label).join(' ')}
                      {' · '}{u.horaInicio}-{u.horaFin}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Sin restricción</span>
                  )}
                </Td>
                <Td>
                  <span className="text-xs text-muted-foreground">
                    {u.ultimoAcceso ? formatDatetime(u.ultimoAcceso) : 'Nunca'}
                  </span>
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(u)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Editar">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setChangingPass(u.id)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Cambiar contraseña">
                      <Key className="w-3.5 h-3.5" />
                    </button>
                    {/* ── NUEVO: botón de permisos ── */}
                    <button
                      onClick={() => router.push(`/usuarios/${u.id}/permisos`)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                      title="Permisos"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                    </button>
                    {u.rol === 'CHOFER' && (
                      <button
                        onClick={() => openLinkAcceso(u)}
                        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                        title="Link de acceso"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {u.id !== usuario.id && (
                      <button
                        onClick={() => { if (confirm(`¿Eliminar a ${u.nombre}?`)) deleteMutation.mutate(u.id); }}
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
              <tr><td colSpan={8}><EmptyState message="No hay usuarios" /></td></tr>
            )}
          </tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* Create */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); createForm.reset(); }} title="Nuevo usuario">
        <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Nombre completo" required error={createForm.formState.errors.nombre?.message}>
            <Input placeholder="Juan Pérez" {...createForm.register('nombre')} />
          </FormField>
          <FormField label="Email" required error={createForm.formState.errors.email?.message}>
            <Input type="email" placeholder="usuario@transportes.com" {...createForm.register('email')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Contraseña" required error={createForm.formState.errors.password?.message}>
              <Input type="password" placeholder="••••••••" {...createForm.register('password')} />
            </FormField>
            <FormField label="Rol" required error={createForm.formState.errors.rol?.message}>
              <Select {...createForm.register('rol')}>
                <option value="SECRETARIO">Secretario</option>
                <option value="ADMIN">Administrador</option>
                <option value="CHOFER">Chofer</option>
              </Select>
            </FormField>
          </div>

          {createForm.watch('rol') === 'CHOFER' && (
            <FormField label="Conductor vinculado" required error={createForm.formState.errors.conductorId?.message}
              hint="El chofer solo podrá crear guías con este conductor preasignado">
              <Select {...createForm.register('conductorId')}>
                <option value="">Seleccionar…</option>
                {conductoresList.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.dni}</option>)}
              </Select>
            </FormField>
          )}

          {createForm.watch('rol') !== 'ADMIN' && (
            <div className="flex flex-col gap-3 border border-border rounded-lg p-3 bg-muted/20">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" className="rounded border-border" {...createForm.register('restriccionHorarioActiva')} />
                Restringir horario de acceso
              </label>
              {createForm.watch('restriccionHorarioActiva') && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Días permitidos</p>
                    <SelectorDias
                      value={createForm.watch('diasPermitidos')}
                      onChange={(v) => createForm.setValue('diasPermitidos', v, { shouldValidate: true })}
                    />
                    {createForm.formState.errors.diasPermitidos && (
                      <p className="text-xs text-destructive mt-1">{createForm.formState.errors.diasPermitidos.message}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Hora inicio" error={createForm.formState.errors.horaInicio?.message}>
                      <Input type="time" {...createForm.register('horaInicio')} />
                    </FormField>
                    <FormField label="Hora fin" error={createForm.formState.errors.horaFin?.message}>
                      <Input type="time" {...createForm.register('horaFin')} />
                    </FormField>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowCreate(false); createForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={createMutation.isPending}>Crear usuario</Button>
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal open={!!editing} onClose={() => { setEditing(null); editForm.reset(); }} title="Editar usuario">
        <form onSubmit={editForm.handleSubmit((d) => editMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Nombre completo" required error={editForm.formState.errors.nombre?.message}>
            <Input {...editForm.register('nombre')} />
          </FormField>
          <FormField label="Email" required error={editForm.formState.errors.email?.message}>
            <Input type="email" {...editForm.register('email')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Rol">
              <Select {...editForm.register('rol')}>
                <option value="SECRETARIO">Secretario</option>
                <option value="ADMIN">Administrador</option>
                <option value="CHOFER">Chofer</option>
              </Select>
            </FormField>
            <FormField label="Estado">
              <Select {...editForm.register('activo', { setValueAs: (v) => v === 'true' || v === true })}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </Select>
            </FormField>
          </div>

          {editForm.watch('rol') === 'CHOFER' && (
            <FormField label="Conductor vinculado" required error={editForm.formState.errors.conductorId?.message}
              hint="El chofer solo podrá crear guías con este conductor preasignado">
              <Select {...editForm.register('conductorId')}>
                <option value="">Seleccionar…</option>
                {conductoresList.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.dni}</option>)}
              </Select>
            </FormField>
          )}

          {editForm.watch('rol') !== 'ADMIN' && (
            <div className="flex flex-col gap-3 border border-border rounded-lg p-3 bg-muted/20">
              <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                <input type="checkbox" className="rounded border-border" {...editForm.register('restriccionHorarioActiva')} />
                Restringir horario de acceso
              </label>
              {editForm.watch('restriccionHorarioActiva') && (
                <>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1.5">Días permitidos</p>
                    <SelectorDias
                      value={editForm.watch('diasPermitidos')}
                      onChange={(v) => editForm.setValue('diasPermitidos', v, { shouldValidate: true })}
                    />
                    {editForm.formState.errors.diasPermitidos && (
                      <p className="text-xs text-destructive mt-1">{editForm.formState.errors.diasPermitidos.message}</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Hora inicio" error={editForm.formState.errors.horaInicio?.message}>
                      <Input type="time" {...editForm.register('horaInicio')} />
                    </FormField>
                    <FormField label="Hora fin" error={editForm.formState.errors.horaFin?.message}>
                      <Input type="time" {...editForm.register('horaFin')} />
                    </FormField>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setEditing(null); editForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={editMutation.isPending}>Guardar cambios</Button>
          </div>
        </form>
      </Modal>

      {/* Change password */}
      <Modal open={!!changingPass} onClose={() => { setChangingPass(null); passForm.reset(); }} title="Cambiar contraseña">
        <form onSubmit={passForm.handleSubmit((d) => passMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Nueva contraseña" required error={passForm.formState.errors.password?.message}>
            <Input type="password" placeholder="••••••••" {...passForm.register('password')} />
          </FormField>
          <FormField label="Confirmar contraseña" required error={passForm.formState.errors.confirmar?.message}>
            <Input type="password" placeholder="••••••••" {...passForm.register('confirmar')} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setChangingPass(null); passForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={passMutation.isPending}>Actualizar contraseña</Button>
          </div>
        </form>
      </Modal>

      {/* Link de acceso fijo (chofer) */}
      <Modal open={!!linkAccesoUser} onClose={closeLinkAcceso} title={`Link de acceso — ${linkAccesoUser?.nombre ?? ''}`}>
        <div className="flex flex-col gap-4">
          {linkGenerado ? (
            <>
              <div className="flex justify-center p-4 bg-white rounded-lg">
                <QRCodeSVG value={`${window.location.origin}/acceso/${linkGenerado}`} size={200} />
              </div>
              <div className="flex items-center gap-2">
                <Input readOnly value={`${window.location.origin}/acceso/${linkGenerado}`} className="text-xs" />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/acceso/${linkGenerado}`);
                    toast.success('Link copiado');
                  }}
                >
                  <Copy className="w-3.5 h-3.5" />
                </Button>
              </div>
              <p className="text-xs text-yellow-600 dark:text-yellow-400">
                Guardá este link ahora — no se va a volver a mostrar. Cualquiera que lo tenga
                entra directo como este chofer, sin usuario ni contraseña.
              </p>
            </>
          ) : tieneLinkAcceso ? (
            <p className="text-sm text-muted-foreground">
              Este chofer ya tiene un link de acceso generado. Por seguridad no se puede
              volver a mostrar — si lo perdió, regenerelo (esto invalida el anterior).
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este chofer todavía no tiene un link de acceso. Generalo para que pueda
              entrar a sus guías sin usuario ni contraseña.
            </p>
          )}

          <p className="text-xs text-muted-foreground">
            Cualquiera con este enlace puede ingresar como este chofer. Entregáselo solo a
            él (por ejemplo agregándolo a la pantalla de inicio de su celular) y revocalo
            si pierde el teléfono.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={closeLinkAcceso}>Cerrar</Button>
            {tieneLinkAcceso && (
              <Button
                variant="secondary"
                type="button"
                loading={revocarLinkMutation.isPending}
                onClick={() => { if (confirm('¿Revocar el link de acceso? El chofer no podrá volver a usarlo.')) revocarLinkMutation.mutate(linkAccesoUser!.id); }}
              >
                <Ban className="w-3.5 h-3.5" /> Revocar
              </Button>
            )}
            <Button
              type="button"
              loading={generarLinkMutation.isPending}
              onClick={() => {
                if (!tieneLinkAcceso || confirm('Esto invalida el link anterior. ¿Continuar?')) {
                  generarLinkMutation.mutate(linkAccesoUser!.id);
                }
              }}
            >
              <RefreshCw className="w-3.5 h-3.5" /> {tieneLinkAcceso ? 'Regenerar' : 'Generar link'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
