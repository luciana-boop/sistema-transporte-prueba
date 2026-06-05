// FILE: src/modules/gastos/gastos.service.ts

import prisma from '../../prisma/client';
import { TipoGasto } from '../../utils/enums';

export interface CreateGastoDto {
  pedidoId?: number;
  tipoGasto: TipoGasto;
  monto: number;
  descripcion: string;
  comprobante?: string;
  fecha?: Date;
  // Financiero — no se persiste en Gasto pero se puede usar para MovimientoCuentaV2 futuro
  cuentaId?: number;
  monedaId?: number;
  tipoPagoId?: number;
}

export interface UpdateGastoDto extends Partial<CreateGastoDto> {}

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

    // Búsqueda en comprobante, descripcion (concepto), y a través de relaciones
    if (query.search) {
      const s = query.search.toLowerCase();
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
    if (dto.pedidoId) {
      const pedido = await prisma.pedido.findUnique({ where: { id: dto.pedidoId } });
      if (!pedido) throw new Error('Pedido no encontrado');
    }
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    // Extraer campos no persistidos en Gasto
    const { cuentaId: _c, monedaId: _m, tipoPagoId: _t, ...gastoData } = dto;

    return prisma.gasto.create({
      data: {
        ...gastoData,
        usuarioId,
        fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
      },
      include: {
        pedido: { select: { id: true, origen: true, destino: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  async update(id: number, dto: UpdateGastoDto) {
    await this.findById(id);
    if (dto.pedidoId) {
      const pedido = await prisma.pedido.findUnique({ where: { id: dto.pedidoId } });
      if (!pedido) throw new Error('Pedido no encontrado');
    }
    if (dto.monto !== undefined && dto.monto <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }
    const { cuentaId: _c, monedaId: _m, tipoPagoId: _t, ...updateData } = dto;
    return prisma.gasto.update({ where: { id }, data: updateData });
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar gastos');
    await this.findById(id);
    return prisma.gasto.delete({ where: { id } });
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
