// FILE: src/modules/cobranza/cobranza.service.ts
// CHAT 9: cuentaId ahora es OBLIGATORIO al registrar un cobro.
// Al crear un pago se genera MovimientoCuentaV2 (INGRESO) dentro de la misma
// transacción. Al anular un pago se revierte el MovimientoCuentaV2 y el
// MovimientoCaja si existe.

import prisma from '../../prisma/client';
import { EstadoFactura } from '../../utils/enums';
import { cuentasService } from '../configuracion/cuentas.service';

export interface CreatePagoDto {
  facturaId: number;
  monto: number;
  metodoPago: string;
  referencia?: string;
  observaciones?: string;
  fechaPago?: string;
  // CHAT 9: obligatorios
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
    clienteId?: string; metodoPago?: string;
    desde?: string; hasta?: string; facturaId?: string;
  }) {
    const where: any = { anulado: false };
    if (query.clienteId) where.clienteId = parseInt(query.clienteId);
    if (query.metodoPago) where.metodoPago = query.metodoPago;
    if (query.facturaId) where.facturaId = parseInt(query.facturaId);
    if (query.desde || query.hasta) {
      where.fechaPago = {};
      if (query.desde) where.fechaPago.gte = new Date(query.desde);
      if (query.hasta) where.fechaPago.lte = new Date(query.hasta + 'T23:59:59');
    }
    return prisma.pago.findMany({
      where,
      orderBy: { fechaPago: 'desc' },
      include: {
        factura: { select: { id: true, numeroFactura: true, total: true, estado: true, totalPagado: true } },
        cliente: { select: { id: true, razonSocial: true, ruc: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  async findById(id: number) {
    const pago = await prisma.pago.findUnique({
      where: { id },
      include: { factura: true, cliente: true, usuario: { select: { id: true, nombre: true } } },
    });
    if (!pago) throw new Error('Pago no encontrado');
    return pago;
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

    // FIX ERROR 1: resolver monedaId desde la cuenta si no viene o es inválido
    let monedaId = dto.monedaId && dto.monedaId > 0 ? dto.monedaId : 0;
    if (!monedaId) {
      const cuenta = await prisma.cuentaDinero.findUnique({
        where: { id: dto.cuentaId },
        select: { monedaId: true },
      });
      if (!cuenta) throw new Error('Cuenta no encontrada');
      monedaId = cuenta.monedaId;
    }

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

      // 3. Crear MovimientoCuentaV2 (INGRESO) — obligatorio
      const movCuenta = await cuentasService._registrarMovimientoEnTx(tx, {
        cuentaId: dto.cuentaId,
        tipo: 'INGRESO',
        monto: dto.monto,
        monedaId,           // FIX: usa el monedaId resuelto desde la cuenta
        tipoPagoId: dto.tipoPagoId,
        concepto: `Cobro factura ${factura.numeroFactura}`,
        referencia: `PAGO-${pago.id}`,
        usuarioId,
        fecha: dto.fechaPago,
      });

      // 4. Si existe caja abierta, también crear MovimientoCaja
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
      // Revertir movimiento de cuenta si existe
      const movCuenta = await tx.movimientoCuentaV2.findFirst({
        where: { referencia: `PAGO-${id}`, tipo: 'INGRESO' },
      });
      if (movCuenta) {
        await cuentasService._revertirMovimientoEnTx(tx, movCuenta.id, 0);
      }

      await tx.pago.delete({ where: { id } });

      // Recalcular estado factura
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

  async cuentasPorCobrar() {
    const facturas = await prisma.factura.findMany({
      where: { estado: { in: [EstadoFactura.EMITIDA, EstadoFactura.PENDIENTE, EstadoFactura.PARCIAL] } },
      include: {
        cliente: { select: { id: true, razonSocial: true, ruc: true } },
      },
      orderBy: { fechaVencimiento: 'asc' },
    });

    const ahora = new Date();
    return facturas.map((f: any) => {
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
  }
}

export const cobranzaService = new CobranzaService();
