// FILE: src/modules/movimientos/movimientos.service.ts
// Módulo Movimientos: identifica pagos y gastos. No reimplementa el ledger
// financiero — reutiliza MovimientoCuentaV2 y CuentasService (que ya lo maneja
// para combustible/liquidaciones/caja) y le agrega:
//  1) importación masiva desde Excel bancario
//  2) categoría de ingreso (PAGO_FACTURA crea un PagoV2 "sin aplicar" que se
//     reparte entre facturas del cliente desde el módulo Cobranza; las demás
//     categorías solo llevan una observación libre)

import prisma from '../../prisma/client';
import { cuentasService } from '../configuracion/cuentas.service';
import { paginar, PaginacionQuery } from '../../utils/pagination';

export interface FilaImportacion {
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: 'INGRESO' | 'EGRESO';
  referencia?: string;
}

export interface FilaConflicto {
  fila: number;
  motivo: string;
  existente?: { fecha: string; monto: number; concepto: string };
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
        aplicaciones: { include: { factura: { select: { id: true, numeroFactura: true } } } },
      },
    });
    const mantenimiento = await prisma.mantenimientoDetalle.findUnique({
      where: { movimientoCuentaId: id },
      include: {
        vehiculo: { select: { id: true, placa: true } },
        conductor: { select: { id: true, nombre: true } },
      },
    });
    return { ...mov, cobranza, mantenimiento };
  }

  async crear(dto: {
    cuentaId: number; tipo: 'INGRESO' | 'EGRESO'; monto: number; monedaId: number;
    tipoPagoId?: number; concepto: string; referencia?: string; fecha?: string;
    notaEgreso?: string; categoriaEgreso?: string;
    categoriaIngreso?: string; notaIngreso?: string; clienteId?: number;
  }, usuarioId: number) {
    if (dto.tipo === 'INGRESO' && dto.categoriaIngreso === 'PAGO_FACTURA') {
      if (!dto.clienteId) throw new Error('Debe seleccionar un cliente para un ingreso de categoría "Pago de factura"');
      const cliente = await prisma.cliente.findUnique({ where: { id: dto.clienteId } });
      if (!cliente) throw new Error('Cliente no encontrado');

      return prisma.$transaction(async (tx: any) => {
        const mov = await cuentasService._registrarMovimientoEnTx(tx, {
          cuentaId: dto.cuentaId, tipo: dto.tipo, monto: dto.monto, monedaId: dto.monedaId,
          tipoPagoId: dto.tipoPagoId, concepto: dto.concepto, referencia: dto.referencia,
          usuarioId, fecha: dto.fecha, origen: 'MANUAL', categoriaIngreso: dto.categoriaIngreso,
        });
        await tx.pagoV2.create({
          data: {
            clienteId: dto.clienteId,
            usuarioId,
            monto: mov.monto,
            monedaId: mov.monedaId,
            tipoPagoId: mov.tipoPagoId,
            referencia: mov.referencia,
            movimientoCuentaId: mov.id,
            fechaPago: mov.fecha,
            creadoPorId: usuarioId,
          },
        });
        return mov;
      });
    }

    if (dto.tipo === 'INGRESO' && dto.categoriaIngreso && dto.categoriaIngreso !== 'PAGO_FACTURA' && !dto.notaIngreso?.trim()) {
      throw new Error('Debe indicar una observación para esta categoría de ingreso');
    }

    return cuentasService.registrarMovimiento({ ...dto, usuarioId, origen: 'MANUAL' });
  }

  async actualizar(id: number, dto: {
    concepto?: string; referencia?: string; fecha?: string; tipoPagoId?: number | null;
    notaEgreso?: string | null; categoriaEgreso?: string | null;
    notaIngreso?: string | null; categoriaIngreso?: string | null; clienteId?: number | null;
  }, usuarioId?: number) {
    const mov = await prisma.movimientoCuentaV2.findUnique({ where: { id } });
    if (!mov) throw new Error('Movimiento no encontrado');

    if ((dto.categoriaIngreso !== undefined || dto.clienteId !== undefined) && mov.tipo !== 'INGRESO') {
      throw new Error('La categoría de ingreso y el cliente solo aplican a ingresos');
    }

    // Cambios de categoría de ingreso / cliente: gestionan el PagoV2 (cobranza)
    // vinculado a este movimiento antes de tocar el movimiento en sí.
    if (dto.categoriaIngreso !== undefined || dto.clienteId !== undefined) {
      await prisma.$transaction(async (tx: any) => {
        const pagoExistente = await tx.pagoV2.findFirst({ where: { movimientoCuentaId: id, anulado: false } });
        const cantidadAplicaciones = pagoExistente
          ? await tx.pagoV2AplicacionFactura.count({ where: { pagoId: pagoExistente.id } })
          : 0;

        const categoriaFinal = dto.categoriaIngreso !== undefined ? dto.categoriaIngreso : mov.categoriaIngreso;

        if (cantidadAplicaciones > 0 && dto.categoriaIngreso !== undefined && dto.categoriaIngreso !== mov.categoriaIngreso) {
          throw new Error('No se puede cambiar la categoría: este pago ya tiene facturas aplicadas desde Cobranza');
        }

        if (categoriaFinal === 'PAGO_FACTURA') {
          const clienteId = dto.clienteId !== undefined ? dto.clienteId : pagoExistente?.clienteId;
          if (!clienteId) throw new Error('Debe seleccionar un cliente para la categoría "Pago de factura"');
          if (cantidadAplicaciones > 0 && dto.clienteId !== undefined && dto.clienteId !== pagoExistente?.clienteId) {
            throw new Error('No se puede cambiar el cliente: este pago ya tiene facturas aplicadas desde Cobranza');
          }
          const cliente = await tx.cliente.findUnique({ where: { id: clienteId } });
          if (!cliente) throw new Error('Cliente no encontrado');

          if (pagoExistente) {
            await tx.pagoV2.update({ where: { id: pagoExistente.id }, data: { clienteId, actualizadoPorId: usuarioId } });
          } else {
            await tx.pagoV2.create({
              data: {
                clienteId, usuarioId: mov.usuarioId, monto: mov.monto, monedaId: mov.monedaId,
                tipoPagoId: mov.tipoPagoId, referencia: mov.referencia, movimientoCuentaId: id,
                fechaPago: mov.fecha, creadoPorId: usuarioId,
              },
            });
          }
        } else if (pagoExistente) {
          // Se quitó "Pago de factura" o cambió a otra categoría: el pago sin aplicar queda anulado.
          await tx.pagoV2.update({
            where: { id: pagoExistente.id },
            data: { anulado: true, anuladoEn: new Date(), motivoAnulacion: 'Categoría de ingreso cambiada', actualizadoPorId: usuarioId },
          });
        }
      });
    }

    return cuentasService.actualizarMovimiento(id, {
      concepto: dto.concepto,
      referencia: dto.referencia,
      fecha: dto.fecha,
      tipoPagoId: dto.tipoPagoId,
      notaEgreso: dto.notaEgreso,
      categoriaEgreso: dto.categoriaEgreso,
      notaIngreso: dto.notaIngreso,
      categoriaIngreso: dto.categoriaIngreso,
    }, usuarioId);
  }

  async anular(id: number, usuarioId: number) {
    return cuentasService.anularMovimiento(id, usuarioId);
  }

  // Agrupado por moneda: sumar ingresos/egresos de cuentas en soles y dólares
  // en un solo total no tiene sentido (mezclaría dos monedas distintas). Si se
  // filtra por una cuenta específica, el resultado trae una sola moneda de
  // todas formas.
  async resumen(query: { desde?: string; hasta?: string; cuentaId?: string }) {
    const where: any = {};
    if (query.cuentaId) where.cuentaId = parseInt(query.cuentaId);
    if (query.desde || query.hasta) {
      where.fecha = {};
      if (query.desde) where.fecha.gte = new Date(query.desde);
      if (query.hasta) where.fecha.lte = new Date(query.hasta + 'T23:59:59');
    }

    const [ingresos, egresos, monedas] = await Promise.all([
      prisma.movimientoCuentaV2.groupBy({ by: ['monedaId'], where: { ...where, tipo: 'INGRESO', anulado: false }, _sum: { monto: true }, _count: true }),
      prisma.movimientoCuentaV2.groupBy({ by: ['monedaId'], where: { ...where, tipo: 'EGRESO', anulado: false }, _sum: { monto: true }, _count: true }),
      prisma.moneda.findMany({ select: { id: true, codigo: true, simbolo: true } }),
    ]);

    const nombreMoneda = new Map(monedas.map((m) => [m.id, m]));
    const porMoneda = new Map<number, {
      monedaId: number; codigo: string; simbolo: string;
      totalIngresos: number; cantidadIngresos: number; totalEgresos: number; cantidadEgresos: number;
    }>();
    const entry = (monedaId: number) => {
      let e = porMoneda.get(monedaId);
      if (!e) {
        const m = nombreMoneda.get(monedaId);
        e = { monedaId, codigo: m?.codigo ?? '?', simbolo: m?.simbolo ?? '', totalIngresos: 0, cantidadIngresos: 0, totalEgresos: 0, cantidadEgresos: 0 };
        porMoneda.set(monedaId, e);
      }
      return e;
    };
    for (const i of ingresos) { const e = entry(i.monedaId); e.totalIngresos = Number(i._sum.monto || 0); e.cantidadIngresos = i._count; }
    for (const g of egresos) { const e = entry(g.monedaId); e.totalEgresos = Number(g._sum.monto || 0); e.cantidadEgresos = g._count; }

    return {
      porMoneda: Array.from(porMoneda.values())
        .map((e) => ({ ...e, saldoNeto: Math.round((e.totalIngresos - e.totalEgresos) * 100) / 100 }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    };
  }

  // ── IMPORTACIÓN DESDE EXCEL ──────────────────────────────────────────────────
  // Se valida todo en memoria (incluida la proyección de saldo) y se inserta el
  // lote completo en UNA sola transacción — antes se hacía una transacción por
  // fila (varias idas y vueltas a la BD cada una), lo que con lotes de ~20-30
  // filas superaba el timeout del cliente. Los movimientos que vienen del banco
  // ya ocurrieron en la realidad: si el saldo local todavía no está sincronizado
  // (primer import, saldo inicial no configurado, etc.) igual se importan.
  //
  // Detección de N° de operación duplicado (referencia): dentro de la misma
  // cuenta, un mismo N° de operación no puede repetirse en la MISMA fecha (se
  // bloquea, típico de subir el mismo extracto dos veces por error). Si el
  // mismo N° aparece en otra fecha, es válido (los bancos reciclan números),
  // pero se avisa y requiere `confirmarDuplicados: true` para importarlo.
  async importarLote(
    dto: { cuentaId: number; monedaId: number; filas: FilaImportacion[]; confirmarDuplicados?: boolean },
    usuarioId: number,
  ) {
    const cuenta = await prisma.cuentaDinero.findUnique({ where: { id: dto.cuentaId } });
    if (!cuenta) throw new Error('Cuenta no encontrada');
    if (!cuenta.activo) throw new Error('La cuenta está inactiva');

    const existentes = await prisma.movimientoCuentaV2.findMany({
      where: { cuentaId: dto.cuentaId, referencia: { not: null }, anulado: false },
      select: { fecha: true, referencia: true, monto: true, concepto: true },
    });
    const porReferencia = new Map<string, typeof existentes>();
    for (const e of existentes) {
      const lista = porReferencia.get(e.referencia as string) ?? [];
      lista.push(e);
      porReferencia.set(e.referencia as string, lista);
    }

    const mismoDia = (a: Date, bIso: string) => a.toISOString().split('T')[0] === bIso;

    const validas: FilaImportacion[] = [];
    const errores: { fila: number; motivo: string }[] = [];
    const bloqueados: FilaConflicto[] = [];
    const advertencias: FilaConflicto[] = [];
    const vistosEnLote = new Set<string>();

    dto.filas.forEach((fila, i) => {
      const numeroFila = i + 1;
      if (!fila.fecha || !fila.descripcion || !fila.monto || !fila.tipo) {
        errores.push({ fila: numeroFila, motivo: 'Fila incompleta: fecha, descripción, monto y tipo son requeridos' });
        return;
      }
      if (!['INGRESO', 'EGRESO'].includes(fila.tipo)) {
        errores.push({ fila: numeroFila, motivo: 'tipo debe ser INGRESO o EGRESO' });
        return;
      }
      if (fila.monto <= 0) {
        errores.push({ fila: numeroFila, motivo: 'monto debe ser mayor a 0' });
        return;
      }

      // Algunos bancos usan un N° de operación "placeholder" (ej. "00000000") para
      // comisiones/impuestos generados por lote — no es un identificador único real,
      // así que no se valida como duplicado (o bloquearía filas legítimas del mismo día).
      const referencia = fila.referencia;
      if (referencia && !/^0+$/.test(referencia)) {
        const claveLote = `${fila.fecha}|${referencia}`;
        if (vistosEnLote.has(claveLote)) {
          bloqueados.push({ fila: numeroFila, motivo: `N° de operación "${referencia}" repetido el mismo día dentro del propio archivo` });
          return;
        }

        const coincidencias = porReferencia.get(referencia) ?? [];
        const coincidenciaMismoDia = coincidencias.find((e) => mismoDia(e.fecha, fila.fecha));
        if (coincidenciaMismoDia) {
          bloqueados.push({
            fila: numeroFila,
            motivo: `N° de operación "${fila.referencia}" ya existe el mismo día (posible carga duplicada)`,
            existente: { fecha: fila.fecha, monto: Number(coincidenciaMismoDia.monto), concepto: coincidenciaMismoDia.concepto },
          });
          return;
        }

        const coincidenciaOtroDia = coincidencias[0];
        if (coincidenciaOtroDia && !dto.confirmarDuplicados) {
          advertencias.push({
            fila: numeroFila,
            motivo: `N° de operación "${fila.referencia}" ya existe pero en otra fecha (${coincidenciaOtroDia.fecha.toISOString().split('T')[0]})`,
            existente: {
              fecha: coincidenciaOtroDia.fecha.toISOString().split('T')[0],
              monto: Number(coincidenciaOtroDia.monto),
              concepto: coincidenciaOtroDia.concepto,
            },
          });
          return;
        }

        vistosEnLote.add(claveLote);
      }

      validas.push(fila);
    });

    if (validas.length === 0) return { creados: 0, errores, bloqueados, advertencias };

    const deltaTotal = validas.reduce((s, f) => s + (f.tipo === 'INGRESO' ? f.monto : -f.monto), 0);

    await prisma.$transaction(async (tx: any) => {
      await tx.movimientoCuentaV2.createMany({
        data: validas.map((f) => ({
          cuentaId: dto.cuentaId,
          tipo: f.tipo,
          monto: f.monto,
          monedaId: dto.monedaId,
          concepto: f.descripcion,
          referencia: f.referencia || null,
          usuarioId,
          origen: 'EXCEL',
          fecha: new Date(f.fecha),
        })),
      });
      await tx.cuentaDinero.update({
        where: { id: dto.cuentaId },
        data: { saldoActual: { increment: deltaTotal } },
      });
    });

    return { creados: validas.length, errores, bloqueados, advertencias };
  }

}

export const movimientosService = new MovimientosService();
