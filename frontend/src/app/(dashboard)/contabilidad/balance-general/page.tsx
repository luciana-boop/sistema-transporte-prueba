'use client';

import { useQuery } from '@tanstack/react-query';
import { contabilidadApi } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { PageHeader, TableSkeleton } from '@/components/shared';

type CuentaSaldo = { id: string; codigo: string; nombre: string; saldo: number };

function SectionTable({ title, filas, total, colorClass }: {
  title: string;
  filas: CuentaSaldo[];
  total: number;
  colorClass: string;
}) {
  return (
    <div>
      <h3 className={`text-sm font-semibold mb-2 ${colorClass}`}>{title}</h3>
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Cuenta</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-b border-border hover:bg-accent/30">
                <td className="px-4 py-2.5 text-sm">{f.codigo} — {f.nombre}</td>
                <td className={`px-4 py-2.5 text-right text-sm font-medium ${colorClass}`}>{formatCurrency(Number(f.saldo))}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={2} className="px-4 py-4 text-center text-xs text-muted-foreground">Sin cuentas</td></tr>}
          </tbody>
          <tfoot className="bg-muted/30">
            <tr>
              <td className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Total {title}:</td>
              <td className={`px-4 py-2.5 text-right font-bold ${colorClass}`}>{formatCurrency(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

export default function BalanceGeneralPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['balance-general'],
    queryFn: () => contabilidadApi.reportes.balanceGeneral().then((r) => r.data.data),
  });

  return (
    <div className="page-container">
      <PageHeader title="Balance General" description="Activos, pasivos y patrimonio" />

      {isLoading ? <TableSkeleton rows={6} cols={2} /> : data ? (
        <div className="flex flex-col gap-6">
          {/* KPI — usa data.totales.ACTIVO etc. */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Activos</p>
              <p className="text-2xl font-bold text-blue-600">{formatCurrency(Number(data.totales.ACTIVO))}</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Total Pasivos</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(Number(data.totales.PASIVO))}</p>
            </div>
            <div className="rounded-xl border border-border p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Patrimonio</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(Number(data.totales.PATRIMONIO))}</p>
            </div>
          </div>

          <div className={`rounded-lg p-3 text-xs font-medium ${data.ecuacionBalanceada ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
            {data.ecuacionBalanceada
              ? 'Balance cuadrado: Activos = Pasivos + Patrimonio'
              : 'Advertencia: el balance no cuadra. Revisá los asientos.'}
          </div>

          <div className="grid grid-cols-2 gap-6">
            <SectionTable title="Activos" filas={data.activos} total={Number(data.totales.ACTIVO)} colorClass="text-blue-600" />
            <div className="flex flex-col gap-6">
              <SectionTable title="Pasivos" filas={data.pasivos} total={Number(data.totales.PASIVO)} colorClass="text-red-600" />
              <SectionTable title="Patrimonio" filas={data.patrimonio} total={Number(data.totales.PATRIMONIO)} colorClass="text-emerald-600" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
