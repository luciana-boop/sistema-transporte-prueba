// FILE: src/types/index.ts
// CAMBIO: Agrega MovimientoEnriquecido y actualiza Caja con saldoActual

export type Rol = 'ADMIN' | 'SECRETARIO';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  ultimoAcceso?: string;
  creadoEn: string;
}

export interface AuthState {
  token: string | null;
  usuario: Usuario | null;
}

export type EstadoPedido = 'ACTIVO' | 'ANULADO' | 'FACTURADO';
export type EstadoFactura = 'EMITIDA' | 'PAGADA' | 'PENDIENTE' | 'PARCIAL' | 'ANULADA';
export type MetodoPago   = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'CHEQUE';
export type EstadoCaja   = 'ABIERTA' | 'CERRADA';
export type TipoMov      = 'INGRESO' | 'EGRESO';
export type TipoGasto    = 'COMBUSTIBLE' | 'VIATICOS' | 'PEAJE' | 'MANTENIMIENTO' | 'OTROS';
export type CondicionPago = 'CONTADO' | 'CREDITO_15' | 'CREDITO_30' | 'CREDITO_60';

export interface Cliente {
  id: number;
  razonSocial: string;
  ruc: string;
  direccion: string;
  telefono?: string;
  email?: string;
  condicionPago: CondicionPago;
  activo: boolean;
  creadoEn: string;
  _count?: { pedidos: number; facturas: number };
}

export interface ClienteEstadisticas {
  totalPedidos: number;
  facturado: number;
  pagado: number;
  saldoPendiente: number;
  pedidosPendientes: number;
}

export interface Pedido {
  id: number;
  clienteId: number;
  usuarioId: number;
  origen: string;
  destino: string;
  tipoCarga: string;
  tarifa: number;
  estado: EstadoPedido;
  observaciones?: string;
  fechaPedido: string;
  cliente: { id: number; razonSocial: string; ruc: string };
  usuario: { id: number; nombre: string };
}

// NUEVO: línea de detalle de factura
export interface FacturaDetalle {
  id?: number;
  orden: number;
  cantidad: number;
  unidadMedida: string;
  codigo: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
}

export interface Factura {
  id: number;
  pedidoId?: number;
  clienteId: number;
  serie: string;
  correlativo: number;
  numeroFactura: string;
  subtotal: number;
  igv: number;
  total: number;
  detraccion?: number;
  porcentajeDetraccion?: number;
  montoDetraccion?: number;
  tipoCredito?: string;
  diasCredito?: number;
  guiaReferencia?: string;
  peso?: number;
  detalle?: string;
  estado: EstadoFactura;
  estadoSunat?: string;
  xmlPath?: string;
  pdfPath?: string;
  cdrPath?: string;
  fechaEmision: string;
  fechaVencimiento: string;
  totalPagado: number;
  saldoPendiente?: number;
  lineas?: FacturaDetalle[];
  cliente: { id: number; razonSocial: string; ruc: string };
  pedido?: { id: number; origen: string; destino: string };
  usuario: { id: number; nombre: string };
}

export interface Pago {
  id: number;
  facturaId: number;
  clienteId: number;
  monto: number;
  metodoPago: MetodoPago;
  referencia?: string;
  observaciones?: string;
  fechaPago: string;
  factura: { id: number; numeroFactura: string; total: number; estado: EstadoFactura };
  cliente: { id: number; razonSocial: string; ruc: string };
  usuario: { id: number; nombre: string };
}

/** P8: detalle enriquecido de un pago — incluye el movimiento financiero generado */
export interface PagoDetalle extends Pago {
  anulado?: boolean;
  motivoAnulacion?: string;
  movimiento?: {
    referencia: string | null;
    concepto: string;
    cuenta: { id: number; nombre: string; tipoCuenta: string };
    moneda: { codigo: string; nombre: string; simbolo: string };
  } | null;
}

/** P8: detalle uniforme de una cuenta por cobrar — incluye el último cobro asociado (si existe) */
export interface CuentaPorCobrarDetalle {
  facturaId: number;
  numeroFactura: string;
  cliente: { id: number; razonSocial: string; ruc: string };
  fecha: string;
  estado: EstadoFactura;
  observaciones?: string;
  ultimoPago: {
    id: number;
    monto: number;
    metodoPago: MetodoPago;
    fechaPago: string;
    usuario: { id: number; nombre: string };
  } | null;
  cuenta: { id: number; nombre: string; tipoCuenta: string } | null;
  moneda: { codigo: string; nombre: string; simbolo: string } | null;
  movimiento: { referencia: string | null; concepto: string } | null;
}

export interface CuentaPorCobrar {
  facturaId: number;
  numeroFactura: string;
  cliente: { id: number; razonSocial: string; ruc: string };
  total: number;
  pagado: number;
  saldoPendiente: number;
  fechaVencimiento: string;
  vencida: boolean;
  diasVencida: number;
  estado: EstadoFactura;
}

export interface Caja {
  id: number;
  usuarioId: number;
  nombre?: string;
  fecha: string;
  saldoApertura: number;
  saldoCierre?: number;
  estado: EstadoCaja;
  observaciones?: string;
  /** Cuenta de la que se retiraron los fondos de apertura (genera egreso automático) */
  cuentaOrigenId?: number;
  cuentaOrigen?: { id: number; nombre: string };
  /** Cuenta destino donde se devolvió el saldo al cerrar. Si está seteado, la devolución ya fue procesada. */
  cuentaDestinoId?: number;
  cuentaDestino?: { id: number; nombre: string };
  aperturaEn: string;
  cierreEn?: string;
  usuario: { id: number; nombre: string };
  ingresosTotales?: number;
  egresosTotales?: number;
  saldoCalculado?: number;
  /** NUEVO: saldo actual calculado (ingresos - egresos + apertura) */
  saldoActual?: number;
  movimientos?: MovimientoCaja[];
  _count?: { movimientos: number };
}

export interface MovimientoCaja {
  id: number;
  cajaId: number;
  tipo: TipoMov;
  monto: number;
  concepto: string;
  creadoEn: string;
}

/** Movimiento enriquecido con saldo acumulado, referencia, estado y origen */
export interface MovimientoEnriquecido {
  id: number;
  cajaId: number;
  tipo: TipoMov;
  monto: number;
  concepto: string;
  referencia: string | null;
  fecha: string;
  saldoAcumulado: number;
  anulado: boolean;
  esManual: boolean;
}

/** NUEVO: movimiento global (con datos de su caja) */
export interface MovimientoGlobal {
  id: number;
  cajaId: number;
  cajaNombre: string;
  cajaEstado: EstadoCaja;
  tipo: TipoMov;
  monto: number;
  concepto: string;
  referencia: string | null;
  fecha: string;
}

/** NUEVO: respuesta del endpoint de movimientos por caja */
export interface MovimientosCajaResponse {
  caja: Caja;
  movimientos: MovimientoEnriquecido[];
  saldoInicial: number;
  totalIngresos: number;
  totalEgresos: number;
  saldoFinal: number;
}

/** NUEVO: respuesta del endpoint de movimientos globales */
export interface MovimientosGlobalResponse {
  movimientos: MovimientoGlobal[];
  totalIngresos: number;
  totalEgresos: number;
}

export interface Gasto {
  id: number;
  vehiculoId?: number;
  usuarioId: number;
  tipoGasto: TipoGasto;
  monto: number;
  descripcion: string;
  comprobante?: string;
  fecha: string;
  vehiculo?: { id: number; placa: string; marca: string; modelo?: string };
  usuario: { id: number; nombre: string };
}

export interface DashboardData {
  periodo: { desde: string; hasta: string };
  clientes: { total: number };
  pedidos: {
    totalMes: number;
    porEstado: Array<{ estado: EstadoPedido; cantidad: number }>;
  };
  financiero: {
    facturado: number;
    cobrado: number;
    porCobrar: number;
    gastos: number;
    utilidadBruta: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  error?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

// ─── CONDUCTORES ─────────────────────────────────────────────────────────────
export interface Conductor {
  id: number;
  nombre: string;
  dni: string;
  licencia: string;
  vencimientoLicencia: string;
  telefono?: string;
  direccion?: string;
  activo: boolean;
  observaciones?: string;
  tractoPreferencia?: string;
  carretaPreferencia?: string;
  creadoEn: string;
}

// ─── VEHÍCULOS ────────────────────────────────────────────────────────────────
export type TipoVehiculo = 'TRACTO' | 'CARRETA';

export interface Vehiculo {
  id: number;
  placa: string;
  tipo: TipoVehiculo;
  marca: string;
  modelo: string;
  anio: number;
  soat?: string;
  vencimientoSoat?: string;
  revisionTecnica?: string;
  vencimientoRevision?: string;
  ultimoMantenimiento?: string;
  proximoMantenimiento?: string;
  estado: string;
  observaciones?: string;
  activo: boolean;
  creadoEn: string;
}

// ─── LIQUIDACIONES ───────────────────────────────────────────────────────────
export interface LiquidacionDetalle {
  id?: number;
  categoria: 'PEAJE' | 'BALANZA' | 'VIATICO' | 'TOLDO' | 'OTROS';
  descripcion: string;
  monto: number;
}

export interface PedidoResumen {
  id: number;
  origen: string;
  destino: string;
  tipoCarga: string;
  tarifa: number;
  fechaPedido: string;
  estado: EstadoPedido;
  cliente: { id: number; razonSocial: string };
}

export interface LiquidacionPedido {
  id: number;
  liquidacionId: number;
  pedidoId: number;
  creadoEn: string;
  pedido: {
    id: number;
    origen: string;
    destino: string;
    estado: EstadoPedido;
    cliente: { id: number; razonSocial: string };
  };
}

export interface Liquidacion {
  id: number;
  conductorId: number;
  placaTracto: string;
  placaCarreta?: string;
  montoEntregado: number;
  reciboAnticipo?: string;
  fecha: string;
  guiaReferencia?: string;
  observaciones?: string;
  toldo?: number;
  totalGastos: number;
  devolucion: number;
  reintegro: number;
  estado: string;
  conductor: { id: number; nombre: string };
  detalles: LiquidacionDetalle[];
  pedidos: LiquidacionPedido[];
  creadoEn: string;
}

// ─── COMBUSTIBLE ─────────────────────────────────────────────────────────────
export interface Combustible {
  id: number;
  vehiculoId: number;
  conductorId?: number;
  liquidacionId?: number;
  fecha: string;
  galones: number;
  monto: number;
  kilometraje?: number;
  grifo?: string;
  observaciones?: string;
  vehiculo: { id: number; placa: string; marca: string };
  conductor?: { id: number; nombre: string };
  liquidacion?: { id: number; fecha: string; estado: string; montoEntregado?: number };
  creadoEn: string;
}

/** P9: detalle enriquecido de una carga de combustible — incluye el movimiento financiero generado */
export interface CombustibleDetalle extends Combustible {
  movimiento?: {
    referencia: string | null;
    concepto: string;
    cuenta: { id: number; nombre: string; tipoCuenta: string };
    moneda: { codigo: string; nombre: string; simbolo: string };
    usuario: { id: number; nombre: string };
  } | null;
}

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────
export interface ConfigParam {
  id: number;
  clave: string;
  valor: string;
  tipo: 'texto' | 'numero' | 'booleano' | 'color' | 'json';
  categoria: string;
  etiqueta: string;
  descripcion?: string;
}

export interface SerieFacturacion {
  id: number;
  serie: string;
  tipoDocumento: string;
  correlativoActual: number;
  correlativoInicial: number;
  activo: boolean;
  descripcion?: string;
  creadoEn: string;
}

export interface CategoriaGasto {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  esDefault: boolean;
}

export interface ConfigAlerta {
  id: number;
  clave: string;
  etiqueta: string;
  diasAnticipacion: number;
  activo: boolean;
  color: string;
  nivel: 'info' | 'warning' | 'danger';
}

export interface TablaMaestra {
  id: number;
  tipo: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  extra?: string;
  activo: boolean;
  orden: number;
}

export interface TipoVehiculoConfig {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

// ─── CUENTAS / MONEDAS / TIPOS PAGO ──────────────────────────────────────────
export interface Moneda {
  id: number;
  codigo: string;
  nombre: string;
  simbolo: string;
  activo: boolean;
  esPorDefecto: boolean;
}

export interface TipoPago {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
  orden: number;
}

export interface CuentaDinero {
  id: number;
  nombre: string;
  tipoCuenta: 'CAJA' | 'BANCO' | 'DIGITAL';
  monedaId: number;
  saldoInicial: number;
  saldoActual: number;
  activo: boolean;
  descripcion?: string;
  banco?: string;
  numeroCuenta?: string;
  moneda: { codigo: string; nombre: string; simbolo: string };
  creadoEn: string;
}

export interface MovimientoCuenta {
  id: number;
  cuentaId: number;
  tipo: 'INGRESO' | 'EGRESO';
  monto: number;
  monedaId: number;
  tipoPagoId?: number;
  concepto: string;
  referencia?: string;
  fecha: string;
  anulado: boolean;
  cuenta: { id: number; nombre: string; tipoCuenta: string };
  moneda: { codigo: string; simbolo: string };
  tipoPago?: { nombre: string };
  usuario: { id: number; nombre: string };
}

/** P7: detalle completo de un movimiento, incluye origen y datos enriquecidos */
export interface MovimientoCuentaDetalle extends MovimientoCuenta {
  origen: string;
  liquidacion?: { id: number; conductor?: { nombre: string } } | null;
}

export interface ResumenFinanciero {
  cuentas: CuentaDinero[];
  porMoneda: Record<string, { simbolo: string; total: number }>;
  movRecientes: MovimientoCuenta[];
  ultimos30dias: { ingresos: number; egresos: number };
}
