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
      ];
    }
    return prisma.pedido.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true, ruc: true } },
        usuario: { select: { id: true, nombre: true } },
        _count: { select: { gastos: true } },
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
        gastos: { orderBy: { fecha: 'desc' } },
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

  async rentabilidad(id: number) {
    const pedido = await this.findById(id);
    const totalGastos = await prisma.gasto.aggregate({
      where: { pedidoId: id },
      _sum: { monto: true },
    });
    const gastos = Number(totalGastos._sum.monto || 0);
    const tarifa = Number(pedido.tarifa);
    const utilidad = tarifa - gastos;
    const margen = tarifa > 0 ? (utilidad / tarifa) * 100 : 0;
    return { pedidoId: id, tarifa, totalGastos: gastos, utilidadNeta: utilidad, margenPorcentaje: Math.round(margen * 100) / 100 };
  }
}

export const pedidosService = new PedidosService();
