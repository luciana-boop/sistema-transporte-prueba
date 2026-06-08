// FILE: src/app/(dashboard)/caja/page.tsx
// La gestión de liquidaciones (pago, reintegro, devolución, anulación) se realiza
// íntegramente desde el módulo de Liquidaciones — Caja ya no tiene esa sección.

'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  Plus, Lock, FileDown, Eye, Filter, X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cajaApi, cuentasApi } from '@/services/api';
import { formatCurrency, formatDatetime, formatDate, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { MonedaBadge, TipoCuentaBadge } from '@/components/shared/FinancialSelectors';
import { useAuthStore } from '@/store/auth.store';
import type { Caja, MovimientoEnriquecido, MovimientosCajaResponse, TipoMov } from '@/types';

// ─── Schemas ────────────────────────────────────────────────────────────────
const abrirSchema = z.object({
  nombre: z.string().optional(),
  saldoApertura: z.string().min(1, 'Saldo de apertura requerido'),
  cuentaOrigenId: z.string().min(1, 'Debe seleccionar la cuenta de origen'),
  observaciones: z.string().optional(),
});
const cerrarSchema = z.object({
  saldoCierre: z.string().min(1, 'Saldo de cierre requerido'),
  observaciones: z.string().optional(),
});
const movSchema = z.object({
  tipo: z.enum(['INGRESO', 'EGRESO']),
  monto: z.string().min(1, 'Monto requerido'),
  concepto: z.string().min(2, 'Concepto requerido'),
  fecha: z.string().min(1, 'Fecha requerida'),
  referencia: z.string().optional(),
});
const editMovSchema = z.object({
  monto: z.string().min(1, 'Monto requerido'),
  concepto: z.string().min(2, 'Concepto requerido'),
  fecha: z.string().min(1, 'Fecha requerida'),
  referencia: z.string().optional(),
});

// ─── Helper: nombre de caja ──────────────────────────────────────────────────
function cajaNombre(caja: Caja): string {
  if (caja.nombre) return caja.nombre;
  const fecha = formatDate(caja.fecha, 'dd/MM/yyyy');
  return `Caja – ${caja.usuario?.nombre ?? '?'} – ${fecha}`;
}

// ─── PDF print helper ────────────────────────────────────────────────────────
interface PrintData {
  caja: Caja;
  movimientos: MovimientoEnriquecido[];
  saldoInicial: number;
  totalIngresos: number;
  totalEgresos: number;
  saldoFinal: number;
  desde?: string;
  hasta?: string;
}

function printMovimientos(data: PrintData) {
  const { caja, movimientos, saldoInicial, totalIngresos, totalEgresos, saldoFinal, desde, hasta } = data;
  const nombre = cajaNombre(caja);
  const rango = desde || hasta
    ? `${desde ? formatDate(desde) : '—'} al ${hasta ? formatDate(hasta) : '—'}`
    : 'Todos los movimientos';

  const filas = movimientos.map((m) => `
    <tr>
      <td>${formatDatetime(m.fecha)}</td>
      <td>${m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'}</td>
      <td>${m.concepto}</td>
      <td>${m.referencia ?? '—'}</td>
      <td style="color:${m.tipo === 'INGRESO' ? '#16a34a' : 'inherit'}">${m.tipo === 'INGRESO' ? formatCurrency(m.monto) : '—'}</td>
      <td style="color:${m.tipo === 'EGRESO' ? '#dc2626' : 'inherit'}">${m.tipo === 'EGRESO' ? formatCurrency(m.monto) : '—'}</td>
      <td style="font-weight:600">${formatCurrency(m.saldoAcumulado)}</td>
    </tr>
  `).join('');

  const html = `<!DOCTYPE html><html lang="es">
    <head><meta charset="UTF-8"/><title>Reporte de Caja</title>
    <style>body{font-family:Arial,sans-serif;font-size:11px;color:#111;margin:20px}h1{font-size:16px;margin-bottom:4px}.meta{color:#555;margin-bottom:16px;font-size:11px}table{width:100%;border-collapse:collapse;margin-top:8px}th{background:#f3f4f6;border:1px solid #d1d5db;padding:6px 8px;text-align:left;font-size:10px}td{border:1px solid #e5e7eb;padding:5px 8px;font-size:10px}tr:nth-child(even) td{background:#f9fafb}.resumen{display:flex;gap:24px;margin-top:16px;padding:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:4px}.resumen div{flex:1}.resumen .label{font-size:9px;color:#6b7280;text-transform:uppercase}.resumen .value{font-size:13px;font-weight:700;margin-top:2px}.green{color:#16a34a}.red{color:#dc2626}@media print{body{margin:8mm}}</style>
    </head><body>
      <h1>Reporte de Caja</h1>
      <div class="meta"><strong>${nombre}</strong><br/>Período: ${rango}</div>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Concepto</th><th>Referencia</th><th>Ingreso</th><th>Egreso</th><th>Saldo</th></tr></thead>
      <tbody>${filas}</tbody></table>
      <div class="resumen">
        <div><div class="label">Saldo inicial</div><div class="value">${formatCurrency(saldoInicial)}</div></div>
        <div><div class="label">Total ingresos</div><div class="value green">${formatCurrency(totalIngresos)}</div></div>
        <div><div class="label">Total egresos</div><div class="value red">${formatCurrency(totalEgresos)}</div></div>
        <div><div class="label">Saldo final</div><div class="value">${formatCurrency(saldoFinal)}</div></div>
      </div>
    </body></html>`;

  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) { toast.error('Permite ventanas emergentes para imprimir'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

function exportMovimientosExcel(movimientos: MovimientoEnriquecido[], saldoInicial: number, nombreCaja: string) {
  const rows = movimientos.map((m) => ({
    Fecha: formatDatetime(m.fecha),
    Concepto: m.concepto,
    Referencia: m.referencia ?? '',
    Tipo: m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso',
    Ingreso: m.tipo === 'INGRESO' && !m.anulado ? m.monto : '',
    Egreso: m.tipo === 'EGRESO' && !m.anulado ? m.monto : '',
    'Saldo Acumulado': m.anulado ? '' : m.saldoAcumulado,
    Estado: m.anulado ? 'ANULADO' : 'ACTIVO',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
  XLSX.writeFile(wb, `movimientos_caja_${new Date().toISOString().split('T')[0]}.xlsx`);
}

function exportCuentaExcel(movimientos: any[], nombreCuenta: string) {
  let saldo = 0;
  const rows = movimientos.map((m: any) => {
    const ingreso = m.tipo === 'INGRESO' ? Number(m.monto) : 0;
    const egreso = m.tipo === 'EGRESO' ? Number(m.monto) : 0;
    saldo += ingreso - egreso;
    return { Fecha: formatDatetime(m.fecha), Concepto: m.concepto, Referencia: m.referencia ?? '', Ingreso: ingreso || '', Egreso: egreso || '', Saldo: saldo };
  });
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
  XLSX.writeFile(wb, `cuenta_${nombreCuenta.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function CajaPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();

  // Tabs
  const [tab, setTab] = useState<'cajas' | 'cuentas'>('cajas');

  // Modales existentes
  const [showAbrir, setShowAbrir] = useState(false);
  const [showCerrar, setShowCerrar] = useState<number | null>(null);
  const [showMov, setShowMov] = useState<number | null>(null);
  const [showMovimientos, setShowMovimientos] = useState<Caja | null>(null);
  const [editandoMov, setEditandoMov] = useState<MovimientoEnriquecido | null>(null);
  const [anulandoMov, setAnulandoMov] = useState<MovimientoEnriquecido | null>(null);
  const [filtroMovDesde, setFiltroMovDesde] = useState('');
  const [filtroMovHasta, setFiltroMovHasta] = useState('');
  const [filtroMovTipo, setFiltroMovTipo] = useState('');
  const [filtroListaDesde, setFiltroListaDesde] = useState('');
  const [filtroListaHasta, setFiltroListaHasta] = useState('');
  const [cuentaSelId, setCuentaSelId] = useState<string>('');
  const [cuentaMovDesde, setCuentaMovDesde] = useState('');
  const [cuentaMovHasta, setCuentaMovHasta] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: movData, isLoading: isLoadingMov, error: errorMov } = useQuery({
    queryKey: ['caja-movimientos', showMovimientos?.id, filtroMovDesde, filtroMovHasta, filtroMovTipo],
    queryFn: () =>
      cajaApi.getMovimientos(showMovimientos!.id, { desde: filtroMovDesde || undefined, hasta: filtroMovHasta || undefined, tipo: filtroMovTipo || undefined }).then((r) => r.data.data),
    enabled: !!showMovimientos,
  });

  const { data: cajas = [], isLoading } = useQuery({
    queryKey: ['cajas', filtroListaDesde, filtroListaHasta],
    queryFn: () => cajaApi.listar({ desde: filtroListaDesde || undefined, hasta: filtroListaHasta || undefined }).then((r) => r.data.data),
  });

  const { data: cajaActual } = useQuery({
    queryKey: ['caja-actual'],
    queryFn: () => cajaApi.actual().then((r) => r.data.data),
  });

  const { data: resumenCuentas } = useQuery({
    queryKey: ['cuentas', 'resumen'],
    queryFn: () => cuentasApi.getResumen().then((r) => r.data.data).catch(() => null),
  });

  const { data: cuentaMovData, isLoading: isLoadingCuentaMov } = useQuery({
    queryKey: ['cuenta-movimientos', cuentaSelId, cuentaMovDesde, cuentaMovHasta],
    queryFn: () =>
      cuentasApi.getMovimientos({ cuentaId: parseInt(cuentaSelId), desde: cuentaMovDesde || undefined, hasta: cuentaMovHasta || undefined }).then((r) => r.data.data),
    enabled: !!cuentaSelId,
  });

  // ── Forms ────────────────────────────────────────────────────────────────
  const abrirForm = useForm<z.infer<typeof abrirSchema>>({ resolver: zodResolver(abrirSchema) });
  const cerrarForm = useForm<z.infer<typeof cerrarSchema>>({ resolver: zodResolver(cerrarSchema) });
  const movForm = useForm<z.infer<typeof movSchema>>({
    resolver: zodResolver(movSchema),
    defaultValues: { tipo: 'INGRESO', fecha: new Date().toISOString().split('T')[0] },
  });
  const editMovForm = useForm<z.infer<typeof editMovSchema>>({ resolver: zodResolver(editMovSchema) });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cajas'] });
    qc.invalidateQueries({ queryKey: ['caja-actual'] });
  };

  // ── Mutations ────────────────────────────────────────────────────────────
  const abrirMutation = useMutation({
    mutationFn: (d: z.infer<typeof abrirSchema>) =>
      cajaApi.abrir({ nombre: d.nombre || undefined, saldoApertura: parseFloat(d.saldoApertura), cuentaOrigenId: parseInt(d.cuentaOrigenId), observaciones: d.observaciones }),
    onSuccess: () => { toast.success('Caja abierta'); setShowAbrir(false); abrirForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cerrarMutation = useMutation({
    mutationFn: (d: z.infer<typeof cerrarSchema>) =>
      cajaApi.cerrar(showCerrar!, { saldoCierre: parseFloat(d.saldoCierre), observaciones: d.observaciones }),
    onSuccess: () => { toast.success('Caja cerrada'); setShowCerrar(null); cerrarForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const movMutation = useMutation({
    mutationFn: (d: z.infer<typeof movSchema>) =>
      cajaApi.registrarMovimiento(showMov!, { tipo: d.tipo as TipoMov, monto: parseFloat(d.monto), concepto: d.concepto, fecha: d.fecha, referencia: d.referencia }),
    onSuccess: () => {
      toast.success('Movimiento registrado');
      setShowMov(null); movForm.reset(); invalidate();
      if (showMovimientos) qc.invalidateQueries({ queryKey: ['caja-movimientos'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const editarMovMutation = useMutation({
    mutationFn: (d: z.infer<typeof editMovSchema>) =>
      cajaApi.editarMovimiento(editandoMov!.id, { monto: parseFloat(d.monto), concepto: d.concepto, fecha: d.fecha, referencia: d.referencia }),
    onSuccess: () => {
      toast.success('Movimiento actualizado');
      setEditandoMov(null); editMovForm.reset();
      qc.invalidateQueries({ queryKey: ['caja-movimientos'] });
      qc.invalidateQueries({ queryKey: ['cajas'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al editar'),
  });

  const anularMovMutation = useMutation({
    mutationFn: (movId: number) => cajaApi.anularMovimiento(movId),
    onSuccess: () => {
      toast.success('Movimiento anulado');
      setAnulandoMov(null);
      qc.invalidateQueries({ queryKey: ['caja-movimientos'] });
      qc.invalidateQueries({ queryKey: ['cajas'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error al anular'),
  });

  function handleVerMovimientos(caja: Caja) {
    setFiltroMovDesde(''); setFiltroMovHasta(''); setFiltroMovTipo('');
    setShowMovimientos(caja);
  }

  function handlePrint() {
    if (!movData || !showMovimientos) return;
    printMovimientos({ caja: showMovimientos, movimientos: movData.movimientos, saldoInicial: movData.saldoInicial, totalIngresos: movData.totalIngresos, totalEgresos: movData.totalEgresos, saldoFinal: movData.saldoFinal, desde: filtroMovDesde || undefined, hasta: filtroMovHasta || undefined });
  }

  const cuentaNombre = resumenCuentas?.cuentas?.find((c: any) => String(c.id) === cuentaSelId)?.nombre ?? '';
  const cuentaMovList: any[] = Array.isArray(cuentaMovData) ? cuentaMovData : [];
  const cuentaTotalIngresos = cuentaMovList.filter((m) => m.tipo === 'INGRESO').reduce((s, m) => s + Number(m.monto), 0);
  const cuentaTotalEgresos = cuentaMovList.filter((m) => m.tipo === 'EGRESO').reduce((s, m) => s + Number(m.monto), 0);
  const cuentaSaldo = cuentaTotalIngresos - cuentaTotalEgresos;

  return (
    <div className="page-container">
      <PageHeader
        title="Caja"
        description="Control de apertura, cierre, movimientos y liquidaciones"
        action={
          !cajaActual ? (
            <Button onClick={() => setShowAbrir(true)}><Plus className="w-4 h-4" /> Abrir caja</Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setShowMov(cajaActual.id)}>
                <Plus className="w-4 h-4" /> Movimiento
              </Button>
              <Button variant="destructive" onClick={() => setShowCerrar(cajaActual.id)}>
                <Lock className="w-4 h-4" /> Cerrar caja
              </Button>
            </div>
          )
        }
      />

      {/* Caja actual */}
      {cajaActual && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{cajaNombre(cajaActual)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Abierta desde {formatDatetime(cajaActual.aperturaEn)}</p>
              <Badge value={cajaActual.estado} label={cajaActual.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'} />
            </div>
            <div className="grid grid-cols-4 gap-6 text-center">
              <div><p className="text-xs text-muted-foreground">Apertura</p><p className="font-semibold text-sm">{formatCurrency(Number(cajaActual.saldoApertura))}</p></div>
              <div><p className="text-xs text-muted-foreground">Ingresos</p><p className="font-semibold text-sm text-emerald-500">{formatCurrency(cajaActual.ingresosTotales ?? 0)}</p></div>
              <div><p className="text-xs text-muted-foreground">Egresos</p><p className="font-semibold text-sm text-destructive">{formatCurrency(cajaActual.egresosTotales ?? 0)}</p></div>
              <div><p className="text-xs text-muted-foreground">Saldo actual</p><p className="font-bold text-primary">{formatCurrency(cajaActual.saldoCalculado ?? cajaActual.saldoActual ?? 0)}</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Saldos por cuenta */}
      {resumenCuentas?.cuentas && resumenCuentas.cuentas.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {resumenCuentas.cuentas.map((c: any) => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground truncate flex-1">{c.nombre}</p>
                <TipoCuentaBadge tipo={c.tipoCuenta} />
              </div>
              <p className={`text-xl font-bold ${Number(c.saldoActual) >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                {c.moneda?.simbolo} {Number(c.saldoActual).toFixed(2)}
              </p>
              <MonedaBadge codigo={c.moneda?.codigo ?? 'PEN'} simbolo={c.moneda?.simbolo} />
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: 'cajas', label: 'Historial de cajas' },
          { key: 'cuentas', label: 'Movimientos por cuenta' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: MOVIMIENTOS POR CUENTA ─────────────────────────────────────── */}
      {tab === 'cuentas' && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <p className="text-sm font-semibold">Movimientos por cuenta</p>
              <p className="text-xs text-muted-foreground">Ver ingresos, egresos y saldo de una cuenta específica</p>
            </div>
            {cuentaSelId && cuentaMovList.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => exportCuentaExcel(cuentaMovList, cuentaNombre)}>
                <FileDown className="w-4 h-4" /> Excel
              </Button>
            )}
          </div>

          <div className="flex gap-3 flex-wrap items-end mb-4">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Cuenta</label>
              <Select value={cuentaSelId} onChange={(e) => setCuentaSelId(e.target.value)} className="w-56">
                <option value="">Seleccionar cuenta...</option>
                {resumenCuentas?.cuentas?.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.nombre} ({c.moneda?.simbolo} {c.moneda?.codigo})</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" value={cuentaMovDesde} onChange={(e) => setCuentaMovDesde(e.target.value)} className="w-36" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input type="date" value={cuentaMovHasta} onChange={(e) => setCuentaMovHasta(e.target.value)} className="w-36" />
            </div>
            {(cuentaMovDesde || cuentaMovHasta) && (
              <Button variant="ghost" size="sm" onClick={() => { setCuentaMovDesde(''); setCuentaMovHasta(''); }}>
                <X className="w-3.5 h-3.5" /> Limpiar
              </Button>
            )}
          </div>

          {cuentaSelId ? (
            <>
              {!isLoadingCuentaMov && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total ingresos</p>
                    <p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(cuentaTotalIngresos)}</p>
                  </div>
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total egresos</p>
                    <p className="font-semibold text-sm text-destructive mt-1">{formatCurrency(cuentaTotalEgresos)}</p>
                  </div>
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
                    <p className="text-xs text-muted-foreground">Saldo acumulado</p>
                    <p className={`font-bold text-sm mt-1 ${cuentaSaldo >= 0 ? 'text-primary' : 'text-destructive'}`}>{formatCurrency(cuentaSaldo)}</p>
                  </div>
                </div>
              )}
              {isLoadingCuentaMov ? <TableSkeleton rows={4} cols={6} /> : cuentaMovList.length === 0 ? (
                <EmptyState message="Sin movimientos en el período seleccionado" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <Th>Fecha</Th><Th>Concepto</Th><Th>Referencia</Th>
                        <Th className="text-right">Ingreso</Th><Th className="text-right">Egreso</Th><Th className="text-right">Saldo</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let saldoAcc = 0;
                        return cuentaMovList.map((m: any) => {
                          const ing = m.tipo === 'INGRESO' ? Number(m.monto) : 0;
                          const egr = m.tipo === 'EGRESO' ? Number(m.monto) : 0;
                          saldoAcc += ing - egr;
                          return (
                            <Tr key={m.id}>
                              <Td><span className="text-xs text-muted-foreground">{formatDatetime(m.fecha)}</span></Td>
                              <Td><span className="text-sm">{m.concepto}</span></Td>
                              <Td><span className="text-xs text-muted-foreground">{m.referencia ?? '—'}</span></Td>
                              <Td className="text-right">{ing > 0 ? <span className="font-medium text-emerald-600 dark:text-emerald-400">{formatCurrency(ing)}</span> : <span className="text-muted-foreground">—</span>}</Td>
                              <Td className="text-right">{egr > 0 ? <span className="font-medium text-destructive">{formatCurrency(egr)}</span> : <span className="text-muted-foreground">—</span>}</Td>
                              <Td className="text-right"><span className={`font-semibold ${saldoAcc >= 0 ? '' : 'text-destructive'}`}>{formatCurrency(saldoAcc)}</span></Td>
                            </Tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">Selecciona una cuenta para ver sus movimientos</p>
          )}
        </div>
      )}

      {/* ── TAB: HISTORIAL DE CAJAS ──────────────────────────────────────────── */}
      {tab === 'cajas' && (
        <>
          <div className="flex gap-3 flex-wrap items-end">
            <p className="text-sm font-semibold self-center">Historial de cajas</p>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Desde</label>
              <Input type="date" value={filtroListaDesde} onChange={(e) => setFiltroListaDesde(e.target.value)} className="w-36" />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs text-muted-foreground">Hasta</label>
              <Input type="date" value={filtroListaHasta} onChange={(e) => setFiltroListaHasta(e.target.value)} className="w-36" />
            </div>
            {(filtroListaDesde || filtroListaHasta) && (
              <Button variant="ghost" size="sm" onClick={() => { setFiltroListaDesde(''); setFiltroListaHasta(''); }}>
                <X className="w-3.5 h-3.5" /> Limpiar
              </Button>
            )}
          </div>

          {isLoading ? <TableSkeleton rows={5} cols={7} /> : (
            <Table>
              <thead>
                <tr>
                  <Th>Caja</Th><Th>Usuario</Th><Th>Apertura</Th><Th>Ingresos</Th>
                  <Th>Egresos</Th><Th>Saldo Actual</Th><Th>Estado</Th><Th>Acciones</Th>
                </tr>
              </thead>
              <tbody>
                {cajas.length > 0 ? cajas.map((c: Caja) => (
                  <Tr key={c.id}>
                    <Td><span className="text-sm font-medium">{cajaNombre(c)}</span></Td>
                    <Td><span className="text-sm">{c.usuario?.nombre}</span></Td>
                    <Td><span className="font-medium">{formatCurrency(Number(c.saldoApertura))}</span></Td>
                    <Td><span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">{formatCurrency(c.ingresosTotales ?? 0)}</span></Td>
                    <Td><span className="text-sm text-destructive font-medium">{formatCurrency(c.egresosTotales ?? 0)}</span></Td>
                    <Td><span className="font-bold text-primary">{formatCurrency(c.saldoActual ?? (Number(c.saldoApertura) + (c.ingresosTotales ?? 0) - (c.egresosTotales ?? 0)))}</span></Td>
                    <Td><Badge value={c.estado} label={c.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'} /></Td>
                    <Td>
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => handleVerMovimientos(c)} className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Eye className="w-3 h-3" /> Movimientos
                        </button>
                        {c.estado === 'ABIERTA' && (
                          <>
                            <button onClick={() => setShowMov(c.id)} className="text-xs text-primary hover:underline">+ Movimiento</button>
                            <button onClick={() => setShowCerrar(c.id)} className="text-xs text-destructive hover:underline">Cerrar</button>
                          </>
                        )}
                      </div>
                    </Td>
                  </Tr>
                )) : <tr><td colSpan={8}><EmptyState message="No hay cajas registradas" /></td></tr>}
              </tbody>
            </Table>
          )}
        </>
      )}

      {/* ── MODALES ──────────────────────────────────────────────────────────── */}

      {/* Modal: Movimientos de caja */}
      <Modal open={!!showMovimientos} onClose={() => setShowMovimientos(null)} title={showMovimientos ? cajaNombre(showMovimientos) : 'Movimientos'} maxWidth="max-w-5xl">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-3 p-3 bg-muted/30 rounded-lg border border-border">
            <div className="flex items-center gap-1 text-xs text-muted-foreground"><Filter className="w-3 h-3" /> Filtros:</div>
            <div className="flex flex-wrap gap-2 flex-1">
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-muted-foreground">Desde</label>
                <input type="date" value={filtroMovDesde} onChange={(e) => setFiltroMovDesde(e.target.value)} className="text-xs border border-border rounded px-2 py-1 bg-background" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-muted-foreground">Hasta</label>
                <input type="date" value={filtroMovHasta} onChange={(e) => setFiltroMovHasta(e.target.value)} className="text-xs border border-border rounded px-2 py-1 bg-background" />
              </div>
              <div className="flex flex-col gap-0.5">
                <label className="text-xs text-muted-foreground">Tipo</label>
                <select value={filtroMovTipo} onChange={(e) => setFiltroMovTipo(e.target.value)} className="text-xs border border-border rounded px-2 py-1 bg-background">
                  <option value="">Todos</option>
                  <option value="INGRESO">Ingreso</option>
                  <option value="EGRESO">Egreso</option>
                </select>
              </div>
              {(filtroMovDesde || filtroMovHasta || filtroMovTipo) && (
                <button onClick={() => { setFiltroMovDesde(''); setFiltroMovHasta(''); setFiltroMovTipo(''); }} className="self-end text-xs text-muted-foreground hover:text-foreground underline">Limpiar</button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={handlePrint} disabled={!movData || isLoadingMov}><FileDown className="w-4 h-4" /> PDF</Button>
              <Button variant="secondary" onClick={() => movData && showMovimientos && exportMovimientosExcel(movData.movimientos, movData.saldoInicial, cajaNombre(showMovimientos))} disabled={!movData || isLoadingMov}><FileDown className="w-4 h-4" /> Excel</Button>
            </div>
          </div>

          {movData && (
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-border p-3 text-center"><p className="text-xs text-muted-foreground">Saldo inicial</p><p className="font-semibold text-sm mt-1">{formatCurrency(movData.saldoInicial)}</p></div>
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-center"><p className="text-xs text-muted-foreground">Total ingresos</p><p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400 mt-1">{formatCurrency(movData.totalIngresos)}</p></div>
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center"><p className="text-xs text-muted-foreground">Total egresos</p><p className="font-semibold text-sm text-destructive mt-1">{formatCurrency(movData.totalEgresos)}</p></div>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center"><p className="text-xs text-muted-foreground">Saldo final</p><p className="font-bold text-sm text-primary mt-1">{formatCurrency(movData.saldoFinal)}</p></div>
            </div>
          )}

          {isLoadingMov ? <TableSkeleton rows={5} cols={6} /> : errorMov ? (
            <div className="p-4 text-center text-sm text-destructive">{getErrorMessage(errorMov)}</div>
          ) : movData?.movimientos.length === 0 ? (
            <EmptyState message="No hay movimientos en el rango seleccionado" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <Th>Fecha</Th><Th>Tipo</Th><Th>Concepto</Th><Th>Referencia</Th>
                    <Th className="text-right">Ingreso</Th><Th className="text-right">Egreso</Th>
                    <Th className="text-right">Saldo</Th><Th></Th>
                  </tr>
                </thead>
                <tbody>
                  {movData?.movimientos.map((m: MovimientoEnriquecido & { esLiquidacion?: boolean; liquidacionId?: number }) => (
                    <Tr key={m.id} className={m.anulado ? 'opacity-50' : ''}>
                      <Td>
                        <span className={`text-xs ${m.anulado ? 'line-through text-muted-foreground' : 'text-muted-foreground'}`}>{formatDatetime(m.fecha)}</span>
                        {m.anulado && <span className="ml-1 text-[10px] font-medium text-destructive uppercase">anulado</span>}
                      </Td>
                      <Td><Badge value={m.tipo} label={m.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso'} /></Td>
                      <Td>
                        <div>
                          <span className={`text-sm ${m.anulado ? 'line-through' : ''}`}>{m.concepto}</span>
                          {m.esLiquidacion && !m.anulado && (
                            <span className="ml-2 text-[10px] font-medium text-violet-600 bg-violet-500/10 px-1.5 py-0.5 rounded border border-violet-500/20">LIQUIDACIÓN</span>
                          )}
                        </div>
                      </Td>
                      <Td><span className="text-xs text-muted-foreground">{m.referencia ?? '—'}</span></Td>
                      <Td className="text-right">
                        {m.tipo === 'INGRESO' ? <span className={`font-medium ${m.anulado ? 'line-through text-muted-foreground' : 'text-emerald-600 dark:text-emerald-400'}`}>{formatCurrency(m.monto)}</span> : <span className="text-muted-foreground">—</span>}
                      </Td>
                      <Td className="text-right">
                        {m.tipo === 'EGRESO' ? <span className={`font-medium ${m.anulado ? 'line-through text-muted-foreground' : 'text-destructive'}`}>{formatCurrency(m.monto)}</span> : <span className="text-muted-foreground">—</span>}
                      </Td>
                      <Td className="text-right"><span className="font-semibold">{m.anulado ? '—' : formatCurrency(m.saldoAcumulado)}</span></Td>
                      <Td>
                        <div className="flex gap-1 justify-end">
                          {/* Movimientos manuales: editar y anular */}
                          {m.esManual && !m.anulado && !m.esLiquidacion && (
                            <>
                              <Button size="xs" variant="ghost" onClick={() => { setEditandoMov(m); editMovForm.reset({ monto: String(m.monto), concepto: m.concepto, fecha: m.fecha.split('T')[0], referencia: m.referencia ?? '' }); }}>Editar</Button>
                              <Button size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setAnulandoMov(m)}>Anular</Button>
                            </>
                          )}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Modal>

      {/* Modal: Editar movimiento */}
      <Modal open={!!editandoMov} onClose={() => { setEditandoMov(null); editMovForm.reset(); }} title="Editar movimiento">
        <form onSubmit={editMovForm.handleSubmit((d) => editarMovMutation.mutate(d))} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Monto" required error={editMovForm.formState.errors.monto?.message}><Input type="number" step="0.01" {...editMovForm.register('monto')} /></FormField>
            <FormField label="Fecha" required error={editMovForm.formState.errors.fecha?.message}><Input type="date" {...editMovForm.register('fecha')} /></FormField>
          </div>
          <FormField label="Concepto" required error={editMovForm.formState.errors.concepto?.message}><Input placeholder="Descripción..." {...editMovForm.register('concepto')} /></FormField>
          <FormField label="Referencia"><Input placeholder="N° factura, comprobante..." {...editMovForm.register('referencia')} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setEditandoMov(null); editMovForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={editarMovMutation.isPending}>Guardar cambios</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Confirmar anulación movimiento manual */}
      <Modal open={!!anulandoMov} onClose={() => setAnulandoMov(null)} title="Anular movimiento">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            ¿Confirmas la anulación del movimiento <span className="font-semibold text-foreground">{anulandoMov?.concepto}</span> por <span className="font-semibold text-foreground">{anulandoMov ? formatCurrency(anulandoMov.monto) : ''}</span>?
          </p>
          <p className="text-xs text-muted-foreground">El movimiento quedará marcado como anulado y dejará de afectar el saldo.</p>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => setAnulandoMov(null)}>Cancelar</Button>
            <Button variant="destructive" loading={anularMovMutation.isPending} onClick={() => anularMovMutation.mutate(anulandoMov!.id)}>Confirmar anulación</Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Abrir caja */}
      <Modal open={showAbrir} onClose={() => { setShowAbrir(false); abrirForm.reset(); }} title="Abrir caja">
        <form onSubmit={abrirForm.handleSubmit((d) => abrirMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Nombre de caja (opcional)"><Input placeholder="Ej: Caja principal..." {...abrirForm.register('nombre')} /></FormField>
          <FormField label="Saldo de apertura (S/)" required error={abrirForm.formState.errors.saldoApertura?.message}><Input type="number" step="0.01" placeholder="0.00" {...abrirForm.register('saldoApertura')} /></FormField>
          <FormField label="Cuenta origen" required error={abrirForm.formState.errors.cuentaOrigenId?.message}>
            <Select {...abrirForm.register('cuentaOrigenId')}>
              <option value="">Seleccionar cuenta...</option>
              {(resumenCuentas?.cuentas ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.moneda?.simbolo} {c.moneda?.codigo}) — Saldo: {c.moneda?.simbolo} {Number(c.saldoActual).toFixed(2)}
                </option>
              ))}
            </Select>
          </FormField>
          <p className="text-xs text-muted-foreground -mt-2">Se generará un movimiento de salida automático en esta cuenta por el monto del saldo de apertura.</p>
          <FormField label="Observaciones"><Textarea {...abrirForm.register('observaciones')} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowAbrir(false); abrirForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={abrirMutation.isPending}>Abrir caja</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Cerrar caja */}
      <Modal open={!!showCerrar} onClose={() => { setShowCerrar(null); cerrarForm.reset(); }} title="Cerrar caja">
        <form onSubmit={cerrarForm.handleSubmit((d) => cerrarMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Saldo de cierre (S/)" required error={cerrarForm.formState.errors.saldoCierre?.message}><Input type="number" step="0.01" placeholder="0.00" {...cerrarForm.register('saldoCierre')} /></FormField>
          <FormField label="Observaciones"><Textarea {...cerrarForm.register('observaciones')} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowCerrar(null); cerrarForm.reset(); }}>Cancelar</Button>
            <Button variant="destructive" type="submit" loading={cerrarMutation.isPending}>Cerrar caja</Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Registrar movimiento */}
      <Modal open={!!showMov} onClose={() => { setShowMov(null); movForm.reset(); }} title="Registrar movimiento">
        <form onSubmit={movForm.handleSubmit((d) => movMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Tipo" required error={movForm.formState.errors.tipo?.message}>
            <Select {...movForm.register('tipo')}><option value="INGRESO">Ingreso</option><option value="EGRESO">Egreso</option></Select>
          </FormField>
          <FormField label="Monto (S/)" required error={movForm.formState.errors.monto?.message}><Input type="number" step="0.01" placeholder="0.00" {...movForm.register('monto')} /></FormField>
          <FormField label="Concepto" required error={movForm.formState.errors.concepto?.message}><Input placeholder="Descripción del movimiento" {...movForm.register('concepto')} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Fecha" required error={movForm.formState.errors.fecha?.message}><Input type="date" {...movForm.register('fecha')} /></FormField>
            <FormField label="Referencia"><Input placeholder="N° factura, recibo..." {...movForm.register('referencia')} /></FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowMov(null); movForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={movMutation.isPending}>Registrar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
