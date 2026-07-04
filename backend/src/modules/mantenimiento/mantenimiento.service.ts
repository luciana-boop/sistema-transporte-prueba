// FILE: src/modules/mantenimiento/mantenimiento.service.ts
// Módulo Mantenimiento: relaciona un egreso (MovimientoCuentaV2, categoriaEgreso
// = MANTENIMIENTO) a un vehículo, opcionalmente un conductor, y un motivo
// configurable (TablaMaestra tipo = 'motivo_mantenimiento'). Un egreso "por
// relacionar" pasa a "relacionado" al crear su MantenimientoDetalle.

import prisma from '../../prisma/client';

export interface RelacionarMantenimientoDto {
  vehiculoId: number;
  conductorId?: number;
  motivoCodigo: string;
  descripcion?: string;
}

const MOVIMIENTO_INCLUDE = {
  cuenta: { select: { id: true, nombre: true } },
  mantenimiento: {
    include: {
      vehiculo: { select: { id: true, placa: true } },
      conductor: { select: { id: true, nombre: true } },
    },
  },
} as const;

export class MantenimientoService {
  async listar(query: {
    estado?: 'por_relacionar' | 'relacionado'; desde?: string; hasta?: string;
    vehiculoId?: string; motivoCodigo?: string; search?: string;
  } = {}) {
    const where: any = { categoriaEgreso: 'MANTENIMIENTO', anulado: false };
    if (query.estado === 'por_relacionar') where.mantenimiento = null;
    if (query.estado === 'relacionado') where.mantenimiento = { isNot: null };

    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
    if (query.search) {
      where.concepto = { contains: query.search, mode: 'insensitive' };
    }
    if (query.vehiculoId || query.motivoCodigo) {
      where.mantenimiento = {
        is: {
          ...(query.vehiculoId ? { vehiculoId: parseInt(query.vehiculoId) } : {}),
          ...(query.motivoCodigo ? { motivoCodigo: query.motivoCodigo } : {}),
        },
      };
    }

    return prisma.movimientoCuentaV2.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: MOVIMIENTO_INCLUDE,
    });
  }

  async relacionar(movimientoId: number, dto: RelacionarMantenimientoDto, usuarioId: number) {
    const mov = await prisma.movimientoCuentaV2.findUnique({ where: { id: movimientoId } });
    if (!mov) throw new Error('Movimiento no encontrado');
    if (mov.tipo !== 'EGRESO' || mov.categoriaEgreso !== 'MANTENIMIENTO') {
      throw new Error('Solo se pueden relacionar egresos de categoría Mantenimiento');
    }
    if (mov.anulado) throw new Error('No se puede relacionar un movimiento anulado');

    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: dto.vehiculoId } });
    if (!vehiculo) throw new Error('Vehículo no encontrado');

    if (dto.conductorId) {
      const conductor = await prisma.conductor.findUnique({ where: { id: dto.conductorId } });
      if (!conductor) throw new Error('Conductor no encontrado');
    }

    const motivo = await prisma.tablaMaestra.findUnique({
      where: { tipo_codigo: { tipo: 'motivo_mantenimiento', codigo: dto.motivoCodigo } },
    });
    if (!motivo || !motivo.activo) throw new Error('Motivo de mantenimiento inválido');

    const existente = await prisma.mantenimientoDetalle.findUnique({ where: { movimientoCuentaId: movimientoId } });

    if (existente) {
      await prisma.mantenimientoDetalle.update({
        where: { id: existente.id },
        data: {
          vehiculoId: dto.vehiculoId,
          conductorId: dto.conductorId ?? null,
          motivoCodigo: dto.motivoCodigo,
          descripcion: dto.descripcion ?? null,
          actualizadoPorId: usuarioId,
        },
      });
    } else {
      await prisma.mantenimientoDetalle.create({
        data: {
          movimientoCuentaId: movimientoId,
          vehiculoId: dto.vehiculoId,
          conductorId: dto.conductorId ?? null,
          motivoCodigo: dto.motivoCodigo,
          descripcion: dto.descripcion ?? null,
          creadoPorId: usuarioId,
        },
      });
    }

    return prisma.movimientoCuentaV2.findUnique({ where: { id: movimientoId }, include: MOVIMIENTO_INCLUDE });
  }
}

export const mantenimientoService = new MantenimientoService();
