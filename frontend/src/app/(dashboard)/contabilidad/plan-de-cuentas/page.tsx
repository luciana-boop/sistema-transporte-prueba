'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, ChevronRight, ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { contabilidadApi } from '@/services/api';
import { getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Modal, FormField, Input, Select,
} from '@/components/shared';
import type { CuentaContable } from '@/types';

const schema = z.object({
  codigo:     z.string().min(1, 'Código requerido'),
  nombre:     z.string().min(1, 'Nombre requerido'),
  tipo:       z.enum(['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'GASTO', 'COSTO']),
  naturaleza: z.enum(['DEUDORA', 'ACREEDORA']),
  padreId:    z.string().optional(),
  activa:     z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

function CuentaRow({
  cuenta, nivel = 0, onEdit, onDelete,
}: {
  cuenta: CuentaContable & { hijos?: CuentaContable[] };
  nivel?: number;
  onEdit: (c: CuentaContable) => void;
  onDelete: (c: CuentaContable) => void;
}) {
  const [expanded, setExpanded] = useState(nivel < 2);
  const hijos = (cuenta as any).hijos ?? [];
  const hasHijos = hijos.length > 0;

  return (
    <>
      <tr className="border-b border-border hover:bg-accent/30 transition-colors">
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1" style={{ paddingLeft: `${nivel * 20}px` }}>
            {hasHijos ? (
              <button onClick={() => setExpanded((e) => !e)} className="w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground">
                {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : <span className="w-4" />}
            <span className="font-mono text-xs text-muted-foreground">{cuenta.codigo}</span>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-sm ${nivel === 0 ? 'font-semibold' : nivel === 1 ? 'font-medium' : ''}`}>{cuenta.nombre}</span>
        </td>
        <td className="px-4 py-2.5">
          <span className="text-xs px-1.5 py-0.5 rounded bg-muted font-medium">{cuenta.tipo}</span>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-xs ${cuenta.naturaleza === 'DEUDORA' ? 'text-blue-600' : 'text-amber-600'}`}>{cuenta.naturaleza}</span>
        </td>
        <td className="px-4 py-2.5">
          <span className={`text-xs ${cuenta.activa ? 'text-emerald-600' : 'text-muted-foreground'}`}>{cuenta.activa ? 'Activa' : 'Inactiva'}</span>
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(cuenta)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            {!hasHijos && (
              <button onClick={() => onDelete(cuenta)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && hasHijos && hijos.map((h: any) => (
        <CuentaRow key={h.id} cuenta={h} nivel={nivel + 1} onEdit={onEdit} onDelete={onDelete} />
      ))}
    </>
  );
}

export default function PlanDeCuentasPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CuentaContable | null>(null);

  const { data: arbol = [], isLoading } = useQuery({
    queryKey: ['cuentas-arbol'],
    queryFn: () => contabilidadApi.cuentas.arbol().then((r) => r.data.data),
  });

  const { data: cuentasFlat = [] } = useQuery({
    queryKey: ['cuentas-flat'],
    queryFn: () => contabilidadApi.cuentas.listar().then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipo: 'ACTIVO', naturaleza: 'DEUDORA', activa: true },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cuentas-arbol'] });
    qc.invalidateQueries({ queryKey: ['cuentas-flat'] });
    qc.invalidateQueries({ queryKey: ['contabilidad-cuentas'] });
  };

  const createMutation = useMutation({
    mutationFn: (d: FormData) => contabilidadApi.cuentas.crear({ ...d, padreId: d.padreId || undefined }),
    onSuccess: () => { toast.success('Cuenta creada'); setShowModal(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<FormData> }) => contabilidadApi.cuentas.actualizar(id, d),
    onSuccess: () => { toast.success('Cuenta actualizada'); setShowModal(false); setEditing(null); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contabilidadApi.cuentas.eliminar(id),
    onSuccess: () => { toast.success('Cuenta eliminada'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (c: CuentaContable) => {
    setEditing(c);
    setValue('codigo', c.codigo);
    setValue('nombre', c.nombre);
    setValue('tipo', c.tipo as any);
    setValue('naturaleza', c.naturaleza as any);
    setValue('padreId', c.padreId ?? '');
    setValue('activa', c.activa);
    setShowModal(true);
  };

  const onSubmit = (d: FormData) => {
    if (editing) updateMutation.mutate({ id: editing.id, d });
    else createMutation.mutate(d);
  };

  const cuentasPadre = cuentasFlat.filter((c) => !editing || c.id !== editing.id);

  return (
    <div className="page-container">
      <PageHeader
        title="Plan de Cuentas"
        description="Árbol jerárquico de cuentas contables"
        action={
          <Button onClick={() => { setEditing(null); reset({ tipo: 'ACTIVO', naturaleza: 'DEUDORA', activa: true }); setShowModal(true); }}>
            <Plus className="w-4 h-4" /> Nueva cuenta
          </Button>
        }
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Cargando...</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Código</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Naturaleza</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Estado</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {arbol.length > 0
                ? arbol.map((c) => <CuentaRow key={c.id} cuenta={c as any} onEdit={openEdit} onDelete={(c) => { if (confirm(`¿Eliminar ${c.nombre}?`)) deleteMutation.mutate(c.id); }} />)
                : <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">Sin cuentas. Comenzá con el botón Nueva cuenta.</td></tr>
              }
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => { setShowModal(false); setEditing(null); }} title={editing ? 'Editar cuenta' : 'Nueva cuenta contable'}>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Código" required error={errors.codigo?.message}>
              <Input placeholder="1.1.01" {...register('codigo')} />
            </FormField>
            <FormField label="Tipo" required error={errors.tipo?.message}>
              <Select {...register('tipo')}>
                <option value="ACTIVO">Activo</option>
                <option value="PASIVO">Pasivo</option>
                <option value="PATRIMONIO">Patrimonio</option>
                <option value="INGRESO">Ingreso</option>
                <option value="GASTO">Gasto</option>
                <option value="COSTO">Costo</option>
              </Select>
            </FormField>
          </div>
          <FormField label="Nombre" required error={errors.nombre?.message}>
            <Input placeholder="Nombre de la cuenta" {...register('nombre')} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Naturaleza" required error={errors.naturaleza?.message}>
              <Select {...register('naturaleza')}>
                <option value="DEUDORA">Deudora</option>
                <option value="ACREEDORA">Acreedora</option>
              </Select>
            </FormField>
            <FormField label="Cuenta padre (opcional)">
              <Select {...register('padreId')}>
                <option value="">Sin padre (raíz)</option>
                {cuentasPadre.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
              </Select>
            </FormField>
          </div>
          {editing && (
            <FormField label="Estado">
              <Select {...register('activa', { setValueAs: (v) => v === 'true' })}>
                <option value="true">Activa</option>
                <option value="false">Inactiva</option>
              </Select>
            </FormField>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowModal(false); setEditing(null); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editing ? 'Guardar cambios' : 'Crear cuenta'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
