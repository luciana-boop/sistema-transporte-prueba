// FILE: src/modules/clientes/clientes.service.ts

import prisma from '../../prisma/client';
import { CONDICION_PAGO_CONTADO } from '../../utils/enums';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface CreateClienteDto {
  razonSocial: string;
  ruc: string;
  direccion: string;
  ubigeo?: string;
  telefono?: string;
  email?: string;
  condicionPago?: string;
}

export interface UpdateClienteDto extends Partial<CreateClienteDto> {
  activo?: boolean;
}

export interface ClienteContactoDto {
  nombre: string;
  telefono?: string;
  email?: string;
}

export class ClientesService {
  private async validarCondicionPago(condicionPago?: string) {
    if (condicionPago === undefined || condicionPago === CONDICION_PAGO_CONTADO) return;
    const existe = await prisma.tablaMaestra.findUnique({
      where: { tipo_codigo: { tipo: 'tipo_credito', codigo: condicionPago } },
    });
    if (!existe || !existe.activo) {
      throw new Error(`Condición de pago "${condicionPago}" inválida o inactiva`);
    }
  }

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
          creadoPor: { select: { id: true, nombre: true } },
          actualizadoPor: { select: { id: true, nombre: true } },
        },
      }),
    ]);

    return { items, total, page, limit };
  }

  async findById(id: number) {
    const cliente = await prisma.cliente.findUnique({
      where: { id },
      include: {
        creadoPor: { select: { id: true, nombre: true } },
        actualizadoPor: { select: { id: true, nombre: true } },
        contactos: { orderBy: { creadoEn: 'asc' } },
      },
    });

    if (!cliente) throw new Error('Cliente no encontrado');
    return cliente;
  }

  async create(dto: CreateClienteDto, usuarioId?: number) {
    const existente = await prisma.cliente.findUnique({ where: { ruc: dto.ruc } });
    if (existente) throw new Error(`Ya existe un cliente con RUC ${dto.ruc}`);
    await this.validarCondicionPago(dto.condicionPago);

    return prisma.cliente.create({ data: { ...dto, creadoPorId: usuarioId } });
  }

  async update(id: number, dto: UpdateClienteDto, usuarioId?: number) {
    await this.findById(id);

    if (dto.ruc) {
      const existente = await prisma.cliente.findFirst({
        where: { ruc: dto.ruc, id: { not: id } },
      });
      if (existente) throw new Error(`El RUC ${dto.ruc} ya está registrado`);
    }
    await this.validarCondicionPago(dto.condicionPago);

    return prisma.cliente.update({ where: { id }, data: { ...dto, actualizadoPorId: usuarioId } });
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

  async agregarContacto(clienteId: number, dto: ClienteContactoDto) {
    await this.findById(clienteId);
    return prisma.clienteContacto.create({ data: { ...dto, clienteId } });
  }

  async actualizarContacto(contactoId: number, dto: Partial<ClienteContactoDto>) {
    const existente = await prisma.clienteContacto.findUnique({ where: { id: contactoId } });
    if (!existente) throw new Error('Contacto no encontrado');
    return prisma.clienteContacto.update({ where: { id: contactoId }, data: dto });
  }

  async eliminarContacto(contactoId: number) {
    const existente = await prisma.clienteContacto.findUnique({ where: { id: contactoId } });
    if (!existente) throw new Error('Contacto no encontrado');
    return prisma.clienteContacto.delete({ where: { id: contactoId } });
  }
}

export const clientesService = new ClientesService();
