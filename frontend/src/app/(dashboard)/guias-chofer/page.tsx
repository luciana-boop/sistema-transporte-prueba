'use client';

// FILE: src/app/(dashboard)/guias-chofer/page.tsx
// Formulario reducido de Guías de Remisión para el rol CHOFER: solo los
// campos obligatorios de SUNAT, mobile-first (una columna, sin grids).
// El conductor y el origen se resuelven en el backend (Usuario.conductorId y
// Configuración de empresa) — acá nunca se piden.

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Trash2, FileText, CheckCircle2 } from 'lucide-react';
import api, { guiasChoferApi, clientesApi } from '@/services/api';
import { getErrorMessage, formatDatetime } from '@/lib/utils';
import { buscarPorCodigo, detectarUbigeo, type UbigeoEntry } from '@/lib/ubigeo';
import { MOTIVOS_TRASLADO } from '@/lib/sunatCatalogos';
import {
  PageHeader, Button, Badge, EmptyState,
  FormField, Input, Select, Textarea, SmartSearchInput,
} from '@/components/shared';

const UNIDADES_MEDIDA = ['NIU', 'KGM', 'LTR', 'MTR', 'ZZ'];

const detalleSchema = z.object({
  descripcion: z.string().min(1, 'Requerido'),
  cantidad: z.string().min(1, 'Requerido'),
  unidadMedida: z.string().optional(),
});

const schema = z.object({
  clienteId: z.string().optional(),
  clienteNombre: z.string().optional(),
  clienteNumDoc: z.string().optional(),
  motivoTraslado: z.string().default('01'),
  fechaInicioTraslado: z.string().min(1, 'Requerido'),
  ubigeoDestino: z.string().optional(),
  direccionEntrega: z.string().min(1, 'Requerido'),
  vehiculoId: z.string().min(1, 'Seleccioná el tracto'),
  vehiculoCarretaId: z.string().optional(),
  pesoTotal: z.string().min(1, 'Requerido'),
  observaciones: z.string().optional(),
  detalles: z.array(detalleSchema).min(1),
}).superRefine((data, ctx) => {
  const tieneCliente = !!data.clienteId;
  const tieneDni = !!(data.clienteNombre && data.clienteNumDoc);
  if (tieneCliente === tieneDni) {
    ctx.addIssue({
      code: 'custom', path: ['clienteId'],
      message: 'Indique un cliente registrado o nombre + documento (DNI), no ambos ni ninguno',
    });
  }
});
type FormData = z.infer<typeof schema>;

function nowLocalDatetime(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

async function verPdf(url: string) {
  const r = await api.get(url, { responseType: 'blob' });
  const u = URL.createObjectURL(new Blob([r.data], { type: 'application/pdf' }));
  window.open(u, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
}

export default function GuiasChoferPage() {
  const qc = useQueryClient();
  const [clienteMode, setClienteMode] = useState<'buscar' | 'libre'>('buscar');
  const [clienteOpt, setClienteOpt] = useState<{ id: number | string; label: string } | null>(null);
  const [candidatosDestino, setCandidatosDestino] = useState<UbigeoEntry[]>([]);
  const [guiaCreada, setGuiaCreada] = useState<{ id: number; numero: string } | null>(null);

  const { register, control, handleSubmit, reset, watch, setValue, formState: { isSubmitting, errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      motivoTraslado: '01',
      fechaInicioTraslado: nowLocalDatetime(),
      detalles: [{ descripcion: '', cantidad: '1', unidadMedida: 'NIU' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'detalles' });

  const direccionEntregaVal = watch('direccionEntrega');
  const ubigeoDestinoVal = watch('ubigeoDestino');
  const vehiculoIdVal = watch('vehiculoId');

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

  const ubigeoDestinoResuelto = buscarPorCodigo(ubigeoDestinoVal);

  const handleClienteChange = async (opt: { id: number | string; label: string } | null) => {
    setClienteOpt(opt);
    setValue('clienteId', opt ? String(opt.id) : '');
    if (!opt) return;
    try {
      const r = await clientesApi.obtener(Number(opt.id));
      const cliente = r.data.data;
      if (cliente?.direccion) setValue('direccionEntrega', cliente.direccion);
      if (cliente?.ubigeo) setValue('ubigeoDestino', cliente.ubigeo);
    } catch { /* autocompletado best-effort */ }
  };

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['guias-chofer', 'vehiculos-activos'],
    queryFn: () => guiasChoferApi.vehiculosActivos().then((r) => r.data.data ?? []),
  });
  const tractos = vehiculos.filter((v) => v.tipo === 'TRACTO');
  const carretas = vehiculos.filter((v) => v.tipo === 'CARRETA');

  const { data: misGuias, isLoading: cargandoGuias } = useQuery({
    queryKey: ['guias-chofer', 'mias'],
    queryFn: () => guiasChoferApi.mias({ limit: 10 }).then((r) => r.data.data),
  });

  const crearM = useMutation({
    mutationFn: (d: FormData) => guiasChoferApi.crear({
      clienteId: d.clienteId ? parseInt(d.clienteId) : undefined,
      clienteNombre: d.clienteNombre || undefined,
      clienteNumDoc: d.clienteNumDoc || undefined,
      motivoTraslado: d.motivoTraslado,
      fechaInicioTraslado: d.fechaInicioTraslado,
      ubigeoDestino: d.ubigeoDestino || undefined,
      direccionEntrega: d.direccionEntrega,
      vehiculoId: parseInt(d.vehiculoId),
      vehiculoCarretaId: d.vehiculoCarretaId ? parseInt(d.vehiculoCarretaId) : undefined,
      pesoTotal: parseFloat(d.pesoTotal),
      observaciones: d.observaciones || undefined,
      detalles: d.detalles.map((det) => ({
        descripcion: det.descripcion,
        cantidad: parseFloat(det.cantidad),
        unidadMedida: det.unidadMedida || 'NIU',
      })),
    }),
    onSuccess: (res) => {
      const guia = res.data.data as any;
      toast.success(`Guía ${guia.numero} creada`);
      setGuiaCreada({ id: guia.id, numero: guia.numero });
      reset({
        motivoTraslado: '01',
        fechaInicioTraslado: nowLocalDatetime(),
        detalles: [{ descripcion: '', cantidad: '1', unidadMedida: 'NIU' }],
      });
      setClienteOpt(null);
      setClienteMode('buscar');
      qc.invalidateQueries({ queryKey: ['guias-chofer', 'mias'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="p-4 pb-10 space-y-5 max-w-lg mx-auto">
      <PageHeader title="Nueva guía" description="Completá los datos del traslado" />

      {guiaCreada && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Guía {guiaCreada.numero} creada</p>
            <p className="text-xs text-muted-foreground">Ya podés verla o descargarla en PDF</p>
          </div>
          <Button
            size="sm" variant="secondary"
            onClick={() => verPdf(`/api/guias-chofer/${guiaCreada.id}/pdf`).catch((e) => toast.error(getErrorMessage(e)))}
          >
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit((d) => crearM.mutate(d))} className="flex flex-col gap-4">

        {/* Destinatario */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Destinatario <span className="text-destructive">*</span></label>
            <button
              type="button"
              className="text-xs text-primary hover:underline"
              onClick={() => {
                setClienteMode(clienteMode === 'buscar' ? 'libre' : 'buscar');
                setClienteOpt(null);
                setValue('clienteId', '');
                setValue('clienteNombre', '');
                setValue('clienteNumDoc', '');
              }}
            >
              {clienteMode === 'buscar' ? 'Ingresar nombre + DNI' : 'Buscar cliente registrado'}
            </button>
          </div>
          {clienteMode === 'buscar' ? (
            <SmartSearchInput
              queryFn={async (q) => { const r = await clientesApi.listar({ search: q, limit: 10 }); return (r.data.data?.items ?? []).map((c: any) => ({ id: c.id, label: c.razonSocial })); }}
              value={clienteOpt}
              onChange={handleClienteChange}
              placeholder="Buscar por razón social o RUC…"
            />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Nombre" {...register('clienteNombre')} />
              <Input placeholder="DNI" {...register('clienteNumDoc')} />
            </div>
          )}
          {errors.clienteId && <p className="text-xs text-destructive">{errors.clienteId.message}</p>}
        </div>

        <FormField label="Motivo de traslado" required>
          <Select {...register('motivoTraslado')}>
            {MOTIVOS_TRASLADO.map((m) => <option key={m.code} value={m.code}>{m.label}</option>)}
          </Select>
        </FormField>

        <FormField label="Fecha y hora de inicio" required error={errors.fechaInicioTraslado?.message}>
          <Input type="datetime-local" {...register('fechaInicioTraslado')} />
        </FormField>

        <FormField label="Dirección de destino" required error={errors.direccionEntrega?.message}>
          <Textarea rows={2} placeholder="Av. / calle, número, referencia" {...register('direccionEntrega')} />
        </FormField>
        {candidatosDestino.length > 0 && (
          <div className="flex flex-wrap gap-1.5 -mt-2">
            {candidatosDestino.map((c) => (
              <button
                key={c.ubigeo}
                type="button"
                onClick={() => { setValue('ubigeoDestino', c.ubigeo); setCandidatosDestino([]); }}
                className="text-xs px-2 py-1 rounded-md border border-border hover:bg-muted"
              >
                {c.distrito}, {c.provincia}
              </button>
            ))}
          </div>
        )}
        {ubigeoDestinoResuelto && (
          <p className="text-xs text-muted-foreground -mt-2">
            Ubigeo detectado: {ubigeoDestinoResuelto.distrito}, {ubigeoDestinoResuelto.provincia}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Tracto" required error={errors.vehiculoId?.message}>
            <Select {...register('vehiculoId')}>
              <option value="">Seleccionar…</option>
              {tractos.map((v) => <option key={v.id} value={v.id}>{v.placa} — {v.marca}</option>)}
            </Select>
          </FormField>
          <FormField label="Carreta">
            <Select {...register('vehiculoCarretaId')}>
              <option value="">Ninguna</option>
              {carretas.map((v) => <option key={v.id} value={v.id}>{v.placa}</option>)}
            </Select>
          </FormField>
        </div>
        {!vehiculoIdVal && tractos.length === 0 && (
          <p className="text-xs text-muted-foreground">No hay tractos activos registrados. Contactá al administrador.</p>
        )}

        <FormField label="Peso bruto total (kg)" required error={errors.pesoTotal?.message}>
          <Input type="number" step="0.01" min="0" placeholder="0.00" {...register('pesoTotal')} />
        </FormField>

        {/* Detalle de mercancía */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Mercancía <span className="text-destructive">*</span></label>
            <button
              type="button"
              className="text-xs text-primary hover:underline flex items-center gap-1"
              onClick={() => append({ descripcion: '', cantidad: '1', unidadMedida: 'NIU' })}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar ítem
            </button>
          </div>
          {fields.map((field, i) => (
            <div key={field.id} className="flex flex-col gap-2 border border-border rounded-lg p-3">
              <Input placeholder="Descripción" {...register(`detalles.${i}.descripcion`)} />
              <div className="grid grid-cols-3 gap-2">
                <Input className="col-span-1" type="number" step="0.001" min="0" placeholder="Cant." {...register(`detalles.${i}.cantidad`)} />
                <Select className="col-span-1" {...register(`detalles.${i}.unidadMedida`)}>
                  {UNIDADES_MEDIDA.map((u) => <option key={u} value={u}>{u}</option>)}
                </Select>
                <Button
                  type="button" variant="secondary" size="sm" className="col-span-1"
                  disabled={fields.length <= 1}
                  onClick={() => remove(i)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              {errors.detalles?.[i]?.descripcion && (
                <p className="text-xs text-destructive">{errors.detalles[i]?.descripcion?.message}</p>
              )}
            </div>
          ))}
        </div>

        <FormField label="Observaciones">
          <Textarea rows={2} placeholder="Opcional" {...register('observaciones')} />
        </FormField>

        <Button type="submit" loading={isSubmitting || crearM.isPending} className="w-full mt-2">
          Crear guía
        </Button>
      </form>

      {/* Mis guías recientes */}
      <div className="pt-4 border-t border-border">
        <h2 className="text-sm font-semibold mb-3">Mis guías recientes</h2>
        {cargandoGuias ? (
          <p className="text-sm text-muted-foreground">Cargando…</p>
        ) : (misGuias?.items?.length ?? 0) === 0 ? (
          <EmptyState message="Todavía no creaste ninguna guía" />
        ) : (
          <div className="flex flex-col gap-2">
            {misGuias!.items.map((g) => (
              <div key={g.id} className="flex items-center justify-between gap-3 border border-border rounded-lg p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{g.numero}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {g.cliente?.razonSocial ?? g.clienteNombre} · {formatDatetime(g.fechaEmision)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge value={g.anulado ? 'ANULADA' : (g.estadoSunat ?? g.estado)} label={g.anulado ? 'Anulada' : (g.estadoSunat ?? 'Emitida')} />
                  <button
                    onClick={() => verPdf(`/api/guias-chofer/${g.id}/pdf`).catch((e) => toast.error(getErrorMessage(e)))}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                    title="Ver PDF"
                  >
                    <FileText className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
