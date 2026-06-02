// FILE: src/app/(dashboard)/liquidaciones/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Eye, Printer, Download } from 'lucide-react';
import { liquidacionesApi, conductoresApi, vehiculosApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import type { Liquidacion } from '@/types';
import * as XLSX from 'xlsx';

const detalleSchema = z.object({
  categoria: z.enum(['PEAJE', 'BALANZA', 'VIATICO', 'TOLDO', 'OTROS']),
  descripcion: z.string().min(1, 'Descripción requerida'),
  monto: z.string().min(1, 'Monto requerido'),
});

const schema = z.object({
  conductorId: z.string().min(1, 'Conductor requerido'),
  placaTracto: z.string().min(1, 'Placa tracto requerida'),
  placaCarreta: z.string().optional(),
  montoEntregado: z.string().min(1, 'Monto entregado requerido'),
  reciboAnticipo: z.string().optional(),
  fecha: z.string().min(1, 'Fecha requerida'),
  guiaReferencia: z.string().optional(),
  observaciones: z.string().optional(),
  detalles: z.array(detalleSchema),
});
type FormData = z.infer<typeof schema>;

const CATEGORIA_LABEL: Record<string, string> = {
  PEAJE: 'Peaje', BALANZA: 'Balanza', VIATICO: 'Viático', TOLDO: 'Toldo', OTROS: 'Otros',
};

export default function LiquidacionesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<Liquidacion | null>(null);

  const { data: liquidaciones = [], isLoading } = useQuery({
    queryKey: ['liquidaciones'],
    queryFn: () => liquidacionesApi.listar().then((r) => r.data.data),
  });

  const { data: conductores = [] } = useQuery({
    queryKey: ['conductores'],
    queryFn: () => conductoresApi.listar({ activo: true }).then((r) => r.data.data),
  });

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos'],
    queryFn: () => vehiculosApi.listar({ activo: true }).then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, watch, setValue, control, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      fecha: new Date().toISOString().split('T')[0],
      detalles: [{ categoria: 'PEAJE', descripcion: '', monto: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'detalles' });

  // Auto-fill vehicle preferences when conductor is selected
  const watchConductorId = watch('conductorId');
  useEffect(() => {
    if (!watchConductorId || !conductores.length) return;
    const conductor = (conductores as any[]).find((c: any) => String(c.id) === watchConductorId);
    if (conductor) {
      if (conductor.tractoPreferencia) setValue('placaTracto', conductor.tractoPreferencia);
      if (conductor.carretaPreferencia) setValue('placaCarreta', conductor.carretaPreferencia);
    }
  }, [watchConductorId, conductores, setValue]);

  // Cálculos automáticos
  const watchDetalles = watch('detalles');
  const watchEntregado = watch('montoEntregado');

  const totalGastos = watchDetalles.reduce((s, d) => s + (parseFloat(d.monto) || 0), 0);
  const entregado = parseFloat(watchEntregado || '0');
  const diferencia = entregado - totalGastos;
  const devolucion = diferencia > 0 ? diferencia : 0;
  const reintegro = diferencia < 0 ? Math.abs(diferencia) : 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: ['liquidaciones'] });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => liquidacionesApi.crear({
      conductorId: parseInt(d.conductorId),
      placaTracto: d.placaTracto,
      placaCarreta: d.placaCarreta,
      montoEntregado: parseFloat(d.montoEntregado),
      reciboAnticipo: d.reciboAnticipo,
      fecha: d.fecha,
      guiaReferencia: d.guiaReferencia,
      observaciones: d.observaciones,      detalles: d.detalles.map((det) => ({
        categoria: det.categoria as 'PEAJE' | 'BALANZA' | 'VIATICO',
        descripcion: det.descripcion,
        monto: parseFloat(det.monto),
      })),
    }),
    onSuccess: () => { toast.success('Liquidación creada'); setShowForm(false); reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => liquidacionesApi.eliminar(id),
    onSuccess: () => { toast.success('Liquidación eliminada'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const exportExcel = () => {
    const rows = liquidaciones.map((l) => ({
      '#': l.id, Fecha: formatDate(l.fecha), Conductor: l.conductor?.nombre,
      'Placa tracto': l.placaTracto, 'Placa carreta': l.placaCarreta ?? '',
      'Entregado S/': Number(l.montoEntregado), 'Total gastos S/': Number(l.totalGastos),
      'Devolución S/': Number(l.devolucion), 'Reintegro S/': Number(l.reintegro),
      Guía: l.guiaReferencia ?? '', Observaciones: l.observaciones ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Liquidaciones');
    XLSX.writeFile(wb, `liquidaciones_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filtered = liquidaciones.filter((l) =>
    search ? l.conductor?.nombre.toLowerCase().includes(search.toLowerCase()) ||
      l.placaTracto.toLowerCase().includes(search.toLowerCase()) : true
  );

  const handlePrint = (liq: Liquidacion) => {
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`
      <html><head><title>Liquidación #${liq.id}</title>
      <style>body{font-family:sans-serif;padding:20px;font-size:13px}h2{margin-bottom:4px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
      th{background:#f5f5f5}.totals{margin-top:16px;text-align:right}
      .totals p{margin:4px 0}.bold{font-weight:700}</style></head>
      <body>
        <h2>Liquidación de Gastos #${liq.id}</h2>
        <p>Fecha: ${formatDate(liq.fecha)} | Conductor: ${liq.conductor?.nombre}</p>
        <p>Tracto: ${liq.placaTracto}${liq.placaCarreta ? ' | Carreta: ' + liq.placaCarreta : ''}</p>
        ${liq.guiaReferencia ? `<p>Guía: ${liq.guiaReferencia}</p>` : ''}
        <table>
          <tr><th>Categoría</th><th>Descripción</th><th>Monto</th></tr>
          ${(liq.detalles || []).map((d) => `<tr><td>${CATEGORIA_LABEL[d.categoria]}</td><td>${d.descripcion}</td><td style="text-align:right">S/ ${Number(d.monto).toFixed(2)}</td></tr>`).join('')}
          ${liq.toldo ? `<tr><td>Toldo</td><td>Gasto de toldo</td><td style="text-align:right">S/ ${Number(liq.toldo).toFixed(2)}</td></tr>` : ''}
        </table>
        <div class="totals">
          <p>Monto entregado: <span class="bold">S/ ${Number(liq.montoEntregado).toFixed(2)}</span></p>
          <p>Total gastos: <span class="bold">S/ ${Number(liq.totalGastos).toFixed(2)}</span></p>
          ${liq.devolucion > 0 ? `<p style="color:green">Devolución: <span class="bold">S/ ${Number(liq.devolucion).toFixed(2)}</span></p>` : ''}
          ${liq.reintegro > 0 ? `<p style="color:red">Reintegro: <span class="bold">S/ ${Number(liq.reintegro).toFixed(2)}</span></p>` : ''}
        </div>
        ${liq.observaciones ? `<p style="margin-top:12px"><b>Obs:</b> ${liq.observaciones}</p>` : ''}
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Liquidaciones"
        description={`${liquidaciones.length} liquidación${liquidaciones.length !== 1 ? 'es' : ''}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
            <Button onClick={() => { setShowForm(true); reset(); }}>
              <Plus className="w-4 h-4" /> Nueva liquidación
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total liquidaciones" value={liquidaciones.length} color="default" />
        <StatCard label="Total entregado" value={formatCurrency(liquidaciones.reduce((s, l) => s + Number(l.montoEntregado), 0))} color="blue" />
        <StatCard label="Total gastos" value={formatCurrency(liquidaciones.reduce((s, l) => s + Number(l.totalGastos), 0))} color="red" />
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Buscar conductor, placa..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? <TableSkeleton rows={5} cols={7} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th>
              <Th>Fecha</Th>
              <Th>Conductor</Th>
              <Th>Tracto</Th>
              <Th>Entregado</Th>
              <Th>Total gastos</Th>
              <Th>Devolución / Reintegro</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? filtered.map((l) => (
              <Tr key={l.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{l.id}</span></Td>
                <Td><span className="text-sm">{formatDate(l.fecha)}</span></Td>
                <Td><span className="font-medium text-sm">{l.conductor?.nombre}</span></Td>
                <Td><span className="font-mono text-xs">{l.placaTracto}</span></Td>
                <Td><span className="text-sm">{formatCurrency(Number(l.montoEntregado))}</span></Td>
                <Td><span className="font-semibold">{formatCurrency(Number(l.totalGastos))}</span></Td>
                <Td>
                  {Number(l.devolucion) > 0 && (
                    <span className="text-emerald-500 font-medium text-sm">+{formatCurrency(Number(l.devolucion))}</span>
                  )}
                  {Number(l.reintegro) > 0 && (
                    <span className="text-red-500 font-medium text-sm">-{formatCurrency(Number(l.reintegro))}</span>
                  )}
                  {Number(l.devolucion) === 0 && Number(l.reintegro) === 0 && (
                    <span className="text-muted-foreground text-xs">Exacto</span>
                  )}
                </Td>
                <Td>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setViewing(l)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver detalle">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handlePrint(l)} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Imprimir">
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { if (confirm('¿Eliminar liquidación?')) deleteMutation.mutate(l.id); }} className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={8}><EmptyState message="No hay liquidaciones" /></td></tr>}
          </tbody>
        </Table>
      )}

      {/* Create Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); reset(); }} title="Nueva liquidación" maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          {/* Cabecera */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Conductor" required error={errors.conductorId?.message}>
              <Select {...register('conductorId')}>
                <option value="">Seleccionar...</option>
                {conductores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </FormField>
            <FormField label="Fecha" required error={errors.fecha?.message}>
              <Input type="date" {...register('fecha')} />
            </FormField>
            <FormField label="Placa Tracto" required error={errors.placaTracto?.message}>
              <Select {...register('placaTracto')}>
                <option value="">Seleccionar...</option>
                {vehiculos.filter(v => v.tipo === 'TRACTO').map((v) => <option key={v.id} value={v.placa}>{v.placa} — {v.marca}</option>)}
                <option value="_manual">Otra placa (ingresar)</option>
              </Select>
            </FormField>
            <FormField label="Placa Carreta" error={errors.placaCarreta?.message}>
              <Select {...register('placaCarreta')}>
                <option value="">Sin carreta</option>
                {vehiculos.filter(v => v.tipo === 'CARRETA').map((v) => <option key={v.id} value={v.placa}>{v.placa}</option>)}
              </Select>
            </FormField>
            <FormField label="Monto entregado (S/)" required error={errors.montoEntregado?.message}>
              <Input type="number" step="0.01" placeholder="0.00" {...register('montoEntregado')} />
            </FormField>
            <FormField label="Recibo anticipo" error={errors.reciboAnticipo?.message}>
              <Input placeholder="N° recibo" {...register('reciboAnticipo')} />
            </FormField>
            <FormField label="Guía de referencia" error={errors.guiaReferencia?.message}>
              <Input placeholder="Número de guía" {...register('guiaReferencia')} />
            </FormField>
          </div>

          {/* Detalle dinámico */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Detalle de gastos</p>
              <Button type="button" variant="secondary" size="sm"
                onClick={() => append({ categoria: 'PEAJE', descripcion: '', monto: '' })}>
                <Plus className="w-3 h-3" /> Agregar
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-8 gap-2 items-start">
                  <div className="col-span-2">
                    <Select {...register(`detalles.${index}.categoria`)}>
                      <option value="PEAJE">Peaje</option>
                      <option value="BALANZA">Balanza</option>
                      <option value="VIATICO">Viático</option>
                      <option value="TOLDO">Toldo</option>
                      <option value="OTROS">Otros</option>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Input placeholder="Descripción" {...register(`detalles.${index}.descripcion`)} />
                    {errors.detalles?.[index]?.descripcion && (
                      <p className="text-xs text-destructive mt-0.5">{errors.detalles[index]?.descripcion?.message}</p>
                    )}
                  </div>
                  <div className="col-span-1">
                    <Input type="number" step="0.01" placeholder="0.00" {...register(`detalles.${index}.monto`)} />
                  </div>
                  <div className="col-span-1 flex items-center pt-0.5">
                    <button type="button" onClick={() => remove(index)}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Cálculos automáticos */}
          <div className="bg-muted/40 rounded-xl p-4 grid grid-cols-4 gap-3 text-center">
            <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-bold">{formatCurrency(totalGastos)}</p></div>
            <div><p className="text-xs text-muted-foreground">Entregado</p><p className="font-bold">{formatCurrency(entregado)}</p></div>
            <div><p className="text-xs text-muted-foreground">Devolución</p><p className={`font-bold ${devolucion > 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>{formatCurrency(devolucion)}</p></div>
            <div><p className="text-xs text-muted-foreground">Reintegro</p><p className={`font-bold ${reintegro > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>{formatCurrency(reintegro)}</p></div>
          </div>

          <FormField label="Observaciones" error={errors.observaciones?.message}>
            <Textarea placeholder="Notas adicionales..." {...register('observaciones')} />
          </FormField>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowForm(false); reset(); }}>Cancelar</Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>Crear liquidación</Button>
          </div>
        </form>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Liquidación #${viewing?.id}`} maxWidth="max-w-lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Conductor</p><p className="font-medium">{viewing.conductor?.nombre}</p></div>
              <div><p className="text-xs text-muted-foreground">Fecha</p><p className="font-medium">{formatDate(viewing.fecha)}</p></div>
              <div><p className="text-xs text-muted-foreground">Tracto</p><p className="font-mono font-medium">{viewing.placaTracto}</p></div>
              {viewing.placaCarreta && <div><p className="text-xs text-muted-foreground">Carreta</p><p className="font-mono font-medium">{viewing.placaCarreta}</p></div>}
              {viewing.guiaReferencia && <div><p className="text-xs text-muted-foreground">Guía</p><p className="font-medium">{viewing.guiaReferencia}</p></div>}
              {viewing.reciboAnticipo && <div><p className="text-xs text-muted-foreground">Recibo anticipo</p><p className="font-medium">{viewing.reciboAnticipo}</p></div>}
            </div>
            <Table>
              <thead><tr><Th>Categoría</Th><Th>Descripción</Th><Th className="text-right">Monto</Th></tr></thead>
              <tbody>
                {(viewing.detalles || []).map((d, i) => (
                  <Tr key={i}>
                    <Td><span className="text-xs">{CATEGORIA_LABEL[d.categoria]}</span></Td>
                    <Td><span className="text-sm">{d.descripcion}</span></Td>
                    <Td className="text-right"><span className="text-sm font-medium">{formatCurrency(Number(d.monto))}</span></Td>
                  </Tr>
                ))}
                {viewing.toldo != null && Number(viewing.toldo) > 0 && (
                  <Tr><Td><span className="text-xs">Toldo</span></Td><Td>—</Td><Td className="text-right"><span className="text-sm font-medium">{formatCurrency(Number(viewing.toldo))}</span></Td></Tr>
                )}
              </tbody>
            </Table>
            <div className="grid grid-cols-4 gap-3 bg-muted/40 rounded-xl p-3 text-center">
              <div><p className="text-xs text-muted-foreground">Entregado</p><p className="font-bold text-sm">{formatCurrency(Number(viewing.montoEntregado))}</p></div>
              <div><p className="text-xs text-muted-foreground">Total gastos</p><p className="font-bold text-sm">{formatCurrency(Number(viewing.totalGastos))}</p></div>
              <div><p className="text-xs text-muted-foreground">Devolución</p><p className={`font-bold text-sm ${Number(viewing.devolucion) > 0 ? 'text-emerald-500' : ''}`}>{formatCurrency(Number(viewing.devolucion))}</p></div>
              <div><p className="text-xs text-muted-foreground">Reintegro</p><p className={`font-bold text-sm ${Number(viewing.reintegro) > 0 ? 'text-red-500' : ''}`}>{formatCurrency(Number(viewing.reintegro))}</p></div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => handlePrint(viewing)}>
                <Printer className="w-4 h-4" /> Imprimir
              </Button>
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
