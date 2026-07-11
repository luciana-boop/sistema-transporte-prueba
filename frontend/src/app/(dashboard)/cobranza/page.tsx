// FILE: src/app/(dashboard)/cobranza/page.tsx
'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Unlink, Download, FileText } from 'lucide-react';
import api, { cobranzaApi, clientesApi } from '@/services/api';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge,
  Modal, FormField, Input, Select, StatCard,
  TableSkeleton, EmptyState, Pagination,
} from '@/components/shared';
import { formatCurrency, formatDate, getErrorMessage, PAGE_SIZE } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import type { MovimientoCobranza } from '@/types';
import * as XLSX from 'xlsx';

type Tab = 'por_aplicar' | 'aplicado' | 'por_cobrar';

export default function CobranzaPage() {
  const { usuario } = useAuthStore();
  const queryClient = useQueryClient();
  const esAdmin = usuario?.rol === 'ADMIN';

  const [tab, setTab] = useState<Tab>('por_aplicar');
  const [aplicandoPago, setAplicandoPago] = useState<MovimientoCobranza | null>(null);
  const [montos, setMontos] = useState<Record<number, string>>({});

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: clientesFiltro = [] } = useQuery({
    queryKey: ['clientes', 'activos-filtro-cobranza'],
    queryFn: () => clientesApi.listar({ activo: true, limit: 200 }).then((r) => r.data.data.items).catch(() => []),
  });

  const filtrosActivos = {
    estado: tab === 'por_cobrar' ? undefined : tab,
    desde: desde || undefined,
    hasta: hasta || undefined,
    clienteId: clienteId ? parseInt(clienteId) : undefined,
    search: search || undefined,
  };

  const { data: pagos, isLoading } = useQuery({
    queryKey: ['cobranza', filtrosActivos],
    queryFn: () => cobranzaApi.listar(filtrosActivos).then((r) => r.data.data),
    enabled: tab !== 'por_cobrar',
  });

  const exportarExcel = () => {
    const rows = (pagos ?? []).map((p) => ({
      Fecha: formatDate(p.fechaPago),
      Cliente: p.cliente.razonSocial,
      RUC: p.cliente.ruc,
      'Monto del pago': Number(p.monto),
      'Saldo por aplicar': saldoPorAplicar(p),
      'Facturas aplicadas': p.aplicaciones.map((a) => `${a.factura.numeroFactura} (${formatCurrency(Number(a.monto))})`).join(', ') || '—',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, tab === 'por_aplicar' ? 'Pagos por aplicar' : 'Pagos aplicados');
    XLSX.writeFile(wb, `cobranza_${tab}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const inv = () => queryClient.invalidateQueries({ queryKey: ['cobranza'] });

  const { data: facturasCliente = [] } = useQuery({
    queryKey: ['cobranza', 'facturas-pendientes', aplicandoPago?.cliente.id],
    queryFn: () => cobranzaApi.facturasPendientes(aplicandoPago!.cliente.id).then((r) => r.data.data),
    enabled: !!aplicandoPago,
  });

  const saldoPorAplicar = (p: MovimientoCobranza) => {
    const aplicado = (p.aplicaciones ?? []).reduce((s, a) => s + Number(a.monto), 0);
    return Number(p.monto) - aplicado;
  };

  const cerrarAplicar = () => { setAplicandoPago(null); setMontos({}); };

  const totalAAplicar = useMemo(
    () => Object.values(montos).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [montos],
  );

  const aplicarMutation = useMutation({
    mutationFn: () => cobranzaApi.aplicar(aplicandoPago!.id, {
      aplicaciones: Object.entries(montos)
        .filter(([, v]) => parseFloat(v) > 0)
        .map(([facturaId, v]) => ({ facturaId: parseInt(facturaId), monto: parseFloat(v) })),
    }),
    onSuccess: () => { toast.success('Pago aplicado correctamente'); cerrarAplicar(); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const quitarMutation = useMutation({
    mutationFn: (aplicacionId: number) => cobranzaApi.quitarAplicacion(aplicacionId),
    onSuccess: () => { toast.success('Aplicación quitada'); inv(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const totalPorAplicar = tab === 'por_aplicar'
    ? (pagos ?? []).reduce((s, p) => s + saldoPorAplicar(p), 0)
    : 0;

  const totalPagesPagos = Math.ceil((pagos?.length ?? 0) / PAGE_SIZE);
  const pagosPagina = (pagos ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // ── Facturas por cobrar (todas, o filtradas por cliente) ─────────────────
  const { data: facturasPorCobrar = [], isLoading: loadingFacturasPorCobrar } = useQuery({
    queryKey: ['cobranza', 'facturas-pendientes-todas', clienteId],
    queryFn: () => cobranzaApi.facturasPendientesTodas({
      clienteId: clienteId ? parseInt(clienteId) : undefined,
    }).then((r) => r.data.data),
    enabled: tab === 'por_cobrar',
  });
  const totalPagesFacturasPorCobrar = Math.ceil(facturasPorCobrar.length / PAGE_SIZE);
  const facturasPorCobrarPagina = facturasPorCobrar.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const exportarFacturasPorCobrarExcel = () => {
    const rows = facturasPorCobrar.map((f) => ({
      Cliente: f.cliente?.razonSocial ?? '',
      'N° Factura': f.numeroFactura,
      Vencimiento: formatDate(f.fechaVencimiento),
      'Saldo pendiente': f.saldoPendiente,
      Estado: f.vencida ? 'Vencida' : 'Vigente',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturas por cobrar');
    XLSX.writeFile(wb, `facturas_por_cobrar_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ── Estado de cuenta (de un cliente) ──────────────────────────────────────
  const [estadoCuentaClienteId, setEstadoCuentaClienteId] = useState<number | null>(null);
  const { data: estadoCuenta, isLoading: loadingEstadoCuenta } = useQuery({
    queryKey: ['cobranza', 'estado-cuenta', estadoCuentaClienteId],
    queryFn: () => cobranzaApi.estadoCuenta(estadoCuentaClienteId!).then((r) => r.data.data),
    enabled: !!estadoCuentaClienteId,
  });

  const exportarEstadoCuentaExcel = () => {
    if (!estadoCuenta) return;
    const filas = (grupo: 'vencidas' | 'porVencer') => estadoCuenta[grupo].map((f) => ({
      'N° Factura': f.numeroFactura,
      Vencimiento: formatDate(f.fechaVencimiento),
      'Saldo pendiente': f.saldoPendiente,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas('vencidas')), 'Vencidas');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas('porVencer')), 'Por vencer');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
      { Concepto: 'Total vencidas', Monto: estadoCuenta.totalVencidas },
      { Concepto: 'Total por vencer', Monto: estadoCuenta.totalPorVencer },
      { Concepto: 'Total general', Monto: estadoCuenta.totalGeneral },
    ]), 'Totales');
    XLSX.writeFile(wb, `estado_cuenta_${estadoCuenta.cliente.razonSocial}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const [descargandoPdf, setDescargandoPdf] = useState(false);
  const exportarEstadoCuentaPdf = async () => {
    if (!estadoCuentaClienteId || !estadoCuenta) return;
    setDescargandoPdf(true);
    try {
      const res = await api.get(`/api/cobranza/${estadoCuentaClienteId}/estado-cuenta/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `estado_cuenta_${estadoCuenta.cliente.razonSocial}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setDescargandoPdf(false);
    }
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Cobranza"
        description="Aplica los pagos de clientes (categoría Pago de factura) a una o más facturas"
        action={
          tab === 'por_cobrar' ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={exportarFacturasPorCobrarExcel} disabled={!facturasPorCobrar.length}>
                <Download className="w-4 h-4" /> Exportar Excel
              </Button>
              <Button
                onClick={() => setEstadoCuentaClienteId(clienteId ? parseInt(clienteId) : null)}
                disabled={!clienteId}
              >
                <FileText className="w-4 h-4" /> Generar estado de cuenta
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={exportarExcel} disabled={!pagos?.length}>
              <Download className="w-4 h-4" /> Exportar Excel
            </Button>
          )
        }
      />

      <div className="flex gap-1 border-b border-border">
        {(['por_aplicar', 'aplicado', 'por_cobrar'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-all ${
              tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'por_aplicar' ? 'Pagos por aplicar' : t === 'aplicado' ? 'Pagos aplicados' : 'Facturas por cobrar'}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        {tab !== 'por_cobrar' && (
          <>
            <FormField label="Desde"><Input type="date" value={desde} onChange={(e) => { setDesde(e.target.value); setPage(1); }} /></FormField>
            <FormField label="Hasta"><Input type="date" value={hasta} onChange={(e) => { setHasta(e.target.value); setPage(1); }} /></FormField>
          </>
        )}
        <FormField label="Cliente">
          <Select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setPage(1); }} className="w-56">
            <option value="">Todos</option>
            {clientesFiltro.map((c: any) => <option key={c.id} value={c.id}>{c.razonSocial}</option>)}
          </Select>
        </FormField>
        {tab !== 'por_cobrar' && (
          <FormField label="Buscar">
            <Input placeholder="Cliente o RUC..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </FormField>
        )}
      </div>

      {tab === 'por_aplicar' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Pagos pendientes de aplicar" value={String(pagos?.length ?? 0)} />
          <StatCard label="Monto total sin aplicar" value={formatCurrency(totalPorAplicar)} color="yellow" />
        </div>
      )}

      {tab === 'por_cobrar' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Facturas con saldo pendiente" value={String(facturasPorCobrar.length)} />
          <StatCard
            label="Saldo total pendiente"
            value={formatCurrency(facturasPorCobrar.reduce((s, f) => s + f.saldoPendiente, 0))}
            color="yellow"
          />
        </div>
      )}

      {tab === 'por_cobrar' ? (
        loadingFacturasPorCobrar ? <TableSkeleton rows={6} cols={5} /> : (
          <Table>
            <thead>
              <tr>
                <Th>Cliente</Th>
                <Th>N° Factura</Th>
                <Th>Vencimiento</Th>
                <Th className="text-right">Saldo pendiente</Th>
                <Th>Estado</Th>
              </tr>
            </thead>
            <tbody>
              {facturasPorCobrarPagina.length ? facturasPorCobrarPagina.map((f) => (
                <Tr key={f.id}>
                  <Td><span className="text-sm font-medium">{f.cliente?.razonSocial}</span></Td>
                  <Td><span className="text-sm">{f.numeroFactura}</span></Td>
                  <Td><span className="text-sm">{formatDate(f.fechaVencimiento)}</span></Td>
                  <Td className="text-right"><span className="font-semibold text-amber-500">{formatCurrency(f.saldoPendiente)}</span></Td>
                  <Td><Badge value={f.vencida ? 'ANULADA' : 'PAGADA'} label={f.vencida ? 'Vencida' : 'Vigente'} /></Td>
                </Tr>
              )) : <tr><td colSpan={5}><EmptyState message="Sin facturas con saldo pendiente" /></td></tr>}
            </tbody>
          </Table>
        )
      ) : isLoading ? <TableSkeleton rows={6} cols={5} /> : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th className="text-right">Monto del pago</Th>
              {tab === 'por_aplicar' ? <Th className="text-right">Saldo por aplicar</Th> : <Th>Facturas aplicadas</Th>}
              <Th className="text-right">Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {pagosPagina.length ? pagosPagina.map((p) => (
              <Tr key={p.id}>
                <Td><span className="text-sm">{formatDate(p.fechaPago)}</span></Td>
                <Td><span className="text-sm font-medium">{p.cliente.razonSocial}</span></Td>
                <Td className="text-right"><span className="font-semibold text-emerald-500">{formatCurrency(Number(p.monto))}</span></Td>
                {tab === 'por_aplicar' ? (
                  <Td className="text-right"><span className="font-semibold text-amber-500">{formatCurrency(saldoPorAplicar(p))}</span></Td>
                ) : (
                  <Td>
                    <div className="flex flex-col gap-1">
                      {p.aplicaciones.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{a.factura.numeroFactura} — {formatCurrency(Number(a.monto))}</span>
                          {esAdmin && (
                            <button
                              onClick={() => { if (confirm('¿Quitar esta aplicación? La factura volverá a tener saldo pendiente.')) quitarMutation.mutate(a.id); }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Unlink className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </Td>
                )}
                <Td className="text-right">
                  {tab === 'por_aplicar' && (
                    <Button size="sm" onClick={() => setAplicandoPago(p)}>
                      <CheckCircle2 className="w-3.5 h-3.5" /> Aplicar a facturas
                    </Button>
                  )}
                </Td>
              </Tr>
            )) : <tr><td colSpan={5}><EmptyState message={tab === 'por_aplicar' ? 'Sin pagos pendientes de aplicar' : 'Sin pagos aplicados'} /></td></tr>}
          </tbody>
        </Table>
      )}

      <Pagination page={page} totalPages={tab === 'por_cobrar' ? totalPagesFacturasPorCobrar : totalPagesPagos} onChange={setPage} />

      {/* Modal: Aplicar pago a facturas */}
      <Modal open={!!aplicandoPago} onClose={cerrarAplicar} title="Aplicar pago a facturas" maxWidth="max-w-2xl">
        {aplicandoPago && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">Cliente: <span className="font-medium text-foreground">{aplicandoPago.cliente.razonSocial}</span></p>
              <p className="text-muted-foreground">Saldo por aplicar: <span className="font-semibold text-amber-500">{formatCurrency(saldoPorAplicar(aplicandoPago))}</span></p>
            </div>

            {facturasCliente.length === 0 ? (
              <EmptyState message="Este cliente no tiene facturas con saldo pendiente" />
            ) : (
              <div className="flex flex-col gap-2">
                {facturasCliente.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 border border-border rounded-lg p-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{f.numeroFactura}</p>
                      <p className="text-xs text-muted-foreground">Saldo pendiente: {formatCurrency(f.saldoPendiente)}{f.vencida ? ' — vencida' : ''}</p>
                    </div>
                    <FormField label="">
                      <Input
                        type="number" step="0.01" min="0" placeholder="0.00"
                        className="w-32"
                        value={montos[f.id] ?? ''}
                        onChange={(e) => setMontos((p) => ({ ...p, [f.id]: e.target.value }))}
                      />
                    </FormField>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-border">
              <span className="text-sm text-muted-foreground">Total a aplicar: <span className="font-semibold text-foreground">{formatCurrency(totalAAplicar)}</span></span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={cerrarAplicar}>Cancelar</Button>
                <Button
                  loading={aplicarMutation.isPending}
                  disabled={totalAAplicar <= 0 || totalAAplicar > saldoPorAplicar(aplicandoPago) + 0.01}
                  onClick={() => aplicarMutation.mutate()}
                >
                  Aplicar
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Estado de cuenta */}
      <Modal open={!!estadoCuentaClienteId} onClose={() => setEstadoCuentaClienteId(null)} title="Estado de cuenta" maxWidth="max-w-2xl">
        {loadingEstadoCuenta ? (
          <TableSkeleton rows={4} cols={3} />
        ) : estadoCuenta && (
          <div className="flex flex-col gap-5">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="font-medium">{estadoCuenta.cliente.razonSocial}</p>
              <p className="text-muted-foreground">RUC: {estadoCuenta.cliente.ruc}</p>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Facturas vencidas</p>
              {estadoCuenta.vencidas.length ? (
                <div className="flex flex-col gap-1">
                  {estadoCuenta.vencidas.map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-sm bg-red-500/5 rounded px-3 py-1.5">
                      <span>{f.numeroFactura} · vence {formatDate(f.fechaVencimiento)}</span>
                      <span className="font-semibold text-red-500">{formatCurrency(f.saldoPendiente)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">Sin facturas vencidas.</p>}
              <div className="flex justify-end mt-1">
                <span className="text-sm font-semibold">Total vencidas: {formatCurrency(estadoCuenta.totalVencidas)}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Facturas por vencer</p>
              {estadoCuenta.porVencer.length ? (
                <div className="flex flex-col gap-1">
                  {estadoCuenta.porVencer.map((f) => (
                    <div key={f.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-1.5">
                      <span>{f.numeroFactura} · vence {formatDate(f.fechaVencimiento)}</span>
                      <span className="font-semibold">{formatCurrency(f.saldoPendiente)}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs text-muted-foreground">Sin facturas por vencer.</p>}
              <div className="flex justify-end mt-1">
                <span className="text-sm font-semibold">Total por vencer: {formatCurrency(estadoCuenta.totalPorVencer)}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <span className="text-base font-bold">Total general: {formatCurrency(estadoCuenta.totalGeneral)}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={exportarEstadoCuentaExcel}>
                <Download className="w-4 h-4" /> Excel
              </Button>
              <Button variant="secondary" loading={descargandoPdf} onClick={exportarEstadoCuentaPdf}>
                <FileText className="w-4 h-4" /> PDF
              </Button>
              <Button onClick={() => setEstadoCuentaClienteId(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
