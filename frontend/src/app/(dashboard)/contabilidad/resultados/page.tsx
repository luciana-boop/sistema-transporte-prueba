'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { contabilidadApi } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { PageHeader, TableSkeleton } from '@/components/shared';
import type { FilaEstadoResultados } from '@/types';

export default function EstadoResultadosPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['estado-resultados'],
    queryFn: () => contabilidadApi.reportes.estadoResultados().then((r) => r.data.data),
  });

  return (
    <div className="page-container">
      <PageHeader title="Estado de Resultados" description="Ingresos y gastos del período" />

      {isLoading ? <TableSkeleton rows={6} cols={3} /> : data ? (
        <div className="flex flex-col gap-6 max-w-2xl">
          {/* KPI */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1"><TrendingUp className="w-4 h-4 text-emerald-500" /><p className="text-xs text-muted-foreground">Ingresos</p></div>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(Number(data.totalIngresos))}</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1"><TrendingDown className="w-4 h-4 text-red-500" /><p className="text-xs text-muted-foreground">Gastos</p></div>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(Number(data.totalGastos))}</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${Number(data.resultado) >= 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-xs text-muted-foreground mb-1">Resultado neto</p>
              <p className={`text-2xl font-bold ${Number(data.resultado) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {Number(data.resultado) >= 0 ? '+' : ''}{formatCurrency(Number(data.resultado))}
              </p>
            </div>
          </div>

          {/* Ingresos */}
          <div>
            <h3 className="text-sm font-semibold text-emerald-600 mb-2 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Ingresos</h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Cuenta</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ingresos.map((f: FilaEstadoResultados) => (
                    <tr key={f.id} className="border-b border-border hover:bg-accent/30">
                      <td className="px-4 py-2.5 text-sm">{f.codigo} — {f.nombre}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium text-emerald-600">{formatCurrency(Number(f.monto))}</td>
                    </tr>
                  ))}
                  {data.ingresos.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-xs text-muted-foreground">Sin ingresos registrados</td></tr>}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total ingresos:</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-600">{formatCurrency(Number(data.totalIngresos))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Gastos */}
          <div>
            <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2"><TrendingDown className="w-4 h-4" /> Gastos y Costos</h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Cuenta</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gastos.map((f: FilaEstadoResultados) => (
                    <tr key={f.id} className="border-b border-border hover:bg-accent/30">
                      <td className="px-4 py-2.5 text-sm">{f.codigo} — {f.nombre}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium text-red-600">{formatCurrency(Number(f.monto))}</td>
                    </tr>
                  ))}
                  {data.gastos.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-xs text-muted-foreground">Sin gastos registrados</td></tr>}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total gastos:</td>
                    <td className="px-4 py-2.5 text-right font-bold text-red-600">{formatCurrency(Number(data.totalGastos))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
