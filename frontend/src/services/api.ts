// FILE: src/services/api.ts

import api from '@/lib/axios';
import type {
  ApiResponse, Usuario, Cliente, Pedido, Factura,
  Pago, CuentaPorCobrar, Caja, Gasto, DashboardData,
  EstadoPedido, MetodoPago, TipoMov, TipoGasto, CondicionPago, Rol,
} from '@/types';

// ─── AUTH ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ token: string; usuario: Usuario }>>('/api/auth/login', { email, password }),

  perfil: () =>
    api.get<ApiResponse<Usuario>>('/api/auth/perfil'),
};

// ─── CLIENTES ────────────────────────────────────────────────────────────────
export const clientesApi = {
  listar: (params?: { activo?: boolean; search?: string }) =>
    api.get<ApiResponse<Cliente[]>>('/api/clientes', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Cliente>>(`/api/clientes/${id}`),

  estadisticas: (id: number) =>
    api.get<ApiResponse<{ totalPedidos: number; facturado: number; pagado: number; saldoPendiente: number; pedidosPendientes: number }>>(`/api/clientes/${id}/estadisticas`),

  crear: (data: {
    razonSocial: string; ruc: string; direccion: string;
    telefono?: string; email?: string; condicionPago?: CondicionPago;
  }) => api.post<ApiResponse<Cliente>>('/api/clientes', data),

  actualizar: (id: number, data: Partial<Cliente>) =>
    api.put<ApiResponse<Cliente>>(`/api/clientes/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/clientes/${id}`),
};

// ─── PEDIDOS ─────────────────────────────────────────────────────────────────
export const pedidosApi = {
  listar: (params?: { estado?: EstadoPedido; clienteId?: number; desde?: string; hasta?: string; search?: string }) =>
    api.get<ApiResponse<Pedido[]>>('/api/pedidos', { params }),

  /** Pedidos ACTIVOS sin factura vigente del cliente — para el formulario de facturación */
  disponibles: (clienteId: number) =>
    api.get<ApiResponse<Pedido[]>>('/api/pedidos/disponibles', { params: { clienteId } }),

  obtener: (id: number) =>
    api.get<ApiResponse<Pedido>>(`/api/pedidos/${id}`),

  rentabilidad: (id: number) =>
    api.get<ApiResponse<{ pedidoId: number; tarifa: number; totalGastos: number; utilidadNeta: number; margenPorcentaje: number }>>(`/api/pedidos/${id}/rentabilidad`),

  crear: (data: {
    clienteId: number; origen: string; destino: string;
    tipoCarga: string; tarifa: number; observaciones?: string;
  }) => api.post<ApiResponse<Pedido>>('/api/pedidos', data),

  actualizar: (id: number, data: Partial<Pedido>) =>
    api.put<ApiResponse<Pedido>>(`/api/pedidos/${id}`, data),

  anular: (id: number) =>
    api.patch<ApiResponse<Pedido>>(`/api/pedidos/${id}/anular`, {}),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/pedidos/${id}`),
};

// ─── FACTURACIÓN ─────────────────────────────────────────────────────────────
export const facturacionApi = {
  listar: (params?: { estado?: string; clienteId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Factura[]>>('/api/facturacion', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Factura>>(`/api/facturacion/${id}`),

  series: () =>
    api.get<ApiResponse<string[]>>('/api/facturacion/series'),

  proximoCorrelativo: (serie: string) =>
    api.get<ApiResponse<{ serie: string; correlativo: number; numeroFactura: string }>>(`/api/facturacion/correlativo/${serie}`),

  crear: (data: {
    clienteId: number; pedidoId?: number; serie?: string; subtotal: number;
    porcentajeIgv?: number; detraccion?: number; porcentajeDetraccion?: number;
    tipoCredito?: string; diasCredito?: number; guiaReferencia?: string;
    detalle?: string; fechaVencimiento: string; observaciones?: string;
  }) => api.post<ApiResponse<Factura>>('/api/facturacion', data),

  crearDesdeXml: (data: Record<string, unknown>) =>
    api.post<ApiResponse<Factura>>('/api/facturacion/desde-xml', data),

  importacionMasivaXml: (facturas: Record<string, unknown>[]) =>
    api.post<ApiResponse<{ creadas: number; duplicadas: number; errores: string[] }>>('/api/facturacion/importacion-masiva-xml', { facturas }),

  actualizar: (id: number, data: { observaciones?: string; fechaVencimiento?: string; detalle?: string; estadoSunat?: string }) =>
    api.put<ApiResponse<Factura>>(`/api/facturacion/${id}`, data),

  anular: (id: number) =>
    api.patch<ApiResponse<Factura>>(`/api/facturacion/${id}/anular`, {}),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/facturacion/${id}`),
};

// ─── COBRANZA ────────────────────────────────────────────────────────────────
export const cobranzaApi = {
  listar: (params?: { clienteId?: number; metodoPago?: MetodoPago; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Pago[]>>('/api/cobranza', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Pago>>(`/api/cobranza/${id}`),

  cuentasPorCobrar: () =>
    api.get<ApiResponse<CuentaPorCobrar[]>>('/api/cobranza/cuentas-por-cobrar'),

  facturasPorCliente: (clienteId: number) =>
    api.get<ApiResponse<Array<{ id: number; numeroFactura: string; total: number; pagado: number; saldoPendiente: number; estado: string; fechaVencimiento: string; vencida: boolean }>>>(`/api/cobranza/facturas-cliente/${clienteId}`),

  registrarPago: (data: {
    facturaId: number; monto: number; metodoPago: MetodoPago;
    referencia?: string; observaciones?: string; fechaPago?: string;
  }) => api.post<ApiResponse<Pago>>('/api/cobranza', data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/cobranza/${id}`),
};

// ─── CAJA ────────────────────────────────────────────────────────────────────
export const cajaApi = {
  listar: (params?: { estado?: string; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Caja[]>>('/api/caja', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Caja>>(`/api/caja/${id}`),

  actual: () =>
    api.get<ApiResponse<Caja | null>>('/api/caja/actual'),

  abrir: (data: { saldoApertura: number; observaciones?: string }) =>
    api.post<ApiResponse<Caja>>('/api/caja/abrir', data),

  cerrar: (id: number, data: { saldoCierre: number; observaciones?: string }) =>
    api.patch<ApiResponse<Caja>>(`/api/caja/${id}/cerrar`, data),

  registrarMovimiento: (id: number, data: { tipo: TipoMov; monto: number; concepto: string }) =>
    api.post<ApiResponse<{ id: number; tipo: TipoMov; monto: number; concepto: string }>>(`/api/caja/${id}/movimiento`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/caja/${id}`),
};

// ─── GASTOS ──────────────────────────────────────────────────────────────────
export const gastosApi = {
  listar: (params?: { tipoGasto?: TipoGasto; pedidoId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Gasto[]>>('/api/gastos', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Gasto>>(`/api/gastos/${id}`),

  resumen: (params?: { desde?: string; hasta?: string; pedidoId?: number }) =>
    api.get<ApiResponse<{ resumenPorTipo: Array<{ tipoGasto: TipoGasto; totalMonto: number; cantidadRegistros: number }>; totalGeneral: number }>>('/api/gastos/resumen', { params }),

  crear: (data: {
    pedidoId?: number; tipoGasto: TipoGasto; monto: number;
    descripcion: string; comprobante?: string; fecha?: string;
  }) => api.post<ApiResponse<Gasto>>('/api/gastos', data),

  actualizar: (id: number, data: Partial<Gasto>) =>
    api.put<ApiResponse<Gasto>>(`/api/gastos/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/gastos/${id}`),
};

// ─── REPORTES ────────────────────────────────────────────────────────────────
export const reportesApi = {
  dashboard: () =>
    api.get<ApiResponse<DashboardData>>('/api/reportes/dashboard'),

  pedidos: (params?: { desde?: string; hasta?: string; clienteId?: number }) =>
    api.get<ApiResponse<{
      pedidos: Pedido[];
      resumenEstados: Array<{ estado: EstadoPedido; cantidad: number; totalTarifas: number }>;
      totales: { cantidad: number; tarifaTotal: number };
    }>>('/api/reportes/pedidos', { params }),

  facturacion: (params?: { desde?: string; hasta?: string; clienteId?: number }) =>
    api.get<ApiResponse<{
      facturas: Factura[];
      resumenEstados: Array<{ estado: string; cantidad: number; total: number }>;
      totales: { cantidad: number; subtotal: number; igv: number; total: number };
    }>>('/api/reportes/facturacion', { params }),

  cobranza: (params?: { desde?: string; hasta?: string; clienteId?: number }) =>
    api.get<ApiResponse<{
      pagos: Pago[];
      resumenPorMetodo: Array<{ metodoPago: MetodoPago; cantidad: number; total: number }>;
      totales: { cantidad: number; totalCobrado: number };
    }>>('/api/reportes/cobranza', { params }),

  caja: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<{ cajas: Caja[]; totalesGlobales: { ingresos: number; egresos: number } }>>('/api/reportes/caja', { params }),

  gastos: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<{
      gastos: Gasto[];
      resumenPorTipo: Array<{ tipoGasto: TipoGasto; cantidad: number; total: number }>;
      totales: { cantidad: number; totalGastos: number };
    }>>('/api/reportes/gastos', { params }),
};

// ─── USUARIOS ────────────────────────────────────────────────────────────────
export const usuariosApi = {
  listar: () =>
    api.get<ApiResponse<Usuario[]>>('/api/usuarios'),

  obtener: (id: number) =>
    api.get<ApiResponse<Usuario>>(`/api/usuarios/${id}`),

  crear: (data: { nombre: string; email: string; password: string; rol: Rol }) =>
    api.post<ApiResponse<Usuario>>('/api/usuarios', data),

  actualizar: (id: number, data: { nombre?: string; email?: string; rol?: Rol; activo?: boolean }) =>
    api.put<ApiResponse<Usuario>>(`/api/usuarios/${id}`, data),

  cambiarPassword: (id: number, password: string) =>
    api.patch<ApiResponse<{ message: string }>>(`/api/usuarios/${id}/password`, { password }),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/usuarios/${id}`),
};

// ─── CONDUCTORES ─────────────────────────────────────────────────────────────
export const conductoresApi = {
  listar: (params?: { activo?: boolean; search?: string }) =>
    api.get<ApiResponse<import('@/types').Conductor[]>>('/api/conductores', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<import('@/types').Conductor>>(`/api/conductores/${id}`),

  crear: (data: Omit<import('@/types').Conductor, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<import('@/types').Conductor>>('/api/conductores', data),

  actualizar: (id: number, data: Partial<import('@/types').Conductor>) =>
    api.put<ApiResponse<import('@/types').Conductor>>(`/api/conductores/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/conductores/${id}`),
};

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────
export const vehiculosApi = {
  listar: (params?: { tipo?: string; activo?: boolean; search?: string }) =>
    api.get<ApiResponse<import('@/types').Vehiculo[]>>('/api/vehiculos', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<import('@/types').Vehiculo>>(`/api/vehiculos/${id}`),

  crear: (data: Omit<import('@/types').Vehiculo, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<import('@/types').Vehiculo>>('/api/vehiculos', data),

  actualizar: (id: number, data: Partial<import('@/types').Vehiculo>) =>
    api.put<ApiResponse<import('@/types').Vehiculo>>(`/api/vehiculos/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/vehiculos/${id}`),
};

// ─── LIQUIDACIONES ───────────────────────────────────────────────────────────
export const liquidacionesApi = {
  listar: (params?: { conductorId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<import('@/types').Liquidacion[]>>('/api/liquidaciones', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<import('@/types').Liquidacion>>(`/api/liquidaciones/${id}`),

  crear: (data: {
    conductorId: number; placaTracto: string; placaCarreta?: string;
    montoEntregado: number; reciboAnticipo?: string; fecha: string;
    guiaReferencia?: string; observaciones?: string; toldo?: number;
    detalles: import('@/types').LiquidacionDetalle[];
  }) => api.post<ApiResponse<import('@/types').Liquidacion>>('/api/liquidaciones', data),

  actualizar: (id: number, data: Partial<import('@/types').Liquidacion>) =>
    api.put<ApiResponse<import('@/types').Liquidacion>>(`/api/liquidaciones/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/liquidaciones/${id}`),
};

// ─── COMBUSTIBLE ─────────────────────────────────────────────────────────────
export const combustibleApi = {
  listar: (params?: { vehiculoId?: number; conductorId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<import('@/types').Combustible[]>>('/api/combustible', { params }),

  resumen: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<{
      porVehiculo: Array<{ vehiculoId: number; placa: string; totalGalones: number; totalMonto: number; registros: number }>;
      totalMes: number;
      totalGalones: number;
    }>>('/api/combustible/resumen', { params }),

  crear: (data: {
    vehiculoId: number; conductorId?: number; fecha: string;
    galones: number; monto: number; kilometraje?: number; grifo?: string; observaciones?: string;
  }) => api.post<ApiResponse<import('@/types').Combustible>>('/api/combustible', data),

  actualizar: (id: number, data: Partial<import('@/types').Combustible>) =>
    api.put<ApiResponse<import('@/types').Combustible>>(`/api/combustible/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/combustible/${id}`),
};

// ─── BACKUPS ─────────────────────────────────────────────────────────────────
export const backupApi = {
  exportarExcel: (modulo: string) =>
    api.get(`/api/backup/excel/${modulo}`, { responseType: 'blob' }),

  exportarJson: () =>
    api.get('/api/backup/json', { responseType: 'blob' }),

  restaurarJson: (data: FormData) =>
    api.post('/api/backup/restaurar', data, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
export const configuracionApi = {
  inicializar: () =>
    api.post<ApiResponse<{ message: string }>>('/api/configuracion/inicializar', {}),

  // Parámetros
  getParametros: () =>
    api.get<ApiResponse<Record<string, import('@/types').ConfigParam[]>>>('/api/configuracion/parametros'),

  getParametro: (clave: string) =>
    api.get<ApiResponse<{ clave: string; valor: string }>>(`/api/configuracion/parametros/${clave}`),

  updateParametro: (clave: string, valor: string) =>
    api.put<ApiResponse<import('@/types').ConfigParam>>(`/api/configuracion/parametros/${clave}`, { valor }),

  updateParametrosBulk: (params: Record<string, string>) =>
    api.put<ApiResponse<{ message: string; cantidad: number }>>('/api/configuracion/parametros', params),

  // Series
  getSeries: () =>
    api.get<ApiResponse<import('@/types').SerieFacturacion[]>>('/api/configuracion/series'),

  getSeriesActivas: () =>
    api.get<ApiResponse<import('@/types').SerieFacturacion[]>>('/api/configuracion/series/activas'),

  createSerie: (data: { serie: string; tipoDocumento?: string; correlativoInicial?: number; descripcion?: string }) =>
    api.post<ApiResponse<import('@/types').SerieFacturacion>>('/api/configuracion/series', data),

  updateSerie: (id: number, data: { tipoDocumento?: string; correlativoActual?: number; activo?: boolean; descripcion?: string }) =>
    api.put<ApiResponse<import('@/types').SerieFacturacion>>(`/api/configuracion/series/${id}`, data),

  deleteSerie: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/series/${id}`),

  // Categorías gasto
  getCategoriasGasto: () =>
    api.get<ApiResponse<import('@/types').CategoriaGasto[]>>('/api/configuracion/categorias-gasto'),

  createCategoriaGasto: (data: { codigo: string; nombre: string; descripcion?: string }) =>
    api.post<ApiResponse<import('@/types').CategoriaGasto>>('/api/configuracion/categorias-gasto', data),

  updateCategoriaGasto: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean }) =>
    api.put<ApiResponse<import('@/types').CategoriaGasto>>(`/api/configuracion/categorias-gasto/${id}`, data),

  deleteCategoriaGasto: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/categorias-gasto/${id}`),

  // Alertas
  getAlertas: () =>
    api.get<ApiResponse<import('@/types').ConfigAlerta[]>>('/api/configuracion/alertas'),

  updateAlerta: (id: number, data: { diasAnticipacion?: number; activo?: boolean; color?: string; nivel?: string }) =>
    api.put<ApiResponse<import('@/types').ConfigAlerta>>(`/api/configuracion/alertas/${id}`, data),

  updateAlertasBulk: (alertas: Array<{ id: number; diasAnticipacion: number; activo: boolean; color: string; nivel: string }>) =>
    api.put<ApiResponse<{ message: string }>>('/api/configuracion/alertas/bulk', { alertas }),

  // Tablas maestras
  getTiposTabla: () =>
    api.get<ApiResponse<string[]>>('/api/configuracion/tablas'),

  getTablaMaestra: (tipo: string) =>
    api.get<ApiResponse<import('@/types').TablaMaestra[]>>(`/api/configuracion/tablas/${tipo}`),

  createTablaMaestra: (data: { tipo: string; codigo: string; nombre: string; descripcion?: string; extra?: string; orden?: number }) =>
    api.post<ApiResponse<import('@/types').TablaMaestra>>('/api/configuracion/tablas', data),

  updateTablaMaestra: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean; orden?: number }) =>
    api.put<ApiResponse<import('@/types').TablaMaestra>>(`/api/configuracion/tablas/${id}`, data),

  deleteTablaMaestra: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/tablas/${id}`),

  // Tipos vehículo
  getTiposVehiculo: () =>
    api.get<ApiResponse<import('@/types').TipoVehiculoConfig[]>>('/api/configuracion/tipos-vehiculo'),

  createTipoVehiculo: (data: { codigo: string; nombre: string; descripcion?: string }) =>
    api.post<ApiResponse<import('@/types').TipoVehiculoConfig>>('/api/configuracion/tipos-vehiculo', data),

  updateTipoVehiculo: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean }) =>
    api.put<ApiResponse<import('@/types').TipoVehiculoConfig>>(`/api/configuracion/tipos-vehiculo/${id}`, data),

  deleteTipoVehiculo: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/tipos-vehiculo/${id}`),
};

// ─── CUENTAS / MONEDAS / TIPOS DE PAGO ───────────────────────────────────────
export const cuentasApi = {
  // Init
  inicializar: () =>
    api.post<ApiResponse<{ message: string }>>('/api/cuentas/inicializar', {}),

  // Monedas
  getMonedas: () =>
    api.get<ApiResponse<import('@/types').Moneda[]>>('/api/cuentas/monedas'),
  getMonedasActivas: () =>
    api.get<ApiResponse<import('@/types').Moneda[]>>('/api/cuentas/monedas/activas'),
  getMonedaDefault: () =>
    api.get<ApiResponse<import('@/types').Moneda | null>>('/api/cuentas/monedas/default'),
  createMoneda: (data: { codigo: string; nombre: string; simbolo: string; esPorDefecto?: boolean }) =>
    api.post<ApiResponse<import('@/types').Moneda>>('/api/cuentas/monedas', data),
  updateMoneda: (id: number, data: { nombre?: string; simbolo?: string; activo?: boolean; esPorDefecto?: boolean }) =>
    api.put<ApiResponse<import('@/types').Moneda>>(`/api/cuentas/monedas/${id}`, data),
  deleteMoneda: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/cuentas/monedas/${id}`),

  // Tipos de pago
  getTiposPago: () =>
    api.get<ApiResponse<import('@/types').TipoPago[]>>('/api/cuentas/tipos-pago'),
  getTiposPagoActivos: () =>
    api.get<ApiResponse<import('@/types').TipoPago[]>>('/api/cuentas/tipos-pago/activos'),
  createTipoPago: (data: { codigo: string; nombre: string; descripcion?: string; orden?: number }) =>
    api.post<ApiResponse<import('@/types').TipoPago>>('/api/cuentas/tipos-pago', data),
  updateTipoPago: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean; orden?: number }) =>
    api.put<ApiResponse<import('@/types').TipoPago>>(`/api/cuentas/tipos-pago/${id}`, data),
  deleteTipoPago: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/cuentas/tipos-pago/${id}`),

  // Cuentas
  getCuentas: (soloActivas?: boolean) =>
    api.get<ApiResponse<import('@/types').CuentaDinero[]>>('/api/cuentas/cuentas', { params: soloActivas ? { activo: true } : {} }),
  getCuenta: (id: number) =>
    api.get<ApiResponse<import('@/types').CuentaDinero>>(`/api/cuentas/cuentas/${id}`),
  createCuenta: (data: {
    nombre: string; tipoCuenta: string; monedaId: number;
    saldoInicial?: number; descripcion?: string; banco?: string; numeroCuenta?: string;
  }) => api.post<ApiResponse<import('@/types').CuentaDinero>>('/api/cuentas/cuentas', data),
  updateCuenta: (id: number, data: Partial<import('@/types').CuentaDinero>) =>
    api.put<ApiResponse<import('@/types').CuentaDinero>>(`/api/cuentas/cuentas/${id}`, data),
  deleteCuenta: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/cuentas/cuentas/${id}`),

  // Movimientos
  getMovimientos: (params?: { cuentaId?: number; tipo?: string; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<import('@/types').MovimientoCuenta[]>>('/api/cuentas/movimientos', { params }),
  registrarMovimiento: (data: {
    cuentaId: number; tipo: 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA';
    monto: number; monedaId: number; tipoPagoId?: number;
    concepto: string; referencia?: string; cuentaDestinoId?: number; fecha?: string;
  }) => api.post<ApiResponse<import('@/types').MovimientoCuenta>>('/api/cuentas/movimientos', data),

  // Resumen
  getResumen: () =>
    api.get<ApiResponse<import('@/types').ResumenFinanciero>>('/api/cuentas/resumen'),
};
