// FILE: src/modules/caja/caja.service.ts

import prisma from '../../prisma/client';
import { EstadoCaja, TipoMovimientoCaja } from '../../utils/enums';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface AbrirCajaDto {
  movimientoCuentaId: number;
  nombre?: string;
  observaciones?: string;
}

export interface CerrarCajaDto {
  saldoCierre: number;
  observaciones?: string;
  cuentaDestinoId?: number;
  /** N° de operación bancario del ingreso de devolución (solo aplica si hay cuentaDestinoId) */
  referencia?: string;
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
  async findAll(query: { estado?: string; usuarioId?: string; desde?: string; hasta?: string } & PaginacionQuery) {
    const where: any = {};
    if (query.estado) where.estado = query.estado as EstadoCaja;
    if (query.usuarioId) where.usuarioId = parseInt(query.usuarioId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    const { skip, take, page, limit } = paginar(query);

    const [total, cajas] = await Promise.all([
      prisma.caja.count({ where }),
      prisma.caja.findMany({
        where,
        orderBy: { aperturaEn: 'desc' },
        skip,
        take,
        include: {
          usuario: { select: { id: true, nombre: true } },
          movimientos: true,
          _count: { select: { movimientos: true } },
        },
      }),
    ]);

    const items = cajas.map((caja: any) => {
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

    return { items, total, page, limit };
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

  // Egresos de categoría CAJA_CHICA que aún no fueron usados para abrir ninguna caja
  async egresosDisponibles() {
    return prisma.movimientoCuentaV2.findMany({
      where: { tipo: 'EGRESO', categoriaEgreso: 'CAJA_CHICA', anulado: false, cajaApertura: null },
      orderBy: { fecha: 'desc' },
      include: {
        cuenta: { select: { id: true, nombre: true } },
        moneda: { select: { codigo: true, simbolo: true } },
      },
    });
  }

  async abrir(dto: AbrirCajaDto, usuarioId: number) {
    const cajaExistente = await this.cajaActual(usuarioId);
    if (cajaExistente) {
      throw new Error('Ya existe una caja abierta o registrada para hoy');
    }
    if (!dto.movimientoCuentaId) {
      throw new Error('Debe seleccionar un egreso de caja chica');
    }

    return prisma.$transaction(async (tx: any) => {
      // Releer el egreso dentro de la tx para evitar que dos aperturas usen el mismo
      const egreso = await tx.movimientoCuentaV2.findUnique({ where: { id: dto.movimientoCuentaId } });
      if (!egreso) throw new Error('Egreso no encontrado');
      if (egreso.tipo !== 'EGRESO' || egreso.categoriaEgreso !== 'CAJA_CHICA') {
        throw new Error('El movimiento seleccionado no es un egreso de categoría Caja chica');
      }
      if (egreso.anulado) throw new Error('El egreso seleccionado está anulado');

      const yaUsado = await tx.caja.findUnique({ where: { movimientoCuentaId: dto.movimientoCuentaId } });
      if (yaUsado) throw new Error('Este egreso ya fue usado para abrir otra caja');

      // La caja se abre con el monto y la cuenta del egreso ya registrado en
      // Movimientos — no se genera un segundo movimiento financiero.
      return tx.caja.create({
        data: {
          usuarioId,
          fecha: new Date(),
          nombre: dto.nombre ?? null,
          saldoApertura: egreso.monto,
          cuentaOrigenId: egreso.cuentaId,
          movimientoCuentaId: egreso.id,
          estado: EstadoCaja.ABIERTA,
          observaciones: dto.observaciones,
        },
      });
    });
  }

  async cerrar(id: number, dto: CerrarCajaDto, usuarioId: number) {
    const caja = await this.findById(id);

    if (caja.estado === EstadoCaja.CERRADA) {
      // Si la caja ya está cerrada y tenía cuenta destino, informar que ya fue procesado
      if ((caja as any).cuentaDestinoId) {
        throw new Error('La caja ya está cerrada y el saldo ya fue devuelto a la cuenta destino');
      }
      throw new Error('La caja ya está cerrada');
    }
    if (caja.usuarioId !== usuarioId) {
      throw new Error('No puede cerrar una caja de otro usuario');
    }

    // Si se especifica una cuenta destino, vincular el cierre a un INGRESO que
    // el usuario ya registró en Movimientos (por su N° de operación) — no se
    // genera un segundo movimiento financiero, se busca y se vincula el existente.
    if (dto.cuentaDestinoId) {
      const cuentaDestino = await prisma.cuentaDinero.findUnique({ where: { id: dto.cuentaDestinoId } });
      if (!cuentaDestino) throw new Error('Cuenta destino no encontrada');

      if (!dto.referencia || !dto.referencia.trim()) {
        throw new Error('Debe indicar el N° de operación del ingreso ya registrado para la devolución');
      }
      const referencia = dto.referencia.trim();

      const candidatos = await prisma.movimientoCuentaV2.findMany({
        where: { cuentaId: dto.cuentaDestinoId, tipo: 'INGRESO', referencia, anulado: false },
      });
      if (candidatos.length === 0) {
        throw new Error('No se encontró un ingreso con ese N° de operación en la cuenta seleccionada');
      }
      if (candidatos.length > 1) {
        throw new Error('Hay más de un ingreso con ese N° de operación en la cuenta seleccionada; corrige la referencia antes de continuar');
      }
      const ingreso = candidatos[0];

      return prisma.$transaction(async (tx: any) => {
        const yaVinculado = await tx.caja.findUnique({ where: { movimientoCierreId: ingreso.id } });
        if (yaVinculado) throw new Error('Ese ingreso ya está vinculado al cierre de otra caja');

        return tx.caja.update({
          where: { id },
          data: {
            estado: EstadoCaja.CERRADA,
            saldoCierre: dto.saldoCierre,
            cierreEn: new Date(),
            observaciones: dto.observaciones,
            cuentaDestinoId: dto.cuentaDestinoId,
            movimientoCierreId: ingreso.id,
          },
        });
      });
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

  async getMovimientosGlobal(filtros: FiltrosMovimientosDto & PaginacionQuery) {
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

    // Totales calculados sobre TODOS los movimientos que cumplen el filtro (no solo la página actual)
    const todosActivos = await prisma.movimientoCaja.findMany({
      where: { ...where, anulado: false },
      select: { tipo: true, monto: true },
    });
    const totalIngresos = todosActivos
      .filter((m: any) => m.tipo === 'INGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);
    const totalEgresos = todosActivos
      .filter((m: any) => m.tipo === 'EGRESO')
      .reduce((s: number, m: any) => s + Number(m.monto), 0);

    const { skip, take, page, limit } = paginar(filtros);

    const [total, movimientos] = await Promise.all([
      prisma.movimientoCaja.count({ where }),
      prisma.movimientoCaja.findMany({
        where,
        orderBy: { creadoEn: 'asc' },
        skip,
        take,
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
      }),
    ]);

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

    return { items: enriquecidos, total, page, limit, totalIngresos, totalEgresos };
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
