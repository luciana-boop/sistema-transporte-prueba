// FILE: src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyWithSymbol(amount: number, simbolo = 'S/'): string {
  return `${simbolo} ${amount.toFixed(2)}`;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(amount);
}

export function formatDate(dateStr: string, fmt = 'dd/MM/yyyy'): string {
  try {
    return format(parseISO(dateStr), fmt, { locale: es });
  } catch {
    return dateStr;
  }
}

export function formatDatetime(dateStr: string): string {
  return formatDate(dateStr, "dd/MM/yyyy HH:mm");
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    if (e.response && typeof e.response === 'object') {
      const resp = e.response as Record<string, unknown>;
      const data = resp.data as Record<string, unknown> | undefined;
      if (data?.error && typeof data.error === 'string') return data.error;
      if (data?.message && typeof data.message === 'string') return data.message;
    }
    if (e.message && typeof e.message === 'string') return e.message;
  }
  return 'Ocurrió un error inesperado';
}

export const ESTADO_PEDIDO_LABEL: Record<string, string> = {
  ACTIVO:     'Activo',
  ANULADO:    'Anulado',
  FACTURADO:  'Facturado',
};

export const ESTADO_FACTURA_LABEL: Record<string, string> = {
  EMITIDA:   'Emitida',
  PAGADA:    'Pagada',
  PENDIENTE: 'Pendiente',
  PARCIAL:   'Pago parcial',
  ANULADA:   'Anulada',
};

export const CATEGORIA_DETALLE_LABEL: Record<string, string> = {
  PEAJE:   'Peaje',
  BALANZA: 'Balanza',
  VIATICO: 'Viático',
  TOLDO:   'Toldo',
  OTROS:   'Otros',
};

export const METODO_PAGO_LABEL: Record<string, string> = {
  EFECTIVO: 'Efectivo',
  TRANSFERENCIA: 'Transferencia',
  TARJETA: 'Tarjeta',
  CHEQUE: 'Cheque',
};

export const TIPO_GASTO_LABEL: Record<string, string> = {
  COMBUSTIBLE: 'Combustible',
  VIATICOS: 'Viáticos',
  PEAJE: 'Peaje',
  MANTENIMIENTO: 'Mantenimiento',
  OTROS: 'Otros',
};

export const CONDICION_PAGO_LABEL: Record<string, string> = {
  CONTADO: 'Contado',
  CREDITO_15: 'Crédito 15 días',
  CREDITO_30: 'Crédito 30 días',
  CREDITO_60: 'Crédito 60 días',
};
