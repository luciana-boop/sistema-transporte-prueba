// FILE: src/app/(dashboard)/configuracion/CuentasTabs.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight, Eye, Ban } from 'lucide-react';
import { cuentasApi, fetchAllPages } from '@/services/api';
import { formatDate, formatDatetime, getErrorMessage, PAGE_SIZE } from '@/lib/utils';
import {
  Button, Table, Th, Td, Tr, TableSkeleton, EmptyState,
  Modal, FormField, Input, Select, Textarea, Pagination,
} from '@/components/shared';
import { MonedaBadge, TipoCuentaBadge } from '@/components/shared/FinancialSelectors';
import type { Moneda, TipoPago, CuentaDinero, MovimientoCuenta } from '@/types';

// ─── Switch ───────────────────────────────────────────────────────────────────
function Switch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${checked ? 'bg-primary' : 'bg-muted'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

// ─── MONEDAS TAB ──────────────────────────────────────────────────────────────
export function MonedasTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Moneda | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const inv = () => { qc.invalidateQueries({ queryKey: ['monedas'] }); qc.invalidateQueries({ queryKey: ['moneda'] }); };

  const { data: monedas = [], isLoading } = useQuery({
    queryKey: ['monedas', 'all'],
    queryFn: () => cuentasApi.getMonedas().then(r => r.data.data),
  });

  const createM = useMutation({
    mutationFn: () => cuentasApi.createMoneda({ codigo: form.codigo, nombre: form.nombre, simbolo: form.simbolo, esPorDefecto: form.esPorDefecto === 'true' }),
    onSuccess: () => { toast.success('Moneda creada'); setShowForm(false); setForm({}); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const updateM = useMutation({
    mutationFn: (data: any) => cuentasApi.updateMoneda(editing!.id, data),
    onSuccess: () => { toast.success('Moneda actualizada'); setEditing(null); setForm({}); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const deleteM = useMutation({
    mutationFn: (id: number) => cuentasApi.deleteMoneda(id),
    onSuccess: () => { toast.success('Moneda eliminada'); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (m: Moneda) => {
    setEditing(m);
    setForm({ nombre: m.nombre, simbolo: m.simbolo, esPorDefecto: String(m.esPorDefecto) });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{monedas.length} monedas configuradas</p>
        <Button size="sm" onClick={() => { setShowForm(true); setForm({}); }}>
          <Plus className="w-4 h-4" /> Nueva moneda
        </Button>
      </div>
      {isLoading ? <TableSkeleton rows={3} cols={5} /> : (
        <Table>
          <thead><tr><Th>Código</Th><Th>Nombre</Th><Th>Símbolo</Th><Th>Por defecto</Th><Th>Activo</Th><Th className="text-right">Acc.</Th></tr></thead>
          <tbody>
            {monedas.length > 0 ? monedas.map(m => (
              <Tr key={m.id}>
                <Td><MonedaBadge codigo={m.codigo} /></Td>
                <Td><span className="text-sm font-medium">{m.nombre}</span></Td>
                <Td><span className="font-mono text-sm">{m.simbolo}</span></Td>
                <Td>
                  {m.esPorDefecto
                    ? <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">Principal</span>
                    : <button onClick={() => updateM.mutate({ esPorDefecto: true })} className="text-xs text-muted-foreground hover:text-primary transition-colors">Hacer default</button>
                  }
                </Td>
                <Td><Switch checked={m.activo} onChange={v => { setEditing(m); updateM.mutate({ activo: v }); }} /></Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(m)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                    {!m.esPorDefecto && <button onClick={() => { if (confirm(`¿Eliminar ${m.nombre}?`)) deleteM.mutate(m.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={6}><EmptyState message="Sin monedas. Presiona 'Inicializar defaults'." /></td></tr>}
          </tbody>
        </Table>
      )}
      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null); setForm({}); }} title={editing ? 'Editar moneda' : 'Nueva moneda'}>
        <div className="flex flex-col gap-4">
          {!editing && <FormField label="Código" required><Input placeholder="USD, EUR..." value={form.codigo ?? ''} onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} maxLength={5} /></FormField>}
          <FormField label="Nombre" required><Input placeholder="Sol Peruano" value={form.nombre ?? ''} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} /></FormField>
          <FormField label="Símbolo" required><Input placeholder="S/, $, €" value={form.simbolo ?? ''} onChange={e => setForm(p => ({ ...p, simbolo: e.target.value }))} maxLength={4} /></FormField>
          <div className="flex items-center gap-3">
            <Switch checked={form.esPorDefecto === 'true'} onChange={v => setForm(p => ({ ...p, esPorDefecto: String(v) }))} />
            <span className="text-sm">Moneda por defecto</span>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setForm({}); }}>Cancelar</Button>
            <Button loading={createM.isPending || updateM.isPending} onClick={() => editing ? updateM.mutate({ nombre: form.nombre, simbolo: form.simbolo, esPorDefecto: form.esPorDefecto === 'true' }) : createM.mutate()}>
              {editing ? 'Guardar' : 'Crear moneda'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── TIPOS PAGO TAB ───────────────────────────────────────────────────────────
export function TiposPagoTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TipoPago | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const inv = () => qc.invalidateQueries({ queryKey: ['tipos-pago'] });

  const { data: tipos = [], isLoading } = useQuery({
    queryKey: ['tipos-pago', 'all'],
    queryFn: () => cuentasApi.getTiposPago().then(r => r.data.data),
  });

  const createT = useMutation({
    mutationFn: () => cuentasApi.createTipoPago({ codigo: form.codigo, nombre: form.nombre, descripcion: form.descripcion, orden: form.orden ? parseInt(form.orden) : undefined }),
    onSuccess: () => { toast.success('Tipo de pago creado'); setShowForm(false); setForm({}); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const updateT = useMutation({
    mutationFn: (data: any) => cuentasApi.updateTipoPago(editing!.id, data),
    onSuccess: () => { toast.success('Actualizado'); setEditing(null); setForm({}); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const deleteT = useMutation({
    mutationFn: (id: number) => cuentasApi.deleteTipoPago(id),
    onSuccess: () => { toast.success('Eliminado'); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (t: TipoPago) => { setEditing(t); setForm({ nombre: t.nombre, descripcion: t.descripcion ?? '', orden: String(t.orden) }); };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{tipos.length} tipos de pago</p>
        <Button size="sm" onClick={() => { setShowForm(true); setForm({}); }}><Plus className="w-4 h-4" /> Nuevo tipo</Button>
      </div>
      {isLoading ? <TableSkeleton rows={5} cols={5} /> : (
        <Table>
          <thead><tr><Th>Código</Th><Th>Nombre</Th><Th>Descripción</Th><Th>Orden</Th><Th>Activo</Th><Th className="text-right">Acc.</Th></tr></thead>
          <tbody>
            {tipos.length > 0 ? tipos.map(t => (
              <Tr key={t.id}>
                <Td><span className="font-mono text-xs font-bold">{t.codigo}</span></Td>
                <Td><span className="text-sm font-medium">{t.nombre}</span></Td>
                <Td><span className="text-xs text-muted-foreground">{t.descripcion ?? '—'}</span></Td>
                <Td><span className="text-xs text-muted-foreground">{t.orden}</span></Td>
                <Td><Switch checked={t.activo} onChange={v => { setEditing(t); updateT.mutate({ activo: v }); }} /></Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm(`¿Eliminar "${t.nombre}"?`)) deleteT.mutate(t.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={6}><EmptyState message="Sin tipos. Presiona 'Inicializar defaults'." /></td></tr>}
          </tbody>
        </Table>
      )}
      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null); setForm({}); }} title={editing ? 'Editar tipo de pago' : 'Nuevo tipo de pago'}>
        <div className="flex flex-col gap-4">
          {!editing && <FormField label="Código" required><Input placeholder="YAPE, PLIN..." value={form.codigo ?? ''} onChange={e => setForm(p => ({ ...p, codigo: e.target.value.toUpperCase() }))} /></FormField>}
          <FormField label="Nombre" required><Input placeholder="Yape" value={form.nombre ?? ''} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} /></FormField>
          <FormField label="Descripción"><Input placeholder="Opcional..." value={form.descripcion ?? ''} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} /></FormField>
          <FormField label="Orden"><Input type="number" placeholder="1" value={form.orden ?? ''} onChange={e => setForm(p => ({ ...p, orden: e.target.value }))} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setForm({}); }}>Cancelar</Button>
            <Button loading={createT.isPending || updateT.isPending} onClick={() => editing ? updateT.mutate({ nombre: form.nombre, descripcion: form.descripcion, orden: form.orden ? parseInt(form.orden) : undefined }) : createT.mutate()}>
              {editing ? 'Guardar' : 'Crear tipo'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── CUENTAS TAB ──────────────────────────────────────────────────────────────
export function CuentasTab() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CuentaDinero | null>(null);
  const [showMovs, setShowMovs] = useState<CuentaDinero | null>(null);
  const [showNuevoMov, setShowNuevoMov] = useState<CuentaDinero | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  // P7: filtros de movimientos — predeterminado Desde/Hasta = hoy, configurable
  const [movDesde, setMovDesde] = useState(() => new Date().toISOString().split('T')[0]);
  const [movHasta, setMovHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [movPage, setMovPage] = useState(1);
  // P7: ver detalle / editar / anular
  const [viewingMov, setViewingMov] = useState<MovimientoCuenta | null>(null);
  const [editingMov, setEditingMov] = useState<MovimientoCuenta | null>(null);
  const [anulandoMov, setAnulandoMov] = useState<MovimientoCuenta | null>(null);
  const [movEditForm, setMovEditForm] = useState<Record<string, string>>({});
  const inv = () => qc.invalidateQueries({ queryKey: ['cuentas'] });
  const invMovs = () => qc.invalidateQueries({ queryKey: ['movimientos'] });

  const { data: cuentas = [], isLoading } = useQuery({
    queryKey: ['cuentas', false],
    queryFn: () => cuentasApi.getCuentas({ activo: false }).then(r => r.data.data),
  });
  const { data: monedas = [] } = useQuery({
    queryKey: ['monedas', 'activas'],
    queryFn: () => cuentasApi.getMonedasActivas().then(r => r.data.data),
  });
  const { data: tiposPago = [] } = useQuery({
    queryKey: ['tipos-pago', 'activos'],
    queryFn: () => cuentasApi.getTiposPagoActivos().then(r => r.data.data),
  });
  const { data: movimientos = [] } = useQuery({
    queryKey: ['movimientos', showMovs?.id, movDesde, movHasta],
    queryFn: () => fetchAllPages((p) => cuentasApi.getMovimientos({ cuentaId: showMovs!.id, desde: movDesde || undefined, hasta: movHasta || undefined, ...p }).then(r => r.data.data)),
    enabled: !!showMovs,
  });
  const movTotalPages = Math.ceil(movimientos.length / PAGE_SIZE);
  const movimientosPagina = movimientos.slice((movPage - 1) * PAGE_SIZE, movPage * PAGE_SIZE);
  // P7: detalle del movimiento seleccionado (incluye "origen del movimiento")
  const { data: detalleMov, isLoading: loadingDetalleMov } = useQuery({
    queryKey: ['movimiento-detalle', viewingMov?.id],
    queryFn: () => cuentasApi.obtenerMovimiento(viewingMov!.id).then(r => r.data.data),
    enabled: !!viewingMov,
  });

  const createC = useMutation({
    mutationFn: () => cuentasApi.createCuenta({ nombre: form.nombre, tipoCuenta: form.tipoCuenta, monedaId: parseInt(form.monedaId), saldoInicial: form.saldoInicial ? parseFloat(form.saldoInicial) : 0, descripcion: form.descripcion, banco: form.banco }),
    onSuccess: () => { toast.success('Cuenta creada'); setShowForm(false); setForm({}); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const updateC = useMutation({
    mutationFn: (data: any) => cuentasApi.updateCuenta(editing!.id, data),
    onSuccess: () => { toast.success('Actualizado'); setEditing(null); setForm({}); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const deleteC = useMutation({
    mutationFn: (id: number) => cuentasApi.deleteCuenta(id),
    onSuccess: () => { toast.success('Cuenta eliminada'); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  const movMutation = useMutation({
    mutationFn: () => cuentasApi.registrarMovimiento({
      cuentaId: showNuevoMov!.id,
      tipo: form.tipo as 'INGRESO' | 'EGRESO',
      monto: parseFloat(form.monto),
      monedaId: showNuevoMov!.monedaId,
      tipoPagoId: form.tipoPagoId ? parseInt(form.tipoPagoId) : undefined,
      concepto: form.concepto,
      referencia: form.referencia,
    }),
    onSuccess: () => { toast.success('Movimiento registrado'); setShowNuevoMov(null); setForm({}); inv(); invMovs(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  // P7: edición controlada (concepto, referencia, fecha, método de pago — no afecta saldo)
  const editarMovMutation = useMutation({
    mutationFn: () => cuentasApi.actualizarMovimiento(editingMov!.id, {
      concepto: movEditForm.concepto,
      referencia: movEditForm.referencia,
      fecha: movEditForm.fecha,
      tipoPagoId: movEditForm.tipoPagoId ? parseInt(movEditForm.tipoPagoId) : null,
    }),
    onSuccess: () => { toast.success('Movimiento actualizado'); setEditingMov(null); setMovEditForm({}); invMovs(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
  // P7: anular — revierte el saldo (movimiento REVERSO) y mantiene trazabilidad
  const anularMovMutation = useMutation({
    mutationFn: (id: number) => cuentasApi.anularMovimiento(id),
    onSuccess: () => { toast.success('Movimiento anulado'); setAnulandoMov(null); inv(); invMovs(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const openEdit = (c: CuentaDinero) => {
    setEditing(c);
    setForm({ nombre: c.nombre, tipoCuenta: c.tipoCuenta, monedaId: String(c.monedaId), descripcion: c.descripcion ?? '', banco: c.banco ?? '' });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{cuentas.length} cuentas configuradas</p>
        <Button size="sm" onClick={() => { setShowForm(true); setForm({ tipoCuenta: 'CAJA' }); }}><Plus className="w-4 h-4" /> Nueva cuenta</Button>
      </div>

      {isLoading ? <TableSkeleton rows={4} cols={6} /> : (
        <Table>
          <thead><tr><Th>Cuenta</Th><Th>Tipo</Th><Th>Moneda</Th><Th>Saldo actual</Th><Th>Activo</Th><Th className="text-right">Acciones</Th></tr></thead>
          <tbody>
            {cuentas.length > 0 ? cuentas.map(c => (
              <Tr key={c.id}>
                <Td>
                  <div>
                    <p className="text-sm font-semibold">{c.nombre}</p>
                    {c.banco && <p className="text-xs text-muted-foreground">{c.banco}{c.numeroCuenta ? ` · ${c.numeroCuenta}` : ''}</p>}
                  </div>
                </Td>
                <Td><TipoCuentaBadge tipo={c.tipoCuenta} /></Td>
                <Td><MonedaBadge codigo={c.moneda?.codigo ?? 'PEN'} simbolo={c.moneda?.simbolo} /></Td>
                <Td>
                  <span className={`font-bold text-sm ${Number(c.saldoActual) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>
                    {c.moneda?.simbolo ?? 'S/'} {Number(c.saldoActual).toFixed(2)}
                  </span>
                </Td>
                <Td><Switch checked={c.activo} onChange={v => { setEditing(c); updateC.mutate({ activo: v }); }} /></Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => { setShowNuevoMov(c); setForm({ tipo: 'INGRESO' }); }} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-emerald-500 transition-all" title="Nuevo movimiento"><ArrowUpCircle className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { setShowMovs(c); setMovPage(1); }} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver movimientos"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
                    <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => { if (confirm(`¿Eliminar "${c.nombre}"?`)) deleteC.mutate(c.id); }} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={6}><EmptyState message="Sin cuentas. Presiona 'Inicializar defaults' o crea una." /></td></tr>}
          </tbody>
        </Table>
      )}

      {/* Create/Edit cuenta */}
      <Modal open={showForm || !!editing} onClose={() => { setShowForm(false); setEditing(null); setForm({}); }} title={editing ? 'Editar cuenta' : 'Nueva cuenta'}>
        <div className="flex flex-col gap-4">
          <FormField label="Nombre" required><Input placeholder="Caja Soles, Banco BCP..." value={form.nombre ?? ''} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Tipo de cuenta" required>
              <Select value={form.tipoCuenta ?? 'CAJA'} onChange={e => setForm(p => ({ ...p, tipoCuenta: e.target.value }))}>
                <option value="CAJA">Caja</option>
                <option value="BANCO">Banco</option>
                <option value="DIGITAL">Digital</option>
              </Select>
            </FormField>
            <FormField label="Moneda" required>
              <Select value={form.monedaId ?? ''} onChange={e => setForm(p => ({ ...p, monedaId: e.target.value }))}>
                <option value="">Seleccionar...</option>
                {monedas.map(m => <option key={m.id} value={m.id}>{m.simbolo} {m.codigo}</option>)}
              </Select>
            </FormField>
          </div>
          {!editing && <FormField label="Saldo inicial"><Input type="number" step="0.01" placeholder="0.00" value={form.saldoInicial ?? ''} onChange={e => setForm(p => ({ ...p, saldoInicial: e.target.value }))} /></FormField>}
          <FormField label="Banco / Entidad"><Input placeholder="BCP, BBVA, Interbank..." value={form.banco ?? ''} onChange={e => setForm(p => ({ ...p, banco: e.target.value }))} /></FormField>
          <FormField label="Descripción"><Input placeholder="Notas..." value={form.descripcion ?? ''} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null); setForm({}); }}>Cancelar</Button>
            <Button loading={createC.isPending || updateC.isPending} onClick={() => editing ? updateC.mutate({ nombre: form.nombre, tipoCuenta: form.tipoCuenta, monedaId: form.monedaId ? parseInt(form.monedaId) : undefined, descripcion: form.descripcion, banco: form.banco }) : createC.mutate()}>
              {editing ? 'Guardar' : 'Crear cuenta'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Movimientos de la cuenta */}
      <Modal open={!!showMovs} onClose={() => setShowMovs(null)} title={`Movimientos — ${showMovs?.nombre}`} maxWidth="max-w-3xl">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-lg p-3 text-center">
            <div><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="font-semibold">{showMovs?.moneda?.simbolo} {Number(showMovs?.saldoInicial ?? 0).toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">Saldo actual</p><p className={`font-bold ${Number(showMovs?.saldoActual ?? 0) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{showMovs?.moneda?.simbolo} {Number(showMovs?.saldoActual ?? 0).toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">Movimientos</p><p className="font-semibold">{movimientos.length}</p></div>
          </div>
          {/* P7: filtros de fecha — predeterminado hoy, configurable */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Desde"><Input type="date" value={movDesde} onChange={e => { setMovDesde(e.target.value); setMovPage(1); }} /></FormField>
            <FormField label="Hasta"><Input type="date" value={movHasta} onChange={e => { setMovHasta(e.target.value); setMovPage(1); }} /></FormField>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Concepto</Th><Th>Método</Th><Th className="text-right">Monto</Th><Th className="text-right">Acciones</Th></tr></thead>
              <tbody>
                {movimientosPagina.length > 0 ? movimientosPagina.map(m => (
                  <Tr key={m.id}>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(m.fecha)}</span></Td>
                    <Td>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.tipo === 'INGRESO' ? 'text-emerald-500' : 'text-red-500'}`}>
                        {m.tipo === 'INGRESO' ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />}
                        {m.tipo}
                      </span>
                    </Td>
                    <Td>
                      <span className={`text-sm ${m.anulado ? 'line-through text-muted-foreground' : ''}`}>{m.concepto}</span>
                      {m.anulado && (
                        <span className="ml-2 text-[10px] font-medium text-red-600 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20">ANULADO</span>
                      )}
                    </Td>
                    <Td><span className="text-xs text-muted-foreground">{m.tipoPago?.nombre ?? '—'}</span></Td>
                    <Td className="text-right">
                      <span className={`font-semibold text-sm ${m.anulado ? 'line-through text-muted-foreground' : (m.tipo === 'INGRESO' ? 'text-emerald-500' : 'text-red-500')}`}>
                        {m.tipo === 'INGRESO' ? '+' : '-'}{m.moneda?.simbolo} {Number(m.monto).toFixed(2)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setViewingMov(m)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver detalle"><Eye className="w-3.5 h-3.5" /></button>
                        {!m.anulado && !(m.referencia ?? '').startsWith('REV-MOV-') && (
                          <>
                            <button onClick={() => { setEditingMov(m); setMovEditForm({ concepto: m.concepto, referencia: m.referencia ?? '', fecha: m.fecha.split('T')[0], tipoPagoId: m.tipoPagoId ? String(m.tipoPagoId) : '' }); }} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Editar"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => setAnulandoMov(m)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all" title="Anular"><Ban className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={6}><EmptyState message="Sin movimientos en el rango seleccionado" /></td></tr>}
              </tbody>
            </Table>
          </div>
          <Pagination page={movPage} totalPages={movTotalPages} onChange={setMovPage} />
          <div className="flex justify-between pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => { setShowNuevoMov(showMovs); setShowMovs(null); setForm({ tipo: 'INGRESO' }); }}>
              <Plus className="w-3 h-3" /> Nuevo movimiento
            </Button>
            <Button variant="secondary" onClick={() => setShowMovs(null)}>Cerrar</Button>
          </div>
        </div>
      </Modal>

      {/* P7: Ver detalle del movimiento */}
      <Modal open={!!viewingMov} onClose={() => setViewingMov(null)} title="Detalle del movimiento">
        {loadingDetalleMov || !detalleMov ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Cargando...</p>
        ) : (
          <div className="flex flex-col gap-4">
            {detalleMov.anulado && (
              <div className="text-xs font-medium text-red-600 bg-red-500/10 px-3 py-2 rounded border border-red-500/20">
                Este movimiento está ANULADO. Se generó un movimiento de reverso (REV-MOV-{detalleMov.id}) que revirtió su efecto en el saldo.
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs text-muted-foreground">Tipo</p>
                <span className={`inline-flex items-center gap-1 text-sm font-medium ${detalleMov.tipo === 'INGRESO' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {detalleMov.tipo === 'INGRESO' ? <ArrowUpCircle className="w-3.5 h-3.5" /> : <ArrowDownCircle className="w-3.5 h-3.5" />}
                  {detalleMov.tipo}
                </span>
              </div>
              <div><p className="text-xs text-muted-foreground">Cuenta</p><p className="text-sm font-semibold">{detalleMov.cuenta?.nombre}</p></div>
              <div><p className="text-xs text-muted-foreground">Moneda</p><p className="text-sm font-semibold">{detalleMov.moneda?.simbolo} {detalleMov.moneda?.codigo}</p></div>
              <div><p className="text-xs text-muted-foreground">Usuario</p><p className="text-sm font-semibold">{detalleMov.usuario?.nombre}</p></div>
              <div><p className="text-xs text-muted-foreground">Fecha</p><p className="text-sm font-semibold">{formatDatetime(detalleMov.fecha)}</p></div>
              <div><p className="text-xs text-muted-foreground">Monto</p>
                <p className={`text-sm font-bold ${detalleMov.tipo === 'INGRESO' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {detalleMov.tipo === 'INGRESO' ? '+' : '-'}{detalleMov.moneda?.simbolo} {Number(detalleMov.monto).toFixed(2)}
                </p>
              </div>
            </div>
            <div><p className="text-xs text-muted-foreground">Concepto</p><p className="text-sm">{detalleMov.concepto}</p></div>
            <div><p className="text-xs text-muted-foreground">Referencia</p><p className="text-sm">{detalleMov.referencia || '—'}</p></div>
            <div><p className="text-xs text-muted-foreground">Origen del movimiento</p><p className="text-sm font-medium">{detalleMov.origen}</p></div>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setViewingMov(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* P7: Editar movimiento (edición controlada — no afecta saldo) */}
      <Modal open={!!editingMov} onClose={() => { setEditingMov(null); setMovEditForm({}); }} title="Editar movimiento">
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">El monto, tipo y cuenta no son editables porque afectan el saldo. Para corregirlos, anula el movimiento y registra uno nuevo.</p>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Fecha"><Input type="date" value={movEditForm.fecha ?? ''} onChange={e => setMovEditForm(p => ({ ...p, fecha: e.target.value }))} /></FormField>
            <FormField label="Método de pago">
              <Select value={movEditForm.tipoPagoId ?? ''} onChange={e => setMovEditForm(p => ({ ...p, tipoPagoId: e.target.value }))}>
                <option value="">Sin especificar</option>
                {tiposPago.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Concepto" required><Input placeholder="Descripción del movimiento" value={movEditForm.concepto ?? ''} onChange={e => setMovEditForm(p => ({ ...p, concepto: e.target.value }))} /></FormField>
          <FormField label="Referencia"><Input placeholder="N° voucher, transferencia..." value={movEditForm.referencia ?? ''} onChange={e => setMovEditForm(p => ({ ...p, referencia: e.target.value }))} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setEditingMov(null); setMovEditForm({}); }}>Cancelar</Button>
            <Button loading={editarMovMutation.isPending} onClick={() => editarMovMutation.mutate()}>Guardar cambios</Button>
          </div>
        </div>
      </Modal>

      {/* P7: Confirmar anulación — revierte el saldo y mantiene trazabilidad */}
      <Modal open={!!anulandoMov} onClose={() => setAnulandoMov(null)} title="Anular movimiento">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            ¿Confirmas la anulación del movimiento <span className="font-semibold text-foreground">{anulandoMov?.concepto}</span> por <span className="font-semibold text-foreground">{anulandoMov?.moneda?.simbolo} {Number(anulandoMov?.monto ?? 0).toFixed(2)}</span>?
          </p>
          <p className="text-xs text-muted-foreground">Se generará un movimiento de reverso que revertirá el efecto en el saldo de la cuenta, manteniendo la trazabilidad. El movimiento original quedará marcado como anulado.</p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => setAnulandoMov(null)}>Cancelar</Button>
            <Button variant="destructive" loading={anularMovMutation.isPending} onClick={() => anularMovMutation.mutate(anulandoMov!.id)}>Confirmar anulación</Button>
          </div>
        </div>
      </Modal>

      {/* Nuevo movimiento */}
      <Modal open={!!showNuevoMov} onClose={() => { setShowNuevoMov(null); setForm({}); }} title={`Nuevo movimiento — ${showNuevoMov?.nombre}`}>
        <div className="flex flex-col gap-4">
          <FormField label="Tipo" required>
            <Select value={form.tipo ?? 'INGRESO'} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}>
              <option value="INGRESO">Ingreso</option>
              <option value="EGRESO">Egreso</option>
            </Select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Monto" required><Input type="number" step="0.01" placeholder="0.00" value={form.monto ?? ''} onChange={e => setForm(p => ({ ...p, monto: e.target.value }))} /></FormField>
            <FormField label="Método de pago">
              <Select value={form.tipoPagoId ?? ''} onChange={e => setForm(p => ({ ...p, tipoPagoId: e.target.value }))}>
                <option value="">Sin especificar</option>
                {tiposPago.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </Select>
            </FormField>
          </div>
          <FormField label="Concepto" required><Input placeholder="Descripción del movimiento" value={form.concepto ?? ''} onChange={e => setForm(p => ({ ...p, concepto: e.target.value }))} /></FormField>
          <FormField label="Referencia"><Input placeholder="N° voucher, transferencia..." value={form.referencia ?? ''} onChange={e => setForm(p => ({ ...p, referencia: e.target.value }))} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowNuevoMov(null); setForm({}); }}>Cancelar</Button>
            <Button loading={movMutation.isPending} onClick={() => movMutation.mutate()}>Registrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
