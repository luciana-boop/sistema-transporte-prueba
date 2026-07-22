// FILE: src/types/index.ts
// CAMBIO: Agrega MovimientoEnriquecido y actualiza Caja con saldoActual

export type Rol = 'ADMIN' | 'SECRETARIO' | 'CHOFER';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  ultimoAcceso?: string;
  creadoEn: string;
  restriccionHorarioActiva?: boolean;
  diasPermitidos?: number[];
  horaInicio?: string | null;
  horaFin?: string | null;
  conductorId?: number | null;
  tieneLinkAcceso?: boolean;
}

// Registro de un intento de acceso denegado por horario (LogActividad),
// usado solo en la notificación de ADMIN.
export interface IntentoFueraHorario {
  id: number;
  usuarioId: number;
  accion: string;
  detalle: string | null;
  ip: string | null;
  fechaHora: string;
  usuario: { id: number; nombre: string; email: string };
}

export interface AuthState {
  token: string | null;
  usuario: Usuario | null;
}

export type EstadoPedido = 'ACTIVO' | 'ANULADO' | 'FACTURADO';
export type EstadoFactura = 'EMITIDA' | 'PAGADA' | 'PENDIENTE' | 'PARCIAL' | 'ANULADA';
export type EstadoCaja   = 'ABIERTA' | 'CERRADA';
export type TipoMov      = 'INGRESO' | 'EGRESO';
// 'CONTADO' o el código de un TablaMaestra tipo='tipo_credito' activo (ver Configuración)
export type CondicionPago = string;

export interface Cliente {
  id: number;
  razonSocial: string;
  ruc: string;
  direccion: string;
  // Código INEI de 6 dígitos — se usa para autocompletar el punto de llegada
  // al seleccionar el cliente en una Guía de Remisión.
  ubigeo?: string;
  telefono?: string;
  email?: string;
  condicionPago: CondicionPago;
  activo: boolean;
  creadoEn: string;
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  actualizadoEn?: string | null;
  _count?: { pedidos: number; facturas: number };
  contactos?: ClienteContacto[];
}

export interface ClienteContacto {
  id: number;
  clienteId: number;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  creadoEn: string;
}

export interface Pedido {
  id: number;
  clienteId: number;
  usuarioId: number;
  origen: string;
  destino: string;
  tipoCarga: string;
  vehiculoId?: number | null;
  vehiculo?: { id: number; placa: string; tipo: string } | null;
  tarifa: number;
  estado: EstadoPedido;
  observaciones?: string;
  fechaPedido: string;
  cliente: { id: number; razonSocial: string; ruc: string };
  usuario: { id: number; nombre: string };
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  creadoEn?: string;
  actualizadoEn?: string | null;
}

// NUEVO: lÃ­nea de detalle de factura
export interface FacturaDetalle {
  id?: number;
  orden: number;
  cantidad: number;
  unidadMedida: string;
  codigo?: string;
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
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  creadoEn?: string;
  actualizadoEn?: string | null;
}

/** Módulo Cobranza: pago de un cliente (ingreso categoría PAGO_FACTURA) repartido entre una o más facturas */
export interface MovimientoCobranza {
  id: number;
  movimientoCuentaId: number;
  cliente: { id: number; razonSocial: string; ruc: string };
  aplicaciones: Array<{ id: number; monto: number; factura: { id: number; numeroFactura: string } }>;
  observaciones?: string;
  monto: number;
  fechaPago: string;
  anulado: boolean;
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
  /** Cuenta de la que se retiraron los fondos de apertura (genera egreso automÃ¡tico) */
  cuentaOrigenId?: number;
  cuentaOrigen?: { id: number; nombre: string };
  /** Cuenta destino donde se devolviÃ³ el saldo al cerrar. Si estÃ¡ seteado, la devoluciÃ³n ya fue procesada. */
  cuentaDestinoId?: number;
  cuentaDestino?: { id: number; nombre: string };
  /** Egreso (Movimientos, categoría Caja chica) del que se abrió esta caja */
  movimientoCuentaId?: number;
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
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  creadoEn?: string;
  actualizadoEn?: string | null;
}

/** Egreso de categoría Caja chica aún no usado para abrir ninguna caja */
export interface EgresoCajaDisponible {
  id: number;
  concepto: string;
  notaEgreso?: string | null;
  monto: number;
  fecha: string;
  cuenta: { id: number; nombre: string };
  moneda: { codigo: string; simbolo: string };
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
  categoriaEgreso?: string | null;
  vehiculo?: { id: number; placa: string } | null;
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
  categoriaEgreso?: string | null;
  vehiculo?: { id: number; placa: string } | null;
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
  items: MovimientoGlobal[];
  total: number;
  page: number;
  limit: number;
  totalIngresos: number;
  totalEgresos: number;
}

export interface DashboardData {
  periodo: { desde: string; hasta: string };
  // Moneda a la que quedaron filtrados cobrado/gastos/utilidadBruta.
  // facturado/porCobrar son siempre en soles (la facturación no tiene moneda propia).
  moneda: { id: number; codigo: string; simbolo: string; esDefault: boolean };
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
    // null cuando la moneda filtrada no es la default: facturado (soles) menos
    // gastos (otra moneda) no es una resta válida.
    utilidadBruta: number | null;
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

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// â”€â”€â”€ CONDUCTORES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface Conductor {
  id: number;
  // Nombre completo para mostrar; el backend lo compone desde
  // apellidos+nombres cuando esos campos llegan por separado.
  nombre?: string;
  apellidos?: string | null;
  nombres?: string | null;
  dni: string;
  licencia: string;
  vencimientoLicencia?: string | null;
  telefono?: string;
  direccion?: string;
  activo: boolean;
  observaciones?: string;
  tractoPreferencia?: string;
  carretaPreferencia?: string;
  creadoEn: string;
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  actualizadoEn?: string | null;
}

// â”€â”€â”€ VEHÃCULOS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export type TipoVehiculo = 'TRACTO' | 'CARRETA';

export interface Vehiculo {
  id: number;
  placa: string;
  tipo: TipoVehiculo;
  marca?: string | null;
  modelo?: string | null;
  anio?: number | null;
  // TUCE / Cert. Habilitación Vehicular (MTC) — va en la guía SUNAT.
  tuce?: string | null;
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
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  actualizadoEn?: string | null;
}

// â”€â”€â”€ LIQUIDACIONES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// Estados del flujo v4: CREADA â†’ PAGADA â†’ RENDIDA â†’ CERRADA
// (legacy: PENDIENTE_RENDICION, PENDIENTE tratados como CREADA en el backend)
export type EstadoLiquidacion = 'CREADA' | 'PAGADA' | 'RENDIDA' | 'CERRADA' | 'PENDIENTE_RENDICION' | 'PENDIENTE';

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
  estado: EstadoLiquidacion | string;
  // Campos del flujo v4
  fechaPago?: string;
  montoPagado?: number;
  fechaRendicion?: string;
  montoRendido?: number;
  fechaCierre?: string;
  montoDevolucion?: number;
  tipoAjuste?: 'DEVOLUCION' | 'REINTEGRO' | null;
  conductor: { id: number; nombre: string };
  detalles: LiquidacionDetalle[];
  pedidos: LiquidacionPedido[];
  creadoEn: string;
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  actualizadoEn?: string | null;
}

// â”€â”€â”€ COMBUSTIBLE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export interface Combustible {
  id: number;
  vehiculoId: number;
  conductorId?: number;
  liquidacionId?: number;
  /** Egreso (Movimientos, categoría Combustible) del que se descuenta esta carga */
  movimientoCuentaId?: number;
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
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  actualizadoEn?: string | null;
}

/** Egreso de categoría Combustible con saldo disponible para vincular una nueva carga */
export interface EgresoCombustibleDisponible {
  id: number;
  concepto: string;
  notaEgreso?: string | null;
  monto: number;
  saldoDisponible: number;
  fecha: string;
  cuenta: { id: number; nombre: string };
  moneda: { codigo: string; simbolo: string };
}

/** P9: detalle enriquecido de una carga de combustible â€” incluye el movimiento financiero generado */
export interface CombustibleDetalle extends Combustible {
  movimiento?: {
    referencia: string | null;
    concepto: string;
    cuenta: { id: number; nombre: string; tipoCuenta: string };
    moneda: { codigo: string; nombre: string; simbolo: string };
    usuario: { id: number; nombre: string };
  } | null;
}

// â”€â”€â”€ CONFIGURACIÃ“N â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
}

export interface TipoVehiculoConfig {
  id: number;
  codigo: string;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

// â”€â”€â”€ CUENTAS / MONEDAS / TIPOS PAGO â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
}

export interface MovimientoCuenta {
  id: number;
  cuentaId: number;
  tipo: 'INGRESO' | 'EGRESO';
  monto: number;
  monedaId: number;
  tipoPagoId?: number;
  concepto: string;
  /** N° de operación del banco (no confundir con `notaEgreso`) */
  referencia?: string;
  /** Módulo Movimientos: nota libre solo para egresos — en qué se usó el gasto */
  notaEgreso?: string | null;
  /** Módulo Movimientos: categoría del egreso (COMBUSTIBLE | MANTENIMIENTO | CAJA_CHICA | PLANILLA | OTROS) */
  categoriaEgreso?: string | null;
  /** Módulo Movimientos: categoría del ingreso (PAGO_FACTURA | CAJA_CHICA | LIQUIDACION | OTRO) */
  categoriaIngreso?: string | null;
  /** Módulo Movimientos: observación libre para ingresos cuya categoría no es PAGO_FACTURA */
  notaIngreso?: string | null;
  fecha: string;
  anulado: boolean;
  cuenta: { id: number; nombre: string; tipoCuenta: string };
  moneda: { codigo: string; simbolo: string };
  tipoPago?: { nombre: string };
  usuario: { id: number; nombre: string };
  /** Módulo Cobranza: pago vinculado (solo relevante si tipo === 'INGRESO' y categoriaIngreso === 'PAGO_FACTURA') */
  cobranza?: {
    id: number; anulado: boolean; monto: number;
    cliente: { id: number; razonSocial: string };
    aplicaciones: Array<{ monto: number }>;
  } | null;
  /** Módulo Mantenimiento: detalle vinculado (solo relevante si categoriaEgreso === 'MANTENIMIENTO') */
  mantenimiento?: { id: number; vehiculo: { id: number; placa: string } } | null;
  /** Si este ingreso es la devolución de saldo al cerrar una caja chica — no admite cobranza */
  cajaCierre?: { id: number; nombre?: string | null } | null;
}

/** P7: detalle completo de un movimiento, incluye origen y datos enriquecidos */
export interface MovimientoCuentaDetalle extends MovimientoCuenta {
  origen: string;
  liquidacion?: { id: number; conductor?: { nombre: string } } | null;
  creadoEn?: string;
  creadoPor?: { id: number; nombre: string } | null;
  actualizadoPor?: { id: number; nombre: string } | null;
  actualizadoEn?: string | null;
}

export interface ResumenFinanciero {
  cuentas: CuentaDinero[];
  porMoneda: Record<string, { simbolo: string; total: number }>;
  movRecientes: MovimientoCuenta[];
  ultimos30dias: { ingresos: number; egresos: number };
}

// ─── GUÍAS DE REMISIÓN (SUNAT GRE) ───────────────────────────────────────────
export type EstadoGuia = 'EMITIDA' | 'ANULADA';
export type TipoGuia = 'REMITENTE' | 'TRANSPORTISTA';

export interface GuiaDetalle {
  id?: number;
  descripcion: string;
  cantidad: number;
  unidadMedida: string;
}

export interface GuiaTransportistaAdicional {
  id?: number;
  placa: string;
  numRegistroMTC: string;
}

export interface Guia {
  id: number;
  numero: string;
  serie?: string | null;
  pedidoId?: number | null;
  facturaId?: number | null;
  clienteId?: number | null;
  clienteNombre?: string | null;
  clienteNumDoc?: string | null;
  remitenteId?: number | null;
  usuarioId: number;
  fechaEmision: string;
  estado: EstadoGuia;
  tipoGuia: TipoGuia;
  // Catálogos SUNAT: 20 (motivo de traslado) y 18 (modalidad: 01 público / 02 privado)
  motivoTraslado: string;
  modalidadTransporte: string;
  fechaInicioTraslado?: string | null;
  ubigeoOrigen?: string | null;
  direccionPartida?: string | null;
  ubigeoDestino?: string | null;
  direccionEntrega?: string | null;
  rucTransportista?: string | null;
  razonSocialTransportista?: string | null;
  numRegistroMTC?: string | null;
  placaTransportista?: string | null;
  conductorId?: number | null;
  vehiculoId?: number | null;
  vehiculoCarretaId?: number | null;
  conductorNombre?: string | null;
  conductorDni?: string | null;
  conductorLicencia?: string | null;
  pesoTotal?: number | null;
  observaciones?: string | null;
  // Documento relacionado (catálogo SUNAT 61) — solo en tipoGuia = 'TRANSPORTISTA'.
  docRelTipo?: string | null;
  docRelSerie?: string | null;
  docRelNumero?: string | null;
  docRelRucEmisor?: string | null;
  estadoSunat?: string | null;
  motivoRechazoSunat?: string | null;
  ticketSunat?: string | null;
  xmlPath?: string | null;
  pdfPath?: string | null;
  cdrPath?: string | null;
  anulado: boolean;
  creadoEn: string;
  cliente?: { id: number; razonSocial: string; ruc: string } | null;
  remitente?: { id: number; razonSocial: string; ruc: string } | null;
  pedido?: { id: number; origen: string; destino: string; tipoCarga: string } | null;
  factura?: { id: number; numeroFactura: string } | null;
  usuario?: { id: number; nombre: string };
  conductor?: { id: number; nombre: string; dni: string; licencia: string } | null;
  vehiculo?: { id: number; placa: string; marca: string; modelo: string } | null;
  vehiculoCarreta?: { id: number; placa: string; marca: string; modelo: string } | null;
  detalles?: GuiaDetalle[];
  transportistasAdicionales?: GuiaTransportistaAdicional[];
}

export interface GuiaPendienteSunat {
  id: number;
  numero: string;
  fechaEmision: string;
  cliente?: { razonSocial: string } | null;
}
