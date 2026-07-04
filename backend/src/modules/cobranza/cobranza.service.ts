// FILE: src/modules/cobranza/cobranza.service.ts
// Módulo Cobranza: aplica pagos de clientes (PagoV2 con categoriaIngreso =
// PAGO_FACTURA en su movimiento de cuenta) a una o más facturas del mismo
// cliente. Reemplaza la vinculación 1:1 que antes vivía en Movimientos.

import prisma from '../../prisma/client';
import { EstadoFactura } from '../../utils/enums';

export interface AplicarPagoDto {
  aplicaciones: Array<{ facturaId: number; monto: number }>;
}

const PAGO_INCLUDE = {
  cliente: { select: { id: true, razonSocial: true, ruc: true } },
  aplicaciones: {
    include: { factura: { select: { id: true, numeroFactura: true, total: true } } },
  },
  movimientoCuenta: { select: { id: true, concepto: true, fecha: true, cuenta: { select: { nombre: true } } } },
} as const;

export class CobranzaService {
  async listar(query: {
    estado?: 'por_aplicar' | 'aplicado'; desde?: string; hasta?: string;
    clienteId?: string; search?: string;
  } = {}) {
    const where: any = {
      anulado: false,
      movimientoCuenta: { categoriaIngreso: 'PAGO_FACTURA' },
    };
    if (query.desde || query.hasta) {
      where.fechaPago = {};
      if (query.desde) where.fechaPago.gte = new Date(query.desde);
      if (query.hasta) where.fechaPago.lte = new Date(query.hasta + 'T23:59:59');
    }
    if (query.clienteId) where.clienteId = parseInt(query.clienteId);
    if (query.search) {
      where.cliente = {
        OR: [
          { razonSocial: { contains: query.search, mode: 'insensitive' } },
          { ruc: { contains: query.search, mode: 'insensitive' } },
        ],
      };
    }

    const pagos = await prisma.pagoV2.findMany({
      where,
      include: PAGO_INCLUDE,
      orderBy: { fechaPago: 'desc' },
    });

    const conSaldo = pagos.map((p) => {
      const aplicado = p.aplicaciones.reduce((s, a) => s + Number(a.monto), 0);
      const saldoPorAplicar = Number(p.monto) - aplicado;
      return { ...p, saldoPorAplicar };
    });

    if (query.estado === 'por_aplicar') return conSaldo.filter((p) => p.saldoPorAplicar > 0.01);
    if (query.estado === 'aplicado') return conSaldo.filter((p) => p.saldoPorAplicar <= 0.01);
    return conSaldo;
  }

  async facturasPendientes(filtros: { clienteId?: number } = {}) {
    const facturas = await prisma.factura.findMany({
      where: {
        ...(filtros.clienteId ? { clienteId: filtros.clienteId } : {}),
        estado: { in: [EstadoFactura.EMITIDA, EstadoFactura.PENDIENTE, EstadoFactura.PARCIAL] },
      },
      orderBy: { fechaVencimiento: 'asc' },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    });

    return facturas.map((f) => {
      const pagado = Number(f.totalPagado || 0);
      const saldo = Number(f.total) - pagado;
      return {
        id: f.id,
        numeroFactura: f.numeroFactura,
        cliente: f.cliente,
        total: Number(f.total),
        pagado,
        saldoPendiente: saldo,
        estado: f.estado,
        fechaVencimiento: f.fechaVencimiento,
        vencida: f.fechaVencimiento < new Date(),
      };
    }).filter((f) => f.saldoPendiente > 0.01);
  }

  /**
   * Estado de cuenta de un cliente: separa las facturas pendientes en
   * vencidas / por vencer, con el total de cada grupo y el total general.
   */
  async estadoCuenta(clienteId: number) {
    const cliente = await prisma.cliente.findUnique({ where: { id: clienteId } });
    if (!cliente) throw new Error('Cliente no encontrado');

    const facturas = await this.facturasPendientes({ clienteId });
    const vencidas = facturas.filter((f) => f.vencida);
    const porVencer = facturas.filter((f) => !f.vencida);
    const totalVencidas = vencidas.reduce((s, f) => s + f.saldoPendiente, 0);
    const totalPorVencer = porVencer.reduce((s, f) => s + f.saldoPendiente, 0);

    return {
      cliente: { id: cliente.id, razonSocial: cliente.razonSocial, ruc: cliente.ruc },
      vencidas,
      porVencer,
      totalVencidas,
      totalPorVencer,
      totalGeneral: totalVencidas + totalPorVencer,
    };
  }

  private async _recalcularFactura(tx: any, facturaId: number) {
    const factura = await tx.factura.findUnique({ where: { id: facturaId } });
    if (!factura || factura.estado === EstadoFactura.ANULADA) return;

    const aplicaciones = await tx.pagoV2AplicacionFactura.findMany({
      where: { facturaId, pago: { anulado: false } },
      select: { monto: true },
    });
    const totalPagado = aplicaciones.reduce((s: number, a: any) => s + Number(a.monto), 0);
    const total = Number(factura.total);
    let estado: string;
    if (totalPagado <= 0) estado = EstadoFactura.EMITIDA;
    else if (Math.abs(totalPagado - total) < 0.01 || totalPagado >= total) estado = EstadoFactura.PAGADA;
    else estado = EstadoFactura.PARCIAL;

    await tx.factura.update({ where: { id: facturaId }, data: { totalPagado, estado } });
  }

  async aplicar(pagoId: number, dto: AplicarPagoDto, usuarioId: number) {
    if (!dto.aplicaciones || dto.aplicaciones.length === 0) {
      throw new Error('Debe indicar al menos una factura para aplicar el pago');
    }

    const pago = await prisma.pagoV2.findUnique({
      where: { id: pagoId },
      include: { aplicaciones: true },
    });
    if (!pago) throw new Error('Pago no encontrado');
    if (pago.anulado) throw new Error('Este pago está anulado');
    if (!pago.clienteId) throw new Error('Este pago no tiene un cliente asociado');

    const yaAplicado = pago.aplicaciones.reduce((s, a) => s + Number(a.monto), 0);
    const saldoPorAplicar = Number(pago.monto) - yaAplicado;

    const montoTotalNuevo = dto.aplicaciones.reduce((s, a) => s + a.monto, 0);
    if (montoTotalNuevo <= 0) throw new Error('El monto a aplicar debe ser mayor a 0');
    if (montoTotalNuevo > saldoPorAplicar + 0.01) {
      throw new Error(`El monto a aplicar (S/${montoTotalNuevo.toFixed(2)}) excede el saldo sin aplicar del pago (S/${saldoPorAplicar.toFixed(2)})`);
    }

    const facturaIds = dto.aplicaciones.map((a) => a.facturaId);
    if (new Set(facturaIds).size !== facturaIds.length) {
      throw new Error('No se puede aplicar el pago dos veces a la misma factura en la misma operación');
    }

    const facturas = await prisma.factura.findMany({ where: { id: { in: facturaIds } } });
    if (facturas.length !== facturaIds.length) throw new Error('Una o más facturas no fueron encontradas');

    for (const f of facturas) {
      if (f.clienteId !== pago.clienteId) throw new Error(`La factura ${f.numeroFactura} no pertenece al cliente de este pago`);
      if (f.estado === EstadoFactura.ANULADA) throw new Error(`La factura ${f.numeroFactura} está anulada`);
      const aplicacion = dto.aplicaciones.find((a) => a.facturaId === f.id)!;
      const saldoPendienteFactura = Number(f.total) - Number(f.totalPagado || 0);
      if (aplicacion.monto > saldoPendienteFactura + 0.01) {
        throw new Error(`El monto (S/${aplicacion.monto.toFixed(2)}) excede el saldo pendiente de la factura ${f.numeroFactura} (S/${saldoPendienteFactura.toFixed(2)})`);
      }
    }

    return prisma.$transaction(async (tx: any) => {
      for (const a of dto.aplicaciones) {
        const existente = await tx.pagoV2AplicacionFactura.findUnique({
          where: { pagoId_facturaId: { pagoId, facturaId: a.facturaId } },
        });
        if (existente) {
          await tx.pagoV2AplicacionFactura.update({
            where: { id: existente.id },
            data: { monto: { increment: a.monto } },
          });
        } else {
          await tx.pagoV2AplicacionFactura.create({
            data: { pagoId, facturaId: a.facturaId, monto: a.monto, creadoPorId: usuarioId },
          });
        }
        await this._recalcularFactura(tx, a.facturaId);
      }

      return tx.pagoV2.findUnique({ where: { id: pagoId }, include: PAGO_INCLUDE });
    });
  }

  async quitarAplicacion(aplicacionId: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede quitar una aplicación de pago');

    const aplicacion = await prisma.pagoV2AplicacionFactura.findUnique({ where: { id: aplicacionId } });
    if (!aplicacion) throw new Error('Aplicación no encontrada');

    return prisma.$transaction(async (tx: any) => {
      await tx.pagoV2AplicacionFactura.delete({ where: { id: aplicacionId } });
      await this._recalcularFactura(tx, aplicacion.facturaId);
      return { message: 'Aplicación quitada correctamente' };
    });
  }
}

export const cobranzaService = new CobranzaService();
