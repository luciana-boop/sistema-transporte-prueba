// FILE: src/modules/reportes/reportes.service.ts

import prisma from '../../prisma/client';
import { cobranzaService } from '../cobranza/cobranza.service';
import { cuentasService } from '../configuracion/cuentas.service';

export interface FiltroReporte {
  desde?: string;
  hasta?: string;
  clienteId?: string;
}

// Categorías de egreso que NO son un gasto real del negocio: CAJA_CHICA es
// una transferencia interna (el gasto real se cuenta cuando se usa desde la
// caja), TRANSFERENCIA_CUENTAS es un movimiento entre cuentas propias (ej.
// compra de dólares con soles del mismo banco). Ambas se excluyen de "Gastos"
// en todos los reportes.
const CATEGORIAS_EGRESO_NO_GASTO = ['CAJA_CHICA', 'TRANSFERENCIA_CUENTAS'];

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

  // ── Filtro de moneda (reportes que tocan cuentas/movimientos/pagos) ─────────
  // Facturación, pedidos y liquidaciones no tienen moneda propia (siempre
  // soles) y no usan este filtro. Si no se especifica monedaId, se resuelve a
  // la moneda por defecto — así el reporte nunca mezcla soles y dólares en un
  // mismo total, ni con el filtro explícito ni sin él.
  private async resolveMoneda(monedaId?: string) {
    if (monedaId) {
      const m = await prisma.moneda.findUnique({ where: { id: parseInt(monedaId) } });
      if (m) return { id: m.id, codigo: m.codigo, simbolo: m.simbolo, esDefault: m.esPorDefecto };
    }
    const def = await cuentasService.getMonedaDefault();
    if (!def) throw new Error('No hay monedas configuradas');
    return { id: def.id, codigo: def.codigo, simbolo: def.simbolo, esDefault: true };
  }

  // Una Caja (y sus MovimientoCaja) no tiene moneda propia: hereda la de la
  // cuenta de dinero desde la que se abrió. Las cajas históricas sin
  // cuentaOrigenId se asumen en la moneda por defecto (el sistema solo tenía
  // soles cuando se crearon).
  private filtroCajaPorMoneda(monedaId: number, esDefault: boolean) {
    return esDefault
      ? { OR: [{ cuentaOrigenId: null }, { cuentaOrigen: { monedaId } }] }
      : { cuentaOrigen: { monedaId } };
  }

  // Mismo filtro, pero anidado bajo `caja` — para queries sobre MovimientoCaja
  // (que no tiene cuentaOrigenId propio, solo a través de su Caja).
  private filtroMovimientoCajaPorMoneda(monedaId: number, esDefault: boolean) {
    return { caja: this.filtroCajaPorMoneda(monedaId, esDefault) };
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

  // ── Rentabilidad por cliente ──────────────────────────────────────────────
  // Usa el total facturado (sum de facturas activas) como ingreso — no la tarifa.
  // Los costos de liquidación se distribuyen proporcionalmente por tarifa entre
  // los pedidos de la misma liquidación para evitar duplicados.
  async rentabilidadPorCliente(filtros: FiltroReporte) {
    const where = this.parseFiltros(filtros);

    const pedidos = await prisma.pedido.findMany({
      where,
      select: {
        id: true,
        tarifa: true,
        clienteId: true,
        cliente: { select: { id: true, razonSocial: true } },
        facturas: {
          where: { estado: { not: 'ANULADA' } },
          select: { total: true },
        },
        liquidaciones: {
          select: {
            liquidacion: {
              select: {
                id: true,
                totalGastos: true,
                pedidos: { select: { pedido: { select: { id: true, tarifa: true } } } },
                combustibles: { select: { monto: true } },
              },
            },
          },
        },
      },
    });

    // Mapa: clienteId → acumuladores
    const porCliente = new Map<number, {
      clienteId: number;
      razonSocial: string;
      cantidadPedidos: number;
      facturacion: number;
      costos: number;
    }>();

    for (const pedido of pedidos) {
      const tarifa = Number(pedido.tarifa);
      // Total efectivamente facturado para este pedido (sum de facturas activas)
      const totalFacturado = (pedido.facturas as any[]).reduce((s: number, f: any) => s + Number(f.total), 0);
      let costoDistribuido = 0;

      for (const lp of pedido.liquidaciones) {
        const liq = lp.liquidacion;
        const combustibleLiq = liq.combustibles.reduce((s: number, c: any) => s + Number(c.monto), 0);
        const costoTotalLiq = Number(liq.totalGastos) + combustibleLiq;

        // Distribución proporcional por tarifa (base de reparto más justa)
        const tarifaTotalLiq = liq.pedidos.reduce((s: number, p: any) => s + Number(p.pedido.tarifa), 0);
        const proporcion = tarifaTotalLiq > 0 ? tarifa / tarifaTotalLiq : 0;
        costoDistribuido += costoTotalLiq * proporcion;
      }

      const cliente = porCliente.get(pedido.clienteId) ?? {
        clienteId: pedido.clienteId,
        razonSocial: pedido.cliente.razonSocial,
        cantidadPedidos: 0,
        facturacion: 0,
        costos: 0,
      };
      cliente.cantidadPedidos += 1;
      cliente.facturacion += totalFacturado;
      cliente.costos += costoDistribuido;
      porCliente.set(pedido.clienteId, cliente);
    }

    const resultado = Array.from(porCliente.values()).map((c) => {
      const utilidad = Math.round((c.facturacion - c.costos) * 100) / 100;
      const margen = c.facturacion > 0 ? Math.round((utilidad / c.facturacion) * 10000) / 100 : 0;
      return {
        clienteId: c.clienteId,
        razonSocial: c.razonSocial,
        cantidadPedidos: c.cantidadPedidos,
        facturacion: Math.round(c.facturacion * 100) / 100,
        costos: Math.round(c.costos * 100) / 100,
        utilidad,
        margen,
      };
    }).sort((a, b) => b.utilidad - a.utilidad);

    return { clientes: resultado };
  }

  // ── Detalle de rentabilidad por cliente (per-pedido) ──────────────────────
  async rentabilidadClienteDetalle(clienteId: number, filtros: FiltroReporte) {
    const where = { ...this.parseFiltros(filtros), clienteId };

    const pedidos = await prisma.pedido.findMany({
      where,
      orderBy: { fechaPedido: 'desc' },
      select: {
        id: true,
        tarifa: true,
        fechaPedido: true,
        origen: true,
        destino: true,
        estado: true,
        facturas: {
          where: { estado: { not: 'ANULADA' } },
          select: { id: true, numeroFactura: true, total: true, estado: true, fechaEmision: true },
        },
        liquidaciones: {
          select: {
            liquidacion: {
              select: {
                id: true,
                totalGastos: true,
                pedidos: { select: { pedido: { select: { id: true, tarifa: true } } } },
                combustibles: { select: { monto: true } },
              },
            },
          },
        },
      },
    });

    const detallePedidos = pedidos.map((pedido) => {
      const tarifa = Number(pedido.tarifa);
      const totalFacturado = (pedido.facturas as any[]).reduce((s: number, f: any) => s + Number(f.total), 0);

      let costoLiquidacion = 0;
      let costoCombustible = 0;
      const liquidacionesDetalle: Array<{ liquidacionId: number; costoAsignado: number; combustibleAsignado: number }> = [];

      for (const lp of pedido.liquidaciones) {
        const liq = lp.liquidacion;
        const combustibleLiq = liq.combustibles.reduce((s: number, c: any) => s + Number(c.monto), 0);
        const costoTotalLiq = Number(liq.totalGastos) + combustibleLiq;

        const tarifaTotalLiq = liq.pedidos.reduce((s: number, p: any) => s + Number(p.pedido.tarifa), 0);
        const proporcion = tarifaTotalLiq > 0 ? tarifa / tarifaTotalLiq : 0;

        const gastoAsignado = Number(liq.totalGastos) * proporcion;
        const combustibleAsignado = combustibleLiq * proporcion;

        costoLiquidacion += gastoAsignado;
        costoCombustible += combustibleAsignado;
        liquidacionesDetalle.push({
          liquidacionId: liq.id,
          costoAsignado: Math.round(gastoAsignado * 100) / 100,
          combustibleAsignado: Math.round(combustibleAsignado * 100) / 100,
        });
      }

      const totalCostos = costoLiquidacion + costoCombustible;
      const utilidad = totalFacturado - totalCostos;

      return {
        id: pedido.id,
        fecha: pedido.fechaPedido,
        origen: pedido.origen,
        destino: pedido.destino,
        estado: pedido.estado,
        facturas: pedido.facturas,
        totalFacturado: Math.round(totalFacturado * 100) / 100,
        costos: {
          liquidacion: Math.round(costoLiquidacion * 100) / 100,
          combustible: Math.round(costoCombustible * 100) / 100,
          total: Math.round(totalCostos * 100) / 100,
        },
        liquidacionesDetalle,
        utilidad: Math.round(utilidad * 100) / 100,
      };
    });

    const totales = detallePedidos.reduce(
      (acc, p) => ({
        totalFacturado: acc.totalFacturado + p.totalFacturado,
        totalCostos: acc.totalCostos + p.costos.total,
        totalUtilidad: acc.totalUtilidad + p.utilidad,
      }),
      { totalFacturado: 0, totalCostos: 0, totalUtilidad: 0 }
    );

    return {
      clienteId,
      pedidos: detallePedidos,
      totales: {
        totalFacturado: Math.round(totales.totalFacturado * 100) / 100,
        totalCostos: Math.round(totales.totalCostos * 100) / 100,
        totalUtilidad: Math.round(totales.totalUtilidad * 100) / 100,
      },
    };
  }

  async reporteFacturacion(filtros: FiltroReporte) {
    // Se filtra por fecha de EMISIÓN de la factura, no por cuándo se creó el
    // registro en el sistema — si no, una importación masiva hecha hoy con
    // facturas de meses anteriores aparecería toda dentro del mes actual.
    const where: any = {};
    if (filtros.clienteId) where.clienteId = parseInt(filtros.clienteId);
    if (filtros.desde || filtros.hasta) {
      where.fechaEmision = {};
      if (filtros.desde) where.fechaEmision.gte = new Date(filtros.desde);
      if (filtros.hasta) where.fechaEmision.lte = new Date(filtros.hasta + 'T23:59:59');
    }

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

    // Resumen agrupado por cliente
    const porClienteMap = new Map<number, {
      clienteId: number;
      razonSocial: string;
      totalFacturas: number;
      emitidas: number;
      pagadas: number;
      parciales: number;
      montoTotal: number;
    }>();

    for (const f of facturas as any[]) {
      if (!f.clienteId) continue;
      const entry = porClienteMap.get(f.clienteId) ?? {
        clienteId: f.clienteId,
        razonSocial: f.cliente?.razonSocial ?? '',
        totalFacturas: 0,
        emitidas: 0,
        pagadas: 0,
        parciales: 0,
        montoTotal: 0,
      };
      entry.totalFacturas += 1;
      entry.montoTotal += Number(f.total);
      if (f.estado === 'EMITIDA') entry.emitidas += 1;
      else if (f.estado === 'PAGADA') entry.pagadas += 1;
      else if (f.estado === 'PARCIAL') entry.parciales += 1;
      porClienteMap.set(f.clienteId, entry);
    }

    const resumenPorCliente = Array.from(porClienteMap.values())
      .map((c) => ({ ...c, montoTotal: Math.round(c.montoTotal * 100) / 100 }))
      .sort((a, b) => b.montoTotal - a.montoTotal);

    return {
      facturas,
      resumenEstados: resumenEstados.map((r: any) => ({
        estado: r.estado,
        cantidad: r._count,
        subtotal: Number(r._sum.subtotal || 0),
        igv: Number(r._sum.igv || 0),
        total: Number(r._sum.total || 0),
      })),
      resumenPorCliente,
      totales: { ...totales, cantidad: facturas.length },
    };
  }

  async reporteCobranza(filtros: FiltroReporte & { monedaId?: string }) {
    const moneda = await this.resolveMoneda(filtros.monedaId);
    const where: any = { monedaId: moneda.id };
    if (filtros.clienteId) where.clienteId = parseInt(filtros.clienteId);
    if (filtros.desde || filtros.hasta) {
      where.fechaPago = {};
      if (filtros.desde) where.fechaPago.gte = new Date(filtros.desde);
      if (filtros.hasta) where.fechaPago.lte = new Date(filtros.hasta + 'T23:59:59');
    }
    where.anulado = false;

    const [pagos, resumenMetodo] = await Promise.all([
      prisma.pagoV2.findMany({
        where,
        orderBy: { fechaPago: 'desc' },
        include: {
          cliente: { select: { id: true, razonSocial: true } },
          factura: { select: { id: true, numeroFactura: true, total: true } },
          tipoPago: { select: { nombre: true } },
        },
      }),
      prisma.pagoV2.groupBy({
        by: ['tipoPagoId'],
        where,
        _count: true,
        _sum: { monto: true },
      }),
    ]);

    const tiposPago = await prisma.tipoPago.findMany({ select: { id: true, nombre: true } });
    const nombreTipoPago = new Map(tiposPago.map((t) => [t.id, t.nombre]));

    const totalCobrado = pagos.reduce((s: number, p: any) => s + Number(p.monto), 0);

    // "Facturado en el período" (por fecha de EMISIÓN, no de creación del
    // registro — mismo criterio que reporteFacturacion) y "cobrado en el
    // período" son métricas de flujo del mes. El "saldo pendiente" en cambio
    // NO se limita al período: una factura que quedó por cobrar de un mes
    // anterior debe seguir sumando hasta que se cobre, así que se reutiliza
    // cobranzaService (mismo cálculo que el módulo Cobranza, neto de detracción).
    const clienteIdFiltro = filtros.clienteId ? parseInt(filtros.clienteId) : undefined;

    const whereFacturasPeriodo: any = { estado: { not: 'ANULADA' } };
    if (clienteIdFiltro) whereFacturasPeriodo.clienteId = clienteIdFiltro;
    if (filtros.desde || filtros.hasta) {
      whereFacturasPeriodo.fechaEmision = {};
      if (filtros.desde) whereFacturasPeriodo.fechaEmision.gte = new Date(filtros.desde);
      if (filtros.hasta) whereFacturasPeriodo.fechaEmision.lte = new Date(filtros.hasta + 'T23:59:59');
    }

    const [facturasPeriodo, pendientes] = await Promise.all([
      prisma.factura.findMany({
        where: whereFacturasPeriodo,
        select: { clienteId: true, total: true },
      }),
      cobranzaService.facturasPendientes(clienteIdFiltro ? { clienteId: clienteIdFiltro } : {}),
    ]);

    const facturadoPorCliente = new Map<number, number>();
    for (const f of facturasPeriodo) {
      if (!f.clienteId) continue;
      facturadoPorCliente.set(f.clienteId, (facturadoPorCliente.get(f.clienteId) ?? 0) + Number(f.total));
    }

    const cobradoPorCliente = new Map<number, number>();
    for (const p of pagos as any[]) {
      if (!p.clienteId) continue;
      cobradoPorCliente.set(p.clienteId, (cobradoPorCliente.get(p.clienteId) ?? 0) + Number(p.monto));
    }

    const saldoPorCliente = new Map<number, number>();
    for (const f of pendientes) {
      saldoPorCliente.set(f.cliente.id, (saldoPorCliente.get(f.cliente.id) ?? 0) + f.saldoPendiente);
    }

    // Unión: un cliente aparece en el resumen si facturó, cobró, o tiene
    // saldo pendiente actual — así una deuda vieja sigue visible aunque no
    // haya tenido movimiento este mes.
    const clienteIds = new Set<number>([
      ...facturadoPorCliente.keys(),
      ...cobradoPorCliente.keys(),
      ...saldoPorCliente.keys(),
    ]);

    const clientesInfo = clienteIds.size > 0
      ? await prisma.cliente.findMany({
          where: { id: { in: [...clienteIds] } },
          select: { id: true, razonSocial: true },
        })
      : [];
    const razonSocialPorId = new Map(clientesInfo.map((c) => [c.id, c.razonSocial]));

    // totalFacturado/saldoPendiente vienen de Factura, que siempre está en
    // soles (sin moneda propia); totalCobrado sí respeta la moneda filtrada.
    // Cuando la moneda seleccionada no es la default, dividir cobrado/facturado
    // mezclaría dos monedas distintas, así que el % se omite.
    const resumenPorCliente = [...clienteIds].map((clienteId) => {
      const totalFacturado = Math.round((facturadoPorCliente.get(clienteId) ?? 0) * 100) / 100;
      const totalCobradoCliente = Math.round((cobradoPorCliente.get(clienteId) ?? 0) * 100) / 100;
      const saldoPendiente = Math.round((saldoPorCliente.get(clienteId) ?? 0) * 100) / 100;
      return {
        clienteId,
        razonSocial: razonSocialPorId.get(clienteId) ?? '',
        totalFacturado,
        totalCobrado: totalCobradoCliente,
        saldoPendiente,
        porcentajeCobrado: !moneda.esDefault
          ? null
          : totalFacturado > 0
          ? Math.round((totalCobradoCliente / totalFacturado) * 10000) / 100
          : 0,
      };
    }).sort((a, b) => b.saldoPendiente - a.saldoPendiente || b.totalFacturado - a.totalFacturado);

    return {
      moneda: { id: moneda.id, codigo: moneda.codigo, simbolo: moneda.simbolo, esDefault: moneda.esDefault },
      pagos,
      resumenPorMetodo: resumenMetodo.map((r: any) => ({
        metodoPago: r.tipoPagoId ? (nombreTipoPago.get(r.tipoPagoId) ?? 'Otro') : 'Sin especificar',
        cantidad: r._count,
        total: Number(r._sum.monto || 0),
      })),
      resumenPorCliente,
      totales: { cantidad: pagos.length, totalCobrado },
    };
  }

  async reporteCaja(filtros: FiltroReporte & { monedaId?: string }) {
    const moneda = await this.resolveMoneda(filtros.monedaId);
    const where: any = { ...this.filtroCajaPorMoneda(moneda.id, moneda.esDefault) };
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

    return {
      moneda: { id: moneda.id, codigo: moneda.codigo, simbolo: moneda.simbolo, esDefault: moneda.esDefault },
      cajas: resumen,
      totalesGlobales,
    };
  }

  // El retiro de dinero del banco hacia una caja chica (MovimientoCuentaV2 con
  // categoriaEgreso = CAJA_CHICA) es una transferencia interna, no un gasto real
  // — se excluye aquí para no duplicarlo. El gasto real se registra cuando esa
  // plata se usa (MovimientoCaja categorizado dentro de la caja abierta).
  async reporteEgresos(filtros: FiltroReporte & { monedaId?: string }) {
    const moneda = await this.resolveMoneda(filtros.monedaId);
    const whereFecha: any = {};
    if (filtros.desde || filtros.hasta) {
      whereFecha.fecha = {};
      if (filtros.desde) whereFecha.fecha.gte = new Date(filtros.desde);
      if (filtros.hasta) whereFecha.fecha.lte = new Date(filtros.hasta + 'T23:59:59');
    }

    const [egresosCuenta, egresosCaja] = await Promise.all([
      prisma.movimientoCuentaV2.findMany({
        where: { tipo: 'EGRESO', anulado: false, categoriaEgreso: { notIn: CATEGORIAS_EGRESO_NO_GASTO }, monedaId: moneda.id, ...whereFecha },
        orderBy: { fecha: 'desc' },
        include: {
          cuenta: { select: { id: true, nombre: true, tipoCuenta: true } },
          usuario: { select: { id: true, nombre: true } },
        },
      }),
      prisma.movimientoCaja.findMany({
        where: { tipo: 'EGRESO', anulado: false, ...this.filtroMovimientoCajaPorMoneda(moneda.id, moneda.esDefault), ...whereFecha },
        orderBy: { fecha: 'desc' },
        include: {
          caja: { select: { id: true, nombre: true, usuario: { select: { id: true, nombre: true } } } },
          vehiculo: { select: { id: true, placa: true } },
        },
      }),
    ]);

    const egresos = [
      ...egresosCuenta.map((e: any) => ({ ...e, origen: 'CUENTA' })),
      ...egresosCaja.map((m: any) => ({
        id: m.id,
        origen: 'CAJA',
        fecha: m.fecha,
        concepto: m.concepto,
        monto: m.monto,
        categoriaEgreso: m.categoriaEgreso,
        cuenta: null,
        caja: m.caja,
        vehiculo: m.vehiculo,
      })),
    ].sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const totalEgresos = egresos.reduce((s: number, g: any) => s + Number(g.monto), 0);

    return {
      moneda: { id: moneda.id, codigo: moneda.codigo, simbolo: moneda.simbolo, esDefault: moneda.esDefault },
      egresos,
      totales: { cantidad: egresos.length, totalEgresos },
    };
  }

  // ── Reporte Mantenimiento ─────────────────────────────────────────────────
  // Incluye tanto los egresos de Movimientos ya "relacionados" a un vehículo
  // (MantenimientoDetalle) como los egresos de Mantenimiento pagados con caja
  // chica (MovimientoCaja categorizado, con vehículo asignado).
  async reporteMantenimiento(filtros: FiltroReporte & { vehiculoId?: string; monedaId?: string }) {
    const moneda = await this.resolveMoneda(filtros.monedaId);
    const whereFecha: any = {};
    if (filtros.desde || filtros.hasta) {
      whereFecha.fecha = {};
      if (filtros.desde) whereFecha.fecha.gte = new Date(filtros.desde);
      if (filtros.hasta) whereFecha.fecha.lte = new Date(filtros.hasta + 'T23:59:59');
    }
    const vehiculoIdNum = filtros.vehiculoId ? parseInt(filtros.vehiculoId) : undefined;

    const whereCuenta: any = { tipo: 'EGRESO', anulado: false, categoriaEgreso: 'MANTENIMIENTO', monedaId: moneda.id, ...whereFecha };
    if (vehiculoIdNum) whereCuenta.mantenimiento = { vehiculoId: vehiculoIdNum };

    const whereCaja: any = {
      tipo: 'EGRESO', anulado: false, categoriaEgreso: 'MANTENIMIENTO',
      vehiculoId: vehiculoIdNum ?? { not: null },
      ...this.filtroMovimientoCajaPorMoneda(moneda.id, moneda.esDefault),
      ...whereFecha,
    };

    const [gastosCuenta, gastosCaja] = await Promise.all([
      prisma.movimientoCuentaV2.findMany({
        where: whereCuenta,
        orderBy: { fecha: 'desc' },
        include: {
          cuenta: { select: { id: true, nombre: true } },
          mantenimiento: {
            include: {
              vehiculo: { select: { id: true, placa: true, marca: true, modelo: true } },
              conductor: { select: { id: true, nombre: true } },
            },
          },
        },
      }),
      prisma.movimientoCaja.findMany({
        where: whereCaja,
        orderBy: { fecha: 'desc' },
        include: { vehiculo: { select: { id: true, placa: true, marca: true, modelo: true } } },
      }),
    ]);

    const relacionadosCuenta = gastosCuenta.filter((g: any) => g.mantenimiento);
    const relacionadosCaja = gastosCaja.map((m: any) => ({
      id: `caja-${m.id}`,
      origen: 'CAJA',
      fecha: m.fecha,
      monto: m.monto,
      mantenimiento: { vehiculo: m.vehiculo, motivoCodigo: null, descripcion: m.concepto },
    }));

    const relacionados = [...relacionadosCuenta, ...relacionadosCaja]
      .sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    const totalGastado = relacionados.reduce((s: number, g: any) => s + Number(g.monto), 0);

    const porVehiculo = new Map<string, { vehiculoId: number; placa: string; total: number; cantidad: number }>();
    for (const g of relacionados as any[]) {
      const v = g.mantenimiento.vehiculo;
      const acc = porVehiculo.get(v.placa) ?? { vehiculoId: v.id, placa: v.placa, total: 0, cantidad: 0 };
      acc.total += Number(g.monto);
      acc.cantidad += 1;
      porVehiculo.set(v.placa, acc);
    }

    return {
      moneda: { id: moneda.id, codigo: moneda.codigo, simbolo: moneda.simbolo, esDefault: moneda.esDefault },
      gastos: relacionados,
      totalGastado,
      cantidad: relacionados.length,
      porVehiculo: Array.from(porVehiculo.values()).sort((a, b) => b.total - a.total),
    };
  }

  // ── Reporte Anual ─────────────────────────────────────────────────────────
  private static readonly NOMBRES_MES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  async reporteAnual(anio: number, monedaId?: string) {
    const inicioAnio = new Date(anio, 0, 1);
    const finAnio = new Date(anio, 11, 31, 23, 59, 59);
    const moneda = await this.resolveMoneda(monedaId);

    const [pedidos, facturas, pagos, gastosCuenta, gastosCaja] = await Promise.all([
      prisma.pedido.findMany({
        where: { fechaPedido: { gte: inicioAnio, lte: finAnio } },
        select: { fechaPedido: true, tarifa: true },
      }),
      // La facturación no tiene moneda propia (siempre soles): no se filtra por `moneda`.
      prisma.factura.findMany({
        where: { fechaEmision: { gte: inicioAnio, lte: finAnio }, estado: { not: 'ANULADA' } },
        select: { fechaEmision: true, total: true },
      }),
      prisma.pagoV2.findMany({
        where: { fechaPago: { gte: inicioAnio, lte: finAnio }, anulado: false, monedaId: moneda.id },
        select: { fechaPago: true, monto: true },
      }),
      // Excluye CAJA_CHICA: es una transferencia a la caja chica, no un gasto real.
      prisma.movimientoCuentaV2.findMany({
        where: { tipo: 'EGRESO', anulado: false, categoriaEgreso: { notIn: CATEGORIAS_EGRESO_NO_GASTO }, fecha: { gte: inicioAnio, lte: finAnio }, monedaId: moneda.id },
        select: { fecha: true, monto: true },
      }),
      // Gasto real de lo efectivamente pagado con caja chica.
      prisma.movimientoCaja.findMany({
        where: { tipo: 'EGRESO', anulado: false, fecha: { gte: inicioAnio, lte: finAnio }, ...this.filtroMovimientoCajaPorMoneda(moneda.id, moneda.esDefault) },
        select: { fecha: true, monto: true },
      }),
    ]);

    const meses = ReportesService.NOMBRES_MES.map((nombreMes, i) => ({
      mes: i + 1,
      nombreMes,
      pedidos: 0,
      facturado: 0,
      cobrado: 0,
      gastos: 0,
    }));

    for (const p of pedidos) meses[p.fechaPedido.getMonth()].pedidos += 1;
    for (const f of facturas) meses[f.fechaEmision.getMonth()].facturado += Number(f.total);
    for (const pg of pagos) meses[pg.fechaPago.getMonth()].cobrado += Number(pg.monto);
    for (const g of gastosCuenta) meses[g.fecha.getMonth()].gastos += Number(g.monto);
    for (const g of gastosCaja) meses[g.fecha!.getMonth()].gastos += Number(g.monto);

    const mesesConUtilidad = meses.map((m) => ({ ...m, utilidad: Math.round((m.facturado - m.gastos) * 100) / 100 }));

    const conActividad = mesesConUtilidad.filter((m) => m.pedidos > 0 || m.facturado > 0 || m.cobrado > 0 || m.gastos > 0);
    const promedioUtilidad = conActividad.length
      ? Math.round((conActividad.reduce((s, m) => s + m.utilidad, 0) / conActividad.length) * 100) / 100
      : 0;

    // Facturado está siempre en soles; restarle gastos de otra moneda no
    // tiene sentido, así que la utilidad y su clasificación solo se calculan
    // para la moneda por defecto.
    const clasificar = (m: (typeof mesesConUtilidad)[number]): 'BUEN_MES' | 'MES_REGULAR' | 'MAL_MES' | 'SIN_DATOS' | 'NO_APLICA' => {
      if (!moneda.esDefault) return 'NO_APLICA';
      if (m.pedidos === 0 && m.facturado === 0 && m.cobrado === 0 && m.gastos === 0) return 'SIN_DATOS';
      if (m.utilidad >= promedioUtilidad * 1.1) return 'BUEN_MES';
      if (m.utilidad < promedioUtilidad * 0.9) return 'MAL_MES';
      return 'MES_REGULAR';
    };

    const tabla = mesesConUtilidad.map((m) => ({
      ...m,
      utilidad: moneda.esDefault ? m.utilidad : null,
      clasificacion: clasificar(m),
    }));

    const totales = mesesConUtilidad.reduce(
      (acc, m) => ({
        pedidos: acc.pedidos + m.pedidos,
        facturado: acc.facturado + m.facturado,
        cobrado: acc.cobrado + m.cobrado,
        gastos: acc.gastos + m.gastos,
        utilidad: acc.utilidad + m.utilidad,
      }),
      { pedidos: 0, facturado: 0, cobrado: 0, gastos: 0, utilidad: 0 }
    );

    return {
      anio,
      moneda: { id: moneda.id, codigo: moneda.codigo, simbolo: moneda.simbolo, esDefault: moneda.esDefault },
      promedioUtilidadMensual: moneda.esDefault ? promedioUtilidad : null,
      meses: tabla,
      totales: {
        ...totales,
        facturado: Math.round(totales.facturado * 100) / 100,
        cobrado: Math.round(totales.cobrado * 100) / 100,
        gastos: Math.round(totales.gastos * 100) / 100,
        utilidad: moneda.esDefault ? Math.round(totales.utilidad * 100) / 100 : null,
      },
    };
  }

  // ── Conductor del mes ─────────────────────────────────────────────────────
  async conductorDelMes() {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    const periodo = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1, nombreMes: ReportesService.NOMBRES_MES[hoy.getMonth()] };

    const [conductores, liquidacionPedidos, combustibles] = await Promise.all([
      prisma.conductor.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
      prisma.liquidacionPedido.findMany({
        where: { pedido: { fechaPedido: { gte: inicioMes, lte: finMes } } },
        select: { liquidacion: { select: { conductorId: true } } },
      }),
      prisma.combustible.groupBy({
        by: ['conductorId'],
        where: { fecha: { gte: inicioMes, lte: finMes }, conductorId: { not: null } },
        _sum: { monto: true },
      }),
    ]);

    const viajesPorConductor = new Map<number, number>();
    for (const lp of liquidacionPedidos) {
      const cId = lp.liquidacion.conductorId;
      viajesPorConductor.set(cId, (viajesPorConductor.get(cId) ?? 0) + 1);
    }

    const combustiblePorConductor = new Map<number, number>();
    for (const c of combustibles) {
      if (c.conductorId != null) combustiblePorConductor.set(c.conductorId, Number(c._sum.monto || 0));
    }

    const candidatos = conductores
      .map((c) => {
        const viajes = viajesPorConductor.get(c.id) ?? 0;
        const combustibleTotal = Math.round((combustiblePorConductor.get(c.id) ?? 0) * 100) / 100;
        return {
          conductorId: c.id,
          nombre: c.nombre,
          viajes,
          combustibleTotal,
          combustiblePromedio: viajes > 0 ? Math.round((combustibleTotal / viajes) * 100) / 100 : 0,
        };
      })
      .filter((c) => c.viajes > 0);

    if (candidatos.length === 0) {
      return { periodo, ganador: null, ranking: [] };
    }

    const maxViajes = Math.max(...candidatos.map((c) => c.viajes));
    const promediosPositivos = candidatos.map((c) => c.combustiblePromedio).filter((p) => p > 0);
    const minPromedio = promediosPositivos.length > 0 ? Math.min(...promediosPositivos) : 0;

    const ranking = candidatos
      .map((c) => {
        const scoreViajes = c.viajes / maxViajes;
        const scoreEficiencia = c.combustiblePromedio === 0 ? 1 : minPromedio / c.combustiblePromedio;
        const scoreFinal = Math.round(((scoreViajes + scoreEficiencia) / 2) * 1000) / 1000;
        return { ...c, scoreFinal };
      })
      .sort((a, b) => b.scoreFinal - a.scoreFinal || b.viajes - a.viajes)
      .slice(0, 5);

    return { periodo, ganador: ranking[0], ranking };
  }

  async dashboardGeneral(filtros: { desde?: string; hasta?: string; monedaId?: string } = {}) {
    const hoy = new Date();
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const desde = filtros.desde ? new Date(filtros.desde) : inicioMesActual;
    const hasta = filtros.hasta ? new Date(filtros.hasta + 'T23:59:59') : hoy;
    const moneda = await this.resolveMoneda(filtros.monedaId);

    const [
      totalClientes,
      pedidosPeriodo,
      facturacionPeriodo,
      cobranzaPeriodo,
      gastosCuentaPeriodo,
      gastosCajaPeriodo,
      pedidosPorEstado,
    ] = await Promise.all([
      prisma.cliente.count({ where: { activo: true } }),
      prisma.pedido.count({ where: { creadoEn: { gte: desde, lte: hasta } } }),
      // Por fecha de EMISIÓN, no de creación del registro — una importación
      // masiva hecha hoy con facturas de meses anteriores no debe contarse
      // como facturado del mes actual. La facturación no tiene moneda propia
      // (siempre soles), así que no se filtra por `moneda`.
      prisma.factura.aggregate({
        where: { fechaEmision: { gte: desde, lte: hasta }, estado: { not: 'ANULADA' } },
        _sum: { total: true },
      }),
      prisma.pagoV2.aggregate({
        where: { fechaPago: { gte: desde, lte: hasta }, anulado: false, monedaId: moneda.id },
        _sum: { monto: true },
      }),
      // Excluye CAJA_CHICA (transferencia interna, no gasto real).
      prisma.movimientoCuentaV2.aggregate({
        where: { tipo: 'EGRESO', anulado: false, categoriaEgreso: { notIn: CATEGORIAS_EGRESO_NO_GASTO }, fecha: { gte: desde, lte: hasta }, monedaId: moneda.id },
        _sum: { monto: true },
      }),
      prisma.movimientoCaja.aggregate({
        where: { tipo: 'EGRESO', anulado: false, fecha: { gte: desde, lte: hasta }, ...this.filtroMovimientoCajaPorMoneda(moneda.id, moneda.esDefault) },
        _sum: { monto: true },
      }),
      prisma.pedido.groupBy({
        by: ['estado'],
        where: { creadoEn: { gte: desde, lte: hasta } },
        _count: true,
      }),
    ]);

    const facturado = Number(facturacionPeriodo._sum.total || 0);
    const cobrado = Number(cobranzaPeriodo._sum.monto || 0);
    const gastos = Number(gastosCuentaPeriodo._sum.monto || 0) + Number(gastosCajaPeriodo._sum.monto || 0);

    // "Por cobrar" es el saldo pendiente ACTUAL (no limitado al período): una
    // factura que quedó por cobrar de un mes anterior sigue sumando hasta que
    // se cobre. Mismo cálculo que el módulo Cobranza (neto de detracción).
    // También siempre en soles — las facturas no tienen moneda propia.
    const pendientes = await cobranzaService.facturasPendientes();
    const porCobrar = Math.round(pendientes.reduce((s, f) => s + f.saldoPendiente, 0) * 100) / 100;

    return {
      periodo: { desde, hasta },
      moneda: { id: moneda.id, codigo: moneda.codigo, simbolo: moneda.simbolo, esDefault: moneda.esDefault },
      clientes: { total: totalClientes },
      pedidos: {
        totalMes: pedidosPeriodo,
        porEstado: pedidosPorEstado.map((p: any) => ({ estado: p.estado, cantidad: p._count })),
      },
      financiero: {
        facturado,
        cobrado,
        porCobrar,
        gastos,
        // Facturado está siempre en soles; restarle gastos de otra moneda no
        // tiene sentido, así que la utilidad solo se calcula para la moneda
        // por defecto.
        utilidadBruta: moneda.esDefault ? facturado - gastos : null,
      },
    };
  }

  // ── Tabla semanal por conductor ───────────────────────────────────────────
  async tablaSemanal(filtros: { desde?: string; hasta?: string } = {}) {
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunesActual = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diffLunes);

    const desde = filtros.desde ? new Date(filtros.desde) : lunesActual;
    const hasta = filtros.hasta ? new Date(filtros.hasta + 'T23:59:59') : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

    const liquidaciones = await prisma.liquidacion.findMany({
      where: { fecha: { gte: desde, lte: hasta } },
      select: {
        conductorId: true,
        conductor: { select: { nombre: true } },
        totalGastos: true,
        pedidos: {
          select: {
            pedido: {
              select: {
                tarifa: true,
                facturas: {
                  where: { estado: { not: 'ANULADA' } },
                  select: { total: true },
                },
              },
            },
          },
        },
        combustibles: { select: { monto: true } },
      },
    });

    const porConductor = new Map<number, {
      conductorId: number;
      nombre: string;
      cantidadPedidos: number;
      ingreso: number;
      costos: number;
    }>();

    for (const liq of liquidaciones) {
      // Ingreso = total facturado de los pedidos en esta liquidación (no tarifa)
      const ingresoLiquidacion = liq.pedidos.reduce((s, lp) => {
        const facturado = (lp.pedido as any).facturas?.reduce((fs: number, f: any) => fs + Number(f.total), 0) ?? 0;
        return s + facturado;
      }, 0);
      const combustibleLiquidacion = liq.combustibles.reduce((s, c) => s + Number(c.monto), 0);
      const costosLiquidacion = Number(liq.totalGastos) + combustibleLiquidacion;

      const actual = porConductor.get(liq.conductorId) ?? {
        conductorId: liq.conductorId,
        nombre: liq.conductor.nombre,
        cantidadPedidos: 0,
        ingreso: 0,
        costos: 0,
      };
      actual.cantidadPedidos += liq.pedidos.length;
      actual.ingreso += ingresoLiquidacion;
      actual.costos += costosLiquidacion;
      porConductor.set(liq.conductorId, actual);
    }

    const conductores = [...porConductor.values()]
      .map((c) => ({
        conductorId: c.conductorId,
        nombre: c.nombre,
        cantidadPedidos: c.cantidadPedidos,
        ingreso: Math.round(c.ingreso * 100) / 100,
        costos: Math.round(c.costos * 100) / 100,
        rentabilidad: Math.round((c.ingreso - c.costos) * 100) / 100,
      }))
      .sort((a, b) => b.rentabilidad - a.rentabilidad);

    return { periodo: { desde, hasta }, conductores };
  }

  // ── Detalle semanal de un conductor ──────────────────────────────────────
  // Devuelve pedidos, facturas, liquidaciones, combustible y gastos del
  // conductor en el período dado, más la rentabilidad total calculada.
  async detalleConductorSemanal(conductorId: number, filtros: { desde?: string; hasta?: string } = {}) {
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    const lunesActual = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + diffLunes);

    const desde = filtros.desde ? new Date(filtros.desde) : lunesActual;
    const hasta = filtros.hasta ? new Date(filtros.hasta + 'T23:59:59') : new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59);

    // Liquidaciones del conductor en el período
    const liquidaciones = await prisma.liquidacion.findMany({
      where: { conductorId, fecha: { gte: desde, lte: hasta } },
      include: {
        pedidos: {
          include: {
            pedido: {
              include: {
                cliente: { select: { id: true, razonSocial: true } },
                facturas: {
                  where: { estado: { not: 'ANULADA' } },
                  select: { id: true, numeroFactura: true, total: true, estado: true },
                },
              },
            },
          },
        },
        combustibles: {
          include: { vehiculo: { select: { placa: true } } },
        },
      },
    });

    // Gastos del conductor (vía vehículos — no hay conductorId directo en Gasto)
    // En lugar de gastos por conductor, obtenemos los de sus liquidaciones
    const pedidosIds = liquidaciones.flatMap((l) => l.pedidos.map((lp) => lp.pedidoId));
    const pedidos = liquidaciones.flatMap((l) =>
      l.pedidos.map((lp) => ({ ...lp.pedido, liquidacionId: l.id }))
    );

    // Facturas únicas relacionadas a los pedidos
    const facturasMap = new Map<number, any>();
    for (const p of pedidos) {
      for (const f of (p as any).facturas ?? []) {
        facturasMap.set(f.id, { ...f, pedidoId: p.id });
      }
    }
    const facturas = Array.from(facturasMap.values());

    // Totales
    let totalIngreso = 0;
    let totalCostos = 0;
    let totalCombustible = 0;

    for (const liq of liquidaciones) {
      // Ingreso = total facturado de los pedidos (facturas activas), no tarifa
      const ingresoLiq = liq.pedidos.reduce((s, lp) => {
        const facturado = ((lp.pedido as any).facturas ?? []).reduce((fs: number, f: any) => fs + Number(f.total), 0);
        return s + facturado;
      }, 0);
      const combustibleLiq = liq.combustibles.reduce((s, c) => s + Number(c.monto), 0);
      const costosLiq = Number(liq.totalGastos) + combustibleLiq;
      totalIngreso += ingresoLiq;
      totalCostos += costosLiq;
      totalCombustible += combustibleLiq;
    }

    return {
      conductorId,
      periodo: { desde, hasta },
      pedidos: pedidos.map((p: any) => ({
        id: p.id,
        cliente: p.cliente?.razonSocial,
        origen: p.origen,
        destino: p.destino,
        tarifa: Number(p.tarifa),
        estado: p.estado,
        fechaPedido: p.fechaPedido,
        liquidacionId: p.liquidacionId,
      })),
      facturas,
      liquidaciones: liquidaciones.map((l) => ({
        id: l.id,
        fecha: l.fecha,
        totalGastos: Number(l.totalGastos),
        montoEntregado: Number(l.montoEntregado),
        devolucion: Number(l.devolucion),
        reintegro: Number(l.reintegro),
        estado: l.estado,
        cantidadPedidos: l.pedidos.length,
      })),
      combustible: liquidaciones.flatMap((l) =>
        l.combustibles.map((c: any) => ({
          id: c.id,
          monto: Number(c.monto),
          litros: c.litros ? Number(c.litros) : null,
          fecha: c.fecha,
          vehiculo: c.vehiculo?.placa,
          liquidacionId: l.id,
        }))
      ),
      resumen: {
        cantidadPedidos: pedidos.length,
        cantidadLiquidaciones: liquidaciones.length,
        totalIngreso: Math.round(totalIngreso * 100) / 100,
        totalCostos: Math.round(totalCostos * 100) / 100,
        totalCombustible: Math.round(totalCombustible * 100) / 100,
        rentabilidad: Math.round((totalIngreso - totalCostos) * 100) / 100,
      },
    };
  }
}

export const reportesService = new ReportesService();
