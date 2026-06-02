// FILE: src/modules/vehiculos/vehiculos.service.ts

import prisma from '../../prisma/client';

export interface CreateVehiculoDto {
  placa: string;
  tipo: 'TRACTO' | 'CARRETA';
  marca: string;
  modelo: string;
  anio: number;
  soat?: string;
  vencimientoSoat?: string;
  revisionTecnica?: string;
  vencimientoRevision?: string;
  ultimoMantenimiento?: string;
  proximoMantenimiento?: string;
  estado?: string;
  observaciones?: string;
}

const toDate = (s?: string) => (s ? new Date(s) : undefined);

export class VehiculosService {
  async findAll(query: { tipo?: string; activo?: string; search?: string }) {
    const where: any = {};
    if (query.tipo) where.tipo = query.tipo;
    if (query.activo !== undefined) where.activo = query.activo === 'true';
    if (query.search) {
      where.OR = [
        { placa: { contains: query.search, mode: 'insensitive' } },
        { marca: { contains: query.search, mode: 'insensitive' } },
        { modelo: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return prisma.vehiculo.findMany({ where, orderBy: { placa: 'asc' } });
  }

  async findById(id: number) {
    const v = await prisma.vehiculo.findUnique({ where: { id } });
    if (!v) throw new Error('Vehículo no encontrado');
    return v;
  }

  async create(dto: CreateVehiculoDto) {
    const existe = await prisma.vehiculo.findUnique({ where: { placa: dto.placa.toUpperCase() } });
    if (existe) throw new Error(`La placa ${dto.placa} ya está registrada`);
    return prisma.vehiculo.create({
      data: {
        ...dto,
        placa: dto.placa.toUpperCase(),
        estado: dto.estado ?? 'OPERATIVO',
        vencimientoSoat:      toDate(dto.vencimientoSoat),
        vencimientoRevision:  toDate(dto.vencimientoRevision),
        ultimoMantenimiento:  toDate(dto.ultimoMantenimiento),
        proximoMantenimiento: toDate(dto.proximoMantenimiento),
      },
    });
  }

  async update(id: number, dto: Partial<CreateVehiculoDto> & { activo?: boolean }) {
    await this.findById(id);
    if (dto.placa) {
      const existe = await prisma.vehiculo.findFirst({
        where: { placa: dto.placa.toUpperCase(), id: { not: id } },
      });
      if (existe) throw new Error(`La placa ${dto.placa} ya está registrada`);
    }
    return prisma.vehiculo.update({
      where: { id },
      data: {
        ...dto,
        placa: dto.placa ? dto.placa.toUpperCase() : undefined,
        vencimientoSoat:      dto.vencimientoSoat !== undefined ? toDate(dto.vencimientoSoat) : undefined,
        vencimientoRevision:  dto.vencimientoRevision !== undefined ? toDate(dto.vencimientoRevision) : undefined,
        ultimoMantenimiento:  dto.ultimoMantenimiento !== undefined ? toDate(dto.ultimoMantenimiento) : undefined,
        proximoMantenimiento: dto.proximoMantenimiento !== undefined ? toDate(dto.proximoMantenimiento) : undefined,
      },
    });
  }

  async remove(id: number) {
    await this.findById(id);
    const tieneDeps = await prisma.combustible.count({ where: { vehiculoId: id } });
    if (tieneDeps > 0) {
      return prisma.vehiculo.update({ where: { id }, data: { activo: false } });
    }
    return prisma.vehiculo.delete({ where: { id } });
  }
}

export const vehiculosService = new VehiculosService();
