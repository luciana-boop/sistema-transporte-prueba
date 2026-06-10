'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, Eye, Lock } from 'lucide-react';
import { contabilidadApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, TableSkeleton, EmptyState, Modal, FormField, Input, Select,
} from '@/components/shared';
import type { AsientoContable, CuentaContable } from '@/types';

const lineaSchema = z.object({
  cuentaId:    z.string().min(1, 'Cuenta requerida'),
  descripcion: z.string().optional(),
  debe:        z.string(),
  haber:       z.string(),
});

const schema = z.object({
  fecha:       z.string().min(1),
  descripcion: z.string().min(1, 'Descripción requerida'),
  referencia:  z.string().optional(),
  lineas:      z.array(lineaSchema).min(2, 'Mínimo 2 líneas'),
});
type FormData = z.infer<typeof schema>;

export default function LibroDiarioPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState<AsientoContable | null>(null);
  const limit = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['asientos', page],
    queryFn: () => contabilidadApi.asientos.listar({ page, limit }).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-flat'],
    queryFn: () => contabilidadApi.cuentas.listar().then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, control, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      lineas: [
        { cuentaId: '', descripcion: '', debe: '', haber: '' },
        { cuentaId: '', descripcion: '', debe: '', haber: '' },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });
  const lineas = watch('lineas');
  const totalDebe  = lineas.reduce((s, l) => s + (parseFloat(l.debe)  || 0), 0);
  const totalHaber = lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0);
  const balanced = Math.abs(totalDebe - totalHaber) < 0.01;

  const createMutation = useMutation({
    mutationFn: (d: FormData) => contabilidadApi.asientos.crear({
      fecha: d.fecha,
      descripcion: d.descripcion,
      referencia: d.referencia,
      tipo: 'MANUAL',
      lineas: d.lineas.map((l) => ({
        cuentaId: l.cuentaId,
        descripcion: l.descripcion,
        debe: parseFloat(l.debe) || 0,
        haber: parseFloat(l.haber) || 0,
      })),
    }),
    onSuccess: () => {
      toast.success('Asiento registrado');
      setShowModal(false);
      reset();
      qc.invalidateQueries({ queryKey: ['asientos'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => contabilidadApi.asientos.eliminar(id),
    onSuccess: () => { toast.success('Asiento eliminado'); qc.invalidateQueries({ queryKey: ['asientos'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // AsientosResponse uses `items`, not `asientos`
  const asientos = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="page-container">
      <PageHeader
        title="Libro Diario"
        description={`${total} asiento${total !== 1 ? 's' : ''}`}
        action={
          <Button onClick={() => { reset(); setShowModal(true); }}><Plus className="w-4 h-4" /> Nuevo asiento</Button>
        }
      />

      {isLoading ? <TableSkeleton rows={5} cols={6} /> : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>N°</Th><Th>Fecha</Th><Th>Descripción</Th><Th>Referencia</Th><Th>Tipo</Th>
                <Th className="text-right">Débito</Th><Th className="text-right">Crédito</Th><Th>Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {asientos.length > 0 ? asientos.map((a) => {
                const debe  = (a.lineas ?? []).reduce((s: number, l: any) => s + Number(l.debe),  0);
                const haber = (a.lineas ?? []).reduce((s: number, l: any) => s + Number(l.haber), 0);
                return (
                  <Tr key={a.id}>
                    <Td><span className="font-mono text-xs text-muted-foreground">{a.numero}</span></Td>
                    <Td><span className="text-sm">{formatDate(a.fecha)}</span></Td>
                    <Td><span className="text-sm font-medium">{a.descripcion}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{a.referencia ?? '—'}</span></Td>
                    <Td>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${a.tipo === 'AUTOMATICO' ? 'bg-violet-50 text-violet-600 border border-violet-200' : 'bg-muted text-muted-foreground'}`}>
                        {a.tipo}
                      </span>
                    </Td>
                    <Td className="text-right"><span className="text-sm font-medium">{formatCurrency(debe)}</span></Td>
                    <Td className="text-right"><span className="text-sm font-medium">{formatCurrency(haber)}</span></Td>
                    <Td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewing(a)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"><Eye className="w-3.5 h-3.5" /></button>
                        {a.tipo === 'MANUAL' ? (
                          <button onClick={() => { if (confirm('¿Eliminar asiento?')) deleteMutation.mutate(a.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                        ) : <span className="p-1.5 text-muted-foreground/30"><Lock className="w-3.5 h-3.5" /></span>}
                      </div>
                    </Td>
                  </Tr>
                );
              }) : <tr><td colSpan={8}><EmptyState message="Sin asientos registrados" /></td></tr>}
            </tbody>
          </Table>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <span className="text-xs text-muted-foreground">{page} / {totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          )}
        </>
      )}

      {/* Modal crear asiento */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Nuevo asiento contable" maxWidth="max-w-3xl">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Fecha" required error={errors.fecha?.message}>
              <Input type="date" {...register('fecha')} />
            </FormField>
            <div className="col-span-2">
              <FormField label="Referencia" error={errors.referencia?.message}>
                <Input placeholder="Ej: LIQ-123" {...register('referencia')} />
              </FormField>
            </div>
          </div>
          <FormField label="Descripción" required error={errors.descripcion?.message}>
            <Input placeholder="Concepto del asiento" {...register('descripcion')} />
          </FormField>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Líneas del asiento</p>
              <Button type="button" variant="secondary" size="sm" onClick={() => append({ cuentaId: '', descripcion: '', debe: '', haber: '' })}><Plus className="w-3 h-3" /> Línea</Button>
            </div>
            <table className="w-full text-sm mb-2">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-1/3">Cuenta</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Descripción</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground w-24">Debe</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground w-24">Haber</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {fields.map((field, i) => (
                  <tr key={field.id} className="border-b border-border">
                    <td className="px-2 py-1.5">
                      <Select {...register(`lineas.${i}.cuentaId`)}>
                        <option value="">Cuenta...</option>
                        {(cuentas as CuentaContable[]).map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>)}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5"><Input placeholder="Detalle" {...register(`lineas.${i}.descripcion`)} /></td>
                    <td className="px-2 py-1.5"><Input type="number" step="0.01" placeholder="0.00" className="text-right" {...register(`lineas.${i}.debe`)} /></td>
                    <td className="px-2 py-1.5"><Input type="number" step="0.01" placeholder="0.00" className="text-right" {...register(`lineas.${i}.haber`)} /></td>
                    <td className="px-2 py-1.5">
                      {fields.length > 2 && <button type="button" onClick={() => remove(i)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={2} className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Totales:</td>
                  <td className="px-3 py-2 text-right text-sm font-bold">{formatCurrency(totalDebe)}</td>
                  <td className={`px-3 py-2 text-right text-sm font-bold ${balanced ? 'text-emerald-600' : 'text-destructive'}`}>{formatCurrency(totalHaber)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
            {!balanced && <p className="text-xs text-destructive">El asiento no está balanceado. Débitos ≠ Créditos.</p>}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button type="submit" disabled={!balanced || isSubmitting || createMutation.isPending}>
              {createMutation.isPending ? 'Guardando...' : 'Registrar asiento'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal ver asiento */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Asiento #${viewing?.numero}`} maxWidth="max-w-xl">
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium">{formatDate(viewing.fecha)}</p></div>
              <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{viewing.tipo}</p></div>
              <div className="col-span-2"><p className="text-xs text-muted-foreground">Descripción</p><p className="font-medium">{viewing.descripcion}</p></div>
              {viewing.referencia && <div><p className="text-xs text-muted-foreground">Referencia</p><p className="font-medium">{viewing.referencia}</p></div>}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Cuenta</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Detalle</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Debe</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Haber</th>
                </tr>
              </thead>
              <tbody>
                {(viewing.lineas ?? []).map((l) => (
                  <tr key={l.id} className="border-b border-border">
                    <td className="px-3 py-2"><span className="text-xs font-mono">{l.cuenta?.codigo}</span> <span className="text-xs">{l.cuenta?.nombre}</span></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{l.descripcion}</td>
                    <td className="px-3 py-2 text-right text-sm">{Number(l.debe) > 0 ? formatCurrency(Number(l.debe)) : '—'}</td>
                    <td className="px-3 py-2 text-right text-sm">{Number(l.haber) > 0 ? formatCurrency(Number(l.haber)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
