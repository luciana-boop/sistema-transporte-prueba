// FILE: src/app/(dashboard)/caja/page.tsx
'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Plus, Lock, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { cajaApi, cuentasApi } from '@/services/api';
import { formatCurrency, formatDatetime, getErrorMessage } from '@/lib/utils';
import {
  PageHeader, Button, Table, Th, Td, Tr, Badge, TableSkeleton,
  EmptyState, Modal, FormField, Input, Select, Textarea, StatCard,
} from '@/components/shared';
import { MonedaBadge, TipoCuentaBadge } from '@/components/shared/FinancialSelectors';
import type { TipoMov } from '@/types';

const abrirSchema = z.object({
  saldoApertura: z.string().min(1, 'Saldo de apertura requerido'),
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
});

export default function CajaPage() {
  const qc = useQueryClient();
  const [showAbrir, setShowAbrir] = useState(false);
  const [showCerrar, setShowCerrar] = useState<number | null>(null);
  const [showMov, setShowMov] = useState<number | null>(null);

  const { data: cajas = [], isLoading } = useQuery({
    queryKey: ['cajas'],
    queryFn: () => cajaApi.listar().then((r) => r.data.data),
  });

  const { data: cajaActual } = useQuery({
    queryKey: ['caja-actual'],
    queryFn: () => cajaApi.actual().then((r) => r.data.data),
  });

  const { data: resumenCuentas } = useQuery({
    queryKey: ['cuentas', 'resumen'],
    queryFn: () => cuentasApi.getResumen().then(r => r.data.data).catch(() => null),
  });

  const abrirForm = useForm<z.infer<typeof abrirSchema>>({ resolver: zodResolver(abrirSchema) });
  const cerrarForm = useForm<z.infer<typeof cerrarSchema>>({ resolver: zodResolver(cerrarSchema) });
  const movForm = useForm<z.infer<typeof movSchema>>({ resolver: zodResolver(movSchema), defaultValues: { tipo: 'INGRESO' } });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cajas'] });
    qc.invalidateQueries({ queryKey: ['caja-actual'] });
  };

  const abrirMutation = useMutation({
    mutationFn: (d: z.infer<typeof abrirSchema>) => cajaApi.abrir({ saldoApertura: parseFloat(d.saldoApertura), observaciones: d.observaciones }),
    onSuccess: () => { toast.success('Caja abierta'); setShowAbrir(false); abrirForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const cerrarMutation = useMutation({
    mutationFn: (d: z.infer<typeof cerrarSchema>) => cajaApi.cerrar(showCerrar!, { saldoCierre: parseFloat(d.saldoCierre), observaciones: d.observaciones }),
    onSuccess: () => { toast.success('Caja cerrada'); setShowCerrar(null); cerrarForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  const movMutation = useMutation({
    mutationFn: (d: z.infer<typeof movSchema>) => cajaApi.registrarMovimiento(showMov!, { tipo: d.tipo as TipoMov, monto: parseFloat(d.monto), concepto: d.concepto }),
    onSuccess: () => { toast.success('Movimiento registrado'); setShowMov(null); movForm.reset(); invalidate(); },
    onError: (e) => toast.error(getErrorMessage(e)),
  });

  return (
    <div className="page-container">
      <PageHeader
        title="Caja"
        description="Control de apertura, cierre y movimientos"
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Caja abierta</p>
              <p className="text-xs text-muted-foreground mt-0.5">Abierta desde {formatDatetime(cajaActual.aperturaEn)}</p>
            </div>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-xs text-muted-foreground">Apertura</p>
                <p className="font-semibold text-sm">{formatCurrency(Number(cajaActual.saldoApertura))}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ingresos</p>
                <p className="font-semibold text-sm text-emerald-500">{formatCurrency(cajaActual.ingresosTotales ?? 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Saldo actual</p>
                <p className="font-bold text-primary">{formatCurrency(cajaActual.saldoCalculado ?? 0)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Saldos actuales por cuenta */}
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

      {isLoading ? <TableSkeleton rows={5} cols={6} /> : (
        <Table>
          <thead>
            <tr>
              <Th>Fecha</Th>
              <Th>Usuario</Th>
              <Th>Apertura</Th>
              <Th>Cierre</Th>
              <Th>Estado</Th>
              <Th>Acciones</Th>
            </tr>
          </thead>
          <tbody>
            {cajas.length > 0 ? cajas.map((c) => (
              <Tr key={c.id}>
                <Td><span className="text-sm">{formatDatetime(c.aperturaEn)}</span></Td>
                <Td><span className="text-sm">{c.usuario?.nombre}</span></Td>
                <Td><span className="font-medium">{formatCurrency(Number(c.saldoApertura))}</span></Td>
                <Td><span className="text-sm">{c.saldoCierre ? formatCurrency(Number(c.saldoCierre)) : '—'}</span></Td>
                <Td><Badge value={c.estado} label={c.estado === 'ABIERTA' ? 'Abierta' : 'Cerrada'} /></Td>
                <Td>
                  {c.estado === 'ABIERTA' && (
                    <div className="flex gap-2">
                      <button onClick={() => setShowMov(c.id)} className="text-xs text-primary hover:underline">Movimiento</button>
                      <button onClick={() => setShowCerrar(c.id)} className="text-xs text-destructive hover:underline">Cerrar</button>
                    </div>
                  )}
                </Td>
              </Tr>
            )) : <tr><td colSpan={6}><EmptyState message="No hay cajas registradas" /></td></tr>}
          </tbody>
        </Table>
      )}

      {/* Abrir caja */}
      <Modal open={showAbrir} onClose={() => { setShowAbrir(false); abrirForm.reset(); }} title="Abrir caja">
        <form onSubmit={abrirForm.handleSubmit((d) => abrirMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Saldo de apertura (S/)" required error={abrirForm.formState.errors.saldoApertura?.message}>
            <Input type="number" step="0.01" placeholder="0.00" {...abrirForm.register('saldoApertura')} />
          </FormField>
          <FormField label="Observaciones"><Textarea {...abrirForm.register('observaciones')} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowAbrir(false); abrirForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={abrirMutation.isPending}>Abrir caja</Button>
          </div>
        </form>
      </Modal>

      {/* Cerrar caja */}
      <Modal open={!!showCerrar} onClose={() => { setShowCerrar(null); cerrarForm.reset(); }} title="Cerrar caja">
        <form onSubmit={cerrarForm.handleSubmit((d) => cerrarMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Saldo de cierre (S/)" required error={cerrarForm.formState.errors.saldoCierre?.message}>
            <Input type="number" step="0.01" placeholder="0.00" {...cerrarForm.register('saldoCierre')} />
          </FormField>
          <FormField label="Observaciones"><Textarea {...cerrarForm.register('observaciones')} /></FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowCerrar(null); cerrarForm.reset(); }}>Cancelar</Button>
            <Button variant="destructive" type="submit" loading={cerrarMutation.isPending}>Cerrar caja</Button>
          </div>
        </form>
      </Modal>

      {/* Movimiento */}
      <Modal open={!!showMov} onClose={() => { setShowMov(null); movForm.reset(); }} title="Registrar movimiento">
        <form onSubmit={movForm.handleSubmit((d) => movMutation.mutate(d))} className="flex flex-col gap-4">
          <FormField label="Tipo" required error={movForm.formState.errors.tipo?.message}>
            <Select {...movForm.register('tipo')}>
              <option value="INGRESO">Ingreso</option>
              <option value="EGRESO">Egreso</option>
            </Select>
          </FormField>
          <FormField label="Monto (S/)" required error={movForm.formState.errors.monto?.message}>
            <Input type="number" step="0.01" placeholder="0.00" {...movForm.register('monto')} />
          </FormField>
          <FormField label="Concepto" required error={movForm.formState.errors.concepto?.message}>
            <Input placeholder="Descripción del movimiento" {...movForm.register('concepto')} />
          </FormField>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="secondary" type="button" onClick={() => { setShowMov(null); movForm.reset(); }}>Cancelar</Button>
            <Button type="submit" loading={movMutation.isPending}>Registrar</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
