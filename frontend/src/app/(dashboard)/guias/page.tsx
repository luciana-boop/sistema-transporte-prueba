'use client';

// FILE: src/app/(dashboard)/guias/page.tsx
// Módulo de Guías de Remisión electrónicas (SUNAT GRE), portado de MONKSAAS.
// Adaptaciones a este sistema: el origen del traslado es un Pedido (no hay
// módulo Ventas/Productos) y los detalles son texto libre.

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Eye, X, Download, Send } from 'lucide-react';
import api, { guiasApi, pedidosApi, clientesApi, conductoresApi, vehiculosApi, configuracionApi } from '@/services/api';
import { useConfig } from '@/hooks/useConfig';
import { getErrorMessage, formatDate, formatCurrency } from '@/lib/utils';
import { buscarPorCodigo, detectarUbigeo, type UbigeoEntry } from '@/lib/ubigeo';
import { MOTIVOS_TRASLADO, DOCUMENTOS_RELACIONADOS } from '@/lib/sunatCatalogos';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, SmartSearchInput,
} from '@/components/shared';
import type { Guia, Pedido, EstadoGuia } from '@/types';
import * as XLSX from 'xlsx';

const detalleSchema = z.object({
  descripcion: z.string().min(1, 'Requerido'),
  cantidad: z.string().min(1),
  unidadMedida: z.string().optional(),
});

const transportistaAdicionalSchema = z.object({
  placa: z.string().min(1, 'Requerido'),
  numRegistroMTC: z.string().min(1, 'Requerido'),
});

const guiaSchema = z.object({
  // Catálogo SUNAT 01: '09' Guía Remitente (default) | '31' Guía Transportista.
  tipoGuia: z.enum(['REMITENTE', 'TRANSPORTISTA']).default('REMITENTE'),
  // Destinatario en ambos tipos. En Transportista, además se exige remitenteId.
  // Exactamente uno de clienteId o (clienteNombre + clienteNumDoc) — ver superRefine.
  clienteId: z.string().optional(),
  clienteNombre: z.string().optional(),
  clienteNumDoc: z.string().optional(),
  remitenteId: z.string().optional(),
  pedidoId: z.string().optional(),
  serie: z.string().optional(),
  // Datos SUNAT
  motivoTraslado: z.string().default('01'),
  modalidadTransporte: z.string().default('02'),
  fechaInicioTraslado: z.string().optional(),
  // Partida
  ubigeoOrigen: z.string().optional(),
  direccionPartida: z.string().optional(),
  // Llegada
  ubigeoDestino: z.string().optional(),
  direccionEntrega: z.string().optional(),
  // Transporte público
  rucTransportista: z.string().optional(),
  razonSocialTransportista: z.string().optional(),
  numRegistroMTC: z.string().optional(),
  placaTransportista: z.string().optional(),
  transportistasAdicionales: z.array(transportistaAdicionalSchema).optional(),
  // Transporte privado (siempre obligatorio en modalidad Transportista)
  conductorId: z.string().optional(),
  vehiculoId: z.string().optional(),
  vehiculoCarretaId: z.string().optional(),
  // Documento relacionado (catálogo SUNAT 61) — obligatorio en Transportista:
  // GRE Remitente del remitente ('09'), o Factura/Boleta si no la emite.
  docRelTipo: z.string().optional(),
  docRelSerie: z.string().optional(),
  docRelNumero: z.string().optional(),
  docRelRucEmisor: z.string().optional(),
  // Carga
  pesoTotal: z.string().optional(),
  observaciones: z.string().optional(),
  detalles: z.array(detalleSchema).min(1),
}).superRefine((data, ctx) => {
  if (data.tipoGuia === 'TRANSPORTISTA') {
    if (!data.remitenteId) ctx.addIssue({ code: 'custom', path: ['remitenteId'], message: 'Requerido en guía Transportista' });
    if (!data.conductorId) ctx.addIssue({ code: 'custom', path: ['conductorId'], message: 'Requerido en guía Transportista' });
    if (!data.vehiculoId) ctx.addIssue({ code: 'custom', path: ['vehiculoId'], message: 'Requerido en guía Transportista' });
    if (!data.docRelTipo) ctx.addIssue({ code: 'custom', path: ['docRelTipo'], message: 'Requerido en guía Transportista' });
    if (!data.docRelNumero) ctx.addIssue({ code: 'custom', path: ['docRelNumero'], message: 'Requerido en guía Transportista' });
    if (!data.docRelRucEmisor) ctx.addIssue({ code: 'custom', path: ['docRelRucEmisor'], message: 'Requerido en guía Transportista' });
  }
  const tieneCliente = !!data.clienteId;
  const tieneDni = !!(data.clienteNombre && data.clienteNumDoc);
  if (tieneCliente === tieneDni) {
    ctx.addIssue({
      code: 'custom', path: ['clienteId'],
      message: 'Indique un cliente registrado o nombre + documento (DNI), no ambos ni ninguno',
    });
  }
});
type GuiaForm = z.infer<typeof guiaSchema>;

async function downloadPdf(url: string) {
  const r = await api.get(url, { responseType: 'blob' });
  const u = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
  window.open(u, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
}

export default function GuiasPage() {
  const qc = useQueryClient();
  const config = useConfig();
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<Guia | null>(null);
  const [clienteOpt, setClienteOpt] = useState<{ id: number | string; label: string } | null>(null);
  const [clienteMode, setClienteMode] = useState<'buscar' | 'libre'>('buscar');
  const [remitenteOpt, setRemitenteOpt] = useState<{ id: number | string; label: string } | null>(null);
  // Envío manual a SUNAT (botón general + modal de selección de pendientes)
  const [showPendientesSunat, setShowPendientesSunat] = useState(false);
  const [seleccionPendientesSunat, setSeleccionPendientesSunat] = useState<Set<number>>(new Set());

  // Filtros del listado
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [clienteFiltro, setClienteFiltro] = useState<{ id: number | string; label: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['guias', desde, hasta, estadoFiltro, clienteFiltro?.id],
    queryFn: () => guiasApi.listar({
      limit: 50,
      desde: desde || undefined,
      hasta: hasta || undefined,
      estado: (estadoFiltro || undefined) as EstadoGuia | undefined,
      clienteId: clienteFiltro ? Number(clienteFiltro.id) : undefined,
    }).then(r => r.data.data),
  });

  const { data: pendientesSunat = [] } = useQuery({
    queryKey: ['guias', 'pendientes-sunat'],
    queryFn: () => guiasApi.pendientesSunat().then(r => r.data.data ?? []),
  });

  const { register, control, handleSubmit, reset, watch, setValue, formState: { isSubmitting, errors } } = useForm<GuiaForm>({
    resolver: zodResolver(guiaSchema),
    defaultValues: {
      tipoGuia: 'REMITENTE',
      motivoTraslado: '01',
      modalidadTransporte: '02',
      detalles: [{ descripcion: '', cantidad: '1', unidadMedida: 'NIU' }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'detalles' });
  const { fields: transFields, append: appendTrans, remove: removeTrans } = useFieldArray({ control, name: 'transportistasAdicionales' });

  const clienteIdVal = watch('clienteId');
  const clienteIdNum = parseInt(clienteIdVal || '0');
  const modalidadVal = watch('modalidadTransporte');
  const tipoGuiaVal = watch('tipoGuia');
  const esTransportista = tipoGuiaVal === 'TRANSPORTISTA';
  // En Transportista, conductor/vehículo son siempre obligatorios (la propia
  // empresa transporta), sin la distinción público/privado de Remitente.
  const esPublico = !esTransportista && modalidadVal === '01';
  const mostrarConductorVehiculo = esTransportista || !esPublico;
  const serieVal = watch('serie');
  const direccionPartidaVal = watch('direccionPartida');
  const direccionEntregaVal = watch('direccionEntrega');
  const ubigeoOrigenVal = watch('ubigeoOrigen');
  const ubigeoDestinoVal = watch('ubigeoDestino');
  const [candidatosOrigen, setCandidatosOrigen] = useState<UbigeoEntry[]>([]);
  const [candidatosDestino, setCandidatosDestino] = useState<UbigeoEntry[]>([]);

  // Autocompleta el ubigeo de partida/llegada detectando el nombre del distrito en la
  // dirección escrita. Solo actúa si el ubigeo correspondiente sigue vacío.
  useEffect(() => {
    if (ubigeoOrigenVal || !direccionPartidaVal || direccionPartidaVal.trim().length < 6) { setCandidatosOrigen([]); return; }
    const t = setTimeout(() => {
      const res = detectarUbigeo(direccionPartidaVal);
      if (res.estado === 'encontrado') { setValue('ubigeoOrigen', res.entry.ubigeo); setCandidatosOrigen([]); }
      else if (res.estado === 'ambiguo') setCandidatosOrigen(res.candidatos);
      else setCandidatosOrigen([]);
    }, 400);
    return () => clearTimeout(t);
  }, [direccionPartidaVal, ubigeoOrigenVal, setValue]);

  useEffect(() => {
    if (ubigeoDestinoVal || !direccionEntregaVal || direccionEntregaVal.trim().length < 6) { setCandidatosDestino([]); return; }
    const t = setTimeout(() => {
      const res = detectarUbigeo(direccionEntregaVal);
      if (res.estado === 'encontrado') { setValue('ubigeoDestino', res.entry.ubigeo); setCandidatosDestino([]); }
      else if (res.estado === 'ambiguo') setCandidatosDestino(res.candidatos);
      else setCandidatosDestino([]);
    }, 400);
    return () => clearTimeout(t);
  }, [direccionEntregaVal, ubigeoDestinoVal, setValue]);

  const ubigeoOrigenResuelto = buscarPorCodigo(ubigeoOrigenVal);
  const ubigeoDestinoResuelto = buscarPorCodigo(ubigeoDestinoVal);

  // Series con tipoDocumento = 'GUIA' — selector + precarga de la primera.
  const { data: seriesGuia = [] } = useQuery({
    queryKey: ['configuracion', 'series'],
    queryFn: () => configuracionApi.getSeries().then(r => (r.data.data ?? []).filter(s => s.tipoDocumento === 'GUIA' && s.activo)),
  });

  useEffect(() => {
    if (!showForm) return;
    if (!serieVal && seriesGuia.length > 0) {
      setValue('serie', seriesGuia[0].serie);
    }
    // Dirección de la empresa (Configuración) — autocompleta direccionPartida.
    if (!direccionPartidaVal && config.direccion) {
      setValue('direccionPartida', config.direccion);
    }
  }, [showForm, seriesGuia, config.direccion, serieVal, direccionPartidaVal, setValue]);

  const { data: pedidosPendientes = [], isFetching: loadingPedidos } = useQuery({
    queryKey: ['pedidos', 'disponibles', clienteIdNum],
    queryFn: () => clienteIdNum > 0
      ? pedidosApi.disponibles(clienteIdNum).then(r => r.data.data ?? [])
      : Promise.resolve([]),
    enabled: clienteIdNum > 0,
  });

  const pedidoIdVal = watch('pedidoId');

  const { data: conductoresList = [] } = useQuery({
    queryKey: ['conductores', 'activos'],
    queryFn: () => conductoresApi.listar({ activo: true, limit: 100 }).then(r => r.data.data?.items ?? []),
    enabled: mostrarConductorVehiculo && showForm,
  });

  const { data: vehiculosList = [] } = useQuery({
    queryKey: ['vehiculos', 'activos'],
    queryFn: () => vehiculosApi.listar({ activo: true, limit: 100 }).then(r => r.data.data?.items ?? []),
    enabled: mostrarConductorVehiculo && showForm,
  });

  // Pedido no tiene líneas de detalle (es un servicio único origen→destino),
  // así que se genera un único detalle sintético con tipoCarga/tarifa.
  const handlePedidoChange = (pedidoId: string) => {
    setValue('pedidoId', pedidoId);
    if (!pedidoId) return;
    const pedido = (pedidosPendientes as Pedido[]).find(p => String(p.id) === pedidoId);
    if (!pedido) return;
    replace([{
      descripcion: `${pedido.tipoCarga} — ${pedido.origen} → ${pedido.destino}`,
      cantidad: '1',
      unidadMedida: 'NIU',
    }]);
  };

  // Al elegir cliente, autocompleta dirección de destino desde el cliente
  // seleccionado (sigue siendo editable después).
  const handleClienteChange = async (opt: { id: number | string; label: string } | null) => {
    setClienteOpt(opt);
    setValue('clienteId', opt ? String(opt.id) : '');
    setValue('pedidoId', '');
    if (!opt) return;
    try {
      const r = await clientesApi.obtener(Number(opt.id));
      const cliente = r.data.data;
      if (cliente?.direccion) setValue('direccionEntrega', cliente.direccion);
      if (cliente?.ubigeo) setValue('ubigeoDestino', cliente.ubigeo);
    } catch { /* autocompletado best-effort */ }
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ['guias'] });

  const createM = useMutation({
    mutationFn: (d: GuiaForm) => guiasApi.crear({
      tipoGuia: d.tipoGuia,
      clienteId: d.clienteId ? parseInt(d.clienteId) : undefined,
      clienteNombre: d.clienteNombre || undefined,
      clienteNumDoc: d.clienteNumDoc || undefined,
      remitenteId: d.tipoGuia === 'TRANSPORTISTA' && d.remitenteId ? parseInt(d.remitenteId) : undefined,
      pedidoId: d.tipoGuia === 'REMITENTE' && d.pedidoId ? parseInt(d.pedidoId) : undefined,
      serie: d.serie || undefined,
      motivoTraslado: d.tipoGuia === 'TRANSPORTISTA' ? undefined : d.motivoTraslado,
      modalidadTransporte: d.modalidadTransporte,
      fechaInicioTraslado: d.fechaInicioTraslado || undefined,
      ubigeoOrigen: d.ubigeoOrigen || undefined,
      direccionPartida: d.direccionPartida || undefined,
      ubigeoDestino: d.ubigeoDestino || undefined,
      direccionEntrega: d.direccionEntrega || undefined,
      rucTransportista: esPublico ? (d.rucTransportista || undefined) : undefined,
      razonSocialTransportista: esPublico ? (d.razonSocialTransportista || undefined) : undefined,
      numRegistroMTC: esPublico ? (d.numRegistroMTC || undefined) : undefined,
      placaTransportista: esPublico ? (d.placaTransportista || undefined) : undefined,
      transportistasAdicionales: esPublico
        ? (d.transportistasAdicionales ?? []).filter(t => t.placa && t.numRegistroMTC)
        : undefined,
      conductorId: mostrarConductorVehiculo && d.conductorId ? parseInt(d.conductorId) : undefined,
      vehiculoId: mostrarConductorVehiculo && d.vehiculoId ? parseInt(d.vehiculoId) : undefined,
      vehiculoCarretaId: mostrarConductorVehiculo && d.vehiculoCarretaId ? parseInt(d.vehiculoCarretaId) : undefined,
      docRelTipo: d.tipoGuia === 'TRANSPORTISTA' ? (d.docRelTipo || undefined) : undefined,
      docRelSerie: d.tipoGuia === 'TRANSPORTISTA' ? (d.docRelSerie || undefined) : undefined,
      docRelNumero: d.tipoGuia === 'TRANSPORTISTA' ? (d.docRelNumero || undefined) : undefined,
      docRelRucEmisor: d.tipoGuia === 'TRANSPORTISTA' ? (d.docRelRucEmisor || undefined) : undefined,
      pesoTotal: d.pesoTotal ? parseFloat(d.pesoTotal) : undefined,
      observaciones: d.observaciones || undefined,
      detalles: d.detalles.map(det => ({
        descripcion: det.descripcion,
        cantidad: parseFloat(det.cantidad),
        unidadMedida: det.unidadMedida || 'NIU',
      })),
    }),
    onSuccess: () => { toast.success('Guía creada'); setShowForm(false); reset(); setClienteOpt(null); setClienteMode('buscar'); setRemitenteOpt(null); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const anularM = useMutation({
    mutationFn: (id: number) => guiasApi.anular(id),
    onSuccess: () => { toast.success('Guía anulada'); setViewing(null); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Envío manual individual — botón "Enviar a SUNAT" del detalle.
  const enviarSunatM = useMutation({
    mutationFn: (id: number) => guiasApi.enviarSunat(id),
    onSuccess: (res) => {
      setViewing(res.data.data);
      toast.success('Guía enviada a SUNAT');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Vincular pedido — usado en guías sin pedido de origen (típicamente
  // creadas por un chofer desde el celular, que no elige pedido).
  const [pedidoVincularOpt, setPedidoVincularOpt] = useState<{ id: number | string; label: string } | null>(null);
  const vincularPedidoM = useMutation({
    mutationFn: (pedidoId: number) => guiasApi.vincularPedido(viewing!.id, pedidoId),
    onSuccess: (res) => {
      setViewing(res.data.data);
      setPedidoVincularOpt(null);
      toast.success('Guía vinculada al pedido');
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  // Envío manual en lote — botón general "Enviar a SUNAT" del listado.
  const enviarSunatLoteM = useMutation({
    mutationFn: (ids: number[]) => guiasApi.enviarSunatLote(ids),
    onSuccess: (res) => {
      const { enviados, errores } = res.data.data;
      if (errores.length === 0) toast.success(`${enviados} guía(s) enviada(s) a SUNAT`);
      else toast.warning(`${enviados} enviada(s), ${errores.length} con error: ${errores.map((e) => e.error).join('; ')}`);
      setShowPendientesSunat(false);
      setSeleccionPendientesSunat(new Set());
      invalidate();
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const guias = data?.items ?? [];

  const openDetalle = async (id: number) => {
    setPedidoVincularOpt(null);
    const r = await guiasApi.obtener(id);
    setViewing(r.data.data ?? null);
  };

  const closeForm = () => { setShowForm(false); reset(); setClienteOpt(null); setClienteMode('buscar'); setRemitenteOpt(null); };

  const exportExcel = () => {
    const rows = guias.map((g: any) => ({
      'N°': g.numero,
      Cliente: g.cliente?.razonSocial ?? g.clienteNombre ?? `#${g.clienteId}`,
      Fecha: formatDate(g.fechaEmision),
      Motivo: g.motivoTraslado ?? '',
      Modalidad: g.modalidadTransporte === '01' ? 'Pública' : 'Privada',
      Pedido: g.pedido ? `${g.pedido.origen} → ${g.pedido.destino}` : '',
      Factura: g.factura?.numeroFactura ?? '',
      'Peso total (kg)': g.pesoTotal ?? '',
      Estado: g.estado === 'EMITIDA' ? 'Emitida' : 'Anulada',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Guías');
    XLSX.writeFile(wb, `guias_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="p-6 space-y-4">
      <PageHeader title="Guías de Remisión" description="Emite guías SUNAT de remisión Remitente (09) o Transportista (31)" />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Desde"><Input type="date" className="w-36" value={desde} onChange={(e) => setDesde(e.target.value)} max={hasta || undefined} /></FormField>
          <FormField label="Hasta"><Input type="date" className="w-36" value={hasta} onChange={(e) => setHasta(e.target.value)} min={desde || undefined} /></FormField>
          <FormField label="Cliente">
            <SmartSearchInput
              queryFn={async (q) => { const r = await clientesApi.listar({ search: q, limit: 10 }); return (r.data.data?.items ?? []).map((c: any) => ({ id: c.id, label: c.razonSocial })); }}
              value={clienteFiltro}
              onChange={setClienteFiltro}
              placeholder="Todos"
            />
          </FormField>
          <FormField label="Estado">
            <Select className="w-36" value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
              <option value="">Todos</option>
              <option value="EMITIDA">Emitida</option>
              <option value="ANULADA">Anulada</option>
            </Select>
          </FormField>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={exportExcel}><Download className="w-4 h-4" /> Excel</Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pendientesSunat.length === 0}
            onClick={() => { setSeleccionPendientesSunat(new Set()); setShowPendientesSunat(true); }}
          >
            <Send className="w-4 h-4" /> Enviar a SUNAT{pendientesSunat.length > 0 ? ` (${pendientesSunat.length})` : ''}
          </Button>
          <Button onClick={() => {
            reset({
              tipoGuia: 'REMITENTE', motivoTraslado: '01', modalidadTransporte: '02',
              detalles: [{ descripcion: '', cantidad: '1', unidadMedida: 'NIU' }],
            });
            setClienteOpt(null);
            setRemitenteOpt(null);
            setShowForm(true);
          }}>
            <Plus className="w-4 h-4 mr-1" />Nueva Guía
          </Button>
        </div>
      </div>

      {isLoading ? <TableSkeleton /> : guias.length === 0 ? <EmptyState message="Sin guías — crea la primera" /> : (
        <Table>
          <thead>
            <tr>
              <Th>N°</Th><Th>Tipo</Th><Th>Cliente</Th><Th>Fecha</Th><Th>Motivo</Th><Th>Pedido</Th><Th>Factura</Th><Th>Estado</Th><Th>{''}</Th>
            </tr>
          </thead>
          <tbody>
            {guias.map((g: Guia) => (
              <Tr key={g.id}>
                <Td className="font-mono text-sm">{g.numero}</Td>
                <Td className="text-xs">{g.tipoGuia === 'TRANSPORTISTA' ? 'Transportista' : 'Remitente'}</Td>
                <Td className="font-medium">{g.cliente?.razonSocial ?? g.clienteNombre ?? `#${g.clienteId}`}</Td>
                <Td className="text-sm">{formatDate(g.fechaEmision)}</Td>
                <Td className="text-sm">{g.tipoGuia === 'TRANSPORTISTA' ? '—' : (g.motivoTraslado ?? '—')}</Td>
                <Td className="text-sm font-mono">{g.pedido ? `${g.pedido.origen} → ${g.pedido.destino}` : '—'}</Td>
                <Td className="text-sm font-mono">{g.factura?.numeroFactura ?? '—'}</Td>
                <Td><Badge value={g.estado} label={g.estado === 'EMITIDA' ? 'Emitida' : 'Anulada'} /></Td>
                <Td><button className="icon-btn" onClick={() => openDetalle(g.id)}><Eye className="w-4 h-4" /></button></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      {/* Formulario nueva guía */}
      <Modal open={showForm} onClose={closeForm} title="Nueva Guía de Remisión" maxWidth="max-w-4xl">
        <form onSubmit={handleSubmit(d => createM.mutate(d))} className="space-y-5">

          {/* SECCIÓN: Datos Básicos */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Datos Básicos</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Tipo de guía *">
                <Select
                  value={tipoGuiaVal}
                  onChange={(e) => setValue('tipoGuia', e.target.value as 'REMITENTE' | 'TRANSPORTISTA')}
                >
                  <option value="REMITENTE">09 - Guía de Remisión Remitente</option>
                  <option value="TRANSPORTISTA">31 - Guía de Remisión Transportista</option>
                </Select>
              </FormField>
              <FormField label="Serie">
                <Select {...register('serie')}>
                  {seriesGuia.length === 0 && <option value="">GUI1 (default)</option>}
                  {seriesGuia.map(s => (
                    <option key={s.id} value={s.serie}>{s.serie}</option>
                  ))}
                </Select>
              </FormField>
              {esTransportista && (
                <FormField label="Remitente *" hint="Quien origina el traslado (ni remitente ni destinatario emiten esta guía)" error={errors.remitenteId?.message}>
                  <SmartSearchInput
                    queryFn={async (q) => {
                      const r = await clientesApi.listar({ search: q, limit: 10 });
                      return (r.data.data?.items ?? []).map((c: any) => ({ id: c.id, label: c.razonSocial }));
                    }}
                    value={remitenteOpt}
                    onChange={(opt) => { setRemitenteOpt(opt); setValue('remitenteId', opt ? String(opt.id) : ''); }}
                    placeholder="Buscar remitente…"
                  />
                </FormField>
              )}
              <div>
                <div className="flex gap-2 mb-2">
                  <button type="button" onClick={() => { setClienteMode('buscar'); setValue('clienteNombre', ''); setValue('clienteNumDoc', ''); }}
                    className={`text-xs px-2 py-1 rounded ${clienteMode === 'buscar' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    Buscar cliente
                  </button>
                  <button type="button" onClick={() => { setClienteMode('libre'); setClienteOpt(null); setValue('clienteId', ''); setValue('pedidoId', ''); }}
                    className={`text-xs px-2 py-1 rounded ${clienteMode === 'libre' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                    Ingreso libre (DNI)
                  </button>
                </div>
                {clienteMode === 'libre' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <FormField label="DNI o RUC" error={errors.clienteId?.message}>
                      <Input placeholder="DNI o RUC" maxLength={11} {...register('clienteNumDoc')} />
                    </FormField>
                    <FormField label="Nombre / Razón social">
                      <Input placeholder="Nombre" {...register('clienteNombre')} />
                    </FormField>
                  </div>
                ) : (
                  <FormField label={esTransportista ? 'Destinatario *' : 'Cliente *'} error={errors.clienteId?.message}>
                    <SmartSearchInput
                      queryFn={async (q) => {
                        const r = await clientesApi.listar({ search: q, limit: 10 });
                        return (r.data.data?.items ?? []).map((c: any) => ({ id: c.id, label: c.razonSocial }));
                      }}
                      value={clienteOpt}
                      onChange={handleClienteChange}
                      placeholder={esTransportista ? 'Buscar destinatario…' : 'Buscar cliente…'}
                    />
                  </FormField>
                )}
              </div>
              {!esTransportista && (
                <FormField label="Pedido relacionado">
                  {clienteIdNum > 0 ? (
                    <Select value={pedidoIdVal ?? ''} onChange={e => handlePedidoChange(e.target.value)} disabled={loadingPedidos}>
                      <option value="">{loadingPedidos ? 'Cargando...' : 'Sin pedido'}</option>
                      {(pedidosPendientes as Pedido[]).map(p => (
                        <option key={p.id} value={p.id}>{p.origen} → {p.destino} — {formatCurrency(Number(p.tarifa))}</option>
                      ))}
                    </Select>
                  ) : (
                    <Select disabled><option value="">Primero seleccione un cliente</option></Select>
                  )}
                </FormField>
              )}
            </div>
          </div>

          {/* SECCIÓN: Traslado */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Traslado (SUNAT)</h3>
            <div className="grid grid-cols-3 gap-4">
              {/* Motivo de traslado (catálogo 20) no aplica en guía Transportista
                  (31): esa guía sustenta el servicio de transporte en sí, no el
                  motivo del traslado de la mercadería del remitente. */}
              {!esTransportista && (
                <FormField label="Motivo de traslado">
                  <Select {...register('motivoTraslado')}>
                    {MOTIVOS_TRASLADO.map(m => <option key={m.code} value={m.code}>{m.label}</option>)}
                  </Select>
                </FormField>
              )}
              {/* Modalidad pública/privada no aplica en Transportista: la
                  empresa emisora siempre transporta con su propio conductor
                  y vehículo, sin distinción de modalidad. */}
              {!esTransportista && (
                <FormField label="Modalidad de transporte">
                  <Select {...register('modalidadTransporte')}>
                    <option value="02">02 - Transporte privado</option>
                    <option value="01">01 - Transporte público</option>
                  </Select>
                </FormField>
              )}
              <FormField label="Fecha inicio traslado">
                <Input type="date" {...register('fechaInicioTraslado')} />
              </FormField>
            </div>
          </div>

          {/* SECCIÓN: Partida y Llegada */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Partida / Llegada</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Punto de partida</p>
                <FormField label="Ubigeo origen (6 dígitos)" hint="Se detecta desde la dirección o se puede escribir a mano">
                  <Input placeholder="150101" maxLength={6} {...register('ubigeoOrigen')} />
                  {ubigeoOrigenVal?.length === 6 && (
                    <p className={`text-xs ${ubigeoOrigenResuelto ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {ubigeoOrigenResuelto
                        ? `✓ ${ubigeoOrigenResuelto.distrito}, ${ubigeoOrigenResuelto.provincia}, ${ubigeoOrigenResuelto.departamento}`
                        : 'Código no reconocido en el padrón INEI'}
                    </p>
                  )}
                  {candidatosOrigen.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs text-muted-foreground">¿Cuál distrito?</span>
                      {candidatosOrigen.slice(0, 5).map((c) => (
                        <button
                          key={c.ubigeo}
                          type="button"
                          onClick={() => { setValue('ubigeoOrigen', c.ubigeo); setCandidatosOrigen([]); }}
                          className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent"
                        >
                          {c.distrito} ({c.provincia})
                        </button>
                      ))}
                    </div>
                  )}
                </FormField>
                <FormField label="Dirección partida">
                  <Input placeholder="Av. Ejemplo 123, Lima" {...register('direccionPartida')} />
                </FormField>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">Punto de llegada</p>
                <FormField label="Ubigeo destino (6 dígitos)" hint="Se detecta desde la dirección o se puede escribir a mano">
                  <Input placeholder="150201" maxLength={6} {...register('ubigeoDestino')} />
                  {ubigeoDestinoVal?.length === 6 && (
                    <p className={`text-xs ${ubigeoDestinoResuelto ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {ubigeoDestinoResuelto
                        ? `✓ ${ubigeoDestinoResuelto.distrito}, ${ubigeoDestinoResuelto.provincia}, ${ubigeoDestinoResuelto.departamento}`
                        : 'Código no reconocido en el padrón INEI'}
                    </p>
                  )}
                  {candidatosDestino.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-xs text-muted-foreground">¿Cuál distrito?</span>
                      {candidatosDestino.slice(0, 5).map((c) => (
                        <button
                          key={c.ubigeo}
                          type="button"
                          onClick={() => { setValue('ubigeoDestino', c.ubigeo); setCandidatosDestino([]); }}
                          className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent"
                        >
                          {c.distrito} ({c.provincia})
                        </button>
                      ))}
                    </div>
                  )}
                </FormField>
                <FormField label="Dirección entrega">
                  <Input placeholder="Calle Destino 456" {...register('direccionEntrega')} />
                </FormField>
              </div>
            </div>
          </div>

          {/* SECCIÓN: Transporte (condicional) */}
          <div className="border rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {esTransportista ? 'Conductor y Vehículo *' : esPublico ? 'Transportista (Modalidad Pública)' : 'Conductor y Vehículo (Modalidad Privada)'}
            </h3>
            {esPublico ? (
              <div className="grid grid-cols-2 gap-4">
                <FormField label="RUC transportista">
                  <Input placeholder="20123456789" {...register('rucTransportista')} />
                </FormField>
                <FormField label="Razón social transportista">
                  <Input placeholder="EMPRESA DE TRANSPORTES S.A.C." {...register('razonSocialTransportista')} />
                </FormField>
                <FormField label="N° registro MTC">
                  <Input placeholder="MTC-001234" {...register('numRegistroMTC')} />
                </FormField>
                <FormField label="Placa del vehículo">
                  <Input placeholder="ABC-123" {...register('placaTransportista')} />
                </FormField>
                <div className="col-span-2 border-t pt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">Placas/MTC adicionales (opcional)</p>
                    <Button type="button" variant="secondary" size="sm" onClick={() => appendTrans({ placa: '', numRegistroMTC: '' })}>
                      <Plus className="w-3 h-3 mr-1" />Agregar
                    </Button>
                  </div>
                  {transFields.map((f, i) => (
                    <div key={f.id} className="flex items-center gap-2">
                      <Input placeholder="Placa (ABC-123)" {...register(`transportistasAdicionales.${i}.placa`)} />
                      <Input placeholder="N° registro MTC" {...register(`transportistasAdicionales.${i}.numRegistroMTC`)} />
                      <button type="button" onClick={() => removeTrans(i)}>
                        <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <FormField label="Conductor" error={errors.conductorId?.message}>
                  <Select {...register('conductorId')}>
                    <option value="">{esTransportista ? 'Seleccione un conductor' : 'Sin conductor'}</option>
                    {(conductoresList as any[]).map((c: any) => (
                      <option key={c.id} value={c.id}>{c.nombre} — DNI {c.dni}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Tracto" error={errors.vehiculoId?.message}>
                  <Select {...register('vehiculoId')}>
                    <option value="">{esTransportista ? 'Seleccione un tracto' : 'Sin vehículo'}</option>
                    {(vehiculosList as any[]).filter((v: any) => v.tipo === 'TRACTO').map((v: any) => (
                      <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Carreta" error={errors.vehiculoCarretaId?.message}>
                  <Select {...register('vehiculoCarretaId')}>
                    <option value="">Sin carreta</option>
                    {(vehiculosList as any[]).filter((v: any) => v.tipo === 'CARRETA').map((v: any) => (
                      <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>
                    ))}
                  </Select>
                </FormField>
              </div>
            )}
            {esTransportista && (
              <div className="grid grid-cols-4 gap-4 mt-4">
                <FormField label="Doc. relacionado *" hint="GRE Remitente del remitente, o Factura/Boleta si no la emite" error={errors.docRelTipo?.message}>
                  <Select {...register('docRelTipo')}>
                    <option value="">Seleccione</option>
                    {DOCUMENTOS_RELACIONADOS.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
                  </Select>
                </FormField>
                <FormField label="Serie">
                  <Input placeholder="Serie" {...register('docRelSerie')} />
                </FormField>
                <FormField label="Número *" error={errors.docRelNumero?.message}>
                  <Input placeholder="Número" {...register('docRelNumero')} />
                </FormField>
                <FormField label="RUC emisor *" hint="RUC de quien emitió el documento relacionado" error={errors.docRelRucEmisor?.message}>
                  <Input placeholder="RUC" maxLength={11} {...register('docRelRucEmisor')} />
                </FormField>
              </div>
            )}
          </div>

          {/* SECCIÓN: Líneas */}
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-3 py-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Mercancías</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr>
                  <th className="text-left p-2">Descripción</th>
                  <th className="p-2 w-24">Cantidad</th>
                  <th className="p-2 w-24">Unidad</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {fields.map((f, i) => (
                  <tr key={f.id} className="border-t">
                    <td className="p-2"><Input {...register(`detalles.${i}.descripcion`)} placeholder="Descripción del ítem" /></td>
                    <td className="p-2"><Input type="number" step="0.001" min="0" {...register(`detalles.${i}.cantidad`)} /></td>
                    <td className="p-2">
                      <Select {...register(`detalles.${i}.unidadMedida`)}>
                        <option value="NIU">NIU (unidad)</option>
                        <option value="KGM">KGM (kg)</option>
                        <option value="LTR">LTR (litro)</option>
                        <option value="MTR">MTR (metro)</option>
                        <option value="ZZ">ZZ (servicio)</option>
                      </Select>
                    </td>
                    <td className="p-2">
                      <button type="button" onClick={() => remove(i)} disabled={fields.length === 1}>
                        <X className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 border-t">
              <Button type="button" variant="secondary" size="sm"
                onClick={() => append({ descripcion: '', cantidad: '1', unidadMedida: 'NIU' })}>
                <Plus className="w-3 h-3 mr-1" />Agregar línea
              </Button>
            </div>
          </div>

          {/* Peso y observaciones */}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Peso total (kg)">
              <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('pesoTotal')} />
            </FormField>
            <FormField label="Observaciones">
              <Textarea {...register('observaciones')} rows={2} />
            </FormField>
          </div>

          <div className="flex gap-3 justify-end">
            <Button type="button" variant="secondary" onClick={closeForm}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Guardando…' : 'Emitir Guía'}</Button>
          </div>
        </form>
      </Modal>

      {/* Detalle de guía */}
      {viewing && (
        <Modal open={!!viewing} onClose={() => { setViewing(null); setPedidoVincularOpt(null); }} title={`Guía ${viewing.numero}`} maxWidth="max-w-2xl">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><span className="text-muted-foreground">Tipo:</span> <span className="font-medium">{viewing.tipoGuia === 'TRANSPORTISTA' ? '31 - Transportista' : '09 - Remitente'}</span></div>
              <div><span className="text-muted-foreground">Estado:</span> <Badge value={viewing.estado} label={viewing.estado === 'EMITIDA' ? 'Emitida' : 'Anulada'} /></div>
              {viewing.tipoGuia === 'TRANSPORTISTA' && (
                <div><span className="text-muted-foreground">Remitente:</span> <span className="font-medium">{viewing.remitente?.razonSocial ?? '—'}</span></div>
              )}
              {viewing.tipoGuia === 'TRANSPORTISTA' && (
                <div><span className="text-muted-foreground">Doc. relacionado:</span> <span className="font-medium">{(viewing as any).docRelTipo ? `${(viewing as any).docRelTipo} — ${[(viewing as any).docRelSerie, (viewing as any).docRelNumero].filter(Boolean).join('-')} (RUC ${(viewing as any).docRelRucEmisor ?? '—'})` : '—'}</span></div>
              )}
              <div><span className="text-muted-foreground">{viewing.tipoGuia === 'TRANSPORTISTA' ? 'Destinatario' : 'Cliente'}:</span> <span className="font-medium">{viewing.cliente?.razonSocial ?? viewing.clienteNombre}{viewing.clienteNumDoc ? ` (${viewing.clienteNumDoc})` : ''}</span></div>
              <div><span className="text-muted-foreground">Fecha emisión:</span> {formatDate(viewing.fechaEmision)}</div>
              {viewing.tipoGuia !== 'TRANSPORTISTA' && (
                <div><span className="text-muted-foreground">Motivo:</span> {viewing.motivoTraslado ?? '—'}</div>
              )}
              <div><span className="text-muted-foreground">Modalidad:</span> {viewing.modalidadTransporte === '01' ? 'Pública' : 'Privada'}</div>
              {viewing.fechaInicioTraslado && (
                <div><span className="text-muted-foreground">Fecha traslado:</span> {formatDate(viewing.fechaInicioTraslado)}</div>
              )}
              {viewing.direccionPartida && (
                <div className="col-span-2"><span className="text-muted-foreground">Partida:</span> {viewing.ubigeoOrigen} — {viewing.direccionPartida}</div>
              )}
              {viewing.direccionEntrega && (
                <div className="col-span-2"><span className="text-muted-foreground">Llegada:</span> {viewing.ubigeoDestino} — {viewing.direccionEntrega}</div>
              )}
              {viewing.modalidadTransporte === '01' ? (
                <>
                  {viewing.rucTransportista && <div><span className="text-muted-foreground">Transportista RUC:</span> {viewing.rucTransportista}</div>}
                  {viewing.razonSocialTransportista && <div><span className="text-muted-foreground">Transportista:</span> {viewing.razonSocialTransportista}</div>}
                  {viewing.placaTransportista && <div><span className="text-muted-foreground">Placa:</span> {viewing.placaTransportista}</div>}
                </>
              ) : (
                <>
                  {viewing.conductor && <div><span className="text-muted-foreground">Conductor:</span> {viewing.conductor.nombre} (DNI: {viewing.conductor.dni})</div>}
                  {viewing.vehiculo && <div><span className="text-muted-foreground">Tracto:</span> {viewing.vehiculo.placa} — {viewing.vehiculo.marca} {viewing.vehiculo.modelo}</div>}
                  {viewing.vehiculoCarreta && <div><span className="text-muted-foreground">Carreta:</span> {viewing.vehiculoCarreta.placa} — {viewing.vehiculoCarreta.marca} {viewing.vehiculoCarreta.modelo}</div>}
                </>
              )}
              {viewing.pedido && (
                <div><span className="text-muted-foreground">Pedido:</span> <span className="font-mono">{viewing.pedido.origen} → {viewing.pedido.destino}</span></div>
              )}
              {viewing.factura && (
                <div><span className="text-muted-foreground">Factura:</span> <span className="font-mono">{viewing.factura.numeroFactura}</span></div>
              )}
            </div>

            {!viewing.pedido && !viewing.anulado && (
              <div className="flex items-end gap-2 border border-border rounded-lg p-3">
                <FormField label="Vincular a un pedido" hint="Útil para guías creadas por un chofer, sin pedido de origen">
                  <SmartSearchInput
                    queryFn={async (q) => {
                      const r = await pedidosApi.listar({ search: q, limit: 10 });
                      return (r.data.data?.items ?? []).map((p: any) => ({ id: p.id, label: `${p.origen} → ${p.destino} (${p.cliente?.razonSocial ?? ''})` }));
                    }}
                    value={pedidoVincularOpt}
                    onChange={setPedidoVincularOpt}
                    placeholder="Buscar pedido…"
                  />
                </FormField>
                <Button
                  size="sm"
                  disabled={!pedidoVincularOpt}
                  loading={vincularPedidoM.isPending}
                  onClick={() => vincularPedidoM.mutate(Number(pedidoVincularOpt!.id))}
                >
                  Vincular
                </Button>
              </div>
            )}

            <Table>
              <thead><tr><Th>Descripción</Th><Th>Cantidad</Th><Th>Unidad</Th></tr></thead>
              <tbody>
                {(viewing.detalles ?? []).map((d: any, i: number) => (
                  <Tr key={d.id ?? i}>
                    <Td>{d.descripcion}</Td>
                    <Td>{d.cantidad}</Td>
                    <Td>{d.unidadMedida}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>

            {viewing.pesoTotal && (
              <p className="text-sm text-right">Peso total: <span className="font-semibold">{viewing.pesoTotal} kg</span></p>
            )}

            {(viewing.transportistasAdicionales?.length ?? 0) > 0 && (
              <div className="border rounded-lg p-3 bg-muted/30 text-sm space-y-1">
                <p className="font-semibold text-xs uppercase text-muted-foreground">Transportistas adicionales</p>
                {viewing.transportistasAdicionales!.map((t: any) => (
                  <p key={t.id}>{t.placa} — MTC {t.numRegistroMTC}</p>
                ))}
              </div>
            )}

            {/* Información SUNAT */}
            {(viewing.estadoSunat || viewing.ticketSunat) ? (
              <div className="bg-muted/20 rounded p-3 text-xs space-y-1">
                <p className="font-semibold text-muted-foreground uppercase tracking-wider mb-1">Información SUNAT</p>
                {viewing.estadoSunat && <p>Estado: <span className="font-mono font-bold">{viewing.estadoSunat}</span></p>}
                {viewing.motivoRechazoSunat && <p className="text-destructive">Motivo: {viewing.motivoRechazoSunat}</p>}
                {viewing.ticketSunat && <p className="font-mono text-muted-foreground">Ticket: {viewing.ticketSunat}</p>}
              </div>
            ) : (
              <div className="bg-amber-500/10 rounded p-3 text-xs text-amber-600 dark:text-amber-400">
                Aún no se envió a SUNAT.
              </div>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-border">
              {!viewing.anulado && (
                <Button variant="secondary" className="text-destructive"
                  onClick={() => { if (confirm('¿Anular esta guía?')) anularM.mutate(viewing.id); }}>
                  Anular
                </Button>
              )}
              {!viewing.anulado && viewing.estadoSunat !== 'ACEPTADO' && viewing.estadoSunat !== 'ENVIADO_PENDIENTE' && (
                <Button
                  variant="secondary"
                  loading={enviarSunatM.isPending}
                  onClick={() => enviarSunatM.mutate(viewing.id)}
                >
                  <Send className="w-3.5 h-3.5" /> Enviar a SUNAT
                </Button>
              )}
              <button
                type="button"
                onClick={() => downloadPdf(`/api/guias/${viewing.id}/pdf`).catch(e => toast.error(getErrorMessage(e)))}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
              >
                <Download className="w-3.5 h-3.5" />PDF
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── MODAL: ENVÍO MANUAL EN LOTE A SUNAT ──────────────────────────── */}
      <Modal
        open={showPendientesSunat}
        onClose={() => setShowPendientesSunat(false)}
        title="Enviar a SUNAT — Guías pendientes"
        maxWidth="max-w-2xl"
      >
        {pendientesSunat.length === 0 ? (
          <EmptyState message="No hay guías pendientes de envío a SUNAT" />
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              className="text-xs text-primary hover:underline self-start"
              onClick={() => setSeleccionPendientesSunat(
                seleccionPendientesSunat.size === pendientesSunat.length
                  ? new Set()
                  : new Set(pendientesSunat.map((p) => p.id)),
              )}
            >
              {seleccionPendientesSunat.size === pendientesSunat.length ? 'Quitar selección' : 'Seleccionar todos'}
            </button>
            <Table>
              <thead>
                <tr><Th>{''}</Th><Th>N° Guía</Th><Th>Cliente</Th><Th>Fecha</Th></tr>
              </thead>
              <tbody>
                {pendientesSunat.map((p) => (
                  <Tr key={p.id}>
                    <Td>
                      <input
                        type="checkbox"
                        checked={seleccionPendientesSunat.has(p.id)}
                        onChange={() => {
                          const next = new Set(seleccionPendientesSunat);
                          if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                          setSeleccionPendientesSunat(next);
                        }}
                      />
                    </Td>
                    <Td><span className="font-mono text-sm">{p.numero}</span></Td>
                    <Td><span className="text-sm">{p.cliente?.razonSocial ?? '—'}</span></Td>
                    <Td><span className="text-xs text-muted-foreground">{formatDate(p.fechaEmision)}</span></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setShowPendientesSunat(false)}>Cancelar</Button>
              <Button
                disabled={seleccionPendientesSunat.size === 0}
                loading={enviarSunatLoteM.isPending}
                onClick={() => enviarSunatLoteM.mutate(Array.from(seleccionPendientesSunat))}
              >
                <Send className="w-4 h-4" /> Enviar seleccionados ({seleccionPendientesSunat.size})
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
