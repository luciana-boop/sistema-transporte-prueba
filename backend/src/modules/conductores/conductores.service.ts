// FILE: src/modules/conductores/conductores.service.ts

import prisma from '../../prisma/client';

export interface CreateConductorDto {
  nombre: string;
  dni: string;
  licencia: string;
  vencimientoLicencia: string;
  telefono?: string;
  direccion?: string;
  observaciones?: string;
  tractoPreferencia?: string;
  carretaPreferencia?: string;
}

export class ConductoresService {
  async findAll(query: { activo?: string; search?: string }) {
    const where: any = {};
    if (query.activo !== undefined) where.activo = query.activo === 'true';
    if (query.search) {
      where.OR = [
        { nombre: { contains: query.search, mode: 'insensitive' } },
        { dni: { contains: query.search } },
        { licencia: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    return prisma.conductor.findMany({ where, orderBy: { nombre: 'asc' } });
  }

  async findById(id: number) {
    const c = await prisma.conductor.findUnique({ where: { id } });
    if (!c) throw new Error('Conductor no encontrado');
    return c;
  }

  async create(dto: CreateConductorDto) {
    const existe = await prisma.conductor.findUnique({ where: { dni: dto.dni } });
    if (existe) throw new Error(`Ya existe un conductor con DNI ${dto.dni}`);
    return prisma.conductor.create({
      data: { ...dto, vencimientoLicencia: new Date(dto.vencimientoLicencia) },
    });
  }

  async update(id: number, dto: Partial<CreateConductorDto> & { activo?: boolean }) {
    await this.findById(id);
    if (dto.dni) {
      const existe = await prisma.conductor.findFirst({
        where: { dni: dto.dni, id: { not: id } },
      });
      if (existe) throw new Error(`El DNI ${dto.dni} ya está registrado`);
    }
    return prisma.conductor.update({
      where: { id },
      data: {
        ...dto,
        vencimientoLicencia: dto.vencimientoLicencia
          ? new Date(dto.vencimientoLicencia)
          : undefined,
      },
    });
  }

  async remove(id: number) {
    await this.findById(id);
    const tieneDeps = await prisma.liquidacion.count({ where: { conductorId: id } });
    if (tieneDeps > 0) {
      return prisma.conductor.update({ where: { id }, data: { activo: false } });
    }
    return prisma.conductor.delete({ where: { id } });
  }
}

export const conductoresService = new ConductoresService();
