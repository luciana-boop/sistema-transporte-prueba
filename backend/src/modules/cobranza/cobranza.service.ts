// FILE: src/modules/cobranza/cobranza.service.ts
// MODIFICADO: flujo cliente→factura, pagos parciales, estado automático PARCIAL

import prisma from '../../prisma/client';
import { EstadoFactura } from '../../utils/enums';
import { facturacionService } from '../facturacion/facturacion.service';

export interface CreatePagoDto {
  facturaId: number;
  monto: number;
  metodoPago: string;
  referencia?: string;
  observaciones?: string;
  fechaPago?: string;
}

export class CobranzaService {
  async findAll(query: {
    clienteId?: string; metodoPago?: string;
    desde?: string; hasta?: string; facturaId?: string;
  }) {
    const where: any = {};
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

  // Facturas pendientes/parciales de un cliente específico
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

    const resultado = await prisma.$transaction(async (tx: any) => {
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

      // Recalculate totalPagado and estado
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

      // Auto-register in open caja if exists
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
            pagoId: pago.id,
          },
        });
      }

      return pago;
    });

    return this.findById(resultado.id);
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar pagos');
    const pago = await this.findById(id);

    await prisma.$transaction(async (tx: any) => {
      await tx.pago.delete({ where: { id } });
      // Recalculate factura state after deletion
      const factura = await tx.factura.findUnique({
        where: { id: pago.facturaId },
        include: { pagos: { select: { monto: true } } },
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
