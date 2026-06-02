// FILE: src/modules/combustible/combustible.service.ts

import prisma from '../../prisma/client';

export interface CreateCombustibleDto {
  vehiculoId: number;
  conductorId?: number;
  fecha: string;
  galones: number;
  monto: number;
  kilometraje?: number;
  grifo?: string;
  observaciones?: string;
}

export class CombustibleService {
  async findAll(query: {
    vehiculoId?: string; conductorId?: string;
    desde?: string; hasta?: string;
  }) {
    const where: any = {};
    if (query.vehiculoId) where.vehiculoId = parseInt(query.vehiculoId);
    if (query.conductorId) where.conductorId = parseInt(query.conductorId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
    return prisma.combustible.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: {
        vehiculo: { select: { id: true, placa: true, marca: true, modelo: true } },
        conductor: { select: { id: true, nombre: true } },
      },
    });
  }

  async resumen(query: { desde?: string; hasta?: string }) {
    const where: any = {};
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    const agrupado = await prisma.combustible.groupBy({
      by: ['vehiculoId'],
      where,
      _sum: { monto: true, galones: true },
      _count: true,
    });

    const vehiculoIds = agrupado.map((a: any) => a.vehiculoId);
    const vehiculos = await prisma.vehiculo.findMany({
      where: { id: { in: vehiculoIds } },
      select: { id: true, placa: true, marca: true },
    });

    const porVehiculo = agrupado.map((a: any) => {
      const v = vehiculos.find((veh: any) => veh.id === a.vehiculoId);
      return {
        vehiculoId: a.vehiculoId,
        placa: v?.placa ?? '—',
        marca: v?.marca ?? '—',
        totalGalones: Number(a._sum.galones || 0),
        totalMonto: Number(a._sum.monto || 0),
        registros: a._count,
      };
    });

    const totalMes = porVehiculo.reduce((s: number, v: any) => s + v.totalMonto, 0);
    const totalGalones = porVehiculo.reduce((s: number, v: any) => s + v.totalGalones, 0);

    return { porVehiculo, totalMes, totalGalones };
  }

  async findById(id: number) {
    const c = await prisma.combustible.findUnique({
      where: { id },
      include: {
        vehiculo: { select: { id: true, placa: true, marca: true } },
        conductor: { select: { id: true, nombre: true } },
      },
    });
    if (!c) throw new Error('Registro no encontrado');
    return c;
  }

  async create(dto: CreateCombustibleDto) {
    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: dto.vehiculoId } });
    if (!vehiculo) throw new Error('Vehículo no encontrado');

    return prisma.combustible.create({
      data: {
        ...dto,
        fecha: new Date(dto.fecha),
      },
      include: {
        vehiculo: { select: { id: true, placa: true, marca: true } },
        conductor: { select: { id: true, nombre: true } },
      },
    });
  }

  async update(id: number, dto: Partial<CreateCombustibleDto>) {
    await this.findById(id);
    return prisma.combustible.update({
      where: { id },
      data: { ...dto, fecha: dto.fecha ? new Date(dto.fecha) : undefined },
    });
  }

  async remove(id: number) {
    await this.findById(id);
    return prisma.combustible.delete({ where: { id } });
  }
}

export const combustibleService = new CombustibleService();
