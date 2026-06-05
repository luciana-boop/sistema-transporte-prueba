// FILE: src/services/api.ts
// CAMBIOS:
//   - liquidacionesApi: agrega pedidosDisponibles, pedidoIds en crear/actualizar
//   - configuracionApi: agrega inicializar, getCategoriasGasto, createCategoriaGasto,
//     updateCategoriaGasto, deleteCategoriaGasto, updateAlertasBulk, createTipoVehiculo,
//     updateTipoVehiculo, deleteTipoVehiculo, getUnidadesMedida, getCodigosFactura
//   - facturacionApi.crear incluye fechaEmision y lineas[] (sin cambios)

import axios from 'axios';
import type {
  ApiResponse, Usuario, Cliente, Pedido, Factura, Pago, Caja,
  Gasto, MetodoPago, Rol, CuentaPorCobrar, Conductor, Vehiculo,
  Liquidacion, LiquidacionDetalle, Combustible, ConfigParam,
  SerieFacturacion, CategoriaGasto, ConfigAlerta, TablaMaestra,
  TipoVehiculoConfig, Moneda, TipoPago, CuentaDinero, MovimientoCuenta,
  ResumenFinanciero, TipoGasto, EstadoFactura, FacturaDetalle, PedidoResumen,
  MovimientosCajaResponse, MovimientosGlobalResponse,
} from '@/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  timeout: 30000,
});

// ─── REQUEST INTERCEPTOR ─────────────────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem('auth-storage');
      if (raw) {
        const parsed = JSON.parse(raw);
        const token = parsed?.state?.token;
        if (token) config.headers.Authorization = `Bearer ${token}`;
      }
    } catch { /* ignore */ }
  }
  return config;
});

// ─── RESPONSE INTERCEPTOR ────────────────────────────────────────────────────
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default api;

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ token: string; usuario: Usuario }>>('/api/auth/login', { email, password }),
  me: () =>
    api.get<ApiResponse<Usuario>>('/api/auth/me'),
};

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
export const clientesApi = {
  listar: (params?: { activo?: boolean; search?: string }) =>
    api.get<ApiResponse<Cliente[]>>('/api/clientes', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Cliente>>(`/api/clientes/${id}`),

  estadisticas: (id: number) =>
    api.get<ApiResponse<import('@/types').ClienteEstadisticas>>(`/api/clientes/${id}/estadisticas`),

  crear: (data: {
    razonSocial: string; ruc: string; direccion: string;
    telefono?: string; email?: string; condicionPago?: string;
  }) => api.post<ApiResponse<Cliente>>('/api/clientes', data),

  actualizar: (id: number, data: Partial<Cliente>) =>
    api.put<ApiResponse<Cliente>>(`/api/clientes/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/clientes/${id}`),
};

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
export const pedidosApi = {
  listar: (params?: { estado?: string; clienteId?: number; search?: string }) =>
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

  // CAMBIOS: agrega fechaEmision (obligatorio) y lineas (opcional)
  // fechaVencimiento ya NO se envía (se calcula en el backend)
  crear: (data: {
    clienteId: number;
    pedidoId?: number;
    serie?: string;
    subtotal: number;
    porcentajeIgv?: number;
    detraccion?: number;
    porcentajeDetraccion?: number;
    tipoCredito?: string;
    diasCredito?: number;
    guiaReferencia?: string;
    detalle?: string;
    // NUEVO: fecha de emisión explícita
    fechaEmision: string;
    observaciones?: string;
    // NUEVO: líneas de detalle
    lineas?: Array<{
      orden?: number;
      cantidad: number;
      unidadMedida?: string;
      codigo: string;
      descripcion: string;
      valorUnitario: number;
      importe: number;
    }>;
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

  registrarMovimiento: (id: number, data: {
    tipo: 'INGRESO' | 'EGRESO'; monto: number; concepto: string;
    fecha?: string; referencia?: string;
  }) => api.post<ApiResponse<Caja>>(`/api/caja/${id}/movimiento`, data),

  /** NUEVO: movimientos de una caja con saldo acumulado */
  getMovimientos: (id: number, params?: { desde?: string; hasta?: string; tipo?: string }) =>
    api.get<ApiResponse<MovimientosCajaResponse>>(`/api/caja/${id}/movimientos`, { params }),

  /** NUEVO: movimientos globales con filtros */
  getMovimientosGlobal: (params?: { cajaId?: number; desde?: string; hasta?: string; tipo?: string }) =>
    api.get<ApiResponse<MovimientosGlobalResponse>>('/api/caja/movimientos', { params }),

  /** MEJORA 2: Editar movimiento manual (concepto, monto, fecha, referencia) */
  editarMovimiento: (movimientoId: number, data: {
    monto?: number; concepto?: string; fecha?: string; referencia?: string;
  }) => api.put<ApiResponse<any>>(`/api/caja/movimientos/${movimientoId}`, data),

  /** MEJORA 2: Anulación lógica — el movimiento deja de afectar saldos */
  anularMovimiento: (movimientoId: number) =>
    api.patch<ApiResponse<any>>(`/api/caja/movimientos/${movimientoId}/anular`),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/caja/${id}`),
};

// ─── GASTOS ───────────────────────────────────────────────────────────────────
export const gastosApi = {
  listar: (params?: { pedidoId?: number; tipoGasto?: TipoGasto; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Gasto[]>>('/api/gastos', { params }),

  crear: (data: {
    pedidoId?: number; tipoGasto: TipoGasto; monto: number;
    descripcion: string; comprobante?: string; fecha?: string;
  }) => api.post<ApiResponse<Gasto>>('/api/gastos', data),

  actualizar: (id: number, data: Partial<Gasto>) =>
    api.put<ApiResponse<Gasto>>(`/api/gastos/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/gastos/${id}`),
};

// ─── REPORTES ─────────────────────────────────────────────────────────────────
export const reportesApi = {
  dashboard: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<import('@/types').DashboardData>>('/api/reportes/dashboard', { params }),

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

  cambiarPassword: (id: number, data: { password: string }) =>
    api.patch<ApiResponse<null>>(`/api/usuarios/${id}/password`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/usuarios/${id}`),
};

// ─── CONDUCTORES ─────────────────────────────────────────────────────────────
export const conductoresApi = {
  listar: (params?: { activo?: boolean }) =>
    api.get<ApiResponse<Conductor[]>>('/api/conductores', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Conductor>>(`/api/conductores/${id}`),

  crear: (data: Omit<Conductor, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<Conductor>>('/api/conductores', data),

  actualizar: (id: number, data: Partial<Conductor>) =>
    api.put<ApiResponse<Conductor>>(`/api/conductores/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/conductores/${id}`),
};

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────
export const vehiculosApi = {
  listar: (params?: { activo?: boolean; tipo?: string }) =>
    api.get<ApiResponse<Vehiculo[]>>('/api/vehiculos', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Vehiculo>>(`/api/vehiculos/${id}`),

  crear: (data: Omit<Vehiculo, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<Vehiculo>>('/api/vehiculos', data),

  actualizar: (id: number, data: Partial<Vehiculo>) =>
    api.put<ApiResponse<Vehiculo>>(`/api/vehiculos/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/vehiculos/${id}`),
};

// ─── LIQUIDACIONES ───────────────────────────────────────────────────────────
export const liquidacionesApi = {
  listar: (params?: { conductorId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Liquidacion[]>>('/api/liquidaciones', { params }),

  obtener: (id: number) =>
    api.get<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}`),

  // NUEVO: pedidos ACTIVOS sin liquidación asignada
  pedidosDisponibles: () =>
    api.get<ApiResponse<PedidoResumen[]>>('/api/liquidaciones/pedidos-disponibles'),

  crear: (data: {
    conductorId: number;
    placaTracto: string;
    placaCarreta?: string;
    montoEntregado: number;
    reciboAnticipo?: string;
    fecha: string;
    guiaReferencia?: string;
    observaciones?: string;
    detalles: Array<{ categoria: LiquidacionDetalle['categoria']; descripcion: string; monto: number }>;
    // NUEVO
    pedidoIds?: number[];
  }) => api.post<ApiResponse<Liquidacion>>('/api/liquidaciones', data),

  actualizar: (id: number, data: Partial<Liquidacion> & { pedidoIds?: number[] }) =>
    api.put<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}`, data),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/liquidaciones/${id}`),
};

// ─── COMBUSTIBLE ─────────────────────────────────────────────────────────────
export const combustibleApi = {
  listar: (params?: { vehiculoId?: number; conductorId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Combustible[]>>('/api/combustible', { params }),

  crear: (data: {
    vehiculoId: number; conductorId?: number; fecha: string;
    galones: number; monto: number; kilometraje?: number; grifo?: string; observaciones?: string;
  }) => api.post<ApiResponse<Combustible>>('/api/combustible', data),

  actualizar: (id: number, data: Partial<Combustible>) =>
    api.put<ApiResponse<Combustible>>(`/api/combustible/${id}`, data),

  resumen: () =>
    api.get<ApiResponse<any>>('/api/combustible/resumen'),

  eliminar: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/combustible/${id}`),
};

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
export const configuracionApi = {
  getParametros: () =>
    api.get<ApiResponse<Record<string, ConfigParam[]>>>('/api/configuracion/parametros'),

  getParametrosPorCategoria: (categoria: string) =>
    api.get<ApiResponse<ConfigParam[]>>(`/api/configuracion/parametros/${categoria}`),

  updateParametro: (clave: string, valor: string) =>
    api.patch<ApiResponse<ConfigParam>>(`/api/configuracion/parametros/${clave}`, { valor }),

  getSeries: () =>
    api.get<ApiResponse<SerieFacturacion[]>>('/api/configuracion/series'),

  createSerie: (data: { serie: string; tipoDocumento?: string; descripcion?: string }) =>
    api.post<ApiResponse<SerieFacturacion>>('/api/configuracion/series', data),

  updateSerie: (id: number, data: { correlativoActual?: number; activo?: boolean; descripcion?: string }) =>
    api.put<ApiResponse<SerieFacturacion>>(`/api/configuracion/series/${id}`, data),

  deleteSerie: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/series/${id}`),

  inicializar: () =>
    api.post<ApiResponse<{ message: string }>>('/api/configuracion/inicializar'),

  getCategoriasGasto: () =>
    api.get<ApiResponse<CategoriaGasto[]>>('/api/configuracion/categorias-gasto'),

  createCategoriaGasto: (data: { codigo: string; nombre: string; descripcion?: string }) =>
    api.post<ApiResponse<CategoriaGasto>>('/api/configuracion/categorias-gasto', data),

  updateCategoriaGasto: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean }) =>
    api.put<ApiResponse<CategoriaGasto>>(`/api/configuracion/categorias-gasto/${id}`, data),

  deleteCategoriaGasto: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/categorias-gasto/${id}`),

  // alias legacy
  getCategorias: () =>
    api.get<ApiResponse<CategoriaGasto[]>>('/api/configuracion/categorias-gasto'),

  getAlertas: () =>
    api.get<ApiResponse<ConfigAlerta[]>>('/api/configuracion/alertas'),

  updateAlertasBulk: (alertas: Array<{ id: number; diasAnticipacion: number; activo: boolean; color: string; nivel: string }>) =>
    api.put<ApiResponse<{ message: string; cantidad: number }>>('/api/configuracion/alertas/bulk', { alertas }),

  updateAlerta: (id: number, data: Partial<ConfigAlerta>) =>
    api.put<ApiResponse<ConfigAlerta>>(`/api/configuracion/alertas/${id}`, data),

  getTablaMaestra: (tipo: string) =>
    api.get<ApiResponse<TablaMaestra[]>>(`/api/configuracion/tablas/${tipo}`),

  createTablaMaestra: (data: { tipo: string; codigo: string; nombre: string; descripcion?: string; extra?: string; orden?: number }) =>
    api.post<ApiResponse<TablaMaestra>>('/api/configuracion/tablas', data),

  updateTablaMaestra: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean; orden?: number }) =>
    api.put<ApiResponse<TablaMaestra>>(`/api/configuracion/tablas/${id}`, data),

  deleteTablaMaestra: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/tablas/${id}`),

  createTipoVehiculo: (data: { codigo: string; nombre: string; descripcion?: string }) =>
    api.post<ApiResponse<TipoVehiculoConfig>>('/api/configuracion/tipos-vehiculo', data),

  updateTipoVehiculo: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean }) =>
    api.put<ApiResponse<TipoVehiculoConfig>>(`/api/configuracion/tipos-vehiculo/${id}`, data),

  deleteTipoVehiculo: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/configuracion/tipos-vehiculo/${id}`),

  getTiposVehiculo: () =>
    api.get<ApiResponse<TipoVehiculoConfig[]>>('/api/configuracion/tipos-vehiculo'),

  // Endpoints específicos para Facturación (solo registros activos)
  getUnidadesMedida: () =>
    api.get<ApiResponse<TablaMaestra[]>>('/api/configuracion/facturacion/unidades-medida'),

  getCodigosFactura: () =>
    api.get<ApiResponse<TablaMaestra[]>>('/api/configuracion/facturacion/codigos-factura'),
};

// ─── CUENTAS V2 ───────────────────────────────────────────────────────────────
export const cuentasApi = {
  // ── Resumen ──────────────────────────────────────────────────────────────
  getResumen: () =>
    api.get<ApiResponse<ResumenFinanciero>>('/api/cuentas/resumen'),

  // ── Monedas ──────────────────────────────────────────────────────────────
  getMonedas: () =>
    api.get<ApiResponse<Moneda[]>>('/api/cuentas/monedas'),

  getMonedasActivas: () =>
    api.get<ApiResponse<Moneda[]>>('/api/cuentas/monedas/activas'),

  getMonedaDefault: () =>
    api.get<ApiResponse<Moneda>>('/api/cuentas/moneda-default'),

  createMoneda: (data: { codigo: string; nombre: string; simbolo: string; esPorDefecto?: boolean }) =>
    api.post<ApiResponse<Moneda>>('/api/cuentas/monedas', data),

  updateMoneda: (id: number, data: { nombre?: string; simbolo?: string; esPorDefecto?: boolean; activo?: boolean }) =>
    api.put<ApiResponse<Moneda>>(`/api/cuentas/monedas/${id}`, data),

  deleteMoneda: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/cuentas/monedas/${id}`),

  // ── Tipos de pago ─────────────────────────────────────────────────────────
  getTiposPago: () =>
    api.get<ApiResponse<TipoPago[]>>('/api/cuentas/tipos-pago'),

  getTiposPagoActivos: () =>
    api.get<ApiResponse<TipoPago[]>>('/api/cuentas/tipos-pago/activos'),

  createTipoPago: (data: { codigo: string; nombre: string; descripcion?: string; orden?: number }) =>
    api.post<ApiResponse<TipoPago>>('/api/cuentas/tipos-pago', data),

  updateTipoPago: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean; orden?: number }) =>
    api.put<ApiResponse<TipoPago>>(`/api/cuentas/tipos-pago/${id}`, data),

  deleteTipoPago: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/cuentas/tipos-pago/${id}`),

  // ── Cuentas (CuentaDinero) ────────────────────────────────────────────────
  // CORRECCIÓN Error 1: router montado en /api/cuentas → rutas en /cuentas/cuentas/*
  // CORRECCIÓN Error 1: nombres corregidos (createCuenta, updateCuenta) para coincidir con CuentasTabs.tsx
  getCuentas: (params?: { activo?: boolean }) =>
    api.get<ApiResponse<CuentaDinero[]>>('/api/cuentas/cuentas', { params }),

  createCuenta: (data: {
    nombre: string; tipoCuenta: string; monedaId: number;
    saldoInicial?: number; descripcion?: string; banco?: string; numeroCuenta?: string;
  }) => api.post<ApiResponse<CuentaDinero>>('/api/cuentas/cuentas', data),

  updateCuenta: (id: number, data: Partial<CuentaDinero>) =>
    api.put<ApiResponse<CuentaDinero>>(`/api/cuentas/cuentas/${id}`, data),

  deleteCuenta: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/cuentas/cuentas/${id}`),

  // ── Movimientos de CuentaDinero ───────────────────────────────────────────
  getMovimientos: (params?: { cuentaId?: number; tipo?: string; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<MovimientoCuenta[]>>('/api/cuentas/movimientos', { params }),

  registrarMovimiento: (data: {
    cuentaId: number; tipo: string; monto: number; monedaId: number;
    tipoPagoId?: number; concepto: string; referencia?: string;
    cuentaDestinoId?: number; fecha?: string;
  }) => api.post<ApiResponse<MovimientoCuenta>>('/api/cuentas/movimientos', data),

  // ── Inicializar defaults ──────────────────────────────────────────────────
  inicializar: () =>
    api.post<ApiResponse<{ message: string }>>('/api/cuentas/inicializar'),
};
// ─── PERMISOS ─────────────────────────────────────────────────────────────────
export const permisosApi = {
  getPermisos: (usuarioId: number) =>
    api.get<ApiResponse<{ modulos: Record<string, boolean>; acciones: Record<string, boolean> }>>(`/api/permisos/${usuarioId}`),

  updatePermisos: (usuarioId: number, data: {
    modulos?: Record<string, boolean>;
    acciones?: Record<string, boolean>;
  }) => api.put<ApiResponse<null>>(`/api/permisos/${usuarioId}`, data),
};

// ─── BACKUPS ──────────────────────────────────────────────────────────────────
export const backupsApi = {
  listar: () =>
    api.get<ApiResponse<Array<{ nombre: string; fecha: string; tamaño: number }>>>('/api/backup/listar'),

  crear: () =>
    api.post<ApiResponse<{ nombre: string; mensaje: string }>>('/api/backup/crear'),

  restaurar: (nombre: string) =>
    api.post<ApiResponse<null>>('/api/backup/restaurar', { nombre }),

  eliminar: (nombre: string) =>
    api.delete<ApiResponse<null>>(`/api/backup/${nombre}`),
};
