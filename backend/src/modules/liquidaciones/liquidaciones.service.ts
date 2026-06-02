// FILE: src/modules/liquidaciones/liquidaciones.service.ts

import prisma from '../../prisma/client';
// CategoriaDetalle resolved from local enums

export interface DetalleDto {
  categoria: 'PEAJE' | 'BALANZA' | 'VIATICO';
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
}

export class LiquidacionesService {
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
      include: {
        conductor: { select: { id: true, nombre: true } },
        detalles: true,
      },
    });
  }

  async findById(id: number) {
    const liq = await prisma.liquidacion.findUnique({
      where: { id },
      include: { conductor: true, detalles: true },
    });
    if (!liq) throw new Error('Liquidación no encontrada');
    return liq;
  }

  async create(dto: CreateLiquidacionDto) {
    const conductor = await prisma.conductor.findUnique({ where: { id: dto.conductorId } });
    if (!conductor) throw new Error('Conductor no encontrado');

    const totalGastos = dto.detalles.reduce((s, d) => s + d.monto, 0);
    const toldo = 0;
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
      },
      include: { conductor: true, detalles: true },
    });
  }

  async update(id: number, dto: Partial<CreateLiquidacionDto>) {
    await this.findById(id);
    return prisma.liquidacion.update({
      where: { id },
      data: {
        ...dto,
        fecha: dto.fecha ? new Date(dto.fecha) : undefined,
      },
    });
  }

  async remove(id: number) {
    await this.findById(id);
    return prisma.liquidacion.delete({ where: { id } });
  }
}

export const liquidacionesService = new LiquidacionesService();
