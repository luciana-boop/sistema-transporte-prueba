// FILE: src/modules/configuracion/cuentas.service.ts

import prisma from '../../prisma/client';

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
  }) {
    const where: any = {};
    if (query.cuentaId) where.cuentaId = query.cuentaId;
    if (query.tipo) where.tipo = query.tipo;
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
    return prisma.movimientoCuentaV2.findMany({
      where,
      orderBy: { fecha: 'desc' },
      take: 200,
      include: {
        cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
        moneda: { select: { codigo: true, simbolo: true } },
        tipoPago: { select: { nombre: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  async registrarMovimiento(dto: {
    cuentaId: number; tipo: 'INGRESO' | 'EGRESO' | 'TRANSFERENCIA';
    monto: number; monedaId: number; tipoPagoId?: number;
    concepto: string; referencia?: string;
    cuentaDestinoId?: number; usuarioId: number; fecha?: string;
  }) {
    const cuenta = await prisma.cuentaDinero.findUnique({ where: { id: dto.cuentaId } });
    if (!cuenta) throw new Error('Cuenta no encontrada');
    if (!cuenta.activo) throw new Error('La cuenta está inactiva');
    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');

    return prisma.$transaction(async (tx: any) => {
      const mov = await tx.movimientoCuentaV2.create({
        data: {
          cuentaId: dto.cuentaId,
          tipo: dto.tipo,
          monto: dto.monto,
          monedaId: dto.monedaId,
          tipoPagoId: dto.tipoPagoId,
          concepto: dto.concepto,
          referencia: dto.referencia,
          cuentaDestinoId: dto.cuentaDestinoId,
          usuarioId: dto.usuarioId,
          fecha: dto.fecha ? new Date(dto.fecha) : new Date(),
        },
      });

      // Update saldo
      const delta = dto.tipo === 'INGRESO' ? dto.monto : -dto.monto;
      await tx.cuentaDinero.update({
        where: { id: dto.cuentaId },
        data: { saldoActual: { increment: delta } },
      });

      // Transfer: credit destination
      if (dto.tipo === 'TRANSFERENCIA' && dto.cuentaDestinoId) {
        await tx.cuentaDinero.update({
          where: { id: dto.cuentaDestinoId },
          data: { saldoActual: { increment: dto.monto } },
        });
      }

      return mov;
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
