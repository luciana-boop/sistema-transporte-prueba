// FILE: src/app/(dashboard)/mantenimiento/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Wrench, Download } from 'lucide-react';
import { mantenimientoApi, vehiculosApi, conductoresApi, configuracionApi } from '@/services/api';
import {
  PageHeader, Button, Table, Th, Td, Tr,
  Modal, FormField, Select, Textarea, Input,
  TableSkeleton, EmptyState,
} from '@/components/shared';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import type { MovimientoMantenimiento } from '@/services/api';
import * as XLSX from 'xlsx';

type Tab = 'por_relacionar' | 'relacionado';

export default function MantenimientoPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('por_relacionar');
  const [relacionando, setRelacionando] = useState<MovimientoMantenimiento | null>(null);
  const [form, setForm] = useState<{ vehiculoId: string; conductorId: string; motivoCodigo: string; descripcion: string }>({
    vehiculoId: '', conductorId: '', motivoCodigo: '', descripcion: '',
  });

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [vehiculoIdFiltro, setVehiculoIdFiltro] = useState('');
  const [motivoFiltro, setMotivoFiltro] = useState('');
  const [search, setSearch] = useState('');

  const filtrosActivos = {
    estado: tab,
    desde: desde || undefined,
    hasta: hasta || undefined,
    vehiculoId: vehiculoIdFiltro ? parseInt(vehiculoIdFiltro) : undefined,
    motivoCodigo: motivoFiltro || undefined,
    search: search || undefined,
  };

  const { data: gastos, isLoading } = useQuery({
    queryKey: ['mantenimiento', filtrosActivos],
    queryFn: () => mantenimientoApi.listar(filtrosActivos).then((r) => r.data.data),
  });

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos', 'activos'],
    queryFn: () => vehiculosApi.listar({ activo: true, limit: 200 }).then((r) => r.data.data.items).catch(() => []),
  });

  const { data: conductores = [] } = useQuery({
    queryKey: ['conductores', 'activos'],
    queryFn: () => conductoresApi.listar({ activo: true, limit: 200 }).then((r) => r.data.data.items).catch(() => []),
  });

  const { data: motivos = [] } = useQuery({
    queryKey: ['configuracion', 'tablas', 'motivo_mantenimiento'],
    queryFn: () => configuracionApi.getTablaMaestra('motivo_mantenimiento').then((r) => r.data.data.filter((m: any) => m.activo)),
  });

  const inv = () => queryClient.invalidateQueries({ queryKey: ['mantenimiento'] });

  const exportarExcel = () => {
    const rows = (gastos ?? []).map((g) => ({
      Fecha: formatDate(g.fecha),
      Concepto: g.concepto,
      Monto: Number(g.monto),
      Vehículo: g.mantenimiento?.vehiculo.placa ?? '—',
      Motivo: motivos.find((m: any) => m.codigo === g.mantenimiento?.motivoCodigo)?.nombre ?? g.mantenimiento?.motivoCodigo ?? '—',
      Conductor: g.mantenimiento?.conductor?.nombre ?? '—',
      Descripción: g.mantenimiento?.descripcion ?? '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === 'por_relacionar' ? 'Por relacionar' : 'Relacionados');
    XLSX.writeFile(wb, `mantenimiento_${tab}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const cerrarRelacionar = () => {
    setRelacionando(null);
    setForm({ vehiculoId: '', conductorId: '', motivoCodigo: '', descripcion: '' });
  };

  const abrirRelacionar = (g: MovimientoMantenimiento) => {
    setRelacionando(g);
    setForm({
      vehiculoId: g.mantenimiento?.vehiculo ? String(g.mantenimiento.vehiculo.id) : '',
      conductorId: g.mantenimiento?.conductor ? String(g.mantenimiento.conductor.id) : '',
      motivoCodigo: g.mantenimiento?.motivoCodigo ?? '',
      descripcion: g.mantenimiento?.descripcion ?? '',
    });
  };

  const relacionarMutation = useMutation({
    mutationFn: () => mantenimientoApi.relacionar(relacionando!.id, {
      vehiculoId: parseInt(form.vehiculoId),
      conductorId: form.conductorId ? parseInt(form.conductorId) : undefined,
      motivoCodigo: form.motivoCodigo,
      descripcion: form.descripcion || undefined,
    }),
    onSuccess: () => { toast.success('Gasto relacionado correctamente'); cerrarRelacionar(); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="Mantenimiento"
        description="Relaciona los egresos de categoría Mantenimiento a un vehículo, conductor y motivo"
        action={
          <Button variant="secondary" onClick={exportarExcel} disabled={!gastos?.length}>
            <Download className="w-4 h-4" /> Exportar Excel
          </Button>
        }
      />

      <div className="flex gap-1 border-b border-border">
        {(['por_relacionar', 'relacionado'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'por_relacionar' ? 'Gastos por relacionar' : 'Gastos relacionados'}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <FormField label="Desde"><Input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></FormField>
        <FormField label="Hasta"><Input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></FormField>
        <FormField label="Vehículo">
          <Select value={vehiculoIdFiltro} onChange={(e) => setVehiculoIdFiltro(e.target.value)} className="w-48">
            <option value="">Todos</option>
            {vehiculos.map((v: any) => <option key={v.id} value={v.id}>{v.placa}</option>)}
          </Select>
        </FormField>
        <FormField label="Motivo">
          <Select value={motivoFiltro} onChange={(e) => setMotivoFiltro(e.target.value)} className="w-48">
            <option value="">Todos</option>
            {motivos.map((m: any) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
          </Select>
        </FormField>
        <FormField label="Buscar">
          <Input placeholder="Concepto..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </FormField>
      </div>

      {isLoading ? <TableSkeleton rows={6} cols={6} /> : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th className="text-right">Monto</Th>
              {tab === 'relacionado' && <Th>Vehículo</Th>}
              {tab === 'relacionado' && <Th>Motivo</Th>}
              {tab === 'relacionado' && <Th>Descripción</Th>}
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {(gastos ?? []).length ? gastos!.map((g) => (
              <Tr key={g.id}>
                <Td><span className="text-sm">{formatDate(g.fecha)}</span></Td>
                <Td><span className="text-sm font-medium">{g.concepto}</span></Td>
                <Td className="text-right"><span className="font-semibold text-destructive">{formatCurrency(Number(g.monto))}</span></Td>
                {tab === 'relacionado' && <Td><span className="text-xs text-muted-foreground">{g.mantenimiento?.vehiculo.placa}</span></Td>}
                {tab === 'relacionado' && <Td><span className="text-xs text-muted-foreground">{motivos.find((m: any) => m.codigo === g.mantenimiento?.motivoCodigo)?.nombre ?? g.mantenimiento?.motivoCodigo}</span></Td>}
                {tab === 'relacionado' && <Td><span className="text-xs text-muted-foreground">{g.mantenimiento?.descripcion || '—'}</span></Td>}
                <Td className="text-right">
                  <Button size="sm" variant={tab === 'relacionado' ? 'secondary' : 'primary'} onClick={() => abrirRelacionar(g)}>
                    <Wrench className="w-3.5 h-3.5" /> {tab === 'relacionado' ? 'Editar' : 'Relacionar'}
                  </Button>
                </Td>
              </Tr>
            )) : <tr><td colSpan={6}><EmptyState message={tab === 'por_relacionar' ? 'Sin gastos de mantenimiento por relacionar' : 'Sin gastos de mantenimiento relacionados'} /></td></tr>}
          </tbody>
        </Table>
      )}

      <Modal open={!!relacionando} onClose={cerrarRelacionar} title="Relacionar gasto de mantenimiento">
        {relacionando && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">Gasto: <span className="font-medium text-foreground">{relacionando.concepto}</span></p>
              <p className="text-muted-foreground">Monto: <span className="font-semibold text-destructive">{formatCurrency(Number(relacionando.monto))}</span></p>
            </div>

            <FormField label="Vehículo" required>
              <Select value={form.vehiculoId} onChange={(e) => setForm((p) => ({ ...p, vehiculoId: e.target.value }))}>
                <option value="">Selecciona un vehículo</option>
                {vehiculos.map((v: any) => <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>)}
              </Select>
            </FormField>

            <FormField label="Conductor" hint="Opcional">
              <Select value={form.conductorId} onChange={(e) => setForm((p) => ({ ...p, conductorId: e.target.value }))}>
                <option value="">Sin conductor</option>
                {conductores.map((c: any) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </Select>
            </FormField>

            <FormField label="Motivo" required hint="Configurable desde Configuración > Tablas maestras">
              <Select value={form.motivoCodigo} onChange={(e) => setForm((p) => ({ ...p, motivoCodigo: e.target.value }))}>
                <option value="">Selecciona un motivo</option>
                {motivos.map((m: any) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
              </Select>
            </FormField>

            <FormField label="Descripción" hint="Detalle del mantenimiento">
              <Textarea value={form.descripcion} onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: cambio de las 2 llantas traseras del tracto..." />
            </FormField>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={cerrarRelacionar}>Cancelar</Button>
              <Button
                loading={relacionarMutation.isPending}
                disabled={!form.vehiculoId || !form.motivoCodigo}
                onClick={() => relacionarMutation.mutate()}
              >
                Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
