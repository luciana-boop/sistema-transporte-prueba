// FILE: src/config/permisos.config.ts
// ─────────────────────────────────────────────────────────────────────────────
// Fuente de verdad de todos los módulos y acciones del sistema.
// Importar desde aquí tanto en backend como en frontend.
// No usar strings sueltos: siempre referenciar estas constantes.
// ─────────────────────────────────────────────────────────────────────────────

// Módulos disponibles en el sistema
// El 'key' debe coincidir con moduloKey en la tabla permisos_modulos
export const MODULOS = {
  DASHBOARD:      'dashboard',
  CLIENTES:       'clientes',
  PEDIDOS:        'pedidos',
  CONDUCTORES:    'conductores',
  VEHICULOS:      'vehiculos',
  FACTURACION:    'facturacion',
  MOVIMIENTOS:    'movimientos',
  LIQUIDACIONES:  'liquidaciones',
  COMBUSTIBLE:    'combustible',
  CAJA:           'caja',
  REPORTES:       'reportes',
  CONFIGURACION:  'configuracion',
  BACKUPS:        'backups',
  USUARIOS:       'usuarios',
} as const;

export type ModuloKey = typeof MODULOS[keyof typeof MODULOS];

// Acciones especiales que requieren permiso explícito
// El 'key' debe coincidir con accionKey en la tabla permisos_acciones
export const ACCIONES = {
  ANULAR_FACTURA:           'anular_factura',
  ANULAR_BOLETA:            'anular_boleta',
  ANULAR_SERVICIO:          'anular_servicio',
  ANULAR_MOVIMIENTO:        'anular_movimiento',
  ANULAR_MOVIMIENTO_CAJA:   'anular_movimiento_caja',
  ANULAR_MOVIMIENTO_CUENTA: 'anular_movimiento_cuenta',
} as const;

export type AccionKey = typeof ACCIONES[keyof typeof ACCIONES];

// Metadatos para la UI de administración de permisos
// El admin verá estas etiquetas al configurar permisos de un usuario
export const MODULOS_META: Record<ModuloKey, { label: string; descripcion: string }> = {
  dashboard:      { label: 'Dashboard',      descripcion: 'Panel principal con métricas' },
  clientes:       { label: 'Clientes',       descripcion: 'Gestión de clientes' },
  pedidos:        { label: 'Pedidos',        descripcion: 'Gestión de pedidos de servicio' },
  conductores:    { label: 'Conductores',    descripcion: 'Gestión de conductores' },
  vehiculos:      { label: 'Vehículos',      descripcion: 'Gestión de vehículos y flota' },
  facturacion:    { label: 'Facturación',    descripcion: 'Emisión y gestión de facturas' },
  movimientos:    { label: 'Movimientos',    descripcion: 'Ingresos y egresos, importación bancaria y cobranza' },
  liquidaciones:  { label: 'Liquidaciones',  descripcion: 'Liquidaciones de conductores' },
  combustible:    { label: 'Combustible',    descripcion: 'Registro de combustible' },
  caja:           { label: 'Caja',           descripcion: 'Control de caja diaria' },
  reportes:       { label: 'Reportes',       descripcion: 'Reportes y estadísticas' },
  configuracion:  { label: 'Configuración',  descripcion: 'Configuración del sistema' },
  backups:        { label: 'Backups',        descripcion: 'Respaldo de base de datos' },
  usuarios:       { label: 'Usuarios',       descripcion: 'Gestión de usuarios del sistema' },
};

export const ACCIONES_META: Record<AccionKey, { label: string; descripcion: string; modulo: ModuloKey }> = {
  anular_factura:           { label: 'Anular factura',           descripcion: 'Permite anular facturas emitidas',                              modulo: 'facturacion' },
  anular_boleta:            { label: 'Anular boleta',            descripcion: 'Permite anular boletas emitidas',                               modulo: 'facturacion' },
  anular_servicio:          { label: 'Anular servicio',          descripcion: 'Permite anular servicios/pedidos',                              modulo: 'pedidos' },
  anular_movimiento:        { label: 'Anular movimiento',        descripcion: 'Permite anular un movimiento (ingreso/egreso) y su cobranza vinculada', modulo: 'movimientos' },
  anular_movimiento_caja:   { label: 'Anular movimiento de caja',  descripcion: 'Permite anular movimientos manuales de una caja diaria',       modulo: 'caja' },
  anular_movimiento_cuenta: { label: 'Anular movimiento de cuenta', descripcion: 'Permite anular movimientos de cuentas (revierte el saldo)',   modulo: 'configuracion' },
};

// Arrays para iterar (útil en seeds y en la UI)
export const TODOS_LOS_MODULOS = Object.values(MODULOS) as ModuloKey[];
export const TODAS_LAS_ACCIONES = Object.values(ACCIONES) as AccionKey[];
