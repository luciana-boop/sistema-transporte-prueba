// FILE: src/modules/liquidaciones/liquidaciones.service.ts
// CAMBIO: Agrega soporte para pedidos relacionados (LiquidacionPedido).
// Regla: un pedido solo puede pertenecer a una liquidación activa.
// Validaciones en create, update y remove.

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
  // NUEVO: IDs de pedidos a asociar
  pedidoIds?: number[];
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
  /**
   * Verifica que los pedidoIds dados sean válidos para asociar a una liquidación.
   * Lanza error si:
   *  - algún pedido no existe
   *  - algún pedido ya está en otra liquidación
   *  - hay IDs duplicados en el array
   *
   * @param pedidoIds  lista de IDs a validar
   * @param excludeLiquidacionId  (en update) omitir la propia liquidación al verificar duplicados
   */
  private async validarPedidosDisponibles(
    pedidoIds: number[],
    excludeLiquidacionId?: number,
  ): Promise<void> {
    if (!pedidoIds.length) return;

    // Detectar duplicados en el propio array enviado
    const uniqueIds = new Set(pedidoIds);
    if (uniqueIds.size !== pedidoIds.length) {
      throw new Error('No se pueden agregar pedidos duplicados en la misma liquidación');
    }

    // Verificar existencia
    const pedidos = await prisma.pedido.findMany({
      where: { id: { in: pedidoIds } },
      select: { id: true, estado: true },
    });

    if (pedidos.length !== pedidoIds.length) {
      const encontrados = new Set(pedidos.map((p) => p.id));
      const faltantes = pedidoIds.filter((id) => !encontrados.has(id));
      throw new Error(`Pedido(s) no encontrado(s): ${faltantes.join(', ')}`);
    }

    // Verificar que no estén en otra liquidación
    const yaAsignados = await prisma.liquidacionPedido.findMany({
      where: {
        pedidoId: { in: pedidoIds },
        ...(excludeLiquidacionId
          ? { liquidacionId: { not: excludeLiquidacionId } }
          : {}),
      },
      select: {
        pedidoId: true,
        liquidacionId: true,
      },
    });

    if (yaAsignados.length > 0) {
      const detalles = yaAsignados
        .map((r) => `Pedido #${r.pedidoId} (liquidación #${r.liquidacionId})`)
        .join(', ');
      throw new Error(
        `Los siguientes pedidos ya están asignados a otra liquidación: ${detalles}`,
      );
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

  /**
   * Devuelve pedidos ACTIVOS que aún no están asignados a ninguna liquidación.
   * Úsalo para poblar el selector de pedidos en el formulario.
   */
  async findPedidosDisponibles() {
    return prisma.pedido.findMany({
      where: {
        estado: 'ACTIVO',
        liquidaciones: { none: {} }, // sin ninguna liquidación asignada
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

  async create(dto: CreateLiquidacionDto) {
    const conductor = await prisma.conductor.findUnique({ where: { id: dto.conductorId } });
    if (!conductor) throw new Error('Conductor no encontrado');

    const pedidoIds = dto.pedidoIds ?? [];

    // Validar pedidos antes de cualquier escritura
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
        detalles: {
          create: dto.detalles.map((d) => ({
            categoria: d.categoria as any,
            descripcion: d.descripcion,
            monto: d.monto,
          })),
        },
        // NUEVO: crear relaciones con pedidos
        pedidos: pedidoIds.length
          ? { create: pedidoIds.map((pedidoId) => ({ pedidoId })) }
          : undefined,
      },
      include: LIQUIDACION_INCLUDE,
    });
  }

  async update(id: number, dto: Partial<CreateLiquidacionDto>) {
    await this.findById(id);

    const pedidoIds = dto.pedidoIds;

    if (pedidoIds !== undefined) {
      // Validar pedidos excluyendo la propia liquidación
      await this.validarPedidosDisponibles(pedidoIds, id);

      // Reemplazar relaciones en una transacción
      return prisma.$transaction(async (tx) => {
        // Eliminar relaciones anteriores
        await tx.liquidacionPedido.deleteMany({ where: { liquidacionId: id } });

        // Actualizar datos principales y crear nuevas relaciones
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

    // Sin cambio en pedidoIds: actualizar solo campos base
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
    await this.findById(id);
    // Las relaciones LiquidacionPedido se eliminan en cascada (onDelete: Cascade)
    return prisma.liquidacion.delete({ where: { id } });
  }
}

export const liquidacionesService = new LiquidacionesService();
