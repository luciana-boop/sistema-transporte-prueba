// FILE: src/modules/caja/caja.service.ts

import prisma from '../../prisma/client';
import { EstadoCaja, TipoMovimientoCaja } from '../../utils/enums';
import { cuentasService } from '../configuracion/cuentas.service';

export interface AbrirCajaDto {
  saldoApertura: number;
  cuentaOrigenId: number;
  nombre?: string;
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
  fecha?: string;
  referencia?: string;
}

export interface FiltrosMovimientosDto {
  desde?: string;
  hasta?: string;
  tipo?: string;
  cajaId?: string;
}

export interface EditarMovimientoDto {
  monto?: number;
  concepto?: string;
  fecha?: string;
  referencia?: string;
}

export interface MovimientoEnriquecido {
  id: number;
  cajaId: number;
  tipo: string;
  monto: number;
  concepto: string;
  referencia: string | null;
  fecha: string;
  saldoAcumulado: number;
  anulado: boolean;
  esManual: boolean;
  esLiquidacion: boolean;
  liquidacionId?: number;
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

    return cajas.map((caja: any) => {
      const activos = caja.movimientos.filter((m: any) => !m.anulado);
      const ingresos = activos
        .filter((m: any) => m.tipo === 'INGRESO')
        .reduce((s: number, m: any) => s + Number(m.monto), 0);
      const egresos = activos
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

    const activos = caja.movimientos.filter((m: any) => !m.anulado);
    const ingresos = activos
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const egresos = activos
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
        estado: EstadoCaja.ABIERTA,
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

    const activos = caja.movimientos.filter((m: any) => !m.anulado);
    const ingresos = activos
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const egresos = activos
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
    if (!dto.cuentaOrigenId) {
      throw new Error('Debe seleccionar la cuenta de origen de los fondos de apertura');
    }

    const cuentaOrigen = await prisma.cuentaDinero.findUnique({ where: { id: dto.cuentaOrigenId } });
    if (!cuentaOrigen) throw new Error('Cuenta de origen no encontrada');
    if (!cuentaOrigen.activo) throw new Error('La cuenta de origen está inactiva');

    return prisma.$transaction(async (tx: any) => {
      // 1. Crear la caja
      const caja = await tx.caja.create({
        data: {
          usuarioId,
          fecha: new Date(),
          nombre: dto.nombre ?? null,
          saldoApertura: dto.saldoApertura,
          cuentaOrigenId: dto.cuentaOrigenId,
          estado: EstadoCaja.ABIERTA,
          observaciones: dto.observaciones,
        },
      });

      // 2. Movimiento de salida automático en la cuenta de origen: el efectivo
      // de apertura sale de esa cuenta hacia la caja chica (valida saldo dentro de la tx)
      if (dto.saldoApertura > 0) {
        await cuentasService._registrarMovimientoEnTx(tx, {
          cuentaId: dto.cuentaOrigenId,
          tipo: 'EGRESO',
          monto: dto.saldoApertura,
          monedaId: cuentaOrigen.monedaId,
          concepto: `Apertura de caja${dto.nombre ? ` — ${dto.nombre}` : ''}`,
          referencia: `APERTURA-CAJA-${caja.id}`,
          usuarioId,
        });
      }

      return caja;
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
        fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
        referencia: dto.referencia ?? null,
      },
    });
  }

  // ─── MOVIMIENTOS ──────────────────────────────────────────────────────────

  async getMovimientos(
    cajaId: number,
    filtros: { desde?: string; hasta?: string; tipo?: string }
  ) {
    const caja = await prisma.caja.findUnique({
      where: { id: cajaId },
      include: { usuario: { select: { id: true, nombre: true } } },
    });
    if (!caja) throw new Error('Caja no encontrada');

    const where: any = { cajaId };
    if (filtros.tipo && ['INGRESO', 'EGRESO'].includes(filtros.tipo)) {
      where.tipo = filtros.tipo;
    }
    if (filtros.desde || filtros.hasta) {
      where.creadoEn = {};
      if (filtros.desde) where.creadoEn.gte = new Date(filtros.desde);
      if (filtros.hasta) where.creadoEn.lte = new Date(filtros.hasta + 'T23:59:59');
    }

    if (filtros.desde && isNaN(new Date(filtros.desde).getTime())) throw new Error('Fecha inicio inválida');
    if (filtros.hasta && isNaN(new Date(filtros.hasta).getTime())) throw new Error('Fecha fin inválida');

    const movimientosRaw = await prisma.movimientoCaja.findMany({
      where,
      orderBy: { creadoEn: 'asc' },
    });

    const saldoInicial = Number(caja.saldoApertura);
    let saldoAcumulado = saldoInicial;

    const movimientos: MovimientoEnriquecido[] = movimientosRaw.map((m: any) => {
      const monto = Number(m.monto);
      if (!m.anulado) {
        if (m.tipo === 'INGRESO') saldoAcumulado += monto;
        else saldoAcumulado -= monto;
      }

      let referencia: string | null = m.referencia ?? null;
      if (!referencia && m.pagoId) referencia = `PAGO-${m.pagoId}`;
      else if (!referencia && m.gastoId) referencia = `GASTO-${m.gastoId}`;

      const esLiquidacion = !!(m.referencia && m.referencia.startsWith('LIQUIDACION-'));
      const liquidacionId = esLiquidacion
        ? parseInt(m.referencia.replace('LIQUIDACION-', ''))
        : undefined;

      return {
        id: m.id,
        cajaId: m.cajaId,
        tipo: m.tipo,
        monto,
        concepto: m.concepto,
        referencia,
        fecha: (m.fecha ?? m.creadoEn).toISOString(),
        saldoAcumulado,
        anulado: m.anulado,
        esManual: !m.pagoId && !m.gastoId && !m.movimientoCuentaId,
        esLiquidacion,
        liquidacionId,
      };
    });

    const activosRaw = movimientosRaw.filter((m: any) => !m.anulado);
    const totalIngresos = activosRaw
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const totalEgresos = activosRaw
      .filter((m: any) => m.tipo === 'EGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const saldoFinal = saldoInicial + totalIngresos - totalEgresos;

    return { caja, movimientos, saldoInicial, totalIngresos, totalEgresos, saldoFinal };
  }

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
            nombre: true,
            fecha: true,
            saldoApertura: true,
            estado: true,
            usuario: { select: { id: true, nombre: true } },
          },
        },
      },
    });

    const movimientosActivos = movimientos.filter((m: any) => !m.anulado);
    const totalIngresos = movimientosActivos
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const totalEgresos = movimientosActivos
      .filter((m: any) => m.tipo === 'EGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);

    const enriquecidos = movimientos.map((m: any) => {
      let referencia: string | null = m.referencia ?? null;
      if (!referencia && m.pagoId) referencia = `PAGO-${m.pagoId}`;
      else if (!referencia && m.gastoId) referencia = `GASTO-${m.gastoId}`;
      return {
        id: m.id,
        cajaId: m.cajaId,
        cajaNombre: m.caja.nombre ?? `Caja ${m.caja.usuario.nombre} – ${new Date(m.caja.fecha).toLocaleDateString('es-PE')}`,
        cajaEstado: m.caja.estado,
        tipo: m.tipo,
        monto: Number(m.monto),
        concepto: m.concepto,
        referencia,
        fecha: (m.fecha ?? m.creadoEn).toISOString(),
      };
    });

    return { movimientos: enriquecidos, totalIngresos, totalEgresos };
  }

  async editarMovimiento(movimientoId: number, dto: EditarMovimientoDto, usuarioId: number) {
    const mov = await prisma.movimientoCaja.findUnique({
      where: { id: movimientoId },
      include: { caja: true },
    });
    if (!mov) throw new Error('Movimiento no encontrado');
    if (mov.anulado) throw new Error('No se puede editar un movimiento anulado');
    if (mov.pagoId || mov.gastoId) throw new Error('No se pueden editar movimientos generados automáticamente');
    if (mov.caja.usuarioId !== usuarioId) throw new Error('No puede editar movimientos de otro usuario');
    if (mov.caja.estado === 'CERRADA') throw new Error('No se pueden editar movimientos de una caja cerrada');
    if (dto.monto !== undefined && dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    return prisma.movimientoCaja.update({
      where: { id: movimientoId },
      data: {
        ...(dto.monto !== undefined && { monto: dto.monto }),
        ...(dto.concepto !== undefined && { concepto: dto.concepto }),
        ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
        ...(dto.referencia !== undefined && { referencia: dto.referencia }),
      },
    });
  }

  async anularMovimiento(movimientoId: number, usuarioId: number) {
    const mov = await prisma.movimientoCaja.findUnique({
      where: { id: movimientoId },
      include: { caja: true },
    });
    if (!mov) throw new Error('Movimiento no encontrado');
    if (mov.anulado) throw new Error('El movimiento ya está anulado');
    if (mov.pagoId || mov.gastoId) throw new Error('No se pueden anular movimientos generados automáticamente');
    if (mov.caja.usuarioId !== usuarioId) throw new Error('No puede anular movimientos de otro usuario');
    if (mov.caja.estado === 'CERRADA') throw new Error('No se pueden anular movimientos de una caja cerrada');

    return prisma.movimientoCaja.update({
      where: { id: movimientoId },
      data: { anulado: true },
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
