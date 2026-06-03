// FILE: src/app/(dashboard)/facturacion/page.tsx
// MODIFICADO: campo TOTAL editable con cálculo reactivo inverso (total → subtotal/IGV/detracción)
// CAMBIOS RESPECTO AL ORIGINAL:
//   1. Schema Zod: 'total' como campo de entrada, 'subtotal' pasa a ser opcional (derivado)
//   2. calcPreview() eliminado — reemplazado por useEffect reactivo sobre [totalVal, igvVal, pctDetraccionVal]
//   3. Función pura calcularDesdeTotal() — sin side-effects, matemática SUNAT correcta
//   4. Preview se muestra siempre que haya un total válido
//   5. subtotal/igv/detraccion se envían al backend calculados (el service NO cambia)
//   6. Guard contra NaN, strings vacíos y loops de render
'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, XCircle, Upload, FileText, Download } from 'lucide-react';
import { facturacionApi, clientesApi, pedidosApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage, ESTADO_FACTURA_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import { useConfig } from '@/hooks/useConfig';
import * as XLSX from 'xlsx';

// ─── UTILIDAD DE CÁLCULO FINANCIERO ─────────────────────────────────────────
// Función pura: sin side-effects, sin acceso a estado React.
// Matemática SUNAT: el TOTAL ya incluye IGV (precio con impuesto).
// Detracción se calcula sobre el importe total (Resolución de Superintendencia SUNAT).
//
// Ejemplo: TOTAL = 1000, IGV 18%, Detracción 4%
//   subtotal   = 1000 / 1.18  = 847.46
//   igv        = 1000 - 847.46 = 152.54  ← NO recalcular igv = subtotal * 0.18
//                                           (evita acumulación de errores de redondeo)
//   detraccion = 1000 * 0.04  =  40.00
//   CHECK:       847.46 + 152.54 = 1000.00 ✓

function calcularDesdeTotal(
  totalBruto: number,
  pctIgv: number,
  pctDetraccion: number,
): { subtotal: number; igv: number; total: number; detraccion: number | undefined } {
  // Guards: entradas inválidas → valores cero seguros
  if (!isFinite(totalBruto) || totalBruto <= 0) {
    return { subtotal: 0, igv: 0, total: 0, detraccion: undefined };
  }
  const igvFactor = isFinite(pctIgv) && pctIgv > 0 ? pctIgv : 18;
  const divisor = 1 + igvFactor / 100;

  // Redondeo a 2 decimales en cada paso para consistencia contable
  const subtotal = Math.round((totalBruto / divisor) * 100) / 100;
  const igv      = Math.round((totalBruto - subtotal) * 100) / 100;
  // El total final puede diferir en ±0.01 por redondeo → usar totalBruto redondeado
  const total    = Math.round(totalBruto * 100) / 100;
  const detraccion =
    isFinite(pctDetraccion) && pctDetraccion > 0
      ? Math.round(total * (pctDetraccion / 100) * 100) / 100
      : undefined;

  return { subtotal, igv, total, detraccion };
}

// ─── SCHEMA ZOD ─────────────────────────────────────────────────────────────
// CAMBIO: 'total' es ahora el campo de entrada del usuario.
// 'subtotal' se deriva y se envía al backend, no lo ingresa el usuario.
const schema = z.object({
  clienteId:            z.string().min(1, 'Cliente requerido'),
  pedidoId:             z.string().optional(),
  serie:                z.string().min(2, 'Serie requerida').default('F001'),
  // NUEVO: total como campo de entrada principal
  total:                z.string().min(1, 'Total requerido'),
  // subtotal se calcula automáticamente — se mantiene en el form para enviarlo al backend
  subtotal:             z.string().optional(),
  porcentajeIgv:        z.string().default('18'),
  porcentajeDetraccion: z.string().optional(),
  tipoCredito:          z.string().optional(),
  diasCredito:          z.string().optional(),
  guiaReferencia:       z.string().optional(),
  detalle:              z.string().optional(),
  fechaVencimiento:     z.string().min(1, 'Fecha requerida'),
  observaciones:        z.string().optional(),
});
type FormData = z.infer<typeof schema>;

// ─── PARSER XML SUNAT (sin cambios) ─────────────────────────────────────────
function parseXmlSunat(xmlText: string): Record<string, unknown> | null {
  try {
    const get = (tag: string) => {
      const m = xmlText.match(new RegExp(`<[^/]*${tag}[^>]*>([^<]+)<`, 'i'));
      return m ? m[1].trim() : '';
    };
    const serie = get('ID') || get('serie') || '';
    const correlativoRaw = get('correlativo') || '';
    const ruc = get('RUC') || get('RegistrationName') || get('ID') || '';
    const razonSocial = get('RegistrationName') || get('PartyName') || get('razonSocial') || '';
    const subtotalRaw = get('TaxExclusiveAmount') || get('subtotal') || '0';
    const igvRaw = get('TaxAmount') || get('igv') || '0';
    const totalRaw = get('PayableAmount') || get('total') || '0';
    const fecha = get('IssueDate') || new Date().toISOString().split('T')[0];

    const serieMatch = serie.match(/([FBE]\d{3})/);
    const corrMatch = (serie + correlativoRaw).match(/(\d{8,})/);

    return {
      serie: serieMatch ? serieMatch[1] : serie.substring(0, 4),
      correlativo: corrMatch ? corrMatch[1] : correlativoRaw,
      ruc,
      razonSocial,
      subtotal: parseFloat(subtotalRaw) || 0,
      igv: parseFloat(igvRaw) || 0,
      total: parseFloat(totalRaw) || 0,
      fechaEmision: fecha,
    };
  } catch {
    return null;
  }
}

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function FacturacionPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const config = useConfig();
  const [filtroEstado, setFiltroEstado] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showXmlMasivo, setShowXmlMasivo] = useState(false);

  // CAMBIO: preview ahora incluye 'total' como campo visible
  const [preview, setPreview] = useState<{
    subtotal: number;
    igv: number;
    total: number;
    detraccion?: number;
    vencimiento?: string;
  } | null>(null);

  const [xmlMasivoResult, setXmlMasivoResult] = useState<{
    creadas: number;
    duplicadas: number;
    errores: string[];
  } | null>(null);

  const xmlMasivoRef = useRef<HTMLInputElement>(null);
  const xmlSingleRef = useRef<HTMLInputElement>(null);

  // ─── QUERIES (sin cambios) ────────────────────────────────────────────────
  const { data: facturas = [], isLoading } = useQuery({
    queryKey: ['facturas', filtroEstado],
    queryFn: () => facturacionApi.listar({ estado: filtroEstado || undefined }).then((r) => r.data.data),
  });

  const { data: series = [] } = useQuery({
    queryKey: ['series'],
    queryFn: () => facturacionApi.series().then((r) => r.data.data),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => clientesApi.listar().then((r) => r.data.data),
  });

  const { data: pedidosActivos = [] } = useQuery({
    queryKey: ['pedidos', 'ACTIVO'],
    queryFn: () => pedidosApi.listar({ estado: 'ACTIVO' as any }).then((r) => r.data.data),
  });

  // ─── REACT HOOK FORM ─────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      serie: 'F001',
      porcentajeIgv: String(config.igvPorcentaje || 18),
    },
  });

  // CAMBIO: ahora observamos 'total' en lugar de 'subtotal' como fuente de verdad
  const [serieVal, totalVal, igvVal, pctDetraccionVal, tipoCredito, diasCredito] =
    watch(['serie', 'total', 'porcentajeIgv', 'porcentajeDetraccion', 'tipoCredito', 'diasCredito']);

  // ─── EFECTO REACTIVO DE CÁLCULO ──────────────────────────────────────────
  // CAMBIO PRINCIPAL: useEffect con dependencias solo en los campos de ENTRADA.
  // NUNCA incluir 'subtotal' en las dependencias → evita loops infinitos.
  // Se activa en tiempo real mientras el usuario escribe.
  useEffect(() => {
    const totalNum   = parseFloat(totalVal || '');
    const igvNum     = parseFloat(igvVal || '18');
    const detNum     = parseFloat(pctDetraccionVal || '0');

    // Guard: si total no es un número válido y positivo, limpiar preview
    if (!isFinite(totalNum) || totalNum <= 0) {
      setPreview(null);
      // Limpiar subtotal oculto para no enviar datos stale
      setValue('subtotal', '', { shouldValidate: false, shouldDirty: false });
      return;
    }

    const calc = calcularDesdeTotal(totalNum, igvNum, detNum);

    // Actualizar subtotal en RHF (campo oculto que se envía al backend)
    // shouldValidate: false → no re-dispara validación del form
    // shouldDirty: false   → no marca el campo como "tocado"
    setValue('subtotal', String(calc.subtotal), { shouldValidate: false, shouldDirty: false });

    // Calcular vencimiento si hay crédito configurado
    let venc: string | undefined;
    const diasNum = parseInt(diasCredito || '0');
    if (tipoCredito && diasNum > 0) {
      const d = new Date();
      d.setDate(d.getDate() + diasNum);
      venc = d.toLocaleDateString('es-PE');
      setValue('fechaVencimiento', d.toISOString().split('T')[0]);
    }

    setPreview({
      subtotal:   calc.subtotal,
      igv:        calc.igv,
      total:      calc.total,
      detraccion: calc.detraccion,
      vencimiento: venc,
    });
  // IMPORTANTE: solo depende de los campos de ENTRADA, nunca de 'subtotal'
  }, [totalVal, igvVal, pctDetraccionVal, tipoCredito, diasCredito]);
  // setValue está excluido intencionalmente — es estable por diseño de RHF

  // ─── HELPERS ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['facturas'] });
    qc.invalidateQueries({ queryKey: ['series'] });
  };

  // ─── MUTATIONS ───────────────────────────────────────────────────────────
  // CAMBIO: el backend sigue recibiendo 'subtotal' (ya calculado por useEffect).
  // El service.ts NO cambia — su fuente de verdad sigue siendo subtotal.
  const createMutation = useMutation({
    mutationFn: (d: FormData) => {
      // Usar el subtotal calculado; si por algún edge case no existe, recalcular
      const totalNum = parseFloat(d.total || '0');
      const igvNum   = parseFloat(d.porcentajeIgv || '18');
      const detNum   = parseFloat(d.porcentajeDetraccion || '0');
      const calc     = calcularDesdeTotal(totalNum, igvNum, detNum);
      const subtotalFinal = calc.subtotal > 0 ? calc.subtotal : parseFloat(d.subtotal || '0');

      return facturacionApi.crear({
        clienteId:            parseInt(d.clienteId),
        pedidoId:             d.pedidoId ? parseInt(d.pedidoId) : undefined,
        serie:                d.serie,
        subtotal:             subtotalFinal,             // ← backend recibe subtotal calculado
        porcentajeIgv:        parseFloat(d.porcentajeIgv || '18'),
        porcentajeDetraccion: d.porcentajeDetraccion ? parseFloat(d.porcentajeDetraccion) : undefined,
        tipoCredito:          d.tipoCredito || undefined,
        diasCredito:          d.diasCredito ? parseInt(d.diasCredito) : undefined,
        guiaReferencia:       d.guiaReferencia,
        detalle:              d.detalle,
        fechaVencimiento:     d.fechaVencimiento,
        observaciones:        d.observaciones,
      });
    },
    onSuccess: () => {
      toast.success('Factura emitida');
      setShowForm(false);
      reset();
      setPreview(null);
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const anularMutation = useMutation({
    mutationFn: (id: number) => facturacionApi.anular(id),
    onSuccess: () => { toast.success('Factura anulada'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const xmlMasivoMutation = useMutation({
    mutationFn: (xmlList: Record<string, unknown>[]) => facturacionApi.importacionMasivaXml(xmlList),
    onSuccess: (res) => { setXmlMasivoResult(res.data.data); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ─── HANDLERS XML (sin cambios) ───────────────────────────────────────────
  const handleXmlSingle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const datos = parseXmlSunat(text);
      if (!datos) { toast.error('No se pudo leer el XML'); return; }
      // CAMBIO: al importar XML, cargar el 'total' del XML en el campo total
      if (datos.total && Number(datos.total) > 0) {
        setValue('total', String(datos.total));
      }
      toast.success('XML leído — datos autocargados');
      toast.info(`${datos.serie}-${datos.correlativo} | RUC: ${datos.ruc}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleXmlMasivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const xmlList: Record<string, unknown>[] = [];
    await Promise.all(
      files.map(
        (file) =>
          new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              const datos = parseXmlSunat(ev.target?.result as string);
              if (datos) xmlList.push(datos);
              resolve();
            };
            reader.readAsText(file);
          }),
      ),
    );
    setXmlMasivoResult(null);
    xmlMasivoMutation.mutate(xmlList);
    e.target.value = '';
  };

  // ─── EXPORT EXCEL (sin cambios) ───────────────────────────────────────────
  const exportExcel = () => {
    const rows = facturas.map((f) => ({
      'N° Factura': f.numeroFactura,
      Serie:        f.serie,
      Correlativo:  f.correlativo,
      Cliente:      f.cliente?.razonSocial,
      RUC:          f.cliente?.ruc,
      Subtotal:     Number(f.subtotal),
      IGV:          Number(f.igv),
      Total:        Number(f.total),
      Estado:       ESTADO_FACTURA_LABEL[f.estado] ?? f.estado,
      Emisión:      formatDate(f.fechaEmision),
      Vencimiento:  formatDate(f.fechaVencimiento),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Facturación');
    XLSX.writeFile(wb, `facturacion_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ─── STATS (sin cambios) ──────────────────────────────────────────────────
  const allSeries = [...new Set(['F001', 'F002', 'B001', ...series])];
  const totalFacturado = facturas
    .filter((f) => f.estado !== 'ANULADA')
    .reduce((s, f) => s + Number(f.total), 0);
  const totalPagado = facturas
    .filter((f) => f.estado === 'PAGADA')
    .reduce((s, f) => s + Number(f.total), 0);
  const totalParcial = facturas
    .filter((f) => f.estado === 'PARCIAL')
    .reduce((s, f) => s + Number(f.totalPagado), 0);

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="page-container">
      <PageHeader
        title="Facturación"
        description={`${facturas.length} factura${facturas.length !== 1 ? 's' : ''}`}
        action={
          <div className="flex gap-2 flex-wrap">
            <Button variant="secondary" size="sm" onClick={exportExcel}>
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { setShowXmlMasivo(true); setXmlMasivoResult(null); }}
            >
              <Upload className="w-4 h-4" /> XML Masivo
            </Button>
            <Button onClick={() => { setShowForm(true); reset(); setPreview(null); }}>
              <Plus className="w-4 h-4" /> Nueva factura
            </Button>
          </div>
        }
      />

      {/* Stats (sin cambios) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total facturado"  value={formatCurrency(totalFacturado)}                      color="blue"    />
        <StatCard label="Total cobrado"    value={formatCurrency(totalPagado + totalParcial)}           color="green"   />
        <StatCard label="Por cobrar"       value={formatCurrency(totalFacturado - totalPagado - totalParcial)} color="yellow" />
        <StatCard label="Emitidas"         value={facturas.filter((f) => f.estado === 'EMITIDA').length} color="default" />
      </div>

      {/* Filtros (sin cambios) */}
      <div className="flex gap-3 flex-wrap">
        <Select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="w-44"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_FACTURA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
      </div>

      {/* Tabla (sin cambios) */}
      {isLoading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>N° Factura</Th><Th>Cliente</Th><Th>Detalle</Th>
              <Th>Subtotal</Th><Th>IGV</Th><Th>Total</Th>
              <Th>Pagado</Th><Th>Estado</Th><Th>Vencimiento</Th>
              {usuario?.rol === 'ADMIN' && <Th>Acc.</Th>}
            </tr>
          </thead>
          <tbody>
            {facturas.length > 0 ? (
              facturas.map((f) => (
                <Tr key={f.id}>
                  <Td><span className="font-mono text-xs font-bold">{f.numeroFactura}</span></Td>
                  <Td>
                    <div>
                      <p className="text-sm font-medium">{f.cliente?.razonSocial}</p>
                      <p className="text-xs text-muted-foreground">{f.cliente?.ruc}</p>
                    </div>
                  </Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">
                      {f.detalle
                        ? f.detalle.substring(0, 30) + (f.detalle.length > 30 ? '…' : '')
                        : '—'}
                    </span>
                  </Td>
                  <Td><span className="text-sm">{formatCurrency(Number(f.subtotal))}</span></Td>
                  <Td><span className="text-sm text-muted-foreground">{formatCurrency(Number(f.igv))}</span></Td>
                  <Td><span className="font-semibold">{formatCurrency(Number(f.total))}</span></Td>
                  <Td>
                    <div>
                      <span className="text-sm text-emerald-500 font-medium">
                        {formatCurrency(Number(f.totalPagado))}
                      </span>
                      {Number(f.total) - Number(f.totalPagado) > 0.01 && (
                        <p className="text-xs text-muted-foreground">
                          Saldo: {formatCurrency(Number(f.total) - Number(f.totalPagado))}
                        </p>
                      )}
                    </div>
                  </Td>
                  <Td><Badge value={f.estado} label={ESTADO_FACTURA_LABEL[f.estado]} /></Td>
                  <Td>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(f.fechaVencimiento)}
                    </span>
                  </Td>
                  {usuario?.rol === 'ADMIN' && (
                    <Td>
                      {f.estado !== 'ANULADA' && f.estado !== 'PAGADA' && (
                        <button
                          onClick={() => {
                            if (confirm('¿Anular factura?')) anularMutation.mutate(f.id);
                          }}
                          className="flex items-center gap-1 text-xs text-destructive hover:underline"
                        >
                          <XCircle className="w-3 h-3" /> Anular
                        </button>
                      )}
                    </Td>
                  )}
                </Tr>
              ))
            ) : (
              <tr>
                <td colSpan={10}>
                  <EmptyState message="No hay facturas" />
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      {/* ─── MODAL: NUEVA FACTURA ─────────────────────────────────────────── */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); reset(); setPreview(null); }}
        title="Nueva factura"
        maxWidth="max-w-2xl"
      >
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">

          {/* XML single import (sin cambios) */}
          <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-dashed border-border">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground flex-1">
              Importar desde XML SUNAT para autocompletar
            </p>
            <input
              ref={xmlSingleRef}
              type="file"
              accept=".xml"
              className="hidden"
              onChange={handleXmlSingle}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => xmlSingleRef.current?.click()}
            >
              <Upload className="w-3 h-3" /> Subir XML
            </Button>
          </div>

          {/* Cliente + Serie (sin cambios) */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <FormField label="Cliente" required error={errors.clienteId?.message}>
                <Select {...register('clienteId')}>
                  <option value="">Seleccionar cliente...</option>
                  {clientes
                    .filter((c) => c.activo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.razonSocial} — {c.ruc}
                      </option>
                    ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Serie" required error={errors.serie?.message}>
              <Select {...register('serie')} onChange={(e) => setValue('serie', e.target.value)}>
                {allSeries.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
                <option value="_nueva">+ Nueva serie</option>
              </Select>
            </FormField>
          </div>

          {serieVal === '_nueva' && (
            <FormField label="Ingresar nueva serie (ej: F003)">
              <Input
                placeholder="F003"
                maxLength={4}
                onBlur={(e) => setValue('serie', e.target.value.toUpperCase())}
              />
            </FormField>
          )}

          {/* Pedido + Guía (sin cambios) */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pedido relacionado">
              <Select {...register('pedidoId')}>
                <option value="">Sin pedido</option>
                {pedidosActivos.map((p) => (
                  <option key={p.id} value={p.id}>
                    #{p.id} — {p.origen} → {p.destino}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Guía de referencia" error={errors.guiaReferencia?.message}>
              <Input placeholder="Número de guía" {...register('guiaReferencia')} />
            </FormField>
          </div>

          {/* Detalle (sin cambios) */}
          <FormField label="Detalle / descripción" error={errors.detalle?.message}>
            <Textarea
              placeholder="Servicio de transporte Lima–Trujillo, etc."
              rows={2}
              {...register('detalle')}
            />
          </FormField>

          {/* ── SECCIÓN FINANCIERA — CAMBIO PRINCIPAL ── */}
          {/* El usuario ahora ingresa el TOTAL; subtotal e IGV se calculan automáticamente */}
          <div className="grid grid-cols-3 gap-3">
            {/* NUEVO: Total como campo de entrada */}
            <FormField
              label="Total (S/) con IGV"
              required
              error={errors.total?.message}
            >
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                {...register('total')}
                // Sin onBlur: el useEffect ya escucha onChange en tiempo real
              />
            </FormField>

            {/* % IGV: sigue editable, permite ajustar si la tasa cambia */}
            <FormField label="% IGV" error={errors.porcentajeIgv?.message}>
              <Input
                type="number"
                step="0.01"
                placeholder="18"
                {...register('porcentajeIgv')}
              />
            </FormField>

            {/* % Detracción: sin cambios */}
            <FormField label="% Detracción" error={errors.porcentajeDetraccion?.message}>
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                {...register('porcentajeDetraccion')}
              />
            </FormField>
          </div>

          {/* Campo oculto: subtotal calculado → se envía al backend */}
          {/* Oculto visualmente pero presente en el form para el submit */}
          <input type="hidden" {...register('subtotal')} />

          {/* Preview financiero — ahora reactivo en tiempo real */}
          {preview && preview.total > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 overflow-hidden">
              <p className="text-xs text-muted-foreground px-3 pt-2 pb-1 border-b border-border/50">
                Desglose calculado automáticamente
              </p>
              <div className={`grid ${preview.detraccion != null ? 'grid-cols-4' : 'grid-cols-3'} divide-x divide-border`}>
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Subtotal (sin IGV)</p>
                  <p className="font-medium text-sm">{formatCurrency(preview.subtotal)}</p>
                </div>
                <div className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">IGV ({igvVal || 18}%)</p>
                  <p className="font-medium text-sm">{formatCurrency(preview.igv)}</p>
                </div>
                <div className="p-3 text-center bg-primary/5">
                  <p className="text-xs text-muted-foreground mb-1">Total</p>
                  <p className="font-bold text-primary">{formatCurrency(preview.total)}</p>
                </div>
                {preview.detraccion != null && (
                  <div className="p-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">
                      Detracción ({pctDetraccionVal}%)
                    </p>
                    <p className="font-medium text-sm text-yellow-500">
                      {formatCurrency(preview.detraccion)}
                    </p>
                  </div>
                )}
              </div>
              {/* Verificación de consistencia matemática */}
              <p className="text-xs text-muted-foreground text-center pb-2 opacity-60">
                {formatCurrency(preview.subtotal)} + {formatCurrency(preview.igv)} ={' '}
                {formatCurrency(Math.round((preview.subtotal + preview.igv) * 100) / 100)}
              </p>
            </div>
          )}

          {/* Crédito y vencimiento (sin cambios estructurales) */}
          <div className="grid grid-cols-3 gap-3">
            <FormField label="Tipo crédito" error={errors.tipoCredito?.message}>
              <Select
                {...register('tipoCredito')}
                onChange={(e) => setValue('tipoCredito', e.target.value)}
              >
                <option value="">Contado</option>
                <option value="7">7 días</option>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="60">60 días</option>
                <option value="custom">Personalizado</option>
              </Select>
            </FormField>
            {watch('tipoCredito') === 'custom' && (
              <FormField label="Días de crédito" error={errors.diasCredito?.message}>
                <Input
                  type="number"
                  placeholder="30"
                  {...register('diasCredito')}
                />
              </FormField>
            )}
            <FormField
              label="Fecha vencimiento"
              required
              error={errors.fechaVencimiento?.message}
            >
              <Input type="date" {...register('fechaVencimiento')} />
            </FormField>
          </div>

          {preview?.vencimiento && (
            <p className="text-xs text-muted-foreground -mt-2">
              Vencimiento calculado: {preview.vencimiento}
            </p>
          )}

          {/* Observaciones (sin cambios) */}
          <FormField label="Observaciones">
            <Textarea
              placeholder="Notas adicionales..."
              {...register('observaciones')}
            />
          </FormField>

          {/* Acciones (sin cambios) */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="secondary"
              type="button"
              onClick={() => { setShowForm(false); reset(); setPreview(null); }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>
              Emitir factura
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL: XML MASIVO (sin cambios) ─────────────────────────────── */}
      <Modal
        open={showXmlMasivo}
        onClose={() => setShowXmlMasivo(false)}
        title="Importación masiva de XML SUNAT"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Sube múltiples archivos XML de SUNAT. El sistema creará una factura por cada XML válido,
            detectando duplicados automáticamente.
          </p>
          <input
            ref={xmlMasivoRef}
            type="file"
            accept=".xml"
            multiple
            className="hidden"
            onChange={handleXmlMasivo}
          />
          <button
            onClick={() => xmlMasivoRef.current?.click()}
            disabled={xmlMasivoMutation.isPending}
            className="w-full border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 hover:border-primary/50 hover:bg-muted/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <Upload className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm font-medium">Haz clic para seleccionar archivos XML</p>
            <p className="text-xs text-muted-foreground">Puedes seleccionar múltiples archivos a la vez</p>
          </button>

          {xmlMasivoMutation.isPending && (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                Procesando XMLs...
              </div>
            </div>
          )}

          {xmlMasivoResult && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="bg-muted/40 px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">Resultado de importación</p>
              </div>
              <div className="grid grid-cols-3 divide-x divide-border">
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-500">{xmlMasivoResult.creadas}</p>
                  <p className="text-xs text-muted-foreground mt-1">Creadas</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-yellow-500">{xmlMasivoResult.duplicadas}</p>
                  <p className="text-xs text-muted-foreground mt-1">Duplicadas</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-2xl font-bold text-destructive">{xmlMasivoResult.errores.length}</p>
                  <p className="text-xs text-muted-foreground mt-1">Errores</p>
                </div>
              </div>
              {xmlMasivoResult.errores.length > 0 && (
                <div className="px-4 py-3 border-t border-border bg-destructive/5">
                  <p className="text-xs font-medium text-destructive mb-1">Errores:</p>
                  {xmlMasivoResult.errores.map((err, i) => (
                    <p key={i} className="text-xs text-muted-foreground">• {err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => setShowXmlMasivo(false)}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
