// FILE: frontend/src/app/(dashboard)/usuarios/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Key, ShieldAlert, ShieldCheck } from 'lucide-react';
import { usuariosApi } from '@/services/api';
import { formatDatetime, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import { useRouter } from 'next/navigation';
import type { Rol } from '@/types';

const createSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Email inválido'),
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  rol: z.enum(['ADMIN', 'SECRETARIO']),
});
const editSchema = z.object({
  nombre: z.string().min(2),
  email: z.string().email(),
  rol: z.enum(['ADMIN', 'SECRETARIO']),
  activo: z.boolean(),
});
const passSchema = z.object({
  password: z.string().min(6, 'Mínimo 6 caracteres'),
  confirmar: z.string().min(6),
}).refine((d) => d.password === d.confirmar, { message: 'Las contraseñas no coinciden', path: ['confirmar'] });

type CreateForm = z.infer<typeof createSchema>;
type EditForm = z.infer<typeof editSchema>;
type PassForm = z.infer<typeof passSchema>;

export default function UsuariosPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { usuario } = useAuthStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<{ id: number; nombre: string; email: string; rol: Rol; activo: boolean } | null>(null);
  const [changingPass, setChangingPass] = useState<number | null>(null);

  useEffect(() => {
    if (usuario?.rol !== 'ADMIN') router.replace('/dashboard');
  }, [usuario, router]);

  const [page, setPage] = useState(1);
  const limit = 20;
  const { data, isLoading } = useQuery({
    queryKey: ['usuarios', page],
    queryFn: () => usuariosApi.listar({ page, limit }).then((r) => r.data.data),
    enabled: usuario?.rol === 'ADMIN',
  });
  const usuarios = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema), defaultValues: { rol: 'SECRETARIO' } });
  const editForm = useForm<EditForm>({ resolver: zodResolver(editSchema) });
  const passForm = useForm<PassForm>({ resolver: zodResolver(passSchema) });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['usuarios'] });

  const createMutation = useMutation({
    mutationFn: (d: CreateForm) => usuariosApi.crear(d),
    onSuccess: () => { toast.success('Usuario creado'); setShowCreate(false); createForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const editMutation = useMutation({
    mutationFn: (d: EditForm) => usuariosApi.actualizar(editing!.id, d),
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

  const openEdit = (u: { id: number; nombre: string; email: string; rol: Rol; activo: boolean }) => {
    setEditing({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, activo: u.activo });
    editForm.setValue('nombre', u.nombre);
    editForm.setValue('email', u.email);
    editForm.setValue('rol', u.rol);
    editForm.setValue('activo', u.activo);
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
              <tr><td colSpan={7}><EmptyState message="No hay usuarios" /></td></tr>
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
              </Select>
            </FormField>
          </div>
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
              </Select>
            </FormField>
            <FormField label="Estado">
              <Select {...editForm.register('activo', { setValueAs: (v) => v === 'true' || v === true })}>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </Select>
            </FormField>
          </div>
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
    </div>
  );
}
