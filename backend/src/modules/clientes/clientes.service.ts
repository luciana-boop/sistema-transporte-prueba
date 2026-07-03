// FILE: src/modules/clientes/clientes.service.ts

import prisma from '../../prisma/client';
import { CondicionPago } from '../../utils/enums';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface CreateClienteDto {
  razonSocial: string;
  ruc: string;
  direccion: string;
  ubigeo?: string;
  telefono?: string;
  email?: string;
  condicionPago?: CondicionPago;
}

export interface UpdateClienteDto extends Partial<CreateClienteDto> {
  activo?: boolean;
}

export class ClientesService {
  async findAll(query: { activo?: string; search?: string } & PaginacionQuery) {
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

    const { skip, take, page, limit } = paginar(query);

    const [total, items] = await Promise.all([
      prisma.cliente.count({ where }),
      prisma.cliente.findMany({
        where,
        orderBy: { razonSocial: 'asc' },
        skip,
        take,
        include: {
          _count: {
            select: { pedidos: true, facturas: true },
          },
        },
      }),
    ]);

    return { items, total, page, limit };
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
}

export const clientesService = new ClientesService();
