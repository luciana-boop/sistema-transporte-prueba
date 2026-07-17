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

// Condición de pago de un cliente: 'CONTADO' (sentinel fijo) o el código de un
// registro activo de TablaMaestra tipo='tipo_credito' (ver Configuración).
export const CONDICION_PAGO_CONTADO = 'CONTADO';

export const Rol = {
  ADMIN:      'ADMIN',
  SECRETARIO: 'SECRETARIO',
  CHOFER:     'CHOFER',
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

// Módulo Movimientos: categoría de un egreso. COMBUSTIBLE, CAJA_CHICA y
// MANTENIMIENTO habilitan que ese egreso sea consumido desde los módulos
// Combustible, Caja chica y Mantenimiento respectivamente.
export const CategoriaEgreso = {
  COMBUSTIBLE:   'COMBUSTIBLE',
  MANTENIMIENTO: 'MANTENIMIENTO',
  CAJA_CHICA:    'CAJA_CHICA',
  PLANILLA:      'PLANILLA',
  OTROS:         'OTROS',
} as const;
export type CategoriaEgreso = typeof CategoriaEgreso[keyof typeof CategoriaEgreso];

// Módulo Movimientos: categoría de un ingreso. PAGO_FACTURA crea un PagoV2
// "sin aplicar" consumido desde el módulo Cobranza.
export const CategoriaIngreso = {
  PAGO_FACTURA: 'PAGO_FACTURA',
  CAJA_CHICA:   'CAJA_CHICA',
  LIQUIDACION:  'LIQUIDACION',
  OTRO:         'OTRO',
} as const;
export type CategoriaIngreso = typeof CategoriaIngreso[keyof typeof CategoriaIngreso];
