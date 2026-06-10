// FILE: src/modules/configuracion/cuentas.service.ts
// CHAT 9: Agrega _registrarMovimientoEnTx() — helper interno que opera dentro
// de una transacción externa. Permite que gastos, combustible, cobranza y caja
// llamen a la lógica de movimiento+saldo dentro de su propio $transaction,
// garantizando atomicidad completa.
// El método público registrarMovimiento() existente se mantiene sin cambios.

import prisma from '../../prisma/client';
import { paginar, PaginacionQuery } from '../../utils/pagination';

// ── Default data ──────────────────────────────────────────────────────────────

const DEFAULTS_MONEDAS = [
  { codigo: 'PEN', nombre: 'Sol Peruano',      simbolo: 'S/',  esPorDefecto: true  },
  { codigo: 'USD', nombre: 'Dólar Americano',  simbolo: '$',   esPorDefecto: false },
  { codigo: 'EUR', nombre: 'Euro',             simbolo: '€',   esPorDefecto: false },
];

const DEFAULTS_TIPOS_PAGO = [
  { codigo: 'EFECTIVO',      nombre: 'Efectivo',          orden: 1 },
  { codigo: 'TRANSFERENCIA', nombre: 'Transferencia',      orden: 2 },
  { codigo: 'YAPE',          nombre: 'Yape',               orden: 3 },
  { codigo: 'PLIN',          nombre: 'Plin',               orden: 4 },
  { codigo: 'DEPOSITO',      nombre: 'Depósito bancario',  orden: 5 },
  { codigo: 'TARJETA',       nombre: 'Tarjeta',            orden: 6 },
  { codigo: 'CHEQUE',        nombre: 'Cheque',             orden: 7 },
];

// ── DTO para movimiento interno ───────────────────────────────────────────────

export interface MovimientoInternoDto {
  cuentaId: number;
  tipo: 'INGRESO' | 'EGRESO';
  monto: number;
  monedaId: number;
  tipoPagoId?: number;
  concepto: string;
  referencia?: string;
  usuarioId: number;
  fecha?: string;
  liquidacionId?: number;
}

export class CuentasService {

  // ── Inicializar defaults ────────────────────────────────────────────────────
  async inicializarDefaults() {
    for (const m of DEFAULTS_MONEDAS) {
      await prisma.moneda.upsert({ where: { codigo: m.codigo }, update: {}, create: m });
    }
    for (const t of DEFAULTS_TIPOS_PAGO) {
      await prisma.tipoPago.upsert({ where: { codigo: t.codigo }, update: {}, create: t });
    }

    // Create default cuentas if none exist
    const count = await prisma.cuentaDinero.count();
    if (count === 0) {
      const pen = await prisma.moneda.findUnique({ where: { codigo: 'PEN' } });
      const usd = await prisma.moneda.findUnique({ where: { codigo: 'USD' } });
      if (pen) {
        await prisma.cuentaDinero.createMany({
          data: [
            { nombre: 'Caja Soles',    tipoCuenta: 'CAJA',  monedaId: pen.id, saldoInicial: 0, saldoActual: 0 },
            { nombre: 'Banco BCP',     tipoCuenta: 'BANCO', monedaId: pen.id, saldoInicial: 0, saldoActual: 0, banco: 'BCP' },
          ],
        });
      }
      if (usd) {
        await prisma.cuentaDinero.create({
          data: { nombre: 'Caja Dólares', tipoCuenta: 'CAJA', monedaId: usd.id, saldoInicial: 0, saldoActual: 0 },
        });
      }
    }
    return { message: 'Monedas, tipos de pago y cuentas inicializadas' };
  }

  // ── MONEDAS ─────────────────────────────────────────────────────────────────
  async getMonedas() {
    return prisma.moneda.findMany({ orderBy: [{ esPorDefecto: 'desc' }, { codigo: 'asc' }] });
  }

  async getMonedasActivas() {
    return prisma.moneda.findMany({ where: { activo: true }, orderBy: [{ esPorDefecto: 'desc' }, { codigo: 'asc' }] });
  }

  async getMonedaDefault() {
    const m = await prisma.moneda.findFirst({ where: { activo: true, esPorDefecto: true } });
    return m ?? await prisma.moneda.findFirst({ where: { activo: true }, orderBy: { codigo: 'asc' } });
  }

  async createMoneda(dto: { codigo: string; nombre: string; simbolo: string; esPorDefecto?: boolean }) {
    const existe = await prisma.moneda.findUnique({ where: { codigo: dto.codigo.toUpperCase() } });
    if (existe) throw new Error(`La moneda ${dto.codigo} ya existe`);
    if (dto.esPorDefecto) {
      await prisma.moneda.updateMany({ data: { esPorDefecto: false } });
    }
    return prisma.moneda.create({ data: { ...dto, codigo: dto.codigo.toUpperCase() } });
  }

  async updateMoneda(id: number, dto: { nombre?: string; simbolo?: string; activo?: boolean; esPorDefecto?: boolean }) {
    const m = await prisma.moneda.findUnique({ where: { id } });
    if (!m) throw new Error('Moneda no encontrada');
    if (dto.esPorDefecto) {
      await prisma.moneda.updateMany({ data: { esPorDefecto: false } });
    }
    return prisma.moneda.update({ where: { id }, data: dto });
  }

  async deleteMoneda(id: number) {
    const m = await prisma.moneda.findUnique({ where: { id } });
    if (!m) throw new Error('Moneda no encontrada');
    if (m.esPorDefecto) throw new Error('No se puede eliminar la moneda por defecto');
    const enUso = await prisma.cuentaDinero.count({ where: { monedaId: id } });
    if (enUso > 0) throw new Error('La moneda está en uso en cuentas');
    return prisma.moneda.delete({ where: { id } });
  }

  // ── TIPOS DE PAGO ───────────────────────────────────────────────────────────
  async getTiposPago() {
    return prisma.tipoPago.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
  }

  async getTiposPagoActivos() {
    return prisma.tipoPago.findMany({ where: { activo: true }, orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] });
  }

  async createTipoPago(dto: { codigo: string; nombre: string; descripcion?: string; orden?: number }) {
    const existe = await prisma.tipoPago.findUnique({ where: { codigo: dto.codigo.toUpperCase() } });
    if (existe) throw new Error(`El tipo de pago ${dto.codigo} ya existe`);
    return prisma.tipoPago.create({ data: { ...dto, codigo: dto.codigo.toUpperCase() } });
  }

  async updateTipoPago(id: number, dto: { nombre?: string; descripcion?: string; activo?: boolean; orden?: number }) {
    const t = await prisma.tipoPago.findUnique({ where: { id } });
    if (!t) throw new Error('Tipo de pago no encontrado');
    return prisma.tipoPago.update({ where: { id }, data: dto });
  }

  async deleteTipoPago(id: number) {
    const t = await prisma.tipoPago.findUnique({ where: { id } });
    if (!t) throw new Error('Tipo de pago no encontrado');
    const enUso = await prisma.pagoV2.count({ where: { tipoPagoId: id } });
    if (enUso > 0) throw new Error('El tipo de pago está en uso en pagos');
    return prisma.tipoPago.delete({ where: { id } });
  }

  // ── CUENTAS DE DINERO ───────────────────────────────────────────────────────
  async getCuentas(soloActivas = false) {
    return prisma.cuentaDinero.findMany({
      where: soloActivas ? { activo: true } : undefined,
      orderBy: [{ tipoCuenta: 'asc' }, { nombre: 'asc' }],
      include: { moneda: { select: { codigo: true, nombre: true, simbolo: true } } },
    });
  }

  async getCuenta(id: number) {
    const c = await prisma.cuentaDinero.findUnique({
      where: { id },
      include: {
        moneda: true,
        movimientos: {
          orderBy: { fecha: 'desc' },
          take: 50,
          include: {
            tipoPago: { select: { nombre: true } },
            usuario: { select: { nombre: true } },
          },
        },
      },
    });
    if (!c) throw new Error('Cuenta no encontrada');
    return c;
  }

  async createCuenta(dto: {
    nombre: string; tipoCuenta: string; monedaId: number;
    saldoInicial?: number; descripcion?: string; banco?: string; numeroCuenta?: string;
  }) {
    const moneda = await prisma.moneda.findUnique({ where: { id: dto.monedaId } });
    if (!moneda) throw new Error('Moneda no encontrada');
    const saldo = dto.saldoInicial ?? 0;
    return prisma.cuentaDinero.create({
      data: { ...dto, saldoInicial: saldo, saldoActual: saldo },
      include: { moneda: { select: { codigo: true, simbolo: true } } },
    });
  }

  async updateCuenta(id: number, dto: {
    nombre?: string; tipoCuenta?: string; monedaId?: number;
    activo?: boolean; descripcion?: string; banco?: string; numeroCuenta?: string;
  }) {
    await this.getCuenta(id);
    return prisma.cuentaDinero.update({
      where: { id }, data: dto,
      include: { moneda: { select: { codigo: true, simbolo: true } } },
    });
  }

  async deleteCuenta(id: number) {
    await this.getCuenta(id);
    const movs = await prisma.movimientoCuentaV2.count({ where: { cuentaId: id } });
    if (movs > 0) {
      return prisma.cuentaDinero.update({ where: { id }, data: { activo: false } });
    }
    return prisma.cuentaDinero.delete({ where: { id } });
  }

  // ── MOVIMIENTOS POR CUENTA ──────────────────────────────────────────────────
  async getMovimientos(query: {
    cuentaId?: number; tipo?: string; desde?: string; hasta?: string;
  } & PaginacionQuery) {
    const where: any = {};
    if (query.cuentaId) where.cuentaId = query.cuentaId;
    if (query.tipo) where.tipo = query.tipo;
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
    const { skip, take, page, limit } = paginar(query);
    const [total, items] = await Promise.all([
      prisma.movimientoCuentaV2.count({ where }),
      prisma.movimientoCuentaV2.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip,
        take,
        include: {
          cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
          moneda: { select: { codigo: true, simbolo: true } },
          tipoPago: { select: { nombre: true } },
          usuario: { select: { id: true, nombre: true } },
          liquidacion: { select: { id: true, conductor: { select: { nombre: true } } } },
        },
      }),
    ]);
    return { items, total, page, limit };
  }

  // ── P7: origen del movimiento (a partir de la referencia / vínculos) ────────
  private _inferirOrigen(mov: any): string {
    const ref: string = mov.referencia || '';
    if (mov.liquidacion) {
      return `Liquidación #${mov.liquidacion.id}${mov.liquidacion.conductor ? ' — ' + mov.liquidacion.conductor.nombre : ''}`;
    }
    if (ref.startsWith('GASTO-')) return `Gasto #${ref.replace('GASTO-', '')}`;
    if (ref.startsWith('COMBUSTIBLE-')) return `Combustible #${ref.replace('COMBUSTIBLE-', '')}`;
    if (ref.startsWith('PAGO-')) return `Cobranza — Pago #${ref.replace('PAGO-', '')}`;
    if (ref.startsWith('LIQUIDACION-')) return `Liquidación #${ref.replace('LIQUIDACION-', '')}`;
    if (ref.startsWith('REINTEGRO-LIQ-')) return `Reintegro liquidación #${ref.replace('REINTEGRO-LIQ-', '')}`;
    if (ref.startsWith('DEVOLUCION-LIQ-')) return `Devolución liquidación #${ref.replace('DEVOLUCION-LIQ-', '')}`;
    if (ref.startsWith('CAJA-')) return `Caja #${ref.replace('CAJA-', '')}`;
    if (ref.startsWith('REV-MOV-')) return `Reverso del movimiento #${ref.replace('REV-MOV-', '')}`;
    return 'Movimiento manual';
  }

  // ── P7: ver detalle ──────────────────────────────────────────────────────────
  async obtenerMovimiento(id: number) {
    const mov = await prisma.movimientoCuentaV2.findUnique({
      where: { id },
      include: {
        cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
        moneda: { select: { codigo: true, nombre: true, simbolo: true } },
        tipoPago: { select: { id: true, nombre: true } },
        usuario: { select: { id: true, nombre: true } },
        liquidacion: { select: { id: true, conductor: { select: { nombre: true } } } },
      },
    });
    if (!mov) throw new Error('Movimiento no encontrado');
    return { ...mov, origen: this._inferirOrigen(mov) };
  }

  // ── P7: edición controlada (no afecta saldo: monto/tipo/cuenta no editables) ─
  async actualizarMovimiento(id: number, dto: {
    concepto?: string; referencia?: string; fecha?: string; tipoPagoId?: number | null;
  }) {
    const mov = await prisma.movimientoCuentaV2.findUnique({ where: { id } });
    if (!mov) throw new Error('Movimiento no encontrado');
    if (mov.anulado) throw new Error('No se puede editar un movimiento anulado');
    if (mov.referencia?.startsWith('REV-MOV-')) throw new Error('No se puede editar un movimiento de reverso');

    return prisma.movimientoCuentaV2.update({
      where: { id },
      data: {
        ...(dto.concepto !== undefined && { concepto: dto.concepto }),
        ...(dto.referencia !== undefined && { referencia: dto.referencia || null }),
        ...(dto.fecha !== undefined && { fecha: new Date(dto.fecha) }),
        ...(dto.tipoPagoId !== undefined && { tipoPagoId: dto.tipoPagoId || null }),
      },
      include: {
        cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
        moneda: { select: { codigo: true, simbolo: true } },
        tipoPago: { select: { nombre: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  // ── P7: anular — revierte el saldo y mantiene trazabilidad (movimiento REVERSO)
  async anularMovimiento(id: number, usuarioId: number) {
    const mov = await prisma.movimientoCuentaV2.findUnique({ where: { id } });
    if (!mov) throw new Error('Movimiento no encontrado');
    if (mov.anulado) throw new Error('El movimiento ya está anulado');
    if (mov.referencia?.startsWith('REV-MOV-')) throw new Error('No se puede anular un movimiento de reverso');

    return prisma.$transaction(async (tx: any) => {
      const reverso = await this._revertirMovimientoEnTx(tx, id, usuarioId);
      await tx.movimientoCuentaV2.update({ where: { id }, data: { anulado: true } });
      return reverso;
    });
  }

  // ── HELPER INTERNO: registrar movimiento dentro de una tx externa ────────────
  // Uso: llamar desde otros services dentro de su propio prisma.$transaction(tx => ...)
  // NO abre transacción propia. Valida saldo antes de escribir.
  async _registrarMovimientoEnTx(tx: any, dto: MovimientoInternoDto) {
    // Re-leer saldo dentro de la tx para evitar race conditions
    const cuenta = await tx.cuentaDinero.findUnique({ where: { id: dto.cuentaId } });
    if (!cuenta) throw new Error('Cuenta no encontrada');
    if (!cuenta.activo) throw new Error('La cuenta está inactiva');
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    // Validar saldo suficiente para egresos
    if (dto.tipo === 'EGRESO') {
      const saldoActual = Number(cuenta.saldoActual);
      if (saldoActual < dto.monto) {
        throw new Error(
          `Saldo insuficiente en la cuenta seleccionada. ` +
          `Saldo disponible: ${cuenta.saldoActual} | Monto requerido: ${dto.monto.toFixed(2)}`
        );
      }
    }

    const mov = await tx.movimientoCuentaV2.create({
      data: {
        cuentaId: dto.cuentaId,
        tipo: dto.tipo,
        monto: dto.monto,
        monedaId: dto.monedaId,
        tipoPagoId: dto.tipoPagoId ?? null,
        concepto: dto.concepto,
        referencia: dto.referencia ?? null,
        usuarioId: dto.usuarioId,
        liquidacionId: dto.liquidacionId ?? null,
        fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
      },
    });

    // Actualizar saldo
    const delta = dto.tipo === 'INGRESO' ? dto.monto : -dto.monto;
    await tx.cuentaDinero.update({
      where: { id: dto.cuentaId },
      data: { saldoActual: { increment: delta } },
    });

    return mov;
  }

  // ── REVERTIR movimiento dentro de una tx externa ────────────────────────────
  // Crea un movimiento compensatorio opuesto al original.
  // Usado en anulaciones (cobros, pagos de liquidación).
  // FIX ERROR 2/3: si usuarioId es 0 o inválido, se usa el usuarioId del movimiento original
  async _revertirMovimientoEnTx(tx: any, movimientoCuentaId: number, usuarioId: number) {
    const mov = await tx.movimientoCuentaV2.findUnique({
      where: { id: movimientoCuentaId },
    });
    if (!mov) throw new Error('Movimiento de cuenta no encontrado');

    // Tipo opuesto
    const tipoOpuesto = mov.tipo === 'INGRESO' ? 'EGRESO' : 'INGRESO';

    // Validar saldo si el reverso es un egreso
    if (tipoOpuesto === 'EGRESO') {
      const cuenta = await tx.cuentaDinero.findUnique({ where: { id: mov.cuentaId } });
      if (!cuenta) throw new Error('Cuenta del movimiento no encontrada');
      if (Number(cuenta.saldoActual) < Number(mov.monto)) {
        throw new Error(
          `No se puede revertir: saldo insuficiente en la cuenta. ` +
          `Saldo: ${cuenta.saldoActual} | Monto a revertir: ${mov.monto}`
        );
      }
    }

    // FIX: usar usuarioId del movimiento original si no se pasa uno válido
    const usuarioIdFinal = (usuarioId && usuarioId > 0) ? usuarioId : mov.usuarioId;

    const movReverso = await tx.movimientoCuentaV2.create({
      data: {
        cuentaId: mov.cuentaId,
        tipo: tipoOpuesto,
        monto: mov.monto,
        monedaId: mov.monedaId,
        concepto: `REVERSO — ${mov.concepto}`,
        referencia: `REV-MOV-${movimientoCuentaId}`,
        usuarioId: usuarioIdFinal,
        fecha: new Date(),
      },
    });

    const delta = tipoOpuesto === 'INGRESO' ? Number(mov.monto) : -Number(mov.monto);
    await tx.cuentaDinero.update({
      where: { id: mov.cuentaId },
      data: { saldoActual: { increment: delta } },
    });

    return movReverso;
  }

  // ── MÉTODO PÚBLICO (sin cambios) ────────────────────────────────────────────
  async registrarMovimiento(dto: {
    cuentaId: number; tipo: 'INGRESO' | 'EGRESO';
    monto: number; monedaId: number; tipoPagoId?: number;
    concepto: string; referencia?: string;
    usuarioId: number; fecha?: string;
  }) {
    const cuenta = await prisma.cuentaDinero.findUnique({ where: { id: dto.cuentaId } });
    if (!cuenta) throw new Error('Cuenta no encontrada');
    if (!cuenta.activo) throw new Error('La cuenta está inactiva');
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    if (dto.tipo === 'EGRESO') {
      const saldoActual = Number(cuenta.saldoActual);
      if (saldoActual < dto.monto) {
        throw new Error(
          `Saldo insuficiente en la cuenta seleccionada. ` +
          `Saldo disponible: ${cuenta.saldoActual} | Monto requerido: ${dto.monto.toFixed(2)}`
        );
      }
    }

    return prisma.$transaction(async (tx: any) => {
      return this._registrarMovimientoEnTx(tx, { ...dto, fecha: dto.fecha });
    });
  }

  // ── RESUMEN DASHBOARD ───────────────────────────────────────────────────────
  async getResumenFinanciero() {
    const cuentas = await prisma.cuentaDinero.findMany({
      where: { activo: true },
      include: { moneda: { select: { codigo: true, simbolo: true } } },
    });

    // Group by moneda
    const porMoneda: Record<string, { simbolo: string; total: number }> = {};
    for (const c of cuentas) {
      const key = c.moneda.codigo;
      if (!porMoneda[key]) porMoneda[key] = { simbolo: c.moneda.simbolo, total: 0 };
      porMoneda[key].total += Number(c.saldoActual);
    }

    // Recent movements
    const movRecientes = await prisma.movimientoCuentaV2.findMany({
      orderBy: { fecha: 'desc' },
      take: 10,
      include: {
        cuenta: { select: { nombre: true } },
        moneda: { select: { simbolo: true } },
      },
    });

    // Ingresos/egresos last 30 days
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);

    const [ingresos, egresos] = await Promise.all([
      prisma.movimientoCuentaV2.aggregate({
        where: { tipo: 'INGRESO', fecha: { gte: hace30 } },
        _sum: { monto: true },
      }),
      prisma.movimientoCuentaV2.aggregate({
        where: { tipo: 'EGRESO', fecha: { gte: hace30 } },
        _sum: { monto: true },
      }),
    ]);

    return {
      cuentas,
      porMoneda,
      movRecientes,
      ultimos30dias: {
        ingresos: Number(ingresos._sum.monto || 0),
        egresos: Number(egresos._sum.monto || 0),
      },
    };
  }
}

export const cuentasService = new CuentasService();
