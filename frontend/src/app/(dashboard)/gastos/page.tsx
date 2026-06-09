// FILE: src/app/(dashboard)/gastos/page.tsx
// CHAT 9:
//   - cuentaId ahora OBLIGATORIO (Zod required, label "Cuenta origen *")
//   - Muestra saldo disponible de la cuenta seleccionada
//   - Validación de saldo insuficiente antes de enviar
//   - La moneda sigue autocompletándose y bloqueándose según la cuenta

'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Search, Trash2, Download, X, Eye } from 'lucide-react';
import { gastosApi, vehiculosApi, cuentasApi } from '@/services/api';
import { formatDate, formatCurrency, getErrorMessage, TIPO_GASTO_LABEL } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { TipoPagoSelector, MonedaSelector } from '@/components/shared/FinancialSelectors';
import { useAuthStore } from '@/store/auth.store';
import { useMoneda } from '@/hooks/useMoneda';
import type { TipoGasto } from '@/types';
import * as XLSX from 'xlsx';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const schema = z.object({
  vehiculoId: z.string().optional(),
  tipoGasto: z.enum(['COMBUSTIBLE', 'VIATICOS', 'PEAJE', 'MANTENIMIENTO', 'OTROS']),
  monto: z.string().min(1, 'Monto requerido'),
  descripcion: z.string().min(2, 'Descripción requerida'),
  comprobante: z.string().optional(),
  fecha: z.string().optional(),
  monedaId: z.string().optional(),
  // CHAT 9: obligatorio
  cuentaId: z.string().min(1, 'Debe seleccionar una cuenta'),
  tipoPagoId: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function GastosPage() {
  const qc = useQueryClient();
  const { usuario } = useAuthStore();
  const { defaultSimbolo } = useMoneda();

  // Filtros — MEJORA 1: por defecto hoy
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroDesde, setFiltroDesde] = useState(() => new Date().toISOString().split('T')[0]);
  const [filtroHasta, setFiltroHasta] = useState(() => new Date().toISOString().split('T')[0]);
  const [showForm, setShowForm] = useState(false);
  // MEJORA 4: detalle
  const [viewing, setViewing] = useState<any>(null);

  // Error de moneda inconsistente
  const [monedaError, setMonedaError] = useState('');

  const hayFiltros = !!(search || filtroTipo || filtroDesde || filtroHasta);

  function limpiarFiltros() {
    setSearch('');
    setFiltroTipo('');
    setFiltroDesde('');
    setFiltroHasta('');
  }

  // ── Datos ──────────────────────────────────────────────────────────────────
  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['gastos', filtroTipo, filtroDesde, filtroHasta, search],
    queryFn: () =>
      gastosApi.listar({
        tipoGasto: filtroTipo as TipoGasto || undefined,
        desde: filtroDesde || undefined,
        hasta: filtroHasta || undefined,
        search: search || undefined,
      } as any).then((r) => r.data.data),
  });

  const { data: resumen } = useQuery({
    queryKey: ['gastos', 'resumen'],
    queryFn: () => gastosApi.resumen().then((r) => r.data.data),
  });

  const { data: vehiculos = [] } = useQuery({
    queryKey: ['vehiculos'],
    queryFn: () => vehiculosApi.listar().then((r) => r.data.data),
  });

  // Cuentas con su moneda incluida — para la lógica cuenta→moneda
  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas', { activo: true }],
    queryFn: () =>
      cuentasApi.getCuentas({ activo: true }).then((r) => r.data.data).catch(() => []),
    staleTime: 5 * 60 * 1000,
  });

  // ── Form ───────────────────────────────────────────────────────────────────
  const {
    register, handleSubmit, reset, setValue, control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { tipoGasto: 'COMBUSTIBLE' },
  });

  // Observar cuentaId y monedaId para la lógica reactiva
  const watchedCuentaId = useWatch({ control, name: 'cuentaId' });
  const watchedMonedaId = useWatch({ control, name: 'monedaId' });

  // Efecto: cuando cambia la cuenta, auto-setear la moneda
  useEffect(() => {
    setMonedaError('');
    if (!watchedCuentaId) return;

    const cuenta = cuentas.find((c) => String(c.id) === watchedCuentaId);
    if (!cuenta) return;

    // Setear monedaId automáticamente según la cuenta seleccionada
    setValue('monedaId', String(cuenta.monedaId), { shouldValidate: false });
  }, [watchedCuentaId, cuentas, setValue]);

  // Efecto: cuando el usuario cambia moneda manualmente, validar consistencia
  useEffect(() => {
    if (!watchedCuentaId || !watchedMonedaId) {
      setMonedaError('');
      return;
    }
    const cuenta = cuentas.find((c) => String(c.id) === watchedCuentaId);
    if (!cuenta) return;

    if (String(cuenta.monedaId) !== watchedMonedaId) {
      setMonedaError(
        `La cuenta "${cuenta.nombre}" opera en ${cuenta.moneda?.codigo ?? 'otra moneda'}. ` +
        `Selecciona la moneda correcta o cambia de cuenta.`
      );
    } else {
      setMonedaError('');
    }
  }, [watchedMonedaId, watchedCuentaId, cuentas]);

  // Cuenta actualmente seleccionada (para mostrar info)
  const cuentaSeleccionada = cuentas.find((c) => String(c.id) === watchedCuentaId);

  const invalidate = () => qc.invalidateQueries({ queryKey: ['gastos'] });

  // ── Excel export ───────────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = gastos.map((g) => ({
      '#': g.id,
      Tipo: TIPO_GASTO_LABEL[g.tipoGasto],
      Concepto: g.descripcion,
      Comprobante: g.comprobante ?? '',
      Vehículo: g.vehiculo ? `${g.vehiculo.placa}` : '',
      [`Monto ${defaultSimbolo}`]: Number(g.monto),
      Fecha: formatDate(g.fecha),
      Usuario: g.usuario?.nombre,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gastos');
    XLSX.writeFile(wb, `gastos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (d: FormData) => {
      if (monedaError) throw new Error(monedaError);
      // CHAT 9: validar saldo insuficiente en cliente antes de enviar
      const monto = parseFloat(d.monto);
      if (cuentaSeleccionada && Number(cuentaSeleccionada.saldoActual) < monto) {
        throw new Error(
          `Saldo insuficiente en la cuenta seleccionada. ` +
          `Saldo disponible: ${cuentaSeleccionada.moneda?.simbolo} ${Number(cuentaSeleccionada.saldoActual).toFixed(2)}`
        );
      }
      return gastosApi.crear({
        vehiculoId: d.vehiculoId ? parseInt(d.vehiculoId) : undefined,
        tipoGasto: d.tipoGasto as TipoGasto,
        monto,
        descripcion: d.descripcion,
        comprobante: d.comprobante,
        fecha: d.fecha,
        cuentaId: parseInt(d.cuentaId),
        monedaId: d.monedaId ? parseInt(d.monedaId) : 1,
        tipoPagoId: d.tipoPagoId ? parseInt(d.tipoPagoId) : undefined,
      });
    },
    onSuccess: () => {
      toast.success('Gasto registrado');
      setShowForm(false);
      reset();
      setMonedaError('');
      invalidate();
      qc.invalidateQueries({ queryKey: ['cuentas'] });
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => gastosApi.eliminar(id),
    onSuccess: () => { toast.success('Gasto eliminado'); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const chartData = resumen?.resumenPorTipo.map((r: { tipoGasto: string; totalMonto: number }) => ({
    name: TIPO_GASTO_LABEL[r.tipoGasto] ?? r.tipoGasto,
    total: r.totalMonto,
  })) ?? [];

  const totalGastos = gastos.reduce((s, g) => s + Number(g.monto), 0);

  return (
    <div className="page-container">
      <PageHeader
        title="Gastos"
        description="Liquidación de gastos operativos"
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={exportExcel}>
              <Download className="w-4 h-4" /> Excel
            </Button>
            <Button onClick={() => { setShowForm(true); reset(); setMonedaError(''); }}>
              <Plus className="w-4 h-4" /> Registrar gasto
            </Button>
          </div>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Total gastos" value={`${defaultSimbolo} ${totalGastos.toFixed(2)}`} color="red" />
        <StatCard label="Registros" value={gastos.length} color="default" />
        <StatCard
          label="Mayor tipo"
          value={resumen?.resumenPorTipo.length
            ? TIPO_GASTO_LABEL[resumen.resumenPorTipo.sort((a: { totalMonto: number }, b: { totalMonto: number }) => b.totalMonto - a.totalMonto)[0].tipoGasto]
            : '—'}
          color="yellow"
        />
      </div>

      {/* Gráfico */}
      {chartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <p className="text-sm font-semibold mb-4">Gastos por tipo</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v) => `${defaultSimbolo}${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [`${defaultSimbolo} ${v.toFixed(2)}`, 'Total']} />
              <Bar dataKey="total" fill="hsl(221,83%,53%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap items-end">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar comprobante, concepto, tipo..."
            className="pl-9 w-72"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} className="w-44">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_GASTO_LABEL).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </Select>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} className="w-36" />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} className="w-36" />
        </div>
        {hayFiltros && (
          <Button variant="ghost" size="sm" onClick={limpiarFiltros} className="text-muted-foreground">
            <X className="w-3.5 h-3.5" /> Limpiar
          </Button>
        )}
      </div>

      {/* Tabla */}
      {isLoading ? <TableSkeleton rows={6} cols={8} /> : (
        <Table>
          <thead>
            <tr>
              <Th>#</Th><Th>Tipo</Th><Th>Concepto</Th><Th>Comprobante</Th><Th>Vehículo</Th>
              <Th>Monto</Th><Th>Fecha</Th>
              {usuario?.rol === 'ADMIN' && <Th>Acc.</Th>}
            </tr>
          </thead>
          <tbody>
            {gastos.length > 0 ? gastos.map((g) => (
              <Tr key={g.id}>
                <Td><span className="font-mono text-xs text-muted-foreground">#{g.id}</span></Td>
                <Td><Badge value={g.tipoGasto} label={TIPO_GASTO_LABEL[g.tipoGasto]} /></Td>
                <Td><span className="text-sm">{g.descripcion}</span></Td>
                <Td>
                  {g.comprobante
                    ? <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{g.comprobante}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </Td>
                <Td>
                  {g.vehiculo
                    ? <span className="text-xs text-muted-foreground">{g.vehiculo.placa} — {g.vehiculo.marca} {g.vehiculo.modelo}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
                </Td>
                <Td><span className="font-semibold text-red-500">{defaultSimbolo} {Number(g.monto).toFixed(2)}</span></Td>
                <Td><span className="text-xs text-muted-foreground">{formatDate(g.fecha)}</span></Td>
                {usuario?.rol === 'ADMIN' && (
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setViewing(g)}
                        className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                        title="Ver detalle"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm('¿Eliminar gasto?')) deleteMutation.mutate(g.id); }}
                        className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </Td>
                )}
              </Tr>
            )) : (
              <tr><td colSpan={8}><EmptyState message="No se encontraron gastos" /></td></tr>
            )}
          </tbody>
        </Table>
      )}

      {/* Modal: Registrar gasto */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); reset(); setMonedaError(''); }}
        title="Registrar gasto"
      >
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">

            <FormField label="Tipo de gasto" required error={errors.tipoGasto?.message}>
              <Select {...register('tipoGasto')}>
                {Object.entries(TIPO_GASTO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </Select>
            </FormField>

            <FormField label="Monto" required error={errors.monto?.message}>
              <Input type="number" step="0.01" placeholder="0.00" {...register('monto')} />
            </FormField>

            <div className="col-span-2">
              <FormField label="Concepto / Descripción" required error={errors.descripcion?.message}>
                <Input placeholder="Descripción del gasto" {...register('descripcion')} />
              </FormField>
            </div>

            <FormField label="Comprobante" error={errors.comprobante?.message}>
              <Input placeholder="N° factura, boleta, ticket..." {...register('comprobante')} />
            </FormField>

            <FormField label="Fecha">
              <Input type="date" {...register('fecha')} />
            </FormField>

            {/* Cuenta origen — OBLIGATORIA — controla la moneda */}
            <div className="col-span-2">
              <FormField label="Cuenta origen" required error={errors.cuentaId?.message}>
                <Select {...register('cuentaId')}>
                  <option value="">Seleccionar cuenta...</option>
                  {cuentas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.moneda?.simbolo} {c.moneda?.codigo}) — Saldo: {c.moneda?.simbolo} {Number(c.saldoActual).toFixed(2)}
                    </option>
                  ))}
                </Select>
              </FormField>
              {cuentaSeleccionada && (
                <div className="flex items-center justify-between mt-1.5 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Saldo disponible</span>
                  <span className={`text-sm font-semibold ${Number(cuentaSeleccionada.saldoActual) <= 0 ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>
                    {cuentaSeleccionada.moneda?.simbolo} {Number(cuentaSeleccionada.saldoActual).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            {/* Moneda — se autocompleta y bloquea cuando hay cuenta seleccionada */}
            <FormField
              label="Moneda"
              error={monedaError || errors.monedaId?.message}
            >
              <MonedaSelector
                placeholder="Seleccionar moneda..."
                {...register('monedaId')}
                // Bloquear si hay cuenta seleccionada (la moneda la define la cuenta)
                disabled={!!watchedCuentaId}
                className={monedaError ? 'border-destructive' : ''}
              />
              {watchedCuentaId && (
                <p className="text-xs text-muted-foreground mt-1">
                  La moneda se fija según la cuenta seleccionada.
                </p>
              )}
            </FormField>

            <FormField label="Tipo de pago">
              <TipoPagoSelector placeholder="Método pago..." {...register('tipoPagoId')} />
            </FormField>

            <div className="col-span-2">
              <FormField label="Vehículo asociado (opcional)">
                <Select {...register('vehiculoId')}>
                  <option value="">Sin vehículo</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>{v.placa} — {v.marca} {v.modelo}</option>
                  ))}
                </Select>
              </FormField>
            </div>

          </div>

          {/* Alerta de error de moneda */}
          {monedaError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {monedaError}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button
              variant="secondary"
              type="button"
              onClick={() => { setShowForm(false); reset(); setMonedaError(''); }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isSubmitting || createMutation.isPending}
              disabled={!!monedaError}
            >
              Registrar gasto
            </Button>
          </div>
        </form>
      </Modal>

      {/* MEJORA 4: Modal de detalle de gasto */}
      <Modal open={!!viewing} onClose={() => setViewing(null)} title="Detalle del gasto" maxWidth="max-w-lg">
        {viewing && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Tipo</p>
                <p className="font-semibold text-sm">{TIPO_GASTO_LABEL[viewing.tipoGasto as keyof typeof TIPO_GASTO_LABEL] ?? viewing.tipoGasto}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Monto</p>
                <p className="font-bold text-lg text-red-500">{formatCurrency(Number(viewing.monto))}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Descripción</p>
                <p className="font-medium text-sm">{viewing.descripcion}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Fecha</p>
                <p className="text-sm">{formatDate(viewing.fecha)}</p>
              </div>
              {viewing.comprobante && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Comprobante</p>
                  <p className="text-sm font-mono">{viewing.comprobante}</p>
                </div>
              )}
              {viewing.vehiculo && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Vehículo asociado</p>
                  <p className="text-sm">{viewing.vehiculo.placa} — {viewing.vehiculo.marca} {viewing.vehiculo.modelo}</p>
                </div>
              )}
              {viewing.cuenta && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Cuenta origen</p>
                  <p className="text-sm">{viewing.cuenta.nombre}</p>
                </div>
              )}
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="secondary" onClick={() => setViewing(null)}>Cerrar</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
