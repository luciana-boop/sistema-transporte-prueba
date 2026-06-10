'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, List, BookMarked, BarChart3, Scale, TrendingUp, Building2, Settings2, Stethoscope } from 'lucide-react';
import { contabilidadApi } from '@/services/api';
import { formatCurrency } from '@/lib/utils';
import { PageHeader, StatCard } from '@/components/shared';

const subModules = [
  { href: '/contabilidad/plan-de-cuentas',  label: 'Plan de Cuentas',      desc: 'Árbol jerárquico de cuentas contables',    icon: List,       color: 'text-blue-500'   },
  { href: '/contabilidad/libro-diario',     label: 'Libro Diario',         desc: 'Asientos contables manuales y automáticos', icon: BookMarked, color: 'text-violet-500' },
  { href: '/contabilidad/libro-mayor',      label: 'Libro Mayor',          desc: 'Movimientos por cuenta con saldos',         icon: BarChart3,  color: 'text-amber-500'  },
  { href: '/contabilidad/balance',          label: 'Balance Comprobación', desc: 'Sumas y saldos de todas las cuentas',       icon: Scale,      color: 'text-emerald-500'},
  { href: '/contabilidad/resultados',       label: 'Estado Resultados',    desc: 'Ingresos y gastos del período',            icon: TrendingUp, color: 'text-rose-500'   },
  { href: '/contabilidad/balance-general',  label: 'Balance General',      desc: 'Activos, pasivos y patrimonio',            icon: Building2,  color: 'text-indigo-500' },
  { href: '/contabilidad/configuracion',    label: 'Configuración',        desc: 'Mapeo de cuentas para asientos automáticos',icon: Settings2, color: 'text-slate-500'  },
  { href: '/contabilidad/diagnostico',      label: 'Diagnóstico',          desc: 'Salud de la contabilidad: configuración, asientos y saldos', icon: Stethoscope, color: 'text-cyan-500' },
];

export default function ContabilidadPage() {
  const { data: cuentas = [] } = useQuery({
    queryKey: ['contabilidad-cuentas'],
    queryFn: () => contabilidadApi.cuentas.listar().then((r) => r.data.data),
  });

  const { data: balance } = useQuery({
    queryKey: ['contabilidad-balance'],
    queryFn: () => contabilidadApi.reportes.balanceComprobacion().then((r) => r.data.data),
  });

  const { data: resultados } = useQuery({
    queryKey: ['contabilidad-resultados'],
    queryFn: () => contabilidadApi.reportes.estadoResultados().then((r) => r.data.data),
  });

  return (
    <div className="page-container">
      <PageHeader title="Contabilidad" description="Módulo contable del sistema de transportes" />

      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Cuentas activas" value={cuentas.filter((c) => c.activa).length} color="default" />
        <StatCard label="Total ingresos" value={resultados ? formatCurrency(resultados.totalIngresos) : '—'} color="blue" />
        <StatCard label="Total gastos" value={resultados ? formatCurrency(resultados.totalGastos) : '—'} color="red" />
        <StatCard
          label="Resultado"
          value={resultados ? formatCurrency(resultados.resultado) : '—'}
          color={resultados && resultados.resultado >= 0 ? 'blue' : 'red'}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {subModules.map((mod) => (
          <Link
            key={mod.href}
            href={mod.href}
            className="group flex flex-col gap-3 p-5 rounded-xl border border-border bg-card hover:bg-accent/30 hover:border-primary/30 transition-all"
          >
            <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center ${mod.color}`}>
              <mod.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm group-hover:text-primary transition-colors">{mod.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{mod.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
