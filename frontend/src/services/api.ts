// FILE: src/services/api.ts
// FIX PROBLEMA 2: cobranzaApi.registrarPago acepta cuentaId obligatorio.
// MEJORA: gastosApi.obtener agregado para vistas de detalle.
// v2 P1: facturacionApi añade pdfInfo() para verificar disponibilidad del PDF
// (la descarga/visualización se hace con la instancia `api` + responseType: 'blob'
// porque el endpoint /pdf exige el header Authorization, que un <a href> no envía).
// v2 P3: liquidacionesApi añade cajasAbiertas, pagar, reintegro, devolucion, historialFinanciero.
// v3: liquidacionesApi añade rendir(); crear() hace detalles opcionales (flujo 2 etapas).

import axios from 'axios';
import type {
  ApiResponse, Usuario, Cliente, Pedido, Factura, Pago, Caja,
  Gasto, MetodoPago, Rol, CuentaPorCobrar, Conductor, Vehiculo,
  Liquidacion, LiquidacionDetalle, Combustible, CombustibleDetalle, ConfigParam,
  SerieFacturacion, CategoriaGasto, ConfigAlerta, TablaMaestra,
  TipoVehiculoConfig, Moneda, TipoPago, CuentaDinero, MovimientoCuenta, MovimientoCuentaDetalle,
  ResumenFinanciero, TipoGasto, EstadoFactura, FacturaDetalle, PedidoResumen,
  PagoDetalle, CuentaPorCobrarDetalle,
  MovimientosCajaResponse, MovimientosGlobalResponse,
} from '@/types';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
  timeout: 30000,
});

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
  me: () => api.get<ApiResponse<Usuario>>('/api/auth/me'),
};

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
export const clientesApi = {
  listar: (params?: { activo?: boolean; search?: string }) =>
    api.get<ApiResponse<Cliente[]>>('/api/clientes', { params }),
  obtener: (id: number) => api.get<ApiResponse<Cliente>>(`/api/clientes/${id}`),
  estadisticas: (id: number) =>
    api.get<ApiResponse<import('@/types').ClienteEstadisticas>>(`/api/clientes/${id}/estadisticas`),
  crear: (data: {
    razonSocial: string; ruc: string; direccion: string;
    telefono?: string; email?: string; condicionPago?: string;
  }) => api.post<ApiResponse<Cliente>>('/api/clientes', data),
  actualizar: (id: number, data: Partial<Cliente>) =>
    api.put<ApiResponse<Cliente>>(`/api/clientes/${id}`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/clientes/${id}`),
};

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
export const pedidosApi = {
  listar: (params?: { estado?: string; clienteId?: number; search?: string; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Pedido[]>>('/api/pedidos', { params }),
  disponibles: (clienteId: number) =>
    api.get<ApiResponse<Pedido[]>>('/api/pedidos/disponibles', { params: { clienteId } }),
  obtener: (id: number) => api.get<ApiResponse<Pedido>>(`/api/pedidos/${id}`),
  rentabilidad: (id: number) =>
    api.get<ApiResponse<{
      pedidoId: number;
      conductor: { id: number; nombre: string } | null;
      ganancia: number;
      totalGastosLiquidacion: number;
      totalCombustible: number;
      totalGastos: number;
      utilidadNeta: number;
      margenPorcentaje: number;
      cantidadPedidosLiquidacion: number;
    }>>(`/api/pedidos/${id}/rentabilidad`),
  crear: (data: {
    clienteId: number; origen: string; destino: string;
    tipoCarga: string; tarifa: number; observaciones?: string;
  }) => api.post<ApiResponse<Pedido>>('/api/pedidos', data),
  actualizar: (id: number, data: Partial<Pedido>) =>
    api.put<ApiResponse<Pedido>>(`/api/pedidos/${id}`, data),
  anular: (id: number) => api.patch<ApiResponse<Pedido>>(`/api/pedidos/${id}/anular`, {}),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/pedidos/${id}`),
};

// ─── FACTURACIÓN ─────────────────────────────────────────────────────────────
export const facturacionApi = {
  listar: (params?: { estado?: string; clienteId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Factura[]>>('/api/facturacion', { params }),
  obtener: (id: number) => api.get<ApiResponse<Factura>>(`/api/facturacion/${id}`),
  series: () => api.get<ApiResponse<string[]>>('/api/facturacion/series'),
  proximoCorrelativo: (serie: string) =>
    api.get<ApiResponse<{ serie: string; correlativo: number; numeroFactura: string }>>(`/api/facturacion/correlativo/${serie}`),

  // P1: metadata del PDF (sin streaming) — para saber si existe antes de abrirlo
  pdfInfo: (id: number) =>
    api.get<ApiResponse<{ tienePdf: boolean; pdfPath: string | null; esUrl: boolean; archivoExiste: boolean }>>(`/api/facturacion/${id}/pdf-info`),

  crear: (data: {
    clienteId: number; pedidoId?: number; serie?: string; subtotal: number;
    porcentajeIgv?: number; detraccion?: number; porcentajeDetraccion?: number;
    tipoCredito?: string; diasCredito?: number; guiaReferencia?: string; peso?: number; detalle?: string;
    fechaEmision: string; observaciones?: string;
    lineas?: Array<{
      orden?: number; cantidad: number; unidadMedida?: string; codigo: string;
      descripcion: string; valorUnitario: number; importe: number;
    }>;
  }) => api.post<ApiResponse<Factura>>('/api/facturacion', data),
  crearDesdeXml: (data: Record<string, unknown>) =>
    api.post<ApiResponse<Factura>>('/api/facturacion/desde-xml', data),
  importacionMasivaXml: (facturas: Record<string, unknown>[]) =>
    api.post<ApiResponse<{ creadas: number; duplicadas: number; errores: string[] }>>('/api/facturacion/importacion-masiva-xml', { facturas }),
  actualizar: (id: number, data: { observaciones?: string; fechaVencimiento?: string; detalle?: string; estadoSunat?: string }) =>
    api.put<ApiResponse<Factura>>(`/api/facturacion/${id}`, data),
  anular: (id: number) => api.patch<ApiResponse<Factura>>(`/api/facturacion/${id}/anular`, {}),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/facturacion/${id}`),
};

// ─── COBRANZA ────────────────────────────────────────────────────────────────
export const cobranzaApi = {
  listar: (params?: { clienteId?: number; metodoPago?: MetodoPago; estado?: EstadoFactura; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Pago[]>>('/api/cobranza', { params }),
  obtener: (id: number) => api.get<ApiResponse<PagoDetalle>>(`/api/cobranza/${id}`),
  cuentasPorCobrar: (params?: { clienteId?: number; estado?: EstadoFactura; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<CuentaPorCobrar[]>>('/api/cobranza/cuentas-por-cobrar', { params }),
  detalleCuentaPorCobrar: (facturaId: number) =>
    api.get<ApiResponse<CuentaPorCobrarDetalle>>(`/api/cobranza/cuentas-por-cobrar/${facturaId}/detalle`),
  facturasPorCliente: (clienteId: number) =>
    api.get<ApiResponse<Array<{
      id: number; numeroFactura: string; total: number; pagado: number;
      saldoPendiente: number; estado: string; fechaVencimiento: string; vencida: boolean;
    }>>>(`/api/cobranza/facturas-cliente/${clienteId}`),
  registrarPago: (data: {
    facturaId: number; monto: number; metodoPago: MetodoPago;
    referencia?: string; observaciones?: string; fechaPago?: string;
    cuentaId: number; monedaId?: number; tipoPagoId?: number;
  }) => api.post<ApiResponse<Pago>>('/api/cobranza', data),
  actualizar: (id: number, data: {
    metodoPago?: MetodoPago; referencia?: string; observaciones?: string; fechaPago?: string;
  }) => api.put<ApiResponse<Pago>>(`/api/cobranza/${id}`, data),
  anular: (id: number, data?: { motivo?: string }) =>
    api.patch<ApiResponse<{ message: string }>>(`/api/cobranza/${id}/anular`, data ?? {}),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/cobranza/${id}`),
};

// ─── CAJA ────────────────────────────────────────────────────────────────────
export const cajaApi = {
  listar: (params?: { estado?: string; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Caja[]>>('/api/caja', { params }),
  obtener: (id: number) => api.get<ApiResponse<Caja>>(`/api/caja/${id}`),
  actual: () => api.get<ApiResponse<Caja | null>>('/api/caja/actual'),
  abrir: (data: { saldoApertura: number; cuentaOrigenId: number; nombre?: string; observaciones?: string }) =>
    api.post<ApiResponse<Caja>>('/api/caja/abrir', data),
  cerrar: (id: number, data: { saldoCierre: number; observaciones?: string; cuentaDestinoId?: number }) =>
    api.patch<ApiResponse<Caja>>(`/api/caja/${id}/cerrar`, data),
  registrarMovimiento: (id: number, data: {
    tipo: 'INGRESO' | 'EGRESO'; monto: number; concepto: string;
    fecha?: string; referencia?: string;
  }) => api.post<ApiResponse<Caja>>(`/api/caja/${id}/movimiento`, data),
  getMovimientos: (id: number, params?: { desde?: string; hasta?: string; tipo?: string }) =>
    api.get<ApiResponse<MovimientosCajaResponse>>(`/api/caja/${id}/movimientos`, { params }),
  getMovimientosGlobal: (params?: { cajaId?: number; desde?: string; hasta?: string; tipo?: string }) =>
    api.get<ApiResponse<MovimientosGlobalResponse>>('/api/caja/movimientos', { params }),
  editarMovimiento: (movimientoId: number, data: {
    monto?: number; concepto?: string; fecha?: string; referencia?: string;
  }) => api.put<ApiResponse<any>>(`/api/caja/movimientos/${movimientoId}`, data),
  anularMovimiento: (movimientoId: number) =>
    api.patch<ApiResponse<any>>(`/api/caja/movimientos/${movimientoId}/anular`),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/caja/${id}`),
};

// ─── GASTOS ───────────────────────────────────────────────────────────────────
export const gastosApi = {
  listar: (params?: { vehiculoId?: number; tipoGasto?: TipoGasto; desde?: string; hasta?: string; search?: string }) =>
    api.get<ApiResponse<Gasto[]>>('/api/gastos', { params }),
  obtener: (id: number) => api.get<ApiResponse<Gasto>>(`/api/gastos/${id}`),
  crear: (data: {
    vehiculoId?: number; tipoGasto: TipoGasto; monto: number; descripcion: string;
    comprobante?: string; fecha?: string; cuentaId?: number; monedaId?: number; tipoPagoId?: number;
  }) => api.post<ApiResponse<Gasto>>('/api/gastos', data),
  actualizar: (id: number, data: Partial<Gasto>) =>
    api.put<ApiResponse<Gasto>>(`/api/gastos/${id}`, data),
  resumen: () => api.get<ApiResponse<any>>('/api/gastos/resumen'),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/gastos/${id}`),
};

// ─── REPORTES ─────────────────────────────────────────────────────────────────
export const reportesApi = {
  dashboard: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<import('@/types').DashboardData>>('/api/reportes/dashboard', { params }),
  pedidos: (params?: { desde?: string; hasta?: string; clienteId?: number }) =>
    api.get<ApiResponse<{
      pedidos: Pedido[];
      resumenEstados: Array<{ estado: string; cantidad: number; totalTarifas: number }>;
      totales: { cantidad: number; tarifaTotal: number };
    }>>('/api/reportes/pedidos', { params }),
  anual: (params?: { anio?: number }) =>
    api.get<ApiResponse<{
      anio: number;
      promedioUtilidadMensual: number;
      meses: Array<{
        mes: number;
        nombreMes: string;
        pedidos: number;
        facturado: number;
        cobrado: number;
        gastos: number;
        utilidad: number;
        clasificacion: 'BUEN_MES' | 'MES_REGULAR' | 'MAL_MES' | 'SIN_DATOS';
      }>;
      totales: { pedidos: number; facturado: number; cobrado: number; gastos: number; utilidad: number };
    }>>('/api/reportes/anual', { params }),
  conductorDelMes: () => {
    type ConductorRanking = {
      conductorId: number;
      nombre: string;
      viajes: number;
      combustibleTotal: number;
      combustiblePromedio: number;
      scoreFinal: number;
    };
    return api.get<ApiResponse<{
      periodo: { anio: number; mes: number; nombreMes: string };
      ganador: ConductorRanking | null;
      ranking: ConductorRanking[];
    }>>('/api/reportes/conductor-del-mes');
  },
  tablaSemanal: (params?: { desde?: string; hasta?: string }) => {
    type ConductorSemana = {
      conductorId: number;
      nombre: string;
      cantidadPedidos: number;
      ingreso: number;
      costos: number;
      rentabilidad: number;
    };
    return api.get<ApiResponse<{
      periodo: { desde: string; hasta: string };
      conductores: ConductorSemana[];
    }>>('/api/reportes/tabla-semanal', { params });
  },
  detalleConductorSemanal: (conductorId: number, params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<any>>(`/api/reportes/tabla-semanal/${conductorId}/detalle`, { params }),
  facturacion: (params?: { desde?: string; hasta?: string; clienteId?: number }) =>
    api.get<ApiResponse<{
      facturas: Factura[];
      resumenEstados: Array<{ estado: string; cantidad: number; total: number }>;
      resumenPorCliente: Array<{
        clienteId: number;
        razonSocial: string;
        totalFacturas: number;
        emitidas: number;
        pagadas: number;
        parciales: number;
        montoTotal: number;
      }>;
      totales: { cantidad: number; subtotal: number; igv: number; total: number };
    }>>('/api/reportes/facturacion', { params }),
  cobranza: (params?: { desde?: string; hasta?: string; clienteId?: number }) =>
    api.get<ApiResponse<{
      pagos: Pago[];
      resumenPorMetodo: Array<{ metodoPago: MetodoPago; cantidad: number; total: number }>;
      resumenPorCliente: Array<{
        clienteId: number;
        razonSocial: string;
        totalFacturado: number;
        totalCobrado: number;
        saldoPendiente: number;
        porcentajeCobrado: number;
      }>;
      totales: { cantidad: number; totalCobrado: number };
    }>>('/api/reportes/cobranza', { params }),
  caja: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<{ cajas: Caja[]; totalesGlobales: { ingresos: number; egresos: number } }>>('/api/reportes/caja', { params }),
  gastos: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<{
      gastos: Gasto[];
      resumenPorTipo: Array<{ tipoGasto: TipoGasto; cantidad: number; total: number }>;
      resumenPorVehiculo: Array<{
        vehiculoId: number | null;
        placa: string;
        cantidadGastos: number;
        totalGastado: number;
        participacion: number;
      }>;
      totales: { cantidad: number; totalGastos: number };
    }>>('/api/reportes/gastos', { params }),
  rentabilidadCliente: (params?: { desde?: string; hasta?: string; clienteId?: number }) =>
    api.get<ApiResponse<{
      clientes: Array<{
        clienteId: number;
        razonSocial: string;
        cantidadPedidos: number;
        facturacion: number;
        costos: number;
        utilidad: number;
        margen: number;
      }>;
    }>>('/api/reportes/rentabilidad-cliente', { params }),
  rentabilidadClienteDetalle: (clienteId: number, params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<{
      clienteId: number;
      pedidos: Array<{
        id: number;
        fecha: string;
        origen: string;
        destino: string;
        estado: string;
        facturas: Array<{ id: number; numeroFactura: string; total: number; estado: string; fechaEmision: string }>;
        totalFacturado: number;
        costos: { liquidacion: number; combustible: number; total: number };
        liquidacionesDetalle: Array<{ liquidacionId: number; costoAsignado: number; combustibleAsignado: number }>;
        utilidad: number;
      }>;
      totales: { totalFacturado: number; totalCostos: number; totalUtilidad: number };
    }>>(`/api/reportes/rentabilidad-cliente/${clienteId}/detalle`, { params }),
};

// ─── USUARIOS ────────────────────────────────────────────────────────────────
export const usuariosApi = {
  listar: () => api.get<ApiResponse<Usuario[]>>('/api/usuarios'),
  obtener: (id: number) => api.get<ApiResponse<Usuario>>(`/api/usuarios/${id}`),
  crear: (data: { nombre: string; email: string; password: string; rol: Rol }) =>
    api.post<ApiResponse<Usuario>>('/api/usuarios', data),
  actualizar: (id: number, data: { nombre?: string; email?: string; rol?: Rol; activo?: boolean }) =>
    api.put<ApiResponse<Usuario>>(`/api/usuarios/${id}`, data),
  cambiarPassword: (id: number, data: { password: string }) =>
    api.patch<ApiResponse<null>>(`/api/usuarios/${id}/password`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/usuarios/${id}`),
};

// ─── CONDUCTORES ─────────────────────────────────────────────────────────────
export const conductoresApi = {
  listar: (params?: { activo?: boolean; search?: string }) =>
    api.get<ApiResponse<Conductor[]>>('/api/conductores', { params }),
  obtener: (id: number) => api.get<ApiResponse<Conductor>>(`/api/conductores/${id}`),
  crear: (data: Omit<Conductor, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<Conductor>>('/api/conductores', data),
  actualizar: (id: number, data: Partial<Conductor>) =>
    api.put<ApiResponse<Conductor>>(`/api/conductores/${id}`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/conductores/${id}`),
};

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────
export const vehiculosApi = {
  listar: (params?: { activo?: boolean; tipo?: string; search?: string }) =>
    api.get<ApiResponse<Vehiculo[]>>('/api/vehiculos', { params }),
  obtener: (id: number) => api.get<ApiResponse<Vehiculo>>(`/api/vehiculos/${id}`),
  crear: (data: Omit<Vehiculo, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<Vehiculo>>('/api/vehiculos', data),
  actualizar: (id: number, data: Partial<Vehiculo>) =>
    api.put<ApiResponse<Vehiculo>>(`/api/vehiculos/${id}`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/vehiculos/${id}`),
};

// ─── LIQUIDACIONES ───────────────────────────────────────────────────────────
export const liquidacionesApi = {
  listar: (params?: { conductorId?: number; desde?: string; hasta?: string; sinCombustible?: boolean }) =>
    api.get<ApiResponse<Liquidacion[]>>('/api/liquidaciones', { params }),
  obtener: (id: number) => api.get<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}`),
  pedidosDisponibles: () =>
    api.get<ApiResponse<PedidoResumen[]>>('/api/liquidaciones/pedidos-disponibles'),
  cajasAbiertas: () =>
    api.get<ApiResponse<Array<{ id: number; nombre: string | null; saldoActual: number; usuario: { nombre: string } }>>>('/api/liquidaciones/cajas-abiertas'),

  // v4 — Paso 2: pagar (CREADA→PAGADA)
  pagar: (id: number, data: { cajaId: number; montoPagado?: number; fechaPago?: string }) =>
    api.post<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}/pagar`, data),

  // v4 — Paso 3: rendir gastos (PAGADA→RENDIDA)
  rendir: (id: number, data: {
    detalles: Array<{ categoria: LiquidacionDetalle['categoria']; descripcion: string; monto: number }>;
    observaciones?: string;
  }) => api.post<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}/rendir`, data),

  // v4 — Paso 4: cerrar (RENDIDA→CERRADA, registra devolución o reintegro)
  cerrar: (id: number, data: { cajaId: number; fecha?: string }) =>
    api.post<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}/cerrar`, data),

  historialFinanciero: (id: number) =>
    api.get<ApiResponse<{
      liquidacion: { id: number; estado: string; montoEntregado: number; montoPagado: number | null; totalGastos: number; montoRendido: number | null; reintegro: number; devolucion: number; tipoAjuste: string | null; conductor: { nombre: string } };
      movimientos: Array<{ id: number; tipo: string; monto: number; concepto: string; referencia: string; fecha: string; caja: { id: number; nombre: string | null } }>;
    }>>(`/api/liquidaciones/${id}/historial-financiero`),

  crear: (data: {
    conductorId: number; placaTracto: string; placaCarreta?: string;
    montoEntregado: number; reciboAnticipo?: string; fecha: string;
    guiaReferencia?: string; observaciones?: string;
    pedidoIds?: number[];
  }) => api.post<ApiResponse<Liquidacion>>('/api/liquidaciones', data),

  actualizar: (id: number, data: Partial<Liquidacion> & { pedidoIds?: number[] }) =>
    api.put<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/liquidaciones/${id}`),
};

// ─── COMBUSTIBLE ─────────────────────────────────────────────────────────────
export const combustibleApi = {
  listar: (params?: { vehiculoId?: number; conductorId?: number; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<Combustible[]>>('/api/combustible', { params }),
  /** P9: detalle de solo lectura — incluye el movimiento financiero generado */
  obtener: (id: number) => api.get<ApiResponse<CombustibleDetalle>>(`/api/combustible/${id}`),
  crear: (data: {
    vehiculoId: number; conductorId?: number; liquidacionId?: number; fecha: string;
    galones: number; monto: number; kilometraje?: number; grifo?: string; observaciones?: string;
    cuentaId: number; monedaId: number; tipoPagoId?: number;
  }) => api.post<ApiResponse<Combustible>>('/api/combustible', data),
  actualizar: (id: number, data: Partial<Combustible>) =>
    api.put<ApiResponse<Combustible>>(`/api/combustible/${id}`, data),
  resumen: () => api.get<ApiResponse<any>>('/api/combustible/resumen'),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/combustible/${id}`),
};

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
export const configuracionApi = {
  getParametros: () =>
    api.get<ApiResponse<Record<string, ConfigParam[]>>>('/api/configuracion/parametros'),
  getParametrosPorCategoria: (categoria: string) =>
    api.get<ApiResponse<ConfigParam[]>>(`/api/configuracion/parametros/${categoria}`),
  updateParametro: (clave: string, valor: string) =>
    api.put<ApiResponse<ConfigParam>>(`/api/configuracion/parametros/${clave}`, { valor }),
  getSeries: () => api.get<ApiResponse<SerieFacturacion[]>>('/api/configuracion/series'),
  createSerie: (data: { serie: string; tipoDocumento?: string; descripcion?: string; correlativoInicial?: number }) =>
    api.post<ApiResponse<SerieFacturacion>>('/api/configuracion/series', data),
  updateSerie: (id: number, data: { correlativoActual?: number; activo?: boolean; descripcion?: string; tipoDocumento?: string }) =>
    api.put<ApiResponse<SerieFacturacion>>(`/api/configuracion/series/${id}`, data),
  deleteSerie: (id: number) => api.delete<ApiResponse<null>>(`/api/configuracion/series/${id}`),
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
  getCategorias: () =>
    api.get<ApiResponse<CategoriaGasto[]>>('/api/configuracion/categorias-gasto'),
  getAlertas: () => api.get<ApiResponse<ConfigAlerta[]>>('/api/configuracion/alertas'),
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
  getUnidadesMedida: () =>
    api.get<ApiResponse<TablaMaestra[]>>('/api/configuracion/facturacion/unidades-medida'),
  getCodigosFactura: () =>
    api.get<ApiResponse<TablaMaestra[]>>('/api/configuracion/facturacion/codigos-factura'),
};

// ─── CUENTAS V2 ───────────────────────────────────────────────────────────────
export const cuentasApi = {
  getResumen: () => api.get<ApiResponse<ResumenFinanciero>>('/api/cuentas/resumen'),
  getMonedas: () => api.get<ApiResponse<Moneda[]>>('/api/cuentas/monedas'),
  getMonedasActivas: () => api.get<ApiResponse<Moneda[]>>('/api/cuentas/monedas/activas'),
  getMonedaDefault: () => api.get<ApiResponse<Moneda>>('/api/cuentas/moneda-default'),
  createMoneda: (data: { codigo: string; nombre: string; simbolo: string; esPorDefecto?: boolean }) =>
    api.post<ApiResponse<Moneda>>('/api/cuentas/monedas', data),
  updateMoneda: (id: number, data: { nombre?: string; simbolo?: string; esPorDefecto?: boolean; activo?: boolean }) =>
    api.put<ApiResponse<Moneda>>(`/api/cuentas/monedas/${id}`, data),
  deleteMoneda: (id: number) => api.delete<ApiResponse<null>>(`/api/cuentas/monedas/${id}`),
  getTiposPago: () => api.get<ApiResponse<TipoPago[]>>('/api/cuentas/tipos-pago'),
  getTiposPagoActivos: () => api.get<ApiResponse<TipoPago[]>>('/api/cuentas/tipos-pago/activos'),
  createTipoPago: (data: { codigo: string; nombre: string; descripcion?: string; orden?: number }) =>
    api.post<ApiResponse<TipoPago>>('/api/cuentas/tipos-pago', data),
  updateTipoPago: (id: number, data: { nombre?: string; descripcion?: string; activo?: boolean; orden?: number }) =>
    api.put<ApiResponse<TipoPago>>(`/api/cuentas/tipos-pago/${id}`, data),
  deleteTipoPago: (id: number) => api.delete<ApiResponse<null>>(`/api/cuentas/tipos-pago/${id}`),
  getCuentas: (params?: { activo?: boolean }) =>
    api.get<ApiResponse<CuentaDinero[]>>('/api/cuentas/cuentas', { params }),
  createCuenta: (data: {
    nombre: string; tipoCuenta: string; monedaId: number;
    saldoInicial?: number; descripcion?: string; banco?: string; numeroCuenta?: string;
  }) => api.post<ApiResponse<CuentaDinero>>('/api/cuentas/cuentas', data),
  updateCuenta: (id: number, data: Partial<CuentaDinero>) =>
    api.put<ApiResponse<CuentaDinero>>(`/api/cuentas/cuentas/${id}`, data),
  deleteCuenta: (id: number) => api.delete<ApiResponse<null>>(`/api/cuentas/cuentas/${id}`),
  getMovimientos: (params?: { cuentaId?: number; tipo?: string; desde?: string; hasta?: string }) =>
    api.get<ApiResponse<MovimientoCuenta[]>>('/api/cuentas/movimientos', { params }),
  registrarMovimiento: (data: {
    cuentaId: number; tipo: 'INGRESO' | 'EGRESO'; monto: number; monedaId: number;
    tipoPagoId?: number; concepto: string; referencia?: string; fecha?: string;
  }) => api.post<ApiResponse<MovimientoCuenta>>('/api/cuentas/movimientos', data),
  // P7: detalle / edición controlada / anulación
  obtenerMovimiento: (id: number) =>
    api.get<ApiResponse<MovimientoCuentaDetalle>>(`/api/cuentas/movimientos/${id}`),
  actualizarMovimiento: (id: number, data: {
    concepto?: string; referencia?: string; fecha?: string; tipoPagoId?: number | null;
  }) => api.put<ApiResponse<MovimientoCuenta>>(`/api/cuentas/movimientos/${id}`, data),
  anularMovimiento: (id: number) =>
    api.patch<ApiResponse<MovimientoCuenta>>(`/api/cuentas/movimientos/${id}/anular`),
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
  exportarJson: () =>
    api.get<Blob>('/api/backup/json', { responseType: 'blob' }),
  exportarExcel: (modulo: string) =>
    api.get<ApiResponse<unknown[]>>(`/api/backup/excel/${modulo}`),
  restaurarJson: (backup: { version: string; data: Record<string, unknown> }) =>
    api.post<ApiResponse<{ message: string; resultados: Record<string, number> }>>('/api/backup/restaurar', backup),
};

// ─── CONTABILIDAD ─────────────────────────────────────────────────────────────
import type {
  CuentaContable, AsientoContable, AsientosResponse, LibroMayor,
  BalanceComprobacion, EstadoResultados, BalanceGeneral, ConfiguracionContable,
  DiagnosticoContable, MapeoContable,
} from '@/types';

export const contabilidadApi = {
  // Plan de cuentas
  cuentas: {
    listar: (params?: { tipo?: string; activa?: string }) =>
      api.get<ApiResponse<CuentaContable[]>>('/api/contabilidad/cuentas', { params }),
    arbol: () =>
      api.get<ApiResponse<CuentaContable[]>>('/api/contabilidad/cuentas/arbol'),
    obtener: (id: string) =>
      api.get<ApiResponse<CuentaContable>>(`/api/contabilidad/cuentas/${id}`),
    crear: (data: { codigo: string; nombre: string; tipo: string; naturaleza: string; padreId?: string }) =>
      api.post<ApiResponse<CuentaContable>>('/api/contabilidad/cuentas', data),
    actualizar: (id: string, data: Partial<CuentaContable>) =>
      api.put<ApiResponse<CuentaContable>>(`/api/contabilidad/cuentas/${id}`, data),
    eliminar: (id: string) =>
      api.delete<ApiResponse<null>>(`/api/contabilidad/cuentas/${id}`),
  },

  // Asientos contables
  asientos: {
    listar: (params?: { desde?: string; hasta?: string; tipo?: string; cuentaId?: string; referencia?: string; page?: number; limit?: number }) =>
      api.get<ApiResponse<AsientosResponse>>('/api/contabilidad/asientos', { params }),
    obtener: (id: string) =>
      api.get<ApiResponse<AsientoContable>>(`/api/contabilidad/asientos/${id}`),
    crear: (data: {
      fecha: string; descripcion: string; referencia?: string; tipo?: string;
      lineas: Array<{ cuentaId: string; descripcion?: string; debe: number; haber: number }>;
    }) => api.post<ApiResponse<AsientoContable>>('/api/contabilidad/asientos', data),
    eliminar: (id: string) =>
      api.delete<ApiResponse<null>>(`/api/contabilidad/asientos/${id}`),
  },

  // Reportes contables
  reportes: {
    libroMayor: (cuentaId: string, params?: { desde?: string; hasta?: string }) =>
      api.get<ApiResponse<LibroMayor>>(`/api/contabilidad/reportes/libro-mayor/${cuentaId}`, { params }),
    balanceComprobacion: (params?: { desde?: string; hasta?: string }) =>
      api.get<ApiResponse<BalanceComprobacion>>('/api/contabilidad/reportes/balance-comprobacion', { params }),
    estadoResultados: (params?: { desde?: string; hasta?: string }) =>
      api.get<ApiResponse<EstadoResultados>>('/api/contabilidad/reportes/estado-resultados', { params }),
    balanceGeneral: (params?: { fecha?: string }) =>
      api.get<ApiResponse<BalanceGeneral>>('/api/contabilidad/reportes/balance-general', { params }),
  },

  // Configuración contable
  config: {
    listar: () =>
      api.get<ApiResponse<ConfiguracionContable[]>>('/api/contabilidad/configuracion'),
    set: (clave: string, cuentaId: string) =>
      api.post<ApiResponse<ConfiguracionContable>>('/api/contabilidad/configuracion', { clave, cuentaId }),
    eliminar: (clave: string) =>
      api.delete<ApiResponse<null>>(`/api/contabilidad/configuracion/${clave}`),
  },

  // Mapeo Categorías → Cuentas Contables
  mapeos: {
    listar: () =>
      api.get<ApiResponse<MapeoContable[]>>('/api/contabilidad/mapeos'),
    set: (data: { modulo: string; categoriaSlug: string; categoriaNombre: string; cuentaContableId: string }) =>
      api.post<ApiResponse<MapeoContable>>('/api/contabilidad/mapeos', data),
  },

  // Sincronización histórica
  sync: () =>
    api.post<ApiResponse<{ creados: number }>>('/api/contabilidad/sync'),

  // Diagnóstico
  diagnostico: () =>
    api.get<ApiResponse<DiagnosticoContable>>('/api/contabilidad/diagnostico'),
};
