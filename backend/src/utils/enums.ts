// FILE: src/utils/enums.ts
// Enum constants as plain objects — usable as both types AND values
// (Prisma enums are only available after `prisma generate`)

export const EstadoPedido = {
  ACTIVO:     'ACTIVO',
  ANULADO:    'ANULADO',
  FACTURADO:  'FACTURADO',   // ← NUEVO: pedido con factura emitida no anulada
} as const;
export type EstadoPedido = typeof EstadoPedido[keyof typeof EstadoPedido];

export const EstadoFactura = {
  EMITIDA:   'EMITIDA',
  PAGADA:    'PAGADA',
  PENDIENTE: 'PENDIENTE',
  PARCIAL:   'PARCIAL',
  ANULADA:   'ANULADA',
} as const;
export type EstadoFactura = typeof EstadoFactura[keyof typeof EstadoFactura];

export const MetodoPago = {
  EFECTIVO:      'EFECTIVO',
  TRANSFERENCIA: 'TRANSFERENCIA',
  TARJETA:       'TARJETA',
  CHEQUE:        'CHEQUE',
} as const;
export type MetodoPago = typeof MetodoPago[keyof typeof MetodoPago];

export const EstadoCaja = {
  ABIERTA:  'ABIERTA',
  CERRADA:  'CERRADA',
} as const;
export type EstadoCaja = typeof EstadoCaja[keyof typeof EstadoCaja];

export const TipoMovimientoCaja = {
  INGRESO: 'INGRESO',
  EGRESO:  'EGRESO',
} as const;
export type TipoMovimientoCaja = typeof TipoMovimientoCaja[keyof typeof TipoMovimientoCaja];

export const TipoGasto = {
  COMBUSTIBLE:  'COMBUSTIBLE',
  VIATICOS:     'VIATICOS',
  PEAJE:        'PEAJE',
  MANTENIMIENTO:'MANTENIMIENTO',
  OTROS:        'OTROS',
} as const;
export type TipoGasto = typeof TipoGasto[keyof typeof TipoGasto];

export const CondicionPago = {
  CONTADO:    'CONTADO',
  CREDITO_15: 'CREDITO_15',
  CREDITO_30: 'CREDITO_30',
  CREDITO_60: 'CREDITO_60',
} as const;
export type CondicionPago = typeof CondicionPago[keyof typeof CondicionPago];

export const Rol = {
  ADMIN:      'ADMIN',
  SECRETARIO: 'SECRETARIO',
} as const;
export type Rol = typeof Rol[keyof typeof Rol];

export const CategoriaDetalle = {
  PEAJE:   'PEAJE',
  BALANZA: 'BALANZA',
  VIATICO: 'VIATICO',
  TOLDO:   'TOLDO',
  OTROS:   'OTROS',
} as const;
export type CategoriaDetalle = typeof CategoriaDetalle[keyof typeof CategoriaDetalle];
