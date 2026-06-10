'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contabilidadApi } from '@/services/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PageHeader, Select } from '@/components/shared';
import type { CuentaContable } from '@/types';

export default function LibroMayorPage() {
  const [cuentaId, setCuentaId] = useState('');

  const { data: cuentas = [] } = useQuery({
    queryKey: ['cuentas-flat'],
    queryFn: () => contabilidadApi.cuentas.listar().then((r) => r.data.data),
  });

  const { data: mayor, isLoading } = useQuery({
    queryKey: ['libro-mayor', cuentaId],
    queryFn: () => contabilidadApi.reportes.libroMayor(cuentaId).then((r) => r.data.data),
    enabled: !!cuentaId,
  });

  const cuenta = (cuentas as CuentaContable[]).find((c) => c.id === cuentaId);

  // Calcular totales desde movimientos
  const totalDebe  = mayor?.movimientos.reduce((s, m) => s + Number(m.debe),  0) ?? 0;
  const totalHaber = mayor?.movimientos.reduce((s, m) => s + Number(m.haber), 0) ?? 0;

  return (
    <div className="page-container">
      <PageHeader title="Libro Mayor" description="Movimientos por cuenta con saldos acumulados" />

      <div className="max-w-xs">
        <Select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)}>
          <option value="">Seleccionar cuenta...</option>
          {(cuentas as CuentaContable[]).map((c) => (
            <option key={c.id} value={c.id}>{c.codigo} — {c.nombre}</option>
          ))}
        </Select>
      </div>

      {cuentaId && (
        <div className="flex flex-col gap-4">
          {cuenta && (
            <div className="bg-muted/30 rounded-xl p-4 flex items-center gap-6 text-sm">
              <div><p className="text-xs text-muted-foreground">Cuenta</p><p className="font-mono font-semibold">{cuenta.codigo} — {cuenta.nombre}</p></div>
              <div><p className="text-xs text-muted-foreground">Tipo</p><p className="font-medium">{cuenta.tipo}</p></div>
              <div><p className="text-xs text-muted-foreground">Naturaleza</p><p className="font-medium">{cuenta.naturaleza}</p></div>
              {mayor && (
                <div className="ml-auto text-right">
                  <p className="text-xs text-muted-foreground">Saldo final</p>
                  <p className={`text-lg font-bold ${Number(mayor.saldoFinal) >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                    {formatCurrency(Number(mayor.saldoFinal))}
                  </p>
                </div>
              )}
            </div>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Cargando...</p>
          ) : mayor && mayor.movimientos.length > 0 ? (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Fecha</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">N° Asiento</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Descripción</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Debe</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Haber</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {mayor.movimientos.map((m, i) => (
                    <tr key={i} className="border-b border-border hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(m.fecha)}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{m.numero}</td>
                      <td className="px-4 py-2.5 text-sm">{m.descripcion}</td>
                      <td className="px-4 py-2.5 text-right text-sm">{Number(m.debe) > 0 ? formatCurrency(Number(m.debe)) : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-sm">{Number(m.haber) > 0 ? formatCurrency(Number(m.haber)) : '—'}</td>
                      <td className={`px-4 py-2.5 text-right text-sm font-semibold ${Number(m.saldoAcumulado) < 0 ? 'text-destructive' : ''}`}>
                        {formatCurrency(Number(m.saldoAcumulado))}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Totales:</td>
                    <td className="px-4 py-3 text-right text-sm font-bold">{formatCurrency(totalDebe)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold">{formatCurrency(totalHaber)}</td>
                    <td className="px-4 py-3 text-right text-sm font-bold">{formatCurrency(Number(mayor.saldoFinal))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic text-center py-8">Esta cuenta no tiene movimientos.</p>
          )}
        </div>
      )}

      {!cuentaId && (
        <p className="text-sm text-muted-foreground italic text-center py-12">Seleccioná una cuenta para ver sus movimientos.</p>
      )}
    </div>
  );
}
