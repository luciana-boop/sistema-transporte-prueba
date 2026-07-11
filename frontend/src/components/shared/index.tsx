// FILE: src/components/shared/index.tsx
// MODIFICADO: Input, Select, Textarea usan React.forwardRef (fix warning)
'use client';

import React from 'react';
import { cn, NOMBRES_MES } from '@/lib/utils';
import { Loader2, SearchX, ChevronLeft, ChevronRight } from 'lucide-react';

// ─── BADGE ───────────────────────────────────────────────────────────────────
const badgeVariants: Record<string, string> = {
  PENDIENTE:  'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  EN_RUTA:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  ENTREGADO:  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  FACTURADO:  'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  ANULADO:    'bg-red-500/10 text-red-500',
  EMITIDA:    'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  PAGADA:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  ANULADA:    'bg-red-500/10 text-red-500',
  ABIERTA:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  CERRADA:    'bg-slate-500/10 text-slate-500',
  ADMIN:      'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  SECRETARIO: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  INGRESO:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  EGRESO:     'bg-red-500/10 text-red-500',
  ACTIVO:     'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  INACTIVO:   'bg-slate-500/10 text-slate-500',
  PARCIAL:    'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  BUEN_MES:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  MES_REGULAR: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  MAL_MES:     'bg-red-500/10 text-red-500',
  SIN_DATOS:   'bg-slate-500/10 text-slate-500',
  default:    'bg-muted text-muted-foreground',
};

export function Badge({ value, label }: { value: string; label?: string }) {
  const cls = badgeVariants[value] ?? badgeVariants.default;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', cls)}>
      {label ?? value}
    </span>
  );
}

// ─── SKELETON ────────────────────────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-container">
      <div className="p-4 border-b border-border">
        <Skeleton className="h-5 w-40" />
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3 text-left">
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-border last:border-0">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <Skeleton className="h-3 w-full max-w-[120px]" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card-stat">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-7 w-32 mt-1" />
      <Skeleton className="h-3 w-20 mt-1" />
    </div>
  );
}

// ─── EMPTY STATE ─────────────────────────────────────────────────────────────
export function EmptyState({ message = 'No hay datos disponibles' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <SearchX className="w-10 h-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ─── LOADING SPINNER ─────────────────────────────────────────────────────────
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-8 h-8' : 'w-5 h-5';
  return <Loader2 className={cn(s, 'animate-spin text-primary')} />;
}

// ─── AUDITORÍA: quién creó / modificó un registro ────────────────────────────
// Se ubica al final de cada modal/vista de detalle. Solo muestra "Modificado
// por" si difiere de "Creado por" (evita redundancia cuando nunca se editó).
export function AuditInfo({ creadoPor, creadoEn, actualizadoPor, actualizadoEn }: {
  creadoPor?: { nombre: string } | null;
  creadoEn?: string | null;
  actualizadoPor?: { nombre: string } | null;
  actualizadoEn?: string | null;
}) {
  if (!creadoPor && !actualizadoPor) return null;
  const formatearFecha = (f: string) => {
    try { return new Date(f).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }); } catch { return f; }
  };
  const mostrarActualizado = actualizadoPor && (actualizadoPor.nombre !== creadoPor?.nombre || actualizadoEn !== creadoEn);
  return (
    <div className="flex flex-col gap-0.5 pt-2 mt-1 border-t border-border text-[11px] text-muted-foreground/70">
      {creadoPor && <span>Creado por {creadoPor.nombre}{creadoEn ? ` el ${formatearFecha(creadoEn)}` : ''}</span>}
      {mostrarActualizado && <span>Modificado por {actualizadoPor!.nombre}{actualizadoEn ? ` el ${formatearFecha(actualizadoEn)}` : ''}</span>}
    </div>
  );
}

// ─── PAGE HEADER ─────────────────────────────────────────────────────────────
export function PageHeader({
  title, description, action,
}: {
  title: string; description?: string; action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

// ─── MONTH SELECTOR ──────────────────────────────────────────────────────────
export function MonthSelector({
  year, month, onChange,
}: { year: number; month: number; onChange: (year: number, month: number) => void }) {
  const prev = () => (month === 1 ? onChange(year - 1, 12) : onChange(year, month - 1));
  const next = () => (month === 12 ? onChange(year + 1, 1) : onChange(year, month + 1));

  return (
    <div className="flex items-center gap-1 bg-card border border-border rounded-2xl px-2 py-1.5 w-fit shadow-sm">
      <button
        onClick={prev}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-semibold min-w-[130px] text-center capitalize">
        {NOMBRES_MES[month - 1]} {year}
      </span>
      <button
        onClick={next}
        className="w-8 h-8 rounded-xl flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────
export function StatCard({
  label, value, sub, icon: Icon, trend, color = 'default',
}: {
  label: string; value: string | number; sub?: string;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: { value: number; positive: boolean };
  color?: 'default' | 'green' | 'blue' | 'red' | 'yellow';
}) {
  const iconColors = {
    default: 'bg-primary/10 text-primary',
    green:   'bg-emerald-500/10 text-emerald-500',
    blue:    'bg-blue-500/10 text-blue-500',
    red:     'bg-red-500/10 text-red-500',
    yellow:  'bg-yellow-500/10 text-yellow-500',
  };

  const valueColors = {
    default: 'text-foreground',
    green:   'text-emerald-600 dark:text-emerald-400',
    blue:    'text-blue-600 dark:text-blue-400',
    red:     'text-red-600 dark:text-red-400',
    yellow:  'text-amber-600 dark:text-amber-400',
  };

  return (
    <div className="card-stat animate-fade-in">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconColors[color])}>
            <Icon className="w-4 h-4" />
          </div>
        )}
      </div>
      <p className={cn('text-2xl font-bold mt-1', valueColors[color])}>{value}</p>
      <div className="flex items-center gap-2 mt-0.5">
        {trend && (
          <span className={cn('text-xs font-medium', trend.positive ? 'text-emerald-500' : 'text-red-500')}>
            {trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%
          </span>
        )}
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}

// ─── BUTTON ──────────────────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type BtnSize = 'xs' | 'sm' | 'md';

const btnVariants: Record<BtnVariant, string> = {
  primary:     'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
  secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost:       'hover:bg-accent text-muted-foreground hover:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
};
const btnSizes: Record<BtnSize, string> = {
  xs: 'px-2 py-1 text-xs rounded gap-1',
  sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
};

export function Button({
  children, variant = 'primary', size = 'md', className, loading, ...props
}: {
  children: React.ReactNode; variant?: BtnVariant; size?: BtnSize;
  className?: string; loading?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all disabled:opacity-60 disabled:cursor-not-allowed',
        btnVariants[variant], btnSizes[size], className
      )}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ─── INPUT — forwardRef fix ───────────────────────────────────────────────────
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'w-full px-3 py-2 rounded-lg bg-background border border-border text-sm',
        'focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all',
        'placeholder:text-muted-foreground disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);
Input.displayName = 'Input';

// ─── SELECT — forwardRef fix ──────────────────────────────────────────────────
export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      'w-full px-3 py-2 rounded-lg bg-background border border-border text-sm',
      'focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all',
      'disabled:opacity-50',
      className
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = 'Select';

// ─── TEXTAREA — forwardRef fix ────────────────────────────────────────────────
export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full px-3 py-2 rounded-lg bg-background border border-border text-sm',
      'focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all resize-none',
      'placeholder:text-muted-foreground',
      className
    )}
    rows={3}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

// ─── MODAL ───────────────────────────────────────────────────────────────────
export function Modal({
  open, onClose, title, children, maxWidth = 'max-w-lg',
}: {
  open: boolean; onClose: () => void; title: string;
  children: React.ReactNode; maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className={cn('relative bg-card border border-border rounded-2xl shadow-2xl w-full animate-fade-in overflow-y-auto max-h-[90vh]', maxWidth)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h3 className="font-semibold text-base">{title}</h3>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-all text-lg leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

// ─── FORM FIELD ──────────────────────────────────────────────────────────────
export function FormField({
  label, error, required, hint, children,
}: {
  label: string; error?: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {hint && <p className="text-xs text-muted-foreground -mt-0.5">{hint}</p>}
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─── TABLE ───────────────────────────────────────────────────────────────────
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="table-container overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={cn('px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide bg-muted/30 border-b border-border', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn('px-4 py-3 border-b border-border last-of-type:border-0 align-middle', className)}>
      {children}
    </td>
  );
}

export function Tr({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <tr
      className={cn('hover:bg-muted/20 transition-colors', onClick && 'cursor-pointer', className)}
      onClick={onClick}
    >
      {children}
    </tr>
  );
}

// ─── PAGINATION ──────────────────────────────────────────────────────────────
// Controles de "Anterior / Página X de Y / Siguiente" — usar en todos los
// listados junto a PAGE_SIZE (src/lib/utils.ts) para un tamaño de página
// consistente en todo el sistema.
export function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm text-muted-foreground">Página {page} de {totalPages}</span>
      <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Siguiente
      </Button>
    </div>
  );
}

// ─── SMART SEARCH ────────────────────────────────────────────────────────────
export { SmartSearchInput } from './SmartSearchInput';
export type { SmartSearchOption } from './SmartSearchInput';
