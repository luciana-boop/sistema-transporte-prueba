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
          vehiculo: { select: { id: true, placa: true, marca: true, modelo: true } },
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

  // ── Reporte Anual ─────────────────────────────────────────────────────────
  // Resumen mensual (pedidos, facturado, cobrado, gastos, utilidad) y tabla
  // anual con clasificación de cada mes por comparación con el promedio anual
  // de utilidad (utilidad = cobrado − gastos, igual criterio que el dashboard
  // general):
  //   BUEN_MES    -> utilidad >= promedio * 1.10 (10% o más por encima del promedio)
  //   MES_REGULAR -> utilidad entre el 90% y el 110% del promedio (cercana al promedio)
  //   MAL_MES     -> utilidad <  promedio * 0.90 (10% o más por debajo del promedio)
  //   SIN_DATOS   -> el mes no tuvo ninguna actividad registrada
  // El promedio se calcula solo sobre los meses con actividad: incluir meses
  // vacíos lo arrastraría a la baja y distorsionaría la clasificación de los
  // meses que sí operaron.
  private static readonly NOMBRES_MES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ];

  async reporteAnual(anio: number) {
    const inicioAnio = new Date(anio, 0, 1);
    const finAnio = new Date(anio, 11, 31, 23, 59, 59);

    const [pedidos, facturas, pagos, gastos] = await Promise.all([
      prisma.pedido.findMany({
        where: { fechaPedido: { gte: inicioAnio, lte: finAnio } },
        select: { fechaPedido: true, tarifa: true },
      }),
      prisma.factura.findMany({
        where: { fechaEmision: { gte: inicioAnio, lte: finAnio }, estado: { not: 'ANULADA' } },
        select: { fechaEmision: true, total: true },
      }),
      prisma.pago.findMany({
        where: { fechaPago: { gte: inicioAnio, lte: finAnio }, anulado: false },
        select: { fechaPago: true, monto: true },
      }),
      prisma.gasto.findMany({
        where: { fecha: { gte: inicioAnio, lte: finAnio } },
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
    for (const g of gastos) meses[g.fecha.getMonth()].gastos += Number(g.monto);

    const mesesConUtilidad = meses.map((m) => ({ ...m, utilidad: Math.round((m.cobrado - m.gastos) * 100) / 100 }));

    const conActividad = mesesConUtilidad.filter((m) => m.pedidos > 0 || m.facturado > 0 || m.cobrado > 0 || m.gastos > 0);
    const promedioUtilidad = conActividad.length
      ? Math.round((conActividad.reduce((s, m) => s + m.utilidad, 0) / conActividad.length) * 100) / 100
      : 0;

    const clasificar = (m: (typeof mesesConUtilidad)[number]): 'BUEN_MES' | 'MES_REGULAR' | 'MAL_MES' | 'SIN_DATOS' => {
      if (m.pedidos === 0 && m.facturado === 0 && m.cobrado === 0 && m.gastos === 0) return 'SIN_DATOS';
      if (m.utilidad >= promedioUtilidad * 1.1) return 'BUEN_MES';
      if (m.utilidad < promedioUtilidad * 0.9) return 'MAL_MES';
      return 'MES_REGULAR';
    };

    const tabla = mesesConUtilidad.map((m) => ({ ...m, clasificacion: clasificar(m) }));

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
      promedioUtilidadMensual: promedioUtilidad,
      meses: tabla,
      totales: {
        ...totales,
        facturado: Math.round(totales.facturado * 100) / 100,
        cobrado: Math.round(totales.cobrado * 100) / 100,
        gastos: Math.round(totales.gastos * 100) / 100,
        utilidad: Math.round(totales.utilidad * 100) / 100,
      },
    };
  }

  // ── Conductor del mes ─────────────────────────────────────────────────────
  // Ranking de conductores del mes en curso por "más viajes, menos combustible".
  // Como ambos factores compiten entre sí (a más viajes, más combustible total
  // es esperable), se combinan en un único score de eficiencia (0–1) que
  // promedia, para cada conductor:
  //   - scoreViajes: su cantidad de viajes relativa al conductor con más viajes
  //   - scoreEficiencia: el promedio de combustible por viaje del conductor más
  //     eficiente, relativo al promedio propio (gana quien gasta menos por viaje)
  // El "viaje" se cuenta como un pedido liquidado del conductor cuya fecha de
  // pedido cae en el mes en curso (vínculo Conductor → Liquidacion →
  // LiquidacionPedido → Pedido, ya que Pedido no tiene conductorId directo).
  // Solo se consideran conductores con al menos un viaje en el mes.
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

  // Por defecto el dashboard muestra "del inicio del mes actual a hoy"; el
  // usuario puede editar el rango desde la UI (filtro de fechas del Dashboard).
  async dashboardGeneral(filtros: { desde?: string; hasta?: string } = {}) {
    const hoy = new Date();
    const inicioMesActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);

    const desde = filtros.desde ? new Date(filtros.desde) : inicioMesActual;
    const hasta = filtros.hasta ? new Date(filtros.hasta + 'T23:59:59') : hoy;

    const [
      totalClientes,
      pedidosPeriodo,
      facturacionPeriodo,
      cobranzaPeriodo,
      gastosPeriodo,
      pedidosPorEstado,
    ] = await Promise.all([
      prisma.cliente.count({ where: { activo: true } }),
      prisma.pedido.count({ where: { creadoEn: { gte: desde, lte: hasta } } }),
      prisma.factura.aggregate({
        where: { creadoEn: { gte: desde, lte: hasta }, estado: { not: 'ANULADA' } },
        _sum: { total: true },
      }),
      prisma.pago.aggregate({
        where: { fechaPago: { gte: desde, lte: hasta }, anulado: false },
        _sum: { monto: true },
      }),
      // "Gastos" para la utilidad bruta = SOLO costos operativos reales
      // (combustible, peajes, viáticos, mantenimiento, etc. de la tabla Gasto).
      // La apertura de caja chica (Caja.saldoApertura / fondeo de cajas, y el
      // futuro movimiento de salida de "cuenta origen") es una reasignación
      // interna de dinero entre cuentas de la propia empresa, NO un gasto
      // operativo: no debe registrarse jamás como Gasto ni sumarse aquí, pues
      // distorsionaría (reduciría artificialmente) la utilidad bruta del período.
      prisma.gasto.aggregate({
        where: { fecha: { gte: desde, lte: hasta } },
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
    const gastos = Number(gastosPeriodo._sum.monto || 0);

    return {
      periodo: { desde, hasta },
      clientes: { total: totalClientes },
      pedidos: {
        totalMes: pedidosPeriodo,
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

  // ── Tabla semanal por conductor ───────────────────────────────────────────
  // Por conductor: cantidad de pedidos y rentabilidad (ingreso por tarifas −
  // gastos de liquidación − combustible) de las liquidaciones cuya fecha cae
  // en el rango (por defecto la semana actual: lunes a hoy/domingo). El rango
  // es configurable desde la UI. La rentabilidad se suma a nivel de
  // liquidación (ingreso liquidación − costos liquidación) para que el total
  // por conductor sea exacto, sin depender de la distribución proporcional
  // que solo aplica al ver un pedido individual (ver pedidos.service.rentabilidad).
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
        pedidos: { select: { pedido: { select: { tarifa: true } } } },
        combustibles: { select: { monto: true } },
      },
    });

    const porConductor = new Map<number, { conductorId: number; nombre: string; cantidadPedidos: number; ingreso: number; costos: number }>();
    for (const liq of liquidaciones) {
      const ingresoLiquidacion = liq.pedidos.reduce((s, lp) => s + Number(lp.pedido.tarifa), 0);
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
        rentabilidad: Math.round((c.ingreso - c.costos) * 100) / 100,
      }))
      .sort((a, b) => b.rentabilidad - a.rentabilidad);

    return { periodo: { desde, hasta }, conductores };
  }
}

export const reportesService = new ReportesService();
