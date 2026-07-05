// FILE: src/services/api.ts
// FIX PROBLEMA 2: cobranzaApi.registrarPago acepta cuentaId obligatorio.
// MEJORA: gastosApi.obtener agregado para vistas de detalle.
// v2 P1: facturacionApi añade pdfInfo() para verificar disponibilidad del PDF
// (la descarga/visualización se hace con la instancia `api` + responseType: 'blob'
// porque el endpoint /pdf exige el header Authorization, que un <a href> no envía).
// v2 P3: liquidacionesApi añade cajasAbiertas, pagar, reintegro, devolucion, historialFinanciero.
// v3: liquidacionesApi añade rendir(); crear() hace detalles opcionales (flujo 2 etapas).

import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';
import type {
  ApiResponse, Usuario, Cliente, Pedido, Factura, Caja,
  Rol, Conductor, Vehiculo,
  Liquidacion, LiquidacionDetalle, Combustible, CombustibleDetalle, ConfigParam,
  SerieFacturacion, ConfigAlerta, TablaMaestra,
  TipoVehiculoConfig, Moneda, TipoPago, CuentaDinero, MovimientoCuenta, MovimientoCuentaDetalle,
  ResumenFinanciero, EstadoFactura, FacturaDetalle, PedidoResumen,
  MovimientoCobranza,
  MovimientosCajaResponse, MovimientosGlobalResponse,
  PaginatedResponse, EgresoCombustibleDisponible, EgresoCajaDisponible,
  Guia, GuiaPendienteSunat, EstadoGuia,
  IntentoFueraHorario, ClienteContacto,
} from '@/types';

// baseURL vacío/relativo a propósito: las peticiones van a rutas propias
// ('/api/...') que Next.js reenvía al backend real vía rewrite (ver
// next.config.js). Así el navegador solo ve un origen (el del frontend) y la
// cookie de sesión queda de primera parte — Safari/iOS bloquea por completo
// las cookies de terceros aunque sean SameSite=None; Secure.
const api = axios.create({
  timeout: 30000,
  withCredentials: true,
});

const METODOS_SEGUROS = new Set(['get', 'head', 'options']);

api.interceptors.request.use((config) => {
  const metodo = (config.method ?? 'get').toLowerCase();
  if (!METODOS_SEGUROS.has(metodo)) {
    const csrfToken = useAuthStore.getState().csrfToken;
    if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
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

/**
 * Recorre todas las páginas de un endpoint paginado y devuelve la lista completa.
 * Usado en exportaciones (backups) que necesitan el dataset completo, no una página.
 */
export async function fetchAllPages<T>(
  fetchPage: (params: { page: number; limit: number }) => Promise<PaginatedResponse<T>>,
): Promise<T[]> {
  const limit = 100;
  const primera = await fetchPage({ page: 1, limit });
  const items = [...primera.items];
  const totalPaginas = Math.ceil(primera.total / limit);
  for (let page = 2; page <= totalPaginas; page++) {
    const res = await fetchPage({ page, limit });
    items.push(...res.items);
  }
  return items;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<ApiResponse<{ usuario: Usuario; csrfToken: string }>>('/api/auth/login', { email, password }),
  logout: () => api.post<ApiResponse<null>>('/api/auth/logout'),
  me: () => api.get<ApiResponse<{ usuario: Usuario; csrfToken: string }>>('/api/auth/me'),
  accesoLinkFijo: (token: string) =>
    api.post<ApiResponse<{ usuario: Usuario; csrfToken: string }>>(`/api/auth/acceso/${token}`),
};

// ─── CLIENTES ─────────────────────────────────────────────────────────────────
export const clientesApi = {
  listar: (params?: { activo?: boolean; search?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Cliente>>>('/api/clientes', { params }),
  obtener: (id: number) => api.get<ApiResponse<Cliente>>(`/api/clientes/${id}`),
  crear: (data: {
    razonSocial: string; ruc: string; direccion: string; ubigeo?: string;
    telefono?: string; email?: string; condicionPago?: string;
  }) => api.post<ApiResponse<Cliente>>('/api/clientes', data),
  actualizar: (id: number, data: Partial<Cliente>) =>
    api.put<ApiResponse<Cliente>>(`/api/clientes/${id}`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/clientes/${id}`),
  agregarContacto: (clienteId: number, data: { nombre: string; telefono?: string; email?: string }) =>
    api.post<ApiResponse<ClienteContacto>>(`/api/clientes/${clienteId}/contactos`, data),
  actualizarContacto: (contactoId: number, data: { nombre: string; telefono?: string; email?: string }) =>
    api.put<ApiResponse<ClienteContacto>>(`/api/clientes/contactos/${contactoId}`, data),
  eliminarContacto: (contactoId: number) =>
    api.delete<ApiResponse<null>>(`/api/clientes/contactos/${contactoId}`),
};

// ─── PEDIDOS ──────────────────────────────────────────────────────────────────
export const pedidosApi = {
  listar: (params?: { estado?: string; clienteId?: number; search?: string; desde?: string; hasta?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Pedido>>>('/api/pedidos', { params }),
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
    tipoCarga: string; vehiculoId?: number; tarifa: number; observaciones?: string;
  }) => api.post<ApiResponse<Pedido>>('/api/pedidos', data),
  actualizar: (id: number, data: Partial<Pedido> & { vehiculoId?: number | null }) =>
    api.put<ApiResponse<Pedido>>(`/api/pedidos/${id}`, data),
  anular: (id: number) => api.patch<ApiResponse<Pedido>>(`/api/pedidos/${id}/anular`, {}),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/pedidos/${id}`),
};

// ─── FACTURACIÓN ─────────────────────────────────────────────────────────────
export const facturacionApi = {
  listar: (params?: { estado?: string; clienteId?: number; desde?: string; hasta?: string; serie?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Factura>>>('/api/facturacion', { params }),
  obtener: (id: number) => api.get<ApiResponse<Factura>>(`/api/facturacion/${id}`),
  series: () => api.get<ApiResponse<string[]>>('/api/facturacion/series'),
  proximoCorrelativo: (serie: string) =>
    api.get<ApiResponse<{ serie: string; correlativo: number; numeroFactura: string }>>(`/api/facturacion/correlativo/${serie}`),

  // P1: metadata del PDF (sin streaming) — para saber si existe antes de abrirlo
  pdfInfo: (id: number) =>
    api.get<ApiResponse<{ tienePdf: boolean; pdfPath: string | null; esUrl: boolean; archivoExiste: boolean }>>(`/api/facturacion/${id}/pdf-info`),

  crear: (data: {
    clienteId: number; pedidoId?: number; serie?: string; correlativo?: number; subtotal: number;
    porcentajeIgv?: number; detraccion?: number; porcentajeDetraccion?: number;
    tipoCredito?: string; diasCredito?: number; guiaReferencia?: string; peso?: number; detalle?: string;
    fechaEmision: string; observaciones?: string;
    lineas?: Array<{
      orden?: number; cantidad: number; unidadMedida?: string; codigo?: string;
      descripcion: string; valorUnitario: number; importe: number;
    }>;
  }) => api.post<ApiResponse<Factura>>('/api/facturacion', data),
  crearDesdeXml: (data: Record<string, unknown>) =>
    api.post<ApiResponse<Factura>>('/api/facturacion/desde-xml', data),
  importacionMasivaXml: (facturas: Record<string, unknown>[]) =>
    api.post<ApiResponse<{ creadas: number; duplicadas: number; errores: string[] }>>('/api/facturacion/importacion-masiva-xml', { facturas }),
  actualizar: (id: number, data: {
    clienteId?: number; pedidoId?: number | null; subtotal?: number; porcentajeIgv?: number; detraccion?: number;
    porcentajeDetraccion?: number; tipoCredito?: string; diasCredito?: number;
    guiaReferencia?: string; peso?: number; detalle?: string; fechaEmision?: string;
    fechaVencimiento?: string; observaciones?: string; estadoSunat?: string;
    lineas?: Array<{
      orden?: number; cantidad: number; unidadMedida?: string; codigo?: string;
      descripcion: string; valorUnitario: number; importe: number;
    }>;
  }) => api.put<ApiResponse<Factura>>(`/api/facturacion/${id}`, data),
  anular: (id: number) => api.patch<ApiResponse<Factura>>(`/api/facturacion/${id}/anular`, {}),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/facturacion/${id}`),
  // Acción rápida: asocia/desasocia el pedido sin abrir el formulario de edición completo
  asociarPedido: (id: number, pedidoId: number | null) =>
    api.patch<ApiResponse<Factura>>(`/api/facturacion/${id}/pedido`, { pedidoId }),
};

// ─── GUÍAS DE REMISIÓN ───────────────────────────────────────────────────────
export const guiasApi = {
  listar: (params?: { clienteId?: number; pedidoId?: number; estado?: EstadoGuia; search?: string; desde?: string; hasta?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Guia>>>('/api/guias', { params }),
  obtener: (id: number) => api.get<ApiResponse<Guia>>(`/api/guias/${id}`),
  crear: (data: {
    tipoGuia?: 'REMITENTE' | 'TRANSPORTISTA';
    clienteId?: number; clienteNombre?: string; clienteNumDoc?: string;
    remitenteId?: number; pedidoId?: number; serie?: string;
    motivoTraslado?: string; modalidadTransporte?: string; fechaInicioTraslado?: string;
    ubigeoOrigen?: string; direccionPartida?: string; ubigeoDestino?: string; direccionEntrega?: string;
    rucTransportista?: string; razonSocialTransportista?: string; numRegistroMTC?: string; placaTransportista?: string;
    transportistasAdicionales?: Array<{ placa: string; numRegistroMTC: string }>;
    conductorId?: number; vehiculoId?: number; vehiculoCarretaId?: number;
    conductorNombre?: string; conductorDni?: string; conductorLicencia?: string;
    docRelTipo?: string; docRelSerie?: string; docRelNumero?: string; docRelRucEmisor?: string;
    pesoTotal?: number; observaciones?: string;
    detalles: Array<{ descripcion: string; cantidad: number; unidadMedida?: string }>;
  }) => api.post<ApiResponse<Guia>>('/api/guias', data),
  anular: (id: number) => api.post<ApiResponse<Guia>>(`/api/guias/${id}/anular`, {}),
  vincularFactura: (id: number, facturaId: number) =>
    api.patch<ApiResponse<Guia>>(`/api/guias/${id}/factura`, { facturaId }),
  vincularPedido: (id: number, pedidoId: number) =>
    api.patch<ApiResponse<Guia>>(`/api/guias/${id}/pedido`, { pedidoId }),
  pendientesSunat: () =>
    api.get<ApiResponse<GuiaPendienteSunat[]>>('/api/guias/pendientes-sunat'),
  enviarSunat: (id: number) => api.post<ApiResponse<Guia>>(`/api/guias/${id}/enviar-sunat`, {}),
  enviarSunatLote: (ids: number[]) =>
    api.post<ApiResponse<{ enviados: number; errores: Array<{ id: number; numero: string; error: string }> }>>('/api/guias/enviar-sunat/lote', { ids }),
};

// ─── GUÍAS (CHOFER) ──────────────────────────────────────────────────────────
// Formulario reducido para el rol CHOFER — ver guias-chofer.routes.ts. El
// conductor sale de Usuario.conductorId en el backend, nunca se manda desde acá.
export const guiasChoferApi = {
  crear: (data: {
    remitenteId: number;
    clienteId?: number; clienteNombre?: string; clienteNumDoc?: string;
    fechaInicioTraslado?: string;
    ubigeoOrigen?: string; direccionPartida?: string;
    ubigeoDestino?: string; direccionEntrega?: string;
    vehiculoId: number; vehiculoCarretaId?: number;
    pesoTotal?: number; observaciones?: string;
    docRelTipo: string; docRelSerie?: string; docRelNumero: string; docRelRucEmisor: string;
    detalles: Array<{ descripcion: string; cantidad: number; unidadMedida?: string }>;
  }) => api.post<ApiResponse<Guia>>('/api/guias-chofer', data),
  mias: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<{
      id: number; numero: string; fechaEmision: string; estado: string;
      estadoSunat: string | null; motivoRechazoSunat: string | null; anulado: boolean;
      cliente: { razonSocial: string } | null; clienteNombre: string | null;
    }>>>('/api/guias-chofer/mias', { params }),
  vehiculosActivos: () =>
    api.get<ApiResponse<Array<{ id: number; placa: string; tipo: 'TRACTO' | 'CARRETA'; marca: string; modelo: string }>>>('/api/guias-chofer/vehiculos-activos'),
};

// ─── MOVIMIENTOS ─────────────────────────────────────────────────────────────
export const movimientosApi = {
  listar: (params?: { tipo?: 'INGRESO' | 'EGRESO'; cuentaId?: number; desde?: string; hasta?: string; search?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<MovimientoCuenta>>>('/api/movimientos', { params }),
  obtener: (id: number) =>
    api.get<ApiResponse<MovimientoCuentaDetalle & { cobranza: MovimientoCobranza | null }>>(`/api/movimientos/${id}`),
  crear: (data: {
    cuentaId: number; tipo: 'INGRESO' | 'EGRESO'; monto: number; monedaId: number;
    tipoPagoId?: number; concepto: string; referencia?: string; fecha?: string;
    notaEgreso?: string; categoriaEgreso?: string;
    categoriaIngreso?: string; notaIngreso?: string; clienteId?: number;
  }) => api.post<ApiResponse<MovimientoCuenta>>('/api/movimientos', data),
  actualizar: (id: number, data: {
    concepto?: string; referencia?: string; fecha?: string; tipoPagoId?: number | null;
    notaEgreso?: string | null; categoriaEgreso?: string | null;
    notaIngreso?: string | null; categoriaIngreso?: string | null; clienteId?: number | null;
  }) =>
    api.put<ApiResponse<MovimientoCuenta>>(`/api/movimientos/${id}`, data),
  anular: (id: number) => api.patch<ApiResponse<MovimientoCuenta>>(`/api/movimientos/${id}/anular`),
  resumen: (params?: { desde?: string; hasta?: string; cuentaId?: number }) =>
    api.get<ApiResponse<{ totalIngresos: number; cantidadIngresos: number; totalEgresos: number; cantidadEgresos: number; saldoNeto: number }>>('/api/movimientos/resumen', { params }),
  importarExcel: (data: {
    cuentaId: number; monedaId: number;
    filas: Array<{ fecha: string; descripcion: string; monto: number; tipo: 'INGRESO' | 'EGRESO'; referencia?: string }>;
    confirmarDuplicados?: boolean;
  }) => api.post<ApiResponse<{
    creados: number;
    errores: Array<{ fila: number; motivo: string }>;
    bloqueados: Array<{ fila: number; motivo: string; existente?: { fecha: string; monto: number; concepto: string } }>;
    advertencias: Array<{ fila: number; motivo: string; existente?: { fecha: string; monto: number; concepto: string } }>;
  }>>('/api/movimientos/importar', data, { timeout: 60000 }),
};

// ─── COBRANZA ────────────────────────────────────────────────────────────────
export interface FacturaPendiente {
  id: number; numeroFactura: string; cliente?: { id: number; razonSocial: string };
  total: number; pagado: number;
  saldoPendiente: number; estado: string; fechaVencimiento: string; vencida: boolean;
}

export interface EstadoCuentaCliente {
  cliente: { id: number; razonSocial: string; ruc: string };
  vencidas: FacturaPendiente[];
  porVencer: FacturaPendiente[];
  totalVencidas: number;
  totalPorVencer: number;
  totalGeneral: number;
}

export const cobranzaApi = {
  listar: (params?: { estado?: 'por_aplicar' | 'aplicado'; desde?: string; hasta?: string; clienteId?: number; search?: string }) =>
    api.get<ApiResponse<MovimientoCobranza[]>>('/api/cobranza', { params }),
  facturasPendientes: (clienteId: number) =>
    api.get<ApiResponse<FacturaPendiente[]>>(`/api/cobranza/${clienteId}/facturas-pendientes`),
  facturasPendientesTodas: (params?: { clienteId?: number }) =>
    api.get<ApiResponse<FacturaPendiente[]>>('/api/cobranza/facturas-pendientes', { params }),
  estadoCuenta: (clienteId: number) =>
    api.get<ApiResponse<EstadoCuentaCliente>>(`/api/cobranza/${clienteId}/estado-cuenta`),
  aplicar: (pagoId: number, data: { aplicaciones: Array<{ facturaId: number; monto: number }> }) =>
    api.post<ApiResponse<MovimientoCobranza>>(`/api/cobranza/${pagoId}/aplicar`, data),
  quitarAplicacion: (aplicacionId: number) =>
    api.delete<ApiResponse<{ message: string }>>(`/api/cobranza/aplicaciones/${aplicacionId}`),
};

// ─── MANTENIMIENTO ───────────────────────────────────────────────────────────
export interface MovimientoMantenimiento {
  id: number;
  concepto: string;
  monto: number;
  fecha: string;
  referencia?: string | null;
  notaEgreso?: string | null;
  cuenta: { id: number; nombre: string };
  mantenimiento: {
    id: number;
    vehiculo: { id: number; placa: string };
    conductor?: { id: number; nombre: string } | null;
    motivoCodigo: string;
    descripcion?: string | null;
  } | null;
}

export const mantenimientoApi = {
  listar: (params?: {
    estado?: 'por_relacionar' | 'relacionado'; desde?: string; hasta?: string;
    vehiculoId?: number; motivoCodigo?: string; search?: string;
  }) =>
    api.get<ApiResponse<MovimientoMantenimiento[]>>('/api/mantenimiento', { params }),
  relacionar: (movimientoId: number, data: { vehiculoId: number; conductorId?: number; motivoCodigo: string; descripcion?: string }) =>
    api.post<ApiResponse<MovimientoMantenimiento>>(`/api/mantenimiento/${movimientoId}/relacionar`, data),
};

// ─── CAJA ────────────────────────────────────────────────────────────────────
export const cajaApi = {
  listar: (params?: { estado?: string; desde?: string; hasta?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Caja>>>('/api/caja', { params }),
  obtener: (id: number) => api.get<ApiResponse<Caja>>(`/api/caja/${id}`),
  actual: () => api.get<ApiResponse<Caja | null>>('/api/caja/actual'),
  egresosDisponibles: () =>
    api.get<ApiResponse<EgresoCajaDisponible[]>>('/api/caja/egresos-disponibles'),
  abrir: (data: { movimientoCuentaId: number; nombre?: string; observaciones?: string }) =>
    api.post<ApiResponse<Caja>>('/api/caja/abrir', data),
  cerrar: (id: number, data: { saldoCierre: number; observaciones?: string; cuentaDestinoId?: number; referencia?: string }) =>
    api.patch<ApiResponse<Caja>>(`/api/caja/${id}/cerrar`, data),
  registrarMovimiento: (id: number, data: {
    tipo: 'INGRESO' | 'EGRESO'; monto: number; concepto: string;
    fecha?: string; referencia?: string;
  }) => api.post<ApiResponse<Caja>>(`/api/caja/${id}/movimiento`, data),
  getMovimientos: (id: number, params?: { desde?: string; hasta?: string; tipo?: string }) =>
    api.get<ApiResponse<MovimientosCajaResponse>>(`/api/caja/${id}/movimientos`, { params }),
  getMovimientosGlobal: (params?: { cajaId?: number; desde?: string; hasta?: string; tipo?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<MovimientosGlobalResponse>>('/api/caja/movimientos', { params }),
  editarMovimiento: (movimientoId: number, data: {
    monto?: number; concepto?: string; fecha?: string; referencia?: string;
  }) => api.put<ApiResponse<any>>(`/api/caja/movimientos/${movimientoId}`, data),
  anularMovimiento: (movimientoId: number) =>
    api.patch<ApiResponse<any>>(`/api/caja/movimientos/${movimientoId}/anular`),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/caja/${id}`),
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
      pagos: MovimientoCobranza[];
      resumenPorMetodo: Array<{ metodoPago: string; cantidad: number; total: number }>;
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
  egresos: (params?: { desde?: string; hasta?: string }) =>
    api.get<ApiResponse<{
      egresos: MovimientoCuenta[];
      totales: { cantidad: number; totalEgresos: number };
    }>>('/api/reportes/egresos', { params }),
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
  mantenimiento: (params?: { desde?: string; hasta?: string; vehiculoId?: number }) =>
    api.get<ApiResponse<{
      gastos: Array<{
        id: number; monto: number; fecha: string; concepto: string;
        cuenta: { id: number; nombre: string };
        mantenimiento: {
          id: number; motivoCodigo: string; descripcion?: string | null;
          vehiculo: { id: number; placa: string; marca: string; modelo: string };
          conductor?: { id: number; nombre: string } | null;
        } | null;
      }>;
      totalGastado: number;
      cantidad: number;
      porVehiculo: Array<{ vehiculoId: number; placa: string; total: number; cantidad: number }>;
    }>>('/api/reportes/mantenimiento', { params }),
};

// ─── USUARIOS ────────────────────────────────────────────────────────────────
interface HorarioAccesoData {
  restriccionHorarioActiva?: boolean;
  diasPermitidos?: number[];
  horaInicio?: string | null;
  horaFin?: string | null;
}

export const usuariosApi = {
  listar: (params?: { page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Usuario>>>('/api/usuarios', { params }),
  obtener: (id: number) => api.get<ApiResponse<Usuario>>(`/api/usuarios/${id}`),
  crear: (data: { nombre: string; email: string; password: string; rol: Rol; conductorId?: number } & HorarioAccesoData) =>
    api.post<ApiResponse<Usuario>>('/api/usuarios', data),
  actualizar: (id: number, data: { nombre?: string; email?: string; rol?: Rol; activo?: boolean; conductorId?: number } & HorarioAccesoData) =>
    api.put<ApiResponse<Usuario>>(`/api/usuarios/${id}`, data),
  cambiarPassword: (id: number, data: { password: string }) =>
    api.patch<ApiResponse<null>>(`/api/usuarios/${id}/password`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/usuarios/${id}`),
  intentosFueraHorario: () =>
    api.get<ApiResponse<IntentoFueraHorario[]>>('/api/usuarios/intentos-fuera-horario'),
  generarLinkAcceso: (id: number) =>
    api.post<ApiResponse<{ token: string }>>(`/api/usuarios/${id}/link-acceso`),
  revocarLinkAcceso: (id: number) =>
    api.delete<ApiResponse<null>>(`/api/usuarios/${id}/link-acceso`),
};

// ─── CONDUCTORES ─────────────────────────────────────────────────────────────
export const conductoresApi = {
  listar: (params?: { activo?: boolean; search?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Conductor>>>('/api/conductores', { params }),
  obtener: (id: number) => api.get<ApiResponse<Conductor>>(`/api/conductores/${id}`),
  crear: (data: Omit<Conductor, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<Conductor>>('/api/conductores', data),
  actualizar: (id: number, data: Partial<Conductor>) =>
    api.put<ApiResponse<Conductor>>(`/api/conductores/${id}`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/conductores/${id}`),
};

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────
export const vehiculosApi = {
  listar: (params?: { activo?: boolean; tipo?: string; search?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Vehiculo>>>('/api/vehiculos', { params }),
  obtener: (id: number) => api.get<ApiResponse<Vehiculo>>(`/api/vehiculos/${id}`),
  crear: (data: Omit<Vehiculo, 'id' | 'creadoEn'>) =>
    api.post<ApiResponse<Vehiculo>>('/api/vehiculos', data),
  actualizar: (id: number, data: Partial<Vehiculo>) =>
    api.put<ApiResponse<Vehiculo>>(`/api/vehiculos/${id}`, data),
  eliminar: (id: number) => api.delete<ApiResponse<null>>(`/api/vehiculos/${id}`),
};

// ─── LIQUIDACIONES ───────────────────────────────────────────────────────────
export const liquidacionesApi = {
  listar: (params?: { conductorId?: number; desde?: string; hasta?: string; sinCombustible?: boolean; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Liquidacion>>>('/api/liquidaciones', { params }),
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

  // v4 — Paso 4: cerrar (RENDIDA→CERRADA, registra devolución o reintegro vía banco + N° de operación)
  cerrar: (id: number, data: { cuentaId: number; numeroOperacion?: string; fecha?: string }) =>
    api.post<ApiResponse<Liquidacion>>(`/api/liquidaciones/${id}/cerrar`, data),

  historialFinanciero: (id: number) =>
    api.get<ApiResponse<{
      liquidacion: { id: number; estado: string; montoEntregado: number; montoPagado: number | null; totalGastos: number; montoRendido: number | null; reintegro: number; devolucion: number; tipoAjuste: string | null; conductor: { nombre: string } };
      movimientos: Array<{ id: string; tipo: string; monto: number; concepto: string; referencia: string | null; fecha: string; origen: string }>;
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
  listar: (params?: { vehiculoId?: number; conductorId?: number; desde?: string; hasta?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<Combustible>>>('/api/combustible', { params }),
  /** P9: detalle de solo lectura — incluye el egreso vinculado */
  obtener: (id: number) => api.get<ApiResponse<CombustibleDetalle>>(`/api/combustible/${id}`),
  egresosDisponibles: () =>
    api.get<ApiResponse<EgresoCombustibleDisponible[]>>('/api/combustible/egresos-disponibles'),
  crear: (data: {
    vehiculoId: number; conductorId?: number; liquidacionId?: number; fecha: string;
    galones: number; monto: number; kilometraje?: number; grifo?: string; observaciones?: string;
    movimientoCuentaId: number;
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
  getMovimientos: (params?: { cuentaId?: number; tipo?: string; desde?: string; hasta?: string; page?: number; limit?: number }) =>
    api.get<ApiResponse<PaginatedResponse<MovimientoCuenta>>>('/api/cuentas/movimientos', { params }),
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

