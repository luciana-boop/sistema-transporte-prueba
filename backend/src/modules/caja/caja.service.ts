// FILE: src/modules/caja/caja.service.ts

import prisma from '../../prisma/client';
import { EstadoCaja, TipoMovimientoCaja } from '../../utils/enums';

export interface AbrirCajaDto {
  saldoApertura: number;
  observaciones?: string;
}

export interface CerrarCajaDto {
  saldoCierre: number;
  observaciones?: string;
}

export interface MovimientoManualDto {
  tipo: TipoMovimientoCaja;
  monto: number;
  concepto: string;
}

export class CajaService {
  async findAll(query: { estado?: string; usuarioId?: string; desde?: string; hasta?: string }) {
    const where: any = {};
    if (query.estado) where.estado = query.estado as EstadoCaja;
    if (query.usuarioId) where.usuarioId = parseInt(query.usuarioId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    return prisma.caja.findMany({
      where,
      orderBy: { aperturaEn: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true } },
        _count: { select: { movimientos: true } },
      },
    });
  }

  async findById(id: number) {
    const caja = await prisma.caja.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, nombre: true } },
        movimientos: {
          orderBy: { creadoEn: 'desc' },
        },
      },
    });
    if (!caja) throw new Error('Caja no encontrada');

    const ingresos = caja.movimientos
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const egresos = caja.movimientos
      .filter((m: any) => m.tipo === 'EGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const saldoCalculado = Number(caja.saldoApertura) + ingresos - egresos;

    return { ...caja, ingresosTotales: ingresos, egresosTotales: egresos, saldoCalculado };
  }

  async cajaActual(usuarioId: number) {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);

    const caja = await prisma.caja.findFirst({
      where: {
        usuarioId,
        fecha: { gte: hoy, lt: manana },
      },
      include: {
        usuario: { select: { id: true, nombre: true } },
        _count: { select: { movimientos: true } },
      },
      orderBy: { aperturaEn: 'desc' },
    });

    return caja;
  }

  async abrir(dto: AbrirCajaDto, usuarioId: number) {
    const cajaExistente = await this.cajaActual(usuarioId);
    if (cajaExistente) {
      throw new Error('Ya existe una caja abierta o registrada para hoy');
    }

    return prisma.caja.create({
      data: {
        usuarioId,
        fecha: new Date(),
        saldoApertura: dto.saldoApertura,
        estado: EstadoCaja.ABIERTA,
        observaciones: dto.observaciones,
      },
    });
  }

  async cerrar(id: number, dto: CerrarCajaDto, usuarioId: number) {
    const caja = await this.findById(id);

    if (caja.estado === EstadoCaja.CERRADA) {
      throw new Error('La caja ya está cerrada');
    }
    if (caja.usuarioId !== usuarioId) {
      throw new Error('No puede cerrar una caja de otro usuario');
    }

    return prisma.caja.update({
      where: { id },
      data: {
        estado: EstadoCaja.CERRADA,
        saldoCierre: dto.saldoCierre,
        cierreEn: new Date(),
        observaciones: dto.observaciones,
      },
    });
  }

  async registrarMovimiento(id: number, dto: MovimientoManualDto, usuarioId: number) {
    const caja = await this.findById(id);

    if (caja.estado === EstadoCaja.CERRADA) {
      throw new Error('No se pueden agregar movimientos a una caja cerrada');
    }
    if (caja.usuarioId !== usuarioId) {
      throw new Error('No puede registrar movimientos en una caja de otro usuario');
    }
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    return prisma.movimientoCaja.create({
      data: {
        cajaId: id,
        tipo: dto.tipo,
        monto: dto.monto,
        concepto: dto.concepto,
      },
    });
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar cajas');
    const caja = await this.findById(id);
    if (caja.estado === EstadoCaja.ABIERTA) {
      throw new Error('No se puede eliminar una caja abierta');
    }
    return prisma.caja.delete({ where: { id } });
  }
}

export const cajaService = new CajaService();
