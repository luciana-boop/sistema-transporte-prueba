// FILE: src/modules/liquidaciones/liquidaciones.service.ts
// CAMBIOS v2 (P3):
//   - pagarLiquidacion(): pago total desde caja abierta (NO cuentas bancarias)
//   - registrarReintegro(): la empresa entrega dinero adicional al conductor (egreso en caja)
//   - registrarDevolucion(): el conductor devuelve dinero sobrante a la empresa (ingreso en caja)
//   - getHistorialFinanciero(): movimientos financieros de una liquidación
//   - getEstados(): devuelve cajas abiertas disponibles para pago
//
// REGLA CLAVE: Al registrar el pago, SOLO se aceptan cajas abiertas (no cuentas bancarias).
// NO se permiten pagos parciales. El monto siempre es montoEntregado.
//
// FLUJO:
//   1. Liquidación creada → estado PENDIENTE
//   2. Se paga completamente → estado PAGADA (egreso en caja)
//   3. Opcionalmente: reintegro (el conductor gastó más de lo entregado → la empresa
//                                le entrega el faltante → EGRESO en caja)
//                    devolución (al conductor le sobró dinero → lo devuelve a la
//                                empresa → INGRESO en caja)

import prisma from '../../prisma/client';

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
  detalles: DetalleDto[];
  pedidoIds?: number[];
}

export interface PagarLiquidacionDto {
  liquidacionId: number;
  cajaId: number;          // ID de la caja abierta (NO cuenta bancaria)
  observaciones?: string;
}

export interface RegistrarMovimientoLiquidacionDto {
  liquidacionId: number;
  cajaId: number;
  monto: number;
  concepto?: string;
  observaciones?: string;
}

// Include reutilizable para queries de liquidación
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

  async findAll(query: { conductorId?: string; desde?: string; hasta?: string }) {
    const where: any = {};
    if (query.conductorId) where.conductorId = parseInt(query.conductorId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
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

  // ── P3: devuelve cajas ABIERTAS disponibles para pago ────────────────────────
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

  // ── P3: pago total desde caja abierta ────────────────────────────────────────
  async pagarLiquidacion(dto: PagarLiquidacionDto, usuarioId: number) {
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: dto.liquidacionId },
      include: { conductor: { select: { nombre: true } } },
    });
    if (!liquidacion) throw new Error('Liquidación no encontrada');
    if (liquidacion.estado === 'PAGADA') throw new Error('La liquidación ya fue pagada');

    // Verificar que la caja existe y está ABIERTA
    const caja = await prisma.caja.findUnique({ where: { id: dto.cajaId } });
    if (!caja) throw new Error('Caja no encontrada');
    if (caja.estado !== 'ABIERTA') throw new Error('La caja seleccionada está cerrada');

    const monto = Number(liquidacion.montoEntregado);
    if (monto <= 0) throw new Error('El monto de la liquidación debe ser mayor a 0');

    const concepto = `Pago liquidación — ${liquidacion.conductor.nombre}`;
    const referencia = `LIQUIDACION-${dto.liquidacionId}`;

    return prisma.$transaction(async (tx: any) => {
      // Registrar EGRESO en la caja (se entrega dinero al conductor)
      await tx.movimientoCaja.create({
        data: {
          cajaId: dto.cajaId,
          tipo: 'EGRESO',
          monto,
          concepto,
          referencia,
          fecha: new Date(),
        },
      });

      // Marcar liquidación como PAGADA
      const liquidacionActualizada = await tx.liquidacion.update({
        where: { id: dto.liquidacionId },
        data: { estado: 'PAGADA' },
        include: { conductor: { select: { id: true, nombre: true } }, detalles: true },
      });

      return { liquidacion: liquidacionActualizada };
    });
  }

  // ── P3: reintegro — la empresa entrega dinero adicional al conductor ─────────
  // (el conductor gastó más de lo que se le entregó; la empresa cubre el
  // faltante → sale dinero de caja → EGRESO)
  async registrarReintegro(dto: RegistrarMovimientoLiquidacionDto, usuarioId: number) {
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: dto.liquidacionId },
      include: { conductor: { select: { nombre: true } } },
    });
    if (!liquidacion) throw new Error('Liquidación no encontrada');
    if (liquidacion.estado !== 'PAGADA') {
      throw new Error('Solo se puede registrar un reintegro sobre una liquidación pagada');
    }
    if (Number(liquidacion.reintegro) <= 0) {
      throw new Error('Esta liquidación no tiene monto de reintegro calculado');
    }
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    const caja = await prisma.caja.findUnique({ where: { id: dto.cajaId } });
    if (!caja) throw new Error('Caja no encontrada');
    if (caja.estado !== 'ABIERTA') throw new Error('La caja seleccionada está cerrada');

    const concepto = dto.concepto || `Reintegro liquidación — ${liquidacion.conductor.nombre}`;
    const referencia = `REINTEGRO-LIQ-${dto.liquidacionId}`;

    return prisma.movimientoCaja.create({
      data: {
        cajaId: dto.cajaId,
        tipo: 'EGRESO',
        monto: dto.monto,
        concepto,
        referencia,
        fecha: new Date(),
      },
    });
  }

  // ── P3: devolución — el conductor devuelve dinero sobrante a la empresa ──────
  // (al conductor le sobró dinero del anticipo; lo regresa a la empresa →
  // entra dinero a caja → INGRESO)
  async registrarDevolucion(dto: RegistrarMovimientoLiquidacionDto, usuarioId: number) {
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: dto.liquidacionId },
      include: { conductor: { select: { nombre: true } } },
    });
    if (!liquidacion) throw new Error('Liquidación no encontrada');
    if (liquidacion.estado !== 'PAGADA') {
      throw new Error('Solo se puede registrar una devolución sobre una liquidación pagada');
    }
    if (Number(liquidacion.devolucion) <= 0) {
      throw new Error('Esta liquidación no tiene monto de devolución calculado');
    }
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    const caja = await prisma.caja.findUnique({ where: { id: dto.cajaId } });
    if (!caja) throw new Error('Caja no encontrada');
    if (caja.estado !== 'ABIERTA') throw new Error('La caja seleccionada está cerrada');

    const concepto = dto.concepto || `Devolución liquidación — ${liquidacion.conductor.nombre}`;
    const referencia = `DEVOLUCION-LIQ-${dto.liquidacionId}`;

    return prisma.movimientoCaja.create({
      data: {
        cajaId: dto.cajaId,
        tipo: 'INGRESO',
        monto: dto.monto,
        concepto,
        referencia,
        fecha: new Date(),
      },
    });
  }

  // ── P3: historial financiero de una liquidación ──────────────────────────────
  async getHistorialFinanciero(liquidacionId: number) {
    const liquidacion = await prisma.liquidacion.findUnique({
      where: { id: liquidacionId },
      include: { conductor: { select: { nombre: true } } },
    });
    if (!liquidacion) throw new Error('Liquidación no encontrada');

    const ref = `LIQUIDACION-${liquidacionId}`;
    const refReintegro = `REINTEGRO-LIQ-${liquidacionId}`;
    const refDevolucion = `DEVOLUCION-LIQ-${liquidacionId}`;

    const movimientos = await prisma.movimientoCaja.findMany({
      where: {
        referencia: { in: [ref, refReintegro, refDevolucion] },
        anulado: false,
      },
      orderBy: { fecha: 'asc' },
      include: {
        caja: { select: { id: true, nombre: true } },
      },
    });

    return {
      liquidacion: {
        id: liquidacion.id,
        estado: liquidacion.estado,
        montoEntregado: Number(liquidacion.montoEntregado),
        totalGastos: Number(liquidacion.totalGastos),
        reintegro: Number(liquidacion.reintegro),
        devolucion: Number(liquidacion.devolucion),
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

  async create(dto: CreateLiquidacionDto) {
    const conductor = await prisma.conductor.findUnique({ where: { id: dto.conductorId } });
    if (!conductor) throw new Error('Conductor no encontrado');

    const pedidoIds = dto.pedidoIds ?? [];
    await this.validarPedidosDisponibles(pedidoIds);

    const totalGastos = dto.detalles.reduce((s, d) => s + d.monto, 0);
    const diferencia = dto.montoEntregado - totalGastos;
    const devolucion = diferencia > 0 ? diferencia : 0;
    const reintegro = diferencia < 0 ? Math.abs(diferencia) : 0;

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
        totalGastos,
        devolucion,
        reintegro,
        estado: 'PENDIENTE',
        detalles: {
          create: dto.detalles.map((d) => ({
            categoria: d.categoria as any,
            descripcion: d.descripcion,
            monto: d.monto,
          })),
        },
        pedidos: pedidoIds.length
          ? { create: pedidoIds.map((pedidoId) => ({ pedidoId })) }
          : undefined,
      },
      include: LIQUIDACION_INCLUDE,
    });
  }

  async update(id: number, dto: Partial<CreateLiquidacionDto>) {
    const liq = await this.findById(id);
    if (liq.estado === 'PAGADA') throw new Error('No se puede editar una liquidación ya pagada');

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
    if (liq.estado === 'PAGADA') throw new Error('No se puede eliminar una liquidación pagada');
    return prisma.liquidacion.delete({ where: { id } });
  }
}

export const liquidacionesService = new LiquidacionesService();
