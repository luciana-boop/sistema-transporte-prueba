// FILE: src/modules/facturacion/facturacion.service.ts
// CAMBIOS v2:
//   P1 — getPdfPath(): devuelve la ruta del PDF almacenada en BD
//   P2 — anular(): verifica que no existan pagos activos (anulado=false) antes de anular

import prisma from '../../prisma/client';
import { EstadoFactura } from '../../utils/enums';

// ─── DTOs ────────────────────────────────────────────────────────────────────

export interface LineaFacturaDto {
  orden?: number;
  cantidad: number;
  unidadMedida?: string;
  codigo: string;
  descripcion: string;
  valorUnitario: number;
  importe: number;
}

export interface CreateFacturaDto {
  pedidoId?: number;
  clienteId: number;
  serie?: string;
  subtotal: number;
  porcentajeIgv?: number;
  detraccion?: number;
  porcentajeDetraccion?: number;
  tipoCredito?: string;
  diasCredito?: number;
  guiaReferencia?: string;
  detalle?: string;
  fechaEmision?: string;
  fechaVencimiento?: string;
  observaciones?: string;
  xmlPath?: string;
  pdfPath?: string;
  hashXml?: string;
  lineas?: LineaFacturaDto[];
}

export interface UpdateFacturaDto {
  observaciones?: string;
  fechaVencimiento?: string;
  detalle?: string;
  xmlPath?: string;
  pdfPath?: string;
  estadoSunat?: string;
  cdrPath?: string;
}

// ─── MAPEO TIPO CRÉDITO → DÍAS ────────────────────────────────────────────────
const DIAS_POR_TIPO_CREDITO: Record<string, number> = {
  '0':    0,
  '7':    7,
  '15':  15,
  '30':  30,
  '45':  45,
  '60':  60,
};

function calcularFechaVencimiento(fechaEmision: Date, tipoCredito?: string, diasCredito?: number): Date {
  let dias = 0;
  if (diasCredito !== undefined && diasCredito > 0) {
    dias = diasCredito;
  } else if (tipoCredito && DIAS_POR_TIPO_CREDITO[tipoCredito] !== undefined) {
    dias = DIAS_POR_TIPO_CREDITO[tipoCredito];
  }
  const fecha = new Date(fechaEmision);
  fecha.setDate(fecha.getDate() + dias);
  return fecha;
}

// ─── SERVICE ─────────────────────────────────────────────────────────────────

export class FacturacionService {

  async getNextCorrelativo(serie: string): Promise<number> {
    const serieConfig = await prisma.serieFacturacion.findUnique({ where: { serie } });
    if (serieConfig) {
      return serieConfig.correlativoActual;
    }
    const ultima = await prisma.factura.findFirst({
      where: { serie },
      orderBy: { correlativo: 'desc' },
      select: { correlativo: true },
    });
    return (ultima?.correlativo ?? 0) + 1;
  }

  async incrementarCorrelativoEnDB(serie: string, correlativoUsado: number): Promise<void> {
    await prisma.serieFacturacion.updateMany({
      where: { serie, correlativoActual: correlativoUsado },
      data: { correlativoActual: correlativoUsado + 1 },
    });
  }

  async findAll(query: { estado?: string; clienteId?: string; desde?: string; hasta?: string; serie?: string }) {
    const where: any = {};
    if (query.estado) where.estado = query.estado as EstadoFactura;
    if (query.clienteId) where.clienteId = parseInt(query.clienteId);
    if (query.serie) where.serie = query.serie;
    if (query.desde || query.hasta) {
      where.fechaEmision = {};
      if (query.desde) where.fechaEmision.gte = new Date(query.desde);
      if (query.hasta) where.fechaEmision.lte = new Date(query.hasta + 'T23:59:59');
    }
    return prisma.factura.findMany({
      where,
      orderBy: { creadoEn: 'desc' },
      include: {
        cliente: { select: { id: true, razonSocial: true, ruc: true } },
        pedido: { select: { id: true, origen: true, destino: true } },
        usuario: { select: { id: true, nombre: true } },
        lineas: { orderBy: { orden: 'asc' } },
        _count: { select: { pagos: true } },
      },
    });
  }

  async findById(id: number) {
    const factura = await prisma.factura.findUnique({
      where: { id },
      include: {
        cliente: true,
        pedido: { select: { id: true, origen: true, destino: true, tipoCarga: true } },
        usuario: { select: { id: true, nombre: true, email: true } },
        lineas: { orderBy: { orden: 'asc' } },
        pagos: {
          select: {
            id: true,
            monto: true,
            metodoPago: true,
            fechaPago: true,
            referencia: true,
            anulado: true,
          },
          orderBy: { fechaPago: 'desc' },
        },
      },
    });
    if (!factura) throw new Error('Factura no encontrada');
    const totalPagado = Number(factura.totalPagado);
    return { ...factura, totalPagado, saldoPendiente: Number(factura.total) - totalPagado };
  }

  // ── P1: devuelve el pdfPath guardado en BD ──────────────────────────────────
  async getPdfPath(id: number): Promise<string | null> {
    const factura = await prisma.factura.findUnique({
      where: { id },
      select: { pdfPath: true },
    });
    if (!factura) throw new Error('Factura no encontrada');
    return factura.pdfPath ?? null;
  }

  async getSeries() {
    const seriesConfig = await prisma.serieFacturacion.findMany({
      where: { activo: true },
      select: { serie: true, tipoDocumento: true, correlativoActual: true },
      orderBy: { serie: 'asc' },
    });
    if (seriesConfig.length > 0) return seriesConfig.map((s: any) => s.serie);
    const series = await prisma.factura.findMany({
      distinct: ['serie'],
      select: { serie: true },
      orderBy: { serie: 'asc' },
    });
    return series.map((s: any) => s.serie);
  }

  async create(dto: CreateFacturaDto, usuarioId: number) {
    const cliente = await prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new Error('Cliente no encontrado');

    if (dto.pedidoId) {
      const pedido = await prisma.pedido.findUnique({
        where: { id: dto.pedidoId },
        include: {
          facturas: {
            where: { estado: { not: 'ANULADA' } },
            select: { id: true, numeroFactura: true },
          },
        },
      });
      if (!pedido) throw new Error('El pedido indicado no existe');
      if (pedido.clienteId !== dto.clienteId) {
        throw new Error('El pedido no pertenece al cliente seleccionado');
      }
      if (pedido.estado === 'ANULADO') {
        throw new Error('No se puede facturar un pedido anulado');
      }
      if (pedido.estado === 'FACTURADO' || pedido.facturas.length > 0) {
        const ref = pedido.facturas[0]?.numeroFactura ?? '';
        throw new Error(
          `El pedido ya está facturado${ref ? ` (${ref})` : ''}. Anule esa factura para facturarlo nuevamente.`
        );
      }
    }

    const serie = (dto.serie || 'F001').toUpperCase();
    const correlativo = await this.getNextCorrelativo(serie);
    const numeroFactura = `${serie}-${String(correlativo).padStart(5, '0')}`;

    const existe = await prisma.factura.findUnique({ where: { numeroFactura } });
    if (existe) throw new Error(`El número de factura ${numeroFactura} ya existe`);

    const porcentaje = dto.porcentajeIgv ?? 18;
    const igv = Math.round((dto.subtotal * porcentaje) / 100 * 100) / 100;
    const total = Math.round((dto.subtotal + igv) * 100) / 100;

    let montoDetraccion: number | undefined;
    if (dto.porcentajeDetraccion && total > 0) {
      montoDetraccion = Math.round(total * dto.porcentajeDetraccion / 100 * 100) / 100;
    }

    const fechaEmision = dto.fechaEmision ? new Date(dto.fechaEmision) : new Date();
    const fechaVenc = calcularFechaVencimiento(fechaEmision, dto.tipoCredito, dto.diasCredito);
    const lineas = dto.lineas ?? [];

    return prisma.$transaction(async (tx: any) => {
      const factura = await tx.factura.create({
        data: {
          pedidoId: dto.pedidoId,
          clienteId: dto.clienteId,
          usuarioId,
          serie,
          correlativo,
          numeroFactura,
          subtotal: dto.subtotal,
          porcentajeIgv: porcentaje,
          igv,
          total,
          detraccion: dto.detraccion,
          porcentajeDetraccion: dto.porcentajeDetraccion,
          montoDetraccion,
          tipoCredito: dto.tipoCredito,
          diasCredito: dto.diasCredito,
          guiaReferencia: dto.guiaReferencia,
          detalle: dto.detalle,
          estado: EstadoFactura.EMITIDA,
          fechaEmision,
          fechaVencimiento: fechaVenc,
          observaciones: dto.observaciones,
          xmlPath: dto.xmlPath,
          pdfPath: dto.pdfPath,
          hashXml: dto.hashXml,
          totalPagado: 0,
          lineas: lineas.length > 0 ? {
            createMany: {
              data: lineas.map((l, idx) => ({
                orden: l.orden ?? idx,
                cantidad: l.cantidad,
                unidadMedida: l.unidadMedida ?? 'NIU',
                codigo: l.codigo,
                descripcion: l.descripcion,
                valorUnitario: l.valorUnitario,
                importe: l.importe,
              })),
            },
          } : undefined,
        },
        include: { lineas: true },
      });

      await tx.serieFacturacion.updateMany({
        where: { serie },
        data: { correlativoActual: { increment: 1 } },
      });

      if (dto.pedidoId) {
        await tx.pedido.update({
          where: { id: dto.pedidoId },
          data: { estado: 'FACTURADO' },
        });
      }

      return factura;
    });
  }

  async createFromXml(xmlData: {
    serie: string; correlativo: string; ruc: string; razonSocial: string;
    subtotal: number; igv: number; total: number; fechaEmision: string;
    hashXml?: string;
  }, usuarioId: number) {
    let cliente = await prisma.cliente.findUnique({ where: { ruc: xmlData.ruc } });
    if (!cliente) {
      cliente = await prisma.cliente.create({
        data: { razonSocial: xmlData.razonSocial, ruc: xmlData.ruc, direccion: 'Por completar' },
      });
    }

    const numeroFactura = `${xmlData.serie}-${xmlData.correlativo.padStart(5, '0')}`;
    const existe = await prisma.factura.findUnique({ where: { numeroFactura } });
    if (existe) throw new Error(`DUPLICADO: ${numeroFactura} ya existe`);

    const correlativo = parseInt(xmlData.correlativo);
    const porcentajeIgv = xmlData.subtotal > 0
      ? Math.round((xmlData.igv / xmlData.subtotal) * 100)
      : 18;

    const fechaEmision = new Date(xmlData.fechaEmision);
    const fechaVenc = calcularFechaVencimiento(fechaEmision, '30');

    return prisma.factura.create({
      data: {
        clienteId: cliente.id,
        usuarioId,
        serie: xmlData.serie,
        correlativo,
        numeroFactura,
        subtotal: xmlData.subtotal,
        porcentajeIgv,
        igv: xmlData.igv,
        total: xmlData.total,
        estado: EstadoFactura.EMITIDA,
        fechaEmision,
        fechaVencimiento: fechaVenc,
        hashXml: xmlData.hashXml,
        totalPagado: 0,
      },
    });
  }

  async update(id: number, dto: UpdateFacturaDto) {
    const factura = await this.findById(id);
    if (factura.estado === EstadoFactura.ANULADA) throw new Error('No se puede modificar una factura anulada');
    return prisma.factura.update({
      where: { id },
      data: {
        ...dto,
        fechaVencimiento: dto.fechaVencimiento ? new Date(dto.fechaVencimiento) : undefined,
      },
    });
  }

  // ── P2: anular verifica pagos activos ───────────────────────────────────────
  async anular(id: number, usuarioRol: string) {
    const factura = await this.findById(id);
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede anular facturas');
    if (factura.estado === EstadoFactura.ANULADA) throw new Error('La factura ya está anulada');
    if (factura.estado === EstadoFactura.PAGADA) throw new Error('No se puede anular una factura ya pagada');

    // P2: verificar si existen pagos activos (no anulados)
    const pagosActivos = await prisma.pago.count({
      where: { facturaId: id, anulado: false },
    });
    if (pagosActivos > 0) {
      throw new Error(
        'La factura tiene pagos registrados. Debe anular primero los pagos asociados antes de anular la factura.'
      );
    }

    return prisma.$transaction(async (tx: any) => {
      const facturaAnulada = await tx.factura.update({
        where: { id },
        data: { estado: EstadoFactura.ANULADA },
      });

      if (factura.pedidoId) {
        await tx.pedido.updateMany({
          where: { id: factura.pedidoId, estado: 'FACTURADO' },
          data: { estado: 'ACTIVO' },
        });
      }

      return facturaAnulada;
    });
  }

  async recalcularEstado(id: number) {
    const factura = await prisma.factura.findUnique({
      where: { id },
      include: { pagos: { select: { monto: true } } },
    });
    if (!factura || factura.estado === EstadoFactura.ANULADA) return;

    const totalPagado = factura.pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);
    const total = Number(factura.total);
    let nuevoEstado: EstadoFactura;

    if (totalPagado <= 0) {
      nuevoEstado = EstadoFactura.EMITIDA;
    } else if (Math.abs(totalPagado - total) < 0.01) {
      nuevoEstado = EstadoFactura.PAGADA;
    } else if (totalPagado < total) {
      nuevoEstado = EstadoFactura.PARCIAL;
    } else {
      nuevoEstado = EstadoFactura.PAGADA;
    }

    await prisma.factura.update({
      where: { id },
      data: { totalPagado, estado: nuevoEstado },
    });
  }

  async remove(id: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede eliminar facturas');
    const factura = await this.findById(id);
    if (factura.estado !== EstadoFactura.ANULADA) throw new Error('Solo se pueden eliminar facturas anuladas');
    return prisma.factura.delete({ where: { id } });
  }
}

export const facturacionService = new FacturacionService();
