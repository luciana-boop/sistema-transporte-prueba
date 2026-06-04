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
  COBRANZA:       'cobranza',
  LIQUIDACIONES:  'liquidaciones',
  COMBUSTIBLE:    'combustible',
  CAJA:           'caja',
  GASTOS:         'gastos',
  REPORTES:       'reportes',
  CONFIGURACION:  'configuracion',
  BACKUPS:        'backups',
  USUARIOS:       'usuarios',
} as const;

export type ModuloKey = typeof MODULOS[keyof typeof MODULOS];

// Acciones especiales que requieren permiso explícito
// El 'key' debe coincidir con accionKey en la tabla permisos_acciones
export const ACCIONES = {
  ANULAR_FACTURA:     'anular_factura',
  ANULAR_BOLETA:      'anular_boleta',
  ANULAR_SERVICIO:    'anular_servicio',
  ANULAR_COBRANZA:    'anular_cobranza',
  ANULAR_COMPROBANTE: 'anular_comprobante',
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
  cobranza:       { label: 'Cobranza',       descripcion: 'Gestión de cobros y pagos' },
  liquidaciones:  { label: 'Liquidaciones',  descripcion: 'Liquidaciones de conductores' },
  combustible:    { label: 'Combustible',    descripcion: 'Registro de combustible' },
  caja:           { label: 'Caja',           descripcion: 'Control de caja diaria' },
  gastos:         { label: 'Gastos',         descripcion: 'Registro de gastos operativos' },
  reportes:       { label: 'Reportes',       descripcion: 'Reportes y estadísticas' },
  configuracion:  { label: 'Configuración',  descripcion: 'Configuración del sistema' },
  backups:        { label: 'Backups',        descripcion: 'Respaldo de base de datos' },
  usuarios:       { label: 'Usuarios',       descripcion: 'Gestión de usuarios del sistema' },
};

export const ACCIONES_META: Record<AccionKey, { label: string; descripcion: string; modulo: ModuloKey }> = {
  anular_factura:     { label: 'Anular factura',     descripcion: 'Permite anular facturas emitidas',       modulo: 'facturacion' },
  anular_boleta:      { label: 'Anular boleta',      descripcion: 'Permite anular boletas emitidas',        modulo: 'facturacion' },
  anular_servicio:    { label: 'Anular servicio',    descripcion: 'Permite anular servicios/pedidos',       modulo: 'pedidos' },
  anular_cobranza:    { label: 'Anular cobranza',    descripcion: 'Permite anular registros de cobranza',   modulo: 'cobranza' },
  anular_comprobante: { label: 'Anular comprobante', descripcion: 'Permite anular comprobantes de pago',    modulo: 'cobranza' },
};

// Arrays para iterar (útil en seeds y en la UI)
export const TODOS_LOS_MODULOS = Object.values(MODULOS) as ModuloKey[];
export const TODAS_LAS_ACCIONES = Object.values(ACCIONES) as AccionKey[];
