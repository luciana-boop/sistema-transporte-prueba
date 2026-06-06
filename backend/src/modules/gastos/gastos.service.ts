// FILE: src/modules/gastos/gastos.service.ts
// CHAT 9: cuentaId ahora es OBLIGATORIO.
// Al crear un gasto se genera MovimientoCuentaV2 (EGRESO) dentro de la misma
// transacción. Si el saldo es insuficiente se rechaza antes de escribir nada.
// Al eliminar un gasto se crea un movimiento compensatorio (INGRESO reverso).

import prisma from '../../prisma/client';
import { TipoGasto } from '../../utils/enums';
import { cuentasService } from '../configuracion/cuentas.service';

export interface CreateGastoDto {
  pedidoId?: number;
  tipoGasto: TipoGasto;
  monto: number;
  descripcion: string;
  comprobante?: string;
  fecha?: string;
  // CHAT 9: ahora obligatorios en la capa de servicio
  cuentaId: number;
  monedaId: number;
  tipoPagoId?: number;
}

export interface UpdateGastoDto {
  pedidoId?: number;
  tipoGasto?: TipoGasto;
  descripcion?: string;
  comprobante?: string;
  fecha?: string;
  // Nota: monto y cuentaId no son editables para preservar integridad del movimiento
}

export class GastosService {
  async findAll(query: {
    tipoGasto?: string;
    pedidoId?: string;
    usuarioId?: string;
    desde?: string;
    hasta?: string;
    search?: string;
  }) {
    const where: any = {};

    if (query.tipoGasto) where.tipoGasto = query.tipoGasto as TipoGasto;
    if (query.pedidoId) where.pedidoId = parseInt(query.pedidoId);
    if (query.usuarioId) where.usuarioId = parseInt(query.usuarioId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    if (query.search) {
      where.OR = [
        { descripcion: { contains: query.search, mode: 'insensitive' } },
        { comprobante: { contains: query.search, mode: 'insensitive' } },
        { tipoGasto: { equals: query.search.toUpperCase() as TipoGasto } },
      ];
    }

    return prisma.gasto.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: {
        pedido: { select: { id: true, origen: true, destino: true, estado: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  async findById(id: number) {
    const gasto = await prisma.gasto.findUnique({
      where: { id },
      include: {
        pedido: true,
        usuario: { select: { id: true, nombre: true } },
      },
    });
    if (!gasto) throw new Error('Gasto no encontrado');
    return gasto;
  }

  async create(dto: CreateGastoDto, usuarioId: number) {
    // Validaciones previas a la transacción
    if (!dto.cuentaId) throw new Error('Debe seleccionar una cuenta para el gasto');
    if (!dto.monedaId) throw new Error('Debe seleccionar una moneda');
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    if (dto.pedidoId) {
      const pedido = await prisma.pedido.findUnique({ where: { id: dto.pedidoId } });
      if (!pedido) throw new Error('Pedido no encontrado');
    }

    return prisma.$transaction(async (tx: any) => {
      // 1. Crear el gasto operativo
      const gasto = await tx.gasto.create({
        data: {
          pedidoId: dto.pedidoId ?? null,
          tipoGasto: dto.tipoGasto,
          monto: dto.monto,
          descripcion: dto.descripcion,
          comprobante: dto.comprobante ?? null,
          fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
          usuarioId,
        },
        include: {
          pedido: { select: { id: true, origen: true, destino: true } },
          usuario: { select: { id: true, nombre: true } },
        },
      });

      // 2. Crear movimiento financiero (valida saldo dentro de la tx)
      await cuentasService._registrarMovimientoEnTx(tx, {
        cuentaId: dto.cuentaId,
        tipo: 'EGRESO',
        monto: dto.monto,
        monedaId: dto.monedaId,
        tipoPagoId: dto.tipoPagoId,
        concepto: `Gasto — ${dto.descripcion}`,
        referencia: `GASTO-${gasto.id}`,
        usuarioId,
        fecha: dto.fecha,
      });

      return gasto;
    });
  }

  async update(id: number, dto: UpdateGastoDto) {
    await this.findById(id);
    if (dto.pedidoId) {
      const pedido = await prisma.pedido.findUnique({ where: { id: dto.pedidoId } });
      if (!pedido) throw new Error('Pedido no encontrado');
    }
    // Solo actualizar campos no financieros
    return prisma.gasto.update({
      where: { id },
      data: {
        ...(dto.pedidoId !== undefined && { pedidoId: dto.pedidoId }),
        ...(dto.tipoGasto !== undefined && { tipoGasto: dto.tipoGasto }),
        ...(dto.descripcion !== undefined && { descripcion: dto.descripcion }),
        ...(dto.comprobante !== undefined && { comprobante: dto.comprobante }),
        ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
      },
      include: {
        pedido: { select: { id: true, origen: true, destino: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar gastos');
    const gasto = await this.findById(id);

    return prisma.$transaction(async (tx: any) => {
      // Buscar el MovimientoCuentaV2 vinculado por referencia
      const movCuenta = await tx.movimientoCuentaV2.findFirst({
        where: { referencia: `GASTO-${id}` },
      });

      if (movCuenta) {
        // Crear movimiento compensatorio (revierte el egreso)
        await cuentasService._revertirMovimientoEnTx(tx, movCuenta.id, 0 /* system */);
      }

      return tx.gasto.delete({ where: { id } });
    });
  }

  async resumenPorTipo(query: { desde?: string; hasta?: string; pedidoId?: string }) {
    const where: any = {};
    if (query.pedidoId) where.pedidoId = parseInt(query.pedidoId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    const gastos = await prisma.gasto.groupBy({
      by: ['tipoGasto'],
      where,
      _sum: { monto: true },
      _count: true,
    });

    const totalGeneral = gastos.reduce((s: number, g: any) => s + Number(g._sum.monto || 0), 0);

    return {
      resumenPorTipo: gastos.map((g: any) => ({
        tipoGasto: g.tipoGasto,
        totalMonto: Number(g._sum.monto || 0),
        cantidadRegistros: g._count,
      })),
      totalGeneral,
    };
  }
}

export const gastosService = new GastosService();
