// FILE: src/app/(dashboard)/movimientos/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Upload, Plus, Eye, XCircle, FileSpreadsheet, AlertTriangle, Pencil,
} from 'lucide-react';
import { movimientosApi, cuentasApi, clientesApi, configuracionApi } from '@/services/api';
import { CuentaSelector, MonedaSelector, TipoPagoSelector } from '@/components/shared/FinancialSelectors';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge,
  Modal, FormField, Input, Select, Textarea, StatCard,
  TableSkeleton, EmptyState, AuditInfo, Pagination,
} from '@/components/shared';
import { formatCurrency, formatDate, getErrorMessage, PAGE_SIZE } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { parseExcelMovimientos, type FilaMovimientoImportado } from '@/lib/parseExcelMovimientos';
import type { MovimientoCuenta } from '@/types';

type Tab = 'INGRESO' | 'EGRESO';

const estadoCobranza = (m: MovimientoCuenta) => {
  if (!m.cobranza || m.cobranza.anulado) return null;
  const aplicado = (m.cobranza.aplicaciones ?? []).reduce((s, a) => s + Number(a.monto), 0);
  const pendiente = Number(m.cobranza.monto) - aplicado;
  if (pendiente <= 0.01) return { texto: 'Aplicado a factura(s)', pendiente: false };
  return { texto: 'Pendiente de aplicar', pendiente: true };
};

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

  const params = {
    tipo: tab,
    cuentaId: cuentaId ? parseInt(cuentaId) : undefined,
    desde: desde || undefined,
    hasta: hasta || undefined,
    search: search || undefined,
    page,
    limit: PAGE_SIZE,
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

  // Categorías de ingreso/egreso: configurables desde Configuración > Tablas Maestras
  const { data: categoriasEgreso = [] } = useQuery({
    queryKey: ['config', 'tabla', 'categoria_egreso'],
    queryFn: () => configuracionApi.getTablaMaestra('categoria_egreso').then((r) => r.data.data.filter((t) => t.activo)),
  });
  const { data: categoriasIngreso = [] } = useQuery({
    queryKey: ['config', 'tabla', 'categoria_ingreso'],
    queryFn: () => configuracionApi.getTablaMaestra('categoria_ingreso').then((r) => r.data.data.filter((t) => t.activo)),
  });
  const categoriaLabel = (v?: string | null) => categoriasEgreso.find((c) => c.codigo === v)?.nombre ?? v ?? '—';
  const categoriaIngresoLabel = (v?: string | null) => categoriasIngreso.find((c) => c.codigo === v)?.nombre ?? v ?? '—';

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

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', 'activos-ingreso'],
    queryFn: () => clientesApi.listar({ activo: true, limit: 100 }).then((r) => r.data.data.items).catch(() => []),
    enabled: showRegistrar && tab === 'INGRESO' && formRegistrar.categoriaIngreso === 'PAGO_FACTURA',
  });

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
      notaEgreso: tab === 'EGRESO' ? (formRegistrar.notaEgreso || undefined) : undefined,
      categoriaEgreso: tab === 'EGRESO' ? (formRegistrar.categoriaEgreso || undefined) : undefined,
      categoriaIngreso: tab === 'INGRESO' ? (formRegistrar.categoriaIngreso || undefined) : undefined,
      notaIngreso: tab === 'INGRESO' && formRegistrar.categoriaIngreso !== 'PAGO_FACTURA' ? (formRegistrar.notaIngreso || undefined) : undefined,
      clienteId: tab === 'INGRESO' && formRegistrar.categoriaIngreso === 'PAGO_FACTURA' && formRegistrar.clienteId ? parseInt(formRegistrar.clienteId) : undefined,
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

  // ── Editar movimiento (N° Operación; egreso: Categoría + Referencia; ingreso: Categoría + Cliente/Observación) ─
  const [editandoMov, setEditandoMov] = useState<MovimientoCuenta | null>(null);
  const [formReferencia, setFormReferencia] = useState('');
  const [formNotaEgreso, setFormNotaEgreso] = useState('');
  const [formCategoriaEgreso, setFormCategoriaEgreso] = useState('');
  const [formCategoriaIngreso, setFormCategoriaIngreso] = useState('');
  const [formClienteIdEdicion, setFormClienteIdEdicion] = useState('');
  const [formNotaIngreso, setFormNotaIngreso] = useState('');
  const cerrarEdicion = () => {
    setEditandoMov(null); setFormReferencia(''); setFormNotaEgreso(''); setFormCategoriaEgreso('');
    setFormCategoriaIngreso(''); setFormClienteIdEdicion(''); setFormNotaIngreso('');
  };

  const { data: clientesEdicion = [] } = useQuery({
    queryKey: ['clientes', 'activos-edicion-ingreso'],
    queryFn: () => clientesApi.listar({ activo: true, limit: 100 }).then((r) => r.data.data.items).catch(() => []),
    enabled: !!editandoMov && editandoMov.tipo === 'INGRESO' && formCategoriaIngreso === 'PAGO_FACTURA',
  });

  const editarMovimientoMutation = useMutation({
    mutationFn: () => movimientosApi.actualizar(editandoMov!.id, {
      referencia: formReferencia,
      ...(editandoMov!.tipo === 'EGRESO' ? { notaEgreso: formNotaEgreso, categoriaEgreso: formCategoriaEgreso || null } : {}),
      ...(editandoMov!.tipo === 'INGRESO' ? {
        categoriaIngreso: formCategoriaIngreso || null,
        clienteId: formCategoriaIngreso === 'PAGO_FACTURA' ? (formClienteIdEdicion ? parseInt(formClienteIdEdicion) : null) : null,
        notaIngreso: formCategoriaIngreso && formCategoriaIngreso !== 'PAGO_FACTURA' ? formNotaIngreso : null,
      } : {}),
    }),
    onSuccess: () => { toast.success('Movimiento actualizado'); cerrarEdicion(); inv(); },
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

  const cerrarImportar = () => { setShowImportar(false); setFilas([]); setImportCuentaId(''); };

  const formatoAdvertencia = (a: { motivo: string; existente?: { fecha: string; monto: number; concepto: string } }) =>
    `• ${a.motivo}${a.existente ? ` (movimiento existente: ${formatDate(a.existente.fecha)} — ${formatCurrency(a.existente.monto)} — ${a.existente.concepto})` : ''}`;

  const importarMutation = useMutation({
    mutationFn: (vars: { filas: typeof filasValidas; confirmarDuplicados?: boolean }) => {
      if (!cuentaImport) throw new Error('Selecciona una cuenta válida');
      return movimientosApi.importarExcel({
        cuentaId: parseInt(importCuentaId),
        monedaId: cuentaImport.monedaId,
        filas: vars.filas.map((f) => ({ fecha: f.fecha, descripcion: f.descripcion, monto: f.monto, tipo: f.tipo, referencia: f.referencia })),
        confirmarDuplicados: vars.confirmarDuplicados,
      });
    },
    onSuccess: (r, vars) => {
      const { creados, errores, bloqueados, advertencias } = r.data.data;

      if (bloqueados.length > 0) {
        toast.error(
          `${bloqueados.length} fila(s) no se importaron por N° de operación duplicado el mismo día:\n${bloqueados.map(formatoAdvertencia).join('\n')}`,
          { duration: 10000 },
        );
      }
      if (errores.length > 0) {
        toast.warning(`${errores.length} fila(s) con error, no se importaron.`);
      }

      if (advertencias.length > 0 && !vars.confirmarDuplicados) {
        const mensaje =
          `Los siguientes N° de operación ya existen pero en otra fecha (esto puede ser válido si el banco reutiliza números):\n\n` +
          advertencias.map(formatoAdvertencia).join('\n') +
          `\n\n¿Confirmas que quieres importarlos de todas formas?`;
        if (confirm(mensaje)) {
          const filasAdvertencia = advertencias.map((a) => vars.filas[a.fila - 1]);
          importarMutation.mutate({ filas: filasAdvertencia, confirmarDuplicados: true });
        }
      }

      if (creados > 0) toast.success(`${creados} movimiento(s) importado(s) correctamente`);

      if (advertencias.length === 0 || vars.confirmarDuplicados) {
        cerrarImportar();
      }
      inv();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const items = lista?.items ?? [];

  return (
    <div className="page-container">
      <PageHeader
        title="Movimientos"
        description="Ingresos y egresos de las cuentas e importación bancaria"
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
      {isLoading ? <TableSkeleton rows={8} cols={7} /> : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Concepto</Th>
              <Th>N° Operación</Th>
              {tab === 'EGRESO' && <Th>Categoría</Th>}
              {tab === 'EGRESO' && <Th>Referencia</Th>}
              {tab === 'INGRESO' && <Th>Categoría</Th>}
              <Th>Cuenta</Th>
              <Th className="text-right">Monto</Th>
              {tab === 'INGRESO' && <Th>Cobranza</Th>}
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {items.length ? items.map((m: MovimientoCuenta) => {
              const cobranzaEstado = estadoCobranza(m);
              return (
              <Tr key={m.id}>
                <Td><span className="text-sm">{formatDate(m.fecha)}</span></Td>
                <Td><span className="text-sm font-medium">{m.concepto}</span>{m.anulado && <Badge value="ANULADA" label="Anulado" />}</Td>
                <Td><span className="text-xs text-muted-foreground">{m.referencia || '—'}</span></Td>
                {tab === 'EGRESO' && <Td><span className="text-xs text-muted-foreground">{categoriaLabel(m.categoriaEgreso)}</span></Td>}
                {tab === 'EGRESO' && <Td><span className="text-xs text-muted-foreground">{m.notaEgreso || '—'}</span></Td>}
                {tab === 'INGRESO' && <Td><span className="text-xs text-muted-foreground">{categoriaIngresoLabel(m.categoriaIngreso) === '—' ? (m.notaIngreso || '—') : categoriaIngresoLabel(m.categoriaIngreso)}</span></Td>}
                <Td><span className="text-xs text-muted-foreground">{m.cuenta?.nombre}</span></Td>
                <Td className="text-right">
                  <span className={`font-semibold ${tab === 'INGRESO' ? 'text-emerald-500' : 'text-destructive'}`}>
                    {formatCurrency(Number(m.monto))}
                  </span>
                </Td>
                {tab === 'INGRESO' && (
                  <Td>
                    {cobranzaEstado ? (
                      <span className={`text-xs ${cobranzaEstado.pendiente ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {cobranzaEstado.texto} — {m.cobranza!.cliente.razonSocial}
                      </span>
                    ) : m.cajaCierre ? (
                      <span className="text-xs text-muted-foreground">Devolución caja chica{m.cajaCierre.nombre ? ` — ${m.cajaCierre.nombre}` : ''}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </Td>
                )}
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setViewingId(m.id)} className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all">
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    {!m.anulado && (
                      <button
                        onClick={() => {
                          setEditandoMov(m);
                          setFormReferencia(m.referencia ?? '');
                          setFormNotaEgreso(m.notaEgreso ?? '');
                          setFormCategoriaEgreso(m.categoriaEgreso ?? '');
                          setFormCategoriaIngreso(m.categoriaIngreso ?? '');
                          setFormClienteIdEdicion(m.cobranza && !m.cobranza.anulado ? String(m.cobranza.cliente.id) : '');
                          setFormNotaIngreso(m.notaIngreso ?? '');
                        }}
                        className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
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
              );
            }) : <tr><td colSpan={tab === 'EGRESO' ? 8 : 8}><EmptyState message={`Sin ${tab === 'INGRESO' ? 'ingresos' : 'egresos'} en el período`} /></td></tr>}
          </tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={lista ? Math.ceil(lista.total / PAGE_SIZE) : 1} onChange={setPage} />

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
          <FormField label="N° Operación" hint="Número de operación del banco (si aplica)">
            <Input value={formRegistrar.referencia ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, referencia: e.target.value }))} />
          </FormField>
          {tab === 'EGRESO' && (
            <FormField label="Categoría" required hint="Determina en qué módulo se podrá usar este egreso">
              <Select value={formRegistrar.categoriaEgreso ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, categoriaEgreso: e.target.value }))}>
                <option value="">Selecciona una categoría</option>
                {categoriasEgreso.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
              </Select>
            </FormField>
          )}
          {tab === 'EGRESO' && formRegistrar.categoriaEgreso && (
            <FormField label="Referencia" hint="En qué se usó el gasto">
              <Input value={formRegistrar.notaEgreso ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, notaEgreso: e.target.value }))} />
            </FormField>
          )}
          {tab === 'INGRESO' && (
            <FormField label="Categoría" required hint="Pago de factura permite relacionar este ingreso a una o más facturas del cliente desde Cobranza">
              <Select value={formRegistrar.categoriaIngreso ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, categoriaIngreso: e.target.value, clienteId: '', notaIngreso: '' }))}>
                <option value="">Selecciona una categoría</option>
                {categoriasIngreso.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
              </Select>
            </FormField>
          )}
          {tab === 'INGRESO' && formRegistrar.categoriaIngreso === 'PAGO_FACTURA' && (
            <FormField label="Cliente" required hint="El pago quedará disponible en Cobranza para relacionarlo a una o más facturas">
              <Select value={formRegistrar.clienteId ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, clienteId: e.target.value }))}>
                <option value="">Selecciona un cliente</option>
                {clientes.map((c: any) => <option key={c.id} value={c.id}>{c.razonSocial} — {c.ruc}</option>)}
              </Select>
            </FormField>
          )}
          {tab === 'INGRESO' && formRegistrar.categoriaIngreso && formRegistrar.categoriaIngreso !== 'PAGO_FACTURA' && (
            <FormField label="Observación" required hint="Detalle de este ingreso">
              <Textarea value={formRegistrar.notaIngreso ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, notaIngreso: e.target.value }))} placeholder="Motivo del ingreso..." />
            </FormField>
          )}
          <FormField label="Fecha"><Input type="date" value={formRegistrar.fecha ?? ''} onChange={(e) => setFormRegistrar((p) => ({ ...p, fecha: e.target.value }))} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => { setShowRegistrar(false); setFormRegistrar({}); }}>Cancelar</Button>
            <Button
              loading={crearMutation.isPending}
              disabled={
                !formRegistrar.cuentaId || !formRegistrar.monedaId || !formRegistrar.monto || !formRegistrar.concepto ||
                (tab === 'EGRESO' && !formRegistrar.categoriaEgreso) ||
                (tab === 'INGRESO' && formRegistrar.categoriaIngreso === 'PAGO_FACTURA' && !formRegistrar.clienteId) ||
                (tab === 'INGRESO' && !!formRegistrar.categoriaIngreso && formRegistrar.categoriaIngreso !== 'PAGO_FACTURA' && !formRegistrar.notaIngreso?.trim())
              }
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
          <FormField label="Archivo Excel" required hint="Extracto bancario o plantilla simple: Fecha, Descripción, Monto (el signo o una columna Tipo definen ingreso/egreso)">
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
            <Button variant="secondary" onClick={cerrarImportar}>Cancelar</Button>
            <Button
              loading={importarMutation.isPending}
              disabled={!importCuentaId || filasValidas.length === 0}
              onClick={() => importarMutation.mutate({ filas: filasValidas })}
            >
              <FileSpreadsheet className="w-4 h-4" /> Importar {filasValidas.length || ''} movimiento(s)
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Editar movimiento */}
      <Modal open={!!editandoMov} onClose={cerrarEdicion} title="Editar movimiento">
        {editandoMov && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm text-muted-foreground">{editandoMov.concepto}</div>
            <FormField label="N° Operación" hint="Número de operación del banco">
              <Input value={formReferencia} onChange={(e) => setFormReferencia(e.target.value)} placeholder="Sin número de operación" />
            </FormField>
            {editandoMov.tipo === 'EGRESO' && (
              <FormField label="Categoría" hint="Solo se puede cambiar si el egreso no está vinculado a Combustible, Caja chica o Mantenimiento">
                <Select value={formCategoriaEgreso} onChange={(e) => setFormCategoriaEgreso(e.target.value)}>
                  <option value="">Sin categoría</option>
                  {categoriasEgreso.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
                </Select>
              </FormField>
            )}
            {editandoMov.tipo === 'EGRESO' && formCategoriaEgreso && (
              <FormField label="Referencia" hint="En qué se usó el gasto (no modifica el N° de operación)">
                <Input value={formNotaEgreso} onChange={(e) => setFormNotaEgreso(e.target.value)} placeholder="Sin referencia" />
              </FormField>
            )}
            {editandoMov.tipo === 'INGRESO' && (
              <FormField label="Categoría" hint="Pago de factura permite relacionar este ingreso a una o más facturas del cliente desde Cobranza">
                <Select
                  value={formCategoriaIngreso}
                  onChange={(e) => { setFormCategoriaIngreso(e.target.value); setFormClienteIdEdicion(''); setFormNotaIngreso(''); }}
                >
                  <option value="">Sin categoría</option>
                  {categoriasIngreso.map((c) => <option key={c.codigo} value={c.codigo}>{c.nombre}</option>)}
                </Select>
              </FormField>
            )}
            {editandoMov.tipo === 'INGRESO' && formCategoriaIngreso === 'PAGO_FACTURA' && (
              <FormField label="Cliente" required hint="El pago quedará disponible en Cobranza para relacionarlo a una o más facturas">
                <Select value={formClienteIdEdicion} onChange={(e) => setFormClienteIdEdicion(e.target.value)}>
                  <option value="">Selecciona un cliente</option>
                  {clientesEdicion.map((c: any) => <option key={c.id} value={c.id}>{c.razonSocial} — {c.ruc}</option>)}
                </Select>
              </FormField>
            )}
            {editandoMov.tipo === 'INGRESO' && formCategoriaIngreso && formCategoriaIngreso !== 'PAGO_FACTURA' && (
              <FormField label="Observación" hint="Detalle de este ingreso">
                <Textarea value={formNotaIngreso} onChange={(e) => setFormNotaIngreso(e.target.value)} placeholder="Motivo del ingreso..." />
              </FormField>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={cerrarEdicion}>Cancelar</Button>
              <Button
                loading={editarMovimientoMutation.isPending}
                disabled={editandoMov.tipo === 'INGRESO' && formCategoriaIngreso === 'PAGO_FACTURA' && !formClienteIdEdicion}
                onClick={() => editarMovimientoMutation.mutate()}
              >
                Guardar
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
            <Detalle label="N° Operación" value={viewing.referencia ?? '—'} />
            {viewing.tipo === 'EGRESO' && <Detalle label="Categoría" value={categoriaLabel(viewing.categoriaEgreso)} />}
            {viewing.tipo === 'EGRESO' && <Detalle label="Referencia" value={viewing.notaEgreso ?? '—'} />}
            {viewing.tipo === 'INGRESO' && <Detalle label="Categoría" value={categoriaIngresoLabel(viewing.categoriaIngreso)} />}
            {viewing.tipo === 'INGRESO' && viewing.categoriaIngreso && viewing.categoriaIngreso !== 'PAGO_FACTURA' && <Detalle label="Observación" value={viewing.notaIngreso ?? '—'} />}
            <Detalle label="Registrado por" value={viewing.usuario?.nombre} />
            <Detalle label="Origen" value={viewing.origen} />
            <Detalle label="Estado" value={viewing.anulado ? 'Anulado' : 'Activo'} />

            {(viewing as any).cobranza && (
              <div className="border-t border-border pt-3 mt-1 flex flex-col gap-2">
                <p className="font-semibold">Cobranza</p>
                <Detalle label="Cliente" value={(viewing as any).cobranza.cliente?.razonSocial} />
                <Detalle
                  label="Facturas aplicadas"
                  value={
                    (viewing as any).cobranza.aplicaciones?.length
                      ? (viewing as any).cobranza.aplicaciones.map((a: any) => a.factura?.numeroFactura).join(', ')
                      : 'Ninguna (pendiente de aplicar)'
                  }
                />
                <p className="text-xs text-muted-foreground">Para relacionar este pago a facturas del cliente, hazlo desde el módulo Cobranza.</p>
              </div>
            )}

            {(viewing as any).mantenimiento && (
              <div className="border-t border-border pt-3 mt-1 flex flex-col gap-2">
                <p className="font-semibold">Mantenimiento</p>
                <Detalle label="Vehículo" value={(viewing as any).mantenimiento.vehiculo?.placa} />
                <Detalle label="Conductor" value={(viewing as any).mantenimiento.conductor?.nombre ?? '—'} />
              </div>
            )}

            <AuditInfo
              creadoPor={viewing.creadoPor}
              creadoEn={viewing.creadoEn}
              actualizadoPor={viewing.actualizadoPor}
              actualizadoEn={viewing.actualizadoEn}
            />
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
