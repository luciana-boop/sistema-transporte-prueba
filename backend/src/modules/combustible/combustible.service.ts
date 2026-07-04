// FILE: src/modules/combustible/combustible.service.ts
// Módulo Movimientos: las cargas de combustible ya NO generan su propio egreso.
// En su lugar, descuentan de un egreso existente (MovimientoCuentaV2, categoría
// COMBUSTIBLE) hasta agotar su saldo disponible — así un mismo pago puede cubrir
// dos o más cargas.

import prisma from '../../prisma/client';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface CreateCombustibleDto {
  vehiculoId: number;
  conductorId?: number;
  // P4: liquidación del conductor a la que se asocia esta carga (opcional)
  liquidacionId?: number;
  fecha: string;
  galones: number;
  monto: number;
  kilometraje?: number;
  grifo?: string;
  observaciones?: string;
  // Egreso (categoría COMBUSTIBLE) del que se descuenta esta carga
  movimientoCuentaId: number;
}

export interface UpdateCombustibleDto {
  vehiculoId?: number;
  conductorId?: number;
  liquidacionId?: number | null;
  fecha?: string;
  galones?: number;
  monto?: number;
  kilometraje?: number;
  grifo?: string;
  observaciones?: string;
}

export class CombustibleService {
  async findAll(query: {
    vehiculoId?: string; conductorId?: string;
    desde?: string; hasta?: string;
  } & PaginacionQuery) {
    const where: any = {};
    if (query.vehiculoId) where.vehiculoId = parseInt(query.vehiculoId);
    if (query.conductorId) where.conductorId = parseInt(query.conductorId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
    const { skip, take, page, limit } = paginar(query);
    const [total, items] = await Promise.all([
      prisma.combustible.count({ where }),
      prisma.combustible.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip,
        take,
        include: {
          vehiculo: { select: { id: true, placa: true, marca: true, modelo: true } },
          conductor: { select: { id: true, nombre: true } },
          liquidacion: { select: { id: true, fecha: true, estado: true } },
        },
      }),
    ]);
    return { items, total, page, limit };
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
        liquidacion: { select: { id: true, fecha: true, estado: true, montoEntregado: true } },
        movimientoCuenta: {
          include: {
            cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
            moneda: { select: { codigo: true, nombre: true, simbolo: true } },
            usuario: { select: { id: true, nombre: true } },
          },
        },
        creadoPor: { select: { id: true, nombre: true } },
        actualizadoPor: { select: { id: true, nombre: true } },
      },
    });
    if (!c) throw new Error('Registro no encontrado');

    const { movimientoCuenta, ...resto } = c;
    return { ...resto, movimiento: movimientoCuenta };
  }

  // Saldo disponible de un egreso de categoría COMBUSTIBLE: monto del egreso
  // menos lo ya consumido por otras cargas vinculadas. `excluirCombustibleId`
  // permite recalcular el saldo "como si" un registro que se está editando no
  // contara todavía, para no autobloquearse al reducir/mantener su propio monto.
  private async _saldoDisponible(movimientoCuentaId: number, excluirCombustibleId?: number) {
    const consumido = await prisma.combustible.aggregate({
      where: {
        movimientoCuentaId,
        ...(excluirCombustibleId ? { id: { not: excluirCombustibleId } } : {}),
      },
      _sum: { monto: true },
    });
    const egreso = await prisma.movimientoCuentaV2.findUnique({ where: { id: movimientoCuentaId } });
    if (!egreso) throw new Error('Egreso no encontrado');
    return Number(egreso.monto) - Number(consumido._sum.monto || 0);
  }

  // Egresos de categoría COMBUSTIBLE con saldo disponible para vincular una nueva carga
  async egresosDisponibles() {
    const egresos = await prisma.movimientoCuentaV2.findMany({
      where: { tipo: 'EGRESO', categoriaEgreso: 'COMBUSTIBLE', anulado: false },
      orderBy: { fecha: 'desc' },
      include: {
        cuenta: { select: { id: true, nombre: true } },
        moneda: { select: { codigo: true, simbolo: true } },
      },
    });

    const consumos = await prisma.combustible.groupBy({
      by: ['movimientoCuentaId'],
      where: { movimientoCuentaId: { in: egresos.map((e: any) => e.id) } },
      _sum: { monto: true },
    });
    const consumidoPorEgreso = new Map(consumos.map((c: any) => [c.movimientoCuentaId, Number(c._sum.monto || 0)]));

    return egresos
      .map((e: any) => {
        const consumido = consumidoPorEgreso.get(e.id) ?? 0;
        const saldoDisponible = Number(e.monto) - consumido;
        return {
          id: e.id,
          concepto: e.concepto,
          notaEgreso: e.notaEgreso,
          monto: Number(e.monto),
          saldoDisponible,
          fecha: e.fecha,
          cuenta: e.cuenta,
          moneda: e.moneda,
        };
      })
      .filter((e: any) => e.saldoDisponible > 0.01);
  }

  async create(dto: CreateCombustibleDto, usuarioId: number) {
    if (!dto.movimientoCuentaId) throw new Error('Debe seleccionar un egreso de combustible');
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');
    if (dto.galones <= 0) throw new Error('Los galones deben ser mayor a 0');

    const vehiculo = await prisma.vehiculo.findUnique({ where: { id: dto.vehiculoId } });
    if (!vehiculo) throw new Error('Vehículo no encontrado');

    const egreso = await prisma.movimientoCuentaV2.findUnique({ where: { id: dto.movimientoCuentaId } });
    if (!egreso) throw new Error('Egreso no encontrado');
    if (egreso.tipo !== 'EGRESO' || egreso.categoriaEgreso !== 'COMBUSTIBLE') {
      throw new Error('El movimiento seleccionado no es un egreso de categoría Combustible');
    }
    if (egreso.anulado) throw new Error('El egreso seleccionado está anulado');

    const saldoDisponible = await this._saldoDisponible(dto.movimientoCuentaId);
    if (dto.monto > saldoDisponible + 0.01) {
      throw new Error(
        `El monto (${dto.monto.toFixed(2)}) excede el saldo disponible del egreso (${saldoDisponible.toFixed(2)})`
      );
    }

    // P4: si se asocia a una liquidación, validar que exista y sea del conductor indicado
    if (dto.liquidacionId) {
      const liquidacion = await prisma.liquidacion.findUnique({ where: { id: dto.liquidacionId } });
      if (!liquidacion) throw new Error('Liquidación no encontrada');
      if (dto.conductorId && liquidacion.conductorId !== dto.conductorId) {
        throw new Error('La liquidación seleccionada no pertenece al conductor indicado');
      }
    }

    return prisma.combustible.create({
      data: {
        vehiculoId: dto.vehiculoId,
        conductorId: dto.conductorId,
        liquidacionId: dto.liquidacionId,
        fecha: new Date(dto.fecha),
        galones: dto.galones,
        monto: dto.monto,
        kilometraje: dto.kilometraje,
        grifo: dto.grifo,
        observaciones: dto.observaciones,
        movimientoCuentaId: dto.movimientoCuentaId,
        creadoPorId: usuarioId,
      },
      include: {
        vehiculo: { select: { id: true, placa: true, marca: true } },
        conductor: { select: { id: true, nombre: true } },
        liquidacion: { select: { id: true, fecha: true, estado: true } },
      },
    });
  }

  async update(id: number, dto: UpdateCombustibleDto, usuarioId?: number) {
    const actual = await prisma.combustible.findUnique({ where: { id } });
    if (!actual) throw new Error('Registro no encontrado');

    // P4: si se asocia/cambia la liquidación, validar que exista y sea del conductor indicado
    if (dto.liquidacionId !== undefined && dto.liquidacionId !== null) {
      const liquidacion = await prisma.liquidacion.findUnique({ where: { id: dto.liquidacionId } });
      if (!liquidacion) throw new Error('Liquidación no encontrada');
      const conductorId = dto.conductorId !== undefined ? dto.conductorId : actual.conductorId;
      if (conductorId && liquidacion.conductorId !== conductorId) {
        throw new Error('La liquidación seleccionada no pertenece al conductor indicado');
      }
    }

    if (dto.monto !== undefined) {
      if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');
      if (actual.movimientoCuentaId) {
        const saldoDisponible = await this._saldoDisponible(actual.movimientoCuentaId, id);
        if (dto.monto > saldoDisponible + 0.01) {
          throw new Error(
            `El monto (${dto.monto.toFixed(2)}) excede el saldo disponible del egreso (${saldoDisponible.toFixed(2)})`
          );
        }
      }
    }

    return prisma.combustible.update({
      where: { id },
      data: {
        ...(dto.vehiculoId !== undefined && { vehiculoId: dto.vehiculoId }),
        ...(dto.conductorId !== undefined && { conductorId: dto.conductorId }),
        ...(dto.liquidacionId !== undefined && { liquidacionId: dto.liquidacionId }),
        ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
        ...(dto.galones !== undefined && { galones: dto.galones }),
        ...(dto.monto !== undefined && { monto: dto.monto }),
        ...(dto.kilometraje !== undefined && { kilometraje: dto.kilometraje }),
        ...(dto.grifo !== undefined && { grifo: dto.grifo }),
        ...(dto.observaciones !== undefined && { observaciones: dto.observaciones }),
        actualizadoPorId: usuarioId,
      },
      include: {
        vehiculo: { select: { id: true, placa: true, marca: true } },
        conductor: { select: { id: true, nombre: true } },
        liquidacion: { select: { id: true, fecha: true, estado: true } },
      },
    });
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar registros de combustible');
    const actual = await prisma.combustible.findUnique({ where: { id } });
    if (!actual) throw new Error('Registro no encontrado');

    return prisma.combustible.delete({ where: { id } });
  }
}

export const combustibleService = new CombustibleService();
