// FILE: src/modules/contabilidad/contabilidad.service.ts
// Servicio principal del módulo de contabilidad.
// Sub-servicios: Plan de cuentas, Asientos contables, Reportes, Configuración.

import prisma from '../../prisma/client';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CuentaContableDto {
  codigo: string;
  nombre: string;
  tipo: 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO' | 'COSTO';
  naturaleza: 'DEUDORA' | 'ACREEDORA';
  padreId?: string;
  activa?: boolean;
}

export interface LineaAsientoDto {
  cuentaId: string;
  descripcion?: string;
  debe: number;
  haber: number;
}

export interface AsientoContableDto {
  fecha: string;
  descripcion: string;
  referencia?: string;
  tipo?: 'MANUAL' | 'AUTOMATICO';
  origenTipo?: string;
  origenId?: string;
  lineas: LineaAsientoDto[];
}

// ─── PLAN DE CUENTAS ──────────────────────────────────────────────────────────

export class CuentasContablesService {
  async findAll(query: { tipo?: string; activa?: string }) {
    const where: any = {};
    if (query.tipo) where.tipo = query.tipo;
    if (query.activa === 'true') where.activa = true;
    if (query.activa === 'false') where.activa = false;
    return prisma.cuentaContable.findMany({
      where,
      orderBy: { codigo: 'asc' },
      include: {
        padre: { select: { id: true, codigo: true, nombre: true } },
        _count: { select: { hijos: true, lineas: true } },
      },
    });
  }

  async findTree() {
    const all = await prisma.cuentaContable.findMany({
      orderBy: { codigo: 'asc' },
      include: {
        _count: { select: { hijos: true, lineas: true } },
      },
    });

    const map = new Map<string, any>();
    all.forEach((c) => map.set(c.id, { ...c, hijos: [] }));

    const roots: any[] = [];
    all.forEach((c) => {
      if (c.padreId) {
        const parent = map.get(c.padreId);
        if (parent) parent.hijos.push(map.get(c.id));
      } else {
        roots.push(map.get(c.id));
      }
    });

    return roots;
  }

  async findById(id: string) {
    const cuenta = await prisma.cuentaContable.findUnique({
      where: { id },
      include: {
        padre: { select: { id: true, codigo: true, nombre: true } },
        hijos: { orderBy: { codigo: 'asc' } },
      },
    });
    if (!cuenta) throw new Error('Cuenta contable no encontrada');
    return cuenta;
  }

  async create(dto: CuentaContableDto) {
    const exists = await prisma.cuentaContable.findUnique({ where: { codigo: dto.codigo } });
    if (exists) throw new Error(`Ya existe una cuenta con el código ${dto.codigo}`);

    if (dto.padreId) {
      const padre = await prisma.cuentaContable.findUnique({ where: { id: dto.padreId } });
      if (!padre) throw new Error('Cuenta padre no encontrada');
    }

    return prisma.cuentaContable.create({
      data: {
        codigo: dto.codigo,
        nombre: dto.nombre,
        tipo: dto.tipo,
        naturaleza: dto.naturaleza,
        padreId: dto.padreId ?? null,
        activa: dto.activa ?? true,
      },
    });
  }

  async update(id: string, dto: Partial<CuentaContableDto>) {
    await this.findById(id);

    if (dto.codigo) {
      const exists = await prisma.cuentaContable.findFirst({
        where: { codigo: dto.codigo, id: { not: id } },
      });
      if (exists) throw new Error(`Ya existe otra cuenta con el código ${dto.codigo}`);
    }

    return prisma.cuentaContable.update({
      where: { id },
      data: {
        ...(dto.codigo !== undefined && { codigo: dto.codigo }),
        ...(dto.nombre !== undefined && { nombre: dto.nombre }),
        ...(dto.tipo !== undefined && { tipo: dto.tipo }),
        ...(dto.naturaleza !== undefined && { naturaleza: dto.naturaleza }),
        ...(dto.padreId !== undefined && { padreId: dto.padreId || null }),
        ...(dto.activa !== undefined && { activa: dto.activa }),
      },
    });
  }

  async remove(id: string) {
    await this.findById(id);
    const hijos = await prisma.cuentaContable.count({ where: { padreId: id } });
    if (hijos > 0) throw new Error('No se puede eliminar una cuenta con subcuentas');
    const lineas = await prisma.lineaAsiento.count({ where: { cuentaId: id } });
    if (lineas > 0) throw new Error('No se puede eliminar una cuenta que tiene movimientos contables');
    return prisma.cuentaContable.delete({ where: { id } });
  }
}

// ─── ASIENTOS CONTABLES ───────────────────────────────────────────────────────

export class AsientosService {
  async findAll(query: { desde?: string; hasta?: string; tipo?: string; cuentaId?: string; referencia?: string; page?: string; limit?: string }) {
    const where: any = {};
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }
    if (query.tipo) where.tipo = query.tipo;
    if (query.referencia) where.referencia = { contains: query.referencia, mode: 'insensitive' };
    if (query.cuentaId) {
      where.lineas = { some: { cuentaId: query.cuentaId } };
    }

    const page = parseInt(query.page ?? '1');
    const limit = parseInt(query.limit ?? '50');
    const skip = (page - 1) * limit;

    const [total, items] = await Promise.all([
      prisma.asientoContable.count({ where }),
      prisma.asientoContable.findMany({
        where,
        orderBy: { fecha: 'desc' },
        skip,
        take: limit,
        include: {
          lineas: {
            include: {
              cuenta: { select: { id: true, codigo: true, nombre: true } },
            },
          },
        },
      }),
    ]);

    return { total, page, limit, items };
  }

  async findById(id: string) {
    const asiento = await prisma.asientoContable.findUnique({
      where: { id },
      include: {
        lineas: {
          include: {
            cuenta: { select: { id: true, codigo: true, nombre: true, tipo: true, naturaleza: true } },
          },
        },
      },
    });
    if (!asiento) throw new Error('Asiento contable no encontrado');
    return asiento;
  }

  async create(dto: AsientoContableDto) {
    if (!dto.lineas || dto.lineas.length === 0) {
      throw new Error('El asiento debe tener al menos una línea');
    }

    const totalDebe = dto.lineas.reduce((s, l) => s + l.debe, 0);
    const totalHaber = dto.lineas.reduce((s, l) => s + l.haber, 0);
    const diff = Math.abs(totalDebe - totalHaber);
    if (diff > 0.01) {
      throw new Error(`El asiento no está balanceado. Débitos: ${totalDebe.toFixed(2)}, Créditos: ${totalHaber.toFixed(2)}`);
    }

    // Verificar que las cuentas existan
    const cuentaIds = [...new Set(dto.lineas.map((l) => l.cuentaId))];
    const cuentas = await prisma.cuentaContable.findMany({
      where: { id: { in: cuentaIds } },
      select: { id: true },
    });
    if (cuentas.length !== cuentaIds.length) {
      throw new Error('Una o más cuentas contables no fueron encontradas');
    }

    return prisma.asientoContable.create({
      data: {
        fecha: new Date(dto.fecha),
        descripcion: dto.descripcion,
        referencia: dto.referencia,
        tipo: dto.tipo ?? 'MANUAL',
        origenTipo: dto.origenTipo,
        origenId: dto.origenId,
        lineas: {
          create: dto.lineas.map((l) => ({
            cuentaId: l.cuentaId,
            descripcion: l.descripcion,
            debe: l.debe,
            haber: l.haber,
          })),
        },
      },
      include: {
        lineas: {
          include: {
            cuenta: { select: { id: true, codigo: true, nombre: true } },
          },
        },
      },
    });
  }

  async remove(id: string) {
    const asiento = await this.findById(id);
    if (asiento.tipo === 'AUTOMATICO') {
      throw new Error('No se pueden eliminar asientos automáticos');
    }
    return prisma.asientoContable.delete({ where: { id } });
  }
}

// ─── REPORTES CONTABLES ───────────────────────────────────────────────────────

export class ReportesContablesService {
  async getLibroMayor(cuentaId: string, query: { desde?: string; hasta?: string }) {
    const cuenta = await prisma.cuentaContable.findUnique({
      where: { id: cuentaId },
      select: { id: true, codigo: true, nombre: true, naturaleza: true },
    });
    if (!cuenta) throw new Error('Cuenta contable no encontrada');

    const where: any = { cuentaId };
    if (query.desde || query.hasta) {
      where.asiento = { fecha: {} };
      if (query.desde) where.asiento.fecha.gte = new Date(query.desde);
      if (query.hasta) where.asiento.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    const lineas = await prisma.lineaAsiento.findMany({
      where,
      orderBy: { asiento: { fecha: 'asc' } },
      include: {
        asiento: { select: { id: true, numero: true, fecha: true, descripcion: true, referencia: true } },
      },
    });

    let saldoAcumulado = 0;
    const movimientos = lineas.map((l) => {
      const debe = Number(l.debe);
      const haber = Number(l.haber);
      if (cuenta.naturaleza === 'DEUDORA') {
        saldoAcumulado += debe - haber;
      } else {
        saldoAcumulado += haber - debe;
      }
      return {
        asientoId: l.asientoId,
        numero: l.asiento.numero,
        fecha: l.asiento.fecha,
        descripcion: l.descripcion ?? l.asiento.descripcion,
        referencia: l.asiento.referencia,
        debe,
        haber,
        saldoAcumulado,
      };
    });

    return { cuenta, movimientos, saldoFinal: saldoAcumulado };
  }

  async getBalanceComprobacion(query: { desde?: string; hasta?: string }) {
    const cuentas = await prisma.cuentaContable.findMany({
      where: { activa: true },
      orderBy: { codigo: 'asc' },
      include: {
        lineas: {
          where: query.desde || query.hasta
            ? {
                asiento: {
                  fecha: {
                    ...(query.desde && { gte: new Date(query.desde) }),
                    ...(query.hasta && { lte: new Date(query.hasta + 'T23:59:59') }),
                  },
                },
              }
            : undefined,
        },
      },
    });

    let totalDebe = 0;
    let totalHaber = 0;

    const filas = cuentas.map((c) => {
      const debe = c.lineas.reduce((s, l) => s + Number(l.debe), 0);
      const haber = c.lineas.reduce((s, l) => s + Number(l.haber), 0);
      const saldo = c.naturaleza === 'DEUDORA' ? debe - haber : haber - debe;
      totalDebe += debe;
      totalHaber += haber;
      return { id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, naturaleza: c.naturaleza, debe, haber, saldo };
    });

    return {
      filas: filas.filter((f) => f.debe > 0 || f.haber > 0),
      totales: { debe: totalDebe, haber: totalHaber, balanceado: Math.abs(totalDebe - totalHaber) < 0.01 },
    };
  }

  async getEstadoResultados(query: { desde?: string; hasta?: string }) {
    const where: any = { activa: true, tipo: { in: ['INGRESO', 'GASTO', 'COSTO'] } };
    const cuentas = await prisma.cuentaContable.findMany({
      where,
      orderBy: { codigo: 'asc' },
      include: {
        lineas: {
          where: query.desde || query.hasta
            ? {
                asiento: {
                  fecha: {
                    ...(query.desde && { gte: new Date(query.desde) }),
                    ...(query.hasta && { lte: new Date(query.hasta + 'T23:59:59') }),
                  },
                },
              }
            : undefined,
        },
      },
    });

    const ingresos: any[] = [];
    const gastos: any[] = [];
    let totalIngresos = 0;
    let totalGastos = 0;

    cuentas.forEach((c) => {
      const debe = c.lineas.reduce((s, l) => s + Number(l.debe), 0);
      const haber = c.lineas.reduce((s, l) => s + Number(l.haber), 0);
      const monto = c.naturaleza === 'ACREEDORA' ? haber - debe : debe - haber;
      const fila = { id: c.id, codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, monto };

      if (c.tipo === 'INGRESO') { ingresos.push(fila); totalIngresos += monto; }
      else { gastos.push(fila); totalGastos += monto; }
    });

    return {
      ingresos,
      gastos,
      totalIngresos,
      totalGastos,
      resultado: totalIngresos - totalGastos,
      utilidad: totalIngresos - totalGastos > 0,
    };
  }

  async getBalanceGeneral(query: { fecha?: string }) {
    const hastaFecha = query.fecha ? new Date(query.fecha + 'T23:59:59') : new Date();
    const tipos = { activos: ['ACTIVO'], pasivos: ['PASIVO'], patrimonio: ['PATRIMONIO'] };

    const cuentas = await prisma.cuentaContable.findMany({
      where: { activa: true, tipo: { in: ['ACTIVO', 'PASIVO', 'PATRIMONIO'] } },
      orderBy: { codigo: 'asc' },
      include: {
        lineas: {
          where: { asiento: { fecha: { lte: hastaFecha } } },
        },
      },
    });

    const grupos: Record<string, any[]> = { ACTIVO: [], PASIVO: [], PATRIMONIO: [] };
    const totales: Record<string, number> = { ACTIVO: 0, PASIVO: 0, PATRIMONIO: 0 };

    cuentas.forEach((c) => {
      const debe = c.lineas.reduce((s, l) => s + Number(l.debe), 0);
      const haber = c.lineas.reduce((s, l) => s + Number(l.haber), 0);
      const saldo = c.naturaleza === 'DEUDORA' ? debe - haber : haber - debe;
      grupos[c.tipo].push({ id: c.id, codigo: c.codigo, nombre: c.nombre, saldo });
      totales[c.tipo] += saldo;
    });

    const ecuacionBalanceada = Math.abs(totales.ACTIVO - (totales.PASIVO + totales.PATRIMONIO)) < 0.01;

    return {
      activos: grupos.ACTIVO,
      pasivos: grupos.PASIVO,
      patrimonio: grupos.PATRIMONIO,
      totales,
      ecuacionBalanceada,
      fecha: hastaFecha,
    };
  }
}

// ─── CONFIGURACIÓN CONTABLE ───────────────────────────────────────────────────

export class ConfigContableService {
  async findAll() {
    return prisma.configuracionContable.findMany();
  }

  async set(clave: string, cuentaId: string) {
    const cuenta = await prisma.cuentaContable.findUnique({ where: { id: cuentaId } });
    if (!cuenta) throw new Error('Cuenta contable no encontrada');

    return prisma.configuracionContable.upsert({
      where: { clave },
      update: { cuentaId },
      create: { clave, cuentaId },
    });
  }

  async remove(clave: string) {
    const cfg = await prisma.configuracionContable.findUnique({ where: { clave } });
    if (!cfg) throw new Error('Configuración no encontrada');
    return prisma.configuracionContable.delete({ where: { clave } });
  }

  async getMap(): Promise<Record<string, string>> {
    const all = await prisma.configuracionContable.findMany();
    return Object.fromEntries(all.map((c) => [c.clave, c.cuentaId]));
  }
}

// ─── MAPEO CATEGORÍAS → CUENTAS CONTABLES ─────────────────────────────────────

export class MapeoContableService {
  async findAll() {
    return prisma.mapeoContable.findMany({
      include: { cuenta: true },
      orderBy: [{ modulo: 'asc' }, { categoriaSlug: 'asc' }],
    });
  }

  async set(modulo: string, categoriaSlug: string, categoriaNombre: string, cuentaContableId: string) {
    const cuenta = await prisma.cuentaContable.findUnique({ where: { id: cuentaContableId } });
    if (!cuenta) throw new Error('Cuenta contable no encontrada');

    return prisma.mapeoContable.upsert({
      where: { modulo_categoriaSlug: { modulo, categoriaSlug } },
      update: { cuentaContableId, categoriaNombre },
      create: { modulo, categoriaSlug, categoriaNombre, cuentaContableId },
      include: { cuenta: true },
    });
  }
}

// Instancias exportadas
export const cuentasContablesService = new CuentasContablesService();
export const asientosService = new AsientosService();
export const reportesContablesService = new ReportesContablesService();
export const configContableService = new ConfigContableService();
export const mapeoContableService = new MapeoContableService();
