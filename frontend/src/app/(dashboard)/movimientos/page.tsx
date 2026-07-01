// FILE: src/app/(dashboard)/movimientos/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Upload, Plus, Eye, XCircle, Link2, Unlink, FileSpreadsheet, AlertTriangle,
} from 'lucide-react';
import { movimientosApi, cuentasApi, clientesApi } from '@/services/api';
import { CuentaSelector, MonedaSelector, TipoPagoSelector } from '@/components/shared/FinancialSelectors';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge,
  Modal, FormField, Input, Select, Textarea, StatCard,
  TableSkeleton, EmptyState,
} from '@/components/shared';
import { formatCurrency, formatDate, getErrorMessage } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { parseExcelMovimientos, type FilaMovimientoImportado } from '@/lib/parseExcelMovimientos';
import type { MovimientoCuenta, MovimientoCuentaDetalle, MovimientoCobranza } from '@/types';

type Tab = 'INGRESO' | 'EGRESO';

export default function MovimientosPage() {
  const { usuario } = useAuthStore();
  const queryClient = useQueryClient();
  const esAdmin = usuario?.rol === 'ADMIN';

  const [tab, setTab] = useState<Tab>('INGRESO');
  const hoy = new Date().toISOString().split('T')[0];
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [cuentaId, setCuentaId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [viewingId, setViewingId] = useState<number | null>(null);
  const [showRegistrar, setShowRegistrar] = useState(false);
  const [showImportar, setShowImportar] = useState(false);
  const [cobranzaMov, setCobranzaMov] = useState<MovimientoCuenta | null>(null);

  const params = {
    tipo: tab,
    cuentaId: cuentaId ? parseInt(cuentaId) : undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    search: search || undefined,
    page,
    limit: 20,
  };

  const { data: lista, isLoading } = useQuery({
    queryKey: ['movimientos', params],
    queryFn: () => movimientosApi.listar(params).then((r) => r.data.data),
  });

  const { data: resumen } = useQuery({
    queryKey: ['movimientos', 'resumen', desde, hasta, cuentaId],
    queryFn: () => movimientosApi.resumen({ desde: desde || undefined, hasta: hasta || undefined, cuentaId: cuentaId ? parseInt(cuentaId) : undefined }).then((r) => r.data.data),
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas', true],
    queryFn: () => cuentasApi.getCuentas({ activo: true }).then((r) => r.data.data).catch(() => []),
  });

  const { data: viewing } = useQuery({
    queryKey: ['movimientos', 'detalle', viewingId],
    queryFn: () => movimientosApi.obtener(viewingId!).then((r) => r.data.data),
    enabled: !!viewingId,
  });

  const inv = () => {
    queryClient.invalidateQueries({ queryKey: ['movimientos'] });
  };

  // ── Registrar movimiento manual ──────────────────────────────────────────
  const [formRegistrar, setFormRegistrar] = useState<Record<string, string>>({});
  const crearMutation = useMutation({
    mutationFn: () => movimientosApi.crear({
      cuentaId: parseInt(formRegistrar.cuentaId),
      tipo: tab,
      monto: parseFloat(formRegistrar.monto),
      monedaId: parseInt(formRegistrar.monedaId),
      tipoPagoId: formRegistrar.tipoPagoId ? parseInt(formRegistrar.tipoPagoId) : undefined,
      concepto: formRegistrar.concepto,
      referencia: formRegistrar.referencia || undefined,
      fecha: formRegistrar.fecha || undefined,
    }),
    onSuccess: () => { toast.success('Movimiento registrado'); setShowRegistrar(false); setFormRegistrar({}); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ── Anular ────────────────────────────────────────────────────────────────
  const anularMutation = useMutation({
    mutationFn: (id: number) => movimientosApi.anular(id),
    onSuccess: () => { toast.success('Movimiento anulado'); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ── Importar Excel ───────────────────────────────────────────────────────
  const [importCuentaId, setImportCuentaId] = useState('');
  const [filas, setFilas] = useState<FilaMovimientoImportado[]>([]);
  const [parseando, setParseando] = useState(false);

  const cuentaImport = cuentas.find((c: any) => String(c.id) === importCuentaId);

  const handleFile = async (file: File) => {
    setParseando(true);
    try {
      const resultado = await parseExcelMovimientos(file);
      setFilas(resultado);
    } catch (e) {
      toast.error('No se pudo leer el archivo. Verifica que sea un Excel válido.');
    } finally {
      setParseando(false);
    }
  };

  const filasValidas = filas.filter((f) => !f.error);
  const filasConError = filas.filter((f) => f.error);

  const importarMutation = useMutation({
    mutationFn: () => {
      if (!cuentaImport) throw new Error('Selecciona una cuenta válida');
      return movimientosApi.importarExcel({
        cuentaId: parseInt(importCuentaId),
        monedaId: cuentaImport.monedaId,
        filas: filasValidas.map((f) => ({ fecha: f.fecha, descripcion: f.descripcion, monto: f.monto, tipo: f.tipo, referencia: f.referencia })),
      });
    },
    onSuccess: (r) => {
      const { creados, errores } = r.data.data;
      if (errores.length > 0) {
        toast.warning(`${creados} movimiento(s) importado(s). ${errores.length} fila(s) con error.`);
      } else {
        toast.success(`${creados} movimiento(s) importado(s) correctamente`);
      }
      setShowImportar(false); setFilas([]); setImportCuentaId('');
      inv();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ── Vincular cobranza ─────────────────────────────────────────────────────
  const [modoCobranza, setModoCobranza] = useState<'FACTURA' | 'OTRO'>('FACTURA');
  const [clienteIdCobranza, setClienteIdCobranza] = useState('');
  const [facturaIdCobranza, setFacturaIdCobranza] = useState('');
  const [observacionCobranza, setObservacionCobranza] = useState('');

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', 'activos-cobranza'],
    queryFn: () => clientesApi.listar({ activo: true, limit: 100 }).then((r) => r.data.data.items).catch(() => []),
    enabled: !!cobranzaMov,
  });

  const { data: facturasCliente = [] } = useQuery({
    queryKey: ['movimientos', 'facturas-cliente', clienteIdCobranza],
    queryFn: () => movimientosApi.facturasPorCliente(parseInt(clienteIdCobranza)).then((r) => r.data.data),
    enabled: !!clienteIdCobranza && modoCobranza === 'FACTURA',
  });

  const cerrarCobranza = () => {
    setCobranzaMov(null); setClienteIdCobranza(''); setFacturaIdCobranza('');
    setObservacionCobranza(''); setModoCobranza('FACTURA');
  };

  const vincularMutation = useMutation({
    mutationFn: () => movimientosApi.vincularCobranza(cobranzaMov!.id, {
      clienteId: parseInt(clienteIdCobranza),
      facturaId: modoCobranza === 'FACTURA' ? parseInt(facturaIdCobranza) : undefined,
      observacion: modoCobranza === 'OTRO' ? observacionCobranza : undefined,
    }),
    onSuccess: () => { toast.success('Cobranza vinculada'); cerrarCobranza(); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const desvincularMutation = useMutation({
    mutationFn: (id: number) => movimientosApi.desvincularCobranza(id),
    onSuccess: () => { toast.success('Cobranza desvinculada'); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = lista?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        title="Movimientos"
        description="Ingresos y egresos de las cuentas, importación bancaria y cobranza"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowImportar(true)}>
              <Upload className="w-4 h-4" /> Importar Excel
            </Button>
            <Button onClick={() => setShowRegistrar(true)}>
              <Plus className="w-4 h-4" /> Registrar {tab === 'INGRESO' ? 'ingreso' : 'egreso'}
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {(['INGRESO', 'EGRESO'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'INGRESO' ? 'Ingresos' : 'Egresos'}
          </button>
        ))}
      </div>

      {/* Stat cards */}
      {resumen && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total ingresos" value={formatCurrency(resumen.totalIngresos)} color="green" />
          <StatCard label="Total egresos" value={formatCurrency(resumen.totalEgresos)} color="red" />
          <StatCard label="Saldo neto" value={formatCurrency(resumen.saldoNeto)} color={resumen.saldoNeto >= 0 ? 'green' : 'red'} />
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <FormField label="Desde"><Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} /></FormField>
        <FormField label="Hasta"><Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} /></FormField>
        <FormField label="Cuenta">
          <CuentaSelector placeholder="Todas" value={cuentaId} onChange={(e) => { setCuentaId(e.target.value); setPage(1); }} />
        </FormField>
        <FormField label="Buscar">
          <Input placeholder="Concepto o referencia..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </FormField>
      </div>

      {/* Tabla */}
      {isLoading ? <TableSkeleton rows={8} cols={tab === 'INGRESO' ? 6 : 5} /> : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th>Cuenta</Th>
              <Th className="text-right">Monto</Th>
              {tab === 'INGRESO' && <Th>Cobranza</Th>}
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((m: MovimientoCuenta) => (
              <Tr key={m.id}>
                <Td><span className="text-sm">{formatDate(m.fecha)}</span></Td>
                <Td><span className="text-sm font-medium">{m.concepto}</span>{m.anulado && <Badge value="ANULADA" label="Anulado" />}</Td>
                <Td><span className="text-xs text-muted-foreground">{m.cuenta?.nombre}</span></Td>
                <Td className="text-right">
                  <span className={`font-semibold ${tab === 'INGRESO' ? 'text-emerald-500' : 'text-destructive'}`}>
                    {formatCurrency(Number(m.monto))}
                  </span>
                </Td>
                {tab === 'INGRESO' && (
                  <Td>
                    {m.cobranza && !m.cobranza.anulado ? (
                      <span className="text-xs text-muted-foreground">
                        {m.cobranza.factura
                          ? `${m.cobranza.cliente.razonSocial} — Fact. ${m.cobranza.factura.numeroFactura}`
                          : `${m.cobranza.cliente.razonSocial} — Otro ingreso`}
                      </span>
                    ) : (
                      <button
                        onClick={() => setCobranzaMov(m)}
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Link2 className="w-3 h-3" /> Vincular cobranza
                      </button>
                    )}
                  </Td>
                )}
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewingId(m.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {esAdmin && !m.anulado && (
                      <button
                        onClick={() => { if (confirm('¿Anular este movimiento? Se revertirá el saldo de la cuenta.')) anularMutation.mutate(m.id); }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </Td>
              </Tr>
            )) : <tr><td colSpan={6}><EmptyState message={`Sin ${tab === 'INGRESO' ? 'ingresos' : 'egresos'} en el período`} /></td></tr>}
          </tbody>
        </Table>
      )}

      {lista && lista.total > 20 && (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <Button variant="secondary" size="sm" disabled={page * 20 >= lista.total} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
        </div>
      )}

      {/* Modal: Registrar movimiento manual */}
      <Modal open={showRegistrar} onClose={() => { setShowRegistrar(false); setFormRegistrar({}); }} title={`Registrar ${tab === 'INGRESO' ? 'ingreso' : 'egreso'}`}>
        <div className="flex flex-col gap-4">
          <FormField label="Cuenta" required>
            <CuentaSelector placeholder="Selecciona una cuenta" value={formRegistrar.cuentaId ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, cuentaId: e.target.value }))} />
          </FormField>
          <FormField label="Moneda" required>
            <MonedaSelector placeholder="Selecciona una moneda" value={formRegistrar.monedaId ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, monedaId: e.target.value }))} />
          </FormField>
          <FormField label="Monto" required>
            <Input type="number" step="0.01" min="0.01" value={formRegistrar.monto ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, monto: e.target.value }))} />
          </FormField>
          <FormField label="Concepto" required>
            <Input placeholder="Descripción del movimiento" value={formRegistrar.concepto ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, concepto: e.target.value }))} />
          </FormField>
          <FormField label="Método de pago">
            <TipoPagoSelector placeholder="Opcional" value={formRegistrar.tipoPagoId ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, tipoPagoId: e.target.value }))} />
          </FormField>
          <FormField label="Referencia"><Input value={formRegistrar.referencia ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, referencia: e.target.value }))} /></FormField>
          <FormField label="Fecha"><Input type="date" value={formRegistrar.fecha ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, fecha: e.target.value }))} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowRegistrar(false); setFormRegistrar({}); }}>Cancelar</Button>
            <Button
              loading={crearMutation.isPending}
              disabled={!formRegistrar.cuentaId || !formRegistrar.monedaId || !formRegistrar.monto || !formRegistrar.concepto}
              onClick={() => crearMutation.mutate()}
            >
              Registrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Importar Excel */}
      <Modal
        open={showImportar}
        onClose={() => { setShowImportar(false); setFilas([]); setImportCuentaId(''); }}
        title="Importar movimientos desde Excel"
        maxWidth="max-w-3xl"
      >
        <div className="flex flex-col gap-4">
          <FormField label="Cuenta bancaria" required hint="Los movimientos importados se aplicarán a esta cuenta">
            <CuentaSelector placeholder="Selecciona una cuenta" value={importCuentaId} onChange={(e) => setImportCuentaId(e.target.value)} />
          </FormField>
          <FormField label="Archivo Excel" required hint="Columnas esperadas: Fecha, Descripción, Monto, Tipo (INGRESO/EGRESO)">
            <input
              type="file"
              accept=".xlsx,.xls"
              disabled={!importCuentaId}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              className="text-sm"
            />
          </FormField>

          {parseando && <p className="text-sm text-muted-foreground">Leyendo archivo…</p>}

          {filas.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-emerald-500 font-medium">{filasValidas.length} fila(s) válida(s)</span>
                {filasConError.length > 0 && (
                  <span className="text-destructive font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> {filasConError.length} fila(s) con error (se omitirán)
                  </span>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                <Table>
                  <thead>
                    <tr><Th>Fila</Th><Th>Fecha</Th><Th>Descripción</Th><Th>Tipo</Th><Th className="text-right">Monto</Th></tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <Tr key={f.fila} className={f.error ? 'opacity-60' : ''}>
                        <Td><span className="text-xs">{f.fila}</span></Td>
                        <Td><span className="text-xs">{f.fecha || '—'}</span></Td>
                        <Td><span className="text-xs">{f.descripcion || '—'}{f.error && <span className="block text-destructive">{f.error}</span>}</span></Td>
                        <Td><span className="text-xs">{f.tipo}</span></Td>
                        <Td className="text-right"><span className="text-xs">{f.monto ? formatCurrency(f.monto) : '—'}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowImportar(false); setFilas([]); setImportCuentaId(''); }}>Cancelar</Button>
            <Button
              loading={importarMutation.isPending}
              disabled={!importCuentaId || filasValidas.length === 0}
              onClick={() => importarMutation.mutate()}
            >
              <FileSpreadsheet className="w-4 h-4" /> Importar {filasValidas.length || ''} movimiento(s)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Vincular cobranza */}
      <Modal open={!!cobranzaMov} onClose={cerrarCobranza} title="Vincular cobranza">
        {cobranzaMov && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">Ingreso: <span className="font-medium text-foreground">{cobranzaMov.concepto}</span></p>
              <p className="text-muted-foreground">Monto: <span className="font-semibold text-emerald-500">{formatCurrency(Number(cobranzaMov.monto))}</span></p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setModoCobranza('FACTURA')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${modoCobranza === 'FACTURA' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
              >
                Cliente + Factura
              </button>
              <button
                onClick={() => setModoCobranza('OTRO')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${modoCobranza === 'OTRO' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}
              >
                Solo cliente (préstamo / otro)
              </button>
            </div>

            <FormField label="Cliente" required>
              <Select value={clienteIdCobranza} onChange={(e) => { setClienteIdCobranza(e.target.value); setFacturaIdCobranza(''); }}>
                <option value="">Selecciona un cliente</option>
                {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.razonSocial} — {c.ruc}</option>)}
              </Select>
            </FormField>

            {modoCobranza === 'FACTURA' ? (
              <FormField label="Factura" required hint="Solo se muestran facturas con saldo pendiente">
                <Select value={facturaIdCobranza} onChange={(e) => setFacturaIdCobranza(e.target.value)} disabled={!clienteIdCobranza}>
                  <option value="">Selecciona una factura</option>
                  {facturasCliente.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.numeroFactura} — Saldo: {formatCurrency(f.saldoPendiente)}</option>
                  ))}
                </Select>
              </FormField>
            ) : (
              <FormField label="Observación" required hint="Ej: préstamo, adelanto, devolución...">
                <Textarea value={observacionCobranza} onChange={(e) => setObservacionCobranza(e.target.value)} placeholder="Motivo del ingreso..." />
              </FormField>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={cerrarCobranza}>Cancelar</Button>
              <Button
                loading={vincularMutation.isPending}
                disabled={!clienteIdCobranza || (modoCobranza === 'FACTURA' ? !facturaIdCobranza : !observacionCobranza.trim())}
                onClick={() => vincularMutation.mutate()}
              >
                Vincular
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Detalle */}
      <Modal open={!!viewingId} onClose={() => setViewingId(null)} title="Detalle del movimiento">
        {viewing && (
          <div className="flex flex-col gap-3 text-sm">
            <Detalle label="Fecha" value={formatDate(viewing.fecha)} />
            <Detalle label="Concepto" value={viewing.concepto} />
            <Detalle label="Cuenta" value={viewing.cuenta?.nombre} />
            <Detalle label="Moneda" value={viewing.moneda?.simbolo} />
            <Detalle label="Monto" value={formatCurrency(Number(viewing.monto))} />
            <Detalle label="Método de pago" value={viewing.tipoPago?.nombre ?? '—'} />
            <Detalle label="Referencia" value={viewing.referencia ?? '—'} />
            <Detalle label="Registrado por" value={viewing.usuario?.nombre} />
            <Detalle label="Origen" value={viewing.origen} />
            <Detalle label="Estado" value={viewing.anulado ? 'Anulado' : 'Activo'} />

            {viewing.cobranza && (
              <div className="border-t border-border pt-3 mt-1 flex flex-col gap-2">
                <p className="font-semibold">Cobranza vinculada</p>
                <Detalle label="Cliente" value={viewing.cobranza.cliente?.razonSocial} />
                {viewing.cobranza.factura ? (
                  <Detalle label="Factura" value={viewing.cobranza.factura.numeroFactura} />
                ) : (
                  <Detalle label="Observación" value={viewing.cobranza.observaciones ?? '—'} />
                )}
                {esAdmin && !viewing.cobranza.anulado && (
                  <Button
                    variant="secondary" size="sm"
                    loading={desvincularMutation.isPending}
                    onClick={() => { if (confirm('¿Desvincular esta cobranza?')) desvincularMutation.mutate(viewing.id); }}
                  >
                    <Unlink className="w-3.5 h-3.5" /> Desvincular cobranza
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Detalle({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value ?? '—'}</span>
    </div>
  );
}
