// FILE: src/app/(dashboard)/facturacion/page.tsx
// REDISEÑO: Factura real con líneas de detalle configurables desde TablaMaestra
//
// CAMBIOS RESPECTO A LA VERSIÓN ANTERIOR:
//   1. Fecha de Emisión: campo obligatorio, visible, guardado en BD
//   2. Fecha Vencimiento: calculada automáticamente (emisión + días del tipo crédito), no editable
//   3. Nuevo detalle de factura: tabla con Cantidad / Unidad / Código / Descripción / V.Unitario / Importe
//   4. Descripción automática al seleccionar código (editable por el usuario)
//   5. Múltiples líneas: agregar / eliminar / recalcular
//   6. Cálculos automáticos: Importe = Cantidad × V.Unitario, Subtotal/IGV/Detracción/Total al pie
//   7. Configuración dinámica: unidades y códigos desde TablaMaestra (tipo=unidad_medida / codigo_factura)
//
// LO QUE NO CAMBIA:
//   - Flujo Pedidos ↔ Facturación (FACTURADO / anulación / filtros por cliente)
//   - calcularDesdeTotal() — reutilizada para IGV/detracción
//   - Lista/tabla de facturas existentes
//   - Importación XML masiva
//   - Stats

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, XCircle, Upload, FileText, Download, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { facturacionApi, clientesApi, pedidosApi, configuracionApi } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage, ESTADO_FACTURA_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { useAuthStore } from '@/store/auth.store';
import { useConfig } from '@/hooks/useConfig';
import * as XLSX from 'xlsx';

// ─── UTILIDAD DE CÁLCULO FINANCIERO (sin cambios) ────────────────────────────
// Matemática SUNAT: el TOTAL ya incluye IGV. Detracción sobre el total.
function calcularDesdeTotal(
  totalBruto: number,
  pctIgv: number,
  pctDetraccion: number,
): { subtotal: number; igv: number; total: number; detraccion: number | undefined } {
  if (!isFinite(totalBruto) || totalBruto <= 0) {
    return { subtotal: 0, igv: 0, total: 0, detraccion: undefined };
  }
  const igvFactor = isFinite(pctIgv) && pctIgv > 0 ? pctIgv : 18;
  const divisor = 1 + igvFactor / 100;
  const subtotal = Math.round((totalBruto / divisor) * 100) / 100;
  const igv      = Math.round((totalBruto - subtotal) * 100) / 100;
  const total    = Math.round(totalBruto * 100) / 100;
  const detraccion =
    isFinite(pctDetraccion) && pctDetraccion > 0
      ? Math.round(total * (pctDetraccion / 100) * 100) / 100
      : undefined;
  return { subtotal, igv, total, detraccion };
}

// ─── MAPEO TIPO CRÉDITO → DÍAS (espejo del backend) ──────────────────────────
const DIAS_POR_TIPO_CREDITO: Record<string, number> = {
  '':    0,
  '0':   0,
  '7':   7,
  '15':  15,
  '30':  30,
  '45':  45,
  '60':  60,
};

function calcularFechaVencimiento(fechaEmision: string, tipoCredito: string, diasCustom?: number): string {
  if (!fechaEmision) return '';
  const dias =
    diasCustom !== undefined && diasCustom > 0
      ? diasCustom
      : (DIAS_POR_TIPO_CREDITO[tipoCredito] ?? 0);
  const d = new Date(fechaEmision + 'T12:00:00'); // evita desfase TZ
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

// ─── PARSER XML SUNAT (sin cambios) ──────────────────────────────────────────
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
      ruc, razonSocial,
      subtotal: parseFloat(subtotalRaw) || 0,
      igv: parseFloat(igvRaw) || 0,
      total: parseFloat(totalRaw) || 0,
      fechaEmision: fecha,
    };
  } catch { return null; }
}

// ─── SCHEMA ZOD ──────────────────────────────────────────────────────────────
const lineaSchema = z.object({
  cantidad:      z.string().min(1, 'Requerido'),
  unidadMedida:  z.string().min(1, 'Requerido'),
  codigo:        z.string().min(1, 'Requerido'),
  descripcion:   z.string().min(1, 'Requerido'),
  valorUnitario: z.string().min(1, 'Requerido'),
  // importe se calcula — lo guardamos como string en el form
  importe:       z.string().optional(),
});

const schema = z.object({
  clienteId:            z.string().min(1, 'Cliente requerido'),
  pedidoId:             z.string().optional(),
  serie:                z.string().min(2, 'Serie requerida').default('F001'),
  // PARTE 1: fecha de emisión obligatoria
  fechaEmision:         z.string().min(1, 'Fecha de emisión requerida'),
  porcentajeIgv:        z.string().default('18'),
  porcentajeDetraccion: z.string().optional(),
  tipoCredito:          z.string().optional(),
  diasCredito:          z.string().optional(),
  guiaReferencia:       z.string().optional(),
  observaciones:        z.string().optional(),
  // PARTE 3: líneas de detalle (al menos 1)
  lineas: z.array(lineaSchema).min(1, 'Debe agregar al menos una línea'),
});
type FormData = z.infer<typeof schema>;

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
export default function FacturacionPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const config = useConfig();
  const [filtroEstado, setFiltroEstado] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showXmlMasivo, setShowXmlMasivo] = useState(false);
  const [xmlMasivoResult, setXmlMasivoResult] = useState<{
    creadas: number; duplicadas: number; errores: string[];
  } | null>(null);
  const xmlMasivoRef = useRef<HTMLInputElement>(null);
  const xmlSingleRef = useRef<HTMLInputElement>(null);

  // ─── QUERIES ─────────────────────────────────────────────────────────────
  const { data: facturasRaw = [], isLoading } = useQuery({
    queryKey: ['facturas', filtroEstado, filtroDesde, filtroHasta],
    queryFn: () => facturacionApi.listar({
      estado: filtroEstado || undefined,
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
    }).then((r) => r.data.data),
  });

  // Filtro client-side por número de factura y cliente
  const facturas = facturasRaw.filter((f) => {
    if (!searchText) return true;
    const q = searchText.toLowerCase();
    return (
      f.numeroFactura?.toLowerCase().includes(q) ||
      f.cliente?.razonSocial?.toLowerCase().includes(q) ||
      f.cliente?.ruc?.toLowerCase().includes(q)
    );
  });

  const { data: series = [] } = useQuery({
    queryKey: ['series'],
    queryFn: () => facturacionApi.series().then((r) => r.data.data),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => clientesApi.listar().then((r) => r.data.data),
  });

  // PARTE 7: unidades de medida desde TablaMaestra
  const { data: unidadesMedida = [] } = useQuery({
    queryKey: ['tablas', 'unidad_medida'],
    queryFn: () => configuracionApi.getTablaMaestra('unidad_medida').then((r) => r.data.data),
    staleTime: 10 * 60 * 1000,
  });

  // PARTE 7: códigos de facturación desde TablaMaestra
  const { data: codigosFactura = [] } = useQuery({
    queryKey: ['tablas', 'codigo_factura'],
    queryFn: () => configuracionApi.getTablaMaestra('codigo_factura').then((r) => r.data.data),
    staleTime: 10 * 60 * 1000,
  });

  // ─── REACT HOOK FORM ─────────────────────────────────────────────────────
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      serie: 'F001',
      porcentajeIgv: String(config.igvPorcentaje || 18),
      fechaEmision: new Date().toISOString().split('T')[0],
      lineas: [{ cantidad: '1', unidadMedida: 'NIU', codigo: '', descripcion: '', valorUnitario: '', importe: '0' }],
    },
  });

  // useFieldArray para el detalle dinámico
  const { fields, append, remove } = useFieldArray({ control, name: 'lineas' });

  const [serieVal, igvVal, pctDetraccionVal, tipoCredito, diasCredito, fechaEmisionVal] =
    watch(['serie', 'porcentajeIgv', 'porcentajeDetraccion', 'tipoCredito', 'diasCredito', 'fechaEmision']);

  const clienteIdVal = watch('clienteId');
  const clienteIdNum = parseInt(clienteIdVal || '0');
  const lineasVal = watch('lineas');

  // ─── PEDIDOS DISPONIBLES ─────────────────────────────────────────────────
  const { data: pedidosDisponibles = [], isFetching: loadingPedidos } = useQuery({
    queryKey: ['pedidos', 'disponibles', clienteIdNum],
    queryFn: () =>
      clienteIdNum > 0
        ? pedidosApi.disponibles(clienteIdNum).then((r) => r.data.data)
        : Promise.resolve([]),
    enabled: clienteIdNum > 0,
  });

  // Limpiar pedido al cambiar cliente
  useEffect(() => {
    setValue('pedidoId', '', { shouldValidate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteIdVal]);

  // ─── CÁLCULOS DE LÍNEAS ───────────────────────────────────────────────────
  // Importe de cada línea = cantidad × valorUnitario
  const importesLineas = lineasVal.map((l) => {
    const cant = parseFloat(l.cantidad || '0');
    const vu   = parseFloat(l.valorUnitario || '0');
    return isFinite(cant) && isFinite(vu) ? Math.round(cant * vu * 100) / 100 : 0;
  });

  // El subtotal es la suma de los importes de líneas (base para IGV)
  const subtotalLineas = importesLineas.reduce((s, v) => s + v, 0);

  // IGV y total generales calculados desde el subtotal de líneas
  const pctIgv = parseFloat(igvVal || '18');
  const pctDet = parseFloat(pctDetraccionVal || '0');
  const igvCalc        = Math.round(subtotalLineas * (pctIgv / 100) * 100) / 100;
  const totalCalc      = Math.round((subtotalLineas + igvCalc) * 100) / 100;
  const detraccionCalc =
    isFinite(pctDet) && pctDet > 0
      ? Math.round(totalCalc * (pctDet / 100) * 100) / 100
      : undefined;

  // PARTE 2: fecha de vencimiento calculada automáticamente
  const fechaVencimientoCalc = calcularFechaVencimiento(
    fechaEmisionVal || '',
    tipoCredito || '',
    diasCredito ? parseInt(diasCredito) : undefined,
  );

  // ─── AUTOCOMPLETAR DESCRIPCIÓN AL SELECCIONAR CÓDIGO (PARTE 4) ───────────
  const handleCodigoChange = useCallback((index: number, codigo: string) => {
    const entrada = codigosFactura.find((c) => c.codigo === codigo);
    if (entrada) {
      setValue(`lineas.${index}.descripcion`, entrada.nombre, { shouldValidate: false });
    }
  }, [codigosFactura, setValue]);

  // ─── HELPERS ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['facturas'] });
    qc.invalidateQueries({ queryKey: ['series'] });
  };

  const allSeries = [...new Set(['F001', 'F002', 'B001', ...series])];

  // ─── MUTATIONS ───────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (d: FormData) => {
      const lineasPayload = d.lineas.map((l, idx) => ({
        orden: idx,
        cantidad: parseFloat(l.cantidad),
        unidadMedida: l.unidadMedida,
        codigo: l.codigo,
        descripcion: l.descripcion,
        valorUnitario: parseFloat(l.valorUnitario),
        importe: importesLineas[idx] ?? 0,
      }));

      return facturacionApi.crear({
        clienteId:            parseInt(d.clienteId),
        pedidoId:             d.pedidoId ? parseInt(d.pedidoId) : undefined,
        serie:                d.serie,
        subtotal:             subtotalLineas,
        porcentajeIgv:        parseFloat(d.porcentajeIgv || '18'),
        porcentajeDetraccion: d.porcentajeDetraccion ? parseFloat(d.porcentajeDetraccion) : undefined,
        tipoCredito:          d.tipoCredito || undefined,
        diasCredito:          d.diasCredito ? parseInt(d.diasCredito) : undefined,
        guiaReferencia:       d.guiaReferencia,
        // El detalle principal se construye desde las líneas (primera línea o todas)
        detalle:              lineasPayload.map((l) => l.descripcion).join(' / ').substring(0, 200),
        fechaEmision:         d.fechaEmision,
        observaciones:        d.observaciones,
        lineas:               lineasPayload,
      });
    },
    onSuccess: () => {
      toast.success('Factura emitida');
      setShowForm(false);
      reset();
      invalidate();
      qc.invalidateQueries({ queryKey: ['pedidos', 'disponibles'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const anularMutation = useMutation({
    mutationFn: (id: number) => facturacionApi.anular(id),
    onSuccess: () => {
      toast.success('Factura anulada');
      invalidate();
      qc.invalidateQueries({ queryKey: ['pedidos', 'disponibles'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const xmlMasivoMutation = useMutation({
    mutationFn: (xmlList: Record<string, unknown>[]) => facturacionApi.importacionMasivaXml(xmlList),
    onSuccess: (res) => { setXmlMasivoResult(res.data.data); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ─── HANDLERS XML (sin cambios funcionales) ───────────────────────────────
  const handleXmlSingle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const datos = parseXmlSunat(text);
      if (!datos) { toast.error('No se pudo leer el XML'); return; }
      if (datos.fechaEmision) setValue('fechaEmision', String(datos.fechaEmision));
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
            <Button onClick={() => {
              reset({
                serie: 'F001',
                porcentajeIgv: String(config.igvPorcentaje || 18),
                fechaEmision: new Date().toISOString().split('T')[0],
                lineas: [{ cantidad: '1', unidadMedida: 'NIU', codigo: '', descripcion: '', valorUnitario: '', importe: '0' }],
              });
              setShowForm(true);
            }}>
              <Plus className="w-4 h-4" /> Nueva factura
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total facturado"  value={formatCurrency(totalFacturado)}                             color="blue"    />
        <StatCard label="Total cobrado"    value={formatCurrency(totalPagado + totalParcial)}                  color="green"   />
        <StatCard label="Por cobrar"       value={formatCurrency(totalFacturado - totalPagado - totalParcial)} color="yellow"  />
        <StatCard label="Emitidas"         value={facturas.filter((f) => f.estado === 'EMITIDA').length}       color="default" />
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por N° factura o cliente…"
            className="pl-9 w-64"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </div>
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
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" className="w-36" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" className="w-36" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
        </div>
        {(searchText || filtroDesde || filtroHasta) && (
          <button
            onClick={() => { setSearchText(''); setFiltroDesde(''); setFiltroHasta(''); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Tabla */}
      {isLoading ? (
        <TableSkeleton rows={6} cols={8} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>N° Factura</Th><Th>Cliente</Th><Th>Detalle</Th>
              <Th>Subtotal</Th><Th>IGV</Th><Th>Total</Th>
              <Th>Pagado</Th><Th>Estado</Th><Th>Emisión</Th><Th>Vencimiento</Th>
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
                  <Td><span className="text-xs text-muted-foreground">{formatDate(f.fechaEmision)}</span></Td>
                  <Td><span className="text-xs text-muted-foreground">{formatDate(f.fechaVencimiento)}</span></Td>
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
                <td colSpan={11}>
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
        onClose={() => { setShowForm(false); reset(); }}
        title="Nueva factura"
        maxWidth="max-w-4xl"
      >
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-5">

          {/* XML single import */}
          <div className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg border border-dashed border-border">
            <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground flex-1">
              Importar desde XML SUNAT para autocompletar
            </p>
            <input ref={xmlSingleRef} type="file" accept=".xml" className="hidden" onChange={handleXmlSingle} />
            <Button type="button" variant="secondary" size="sm" onClick={() => xmlSingleRef.current?.click()}>
              <Upload className="w-3 h-3" /> Subir XML
            </Button>
          </div>

          {/* ── SECCIÓN 1: Cabecera ── */}
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
                {allSeries.map((s) => <option key={s} value={s}>{s}</option>)}
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

          {/* Pedido + Guía */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Pedido relacionado">
              {clienteIdNum > 0 ? (
                <Select {...register('pedidoId')} disabled={loadingPedidos}>
                  <option value="">{loadingPedidos ? 'Cargando...' : 'Sin pedido'}</option>
                  {pedidosDisponibles.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.id} — {p.origen} → {p.destino}
                    </option>
                  ))}
                  {!loadingPedidos && pedidosDisponibles.length === 0 && (
                    <option value="" disabled>Sin pedidos disponibles</option>
                  )}
                </Select>
              ) : (
                <Select disabled><option value="">Primero seleccione un cliente</option></Select>
              )}
            </FormField>
            <FormField label="Guía de referencia" error={errors.guiaReferencia?.message}>
              <Input placeholder="Número de guía" {...register('guiaReferencia')} />
            </FormField>
          </div>

          {/* ── SECCIÓN 2: Fechas ── */}
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border p-3 bg-muted/20">
            <p className="col-span-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide -mb-1">
              Fechas y crédito
            </p>

            {/* PARTE 1: Fecha de emisión obligatoria */}
            <FormField label="Fecha de emisión" required error={errors.fechaEmision?.message}>
              <Input type="date" {...register('fechaEmision')} />
            </FormField>

            {/* Tipo crédito */}
            <FormField label="Tipo crédito">
              <Select {...register('tipoCredito')} onChange={(e) => setValue('tipoCredito', e.target.value)}>
                <option value="">Contado (0 días)</option>
                <option value="7">7 días</option>
                <option value="15">15 días</option>
                <option value="30">30 días</option>
                <option value="45">45 días</option>
                <option value="60">60 días</option>
                <option value="custom">Personalizado</option>
              </Select>
            </FormField>

            {watch('tipoCredito') === 'custom' ? (
              <FormField label="Días de crédito" error={errors.diasCredito?.message}>
                <Input type="number" placeholder="30" min="1" {...register('diasCredito')} />
              </FormField>
            ) : (
              /* PARTE 2: Fecha vencimiento calculada automáticamente — solo lectura */
              <FormField label="Fecha de vencimiento (automática)">
                <Input
                  type="date"
                  value={fechaVencimientoCalc}
                  readOnly
                  className="bg-muted cursor-not-allowed opacity-70"
                  title="Calculada automáticamente: Fecha emisión + días de crédito"
                />
              </FormField>
            )}

            {/* Si es custom, mostrar también la fecha calculada */}
            {watch('tipoCredito') === 'custom' && (
              <FormField label="Fecha de vencimiento (automática)">
                <Input
                  type="date"
                  value={fechaVencimientoCalc}
                  readOnly
                  className="bg-muted cursor-not-allowed opacity-70"
                />
              </FormField>
            )}
          </div>

          {/* ── SECCIÓN 3: Detalle de factura ── */}
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Header de la tabla de líneas */}
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Detalle de factura
              </p>
              {/* PARTE 5: botón agregar línea */}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => append({
                  cantidad: '1',
                  unidadMedida: unidadesMedida[0]?.codigo ?? 'NIU',
                  codigo: '',
                  descripcion: '',
                  valorUnitario: '',
                  importe: '0',
                })}
              >
                <Plus className="w-3 h-3" /> Agregar línea
              </Button>
            </div>

            {/* Cabecera de columnas */}
            <div className="grid grid-cols-12 gap-1 px-2 py-1.5 bg-muted/20 border-b border-border text-xs font-medium text-muted-foreground">
              <div className="col-span-1">Cant.</div>
              <div className="col-span-1">Unidad</div>
              <div className="col-span-2">Código</div>
              <div className="col-span-4">Descripción</div>
              <div className="col-span-2 text-right">V. Unitario</div>
              <div className="col-span-1 text-right">Importe</div>
              <div className="col-span-1"></div>
            </div>

            {/* Filas dinámicas */}
            <div className="flex flex-col divide-y divide-border">
              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-12 gap-1 p-2 items-start hover:bg-muted/10 transition-colors">

                  {/* Cantidad */}
                  <div className="col-span-1">
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      placeholder="1"
                      className="text-center text-sm"
                      {...register(`lineas.${index}.cantidad`)}
                    />
                    {errors.lineas?.[index]?.cantidad && (
                      <p className="text-[10px] text-destructive mt-0.5">{errors.lineas[index]?.cantidad?.message}</p>
                    )}
                  </div>

                  {/* PARTE 7: Unidad de medida desde TablaMaestra */}
                  <div className="col-span-1">
                    <Select
                      className="text-xs"
                      {...register(`lineas.${index}.unidadMedida`)}
                    >
                      {unidadesMedida.length > 0
                        ? unidadesMedida.map((u) => (
                            <option key={u.codigo} value={u.codigo} title={u.nombre}>
                              {u.codigo}
                            </option>
                          ))
                        : (
                          <>
                            <option value="NIU">NIU</option>
                            <option value="ZZ">ZZ</option>
                            <option value="KGM">KGM</option>
                            <option value="TNE">TNE</option>
                          </>
                        )}
                    </Select>
                  </div>

                  {/* PARTE 7: Código desde TablaMaestra + PARTE 4: autocompletar descripción */}
                  <div className="col-span-2">
                    <Select
                      className="text-xs"
                      {...register(`lineas.${index}.codigo`)}
                      onChange={(e) => {
                        setValue(`lineas.${index}.codigo`, e.target.value);
                        handleCodigoChange(index, e.target.value);
                      }}
                    >
                      <option value="">Seleccionar...</option>
                      {codigosFactura.length > 0
                        ? codigosFactura.map((c) => (
                            <option key={c.codigo} value={c.codigo}>
                              {c.codigo}
                            </option>
                          ))
                        : (
                          <>
                            <option value="00001">00001</option>
                            <option value="00002">00002</option>
                            <option value="00003">00003</option>
                          </>
                        )}
                    </Select>
                    {errors.lineas?.[index]?.codigo && (
                      <p className="text-[10px] text-destructive mt-0.5">{errors.lineas[index]?.codigo?.message}</p>
                    )}
                  </div>

                  {/* PARTE 4: Descripción editable (auto-rellenada por el código) */}
                  <div className="col-span-4">
                    <Input
                      placeholder="Descripción del servicio"
                      className="text-sm"
                      {...register(`lineas.${index}.descripcion`)}
                    />
                    {errors.lineas?.[index]?.descripcion && (
                      <p className="text-[10px] text-destructive mt-0.5">{errors.lineas[index]?.descripcion?.message}</p>
                    )}
                  </div>

                  {/* Valor unitario */}
                  <div className="col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      className="text-right text-sm"
                      {...register(`lineas.${index}.valorUnitario`)}
                    />
                    {errors.lineas?.[index]?.valorUnitario && (
                      <p className="text-[10px] text-destructive mt-0.5">{errors.lineas[index]?.valorUnitario?.message}</p>
                    )}
                  </div>

                  {/* PARTE 6: Importe calculado automáticamente = Cantidad × V.Unitario */}
                  <div className="col-span-1 pt-2 text-right">
                    <span className="text-sm font-medium tabular-nums">
                      {formatCurrency(importesLineas[index] ?? 0)}
                    </span>
                  </div>

                  {/* Eliminar línea */}
                  <div className="col-span-1 flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => fields.length > 1 ? remove(index) : undefined}
                      disabled={fields.length <= 1}
                      className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Eliminar línea"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {errors.lineas?.root && (
              <p className="text-xs text-destructive px-3 py-1">{errors.lineas.root.message}</p>
            )}
            {typeof errors.lineas?.message === 'string' && (
              <p className="text-xs text-destructive px-3 py-1">{errors.lineas.message}</p>
            )}

            {/* PARTE 6: Totales al pie de la tabla */}
            <div className="border-t border-border bg-muted/30">
              <div className="flex justify-end gap-0 divide-x divide-border">
                <div className="px-4 py-2.5 text-right min-w-[140px]">
                  <p className="text-xs text-muted-foreground">Subtotal (sin IGV)</p>
                  <p className="text-sm font-medium tabular-nums">{formatCurrency(subtotalLineas)}</p>
                </div>
                <div className="px-4 py-2.5 text-right min-w-[140px]">
                  <p className="text-xs text-muted-foreground">IGV ({igvVal || 18}%)</p>
                  <p className="text-sm font-medium tabular-nums">{formatCurrency(igvCalc)}</p>
                </div>
                {detraccionCalc !== undefined && (
                  <div className="px-4 py-2.5 text-right min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Detracción ({pctDetraccionVal}%)</p>
                    <p className="text-sm font-medium text-yellow-600 tabular-nums">{formatCurrency(detraccionCalc)}</p>
                  </div>
                )}
                <div className="px-4 py-2.5 text-right min-w-[160px] bg-primary/5">
                  <p className="text-xs text-muted-foreground font-semibold">Total General</p>
                  <p className="text-base font-bold text-primary tabular-nums">{formatCurrency(totalCalc)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── SECCIÓN 4: Impuestos y retenciones ── */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="% IGV" error={errors.porcentajeIgv?.message}>
              <Input
                type="number"
                step="0.01"
                placeholder="18"
                {...register('porcentajeIgv')}
              />
            </FormField>
            <FormField label="% Detracción" error={errors.porcentajeDetraccion?.message}>
              <Input
                type="number"
                step="0.01"
                placeholder="0"
                {...register('porcentajeDetraccion')}
              />
            </FormField>
          </div>

          {/* ── SECCIÓN 5: Observaciones ── */}
          <FormField label="Observaciones">
            <Textarea placeholder="Notas adicionales..." {...register('observaciones')} />
          </FormField>

          {/* Acciones */}
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="secondary"
              type="button"
              onClick={() => { setShowForm(false); reset(); }}
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
            <Button variant="secondary" onClick={() => setShowXmlMasivo(false)}>Cerrar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
