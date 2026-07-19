// FILE: src/modules/conductores/conductores.service.ts

import prisma from '../../prisma/client';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface CreateConductorDto {
  nombre?: string;
  // Apellidos y nombres por separado — la GRE los declara en tags distintos
  // (FamilyName/FirstName, Anexo 14 RS 123-2022). Si llegan, `nombre` se
  // compone automáticamente a partir de ellos.
  apellidos?: string;
  nombres?: string;
  dni: string;
  licencia: string;
  vencimientoLicencia?: string;
  telefono?: string;
  direccion?: string;
  observaciones?: string;
  tractoPreferencia?: string;
  carretaPreferencia?: string;
}

// Nombre completo para mostrar, en orden natural "nombres apellidos" (el
// mismo que ya usan los datos existentes). El orden SUNAT "apellidos
// nombres" lo arma quien lo necesite desde los campos separados.
function componerNombre(dto: { nombre?: string; apellidos?: string; nombres?: string }): string | undefined {
  if (dto.nombres && dto.apellidos) return `${dto.nombres} ${dto.apellidos}`;
  return dto.nombre;
}

export class ConductoresService {
  async findAll(query: { activo?: string; search?: string } & PaginacionQuery) {
    const where: any = {};
    if (query.activo !== undefined) where.activo = query.activo === 'true';
    if (query.search) {
      where.OR = [
        { nombre: { contains: query.search, mode: 'insensitive' } },
        { dni: { contains: query.search } },
        { licencia: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const { skip, take, page, limit } = paginar(query);
    const [total, items] = await Promise.all([
      prisma.conductor.count({ where }),
      prisma.conductor.findMany({
        where, orderBy: { nombre: 'asc' }, skip, take,
        include: {
          creadoPor: { select: { id: true, nombre: true } },
          actualizadoPor: { select: { id: true, nombre: true } },
        },
      }),
    ]);
    return { items, total, page, limit };
  }

  async findById(id: number) {
    const c = await prisma.conductor.findUnique({
      where: { id },
      include: {
        creadoPor: { select: { id: true, nombre: true } },
        actualizadoPor: { select: { id: true, nombre: true } },
      },
    });
    if (!c) throw new Error('Conductor no encontrado');
    return c;
  }

  async create(dto: CreateConductorDto, usuarioId?: number) {
    const existe = await prisma.conductor.findUnique({ where: { dni: dto.dni } });
    if (existe) throw new Error(`Ya existe un conductor con DNI ${dto.dni}`);
    const nombre = componerNombre(dto);
    if (!nombre) throw new Error('Indique apellidos y nombres del conductor');
    return prisma.conductor.create({
      data: {
        ...dto,
        nombre,
        vencimientoLicencia: dto.vencimientoLicencia ? new Date(dto.vencimientoLicencia) : null,
        creadoPorId: usuarioId,
      },
    });
  }

  async update(id: number, dto: Partial<CreateConductorDto> & { activo?: boolean }, usuarioId?: number) {
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
        // Si llegan apellidos/nombres, recomponer el nombre completo para
        // que la vista nunca quede desincronizada de los campos separados.
        nombre: componerNombre(dto),
        vencimientoLicencia: dto.vencimientoLicencia !== undefined
          ? (dto.vencimientoLicencia ? new Date(dto.vencimientoLicencia) : null)
          : undefined,
        actualizadoPorId: usuarioId,
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
