// FILE: src/modules/clientes/clientes.service.ts

import prisma from '../../prisma/client';
import { CondicionPago } from '../../utils/enums';

export interface CreateClienteDto {
  razonSocial: string;
  ruc: string;
  direccion: string;
  telefono?: string;
  email?: string;
  condicionPago?: CondicionPago;
}

export interface UpdateClienteDto extends Partial<CreateClienteDto> {
  activo?: boolean;
}

export class ClientesService {
  async findAll(query: { activo?: string; search?: string }) {
    const where: any = {};

    if (query.activo !== undefined) {
      where.activo = query.activo === 'true';
    }

    if (query.search) {
      where.OR = [
        { razonSocial: { contains: query.search, mode: 'insensitive' } },
        { ruc: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return prisma.cliente.findMany({
      where,
      orderBy: { razonSocial: 'asc' },
      include: {
        _count: {
          select: { pedidos: true, facturas: true },
        },
      },
    });
  }

  async findById(id: number) {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        pedidos: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          select: {
            id: true,
            origen: true,
            destino: true,
            tarifa: true,
            estado: true,
            fechaPedido: true,
          },
        },
        facturas: {
          orderBy: { creadoEn: 'desc' },
          take: 10,
          select: {
            id: true,
            numeroFactura: true,
            total: true,
            estado: true,
            fechaEmision: true,
          },
        },
      },
    });

    if (!cliente) throw new Error('Cliente no encontrado');
    return cliente;
  }

  async create(dto: CreateClienteDto) {
    const existente = await prisma.cliente.findUnique({ where: { ruc: dto.ruc } });
    if (existente) throw new Error(`Ya existe un cliente con RUC ${dto.ruc}`);

    return prisma.cliente.create({ data: dto });
  }

  async update(id: number, dto: UpdateClienteDto) {
    await this.findById(id);

    if (dto.ruc) {
      const existente = await prisma.cliente.findFirst({
        where: { ruc: dto.ruc, id: { not: id } },
      });
      if (existente) throw new Error(`El RUC ${dto.ruc} ya está registrado`);
    }

    return prisma.cliente.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const cliente = await this.findById(id);

    const tienePedidos = await prisma.pedido.count({ where: { clienteId: id } });
    if (tienePedidos > 0) {
      // Desactivar en lugar de eliminar si tiene dependencias
      return prisma.cliente.update({
        where: { id },
        data: { activo: false },
      });
    }

    return prisma.cliente.delete({ where: { id } });
  }

  async getEstadisticas(id: number) {
    await this.findById(id);

    const [totalPedidos, totalFacturado, totalPagado, pedidosPendientes] = await Promise.all([
      prisma.pedido.count({ where: { clienteId: id } }),
      prisma.factura.aggregate({
        where: { clienteId: id },
        _sum: { total: true },
      }),
      prisma.pago.aggregate({
        where: { clienteId: id },
        _sum: { monto: true },
      }),
      prisma.pedido.count({
        where: { clienteId: id, estado: { in: ['PENDIENTE', 'EN_RUTA'] } },
      }),
    ]);

    const facturado = Number(totalFacturado._sum.total || 0);
    const pagado = Number(totalPagado._sum.monto || 0);

    return {
      totalPedidos,
      facturado,
      pagado,
      saldoPendiente: facturado - pagado,
      pedidosPendientes,
    };
  }
}

export const clientesService = new ClientesService();
