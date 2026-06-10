'use client';

import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { contabilidadApi } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { PageHeader, Button, TableSkeleton } from '@/components/shared';
import type { FilaBalanceComprobacion } from '@/types';
import * as XLSX from 'xlsx';

export default function BalanceComprobacionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['balance-comprobacion'],
    queryFn: () => contabilidadApi.reportes.balanceComprobacion().then((r) => r.data.data),
  });

  const exportExcel = () => {
    if (!data) return;
    const rows = data.filas.map((f: FilaBalanceComprobacion) => ({
      Código: f.codigo, Cuenta: f.nombre, Tipo: f.tipo,
      'Suma Debe': Number(f.debe), 'Suma Haber': Number(f.haber), 'Saldo': Number(f.saldo),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Balance');
    XLSX.writeFile(wb, `balance_comprobacion_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  return (
    <div className="page-container">
      <PageHeader
        title="Balance de Comprobación"
        description="Sumas y saldos de todas las cuentas"
        action={<Button variant="secondary" size="sm" onClick={exportExcel} disabled={!data}><Download className="w-4 h-4" /> Excel</Button>}
      />

      {isLoading ? <TableSkeleton rows={8} cols={5} /> : data ? (
        <div className="flex flex-col gap-4">
          {/* Resumen */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Debe</p>
              <p className="text-lg font-bold">{formatCurrency(Number(data.totales.debe))}</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Haber</p>
              <p className="text-lg font-bold">{formatCurrency(Number(data.totales.haber))}</p>
            </div>
            <div className={`rounded-xl border p-4 text-center ${data.totales.balanceado ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              <p className="text-xs text-muted-foreground">Estado</p>
              <p className={`text-lg font-bold ${data.totales.balanceado ? 'text-emerald-600' : 'text-red-600'}`}>
                {data.totales.balanceado ? 'Balanceado' : 'Descuadrado'}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Código</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Cuenta</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground">Naturaleza</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Suma Debe</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Suma Haber</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {data.filas.map((f: FilaBalanceComprobacion) => (
                  <tr key={f.id} className="border-b border-border hover:bg-accent/30 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{f.codigo}</td>
                    <td className="px-4 py-2.5 text-sm">{f.nombre}</td>
                    <td className="px-4 py-2.5"><span className="text-xs px-1.5 py-0.5 rounded bg-muted">{f.tipo}</span></td>
                    <td className="px-4 py-2.5"><span className={`text-xs ${f.naturaleza === 'DEUDORA' ? 'text-blue-600' : 'text-amber-600'}`}>{f.naturaleza}</span></td>
                    <td className="px-4 py-2.5 text-right text-sm">{Number(f.debe) > 0 ? formatCurrency(Number(f.debe)) : '—'}</td>
                    <td className="px-4 py-2.5 text-right text-sm">{Number(f.haber) > 0 ? formatCurrency(Number(f.haber)) : '—'}</td>
                    <td className={`px-4 py-2.5 text-right text-sm font-medium ${Number(f.saldo) >= 0 ? '' : 'text-destructive'}`}>{formatCurrency(Number(f.saldo))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/30">
                <tr>
                  <td colSpan={4} className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground">Totales:</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(Number(data.totales.debe))}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(Number(data.totales.haber))}</td>
                  <td className="px-4 py-3 text-right font-bold">{formatCurrency(Number(data.totales.debe) - Number(data.totales.haber))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
