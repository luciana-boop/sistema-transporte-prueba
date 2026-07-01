// FILE: src/app/(dashboard)/configuracion/page.tsx
// CAMBIOS:
//   - TABS: agrega 'unidades' (Unidades de Medida) y 'codigos' (Códigos de Factura)
//   - TIPOS_TABLA: agrega 'unidad_medida' y 'codigo_factura' para visibilidad en Tablas Maestras
//   - Nuevos tabs con CRUD completo (crear, editar, activar/desactivar)
//   - Queries y mutations para unidades y códigos usando TablaMaestra
//   - Modales reutilizados del patrón existente
'use client';

import { MonedasTab, TiposPagoTab, CuentasTab } from './CuentasTabs';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import {
  Building2, FileText, Bell, Car, Database, Settings2, Plus, Edit2, Trash2,
  Save, ToggleLeft, ToggleRight, RefreshCw,
} from 'lucide-react';
import { configuracionApi, cuentasApi } from '@/services/api';
import { getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge,
  Modal, FormField, Input, Select, Textarea, StatCard,
  TableSkeleton, EmptyState,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import { usePermisosStore } from '@/store/permisos.store';
import type {
  ConfigParam, SerieFacturacion,
  ConfigAlerta, TablaMaestra, TipoVehiculoConfig,
} from '@/types';

const TABS = [
  { id: 'empresa',    label: 'Empresa',        icon: Building2  },
  { id: 'series',     label: 'Series Factura', icon: FileText   },
  { id: 'alertas',    label: 'Alertas',        icon: Bell       },
  { id: 'vehiculos',  label: 'Tipos Vehículo', icon: Car        },
  { id: 'monedas',    label: 'Monedas',        icon: Database   },
  { id: 'tipospago',  label: 'Tipos de Pago',  icon: Database   },
  { id: 'cuentas',    label: 'Cuentas',        icon: Database   },
  { id: 'tablas',     label: 'Tablas Maestras',icon: Database   },
  { id: 'pdf',        label: 'Config. PDF',    icon: Settings2  },
];

const TIPOS_TABLA = [
  { tipo: 'banco',                label: 'Bancos' },
  { tipo: 'tipo_documento',       label: 'Tipos de documento' },
  { tipo: 'tipo_credito',         label: 'Tipos de crédito' },
  { tipo: 'tipo_carga',           label: 'Tipos de carga' },
  { tipo: 'proveedor_combustible',label: 'Proveedores combustible' },
  { tipo: 'unidad_medida',        label: 'Unidades de medida' },
  { tipo: 'codigo_factura',       label: 'Códigos de facturación' },
];

const NIVEL_COLOR: Record<string, string> = {
  info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  warning: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  danger: 'bg-red-500/10 text-red-500',
};

// ─── Switch component ─────────────────────────────────────────────────────────
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

// ─── Inline editable field ────────────────────────────────────────────────────
function ParamField({ param, onSave }: { param: ConfigParam; onSave: (clave: string, valor: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(param.valor);

  const save = () => {
    onSave(param.clave, val);
    setEditing(false);
  };

  return (
    <div className="flex items-start justify-between gap-3 py-3 border-b border-border last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{param.etiqueta}</p>
        {param.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{param.descripcion}</p>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <>
            {param.tipo === 'color' ? (
              <input type="color" value={val} onChange={(e) => setVal(e.target.value)} className="h-8 w-14 rounded cursor-pointer border border-border" />
            ) : param.tipo === 'booleano' ? (
              <Switch checked={val === 'true'} onChange={(v) => setVal(String(v))} />
            ) : (
              <Input value={val} onChange={(e) => setVal(e.target.value)} className="w-48 text-sm" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
            )}
            <Button size="sm" onClick={save}><Save className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => { setVal(param.valor); setEditing(false); }}>✕</Button>
          </>
        ) : (
          <>
            {param.tipo === 'color' ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded border border-border" style={{ background: param.valor }} />
                <span className="text-sm font-mono text-muted-foreground">{param.valor}</span>
              </div>
            ) : param.tipo === 'booleano' ? (
              <Switch checked={param.valor === 'true'} onChange={(v) => onSave(param.clave, String(v))} />
            ) : (
              <span className="text-sm text-right max-w-48 truncate">{param.valor}</span>
            )}
            {param.tipo !== 'booleano' && (
              <button onClick={() => setEditing(true)} className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ConfiguracionPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { usuario } = useAuthStore();
  const modulos = usePermisosStore((s) => s.modulos);
  const tieneModulo = usePermisosStore((s) => s.tieneModulo);
  const [tab, setTab] = useState('empresa');
  const [tipoTabla, setTipoTabla] = useState('banco');
  const [showModal, setShowModal] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    if (usuario?.rol === 'ADMIN') return;
    if (modulos === null) return; // esperar a que carguen los permisos
    if (!tieneModulo('configuracion')) router.replace('/dashboard');
  }, [usuario, modulos, tieneModulo, router]);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: parametros, isLoading: loadParams } = useQuery({
    queryKey: ['config', 'parametros'],
    queryFn: () => configuracionApi.getParametros().then(r => r.data.data),
    enabled: tab === 'empresa' || tab === 'pdf',
  });

  const { data: series = [], isLoading: loadSeries } = useQuery({
    queryKey: ['config', 'series'],
    queryFn: () => configuracionApi.getSeries().then(r => r.data.data),
    enabled: tab === 'series',
  });

  const { data: alertas = [], isLoading: loadAlertas } = useQuery({
    queryKey: ['config', 'alertas'],
    queryFn: () => configuracionApi.getAlertas().then(r => r.data.data),
    enabled: tab === 'alertas',
  });

  const { data: tiposVehiculo = [], isLoading: loadTV } = useQuery({
    queryKey: ['config', 'tipos-vehiculo'],
    queryFn: () => configuracionApi.getTiposVehiculo().then(r => r.data.data),
    enabled: tab === 'vehiculos',
  });

  const { data: tablaData = [], isLoading: loadTabla } = useQuery({
    queryKey: ['config', 'tabla', tipoTabla],
    queryFn: () => configuracionApi.getTablaMaestra(tipoTabla).then(r => r.data.data),
    enabled: tab === 'tablas',
  });

  // ── Unidades de medida — accedidas desde Tablas Maestras (tipo: unidad_medida) ──
  // Los tabs independientes 'unidades' y 'codigos' fueron eliminados (P4).
  // Estas queries ya no se activan; se mantienen solo para no romper referencias.
  const { data: unidadesData = [], isLoading: loadUnidades } = useQuery({
    queryKey: ['config', 'tabla', 'unidad_medida'],
    queryFn: () => configuracionApi.getTablaMaestra('unidad_medida').then(r => r.data.data),
    enabled: false, // P4: eliminado tab independiente; usar Tablas Maestras
  });

  // ── Códigos de facturación — accedidos desde Tablas Maestras (tipo: codigo_factura) ──
  const { data: codigosData = [], isLoading: loadCodigos } = useQuery({
    queryKey: ['config', 'tabla', 'codigo_factura'],
    queryFn: () => configuracionApi.getTablaMaestra('codigo_factura').then(r => r.data.data),
    enabled: false, // P4: eliminado tab independiente; usar Tablas Maestras
  });

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const inv = (key: string) => qc.invalidateQueries({ queryKey: ['config', key] });

  const inicializarMutation = useMutation({
    mutationFn: async () => {
      await configuracionApi.inicializar();
      await cuentasApi.inicializar();
      return { message: 'Todo inicializado' };
    },
    onSuccess: () => { toast.success('Configuración inicializada con valores por defecto'); qc.invalidateQueries({ queryKey: ['config'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateParamMutation = useMutation({
    mutationFn: ({ clave, valor }: { clave: string; valor: string }) => configuracionApi.updateParametro(clave, valor),
    onSuccess: () => { toast.success('Parámetro guardado'); inv('parametros'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Series mutations
  const createSerieMutation = useMutation({
    mutationFn: () => configuracionApi.createSerie({
      serie: formData.serie, tipoDocumento: formData.tipoDocumento,
      correlativoInicial: formData.correlativoInicial ? parseInt(formData.correlativoInicial) : 1,
      descripcion: formData.descripcion,
    }),
    onSuccess: () => { toast.success('Serie creada'); setShowModal(null); setFormData({}); inv('series'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateSerieMutation = useMutation({
    mutationFn: () => configuracionApi.updateSerie(editingItem.id, {
      tipoDocumento: formData.tipoDocumento,
      correlativoActual: formData.correlativoActual ? parseInt(formData.correlativoActual) : undefined,
      activo: formData.activo === 'true',
      descripcion: formData.descripcion,
    }),
    onSuccess: () => { toast.success('Serie actualizada'); setShowModal(null); setEditingItem(null); setFormData({}); inv('series'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteSerieMutation = useMutation({
    mutationFn: (id: number) => configuracionApi.deleteSerie(id),
    onSuccess: () => { toast.success('Serie eliminada'); inv('series'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Alertas mutations
  const updateAlertaMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => configuracionApi.updateAlerta(id, data),
    onSuccess: () => { toast.success('Alerta actualizada'); inv('alertas'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Tipos vehículo mutations
  const createTVMutation = useMutation({
    mutationFn: () => configuracionApi.createTipoVehiculo({ codigo: formData.codigo, nombre: formData.nombre, descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Tipo creado'); setShowModal(null); setFormData({}); inv('tipos-vehiculo'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateTVMutation = useMutation({
    mutationFn: (activo?: boolean) => configuracionApi.updateTipoVehiculo(editingItem?.id, activo !== undefined ? { activo } : { nombre: formData.nombre, descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Actualizado'); setShowModal(null); setEditingItem(null); setFormData({}); inv('tipos-vehiculo'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteTVMutation = useMutation({
    mutationFn: (id: number) => configuracionApi.deleteTipoVehiculo(id),
    onSuccess: () => { toast.success('Tipo eliminado'); inv('tipos-vehiculo'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Tablas maestras mutations
  const createTablaMutation = useMutation({
    mutationFn: () => configuracionApi.createTablaMaestra({ tipo: tipoTabla, codigo: formData.codigo, nombre: formData.nombre, descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Registro creado'); setShowModal(null); setFormData({}); inv('tabla'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateTablaMutation = useMutation({
    mutationFn: (activo?: boolean) => configuracionApi.updateTablaMaestra(editingItem?.id, activo !== undefined ? { activo } : { nombre: formData.nombre, descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Actualizado'); setShowModal(null); setEditingItem(null); setFormData({}); inv('tabla'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteTablaMutation = useMutation({
    mutationFn: (id: number) => configuracionApi.deleteTablaMaestra(id),
    onSuccess: () => { toast.success('Eliminado'); inv('tabla'); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Unidades de medida mutations
  const createUnidadMutation = useMutation({
    mutationFn: () => configuracionApi.createTablaMaestra({ tipo: 'unidad_medida', codigo: formData.codigo?.toUpperCase(), nombre: formData.nombre, descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Unidad creada'); setShowModal(null); setFormData({}); qc.invalidateQueries({ queryKey: ['config', 'tabla', 'unidad_medida'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateUnidadMutation = useMutation({
    mutationFn: (activo?: boolean) => configuracionApi.updateTablaMaestra(editingItem?.id, activo !== undefined ? { activo } : { nombre: formData.nombre, descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Actualizado'); setShowModal(null); setEditingItem(null); setFormData({}); qc.invalidateQueries({ queryKey: ['config', 'tabla', 'unidad_medida'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Códigos de facturación mutations
  const createCodigoMutation = useMutation({
    mutationFn: () => configuracionApi.createTablaMaestra({ tipo: 'codigo_factura', codigo: formData.codigo, nombre: formData.codigo, descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Código creado'); setShowModal(null); setFormData({}); qc.invalidateQueries({ queryKey: ['config', 'tabla', 'codigo_factura'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateCodigoMutation = useMutation({
    mutationFn: (activo?: boolean) => configuracionApi.updateTablaMaestra(editingItem?.id, activo !== undefined ? { activo } : { descripcion: formData.descripcion }),
    onSuccess: () => { toast.success('Actualizado'); setShowModal(null); setEditingItem(null); setFormData({}); qc.invalidateQueries({ queryKey: ['config', 'tabla', 'codigo_factura'] }); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openCreate = (modal: string) => { setEditingItem(null); setFormData({}); setShowModal(modal); };
  const openEdit = (modal: string, item: any) => {
    setEditingItem(item);
    setFormData({
      nombre: item.nombre ?? '', codigo: item.codigo ?? '', descripcion: item.descripcion ?? '',
      tipoDocumento: item.tipoDocumento ?? '', correlativoActual: String(item.correlativoActual ?? ''),
      activo: String(item.activo ?? true),
    });
    setShowModal(modal);
  };

  if (usuario?.rol !== 'ADMIN' && (modulos === null || !tieneModulo('configuracion'))) return null;

  return (
    <div className="page-container">
      <PageHeader
        title="Configuración General"
        description="Administración dinámica del sistema"
        action={
          <Button variant="secondary" size="sm" onClick={() => inicializarMutation.mutate()} loading={inicializarMutation.isPending}>
            <RefreshCw className="w-4 h-4" /> Inicializar defaults
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-full overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              tab === t.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: EMPRESA ─────────────────────────────────────────────────────── */}
      {tab === 'empresa' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {['empresa', 'facturacion'].map((cat) => {
            const items = parametros?.[cat] ?? [];
            return (
              <div key={cat} className="bg-card border border-border rounded-xl p-5">
                <p className="text-sm font-semibold capitalize mb-3 pb-2 border-b border-border">
                  {cat === 'empresa' ? '🏢 Datos de la empresa' : '🧾 Facturación'}
                </p>
                {loadParams ? (
                  Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-8 rounded mb-2" />)
                ) : items.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Sin parámetros. Presiona "Inicializar defaults".</p>
                ) : (
                  items.map((p) => (
                    <ParamField
                      key={p.clave}
                      param={p}
                      onSave={(clave, valor) => updateParamMutation.mutate({ clave, valor })}
                    />
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── TAB: SERIES ──────────────────────────────────────────────────────── */}
      {tab === 'series' && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{series.length} series configuradas</p>
            <Button size="sm" onClick={() => openCreate('serie')}>
              <Plus className="w-4 h-4" /> Nueva serie
            </Button>
          </div>
          {loadSeries ? <TableSkeleton rows={4} cols={6} /> : (
            <Table>
              <thead>
                <tr>
                  <Th>Serie</Th><Th>Tipo documento</Th><Th>Correlativo actual</Th>
                  <Th>Correlativo inicial</Th><Th>Estado</Th><Th>Descripción</Th>
                  <Th className="text-right">Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {series.length > 0 ? series.map((s) => (
                  <Tr key={s.id}>
                    <Td><span className="font-mono font-bold text-sm">{s.serie}</span></Td>
                    <Td><span className="text-sm">{s.tipoDocumento}</span></Td>
                    <Td>
                      <span className="font-mono text-sm text-primary font-semibold">
                        {String(s.correlativoActual).padStart(5, '0')}
                      </span>
                    </Td>
                    <Td><span className="font-mono text-xs text-muted-foreground">{String(s.correlativoInicial).padStart(5, '0')}</span></Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={s.activo}
                          onChange={(v) => configuracionApi.updateSerie(s.id, { activo: v }).then(() => { inv('series'); toast.success('Serie ' + (v ? 'activada' : 'desactivada')); }).catch(e => toast.error(getErrorMessage(e)))}
                        />
                        <span className="text-xs text-muted-foreground">{s.activo ? 'Activa' : 'Inactiva'}</span>
                      </div>
                    </Td>
                    <Td><span className="text-xs text-muted-foreground">{s.descripcion ?? '—'}</span></Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit('serie', s)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`¿Eliminar serie ${s.serie}?`)) deleteSerieMutation.mutate(s.id); }}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={7}><EmptyState message="No hay series. Presiona 'Inicializar defaults' o crea una nueva." /></td></tr>}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* ── TAB: ALERTAS ─────────────────────────────────────────────────────── */}
      {tab === 'alertas' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">Configura cuántos días antes se activa cada alerta del sistema.</p>
          {loadAlertas ? <TableSkeleton rows={5} cols={5} /> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {alertas.map((a) => (
                <div key={a.id} className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">{a.etiqueta}</p>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium mt-1 ${NIVEL_COLOR[a.nivel]}`}>
                        {a.nivel === 'info' ? 'Informativa' : a.nivel === 'warning' ? 'Advertencia' : 'Crítica'}
                      </span>
                    </div>
                    <Switch
                      checked={a.activo}
                      onChange={(v) => updateAlertaMutation.mutate({ id: a.id, data: { activo: v } })}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Días de anticipación</label>
                    <Input
                      type="number"
                      min={0}
                      max={365}
                      defaultValue={a.diasAnticipacion}
                      className="w-20 text-sm"
                      onBlur={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v) && v !== a.diasAnticipacion) {
                          updateAlertaMutation.mutate({ id: a.id, data: { diasAnticipacion: v } });
                        }
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground">Nivel</label>
                    <Select
                      defaultValue={a.nivel}
                      className="text-xs"
                      onChange={(e) => updateAlertaMutation.mutate({ id: a.id, data: { nivel: e.target.value } })}
                    >
                      <option value="info">Informativa</option>
                      <option value="warning">Advertencia</option>
                      <option value="danger">Crítica</option>
                    </Select>
                  </div>
                </div>
              ))}
              {alertas.length === 0 && <div className="col-span-2"><EmptyState message="Sin alertas. Presiona 'Inicializar defaults'." /></div>}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: VEHÍCULOS ───────────────────────────────────────────────────── */}
      {tab === 'vehiculos' && (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">{tiposVehiculo.length} tipos configurados</p>
            <Button size="sm" onClick={() => openCreate('tv')}>
              <Plus className="w-4 h-4" /> Nuevo tipo
            </Button>
          </div>
          {loadTV ? <TableSkeleton rows={4} cols={4} /> : (
            <Table>
              <thead>
                <tr><Th>Código</Th><Th>Nombre</Th><Th>Descripción</Th><Th>Activo</Th><Th className="text-right">Acciones</Th></tr>
              </thead>
              <tbody>
                {tiposVehiculo.length > 0 ? tiposVehiculo.map((t) => (
                  <Tr key={t.id}>
                    <Td><span className="font-mono text-xs font-bold">{t.codigo}</span></Td>
                    <Td><span className="text-sm font-medium">{t.nombre}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{t.descripcion ?? '—'}</span></Td>
                    <Td>
                      <Switch
                        checked={t.activo}
                        onChange={(v) => { setEditingItem(t); updateTVMutation.mutate(v); }}
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit('tv', t)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm(`¿Eliminar "${t.nombre}"?`)) deleteTVMutation.mutate(t.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={5}><EmptyState message="Sin tipos. Presiona 'Inicializar defaults' o crea uno nuevo." /></td></tr>}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* ── TAB: TABLAS MAESTRAS ─────────────────────────────────────────────── */}
      {tab === 'tablas' && (
        <div className="flex flex-col gap-4">
          {/* Selector de tipo */}
          <div className="flex flex-wrap gap-2">
            {TIPOS_TABLA.map((tt) => (
              <button
                key={tt.tipo}
                onClick={() => setTipoTabla(tt.tipo)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  tipoTabla === tt.tipo
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-background border-border text-muted-foreground hover:text-foreground hover:border-primary/30'
                }`}
              >
                {tt.label}
              </button>
            ))}
          </div>

          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              {tablaData.length} registros en "{TIPOS_TABLA.find(t => t.tipo === tipoTabla)?.label}"
            </p>
            <Button size="sm" onClick={() => openCreate('tabla')}>
              <Plus className="w-4 h-4" /> Nuevo registro
            </Button>
          </div>

          {loadTabla ? <TableSkeleton rows={5} cols={5} /> : (
            <Table>
              <thead>
                <tr><Th>Código</Th><Th>Nombre</Th><Th>Descripción</Th><Th>Activo</Th><Th className="text-right">Acciones</Th></tr>
              </thead>
              <tbody>
                {tablaData.length > 0 ? tablaData.map((t) => (
                  <Tr key={t.id}>
                    <Td><span className="font-mono text-xs font-bold">{t.codigo}</span></Td>
                    <Td><span className="text-sm font-medium">{t.nombre}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{t.descripcion ?? '—'}</span></Td>
                    <Td>
                      <Switch
                        checked={t.activo}
                        onChange={(v) => { setEditingItem(t); updateTablaMutation.mutate(v); }}
                      />
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit('tabla', t)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => { if (confirm('¿Eliminar?')) deleteTablaMutation.mutate(t.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={5}><EmptyState message="Sin registros. Inicializa defaults o crea uno nuevo." /></td></tr>}
              </tbody>
            </Table>
          )}
        </div>
      )}

      {/* ── TAB: PDF ─────────────────────────────────────────────────────────── */}
      {tab === 'pdf' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold mb-3 pb-2 border-b border-border">🖨️ Configuración de PDF</p>
            {loadParams ? (
              Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-8 rounded mb-2" />)
            ) : (parametros?.['pdf'] ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">Sin parámetros. Presiona "Inicializar defaults".</p>
            ) : (
              (parametros?.['pdf'] ?? []).map((p) => (
                <ParamField
                  key={p.clave}
                  param={p}
                  onSave={(clave, valor) => updateParamMutation.mutate({ clave, valor })}
                />
              ))
            )}
          </div>

          {/* Preview de cabecera PDF */}
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-sm font-semibold mb-3 pb-2 border-b border-border">👁️ Preview cabecera</p>
            {(() => {
              const emp = parametros?.['empresa'] ?? [];
              const pdf = parametros?.['pdf'] ?? [];
              const get = (clave: string) => [...emp, ...pdf].find(p => p.clave === clave)?.valor ?? '';
              const color = get('pdf_color_principal') || '#2563eb';
              return (
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="p-4" style={{ borderBottom: `3px solid ${color}` }}>
                    <p className="font-bold text-lg" style={{ color }}>{get('empresa_nombre') || 'Mi Empresa SAC'}</p>
                    <p className="text-xs text-muted-foreground">{get('empresa_razon_social')}</p>
                    <p className="text-xs text-muted-foreground">RUC: {get('empresa_ruc')}</p>
                    <p className="text-xs text-muted-foreground">{get('empresa_direccion')}</p>
                    <p className="text-xs text-muted-foreground">{get('empresa_telefono')} | {get('empresa_email')}</p>
                  </div>
                  <div className="p-3 bg-muted/20">
                    <p className="text-xs text-center text-muted-foreground">{get('pdf_pie_pagina')}</p>
                    <p className="text-xs text-center text-muted-foreground mt-1 italic">{get('pdf_texto_legal')}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* ── TAB: MONEDAS ────────────────────────────────────────────────────── */}
      {tab === 'monedas' && <MonedasTab />}

      {/* ── TAB: TIPOS PAGO ──────────────────────────────────────────────────── */}
      {tab === 'tipospago' && <TiposPagoTab />}

      {/* ── TAB: CUENTAS ─────────────────────────────────────────────────────── */}
      {tab === 'cuentas' && <CuentasTab />}

      {/* ── MODALES ──────────────────────────────────────────────────────────── */}

      {/* Serie Modal */}
      <Modal
        open={showModal === 'serie'}
        onClose={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}
        title={editingItem ? `Editar serie ${editingItem.serie}` : 'Nueva serie de facturación'}
      >
        <div className="flex flex-col gap-4">
          {!editingItem && (
            <FormField label="Serie" required>
              <Input
                placeholder="F001, F002, B001..."
                maxLength={4}
                value={formData.serie ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, serie: e.target.value.toUpperCase() }))}
              />
            </FormField>
          )}
          <FormField label="Tipo de documento">
            <Select value={formData.tipoDocumento ?? 'FACTURA'} onChange={(e) => setFormData(p => ({ ...p, tipoDocumento: e.target.value }))}>
              <option value="FACTURA">Factura</option>
              <option value="BOLETA">Boleta de venta</option>
              <option value="NOTA_CREDITO">Nota de crédito</option>
              <option value="OTRO">Otro</option>
            </Select>
          </FormField>
          {editingItem ? (
            <FormField label="Correlativo actual">
              <Input
                type="number"
                min={1}
                value={formData.correlativoActual ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, correlativoActual: e.target.value }))}
              />
            </FormField>
          ) : (
            <FormField label="Correlativo inicial">
              <Input
                type="number"
                min={1}
                placeholder="1"
                value={formData.correlativoInicial ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, correlativoInicial: e.target.value }))}
              />
            </FormField>
          )}
          <FormField label="Descripción">
            <Input
              placeholder="Facturas principales..."
              value={formData.descripcion ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}>Cancelar</Button>
            <Button
              loading={createSerieMutation.isPending || updateSerieMutation.isPending}
              onClick={() => editingItem ? updateSerieMutation.mutate() : createSerieMutation.mutate()}
            >
              {editingItem ? 'Guardar cambios' : 'Crear serie'}
            </Button>
          </div>
        </div>
      </Modal>


      {/* Tipo Vehículo Modal */}
      <Modal
        open={showModal === 'tv'}
        onClose={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}
        title={editingItem ? 'Editar tipo de vehículo' : 'Nuevo tipo de vehículo'}
      >
        <div className="flex flex-col gap-4">
          {!editingItem && (
            <FormField label="Código" required>
              <Input
                placeholder="FURGON, PLATAFORMA..."
                value={formData.codigo ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
              />
            </FormField>
          )}
          <FormField label="Nombre" required>
            <Input
              placeholder="Nombre del tipo"
              value={formData.nombre ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
            />
          </FormField>
          <FormField label="Descripción">
            <Textarea
              placeholder="Descripción opcional..."
              value={formData.descripcion ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}>Cancelar</Button>
            <Button
              loading={createTVMutation.isPending || updateTVMutation.isPending}
              onClick={() => editingItem ? updateTVMutation.mutate(undefined) : createTVMutation.mutate()}
            >
              {editingItem ? 'Guardar' : 'Crear tipo'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Tabla Maestra Modal */}
      <Modal
        open={showModal === 'tabla'}
        onClose={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}
        title={editingItem ? 'Editar registro' : `Nuevo registro en ${TIPOS_TABLA.find(t => t.tipo === tipoTabla)?.label}`}
      >
        <div className="flex flex-col gap-4">
          {!editingItem && (
            <FormField label="Código" required>
              <Input
                placeholder="Código único..."
                value={formData.codigo ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
              />
            </FormField>
          )}
          <FormField label="Nombre" required>
            <Input
              placeholder="Nombre del registro"
              value={formData.nombre ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
            />
          </FormField>
          <FormField label="Descripción">
            <Input
              placeholder="Descripción corta..."
              value={formData.descripcion ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}>Cancelar</Button>
            <Button
              loading={createTablaMutation.isPending || updateTablaMutation.isPending}
              onClick={() => editingItem ? updateTablaMutation.mutate(undefined) : createTablaMutation.mutate()}
            >
              {editingItem ? 'Guardar' : 'Crear registro'}
            </Button>
          </div>
        </div>
      </Modal>
      {/* ── MODAL: Unidad de medida ─────────────────────────────────────────── */}
      <Modal
        open={showModal === 'unidad'}
        onClose={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}
        title={editingItem ? `Editar unidad ${editingItem.codigo}` : 'Nueva unidad de medida'}
      >
        <div className="flex flex-col gap-4">
          {!editingItem && (
            <FormField label="Código *" hint="Ej: UND, SERV, VIAJE, KG">
              <Input
                placeholder="UND"
                value={formData.codigo ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, codigo: e.target.value.toUpperCase() }))}
              />
            </FormField>
          )}
          <FormField label="Nombre *">
            <Input
              placeholder="Unidad, Servicio, Viaje..."
              value={formData.nombre ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, nombre: e.target.value }))}
            />
          </FormField>
          <FormField label="Descripción">
            <Input
              placeholder="Descripción corta opcional..."
              value={formData.descripcion ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}>Cancelar</Button>
            <Button
              loading={createUnidadMutation.isPending || updateUnidadMutation.isPending}
              onClick={() => editingItem ? updateUnidadMutation.mutate(undefined) : createUnidadMutation.mutate()}
            >
              {editingItem ? 'Guardar' : 'Crear unidad'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL: Código de facturación ─────────────────────────────────────── */}
      <Modal
        open={showModal === 'codigo'}
        onClose={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}
        title={editingItem ? `Editar código ${editingItem.codigo}` : 'Nuevo código de facturación'}
      >
        <div className="flex flex-col gap-4">
          {!editingItem && (
            <FormField label="Código *" hint="Ej: 00001, 00004, S001">
              <Input
                placeholder="00004"
                value={formData.codigo ?? ''}
                onChange={(e) => setFormData(p => ({ ...p, codigo: e.target.value }))}
              />
            </FormField>
          )}
          <FormField label="Descripción asociada *" hint="Se autocompleta al seleccionar este código en la factura">
            <Input
              placeholder="Ej: Servicio de Transporte Internacional"
              value={formData.descripcion ?? ''}
              onChange={(e) => setFormData(p => ({ ...p, descripcion: e.target.value }))}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowModal(null); setEditingItem(null); setFormData({}); }}>Cancelar</Button>
            <Button
              loading={createCodigoMutation.isPending || updateCodigoMutation.isPending}
              onClick={() => editingItem ? updateCodigoMutation.mutate(undefined) : createCodigoMutation.mutate()}
            >
              {editingItem ? 'Guardar' : 'Crear código'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
