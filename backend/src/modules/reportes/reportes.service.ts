// FILE: src/modules/reportes/reportes.service.ts

import prisma from '../../prisma/client';

export interface FiltroReporte {
  desde?: string;
  hasta?: string;
  clienteId?: string;
}

export class ReportesService {
  private parseFiltros(filtros: FiltroReporte) {
    const where: any = {};
    if (filtros.clienteId) where.clienteId = parseInt(filtros.clienteId);
    if (filtros.desde || filtros.hasta) {
      where.creadoEn = {};
      if (filtros.desde) where.creadoEn.gte = new Date(filtros.desde);
      if (filtros.hasta) where.creadoEn.lte = new Date(filtros.hasta + 'T23:59:59');
    }
    return where;
  }

  async reportePedidos(filtros: FiltroReporte) {
    const where = this.parseFiltros(filtros);

    const [pedidos, resumenEstados] = await Promise.all([
      prisma.pedido.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        include: {
          cliente: { select: { id: true, razonSocial: true } },
          usuario: { select: { id: true, nombre: true } },
          _count: { select: { gastos: true } },
        },
      }),
      prisma.pedido.groupBy({
        by: ['estado'],
        where,
        _count: true,
        _sum: { tarifa: true },
      }),
    ]);

    const totalTarifas = pedidos.reduce((s: number, p: any) => s + Number(p.tarifa), 0);

    return {
      pedidos,
      resumenEstados: resumenEstados.map((r: any) => ({
        estado: r.estado,
        cantidad: r._count,
        totalTarifas: Number(r._sum.tarifa || 0),
      })),
      totales: {
        cantidad: pedidos.length,
        tarifaTotal: totalTarifas,
      },
    };
  }

  async reporteFacturacion(filtros: FiltroReporte) {
    const where = this.parseFiltros(filtros);

    const [facturas, resumenEstados] = await Promise.all([
      prisma.factura.findMany({
        where,
        orderBy: { creadoEn: 'desc' },
        include: {
          cliente: { select: { id: true, razonSocial: true } },
          usuario: { select: { id: true, nombre: true } },
        },
      }),
      prisma.factura.groupBy({
        by: ['estado'],
        where,
        _count: true,
        _sum: { total: true, igv: true, subtotal: true },
      }),
    ]);

    const totales = facturas.reduce(
      (acc: any, f: any) => ({
        subtotal: acc.subtotal + Number(f.subtotal),
        igv: acc.igv + Number(f.igv),
        total: acc.total + Number(f.total),
      }),
      { subtotal: 0, igv: 0, total: 0 }
    );

    return {
      facturas,
      resumenEstados: resumenEstados.map((r: any) => ({
        estado: r.estado,
        cantidad: r._count,
        subtotal: Number(r._sum.subtotal || 0),
        igv: Number(r._sum.igv || 0),
        total: Number(r._sum.total || 0),
      })),
      totales: { ...totales, cantidad: facturas.length },
    };
  }

  async reporteCobranza(filtros: FiltroReporte) {
    const where: any = {};
    if (filtros.clienteId) where.clienteId = parseInt(filtros.clienteId);
    if (filtros.desde || filtros.hasta) {
      where.fechaPago = {};
      if (filtros.desde) where.fechaPago.gte = new Date(filtros.desde);
      if (filtros.hasta) where.fechaPago.lte = new Date(filtros.hasta + 'T23:59:59');
    }

    const [pagos, resumenMetodo] = await Promise.all([
      prisma.pago.findMany({
        where,
        orderBy: { fechaPago: 'desc' },
        include: {
          cliente: { select: { id: true, razonSocial: true } },
          factura: { select: { id: true, numeroFactura: true } },
        },
      }),
      prisma.pago.groupBy({
        by: ['metodoPago'],
        where,
        _count: true,
        _sum: { monto: true },
      }),
    ]);

    const totalCobrado = pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);

    return {
      pagos,
      resumenPorMetodo: resumenMetodo.map((r: any) => ({
        metodoPago: r.metodoPago,
        cantidad: r._count,
        total: Number(r._sum.monto || 0),
      })),
      totales: { cantidad: pagos.length, totalCobrado },
    };
  }

  async reporteCaja(filtros: FiltroReporte) {
    const where: any = {};
    if (filtros.desde || filtros.hasta) {
      where.fecha = {};
      if (filtros.desde) where.fecha.gte = new Date(filtros.desde);
      if (filtros.hasta) where.fecha.lte = new Date(filtros.hasta + 'T23:59:59');
    }

    const cajas = await prisma.caja.findMany({
      where,
      orderBy: { fecha: 'desc' },
      include: {
        usuario: { select: { id: true, nombre: true } },
        movimientos: true,
      },
    });

    const resumen = cajas.map((caja: any) => {
      const ingresos = caja.movimientos.filter((m: any) => m.tipo === 'INGRESO').reduce((s: number, m: any) => s + Number(m.monto), 0);
      const egresos = caja.movimientos.filter((m: any) => m.tipo === 'EGRESO').reduce((s: number, m: any) => s + Number(m.monto), 0);
      return {
        id: caja.id,
        fecha: caja.fecha,
        usuario: caja.usuario,
        estado: caja.estado,
        saldoApertura: Number(caja.saldoApertura),
        saldoCierre: caja.saldoCierre ? Number(caja.saldoCierre) : null,
        ingresos,
        egresos,
        saldoCalculado: Number(caja.saldoApertura) + ingresos - egresos,
      };
    });

    const totalesGlobales = resumen.reduce(
      (acc: any, c: any) => ({ ingresos: acc.ingresos + c.ingresos, egresos: acc.egresos + c.egresos }),
      { ingresos: 0, egresos: 0 }
    );

    return { cajas: resumen, totalesGlobales };
  }

  async reporteGastos(filtros: FiltroReporte) {
    const where: any = {};
    if (filtros.desde || filtros.hasta) {
      where.fecha = {};
      if (filtros.desde) where.fecha.gte = new Date(filtros.desde);
      if (filtros.hasta) where.fecha.lte = new Date(filtros.hasta + 'T23:59:59');
    }

    const [gastos, resumenTipo] = await Promise.all([
      prisma.gasto.findMany({
        where,
        orderBy: { fecha: 'desc' },
        include: {
          pedido: { select: { id: true, origen: true, destino: true } },
          usuario: { select: { id: true, nombre: true } },
        },
      }),
      prisma.gasto.groupBy({
        by: ['tipoGasto'],
        where,
        _count: true,
        _sum: { monto: true },
      }),
    ]);

    const totalGastos = gastos.reduce((s: number, g: any) => s + Number(g.monto), 0);

    return {
      gastos,
      resumenPorTipo: resumenTipo.map((r: any) => ({
        tipoGasto: r.tipoGasto,
        cantidad: r._count,
        total: Number(r._sum.monto || 0),
      })),
      totales: { cantidad: gastos.length, totalGastos },
    };
  }

  async dashboardGeneral() {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);

    const [
      totalClientes,
      pedidosMes,
      facturacionMes,
      cobranzaMes,
      gastosMes,
      pedidosPorEstado,
    ] = await Promise.all([
      prisma.cliente.count({ where: { activo: true } }),
      prisma.pedido.count({ where: { creadoEn: { gte: inicioMes, lte: finMes } } }),
      prisma.factura.aggregate({
        where: { creadoEn: { gte: inicioMes, lte: finMes }, estado: { not: 'ANULADA' } },
        _sum: { total: true },
      }),
      prisma.pago.aggregate({
        where: { fechaPago: { gte: inicioMes, lte: finMes } },
        _sum: { monto: true },
      }),
      prisma.gasto.aggregate({
        where: { fecha: { gte: inicioMes, lte: finMes } },
        _sum: { monto: true },
      }),
      prisma.pedido.groupBy({
        by: ['estado'],
        _count: true,
      }),
    ]);

    const facturado = Number(facturacionMes._sum.total || 0);
    const cobrado = Number(cobranzaMes._sum.monto || 0);
    const gastos = Number(gastosMes._sum.monto || 0);

    return {
      periodo: { desde: inicioMes, hasta: finMes },
      clientes: { total: totalClientes },
      pedidos: {
        totalMes: pedidosMes,
        porEstado: pedidosPorEstado.map((p: any) => ({ estado: p.estado, cantidad: p._count })),
      },
      financiero: {
        facturado,
        cobrado,
        porCobrar: facturado - cobrado,
        gastos,
        utilidadBruta: cobrado - gastos,
      },
    };
  }
}

export const reportesService = new ReportesService();
