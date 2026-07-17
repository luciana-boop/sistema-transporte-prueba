// FILE: src/utils/types.ts
// Tipos locales que replican los enums de Prisma para uso sin cliente generado

export type Rol = 'ADMIN' | 'SECRETARIO' | 'CHOFER';
export type EstadoPedido = 'PENDIENTE' | 'EN_RUTA' | 'ENTREGADO' | 'FACTURADO' | 'ANULADO';
export type EstadoFactura = 'EMITIDA' | 'PAGADA' | 'PENDIENTE' | 'ANULADA';
export type EstadoCaja = 'ABIERTA' | 'CERRADA';
export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO';
// 'CONTADO' o el código de un TablaMaestra tipo='tipo_credito' (ver Configuración)
export type CondicionPago = string;
