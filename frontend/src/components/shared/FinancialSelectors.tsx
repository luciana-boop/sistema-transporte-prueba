// FILE: src/components/shared/FinancialSelectors.tsx
'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { cuentasApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { Select } from './index';

// ─── MONEDA SELECTOR ─────────────────────────────────────────────────────────
interface MonedaSelectorProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

export const MonedaSelector = React.forwardRef<HTMLSelectElement, MonedaSelectorProps>(
  ({ placeholder, className, ...props }, ref) => {
    const { data: monedas = [] } = useQuery({
      queryKey: ['monedas', 'activas'],
      queryFn: () => cuentasApi.getMonedasActivas().then(r => r.data.data).catch(() => []),
      staleTime: 10 * 60 * 1000,
    });

    return (
      <Select ref={ref} className={className} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {monedas.map(m => (
          <option key={m.id} value={m.id}>
            {m.simbolo} {m.codigo} — {m.nombre}
          </option>
        ))}
      </Select>
    );
  }
);
MonedaSelector.displayName = 'MonedaSelector';

// ─── CUENTA SELECTOR ─────────────────────────────────────────────────────────
interface CuentaSelectorProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
  soloActivas?: boolean;
}

export const CuentaSelector = React.forwardRef<HTMLSelectElement, CuentaSelectorProps>(
  ({ placeholder, soloActivas = true, className, ...props }, ref) => {
    const { data: cuentas = [] } = useQuery({
      queryKey: ['cuentas', soloActivas],
      queryFn: () => cuentasApi.getCuentas(soloActivas).then(r => r.data.data).catch(() => []),
      staleTime: 5 * 60 * 1000,
    });

    return (
      <Select ref={ref} className={className} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {cuentas.map(c => (
          <option key={c.id} value={c.id}>
            {c.nombre} ({c.moneda?.simbolo ?? 'S/'} {c.moneda?.codigo ?? 'PEN'})
          </option>
        ))}
      </Select>
    );
  }
);
CuentaSelector.displayName = 'CuentaSelector';

// ─── TIPO PAGO SELECTOR ───────────────────────────────────────────────────────
interface TipoPagoSelectorProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  placeholder?: string;
}

export const TipoPagoSelector = React.forwardRef<HTMLSelectElement, TipoPagoSelectorProps>(
  ({ placeholder, className, ...props }, ref) => {
    const { data: tipos = [] } = useQuery({
      queryKey: ['tipos-pago', 'activos'],
      queryFn: () => cuentasApi.getTiposPagoActivos().then(r => r.data.data).catch(() => []),
      staleTime: 10 * 60 * 1000,
    });

    return (
      <Select ref={ref} className={className} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {tipos.map(t => (
          <option key={t.id} value={t.id}>{t.nombre}</option>
        ))}
      </Select>
    );
  }
);
TipoPagoSelector.displayName = 'TipoPagoSelector';

// ─── MONEDA BADGE ─────────────────────────────────────────────────────────────
export function MonedaBadge({ codigo, simbolo }: { codigo: string; simbolo?: string }) {
  const colorMap: Record<string, string> = {
    PEN: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    USD: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    EUR: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };
  const cls = colorMap[codigo] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium gap-1', cls)}>
      {simbolo && <span>{simbolo}</span>}
      {codigo}
    </span>
  );
}

// ─── TIPO CUENTA BADGE ────────────────────────────────────────────────────────
export function TipoCuentaBadge({ tipo }: { tipo: string }) {
  const colorMap: Record<string, string> = {
    CAJA:    'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
    BANCO:   'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    DIGITAL: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  };
  const labelMap: Record<string, string> = { CAJA: 'Caja', BANCO: 'Banco', DIGITAL: 'Digital' };
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', colorMap[tipo] ?? 'bg-muted text-muted-foreground')}>
      {labelMap[tipo] ?? tipo}
    </span>
  );
}
