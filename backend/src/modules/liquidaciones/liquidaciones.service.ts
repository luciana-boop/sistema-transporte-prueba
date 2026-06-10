// FILE: src/modules/liquidaciones/liquidaciones.service.ts
// FLUJO v4: CREADA → PAGADA → RENDIDA → CERRADA
//
//   1. create()   → estado CREADA  (monto entregado registrado, aún no pagado)
//   2. pagar()    → CREADA→PAGADA  (conductor recibió pago; egreso en caja)
//   3. rendir()   → PAGADA→RENDIDA (gastos rendidos post-pago)
//   4. cerrar()   → RENDIDA→CERRADA (devolución o reintegro calculado y registrado)
//
// Compatibilidad con estados legacy: PENDIENTE_RENDICION / PENDIENTE se tratan
// como CREADA en las transiciones de pago.

import prisma from '../../prisma/client';
import { contabilidadIntegration } from '../contabilidad/contabilidad.integration';

export interface DetalleDto {
  categoria: 'PEAJE' | 'BALANZA' | 'VIATICO' | 'TOLDO' | 'OTROS';
  descripcion: string;
  monto: number;
}

export interface CreateLiquidacionDto {
  conductorId: number;
  placaTracto: string;
  placaCarreta?: string;
  montoEntregado: number;
  reciboAnticipo?: string;
  fecha: string;
  guiaReferencia?: string;
  observaciones?: string;
  toldo?: number;
  detalles?: DetalleDto[];
  pedidoIds?: number[];
}

export interface PagarLiquidacionDto {
  liquidacionId: number;
  cajaId: number;
  montoPagado?: number;
  fechaPago?: string;
}

export interface RendirLiquidacionDto {
  detalles: DetalleDto[];
  observaciones?: string;
}

export interface CerrarLiquidacionDto {
  liquidacionId: number;
  cajaId: number;
  fecha?: string;
}

export interface RegistrarMovimientoLiquidacionDto {
  liquidacionId: number;
  cajaId: number;
  monto: number;
  concepto?: string;
  observaciones?: string;
}

const ESTADOS_NO_PAGADOS = ['CREADA', 'PENDIENTE_RENDICION', 'PENDIENTE'];

const LIQUIDACION_INCLUDE = {
  conductor: { select: { id: true, nombre: true } },
  detalles: true,
  pedidos: {
    include: {
      pedido: {
        select: {
          id: true,
          origen: true,
          destino: true,
          estado: true,
          cliente: { select: { id: true, razonSocial: true } },
        },
      },
    },
  },
} as const;

export class LiquidacionesService {

  private async validarPedidosDisponibles(
    pedidoIds: number[],
    excludeLiquidacionId?: number,
  ): Promise<void> {
    if (!pedidoIds.length) return;

    const uniqueIds = new Set(pedidoIds);
    if (uniqueIds.size !== pedidoIds.length) {
      throw new Error('No se pueden agregar pedidos duplicados en la misma liquidación');
    }

    const pedidos = await prisma.pedido.findMany({
      where: { id: { in: pedidoIds } },
      select: { id: true, estado: true },
    });

    if (pedidos.length !== pedidoIds.length) {
      const encontrados = new Set(pedidos.map((p) => p.id));
      const faltantes = pedidoIds.filter((id) => !encontrados.has(id));
      throw new Error(`Pedido(s) no encontrado(s): ${faltantes.join(', ')}`);
    }

    const yaAsignados = await prisma.liquidacionPedido.findMany({
      where: {
        pedidoId: { in: pedidoIds },
        ...(excludeLiquidacionId
          ? { liquidacionId: { not: excludeLiquidacionId } }
          : {}),
      },
      select: { pedidoId: true, liquidacionId: true },
    });

    if (yaAsignados.length > 0) {
      const detalles = yaAsignados
        .map((r) => `Pedido #${r.pedidoId} (liquidación #${r.liquidacionId})`)
        .join(', ');
      throw new Error(`Los siguientes pedidos ya están asignados a otra liquidación: ${detalles}`);
    }
  }

  async findAll(query: { conductorId?: string; desde?: string; hasta?: string; sinCombustible?: string }) {
    const where: any = {};
    if (query.conductorId) where.conductorId = parseInt(query.conductorId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
    if (query.sinCombustible === 'true') where.combustibles = { none: {} };
    return prisma.liquidacion.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: LIQUIDACION_INCLUDE,
    });
  }

  async findById(id: number) {
    const liq = await prisma.liquidacion.findUnique({
      where: { id },
      include: LIQUIDACION_INCLUDE,
    });
    if (!liq) throw new Error('Liquidación no encontrada');
    return liq;
  }

  async findPedidosDisponibles() {
    return prisma.pedido.findMany({
      where: {
        estado: 'ACTIVO',
        liquidaciones: { none: {} },
      },
      orderBy: { fechaPedido: 'desc' },
      select: {
        id: true,
        origen: true,
        destino: true,
        tipoCarga: true,
        tarifa: true,
        fechaPedido: true,
        estado: true,
        cliente: { select: { id: true, razonSocial: true } },
      },
    });
  }

  async getCajasAbiertas() {
    const cajas = await prisma.caja.findMany({
      where: { estado: 'ABIERTA' },
      orderBy: { aperturaEn: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true } },
        movimientos: { where: { anulado: false } },
      },
    });

    return cajas.map((caja: any) => {
      const ingresos = caja.movimientos
        .filter((m: any) => m.tipo === 'INGRESO')
        .reduce((s: number, m: any) => s + Number(m.monto), 0);
      const egresos = caja.movimientos
        .filter((m: any) => m.tipo === 'EGRESO')
        .reduce((s: number, m: any) => s + Number(m.monto), 0);
      const saldoActual = Number(caja.saldoApertura) + ingresos - egresos;
      const { movimientos: _m, ...rest } = caja;
      return { ...rest, saldoActual };
    });
  }

  // ── PASO 1: crear liquidación → estado CREADA ────────────────────────────────
  async create(dto: CreateLiquidacionDto) {
    const conductor = await prisma.conductor.findUnique({ where: { id: dto.conductorId } });
    if (!conductor) throw new Error('Conductor no encontrado');

    const pedidoIds = dto.pedidoIds ?? [];
    await this.validarPedidosDisponibles(pedidoIds);

    return prisma.liquidacion.create({
      data: {
        conductorId: dto.conductorId,
        placaTracto: dto.placaTracto,
        placaCarreta: dto.placaCarreta,
        montoEntregado: dto.montoEntregado,
        reciboAnticipo: dto.reciboAnticipo,
        fecha: new Date(dto.fecha),
        guiaReferencia: dto.guiaReferencia,
        observaciones: dto.observaciones,
        toldo: 0,
        totalGastos: 0,
        devolucion: 0,
        reintegro: 0,
        estado: 'CREADA',
        pedidos: pedidoIds.length
          ? { create: pedidoIds.map((pedidoId) => ({ pedidoId })) }
          : undefined,
      },
      include: LIQUIDACION_INCLUDE,
    });
  }

  // ── PASO 2: pagar → CREADA→PAGADA (egreso en caja) ──────────────────────────
  async pagar(dto: PagarLiquidacionDto, usuarioId: number) {
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: dto.liquidacionId },
      include: { conductor: { select: { nombre: true } } },
    });
    if (!liquidacion) throw new Error('Liquidación no encontrada');

    if (!ESTADOS_NO_PAGADOS.includes(liquidacion.estado)) {
      if (liquidacion.estado === 'PAGADA') throw new Error('La liquidación ya fue pagada');
      if (liquidacion.estado === 'RENDIDA') throw new Error('La liquidación ya fue pagada y rendida');
      if (liquidacion.estado === 'CERRADA') throw new Error('La liquidación ya está cerrada');
    }

    const caja = await prisma.caja.findUnique({ where: { id: dto.cajaId } });
    if (!caja) throw new Error('Caja no encontrada');
    if (caja.estado !== 'ABIERTA') throw new Error('La caja seleccionada está cerrada');

    const montoPagado = dto.montoPagado ?? Number(liquidacion.montoEntregado);
    if (montoPagado <= 0) throw new Error('El monto de pago debe ser mayor a 0');

    const fechaPago = dto.fechaPago ? new Date(dto.fechaPago) : new Date();
    const concepto = `Pago liquidación — ${liquidacion.conductor.nombre}`;
    const referencia = `LIQUIDACION-${dto.liquidacionId}`;

    const updated = await prisma.$transaction(async (tx: any) => {
      await tx.movimientoCaja.create({
        data: {
          cajaId: dto.cajaId,
          tipo: 'EGRESO',
          monto: montoPagado,
          concepto,
          referencia,
          fecha: fechaPago,
        },
      });

      return tx.liquidacion.update({
        where: { id: dto.liquidacionId },
        data: {
          estado: 'PAGADA',
          montoPagado,
          fechaPago,
        },
        include: LIQUIDACION_INCLUDE,
      });
    });

    // Asiento contable automático (fire-and-forget)
    contabilidadIntegration.registrarPagoLiquidacion({
      id: dto.liquidacionId,
      conductorNombre: liquidacion.conductor.nombre,
      montoPagado,
      fecha: fechaPago,
    });

    return updated;
  }

  // ── PASO 3: rendir → PAGADA→RENDIDA (gastos reales post-pago) ───────────────
  async rendir(id: number, dto: RendirLiquidacionDto) {
    const liq = await this.findById(id);

    if (liq.estado !== 'PAGADA') {
      if (ESTADOS_NO_PAGADOS.includes(liq.estado)) {
        throw new Error('Debe pagar la liquidación antes de rendir los gastos');
      }
      if (liq.estado === 'RENDIDA') throw new Error('Los gastos de esta liquidación ya fueron rendidos');
      if (liq.estado === 'CERRADA') throw new Error('La liquidación está cerrada');
    }
    if (!dto.detalles || dto.detalles.length === 0) {
      throw new Error('Debe registrar al menos un gasto para rendir la liquidación');
    }

    const totalGastos = dto.detalles.reduce((s, d) => s + d.monto, 0);
    const fechaRendicion = new Date();

    const updated = await prisma.$transaction(async (tx: any) => {
      await tx.liquidacionDetalle.deleteMany({ where: { liquidacionId: id } });

      return tx.liquidacion.update({
        where: { id },
        data: {
          totalGastos,
          montoRendido: totalGastos,
          fechaRendicion,
          estado: 'RENDIDA',
          ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
          detalles: {
            create: dto.detalles.map((d) => ({
              categoria: d.categoria as any,
              descripcion: d.descripcion,
              monto: d.monto,
            })),
          },
        },
        include: LIQUIDACION_INCLUDE,
      });
    });

    // Asiento contable automático (fire-and-forget)
    contabilidadIntegration.registrarRendicionLiquidacion({
      id,
      conductorNombre: liq.conductor.nombre,
      fecha: fechaRendicion,
      gastos: dto.detalles.map((d) => ({ categoria: d.categoria, descripcion: d.descripcion, monto: d.monto })),
    });

    return updated;
  }

  // ── PASO 4: cerrar → RENDIDA→CERRADA (devolución o reintegro) ───────────────
  async cerrar(dto: CerrarLiquidacionDto, usuarioId: number) {
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: dto.liquidacionId },
      include: { conductor: { select: { nombre: true } } },
    });
    if (!liquidacion) throw new Error('Liquidación no encontrada');
    if (liquidacion.estado !== 'RENDIDA') {
      if (liquidacion.estado === 'CERRADA') throw new Error('La liquidación ya está cerrada');
      throw new Error('Debe rendir los gastos antes de cerrar la liquidación');
    }

    const caja = await prisma.caja.findUnique({ where: { id: dto.cajaId } });
    if (!caja) throw new Error('Caja no encontrada');
    if (caja.estado !== 'ABIERTA') throw new Error('La caja seleccionada está cerrada');

    const montoPagado = Number(liquidacion.montoPagado ?? liquidacion.montoEntregado);
    const montoRendido = Number(liquidacion.montoRendido ?? liquidacion.totalGastos);
    const diferencia = montoPagado - montoRendido;

    const devolucion = diferencia > 0 ? diferencia : 0;
    const reintegro = diferencia < 0 ? Math.abs(diferencia) : 0;
    const montoDevolucion = diferencia; // positivo=devolución, negativo=reintegro
    const tipoAjuste = diferencia > 0 ? 'DEVOLUCION' : diferencia < 0 ? 'REINTEGRO' : null;
    const fechaCierre = dto.fecha ? new Date(dto.fecha) : new Date();

    const closed = await prisma.$transaction(async (tx: any) => {
      // Solo crear movimiento de caja si hay diferencia
      if (Math.abs(diferencia) > 0.005) {
        if (diferencia > 0) {
          // Devolución: conductor devuelve dinero → INGRESO en caja
          await tx.movimientoCaja.create({
            data: {
              cajaId: dto.cajaId,
              tipo: 'INGRESO',
              monto: devolucion,
              concepto: `Devolución liquidación — ${liquidacion.conductor.nombre}`,
              referencia: `DEVOLUCION-LIQ-${dto.liquidacionId}`,
              fecha: fechaCierre,
            },
          });
        } else {
          // Reintegro: empresa paga adicional al conductor → EGRESO en caja
          await tx.movimientoCaja.create({
            data: {
              cajaId: dto.cajaId,
              tipo: 'EGRESO',
              monto: reintegro,
              concepto: `Reintegro liquidación — ${liquidacion.conductor.nombre}`,
              referencia: `REINTEGRO-LIQ-${dto.liquidacionId}`,
              fecha: fechaCierre,
            },
          });
        }
      }

      return tx.liquidacion.update({
        where: { id: dto.liquidacionId },
        data: {
          estado: 'CERRADA',
          devolucion,
          reintegro,
          montoDevolucion,
          tipoAjuste,
          fechaCierre,
        },
        include: LIQUIDACION_INCLUDE,
      });
    });

    // Asiento contable automático (fire-and-forget)
    contabilidadIntegration.registrarCierreLiquidacion({
      id: dto.liquidacionId,
      conductorNombre: liquidacion.conductor.nombre,
      montoPagado,
      montoRendido,
      devolucion,
      reintegro,
      fecha: fechaCierre,
    });

    return closed;
  }

  // ── historial financiero ─────────────────────────────────────────────────────
  async getHistorialFinanciero(liquidacionId: number) {
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      include: { conductor: { select: { nombre: true } } },
    });
    if (!liquidacion) throw new Error('Liquidación no encontrada');

    const movimientos = await prisma.movimientoCaja.findMany({
      where: {
        referencia: {
          in: [
            `LIQUIDACION-${liquidacionId}`,
            `REINTEGRO-LIQ-${liquidacionId}`,
            `DEVOLUCION-LIQ-${liquidacionId}`,
          ],
        },
        anulado: false,
      },
      orderBy: { fecha: 'asc' },
      include: { caja: { select: { id: true, nombre: true } } },
    });

    return {
      liquidacion: {
        id: liquidacion.id,
        estado: liquidacion.estado,
        montoEntregado: Number(liquidacion.montoEntregado),
        montoPagado: liquidacion.montoPagado ? Number(liquidacion.montoPagado) : null,
        totalGastos: Number(liquidacion.totalGastos),
        montoRendido: liquidacion.montoRendido ? Number(liquidacion.montoRendido) : null,
        reintegro: Number(liquidacion.reintegro),
        devolucion: Number(liquidacion.devolucion),
        tipoAjuste: liquidacion.tipoAjuste,
        conductor: liquidacion.conductor,
      },
      movimientos: movimientos.map((m: any) => ({
        id: m.id,
        tipo: m.tipo,
        monto: Number(m.monto),
        concepto: m.concepto,
        referencia: m.referencia,
        fecha: m.fecha,
        caja: m.caja,
      })),
    };
  }

  async update(id: number, dto: Partial<CreateLiquidacionDto>) {
    const liq = await this.findById(id);
    if (!ESTADOS_NO_PAGADOS.includes(liq.estado) && liq.estado !== 'CREADA') {
      throw new Error('No se puede editar una liquidación que ya fue pagada');
    }

    const pedidoIds = dto.pedidoIds;

    if (pedidoIds !== undefined) {
      await this.validarPedidosDisponibles(pedidoIds, id);

      return prisma.$transaction(async (tx) => {
        await tx.liquidacionPedido.deleteMany({ where: { liquidacionId: id } });

        return tx.liquidacion.update({
          where: { id },
          data: {
            ...(dto.conductorId !== undefined && { conductorId: dto.conductorId }),
            ...(dto.placaTracto !== undefined && { placaTracto: dto.placaTracto }),
            ...(dto.placaCarreta !== undefined && { placaCarreta: dto.placaCarreta }),
            ...(dto.montoEntregado !== undefined && { montoEntregado: dto.montoEntregado }),
            ...(dto.reciboAnticipo !== undefined && { reciboAnticipo: dto.reciboAnticipo }),
            ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
            ...(dto.guiaReferencia !== undefined && { guiaReferencia: dto.guiaReferencia }),
            ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
            pedidos: pedidoIds.length
              ? { create: pedidoIds.map((pedidoId) => ({ pedidoId })) }
              : undefined,
          },
          include: LIQUIDACION_INCLUDE,
        });
      });
    }

    return prisma.liquidacion.update({
      where: { id },
      data: {
        ...(dto.conductorId !== undefined && { conductorId: dto.conductorId }),
        ...(dto.placaTracto !== undefined && { placaTracto: dto.placaTracto }),
        ...(dto.placaCarreta !== undefined && { placaCarreta: dto.placaCarreta }),
        ...(dto.montoEntregado !== undefined && { montoEntregado: dto.montoEntregado }),
        ...(dto.reciboAnticipo !== undefined && { reciboAnticipo: dto.reciboAnticipo }),
        ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
        ...(dto.guiaReferencia !== undefined && { guiaReferencia: dto.guiaReferencia }),
        ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
      },
      include: LIQUIDACION_INCLUDE,
    });
  }

  async remove(id: number) {
    const liq = await this.findById(id);
    if (!ESTADOS_NO_PAGADOS.includes(liq.estado) && liq.estado !== 'CREADA') {
      throw new Error('No se puede eliminar una liquidación que ya fue pagada');
    }
    return prisma.liquidacion.delete({ where: { id } });
  }
}

export const liquidacionesService = new LiquidacionesService();
