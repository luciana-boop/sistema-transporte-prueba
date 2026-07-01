// FILE: src/modules/movimientos/movimientos.service.ts
// Módulo Movimientos: reemplaza a Gastos + Cobranza. No reimplementa el ledger
// financiero — reutiliza MovimientoCuentaV2 y CuentasService (que ya lo maneja
// para combustible/liquidaciones/caja) y le agrega:
//  1) importación masiva desde Excel bancario
//  2) vínculo de cobranza sobre un ingreso (cliente + factura, o cliente + observación)

import prisma from '../../prisma/client';
import { EstadoFactura } from '../../utils/enums';
import { cuentasService } from '../configuracion/cuentas.service';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface FilaImportacion {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: 'INGRESO' | 'EGRESO';
  referencia?: string;
}

export interface VincularCobranzaDto {
  clienteId: number;
  facturaId?: number;
  observacion?: string;
}

export class MovimientosService {
  async listar(query: {
    tipo?: string; cuentaId?: string; desde?: string; hasta?: string; search?: string;
  } & PaginacionQuery) {
    return cuentasService.getMovimientos({
      tipo: query.tipo,
      cuentaId: query.cuentaId ? parseInt(query.cuentaId) : undefined,
      desde: query.desde,
      hasta: query.hasta,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
  }

  async obtener(id: number) {
    const mov = await cuentasService.obtenerMovimiento(id);
    const cobranza = await prisma.pagoV2.findFirst({
      where: { movimientoCuentaId: id, anulado: false },
      include: {
        cliente: { select: { id: true, razonSocial: true, ruc: true } },
        factura: { select: { id: true, numeroFactura: true, total: true } },
      },
    });
    return { ...mov, cobranza };
  }

  async crear(dto: {
    cuentaId: number; tipo: 'INGRESO' | 'EGRESO'; monto: number; monedaId: number;
    tipoPagoId?: number; concepto: string; referencia?: string; fecha?: string;
  }, usuarioId: number) {
    return cuentasService.registrarMovimiento({ ...dto, usuarioId, origen: 'MANUAL' });
  }

  async actualizar(id: number, dto: { concepto?: string; referencia?: string; fecha?: string; tipoPagoId?: number | null }) {
    return cuentasService.actualizarMovimiento(id, dto);
  }

  async anular(id: number, usuarioId: number) {
    return cuentasService.anularMovimiento(id, usuarioId);
  }

  async resumen(query: { desde?: string; hasta?: string; cuentaId?: string }) {
    const where: any = {};
    if (query.cuentaId) where.cuentaId = parseInt(query.cuentaId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    const [ingresos, egresos] = await Promise.all([
      prisma.movimientoCuentaV2.aggregate({ where: { ...where, tipo: 'INGRESO', anulado: false }, _sum: { monto: true }, _count: true }),
      prisma.movimientoCuentaV2.aggregate({ where: { ...where, tipo: 'EGRESO', anulado: false }, _sum: { monto: true }, _count: true }),
    ]);

    const totalIngresos = Number(ingresos._sum.monto || 0);
    const totalEgresos = Number(egresos._sum.monto || 0);

    return {
      totalIngresos,
      cantidadIngresos: ingresos._count,
      totalEgresos,
      cantidadEgresos: egresos._count,
      saldoNeto: totalIngresos - totalEgresos,
    };
  }

  // ── IMPORTACIÓN DESDE EXCEL ──────────────────────────────────────────────────
  async importarLote(dto: { cuentaId: number; monedaId: number; filas: FilaImportacion[] }, usuarioId: number) {
    const creados: number[] = [];
    const errores: { fila: number; motivo: string }[] = [];

    for (let i = 0; i < dto.filas.length; i++) {
      const fila = dto.filas[i];
      try {
        if (!fila.fecha || !fila.descripcion || !fila.monto || !fila.tipo) {
          throw new Error('Fila incompleta: fecha, descripción, monto y tipo son requeridos');
        }
        if (!['INGRESO', 'EGRESO'].includes(fila.tipo)) {
          throw new Error('tipo debe ser INGRESO o EGRESO');
        }
        const mov = await cuentasService.registrarMovimiento({
          cuentaId: dto.cuentaId,
          tipo: fila.tipo,
          monto: fila.monto,
          monedaId: dto.monedaId,
          concepto: fila.descripcion,
          referencia: fila.referencia,
          usuarioId,
          fecha: fila.fecha,
          origen: 'EXCEL',
        });
        creados.push(mov.id);
      } catch (err) {
        errores.push({ fila: i + 1, motivo: err instanceof Error ? err.message : String(err) });
      }
    }

    return { creados: creados.length, errores };
  }

  // ── COBRANZA VINCULADA A UN INGRESO ──────────────────────────────────────────
  async facturasPorCliente(clienteId: number) {
    const facturas = await prisma.factura.findMany({
      where: {
        clienteId,
        estado: { in: [EstadoFactura.EMITIDA, EstadoFactura.PENDIENTE, EstadoFactura.PARCIAL] },
      },
      orderBy: { fechaVencimiento: 'asc' },
    });

    return facturas.map((f) => {
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
    }).filter((f) => f.saldoPendiente > 0.01);
  }

  async vincularCobranza(movimientoId: number, dto: VincularCobranzaDto, usuarioId: number) {
    const mov = await prisma.movimientoCuentaV2.findUnique({ where: { id: movimientoId } });
    if (!mov) throw new Error('Movimiento no encontrado');
    if (mov.tipo !== 'INGRESO') throw new Error('Solo se puede vincular cobranza a un ingreso');
    if (mov.anulado) throw new Error('No se puede vincular cobranza a un movimiento anulado');

    const existente = await prisma.pagoV2.findFirst({ where: { movimientoCuentaId: movimientoId, anulado: false } });
    if (existente) throw new Error('Este ingreso ya tiene una cobranza vinculada');

    const cliente = await prisma.cliente.findUnique({ where: { id: dto.clienteId } });
    if (!cliente) throw new Error('Cliente no encontrado');

    let factura: any = null;
    if (dto.facturaId) {
      factura = await prisma.factura.findUnique({ where: { id: dto.facturaId } });
      if (!factura) throw new Error('Factura no encontrada');
      if (factura.clienteId !== dto.clienteId) throw new Error('La factura no pertenece a este cliente');
      if (factura.estado === EstadoFactura.ANULADA) throw new Error('No se puede vincular cobranza a una factura anulada');
      if (factura.estado === EstadoFactura.PAGADA) throw new Error('La factura ya está completamente pagada');

      const totalPagadoActual = Number(factura.totalPagado || 0);
      const saldoPendiente = Number(factura.total) - totalPagadoActual;
      const monto = Number(mov.monto);
      if (monto > saldoPendiente + 0.01) {
        throw new Error(
          `El monto del ingreso (S/${monto.toFixed(2)}) excede el saldo pendiente de la factura (S/${saldoPendiente.toFixed(2)}). ` +
          `Selecciona otra factura o vincula solo al cliente con una observación.`
        );
      }
    } else if (!dto.observacion || !dto.observacion.trim()) {
      throw new Error('Debe indicar una observación (ej. préstamo, otro ingreso) si no selecciona una factura');
    }

    return prisma.$transaction(async (tx: any) => {
      if (factura) {
        const totalPagadoActual = Number(factura.totalPagado || 0);
        const nuevoTotalPagado = totalPagadoActual + Number(mov.monto);
        const total = Number(factura.total);
        const nuevoEstado = (Math.abs(nuevoTotalPagado - total) < 0.01 || nuevoTotalPagado >= total)
          ? EstadoFactura.PAGADA : EstadoFactura.PARCIAL;
        await tx.factura.update({
          where: { id: factura.id },
          data: { totalPagado: nuevoTotalPagado, estado: nuevoEstado },
        });
      }

      return tx.pagoV2.create({
        data: {
          facturaId: dto.facturaId ?? null,
          clienteId: dto.clienteId,
          usuarioId,
          monto: mov.monto,
          monedaId: mov.monedaId,
          tipoPagoId: mov.tipoPagoId,
          referencia: mov.referencia,
          observaciones: dto.observacion ?? null,
          movimientoCuentaId: mov.id,
          fechaPago: mov.fecha,
        },
        include: {
          cliente: { select: { id: true, razonSocial: true, ruc: true } },
          factura: { select: { id: true, numeroFactura: true, total: true } },
        },
      });
    });
  }

  async desvincularCobranza(movimientoId: number, usuarioRol: string) {
    if (usuarioRol !== 'ADMIN') throw new Error('Solo el administrador puede desvincular una cobranza');

    const pago = await prisma.pagoV2.findFirst({ where: { movimientoCuentaId: movimientoId, anulado: false } });
    if (!pago) throw new Error('Este ingreso no tiene una cobranza vinculada');

    await prisma.$transaction(async (tx: any) => {
      await tx.pagoV2.update({
        where: { id: pago.id },
        data: { anulado: true, anuladoEn: new Date(), motivoAnulacion: 'Desvinculado por administrador' },
      });

      if (pago.facturaId) {
        const activos = await tx.pagoV2.findMany({
          where: { facturaId: pago.facturaId, anulado: false },
          select: { monto: true },
        });
        const factura = await tx.factura.findUnique({ where: { id: pago.facturaId } });
        if (factura && factura.estado !== EstadoFactura.ANULADA) {
          const totalPagado = activos.reduce((s: number, p: any) => s + Number(p.monto), 0);
          const total = Number(factura.total);
          let estado: string;
          if (totalPagado <= 0) estado = EstadoFactura.EMITIDA;
          else if (Math.abs(totalPagado - total) < 0.01) estado = EstadoFactura.PAGADA;
          else estado = EstadoFactura.PARCIAL;
          await tx.factura.update({ where: { id: pago.facturaId }, data: { totalPagado, estado } });
        }
      }
    });

    return { message: 'Cobranza desvinculada correctamente' };
  }
}

export const movimientosService = new MovimientosService();
