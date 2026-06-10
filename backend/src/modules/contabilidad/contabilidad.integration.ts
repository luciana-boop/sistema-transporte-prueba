// FILE: src/modules/contabilidad/contabilidad.integration.ts
// Servicio de integración: crea asientos contables automáticos desde otros módulos.
// Se llama DESPUÉS de cada transacción principal (fire-and-forget con try-catch).
// Si falla por configuración incompleta, queda registrado en AsientoPendiente
// para poder regenerarse luego desde /contabilidad/sync.

import prisma from '../../prisma/client';
import {
  contabilidadEngine,
  CuentaFaltanteError,
  type AsientoInput,
  type ConfigContable,
  type CuentaRef,
} from './contabilidad.engine';

// ─── Plan de cuentas por defecto (PCGE — Plan Contable General Empresarial) ──

const DEFAULT_CUENTAS = [
  // Activo
  { codigo: '10',   nombre: 'Efectivo y Equivalentes de Efectivo',         tipo: 'ACTIVO',  naturaleza: 'DEUDORA',   padreKey: null  },
  { codigo: '101',  nombre: 'Caja',                                        tipo: 'ACTIVO',  naturaleza: 'DEUDORA',   padreKey: '10'  },
  { codigo: '1011', nombre: 'Caja General',                                tipo: 'ACTIVO',  naturaleza: 'DEUDORA',   padreKey: '101' },
  { codigo: '12',   nombre: 'Cuentas por Cobrar Comerciales - Terceros',   tipo: 'ACTIVO',  naturaleza: 'DEUDORA',   padreKey: null  },
  { codigo: '121',  nombre: 'Facturas, boletas y otros comprobantes por cobrar', tipo: 'ACTIVO', naturaleza: 'DEUDORA', padreKey: '12' },
  { codigo: '14',   nombre: 'Cuentas por Cobrar al Personal, Accionistas',  tipo: 'ACTIVO',  naturaleza: 'DEUDORA',   padreKey: null  },
  { codigo: '142',  nombre: 'Anticipos al Personal',                       tipo: 'ACTIVO',  naturaleza: 'DEUDORA',   padreKey: '14'  },
  { codigo: '1421', nombre: 'Anticipos a Conductores',                     tipo: 'ACTIVO',  naturaleza: 'DEUDORA',   padreKey: '142' },
  // Pasivo
  { codigo: '40',   nombre: 'Tributos por Pagar',                          tipo: 'PASIVO',  naturaleza: 'ACREEDORA', padreKey: null  },
  { codigo: '401',  nombre: 'Gobierno Central',                            tipo: 'PASIVO',  naturaleza: 'ACREEDORA', padreKey: '40'  },
  { codigo: '4011', nombre: 'IGV',                                         tipo: 'PASIVO',  naturaleza: 'ACREEDORA', padreKey: '401' },
  { codigo: '42',   nombre: 'Cuentas por Pagar Comerciales - Terceros',    tipo: 'PASIVO',  naturaleza: 'ACREEDORA', padreKey: null  },
  { codigo: '421',  nombre: 'Facturas, boletas y otros comprobantes por pagar', tipo: 'PASIVO', naturaleza: 'ACREEDORA', padreKey: '42' },
  // Ingreso
  { codigo: '70',   nombre: 'Ventas',                                      tipo: 'INGRESO', naturaleza: 'ACREEDORA', padreKey: null  },
  { codigo: '701',  nombre: 'Ingresos por Servicios de Transporte',        tipo: 'INGRESO', naturaleza: 'ACREEDORA', padreKey: '70'  },
  { codigo: '7011', nombre: 'Fletes Nacionales',                           tipo: 'INGRESO', naturaleza: 'ACREEDORA', padreKey: '701' },
  // Gasto
  { codigo: '62',   nombre: 'Gastos de Personal',                          tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: null  },
  { codigo: '621',  nombre: 'Sueldos y Salarios',                          tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: '62'  },
  { codigo: '63',   nombre: 'Gastos de Servicios Prestados por Terceros',  tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: null  },
  { codigo: '631',  nombre: 'Combustible',                                 tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: '63'  },
  { codigo: '634',  nombre: 'Mantenimiento y Reparaciones',                tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: '63'  },
  { codigo: '636',  nombre: 'Peajes y Otros Servicios de Viaje',           tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: '63'  },
  { codigo: '65',   nombre: 'Otros Gastos de Gestión',                     tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: null  },
  { codigo: '659',  nombre: 'Otros Gastos de Gestión Operativa',           tipo: 'GASTO',   naturaleza: 'DEUDORA',   padreKey: '65'  },
] as const;

// Mapeo clave-configuración → código de cuenta por defecto
const DEFAULT_CONFIG: Record<string, string> = {
  CAJA_PRINCIPAL:       '1011',
  CUENTAS_POR_COBRAR:   '121',
  ANTICIPO_CONDUCTORES: '1421',
  IGV_POR_PAGAR:        '4011',
  CUENTAS_POR_PAGAR:    '421',
  INGRESO_FLETE:        '7011',
  GASTO_VIATICOS:       '659',
  GASTO_COMBUSTIBLE:    '631',
  GASTO_MANTENIMIENTO:  '634',
  GASTO_PEAJES:         '636',
  GASTO_OTROS:          '659',
};

// ─── Mapeo Categorías → Cuentas Contables (MapeoContable) ────────────────────
// Conecta cada categoría operativa que ya existe en el sistema (TipoGasto,
// CategoriaDetalle de gastos rendidos en liquidaciones, e INGRESO de fletes)
// con una cuenta del plan PCGE. Se siembra automáticamente para que el
// usuario no tenga que configurar nada para el caso normal. Si en el futuro
// se agrega una categoría nueva al sistema y no aparece aquí, el diagnóstico
// la mostrará como "sin cuenta contable asignada" y el admin podrá asignarla
// desde esa misma pantalla.
export const DEFAULT_MAPEOS: { modulo: string; categoriaSlug: string; categoriaNombre: string; codigoCuenta: string }[] = [
  // ── GASTO (enum TipoGasto del modelo Gasto) ─────────────────────────────────
  { modulo: 'GASTO', categoriaSlug: 'COMBUSTIBLE',   categoriaNombre: 'Combustible',   codigoCuenta: '631' },
  { modulo: 'GASTO', categoriaSlug: 'MANTENIMIENTO', categoriaNombre: 'Mantenimiento', codigoCuenta: '634' },
  { modulo: 'GASTO', categoriaSlug: 'PEAJE',         categoriaNombre: 'Peaje',         codigoCuenta: '636' },
  // El PCGE no trae una cuenta específica para "viáticos" de conductores;
  // 621 (Sueldos y Salarios) es planilla de personal y no aplica aquí. Se
  // agrupa en 659 (Otros Gastos de Gestión Operativa), igual que en
  // LIQUIDACION_GASTO:VIATICO.
  { modulo: 'GASTO', categoriaSlug: 'VIATICOS',      categoriaNombre: 'Viáticos',      codigoCuenta: '659' },
  { modulo: 'GASTO', categoriaSlug: 'OTROS',         categoriaNombre: 'Otros Gastos',  codigoCuenta: '659' },

  // ── LIQUIDACION_GASTO (enum CategoriaDetalle, gastos rendidos por conductores) ──
  { modulo: 'LIQUIDACION_GASTO', categoriaSlug: 'PEAJE',   categoriaNombre: 'Peaje',   codigoCuenta: '636' },
  // Balanza (control de peso en ruta) es del mismo tipo que peajes.
  { modulo: 'LIQUIDACION_GASTO', categoriaSlug: 'BALANZA', categoriaNombre: 'Balanza', codigoCuenta: '636' },
  { modulo: 'LIQUIDACION_GASTO', categoriaSlug: 'VIATICO', categoriaNombre: 'Viático', codigoCuenta: '659' },
  // Toldo: gasto operativo menor (protección de carga), sin cuenta PCGE
  // propia → Otros Gastos de Gestión Operativa.
  { modulo: 'LIQUIDACION_GASTO', categoriaSlug: 'TOLDO',   categoriaNombre: 'Toldo',   codigoCuenta: '659' },
  { modulo: 'LIQUIDACION_GASTO', categoriaSlug: 'OTROS',   categoriaNombre: 'Otros',   codigoCuenta: '659' },

  // ── INGRESO ──────────────────────────────────────────────────────────────────
  // Hoy todo el ingreso facturado es por servicio de transporte (flete).
  { modulo: 'INGRESO', categoriaSlug: 'FLETE', categoriaNombre: 'Flete / Servicio de transporte', codigoCuenta: '7011' },
];

// ─── Servicio ─────────────────────────────────────────────────────────────────

class ContabilidadIntegration {
  // Asegura que existan las cuentas y configuración por defecto, y arma el
  // ConfigContable que necesita el motor (contabilidad.engine.ts).
  async ensureSetup(): Promise<ConfigContable> {
    const count = await prisma.cuentaContable.count();
    if (count === 0) {
      await this._seedDefaultAccounts();
    }
    if (await prisma.mapeoContable.count() === 0) {
      await this._seedDefaultMapeos();
    }
    return this._buildConfigContable();
  }

  private async _seedDefaultAccounts() {
    const cuentaIds: Record<string, string> = {};
    for (const c of DEFAULT_CUENTAS) {
      const padreId = c.padreKey ? (cuentaIds[c.padreKey] ?? null) : null;
      const cuenta = await prisma.cuentaContable.upsert({
        where: { codigo: c.codigo },
        create: {
          codigo: c.codigo,
          nombre: c.nombre,
          tipo: c.tipo as any,
          naturaleza: c.naturaleza as any,
          activa: true,
          ...(padreId ? { padreId } : {}),
        },
        update: {},
      });
      cuentaIds[c.codigo] = cuenta.id;
    }
    // Crear configuración por defecto
    for (const [clave, codigo] of Object.entries(DEFAULT_CONFIG)) {
      const cuentaId = cuentaIds[codigo];
      if (!cuentaId) continue;
      await prisma.configuracionContable.upsert({
        where: { clave },
        create: { clave, cuentaId },
        update: {},
      });
    }
    console.log('[Contabilidad] Plan de cuentas PCGE y configuración por defecto creados');
  }

  // Siembra el mapeo Categorías → Cuentas Contables (MapeoContable) usando
  // las cuentas del plan PCGE ya sembrado. Es idempotente (upsert por
  // modulo+categoriaSlug) y solo se ejecuta si la tabla está vacía, para no
  // pisar mapeos que el admin haya reasignado manualmente.
  private async _seedDefaultMapeos() {
    const codigos = Array.from(new Set(DEFAULT_MAPEOS.map((m) => m.codigoCuenta)));
    const cuentas = await prisma.cuentaContable.findMany({ where: { codigo: { in: codigos } } });
    const cuentaIdPorCodigo = new Map(cuentas.map((c) => [c.codigo, c.id]));

    for (const m of DEFAULT_MAPEOS) {
      const cuentaContableId = cuentaIdPorCodigo.get(m.codigoCuenta);
      if (!cuentaContableId) continue;
      await prisma.mapeoContable.upsert({
        where: { modulo_categoriaSlug: { modulo: m.modulo, categoriaSlug: m.categoriaSlug } },
        create: {
          modulo: m.modulo,
          categoriaSlug: m.categoriaSlug,
          categoriaNombre: m.categoriaNombre,
          cuentaContableId,
        },
        update: {},
      });
    }
    console.log('[Contabilidad] Mapeo Categorías → Cuentas Contables sembrado');
  }

  // Construye el ConfigContable (cuentas resueltas) que usa el motor.
  private async _buildConfigContable(): Promise<ConfigContable> {
    const configs = await prisma.configuracionContable.findMany();
    const cuentaIds = Array.from(new Set(configs.map((c) => c.cuentaId)));
    const cuentas = cuentaIds.length
      ? await prisma.cuentaContable.findMany({ where: { id: { in: cuentaIds } } })
      : [];
    const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]));

    const toCuentaRef = (cuenta: { id: string; codigo: string; nombre: string; tipo: string; naturaleza: string }): CuentaRef => ({
      id: cuenta.id,
      codigo: cuenta.codigo,
      nombre: cuenta.nombre,
      tipo: cuenta.tipo as any,
      naturaleza: cuenta.naturaleza as any,
    });

    const claveACuenta: Record<string, CuentaRef | undefined> = {};
    for (const c of configs) {
      const cuenta = cuentasPorId.get(c.cuentaId);
      if (!cuenta) continue;
      claveACuenta[c.clave] = toCuentaRef(cuenta);
    }

    // Mapeo Categorías → Cuentas (MapeoContable), clave `${modulo}:${categoriaSlug}`
    // para evitar colisiones entre módulos que comparten el mismo slug
    // (ej. PEAJE existe tanto en GASTO como en LIQUIDACION_GASTO).
    const mapeos = await prisma.mapeoContable.findMany({ include: { cuenta: true } });
    const gastosPorCategoria: Record<string, CuentaRef | undefined> = {};
    let ingresoFlete: CuentaRef | undefined;
    for (const m of mapeos) {
      const ref = toCuentaRef(m.cuenta);
      if (m.modulo === 'INGRESO' && m.categoriaSlug === 'FLETE') {
        ingresoFlete = ref;
      } else {
        gastosPorCategoria[`${m.modulo}:${m.categoriaSlug}`] = ref;
      }
    }

    return {
      caja: claveACuenta['CAJA_PRINCIPAL'],
      cuentasPorCobrar: claveACuenta['CUENTAS_POR_COBRAR'],
      anticipoConductores: claveACuenta['ANTICIPO_CONDUCTORES'],
      cuentasPorPagar: claveACuenta['CUENTAS_POR_PAGAR'],
      igvPorPagar: claveACuenta['IGV_POR_PAGAR'],
      // Fallback a ConfiguracionContable.INGRESO_FLETE por compatibilidad
      // con instalaciones que ya tenían esa clave configurada manualmente.
      ingresoFletes: ingresoFlete ?? claveACuenta['INGRESO_FLETE'],
      gastosPorCategoria,
      gastoOtros: gastosPorCategoria['GASTO:OTROS'] ?? claveACuenta['GASTO_OTROS'],
    };
  }

  // Crea el AsientoContable a partir de un AsientoInput del motor, validando
  // que cuadre antes de persistirlo.
  private async _crearAsiento(input: AsientoInput, tipo: 'AUTOMATICO' | 'MANUAL' = 'AUTOMATICO') {
    const validacion = contabilidadEngine.validarAsiento(input.lineas);
    if (!validacion.valido) {
      throw new Error(`Asiento ${input.referencia ?? ''} no cuadra: ${validacion.mensaje}`);
    }

    return prisma.asientoContable.create({
      data: {
        fecha: input.fecha,
        descripcion: input.descripcion,
        referencia: input.referencia,
        tipo,
        origenTipo: input.origenTipo,
        origenId: input.origenId,
        lineas: {
          create: input.lineas.map((l) => ({
            cuentaId: l.cuentaId,
            descripcion: l.descripcion,
            debe: l.debe,
            haber: l.haber,
          })),
        },
      },
    });
  }

  // Marca un AsientoPendiente como resuelto si existía uno previo para este origen.
  private async _resolverPendiente(origenTipo: string, origenId: string) {
    await prisma.asientoPendiente.updateMany({
      where: { origenTipo, origenId, resuelto: false },
      data: { resuelto: true, resueltoEn: new Date() },
    });
  }

  // Registra (o actualiza) un AsientoPendiente cuando faltan cuentas configuradas.
  private async _registrarPendiente(origenTipo: string, origenId: string, error: CuentaFaltanteError) {
    await prisma.asientoPendiente.upsert({
      where: { origenTipo_origenId: { origenTipo, origenId } },
      create: {
        origenTipo,
        origenId,
        motivo: error.message,
        cuentasFaltantes: error.claves,
      },
      update: {
        motivo: error.message,
        cuentasFaltantes: error.claves,
        resuelto: false,
        resueltoEn: null,
      },
    });
    console.warn(`[Contabilidad] Asiento pendiente (${origenTipo} ${origenId}): ${error.message}`);
  }

  private async _existeAsiento(referencia: string): Promise<boolean> {
    const existe = await prisma.asientoContable.findFirst({ where: { referencia } });
    return !!existe;
  }

  // ── Registrar gasto operativo ────────────────────────────────────────────────
  async registrarGasto(data: {
    id: number;
    tipoGasto: string;
    monto: number;
    descripcion: string;
    fecha: Date;
  }) {
    const origenTipo = 'GASTO';
    const origenId = String(data.id);
    try {
      const config = await this.ensureSetup();
      if (await this._existeAsiento(`GASTO-${data.id}`)) return;

      const gastoCuenta = config.gastosPorCategoria[`GASTO:${data.tipoGasto}`] ?? config.gastoOtros;
      const faltantes: string[] = [];
      if (!gastoCuenta) faltantes.push(`MAPEO_GASTO_${data.tipoGasto}`);
      if (!config.caja) faltantes.push('CAJA_PRINCIPAL');
      if (faltantes.length > 0) {
        throw new CuentaFaltanteError(faltantes, `No se puede registrar el gasto #${data.id}: falta configurar ${faltantes.join(', ')}.`);
      }

      await this._crearAsiento({
        fecha: data.fecha,
        descripcion: `Gasto ${data.tipoGasto} — ${data.descripcion}`,
        referencia: `GASTO-${data.id}`,
        origenTipo: 'GASTO',
        origenId: String(data.id),
        lineas: [
          { cuentaId: gastoCuenta!.id, descripcion: data.descripcion, debe: data.monto, haber: 0 },
          { cuentaId: config.caja!.id, descripcion: 'Pago gasto', debe: 0, haber: data.monto },
        ],
      });
      await this._resolverPendiente(origenTipo, origenId);
    } catch (e) {
      if (e instanceof CuentaFaltanteError) {
        await this._registrarPendiente(origenTipo, origenId, e);
      } else {
        console.error('[Contabilidad] registrarGasto error:', e);
      }
    }
  }

  // ── Registrar factura emitida ────────────────────────────────────────────────
  async registrarFactura(data: {
    id: number;
    numeroFactura: string;
    total: number;
    subtotal: number;
    igv: number;
    fechaEmision: Date;
  }) {
    const origenTipo = 'FACTURA';
    const origenId = String(data.id);
    try {
      const config = await this.ensureSetup();
      if (await this._existeAsiento(`FACTURA-${data.id}`)) return;

      const asiento = contabilidadEngine.generarAsientoIngreso({
        id: data.id,
        numeroFactura: data.numeroFactura,
        total: data.total,
        subtotal: data.subtotal,
        igv: data.igv,
        fecha: data.fechaEmision,
      }, config);

      await this._crearAsiento(asiento);
      await this._resolverPendiente(origenTipo, origenId);
    } catch (e) {
      if (e instanceof CuentaFaltanteError) {
        await this._registrarPendiente(origenTipo, origenId, e);
      } else {
        console.error('[Contabilidad] registrarFactura error:', e);
      }
    }
  }

  // ── Registrar pago de anticipo de liquidación (CREADA→PAGADA) ───────────────
  async registrarPagoLiquidacion(data: {
    id: number;
    conductorNombre: string;
    montoPagado: number;
    fecha: Date;
  }) {
    const origenTipo = 'LIQUIDACION_PAGO';
    const origenId = String(data.id);
    try {
      const config = await this.ensureSetup();
      if (await this._existeAsiento(`LIQ-${data.id}-PAGO`)) return;

      const asiento = contabilidadEngine.generarAsientoPago({
        id: data.id,
        conductorNombre: data.conductorNombre,
        montoPagado: data.montoPagado,
        fecha: data.fecha,
      }, config);

      await this._crearAsiento(asiento);
      await this._resolverPendiente(origenTipo, origenId);
    } catch (e) {
      if (e instanceof CuentaFaltanteError) {
        await this._registrarPendiente(origenTipo, origenId, e);
      } else {
        console.error('[Contabilidad] registrarPagoLiquidacion error:', e);
      }
    }
  }

  // ── Registrar rendición de gastos (PAGADA→RENDIDA) ───────────────────────────
  async registrarRendicionLiquidacion(data: {
    id: number;
    conductorNombre: string;
    fecha: Date;
    gastos: { categoria: string; descripcion: string; monto: number }[];
  }) {
    const origenTipo = 'LIQUIDACION_RENDICION';
    const origenId = String(data.id);
    try {
      const config = await this.ensureSetup();
      if (await this._existeAsiento(`LIQ-${data.id}-RENDICION`)) return;
      if (data.gastos.length === 0) return;

      const asiento = contabilidadEngine.generarAsientoRendicion({
        id: data.id,
        conductorNombre: data.conductorNombre,
        fecha: data.fecha,
        gastos: data.gastos,
      }, config);

      await this._crearAsiento(asiento);
      await this._resolverPendiente(origenTipo, origenId);
    } catch (e) {
      if (e instanceof CuentaFaltanteError) {
        await this._registrarPendiente(origenTipo, origenId, e);
      } else {
        console.error('[Contabilidad] registrarRendicionLiquidacion error:', e);
      }
    }
  }

  // ── Registrar devolución/reintegro de cierre (RENDIDA→CERRADA) ───────────────
  async registrarCierreLiquidacion(data: {
    id: number;
    conductorNombre: string;
    montoPagado: number;
    montoRendido: number;
    devolucion: number;
    reintegro: number;
    fecha: Date;
  }) {
    if (data.devolucion > 0.005) {
      await this._registrarAjusteCierre(data, 'DEVOLUCION', data.devolucion);
    } else if (data.reintegro > 0.005) {
      await this._registrarAjusteCierre(data, 'REINTEGRO', data.reintegro);
    }
  }

  private async _registrarAjusteCierre(
    data: { id: number; conductorNombre: string; fecha: Date },
    tipo: 'DEVOLUCION' | 'REINTEGRO',
    monto: number,
  ) {
    const origenTipo = tipo === 'DEVOLUCION' ? 'LIQUIDACION_DEVOLUCION' : 'LIQUIDACION_REINTEGRO';
    const origenId = String(data.id);
    try {
      const config = await this.ensureSetup();
      if (await this._existeAsiento(`LIQ-${data.id}-${tipo}`)) return;

      const asiento = tipo === 'DEVOLUCION'
        ? contabilidadEngine.generarAsientoDevolucion({ id: data.id, conductorNombre: data.conductorNombre, fecha: data.fecha, monto }, config)
        : contabilidadEngine.generarAsientoReintegro({ id: data.id, conductorNombre: data.conductorNombre, fecha: data.fecha, monto }, config);

      await this._crearAsiento(asiento);
      await this._resolverPendiente(origenTipo, origenId);
    } catch (e) {
      if (e instanceof CuentaFaltanteError) {
        await this._registrarPendiente(origenTipo, origenId, e);
      } else {
        console.error(`[Contabilidad] registrarCierreLiquidacion (${tipo}) error:`, e);
      }
    }
  }

  // ── Backfill: sincronizar registros históricos y reintentar pendientes ──────
  // Llama a esto desde el endpoint POST /api/contabilidad/sync para procesar
  // datos que existían antes de instalar la integración, o que quedaron
  // pendientes por configuración incompleta.
  async syncHistorico() {
    await this.ensureSetup();
    let creados = 0;

    // Gastos
    const gastos = await prisma.gasto.findMany({ orderBy: { fecha: 'asc' } });
    for (const g of gastos) {
      const tiene = await this._existeAsiento(`GASTO-${g.id}`);
      if (!tiene) {
        await this.registrarGasto({
          id: g.id,
          tipoGasto: g.tipoGasto,
          monto: Number(g.monto),
          descripcion: g.descripcion,
          fecha: g.fecha,
        });
        if (await this._existeAsiento(`GASTO-${g.id}`)) creados++;
      }
    }

    // Facturas
    const facturas = await prisma.factura.findMany({
      where: { estado: { not: 'ANULADA' } },
      orderBy: { fechaEmision: 'asc' },
    });
    for (const f of facturas) {
      const tiene = await this._existeAsiento(`FACTURA-${f.id}`);
      if (!tiene) {
        await this.registrarFactura({
          id: f.id,
          numeroFactura: f.numeroFactura,
          total: Number(f.total),
          subtotal: Number(f.subtotal),
          igv: Number(f.igv),
          fechaEmision: f.fechaEmision,
        });
        if (await this._existeAsiento(`FACTURA-${f.id}`)) creados++;
      }
    }

    // Liquidaciones: pago, rendición y ajuste de cierre
    const liqs = await prisma.liquidacion.findMany({
      where: { estado: { in: ['PAGADA', 'RENDIDA', 'CERRADA'] } },
      include: { conductor: { select: { nombre: true } }, detalles: true },
      orderBy: { fecha: 'asc' },
    });
    for (const liq of liqs) {
      if (!(await this._existeAsiento(`LIQ-${liq.id}-PAGO`))) {
        await this.registrarPagoLiquidacion({
          id: liq.id,
          conductorNombre: liq.conductor.nombre,
          montoPagado: Number(liq.montoPagado ?? liq.montoEntregado),
          fecha: liq.fechaPago ?? liq.fecha,
        });
        if (await this._existeAsiento(`LIQ-${liq.id}-PAGO`)) creados++;
      }

      if ((liq.estado === 'RENDIDA' || liq.estado === 'CERRADA') && liq.detalles.length > 0) {
        if (!(await this._existeAsiento(`LIQ-${liq.id}-RENDICION`))) {
          await this.registrarRendicionLiquidacion({
            id: liq.id,
            conductorNombre: liq.conductor.nombre,
            fecha: liq.fechaRendicion ?? liq.fecha,
            gastos: liq.detalles.map((d) => ({ categoria: d.categoria, descripcion: d.descripcion, monto: Number(d.monto) })),
          });
          if (await this._existeAsiento(`LIQ-${liq.id}-RENDICION`)) creados++;
        }
      }

      if (liq.estado === 'CERRADA') {
        const devolucion = Number(liq.devolucion);
        const reintegro = Number(liq.reintegro);
        const ref = devolucion > 0.005 ? `LIQ-${liq.id}-DEVOLUCION` : reintegro > 0.005 ? `LIQ-${liq.id}-REINTEGRO` : null;
        if (ref && !(await this._existeAsiento(ref))) {
          await this.registrarCierreLiquidacion({
            id: liq.id,
            conductorNombre: liq.conductor.nombre,
            montoPagado: Number(liq.montoPagado ?? liq.montoEntregado),
            montoRendido: Number(liq.montoRendido ?? liq.totalGastos),
            devolucion,
            reintegro,
            fecha: liq.fechaCierre ?? liq.fecha,
          });
          if (await this._existeAsiento(ref)) creados++;
        }
      }
    }

    return { creados };
  }
}

export const contabilidadIntegration = new ContabilidadIntegration();
