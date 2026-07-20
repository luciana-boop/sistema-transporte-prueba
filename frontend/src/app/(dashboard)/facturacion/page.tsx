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
import { Plus, Search, XCircle, Upload, FileText, Download, Trash2, Eye, ExternalLink, AlertCircle, Pencil, Package } from 'lucide-react';
import { useRef } from 'react';
import api, { facturacionApi, clientesApi, pedidosApi, configuracionApi, fetchAllPages } from '@/services/api';
import { formatCurrency, formatDate, getErrorMessage, ESTADO_FACTURA_LABEL, PAGE_SIZE } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard, AuditInfo, Pagination,
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

// ─── TIPO CRÉDITO → DÍAS (espejo del backend) ────────────────────────────────
// El código de un tipo de crédito ES la cantidad de días (p. ej. '7', '45'),
// así que se parsea directo en vez de un mapa fijo con las opciones default.
function calcularFechaVencimiento(fechaEmision: string, tipoCredito: string, diasCustom?: number): string {
  if (!fechaEmision) return '';
  const parsed = parseInt(tipoCredito, 10);
  const dias =
    diasCustom !== undefined && diasCustom > 0
      ? diasCustom
      : (!isNaN(parsed) && parsed > 0 ? parsed : 0);
  const d = new Date(fechaEmision + 'T12:00:00'); // evita desfase TZ
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

// ─── Switch (mismo patrón visual que configuracion/page.tsx) ─────────────────
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

// ─── PARSER XML SUNAT ─────────────────────────────────────────────────────────
// Busca una etiqueta exacta (ignorando namespace, ej. <cbc:ID> o <cac:ID>)
// dentro de un bloque de texto y devuelve su contenido.
function getInBlock(block: string, tag: string): string {
  // Soporta tanto texto plano como contenido envuelto en <![CDATA[ ... ]]>
  // (frecuente en <cbc:Description> de XMLs SUNAT, donde el regex anterior
  // ([^<]*) no podía cruzar el "<" de apertura del CDATA y devolvía vacío).
  const m = block.match(
    new RegExp(`<(?:\\w+:)?${tag}(?:\\s[^>]*)?>(?:\\s*<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>\\s*)?<\\/(?:\\w+:)?${tag}>`, 'i'),
  );
  return m ? m[1].trim() : '';
}

// Extrae el contenido interno de un bloque (ej. <cac:AccountingCustomerParty>...</cac:AccountingCustomerParty>),
// ignorando namespace.
function extractBlock(xmlText: string, blockTag: string): string {
  const m = xmlText.match(new RegExp(`<(?:\\w+:)?${blockTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${blockTag}>`, 'i'));
  return m ? m[1] : '';
}

function parseXmlSunat(xmlText: string): Record<string, unknown> | null {
  try {
    const get = (tag: string) => {
      const m = xmlText.match(new RegExp(`<[^/]*${tag}[^>]*>([^<]+)<`, 'i'));
      return m ? m[1].trim() : '';
    };

    // Serie y correlativo: del <ID> raíz del comprobante (formato F001-00000123)
    const idRe = /<(?:\w+:)?ID(?:\s[^>]*)?>([^<]*)<\/(?:\w+:)?ID>/gi;
    let serie = '';
    let correlativo = '';
    for (const m of xmlText.matchAll(idRe)) {
      const docMatch = m[1].trim().match(/^([A-Z]{1,4}\d{0,3})-(\d+)$/);
      if (docMatch) {
        serie = docMatch[1];
        correlativo = docMatch[2];
        break;
      }
    }

    // Cliente: del bloque AccountingCustomerParty (no del emisor)
    const customerBlock = extractBlock(xmlText, 'AccountingCustomerParty');
    const ruc = getInBlock(customerBlock, 'ID');
    const razonSocial =
      getInBlock(customerBlock, 'RegistrationName') ||
      getInBlock(customerBlock, 'Name');

    // Descripción de la primera línea del comprobante
    const lineBlock = extractBlock(xmlText, 'InvoiceLine');
    const descripcion = getInBlock(lineBlock, 'Description');

    const subtotalRaw = get('TaxExclusiveAmount') || get('subtotal') || '0';
    const igvRaw = get('TaxAmount') || get('igv') || '0';
    const totalRaw = get('PayableAmount') || get('total') || '0';
    const fecha = get('IssueDate') || new Date().toISOString().split('T')[0];

    return {
      serie, correlativo,
      ruc, razonSocial, descripcion,
      subtotal: parseFloat(subtotalRaw) || 0,
      igv: parseFloat(igvRaw) || 0,
      total: parseFloat(totalRaw) || 0,
      fechaEmision: fecha,
    };
  } catch { return null; }
}

// ─── PARSER XML SUNAT COMPLETO (importación individual) ──────────────────────
// Extrae todas las apariciones de un bloque repetido (ej. cada <cac:InvoiceLine>),
// ignorando namespace.
function extractAllBlocks(xmlText: string, blockTag: string): string[] {
  const re = new RegExp(`<(?:\\w+:)?${blockTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${blockTag}>`, 'gi');
  return [...xmlText.matchAll(re)].map((m) => m[1]);
}

// Extrae el valor de un atributo de la etiqueta de apertura de `tag` dentro de `block`.
function getAttrInBlock(block: string, tag: string, attr: string): string {
  const m = block.match(new RegExp(`<(?:\\w+:)?${tag}\\s+[^>]*\\b${attr}="([^"]*)"[^>]*>`, 'i'));
  return m ? m[1] : '';
}

// De una lista de bloques (ej. todos los <cac:PaymentTerms>), devuelve el primero
// cuyo <cbc:ID> interno coincida con `idValue`.
function findBlockById(blocks: string[], idValue: string): string {
  return blocks.find((b) => getInBlock(b, 'ID') === idValue) || '';
}

// Notas (<cbc:Note>) que no sean el detalle "SON: ... SOLES" (languageLocaleID="1000").
function extractNotesNoLocale1000(xmlText: string): string[] {
  const re = /<(?:\w+:)?Note([^>]*)>(?:\s*<!\[CDATA\[)?([\s\S]*?)(?:\]\]>\s*)?<\/(?:\w+:)?Note>/gi;
  const notas: string[] = [];
  for (const m of xmlText.matchAll(re)) {
    const localeMatch = m[1].match(/languageLocaleID="([^"]*)"/);
    if (localeMatch && localeMatch[1] === '1000') continue;
    const contenido = m[2].trim();
    if (contenido) notas.push(contenido);
  }
  return notas;
}

interface LineaXmlSunat {
  cantidad: number;
  unidadMedida: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
}

interface DatosXmlSunatCompleto {
  serie: string;
  correlativo: string;
  fechaEmision: string;
  ruc: string;
  razonSocial: string;
  lineas: LineaXmlSunat[];
  aplicarDetraccion: boolean;
  porcentajeDetraccion: number;
  tipoCredito: string;
  diasCredito: number;
  guiaReferencia: string;
  peso: string;
  observaciones: string;
}

function parseXmlSunatCompleto(xmlText: string): DatosXmlSunatCompleto | null {
  try {
    // Serie y correlativo: del <ID> raíz del comprobante (formato F001-00000123)
    const idRe = /<(?:\w+:)?ID(?:\s[^>]*)?>([^<]*)<\/(?:\w+:)?ID>/gi;
    let serie = '';
    let correlativo = '';
    for (const m of xmlText.matchAll(idRe)) {
      const docMatch = m[1].trim().match(/^([A-Z]{1,4}\d{0,3})-(\d+)$/);
      if (docMatch) {
        serie = docMatch[1];
        correlativo = docMatch[2];
        break;
      }
    }

    const fechaEmision = getInBlock(xmlText, 'IssueDate') || new Date().toISOString().split('T')[0];

    // Cliente: del bloque AccountingCustomerParty (no del emisor)
    const customerBlock = extractBlock(xmlText, 'AccountingCustomerParty');
    const ruc = getInBlock(customerBlock, 'ID');
    const razonSocial =
      getInBlock(customerBlock, 'RegistrationName') ||
      getInBlock(customerBlock, 'Name');

    // Líneas de detalle: una por cada <cac:InvoiceLine>
    const lineBlocks = extractAllBlocks(xmlText, 'InvoiceLine');
    const lineas: LineaXmlSunat[] = lineBlocks.map((lb) => {
      const cantidad = parseFloat(getInBlock(lb, 'InvoicedQuantity')) || 1;
      const unidadMedida = getAttrInBlock(lb, 'InvoicedQuantity', 'unitCode') || 'NIU';
      const lineExtension = parseFloat(getInBlock(lb, 'LineExtensionAmount')) || 0;
      const percentRaw = parseFloat(getInBlock(lb, 'Percent'));
      const percent = isFinite(percentRaw) ? percentRaw : 18;
      const importe = Math.round(lineExtension * (1 + percent / 100) * 100) / 100;
      const valorUnitario = cantidad > 0 ? Math.round((importe / cantidad) * 100) / 100 : importe;
      const itemBlock = extractBlock(lb, 'Item');
      const descripcion = getInBlock(itemBlock, 'Description') || getInBlock(lb, 'Description');
      return { cantidad, unidadMedida, descripcion, valorUnitario, importe };
    });

    // Detracción: <cac:PaymentTerms><cbc:ID>Detraccion</cbc:ID>...
    const paymentTermsBlocks = extractAllBlocks(xmlText, 'PaymentTerms');
    const detraccionBlock = findBlockById(paymentTermsBlocks, 'Detraccion');
    const aplicarDetraccion = !!detraccionBlock;
    const porcentajeDetraccion = detraccionBlock
      ? (parseFloat(getInBlock(detraccionBlock, 'PaymentPercent')) || 0)
      : 0;

    // Forma de pago / días de crédito: <cac:PaymentTerms><cbc:ID>FormaPago</cbc:ID>...
    const formaPagoBlock = findBlockById(paymentTermsBlocks, 'FormaPago');
    const paymentMeansId = getInBlock(formaPagoBlock, 'PaymentMeansID');
    let tipoCredito = '';
    let diasCredito = 0;
    if (paymentMeansId.toLowerCase() === 'credito') {
      const cuotaBlocks = paymentTermsBlocks.filter((b) => /^Cuota\d+$/.test(getInBlock(b, 'ID')));
      const fechasVencimiento = cuotaBlocks.map((b) => getInBlock(b, 'PaymentDueDate')).filter(Boolean).sort();
      const ultimaFecha = fechasVencimiento[fechasVencimiento.length - 1];
      if (ultimaFecha && fechaEmision) {
        const dias = Math.round((new Date(ultimaFecha).getTime() - new Date(fechaEmision).getTime()) / 86400000);
        if (dias > 0) {
          if ([7, 15, 30, 45, 60].includes(dias)) {
            tipoCredito = String(dias);
          } else {
            tipoCredito = 'custom';
            diasCredito = dias;
          }
        }
      }
    }

    // Guía de referencia
    const guiaBlock = extractBlock(xmlText, 'DespatchDocumentReference');
    const guiaReferencia = getInBlock(guiaBlock, 'ID');

    // Peso: heurística "NN.NNN TN" dentro de la descripción de algún ítem (toneladas → kg)
    let peso = '';
    for (const lb of lineBlocks) {
      const itemBlock = extractBlock(lb, 'Item');
      const desc = getInBlock(itemBlock, 'Description') || getInBlock(lb, 'Description');
      const pesoMatch = desc.match(/(\d+(?:\.\d+)?)\s*TN/i);
      if (pesoMatch) {
        peso = String(Math.round(parseFloat(pesoMatch[1]) * 1000 * 100) / 100);
        break;
      }
    }

    // Observaciones: <cbc:Note> sin languageLocaleID="1000" (que es "SON: ... SOLES")
    const observaciones = extractNotesNoLocale1000(xmlText).join(' / ');

    return {
      serie, correlativo, fechaEmision,
      ruc, razonSocial,
      lineas,
      aplicarDetraccion, porcentajeDetraccion,
      tipoCredito, diasCredito,
      guiaReferencia, peso, observaciones,
    };
  } catch { return null; }
}

// ─── SCHEMA ZOD ──────────────────────────────────────────────────────────────
const lineaSchema = z.object({
  cantidad:      z.string().min(1, 'Requerido'),
  unidadMedida:  z.string().min(1, 'Requerido'),
  codigo:        z.string().optional(),
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
  // El % de IGV ya no es editable: siempre se toma de Configuración.
  // La detracción ya no se ingresa como porcentaje manual: es un switch
  // Sí/No, y cuando está activa el porcentaje también viene de Configuración.
  aplicarDetraccion:    z.boolean().optional(),
  tipoCredito:          z.string().optional(),
  diasCredito:          z.string().optional(),
  guiaReferencia:       z.string().optional(),
  peso:                 z.string().optional(),
  observaciones:        z.string().optional(),
  // Correlativo del comprobante original (tomado del XML SUNAT importado).
  // Si se completa, la factura se guarda con este número en lugar del
  // siguiente correlativo automático de la serie.
  correlativo:          z.string().optional(),
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
  // MEJORA 1: por defecto hoy
  const [filtroDesde, setFiltroDesde] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  const [page, setPage] = useState(1);
  const [showXmlMasivo, setShowXmlMasivo] = useState(false);
  // % de detracción tomado del XML importado (cuando difiere del de Configuración),
  // para que el monto de detracción calculado coincida con el del comprobante original.
  const [xmlDetraccionPct, setXmlDetraccionPct] = useState<number | null>(null);
  // Detalle de factura (solo visualización)
  const [viewing, setViewing] = useState<any>(null);
  // Factura siendo editada (null = formulario en modo creación)
  const [editingFactura, setEditingFactura] = useState<any>(null);
  // P1: estado de PDF para el modal de detalle
  const [pdfInfo, setPdfInfo] = useState<{ tienePdf: boolean; archivoExiste: boolean; esUrl: boolean } | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfActionLoading, setPdfActionLoading] = useState<'ver' | 'descargar' | null>(null);
  const [xmlMasivoResult, setXmlMasivoResult] = useState<{
    creadas: number; duplicadas: number; errores: string[];
  } | null>(null);
  const xmlMasivoRef = useRef<HTMLInputElement>(null);
  const xmlSingleRef = useRef<HTMLInputElement>(null);
  // Evita que el efecto de "limpiar pedido al cambiar cliente" borre los
  // valores recién cargados al abrir el formulario de edición (ver más abajo).
  const skipClienteEffectRef = useRef(false);
  // Acción rápida: asociar pedido sin abrir el formulario de edición completo
  const [asociandoPedido, setAsociandoPedido] = useState<any>(null);
  const [pedidoAsociarId, setPedidoAsociarId] = useState('');

  // ─── QUERIES ─────────────────────────────────────────────────────────────
  const { data: facturasRaw = [], isLoading } = useQuery({
    queryKey: ['facturas', filtroEstado, filtroDesde, filtroHasta],
    queryFn: () => fetchAllPages((p) => facturacionApi.listar({
      estado: filtroEstado || undefined,
      desde: filtroDesde || undefined,
      hasta: filtroHasta || undefined,
      ...p,
    }).then((r) => r.data.data)),
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

  const limit = PAGE_SIZE;
  const totalPages = Math.ceil(facturas.length / limit);
  const facturasPagina = facturas.slice((page - 1) * limit, page * limit);

  const { data: series = [] } = useQuery({
    queryKey: ['series'],
    queryFn: () => facturacionApi.series().then((r) => r.data.data),
  });

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes'],
    queryFn: () => clientesApi.listar({ limit: 100 }).then((r) => r.data.data.items),
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
      aplicarDetraccion: false,
      fechaEmision: new Date().toISOString().split('T')[0],
      lineas: [{ cantidad: '1', unidadMedida: 'NIU', codigo: '', descripcion: '', valorUnitario: '', importe: '0' }],
    },
  });

  // useFieldArray para el detalle dinámico
  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lineas' });

  const [serieVal, aplicarDetraccionVal, tipoCredito, diasCredito, fechaEmisionVal] =
    watch(['serie', 'aplicarDetraccion', 'tipoCredito', 'diasCredito', 'fechaEmision']);

  // IGV y detracción ya no se ingresan manualmente: el % de IGV viene siempre
  // de Configuración, y el % de detracción solo se aplica (también desde
  // Configuración) cuando el switch "Aplicar detracción" está activo.
  const pctIgvConfig = config.igvPorcentaje || 18;
  // Si se importó un XML con detracción, se usa el % indicado en el propio
  // comprobante (puede diferir del default de Configuración) para que el
  // monto calculado coincida exactamente con el del XML.
  const pctDetraccionConfig = xmlDetraccionPct ?? (config.detraccionDefault || 0);

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

  // Al editar, el pedido ya vinculado a esta factura no aparece en
  // "disponibles" (está FACTURADO), así que se agrega a la lista para que
  // siga siendo seleccionable (p.ej. para no perder la asociación).
  const pedidosParaSelect = (() => {
    const pedidoActual = editingFactura?.pedido;
    if (!pedidoActual || pedidosDisponibles.some((p) => p.id === pedidoActual.id)) {
      return pedidosDisponibles;
    }
    return [pedidoActual, ...pedidosDisponibles];
  })();

  // ─── Acción rápida: asociar pedido sin abrir el formulario completo ─────────
  const { data: pedidosDisponiblesRapido = [] } = useQuery({
    queryKey: ['pedidos', 'disponibles', 'rapido', asociandoPedido?.cliente?.id],
    queryFn: () => pedidosApi.disponibles(asociandoPedido!.cliente.id).then((r) => r.data.data),
    enabled: !!asociandoPedido,
  });

  const pedidosParaSelectRapido = (() => {
    if (!asociandoPedido) return [];
    const pedidoActual = asociandoPedido.pedido;
    if (!pedidoActual || pedidosDisponiblesRapido.some((p) => p.id === pedidoActual.id)) {
      return pedidosDisponiblesRapido;
    }
    return [pedidoActual, ...pedidosDisponiblesRapido];
  })();

  const cerrarAsociarPedido = () => { setAsociandoPedido(null); setPedidoAsociarId(''); };

  const asociarPedidoMutation = useMutation({
    mutationFn: () => facturacionApi.asociarPedido(asociandoPedido!.id, pedidoAsociarId ? parseInt(pedidoAsociarId) : null),
    onSuccess: () => {
      toast.success('Pedido asociado correctamente');
      cerrarAsociarPedido();
      qc.invalidateQueries({ queryKey: ['facturas'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Limpiar pedido al cambiar cliente + heredar días de crédito del cliente
  // (el cliente guarda su condición de pago como enum condicionPago, que se
  // traduce a la opción "Tipo crédito" — de ahí se derivan los días).
  // Al abrir el formulario de edición se llama a reset() con el clienteId de
  // la factura, lo que también dispara este efecto — skipClienteEffectRef
  // evita que se borren pedidoId/tipoCredito recién cargados en ese caso.
  useEffect(() => {
    if (skipClienteEffectRef.current) {
      skipClienteEffectRef.current = false;
      return;
    }
    setValue('pedidoId', '', { shouldValidate: false });
    if (clienteIdVal) {
      const cliente = (clientes as any[]).find((c: any) => String(c.id) === clienteIdVal);
      if (cliente?.condicionPago != null) {
        // Cliente.condicionPago ya guarda 'CONTADO' o el código de días de
        // crédito (p. ej. '7'), el mismo formato que usa "Tipo crédito" aquí.
        const tipo = cliente.condicionPago === 'CONTADO' ? '' : cliente.condicionPago;
        setValue('tipoCredito', tipo, { shouldValidate: false });
        setValue('diasCredito', '', { shouldValidate: false });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteIdVal]);

  // ─── CÁLCULOS DE LÍNEAS ───────────────────────────────────────────────────
  // Importe de cada línea = cantidad × valorUnitario
  const importesLineas = lineasVal.map((l) => {
    const cant = parseFloat(l.cantidad || '0');
    const vu   = parseFloat(l.valorUnitario || '0');
    return isFinite(cant) && isFinite(vu) ? Math.round(cant * vu * 100) / 100 : 0;
  });

  // El precio ingresado por línea es el PRECIO FINAL (ya incluye IGV): el
  // Total General es la suma de los importes de las líneas, sin sumarle IGV
  // de nuevo. Subtotal e IGV se derivan del total solo para fines tributarios
  // (vía calcularDesdeTotal, que hace la descomposición total → base + IGV).
  const totalLineas = importesLineas.reduce((s, v) => s + v, 0);

  const pctDet = aplicarDetraccionVal ? pctDetraccionConfig : 0;
  const { subtotal: subtotalLineas, igv: igvCalc, total: totalCalc, detraccion: detraccionCalc } =
    calcularDesdeTotal(totalLineas, pctIgvConfig, pctDet);

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
        correlativo:          d.correlativo ? parseInt(d.correlativo, 10) : undefined,
        subtotal:             subtotalLineas,
        porcentajeIgv:        pctIgvConfig,
        porcentajeDetraccion: d.aplicarDetraccion ? pctDetraccionConfig : undefined,
        tipoCredito:          d.tipoCredito || undefined,
        diasCredito:          d.diasCredito ? parseInt(d.diasCredito) : undefined,
        guiaReferencia:       d.guiaReferencia,
        peso:                 d.peso ? parseFloat(d.peso) : undefined,
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
      setXmlDetraccionPct(null);
      invalidate();
      qc.invalidateQueries({ queryKey: ['pedidos', 'disponibles'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: number; d: FormData }) => {
      const lineasPayload = d.lineas.map((l, idx) => ({
        orden: idx,
        cantidad: parseFloat(l.cantidad),
        unidadMedida: l.unidadMedida,
        codigo: l.codigo,
        descripcion: l.descripcion,
        valorUnitario: parseFloat(l.valorUnitario),
        importe: importesLineas[idx] ?? 0,
      }));

      return facturacionApi.actualizar(id, {
        clienteId:            parseInt(d.clienteId),
        pedidoId:             d.pedidoId ? parseInt(d.pedidoId) : null,
        porcentajeIgv:        pctIgvConfig,
        porcentajeDetraccion: d.aplicarDetraccion ? pctDetraccionConfig : 0,
        tipoCredito:          d.tipoCredito || undefined,
        diasCredito:          d.diasCredito ? parseInt(d.diasCredito) : undefined,
        guiaReferencia:       d.guiaReferencia,
        peso:                 d.peso ? parseFloat(d.peso) : undefined,
        detalle:              lineasPayload.map((l) => l.descripcion).join(' / ').substring(0, 200),
        fechaEmision:         d.fechaEmision,
        observaciones:        d.observaciones,
        lineas:               lineasPayload,
      });
    },
    onSuccess: () => {
      toast.success('Factura actualizada');
      setShowForm(false);
      setEditingFactura(null);
      reset();
      setXmlDetraccionPct(null);
      invalidate();
      qc.invalidateQueries({ queryKey: ['pedidos', 'disponibles'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Carga los datos de una factura existente en el formulario para editarla.
  const handleEditar = (f: any) => {
    setEditingFactura(f);
    skipClienteEffectRef.current = true;
    setXmlDetraccionPct(f.porcentajeDetraccion != null ? Number(f.porcentajeDetraccion) : null);
    reset({
      clienteId: String(f.clienteId ?? f.cliente?.id ?? ''),
      pedidoId: f.pedidoId ? String(f.pedidoId) : '',
      serie: f.serie,
      fechaEmision: (f.fechaEmision ?? '').split('T')[0],
      aplicarDetraccion: f.porcentajeDetraccion != null && Number(f.porcentajeDetraccion) > 0,
      tipoCredito: f.tipoCredito ?? '',
      diasCredito: f.diasCredito ? String(f.diasCredito) : '',
      guiaReferencia: f.guiaReferencia ?? '',
      peso: f.peso != null ? String(f.peso) : '',
      observaciones: f.observaciones ?? '',
      lineas: (f.lineas ?? []).length > 0
        ? f.lineas.map((l: any) => ({
            cantidad: String(l.cantidad),
            unidadMedida: l.unidadMedida,
            codigo: l.codigo ?? '',
            descripcion: l.descripcion,
            valorUnitario: String(l.valorUnitario),
            importe: String(l.importe),
          }))
        : [{ cantidad: '1', unidadMedida: 'NIU', codigo: '', descripcion: '', valorUnitario: '', importe: '0' }],
    });
    setShowForm(true);
  };

  const anularMutation = useMutation({
    mutationFn: (id: number) => facturacionApi.anular(id),
    onSuccess: () => {
      toast.success('Factura anulada');
      invalidate();
      qc.invalidateQueries({ queryKey: ['pedidos', 'disponibles'] });
    },
    // P2: el backend devuelve mensaje claro cuando hay pagos activos
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // P1: cargar info PDF al abrir detalle
  // (el backend genera el PDF localmente bajo demanda si la factura aún no
  // tiene uno, así que siempre se consulta /pdf-info, no solo cuando ya hay pdfPath)
  const handleVerDetalle = async (factura: any) => {
    setViewing(factura);
    setPdfInfo(null);
    setLoadingPdf(true);
    try {
      const res = await facturacionApi.pdfInfo(factura.id);
      setPdfInfo(res.data.data);
    } catch {
      setPdfInfo({ tienePdf: false, archivoExiste: false, esUrl: false });
    } finally {
      setLoadingPdf(false);
    }
  };

  // El endpoint /pdf exige el header Authorization (igual que el resto de la API),
  // así que no puede abrirse con un <a href> directo (la navegación del navegador no
  // envía ese header y el backend responde "Token de acceso requerido"). Se descarga
  // el PDF como blob a través de la instancia `api` (que sí adjunta el Bearer token)
  // y se abre/descarga desde una URL de objeto local.
  const handleAbrirPdf = async (id: number, download: boolean) => {
    setPdfActionLoading(download ? 'descargar' : 'ver');
    try {
      const res = await api.get(`/api/facturacion/${id}/pdf${download ? '?download=1' : ''}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      if (download) {
        const disposition = res.headers?.['content-disposition'] as string | undefined;
        const filename = disposition?.match(/filename="?([^"]+)"?/)?.[1] || `factura-${id}.pdf`;
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setPdfActionLoading(null);
    }
  };

  const xmlMasivoMutation = useMutation({
    mutationFn: (xmlList: Record<string, unknown>[]) => facturacionApi.importacionMasivaXml(xmlList),
    onSuccess: (res) => { setXmlMasivoResult(res.data.data); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // ─── HANDLERS XML ─────────────────────────────────────────────────────────
  const handleXmlSingle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      const datos = parseXmlSunatCompleto(text);
      if (!datos) { toast.error('No se pudo leer el XML'); return; }

      // Fecha, guía, peso, observaciones (se antepone el N° de comprobante
      // original del XML, aunque su serie no corresponda a la numeración
      // de este sistema, para mantener trazabilidad)
      if (datos.fechaEmision) setValue('fechaEmision', datos.fechaEmision);
      if (datos.guiaReferencia) setValue('guiaReferencia', datos.guiaReferencia);
      if (datos.peso) setValue('peso', datos.peso);
      const numeroOriginal = datos.serie && datos.correlativo ? `${datos.serie}-${datos.correlativo}` : '';
      const observacionesConOrigen = [
        numeroOriginal ? `Comprobante original: ${numeroOriginal}` : '',
        datos.observaciones,
      ].filter(Boolean).join(' / ');
      if (observacionesConOrigen) setValue('observaciones', observacionesConOrigen);

      // Detracción: se activa el switch y se usa el % indicado en el XML
      // (puede diferir del default de Configuración) para que el monto
      // calculado coincida exactamente con el del comprobante.
      setValue('aplicarDetraccion', datos.aplicarDetraccion);
      setXmlDetraccionPct(datos.aplicarDetraccion ? datos.porcentajeDetraccion : null);

      // Forma de pago / días de crédito
      if (datos.tipoCredito === 'custom') {
        setValue('tipoCredito', 'custom');
        setValue('diasCredito', String(datos.diasCredito));
      } else if (datos.tipoCredito) {
        setValue('tipoCredito', datos.tipoCredito);
      }

      // Serie: validar contra las series existentes en el sistema (no se crea)
      if (datos.serie) {
        if (allSeries.includes(datos.serie)) {
          setValue('serie', datos.serie);
        } else {
          toast.error('La serie indicada en el XML no existe en el sistema.');
        }
      }

      // Correlativo: se guarda con el mismo número que indica el XML (ej.
      // F001-2342), salvo que ese número ya esté registrado en el sistema
      // (el backend rechazará la creación en ese caso).
      if (datos.correlativo) {
        setValue('correlativo', String(parseInt(datos.correlativo, 10)));
      }

      // Cliente: buscar por RUC en la lista cargada y, si no aparece, en el backend (no se crea)
      let clienteEncontrado = (clientes as any[]).find((c: any) => c.ruc === datos.ruc);
      if (!clienteEncontrado && datos.ruc) {
        try {
          const res = await clientesApi.listar({ search: datos.ruc, limit: 5 });
          clienteEncontrado = res.data.data.items.find((c: any) => c.ruc === datos.ruc);
        } catch { /* sin conexión: se valida abajo */ }
      }
      if (clienteEncontrado) {
        setValue('clienteId', String(clienteEncontrado.id));
      } else {
        toast.error('El cliente del XML no existe en el sistema.');
      }

      // Líneas de detalle (todas, no solo la primera)
      if (datos.lineas.length > 0) {
        replace(datos.lineas.map((l) => ({
          cantidad: String(l.cantidad),
          unidadMedida: l.unidadMedida,
          codigo: '',
          descripcion: l.descripcion,
          valorUnitario: String(l.valorUnitario),
          importe: String(l.importe),
        })));
      }

      toast.success(
        `XML leído: ${datos.serie}-${datos.correlativo} | RUC: ${datos.ruc} | ${datos.lineas.length} línea(s)`,
      );
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
                aplicarDetraccion: false,
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
            onChange={(e) => { setSearchText(e.target.value); setPage(1); }}
          />
        </div>
        <Select
          value={filtroEstado}
          onChange={(e) => { setFiltroEstado(e.target.value); setPage(1); }}
          className="w-44"
        >
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_FACTURA_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" className="w-36" value={filtroDesde} onChange={(e) => { setFiltroDesde(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" className="w-36" value={filtroHasta} onChange={(e) => { setFiltroHasta(e.target.value); setPage(1); }} />
        </div>
        {(searchText || filtroDesde || filtroHasta) && (
          <button
            onClick={() => { setSearchText(''); setFiltroDesde(''); setFiltroHasta(''); setPage(1); }}
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
              <Th className="text-right">Ver</Th>
              {usuario?.rol === 'ADMIN' && <Th>Acc.</Th>}
            </tr>
          </thead>
          <tbody>
            {facturasPagina.length > 0 ? (
              facturasPagina.map((f) => (
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
                  <Td className="text-right">
                    <button
                      onClick={() => handleVerDetalle(f)}
                      className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                      title="Ver detalle"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                  {usuario?.rol === 'ADMIN' && (
                    <Td>
                      <div className="flex items-center gap-3">
                        {f.estado !== 'ANULADA' && (
                          <button
                            onClick={() => handleEditar(f)}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            <Pencil className="w-3 h-3" /> Editar
                          </button>
                        )}
                        {f.estado !== 'ANULADA' && (
                          <button
                            onClick={() => { setAsociandoPedido(f); setPedidoAsociarId(f.pedido ? String(f.pedido.id) : ''); }}
                            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                          >
                            <Package className="w-3 h-3" /> Asociar pedido
                          </button>
                        )}
                        {f.estado !== 'ANULADA' && f.estado !== 'PAGADA' && (
                          <button
                            onClick={() => {
                              // P2: advertencia extra para facturas con pago parcial
                              const msg = f.estado === 'PARCIAL'
                                ? '⚠️ Esta factura tiene pagos parciales registrados.\n\nSolo podrá anularse si primero anula todos los pagos asociados desde el módulo de Cobranza.\n\n¿Desea intentarlo de todas formas?'
                                : '¿Anular factura?';
                              if (confirm(msg)) anularMutation.mutate(f.id);
                            }}
                            className="flex items-center gap-1 text-xs text-destructive hover:underline"
                          >
                            <XCircle className="w-3 h-3" /> Anular
                          </button>
                        )}
                      </div>
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

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* ─── MODAL: NUEVA FACTURA / EDITAR FACTURA ────────────────────────── */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingFactura(null); reset(); setXmlDetraccionPct(null); }}
        title={editingFactura ? `Editar factura ${editingFactura.numeroFactura}` : 'Nueva factura'}
        maxWidth="max-w-4xl"
      >
        <form
          onSubmit={handleSubmit((d) =>
            editingFactura
              ? updateMutation.mutate({ id: editingFactura.id, d })
              : createMutation.mutate(d)
          )}
          className="flex flex-col gap-5"
        >

          {/* XML single import (solo al crear) */}
          {!editingFactura && (
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
          )}

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
            {editingFactura ? (
              <FormField label="N° Factura">
                <div className="h-9 px-3 flex items-center rounded-md border border-border bg-muted text-sm font-mono font-bold">
                  {editingFactura.numeroFactura}
                </div>
              </FormField>
            ) : (
              <FormField label="Serie" required error={errors.serie?.message}>
                <Select {...register('serie')} onChange={(e) => setValue('serie', e.target.value)}>
                  {allSeries.map((s) => <option key={s} value={s}>{s}</option>)}
                  <option value="_nueva">+ Nueva serie</option>
                </Select>
              </FormField>
            )}
          </div>

          {!editingFactura && serieVal === '_nueva' && (
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
                  {pedidosParaSelect.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.id} — {p.cliente?.razonSocial} · {p.vehiculo?.placa ?? 'sin vehículo'}
                    </option>
                  ))}
                  {!loadingPedidos && pedidosParaSelect.length === 0 && (
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
            <FormField label="Peso (kg)" error={errors.peso?.message}>
              <Input type="number" step="0.01" min="0" placeholder="Peso del camión/carga" {...register('peso')} />
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
                      {/* Código importado del XML que no está en el catálogo (ej. "BG") */}
                      {(() => {
                        const valorActual = lineasVal[index]?.unidadMedida;
                        const opciones = unidadesMedida.length > 0
                          ? unidadesMedida.map((u) => u.codigo)
                          : ['NIU', 'ZZ', 'KGM', 'TNE'];
                        return valorActual && !opciones.includes(valorActual)
                          ? <option value={valorActual}>{valorActual}</option>
                          : null;
                      })()}
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
                      <option value="">Manual / Sin código</option>
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
                  <p className="text-xs text-muted-foreground">IGV ({pctIgvConfig}%)</p>
                  <p className="text-sm font-medium tabular-nums">{formatCurrency(igvCalc)}</p>
                </div>
                {detraccionCalc !== undefined && (
                  <div className="px-4 py-2.5 text-right min-w-[140px]">
                    <p className="text-xs text-muted-foreground">Detracción ({pctDetraccionConfig}%)</p>
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
          {/* IGV y detracción ya no se editan manualmente: ambos provienen de
              Configuración (igv_porcentaje / detraccion_porcentaje). La detracción
              solo se aplica si el switch está activo. */}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="% IGV (automático)">
              <div className="h-9 px-3 flex items-center rounded-md border border-border bg-muted text-sm text-muted-foreground">
                {pctIgvConfig}% — definido en Configuración
              </div>
            </FormField>
            <FormField label="Detracción">
              <div className="h-9 px-3 flex items-center justify-between gap-2 rounded-md border border-border">
                <span className="text-sm">
                  Aplicar detracción
                  {aplicarDetraccionVal && (
                    <span className="text-muted-foreground"> ({pctDetraccionConfig}% — desde Configuración)</span>
                  )}
                </span>
                <Switch
                  checked={!!aplicarDetraccionVal}
                  onChange={(v) => setValue('aplicarDetraccion', v, { shouldValidate: false })}
                />
              </div>
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
              onClick={() => { setShowForm(false); setEditingFactura(null); reset(); setXmlDetraccionPct(null); }}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending || updateMutation.isPending}>
              {editingFactura ? 'Guardar cambios' : 'Emitir factura'}
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

      {/* MEJORA 4: Detalle de factura — solo lectura (asociada a SUNAT, no editable) */}
      <Modal open={!!viewing} onClose={() => { setViewing(null); setPdfInfo(null); }} title={`Factura ${viewing?.numeroFactura ?? ''}`} maxWidth="max-w-2xl">
        {viewing && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <Badge value={viewing.estado} label={ESTADO_FACTURA_LABEL[viewing.estado]} />
              <span className="text-xs text-muted-foreground">Emisión: {formatDate(viewing.fechaEmision)}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Cliente</p>
                <p className="font-semibold">{viewing.cliente?.razonSocial}</p>
                <p className="text-xs text-muted-foreground">{viewing.cliente?.ruc}</p>
              </div>
              {viewing.pedido && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Pedido</p>
                  <p className="text-sm">#{viewing.pedido.id} — {viewing.pedido.origen} → {viewing.pedido.destino}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Vencimiento</p>
                <p className="text-sm">{formatDate(viewing.fechaVencimiento)}</p>
              </div>
              {viewing.diasCredito != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Días crédito</p>
                  <p className="text-sm">{viewing.diasCredito} días</p>
                </div>
              )}
              {viewing.tipoCredito && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tipo crédito</p>
                  <p className="text-sm">{viewing.tipoCredito}</p>
                </div>
              )}
              {viewing.guiaReferencia && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Guía referencia</p>
                  <p className="text-sm font-mono">{viewing.guiaReferencia}</p>
                </div>
              )}
              {viewing.peso != null && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Peso</p>
                  <p className="text-sm">{Number(viewing.peso).toLocaleString('es-PE')} kg</p>
                </div>
              )}
            </div>

            {/* Líneas de detalle */}
            {(viewing.lineas ?? []).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Detalle</p>
                <Table>
                  <thead>
                    <tr>
                      <Th>Cant.</Th><Th>U.M.</Th><Th>Descripción</Th>
                      <Th className="text-right">V.Unit.</Th><Th className="text-right">Importe</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {viewing.lineas.map((l: any, i: number) => (
                      <Tr key={i}>
                        <Td><span className="text-sm">{l.cantidad}</span></Td>
                        <Td><span className="text-xs text-muted-foreground">{l.unidadMedida}</span></Td>
                        <Td><span className="text-sm">{l.descripcion}</span></Td>
                        <Td className="text-right"><span className="text-sm">{formatCurrency(Number(l.valorUnitario))}</span></Td>
                        <Td className="text-right"><span className="text-sm font-medium">{formatCurrency(Number(l.importe))}</span></Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            )}

            {/* Totales */}
            <div className="bg-muted/30 rounded-lg p-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Subtotal</p>
                <p className="font-semibold">{formatCurrency(Number(viewing.subtotal))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">IGV ({viewing.porcentajeIgv ?? 18}%)</p>
                <p className="font-semibold">{formatCurrency(Number(viewing.igv))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-bold text-lg">{formatCurrency(Number(viewing.total))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Cobrado</p>
                <p className="font-semibold text-emerald-500">{formatCurrency(Number(viewing.totalPagado ?? 0))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo</p>
                <p className={`font-semibold ${Number(viewing.total) - Number(viewing.montoDetraccion ?? 0) - Number(viewing.totalPagado ?? 0) > 0.01 ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {formatCurrency(Math.max(0, Number(viewing.total) - Number(viewing.montoDetraccion ?? 0) - Number(viewing.totalPagado ?? 0)))}
                </p>
              </div>
              {Number(viewing.detraccion ?? 0) > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground">Detracción</p>
                  <p className="font-semibold text-blue-500">{formatCurrency(Number(viewing.detraccion))}</p>
                </div>
              )}
            </div>

            {viewing.detalle && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Detalle / Concepto</p>
                <p className="text-sm bg-muted/30 rounded p-2">{viewing.detalle}</p>
              </div>
            )}

            {/* P1: Pagos registrados */}
            {(viewing.pagos ?? []).filter((p: any) => !p.anulado).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pagos registrados</p>
                <div className="flex flex-col gap-1">
                  {viewing.pagos.filter((p: any) => !p.anulado).map((p: any) => (
                    <div key={p.id} className="flex items-center justify-between text-sm bg-muted/20 rounded px-3 py-1.5">
                      <span className="text-muted-foreground">{formatDate(p.fechaPago)} · {p.metodoPago}</span>
                      <span className="font-semibold text-emerald-500">{formatCurrency(Number(p.monto))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* P1: Info SUNAT */}
            {(viewing.hashXml || viewing.estadoSunat) && (
              <div className="bg-muted/20 rounded p-3 text-xs space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">Información SUNAT</p>
                {viewing.estadoSunat && <p>Estado: <span className="font-mono font-bold">{viewing.estadoSunat}</span></p>}
                {viewing.hashXml && <p className="font-mono text-muted-foreground break-all">Hash: {viewing.hashXml}</p>}
              </div>
            )}

            {/* P1: Botones PDF */}
            <div className="border-t border-border pt-4">
              {loadingPdf ? (
                <p className="text-xs text-muted-foreground">Verificando PDF...</p>
              ) : pdfInfo?.tienePdf && pdfInfo?.archivoExiste ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs text-muted-foreground flex-1">PDF disponible</p>
                  <button
                    type="button"
                    disabled={pdfActionLoading !== null}
                    onClick={() => handleAbrirPdf(viewing.id, false)}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> {pdfActionLoading === 'ver' ? 'Abriendo...' : 'Ver PDF'}
                  </button>
                  <button
                    type="button"
                    disabled={pdfActionLoading !== null}
                    onClick={() => handleAbrirPdf(viewing.id, true)}
                    className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" /> {pdfActionLoading === 'descargar' ? 'Descargando...' : 'Descargar'}
                  </button>
                </div>
              ) : viewing.pdfPath ? (
                <div className="flex items-center gap-2 text-xs text-amber-500">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>El archivo PDF no está disponible en el servidor ({viewing.pdfPath})</span>
                </div>
              ) : (
                <p className="text-xs text-amber-500 italic">
                  No se pudo generar el PDF de esta factura. Intenta nuevamente o revisa los registros del servidor.
                </p>
              )}
            </div>

            <AuditInfo
              creadoPor={viewing.creadoPor}
              creadoEn={viewing.creadoEn}
              actualizadoPor={viewing.actualizadoPor}
              actualizadoEn={viewing.actualizadoEn}
            />

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              {usuario?.rol === 'ADMIN' && viewing.estado !== 'ANULADA' && (
                <Button
                  variant="secondary"
                  onClick={() => { handleEditar(viewing); setViewing(null); }}
                >
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </Button>
              )}
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Asociar pedido (acción rápida) */}
      <Modal open={!!asociandoPedido} onClose={cerrarAsociarPedido} title="Asociar pedido">
        {asociandoPedido && (
          <div className="flex flex-col gap-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">Factura: <span className="font-medium text-foreground">{asociandoPedido.numeroFactura}</span></p>
              <p className="text-muted-foreground">Cliente: <span className="font-medium text-foreground">{asociandoPedido.cliente?.razonSocial}</span></p>
            </div>

            <FormField label="Pedido" hint="Solo se muestran pedidos activos del cliente sin otra factura vigente">
              <Select value={pedidoAsociarId} onChange={(e) => setPedidoAsociarId(e.target.value)}>
                <option value="">Sin pedido asociado</option>
                {pedidosParaSelectRapido.map((p: any) => (
                  <option key={p.id} value={p.id}>#{p.id} — {p.cliente?.razonSocial} · {p.vehiculo?.placa ?? 'sin vehículo'}</option>
                ))}
              </Select>
            </FormField>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={cerrarAsociarPedido}>Cancelar</Button>
              <Button loading={asociarPedidoMutation.isPending} onClick={() => asociarPedidoMutation.mutate()}>Guardar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
