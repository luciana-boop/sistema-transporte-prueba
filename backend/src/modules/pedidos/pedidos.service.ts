// FILE: src/modules/pedidos/pedidos.service.ts

import prisma from '../../prisma/client';
import { EstadoPedido } from '../../utils/enums';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface CreatePedidoDto {
  clienteId: number;
  origen: string;
  destino: string;
  tipoCarga: string;
  vehiculoId?: number | null;
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
  } & PaginacionQuery) {
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

    const { skip, take, page, limit } = paginar(query);

    const [total, items] = await Promise.all([
      prisma.pedido.count({ where }),
      prisma.pedido.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        skip,
        take,
        include: {
          cliente: { select: { id: true, razonSocial: true, ruc: true } },
          usuario: { select: { id: true, nombre: true } },
          vehiculo: { select: { id: true, placa: true, tipo: true } },
          creadoPor: { select: { id: true, nombre: true } },
          actualizadoPor: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    return { items, total, page, limit };
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
        vehiculo: { select: { id: true, placa: true, tipo: true } },
      },
    });
  }

  async findById(id: number) {
    const pedido = await prisma.pedido.findUnique({
      where: { id },
      include: {
        cliente: true,
        usuario: { select: { id: true, nombre: true, email: true } },
        vehiculo: { select: { id: true, placa: true, tipo: true } },
        creadoPor: { select: { id: true, nombre: true } },
        actualizadoPor: { select: { id: true, nombre: true } },
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
      data: { ...dto, usuarioId, estado: EstadoPedido.ACTIVO, creadoPorId: usuarioId },
      include: { cliente: { select: { id: true, razonSocial: true } }, vehiculo: { select: { id: true, placa: true, tipo: true } } },
    });
  }

  async update(id: number, dto: UpdatePedidoDto, usuarioId?: number) {
    const pedido = await this.findById(id);
    if (pedido.estado === EstadoPedido.ANULADO) {
      throw new Error('No se puede modificar un pedido anulado');
    }
    if (pedido.estado === EstadoPedido.FACTURADO) {
      throw new Error('No se puede modificar un pedido facturado');
    }
    return prisma.pedido.update({
      where: { id },
      data: { ...dto, actualizadoPorId: usuarioId },
      include: { cliente: { select: { id: true, razonSocial: true } }, vehiculo: { select: { id: true, placa: true, tipo: true } } },
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
  // Cálculo, definido por el usuario:
  //   ganancia = total facturado del pedido (facturas no anuladas)
  //   gastos   = parte proporcional que le corresponde a este pedido del total de
  //              gastos de la liquidación del conductor (liquidacion.totalGastos)
  //              y del combustible asociado a esa misma liquidación
  //              (Combustible.liquidacionId)
  //   rentabilidad = ganancia − gastos
  //
  // Una liquidación puede agrupar varios pedidos (LiquidacionPedido es una tabla
  // de unión N:N sin un campo de "parte correspondiente"). Antes se imputaba el
  // gasto TOTAL de la liquidación y del combustible a CADA pedido asociado, lo
  // que multiplicaba el costo real por la cantidad de pedidos compartidos y
  // arrojaba una rentabilidad falsa (muy negativa) para todos ellos. Como no
  // existe ningún criterio de reparto guardado (tarifa, peso, distancia, etc.),
  // se distribuye el costo en partes iguales entre los pedidos que comparten la
  // liquidación, de modo que cada uno asuma solo la fracción que le corresponde.
  async rentabilidad(id: number) {
    await this.findById(id);

    // Liquidación del conductor que incluye este pedido (la más reciente, si hay varias)
    const liqPedido = await prisma.liquidacionPedido.findFirst({
      where: { pedidoId: id },
      orderBy: { creadoEn: 'desc' },
      include: {
        liquidacion: {
          include: {
            conductor: { select: { id: true, nombre: true } },
            pedidos: { select: { pedidoId: true } },
          },
        },
      },
    });
    const liquidacion = liqPedido?.liquidacion ?? null;
    const cantidadPedidosLiquidacion = liquidacion ? liquidacion.pedidos.length || 1 : 1;

    let totalCombustibleLiquidacion = 0;
    if (liquidacion) {
      const agregadoCombustible = await prisma.combustible.aggregate({
        where: { liquidacionId: liquidacion.id },
        _sum: { monto: true },
      });
      totalCombustibleLiquidacion = Number(agregadoCombustible._sum.monto || 0);
    }
    const totalGastosLiquidacion = liquidacion ? Number(liquidacion.totalGastos) : 0;

    // Parte proporcional (en partes iguales) que le corresponde a este pedido
    const gastosLiquidacion = Math.round((totalGastosLiquidacion / cantidadPedidosLiquidacion) * 100) / 100;
    const totalCombustible = Math.round((totalCombustibleLiquidacion / cantidadPedidosLiquidacion) * 100) / 100;
    const totalGastos = gastosLiquidacion + totalCombustible;

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
      totalGastosLiquidacion: gastosLiquidacion,
      totalCombustible,
      totalGastos,
      utilidadNeta: utilidad,
      margenPorcentaje: Math.round(margen * 100) / 100,
      cantidadPedidosLiquidacion,
    };
  }
}

export const pedidosService = new PedidosService();
