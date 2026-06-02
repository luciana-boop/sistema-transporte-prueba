// FILE: src/app/(dashboard)/configuracion/CuentasTabs.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, ArrowUpCircle, ArrowDownCircle, ArrowLeftRight } from 'lucide-react';
import { cuentasApi } from '@/services/api';
import { formatDate, getErrorMessage } from '@/lib/utils';
import {
  Button, Table, Th, Td, Tr, TableSkeleton, EmptyState,
  Modal, FormField, Input, Select, Textarea,
} from '@/components/shared';
import { MonedaBadge, TipoCuentaBadge } from '@/components/shared/FinancialSelectors';
import type { Moneda, TipoPago, CuentaDinero } from '@/types';

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
                <Td><Switch checked={m.activo} onChange={v => updateM.mutate({ activo: v })} /></Td>
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
  const inv = () => qc.invalidateQueries({ queryKey: ['cuentas'] });

  const { data: cuentas = [], isLoading } = useQuery({
    queryKey: ['cuentas', false],
    queryFn: () => cuentasApi.getCuentas(false).then(r => r.data.data),
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
    queryKey: ['movimientos', showMovs?.id],
    queryFn: () => cuentasApi.getMovimientos({ cuentaId: showMovs!.id }).then(r => r.data.data),
    enabled: !!showMovs,
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
      tipo: form.tipo as 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA',
      monto: parseFloat(form.monto),
      monedaId: showNuevoMov!.monedaId,
      tipoPagoId: form.tipoPagoId ? parseInt(form.tipoPagoId) : undefined,
      concepto: form.concepto,
      referencia: form.referencia,
    }),
    onSuccess: () => { toast.success('Movimiento registrado'); setShowNuevoMov(null); setForm({}); inv(); qc.invalidateQueries({ queryKey: ['movimientos'] }); },
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
                    <button onClick={() => setShowMovs(c)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all" title="Ver movimientos"><ArrowLeftRight className="w-3.5 h-3.5" /></button>
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
      <Modal open={!!showMovs} onClose={() => setShowMovs(null)} title={`Movimientos — ${showMovs?.nombre}`} maxWidth="max-w-2xl">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-3 bg-muted/30 rounded-lg p-3 text-center">
            <div><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="font-semibold">{showMovs?.moneda?.simbolo} {Number(showMovs?.saldoInicial ?? 0).toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">Saldo actual</p><p className={`font-bold ${Number(showMovs?.saldoActual ?? 0) >= 0 ? 'text-emerald-500' : 'text-destructive'}`}>{showMovs?.moneda?.simbolo} {Number(showMovs?.saldoActual ?? 0).toFixed(2)}</p></div>
            <div><p className="text-xs text-muted-foreground">Movimientos</p><p className="font-semibold">{movimientos.length}</p></div>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <thead><tr><Th>Fecha</Th><Th>Tipo</Th><Th>Concepto</Th><Th>Método</Th><Th className="text-right">Monto</Th></tr></thead>
              <tbody>
                {movimientos.length > 0 ? movimientos.map(m => (
                  <Tr key={m.id}>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(m.fecha)}</span></Td>
                    <Td>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${m.tipo === 'INGRESO' ? 'text-emerald-500' : m.tipo === 'EGRESO' ? 'text-red-500' : 'text-blue-500'}`}>
                        {m.tipo === 'INGRESO' ? <ArrowUpCircle className="w-3 h-3" /> : m.tipo === 'EGRESO' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowLeftRight className="w-3 h-3" />}
                        {m.tipo}
                      </span>
                    </Td>
                    <Td><span className="text-sm">{m.concepto}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{m.tipoPago?.nombre ?? '—'}</span></Td>
                    <Td className="text-right">
                      <span className={`font-semibold text-sm ${m.tipo === 'INGRESO' ? 'text-emerald-500' : m.tipo === 'EGRESO' ? 'text-red-500' : 'text-foreground'}`}>
                        {m.tipo === 'INGRESO' ? '+' : m.tipo === 'EGRESO' ? '-' : ''}{m.moneda?.simbolo} {Number(m.monto).toFixed(2)}
                      </span>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={5}><EmptyState message="Sin movimientos" /></td></tr>}
              </tbody>
            </Table>
          </div>
          <div className="flex justify-between pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => { setShowNuevoMov(showMovs); setShowMovs(null); setForm({ tipo: 'INGRESO' }); }}>
              <Plus className="w-3 h-3" /> Nuevo movimiento
            </Button>
            <Button variant="secondary" onClick={() => setShowMovs(null)}>Cerrar</Button>
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
              <option value="TRANSFERENCIA">Transferencia entre cuentas</option>
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
