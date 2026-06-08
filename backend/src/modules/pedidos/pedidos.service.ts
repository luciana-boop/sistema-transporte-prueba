// FILE: src/modules/pedidos/pedidos.service.ts

import prisma from '../../prisma/client';
import { EstadoPedido } from '../../utils/enums';

export interface CreatePedidoDto {
  clienteId: number;
  origen: string;
  destino: string;
  tipoCarga: string;
  tarifa: number;
  observaciones?: string;
}

export interface UpdatePedidoDto extends Partial<CreatePedidoDto> {}

export class PedidosService {
  async findAll(query: {
    estado?: string;
    clienteId?: string;
    desde?: string;
    hasta?: string;
    search?: string;
  }) {
    const where: any = {};
    if (query.estado) where.estado = query.estado as EstadoPedido;
    if (query.clienteId) where.clienteId = parseInt(query.clienteId);
    if (query.desde || query.hasta) {
      where.fechaPedido = {};
      if (query.desde) where.fechaPedido.gte = new Date(query.desde);
      if (query.hasta) where.fechaPedido.lte = new Date(query.hasta + 'T23:59:59');
    }
    if (query.search) {
      where.OR = [
        { origen: { contains: query.search, mode: 'insensitive' } },
        { destino: { contains: query.search, mode: 'insensitive' } },
        { tipoCarga: { contains: query.search, mode: 'insensitive' } },
        { cliente: { razonSocial: { contains: query.search, mode: 'insensitive' } } },
        { cliente: { ruc: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    return prisma.pedido.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true, ruc: true } },
        usuario: { select: { id: true, nombre: true } },
      },
    });
  }

  /**
   * Devuelve pedidos disponibles para facturar de un cliente específico.
   * Reglas: estado ACTIVO, pertenecientes al cliente, sin factura activa asociada.
   * Este endpoint es el que consume el formulario de nueva factura.
   */
  async findDisponiblesParaFacturar(clienteId: number) {
    return prisma.pedido.findMany({
      where: {
        clienteId,
        estado: EstadoPedido.ACTIVO,
        // Excluir pedidos que ya tienen al menos una factura no anulada
        facturas: {
          none: {
            estado: { not: 'ANULADA' },
          },
        },
      },
      orderBy: { fechaPedido: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true, ruc: true } },
      },
    });
  }

  async findById(id: number) {
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      include: {
        cliente: true,
        usuario: { select: { id: true, nombre: true, email: true } },
        facturas: { select: { id: true, numeroFactura: true, total: true, estado: true } },
      },
    });
    if (!pedido) throw new Error('Pedido no encontrado');
    return pedido;
  }

  async create(dto: CreatePedidoDto, usuarioId: number) {
    const cliente = await prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new Error('Cliente no encontrado');
    if (!cliente.activo) throw new Error('El cliente está desactivado');

    return prisma.pedido.create({
      data: { ...dto, usuarioId, estado: EstadoPedido.ACTIVO },
      include: { cliente: { select: { id: true, razonSocial: true } } },
    });
  }

  async update(id: number, dto: UpdatePedidoDto) {
    const pedido = await this.findById(id);
    if (pedido.estado === EstadoPedido.ANULADO) {
      throw new Error('No se puede modificar un pedido anulado');
    }
    if (pedido.estado === EstadoPedido.FACTURADO) {
      throw new Error('No se puede modificar un pedido facturado');
    }
    return prisma.pedido.update({
      where: { id },
      data: dto,
      include: { cliente: { select: { id: true, razonSocial: true } } },
    });
  }

  async anular(id: number, usuarioRol: string) {
    const pedido = await this.findById(id);
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede anular pedidos');
    if (pedido.estado === EstadoPedido.ANULADO) throw new Error('El pedido ya está anulado');
    if (pedido.estado === EstadoPedido.FACTURADO) {
      throw new Error('No se puede anular un pedido facturado. Primero anule la factura asociada.');
    }
    return prisma.pedido.update({ where: { id }, data: { estado: EstadoPedido.ANULADO } });
  }

  async remove(id: number, usuarioRol: string) {
    const pedido = await this.findById(id);
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar pedidos');
    if (pedido.estado !== EstadoPedido.ACTIVO) throw new Error('Solo se pueden eliminar pedidos ACTIVOS');
    return prisma.pedido.delete({ where: { id } });
  }

  /**
   * Marca el pedido como FACTURADO.
   * Solo lo invoca facturacion.service al crear una factura con pedidoId.
   * Valida que el pedido pertenece al cliente de la factura.
   */
  async marcarComoFacturado(pedidoId: number, clienteId: number): Promise<void> {
    const pedido = await this.findById(pedidoId);

    // Integridad: el pedido debe pertenecer al mismo cliente de la factura
    if (pedido.clienteId !== clienteId) {
      throw new Error('El pedido no pertenece al cliente seleccionado en la factura');
    }
    if (pedido.estado === EstadoPedido.ANULADO) {
      throw new Error('No se puede facturar un pedido anulado');
    }
    if (pedido.estado === EstadoPedido.FACTURADO) {
      throw new Error('El pedido ya se encuentra facturado');
    }

    await prisma.pedido.update({
      where: { id: pedidoId },
      data: { estado: EstadoPedido.FACTURADO },
    });
  }

  /**
   * Restaura el pedido a ACTIVO cuando se anula la factura asociada.
   * Solo lo invoca facturacion.service al anular.
   */
  async restaurarAActivo(pedidoId: number): Promise<void> {
    const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
    if (!pedido) return; // silencioso — la factura puede existir sin pedido
    if (pedido.estado !== EstadoPedido.FACTURADO) return; // ya fue restaurado o nunca fue facturado

    await prisma.pedido.update({
      where: { id: pedidoId },
      data: { estado: EstadoPedido.ACTIVO },
    });
  }

  // ── P5: rentabilidad por conductor ───────────────────────────────────────────
  // Gasto.pedidoId fue eliminado (los gastos ahora se asocian a un vehículo, no a
  // un pedido), así que la rentabilidad ya no se calcula por gastos directos.
  // Nuevo cálculo, definido por el usuario:
  //   ganancia = total facturado del pedido (facturas no anuladas)
  //   gastos   = total de gastos de la liquidación del conductor que hizo el
  //              pedido (liquidacion.totalGastos) + combustible asociado a esa
  //              misma liquidación (Combustible.liquidacionId)
  //   rentabilidad = ganancia − gastos
  async rentabilidad(id: number) {
    await this.findById(id);

    // Liquidación del conductor que incluye este pedido (la más reciente, si hay varias)
    const liqPedido = await prisma.liquidacionPedido.findFirst({
      where: { pedidoId: id },
      orderBy: { creadoEn: 'desc' },
      include: {
        liquidacion: {
          include: { conductor: { select: { id: true, nombre: true } } },
        },
      },
    });
    const liquidacion = liqPedido?.liquidacion ?? null;

    let totalCombustible = 0;
    if (liquidacion) {
      const agregadoCombustible = await prisma.combustible.aggregate({
        where: { liquidacionId: liquidacion.id },
        _sum: { monto: true },
      });
      totalCombustible = Number(agregadoCombustible._sum.monto || 0);
    }
    const totalGastosLiquidacion = liquidacion ? Number(liquidacion.totalGastos) : 0;
    const totalGastos = totalGastosLiquidacion + totalCombustible;

    // Ganancia = total facturado de este pedido (facturas no anuladas)
    const agregadoFacturas = await prisma.factura.aggregate({
      where: { pedidoId: id, estado: { not: 'ANULADA' } },
      _sum: { total: true },
    });
    const ganancia = Number(agregadoFacturas._sum.total || 0);

    const utilidad = ganancia - totalGastos;
    const margen = ganancia > 0 ? (utilidad / ganancia) * 100 : 0;

    return {
      pedidoId: id,
      conductor: liquidacion?.conductor ?? null,
      ganancia,
      totalGastosLiquidacion,
      totalCombustible,
      totalGastos,
      utilidadNeta: utilidad,
      margenPorcentaje: Math.round(margen * 100) / 100,
    };
  }
}

export const pedidosService = new PedidosService();
