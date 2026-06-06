// FILE: src/modules/combustible/combustible.service.ts
// CHAT 9: cuentaId ahora es OBLIGATORIO.
// Al crear un registro se genera MovimientoCuentaV2 (EGRESO) dentro de la misma
// transacción. Si el saldo es insuficiente se rechaza antes de escribir nada.
// Al eliminar se crea un movimiento compensatorio.

import prisma from '../../prisma/client';
import { cuentasService } from '../configuracion/cuentas.service';

export interface CreateCombustibleDto {
  vehiculoId: number;
  conductorId?: number;
  fecha: string;
  galones: number;
  monto: number;
  kilometraje?: number;
  grifo?: string;
  observaciones?: string;
  // CHAT 9: obligatorios
  cuentaId: number;
  monedaId: number;
  tipoPagoId?: number;
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

  async create(dto: CreateCombustibleDto, usuarioId: number) {
    if (!dto.cuentaId) throw new Error('Debe seleccionar una cuenta para el combustible');
    if (!dto.monedaId) throw new Error('Debe seleccionar una moneda');
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');
    if (dto.galones <= 0) throw new Error('Los galones deben ser mayor a 0');

    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: dto.vehiculoId } });
    if (!vehiculo) throw new Error('Vehículo no encontrado');

    // Extraer campos financieros
    const { cuentaId, monedaId, tipoPagoId, ...combustibleData } = dto;

    return prisma.$transaction(async (tx: any) => {
      // 1. Crear registro de combustible operativo
      const registro = await tx.combustible.create({
        data: {
          ...combustibleData,
          fecha: new Date(dto.fecha),
        },
        include: {
          vehiculo: { select: { id: true, placa: true, marca: true } },
          conductor: { select: { id: true, nombre: true } },
        },
      });

      // 2. Crear movimiento financiero (valida saldo dentro de la tx)
      await cuentasService._registrarMovimientoEnTx(tx, {
        cuentaId,
        tipo: 'EGRESO',
        monto: dto.monto,
        monedaId,
        tipoPagoId,
        concepto: `Combustible — ${vehiculo.placa} (${dto.galones} gal)`,
        referencia: `COMBUSTIBLE-${registro.id}`,
        usuarioId,
        fecha: dto.fecha,
      });

      return registro;
    });
  }

  async update(id: number, dto: Partial<Omit<CreateCombustibleDto, 'cuentaId' | 'monedaId' | 'tipoPagoId' | 'monto'>>) {
    await this.findById(id);
    // Solo actualizar campos no financieros (monto y cuenta no se pueden cambiar)
    return prisma.combustible.update({
      where: { id },
      data: {
        ...(dto.vehiculoId !== undefined && { vehiculoId: dto.vehiculoId }),
        ...(dto.conductorId !== undefined && { conductorId: dto.conductorId }),
        ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
        ...(dto.galones !== undefined && { galones: dto.galones }),
        ...(dto.kilometraje !== undefined && { kilometraje: dto.kilometraje }),
        ...(dto.grifo !== undefined && { grifo: dto.grifo }),
        ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
      },
      include: {
        vehiculo: { select: { id: true, placa: true, marca: true } },
        conductor: { select: { id: true, nombre: true } },
      },
    });
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar registros de combustible');
    await this.findById(id);

    return prisma.$transaction(async (tx: any) => {
      // Buscar el MovimientoCuentaV2 vinculado
      const movCuenta = await tx.movimientoCuentaV2.findFirst({
        where: { referencia: `COMBUSTIBLE-${id}` },
      });

      if (movCuenta) {
        await cuentasService._revertirMovimientoEnTx(tx, movCuenta.id, 0);
      }

      return tx.combustible.delete({ where: { id } });
    });
  }
}

export const combustibleService = new CombustibleService();
