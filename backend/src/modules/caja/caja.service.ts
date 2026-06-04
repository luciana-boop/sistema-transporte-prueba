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

export interface FiltrosMovimientosDto {
  desde?: string;
  hasta?: string;
  tipo?: string;
  cajaId?: string;
}

// Movimiento enriquecido con saldo acumulado y referencia legible
export interface MovimientoEnriquecido {
  id: number;
  cajaId: number;
  tipo: string;
  monto: number;
  concepto: string;
  referencia: string | null;
  fecha: string;
  saldoAcumulado: number;
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

    const cajas = await prisma.caja.findMany({
      where,
      orderBy: { aperturaEn: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true } },
        movimientos: true,
        _count: { select: { movimientos: true } },
      },
    });

    // Calcular saldo actual en cada caja
    return cajas.map((caja: any) => {
      const ingresos = caja.movimientos
        .filter((m: any) => m.tipo === 'INGRESO')
        .reduce((s: number, m: any) => s + Number(m.monto), 0);
      const egresos = caja.movimientos
        .filter((m: any) => m.tipo === 'EGRESO')
        .reduce((s: number, m: any) => s + Number(m.monto), 0);
      const saldoActual = Number(caja.saldoApertura) + ingresos - egresos;
      const { movimientos: _m, ...rest } = caja;
      return { ...rest, ingresosTotales: ingresos, egresosTotales: egresos, saldoActual };
    });
  }

  async findById(id: number) {
    const caja = await prisma.caja.findUnique({
      where: { id },
      include: {
        usuario: { select: { id: true, nombre: true } },
        movimientos: {
          orderBy: { creadoEn: 'asc' },
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
        movimientos: true,
        _count: { select: { movimientos: true } },
      },
      orderBy: { aperturaEn: 'desc' },
    });

    if (!caja) return null;

    const ingresos = caja.movimientos
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const egresos = caja.movimientos
      .filter((m: any) => m.tipo === 'EGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const saldoCalculado = Number(caja.saldoApertura) + ingresos - egresos;
    const { movimientos: _m, ...rest } = caja;

    return { ...rest, ingresosTotales: ingresos, egresosTotales: egresos, saldoCalculado };
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

  /**
   * NUEVO: Obtiene movimientos de una caja con saldo acumulado cronológico.
   * Permite filtrar por fecha y tipo.
   */
  async getMovimientos(
    cajaId: number,
    filtros: { desde?: string; hasta?: string; tipo?: string }
  ): Promise<{
    caja: any;
    movimientos: MovimientoEnriquecido[];
    saldoInicial: number;
    totalIngresos: number;
    totalEgresos: number;
    saldoFinal: number;
  }> {
    // Validar caja
    const caja = await prisma.caja.findUnique({
      where: { id: cajaId },
      include: { usuario: { select: { id: true, nombre: true } } },
    });
    if (!caja) throw new Error('Caja no encontrada');

    // Construir where para movimientos
    const where: any = { cajaId };
    if (filtros.tipo && ['INGRESO', 'EGRESO'].includes(filtros.tipo)) {
      where.tipo = filtros.tipo;
    }
    if (filtros.desde || filtros.hasta) {
      where.creadoEn = {};
      if (filtros.desde) where.creadoEn.gte = new Date(filtros.desde);
      if (filtros.hasta) where.creadoEn.lte = new Date(filtros.hasta + 'T23:59:59');
    }

    // Validar fechas
    if (filtros.desde && isNaN(new Date(filtros.desde).getTime())) {
      throw new Error('Fecha inicio inválida');
    }
    if (filtros.hasta && isNaN(new Date(filtros.hasta).getTime())) {
      throw new Error('Fecha fin inválida');
    }

    const movimientosRaw = await prisma.movimientoCaja.findMany({
      where,
      orderBy: { creadoEn: 'asc' },
    });

    const saldoInicial = Number(caja.saldoApertura);

    // Calcular saldo acumulado
    let saldoAcumulado = saldoInicial;
    const movimientos: MovimientoEnriquecido[] = movimientosRaw.map((m: any) => {
      const monto = Number(m.monto);
      if (m.tipo === 'INGRESO') {
        saldoAcumulado += monto;
      } else {
        saldoAcumulado -= monto;
      }

      // Construir referencia legible
      let referencia: string | null = null;
      if (m.pagoId) referencia = `PAGO-${m.pagoId}`;
      else if (m.gastoId) referencia = `GASTO-${m.gastoId}`;

      return {
        id: m.id,
        cajaId: m.cajaId,
        tipo: m.tipo,
        monto,
        concepto: m.concepto,
        referencia,
        fecha: m.creadoEn.toISOString(),
        saldoAcumulado,
      };
    });

    const totalIngresos = movimientosRaw
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const totalEgresos = movimientosRaw
      .filter((m: any) => m.tipo === 'EGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const saldoFinal = saldoInicial + totalIngresos - totalEgresos;

    return {
      caja,
      movimientos,
      saldoInicial,
      totalIngresos,
      totalEgresos,
      saldoFinal,
    };
  }

  /**
   * NUEVO: Movimientos globales con filtro por caja, fecha y tipo.
   */
  async getMovimientosGlobal(filtros: FiltrosMovimientosDto) {
    const where: any = {};

    if (filtros.cajaId) {
      const cajaId = parseInt(filtros.cajaId);
      if (isNaN(cajaId)) throw new Error('cajaId inválido');
      where.cajaId = cajaId;
    }
    if (filtros.tipo && ['INGRESO', 'EGRESO'].includes(filtros.tipo)) {
      where.tipo = filtros.tipo;
    }
    if (filtros.desde || filtros.hasta) {
      where.creadoEn = {};
      if (filtros.desde) {
        if (isNaN(new Date(filtros.desde).getTime())) throw new Error('Fecha inicio inválida');
        where.creadoEn.gte = new Date(filtros.desde);
      }
      if (filtros.hasta) {
        if (isNaN(new Date(filtros.hasta).getTime())) throw new Error('Fecha fin inválida');
        where.creadoEn.lte = new Date(filtros.hasta + 'T23:59:59');
      }
    }

    const movimientos = await prisma.movimientoCaja.findMany({
      where,
      orderBy: { creadoEn: 'asc' },
      include: {
        caja: {
          select: {
            id: true,
            fecha: true,
            saldoApertura: true,
            estado: true,
            usuario: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    const totalIngresos = movimientos
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const totalEgresos = movimientos
      .filter((m: any) => m.tipo === 'EGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);

    const enriquecidos = movimientos.map((m: any) => {
      let referencia: string | null = null;
      if (m.pagoId) referencia = `PAGO-${m.pagoId}`;
      else if (m.gastoId) referencia = `GASTO-${m.gastoId}`;
      return {
        id: m.id,
        cajaId: m.cajaId,
        cajaNombre: `Caja ${m.caja.usuario.nombre} – ${new Date(m.caja.fecha).toLocaleDateString('es-PE')}`,
        cajaEstado: m.caja.estado,
        tipo: m.tipo,
        monto: Number(m.monto),
        concepto: m.concepto,
        referencia,
        fecha: m.creadoEn.toISOString(),
      };
    });

    return { movimientos: enriquecidos, totalIngresos, totalEgresos };
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
