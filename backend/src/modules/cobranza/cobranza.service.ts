// FILE: src/modules/cobranza/cobranza.service.ts
// FIX PROBLEMA 2: MovimientoCaja solo se crea cuando la cuenta es de tipo CAJA.
// Las cuentas bancarias (BANCO, DIGITAL) solo generan MovimientoCuentaV2.

import prisma from '../../prisma/client';
import { EstadoFactura } from '../../utils/enums';
import { cuentasService } from '../configuracion/cuentas.service';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface CreatePagoDto {
  facturaId: number;
  monto: number;
  metodoPago: string;
  referencia?: string;
  observaciones?: string;
  fechaPago?: string;
  cuentaId: number;
  monedaId: number;
  tipoPagoId?: number;
}

export interface UpdatePagoDto {
  metodoPago?: string;
  referencia?: string;
  observaciones?: string;
  fechaPago?: string;
}

export class CobranzaService {
  async findAll(query: {
    clienteId?: string; metodoPago?: string; estado?: string;
    desde?: string; hasta?: string; facturaId?: string;
  } & PaginacionQuery) {
    const where: any = { anulado: false };
    if (query.clienteId) where.clienteId = parseInt(query.clienteId);
    if (query.metodoPago) where.metodoPago = query.metodoPago;
    if (query.facturaId) where.facturaId = parseInt(query.facturaId);
    // P8: filtro "Estado" — el pago no tiene estado propio relevante para el usuario,
    // se filtra por el estado de la factura asociada (mismo criterio que en "Cuentas por cobrar")
    if (query.estado) where.factura = { estado: query.estado as any };
    if (query.desde || query.hasta) {
      where.fechaPago = {};
      if (query.desde) where.fechaPago.gte = new Date(query.desde);
      if (query.hasta) where.fechaPago.lte = new Date(query.hasta + 'T23:59:59');
    }

    const { skip, take, page, limit } = paginar(query);

    const [total, items] = await Promise.all([
      prisma.pago.count({ where }),
      prisma.pago.findMany({
        where,
        orderBy: { fechaPago: 'desc' },
        skip,
        take,
        include: {
          factura: { select: { id: true, numeroFactura: true, total: true, estado: true, totalPagado: true } },
          cliente: { select: { id: true, razonSocial: true, ruc: true } },
          usuario: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: number) {
    const pago = await prisma.pago.findUnique({
      where: { id },
      include: { factura: true, cliente: true, usuario: { select: { id: true, nombre: true } } },
    });
    if (!pago) throw new Error('Pago no encontrado');

    // P8: enriquecer con el movimiento financiero generado — el Pago no almacena
    // cuentaId/monedaId directamente, se obtienen del MovimientoCuentaV2 vinculado por referencia
    const movimiento = await prisma.movimientoCuentaV2.findFirst({
      where: { referencia: `PAGO-${pago.id}`, tipo: 'INGRESO' },
      include: {
        cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
        moneda: { select: { codigo: true, nombre: true, simbolo: true } },
      },
    });

    return { ...pago, movimiento };
  }

  async facturasPendientesPorCliente(clienteId: number) {
    const facturas = await prisma.factura.findMany({
      where: {
        clienteId,
        estado: { in: [EstadoFactura.EMITIDA, EstadoFactura.PENDIENTE, EstadoFactura.PARCIAL] },
      },
      orderBy: { fechaVencimiento: 'asc' },
      include: { pagos: { select: { monto: true } } },
    });

    return facturas.map((f: any) => {
      const pagado = Number(f.totalPagado || 0);
      const saldo = Number(f.total) - pagado;
      return {
        id: f.id,
        numeroFactura: f.numeroFactura,
        total: Number(f.total),
        pagado,
        saldoPendiente: saldo,
        estado: f.estado,
        fechaVencimiento: f.fechaVencimiento,
        vencida: f.fechaVencimiento < new Date(),
      };
    }).filter((f: any) => f.saldoPendiente > 0.01);
  }

  async create(dto: CreatePagoDto, usuarioId: number) {
    if (!dto.cuentaId) throw new Error('Debe seleccionar una cuenta para registrar el cobro');

    const factura = await prisma.factura.findUnique({ where: { id: dto.facturaId } });
    if (!factura) throw new Error('Factura no encontrada');
    if (factura.estado === EstadoFactura.ANULADA) throw new Error('No se puede registrar pago en una factura anulada');
    if (factura.estado === EstadoFactura.PAGADA) throw new Error('La factura ya está completamente pagada');

    const totalPagadoActual = Number(factura.totalPagado || 0);
    const saldoPendiente = Number(factura.total) - totalPagadoActual;

    if (dto.monto <= 0) throw new Error('El monto debe ser mayor a 0');
    if (dto.monto > saldoPendiente + 0.01) {
      throw new Error(`El monto (S/${dto.monto.toFixed(2)}) excede el saldo pendiente (S/${saldoPendiente.toFixed(2)})`);
    }

    // Resolver monedaId desde la cuenta si no viene o es inválido
    let monedaId = dto.monedaId && dto.monedaId > 0 ? dto.monedaId : 0;
    if (!monedaId) {
      const cuenta = await prisma.cuentaDinero.findUnique({
        where: { id: dto.cuentaId },
        select: { monedaId: true },
      });
      if (!cuenta) throw new Error('Cuenta no encontrada');
      monedaId = cuenta.monedaId;
    }

    // FIX PROBLEMA 2: verificar tipo de cuenta ANTES de la transacción
    const cuentaInfo = await prisma.cuentaDinero.findUnique({
      where: { id: dto.cuentaId },
      select: { tipoCuenta: true },
    });
    if (!cuentaInfo) throw new Error('Cuenta no encontrada');
    const esCuentaCaja = cuentaInfo.tipoCuenta === 'CAJA';

    const resultado = await prisma.$transaction(async (tx: any) => {
      // 1. Crear el pago
      const pago = await tx.pago.create({
        data: {
          facturaId: dto.facturaId,
          clienteId: factura.clienteId,
          usuarioId,
          monto: dto.monto,
          metodoPago: dto.metodoPago as any,
          referencia: dto.referencia,
          observaciones: dto.observaciones,
          fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
        },
      });

      // 2. Recalcular totalPagado y estado de factura
      const nuevoTotalPagado = totalPagadoActual + dto.monto;
      const total = Number(factura.total);
      let nuevoEstado: string;
      if (Math.abs(nuevoTotalPagado - total) < 0.01 || nuevoTotalPagado >= total) {
        nuevoEstado = EstadoFactura.PAGADA;
      } else {
        nuevoEstado = EstadoFactura.PARCIAL;
      }

      await tx.factura.update({
        where: { id: dto.facturaId },
        data: { totalPagado: nuevoTotalPagado, estado: nuevoEstado as any },
      });

      // 3. Crear MovimientoCuentaV2 (INGRESO) — siempre obligatorio
      const movCuenta = await cuentasService._registrarMovimientoEnTx(tx, {
        cuentaId: dto.cuentaId,
        tipo: 'INGRESO',
        monto: dto.monto,
        monedaId,
        tipoPagoId: dto.tipoPagoId,
        concepto: `Cobro factura ${factura.numeroFactura}`,
        referencia: `PAGO-${pago.id}`,
        usuarioId,
        fecha: dto.fechaPago,
      });

      // 4. FIX PROBLEMA 2: Solo crear MovimientoCaja si la cuenta es de tipo CAJA
      if (esCuentaCaja) {
        const cajaAbierta = await tx.caja.findFirst({
          where: { estado: 'ABIERTA', usuarioId },
          orderBy: { aperturaEn: 'desc' },
        });
        if (cajaAbierta) {
          await tx.movimientoCaja.create({
            data: {
              cajaId: cajaAbierta.id,
              tipo: 'INGRESO',
              monto: dto.monto,
              concepto: `Cobro factura ${factura.numeroFactura}`,
              referencia: `PAGO-${pago.id}`,
              pagoId: pago.id,
              movimientoCuentaId: movCuenta.id,
              fecha: dto.fechaPago ? new Date(dto.fechaPago) : new Date(),
            },
          });
        }
      }

      return pago;
    });

    return this.findById(resultado.id);
  }

  async update(id: number, dto: UpdatePagoDto, usuarioRol: string) {
    const pago = await this.findById(id);
    if (pago.anulado) throw new Error('No se puede editar un pago anulado');

    return prisma.pago.update({
      where: { id },
      data: {
        metodoPago: dto.metodoPago as any ?? pago.metodoPago,
        referencia: dto.referencia !== undefined ? dto.referencia : pago.referencia,
        observaciones: dto.observaciones !== undefined ? dto.observaciones : pago.observaciones,
        fechaPago: dto.fechaPago ? new Date(dto.fechaPago) : pago.fechaPago,
      },
      include: {
        factura: { select: { id: true, numeroFactura: true } },
        cliente: { select: { id: true, razonSocial: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  async anular(id: number, usuarioRol: string, motivo?: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede anular pagos');
    const pago = await this.findById(id);
    if (pago.anulado) throw new Error('El pago ya está anulado');

    await prisma.$transaction(async (tx: any) => {
      // 1. Marcar pago como anulado
      await tx.pago.update({
        where: { id },
        data: {
          anulado: true,
          motivoAnulacion: motivo ?? 'Anulado por administrador',
          anuladoEn: new Date(),
        },
      });

      // 2. Recalcular totalPagado de la factura (solo pagos activos)
      const factura = await tx.factura.findUnique({
        where: { id: pago.facturaId },
        include: { pagos: { where: { anulado: false }, select: { monto: true } } },
      });
      if (factura && factura.estado !== EstadoFactura.ANULADA) {
        const totalPagado = factura.pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);
        const total = Number(factura.total);
        let estado: string;
        if (totalPagado <= 0) estado = EstadoFactura.EMITIDA;
        else if (Math.abs(totalPagado - total) < 0.01) estado = EstadoFactura.PAGADA;
        else estado = EstadoFactura.PARCIAL;
        await tx.factura.update({ where: { id: pago.facturaId }, data: { totalPagado, estado: estado as any } });
      }

      // 3. Revertir MovimientoCuentaV2 si existe (buscar por referencia)
      const movCuenta = await tx.movimientoCuentaV2.findFirst({
        where: { referencia: `PAGO-${id}`, tipo: 'INGRESO' },
      });
      if (movCuenta) {
        await cuentasService._revertirMovimientoEnTx(tx, movCuenta.id, 0);
      }

      // 4. Anular MovimientoCaja si existe y está vinculado a este pago
      await tx.movimientoCaja.updateMany({
        where: { pagoId: id, anulado: false },
        data: { anulado: true },
      });
    });

    return { message: 'Pago anulado correctamente' };
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar pagos');
    const pago = await this.findById(id);

    await prisma.$transaction(async (tx: any) => {
      const movCuenta = await tx.movimientoCuentaV2.findFirst({
        where: { referencia: `PAGO-${id}`, tipo: 'INGRESO' },
      });
      if (movCuenta) {
        await cuentasService._revertirMovimientoEnTx(tx, movCuenta.id, 0);
      }

      await tx.pago.delete({ where: { id } });

      const factura = await tx.factura.findUnique({
        where: { id: pago.facturaId },
        include: { pagos: { where: { anulado: false }, select: { monto: true } } },
      });
      if (factura) {
        const totalPagado = factura.pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);
        const total = Number(factura.total);
        let estado: string;
        if (totalPagado <= 0) estado = EstadoFactura.EMITIDA;
        else if (Math.abs(totalPagado - total) < 0.01) estado = EstadoFactura.PAGADA;
        else estado = EstadoFactura.PARCIAL;
        await tx.factura.update({ where: { id: pago.facturaId }, data: { totalPagado, estado: estado as any } });
      }
    });

    return { message: 'Pago eliminado' };
  }

  async cuentasPorCobrar(query: {
    clienteId?: string; estado?: string; desde?: string; hasta?: string;
  } & PaginacionQuery = {}) {
    // P8: filtros consistentes con "Pagos registrados" — Desde/Hasta/Cliente/Estado
    const where: any = {
      estado: query.estado
        ? (query.estado as any)
        : { in: [EstadoFactura.EMITIDA, EstadoFactura.PENDIENTE, EstadoFactura.PARCIAL] },
    };
    if (query.clienteId) where.clienteId = parseInt(query.clienteId);
    // Convención del módulo de facturación: el rango Desde/Hasta filtra por fecha de emisión
    if (query.desde || query.hasta) {
      where.fechaEmision = {};
      if (query.desde) where.fechaEmision.gte = new Date(query.desde);
      if (query.hasta) where.fechaEmision.lte = new Date(query.hasta + 'T23:59:59');
    }

    const { skip, take, page, limit } = paginar(query);

    const [total, facturas] = await Promise.all([
      prisma.factura.count({ where }),
      prisma.factura.findMany({
        where,
        include: {
          cliente: { select: { id: true, razonSocial: true, ruc: true } },
        },
        orderBy: { fechaVencimiento: 'asc' },
        skip,
        take,
      }),
    ]);

    const ahora = new Date();
    const items = facturas.map((f: any) => {
      const pagado = Number(f.totalPagado || 0);
      const saldo = Number(f.total) - pagado;
      const vencida = f.fechaVencimiento < ahora;
      const diasVencida = vencida
        ? Math.floor((ahora.getTime() - f.fechaVencimiento.getTime()) / (1000 * 60 * 60 * 24))
        : 0;
      return {
        facturaId: f.id,
        numeroFactura: f.numeroFactura,
        cliente: f.cliente,
        total: Number(f.total),
        pagado,
        saldoPendiente: saldo,
        fechaVencimiento: f.fechaVencimiento,
        vencida,
        diasVencida,
        estado: f.estado,
      };
    }).filter((f: any) => f.saldoPendiente > 0.01);

    return { items, total, page, limit };
  }

  /**
   * P8: vista de detalle uniforme para "Cuentas por cobrar".
   * La factura no almacena cuenta/moneda/método de pago — esos datos surgen del
   * último pago activo asociado (si existe) y de su MovimientoCuentaV2 vinculado,
   * igual que en el detalle de "Pagos registrados".
   */
  async detalleCuentaPorCobrar(facturaId: number) {
    const factura = await prisma.factura.findUnique({
      where: { id: facturaId },
      include: { cliente: { select: { id: true, razonSocial: true, ruc: true } } },
    });
    if (!factura) throw new Error('Factura no encontrada');

    const ultimoPago = await prisma.pago.findFirst({
      where: { facturaId, anulado: false },
      orderBy: { fechaPago: 'desc' },
      include: { usuario: { select: { id: true, nombre: true } } },
    });

    let movimiento: any = null;
    if (ultimoPago) {
      movimiento = await prisma.movimientoCuentaV2.findFirst({
        where: { referencia: `PAGO-${ultimoPago.id}`, tipo: 'INGRESO' },
        include: {
          cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
          moneda: { select: { codigo: true, nombre: true, simbolo: true } },
        },
      });
    }

    return {
      facturaId: factura.id,
      numeroFactura: factura.numeroFactura,
      cliente: factura.cliente,
      fecha: factura.fechaEmision,
      estado: factura.estado,
      observaciones: factura.observaciones,
      ultimoPago: ultimoPago ? {
        id: ultimoPago.id,
        monto: Number(ultimoPago.monto),
        metodoPago: ultimoPago.metodoPago,
        fechaPago: ultimoPago.fechaPago,
        usuario: ultimoPago.usuario,
      } : null,
      cuenta: movimiento?.cuenta ?? null,
      moneda: movimiento?.moneda ?? null,
      movimiento: movimiento ? { referencia: movimiento.referencia, concepto: movimiento.concepto } : null,
    };
  }
}

export const cobranzaService = new CobranzaService();
