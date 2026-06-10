// FILE: src/modules/contabilidad/contabilidad.diagnostico.ts
// Servicio de diagnóstico: revisa la salud de la contabilidad y devuelve un
// reporte en español simple, organizado en 4 secciones (A-D), con un
// semáforo (VERDE / AMARILLO / ROJO) global y por sección.

import prisma from '../../prisma/client';
import { contabilidadEngine, type CuentaRef } from './contabilidad.engine';
import { DEFAULT_MAPEOS } from './contabilidad.integration';

type Estado = 'VERDE' | 'AMARILLO' | 'ROJO';

const PEOR = (a: Estado, b: Estado): Estado => {
  const orden: Record<Estado, number> = { VERDE: 0, AMARILLO: 1, ROJO: 2 };
  return orden[a] >= orden[b] ? a : b;
};

// Claves de configuración esperadas. "bloqueante" = sin esta cuenta no se
// pueden generar asientos automáticos clave (ROJO si falta);
// si no es bloqueante, su ausencia es solo una ADVERTENCIA (AMARILLO).
const CLAVES_ESPERADAS: { clave: string; label: string; bloqueante: boolean }[] = [
  { clave: 'CAJA_PRINCIPAL',       label: 'Caja y Bancos',           bloqueante: true  },
  { clave: 'ANTICIPO_CONDUCTORES', label: 'Anticipos a Conductores', bloqueante: true  },
  { clave: 'CUENTAS_POR_COBRAR',   label: 'Cuentas por Cobrar',      bloqueante: true  },
  { clave: 'INGRESO_FLETE',        label: 'Ingresos por Flete',      bloqueante: true  },
  { clave: 'GASTO_OTROS',          label: 'Otros Gastos',            bloqueante: true  },
  { clave: 'IGV_POR_PAGAR',        label: 'IGV por Pagar',           bloqueante: false },
  { clave: 'CUENTAS_POR_PAGAR',    label: 'Cuentas por Pagar',       bloqueante: false },
  { clave: 'GASTO_COMBUSTIBLE',    label: 'Combustible',             bloqueante: false },
  { clave: 'GASTO_MANTENIMIENTO',  label: 'Mantenimiento',           bloqueante: false },
  { clave: 'GASTO_PEAJES',         label: 'Peajes y Balanzas',       bloqueante: false },
  { clave: 'GASTO_VIATICOS',       label: 'Viáticos',                bloqueante: false },
];

class ContabilidadDiagnostico {
  async ejecutar() {
    const [seccionA, seccionB, seccionC, seccionD] = await Promise.all([
      this._seccionConfiguracion(),
      this._seccionIntegridad(),
      this._seccionSaldos(),
      this._seccionResumen(),
    ]);

    const estado = PEOR(PEOR(seccionA.estado, seccionB.estado), PEOR(seccionC.estado, seccionD.estado));

    return {
      estado,
      generadoEn: new Date(),
      secciones: {
        configuracion: seccionA,
        integridad: seccionB,
        saldos: seccionC,
        resumen: seccionD,
      },
    };
  }

  // ── Sección A: Configuración Contable ────────────────────────────────────────
  private async _seccionConfiguracion() {
    const configs = await prisma.configuracionContable.findMany();
    const claveACuentaId = new Map(configs.map((c) => [c.clave, c.cuentaId]));
    const cuentaIds = configs.map((c) => c.cuentaId);
    const cuentas = cuentaIds.length
      ? await prisma.cuentaContable.findMany({ where: { id: { in: cuentaIds } } })
      : [];
    const cuentasPorId = new Map(cuentas.map((c) => [c.id, c]));

    const items = CLAVES_ESPERADAS.map(({ clave, label, bloqueante }) => {
      const cuentaId = claveACuentaId.get(clave);
      const cuenta = cuentaId ? cuentasPorId.get(cuentaId) : undefined;
      const configurada = !!cuenta;
      return {
        clave,
        label,
        configurada,
        cuenta: cuenta ? `${cuenta.codigo} — ${cuenta.nombre}` : null,
        bloqueante,
        estado: configurada ? 'VERDE' : (bloqueante ? 'ROJO' : 'AMARILLO') as Estado,
        mensaje: configurada
          ? `"${label}" está asignada a la cuenta ${cuenta!.codigo} — ${cuenta!.nombre}.`
          : bloqueante
            ? `Falta asignar una cuenta para "${label}". Sin esto, los asientos automáticos no se podrán generar.`
            : `"${label}" no está asignada. Los gastos de esta categoría usarán "Otros Gastos" como respaldo.`,
      };
    });

    // Categorías operativas (tipos de gasto, gastos rendidos en liquidaciones,
    // ingresos) que el sistema espera mapear a una cuenta contable, vs. lo
    // que ya está cargado en MapeoContable.
    const mapeos = await prisma.mapeoContable.findMany();
    const mapeados = new Set(mapeos.map((m) => `${m.modulo}:${m.categoriaSlug}`));
    const categoriasSinMapeo = DEFAULT_MAPEOS
      .filter((m) => !mapeados.has(`${m.modulo}:${m.categoriaSlug}`))
      .map((m) => ({
        modulo: m.modulo,
        categoriaSlug: m.categoriaSlug,
        categoriaNombre: m.categoriaNombre,
        mensaje: `${m.modulo === 'INGRESO' ? 'Ingreso' : 'Gasto'} tipo "${m.categoriaSlug}" → sin mapeo (los registros de este tipo no se contabilizarán).`,
      }));

    const estado = PEOR(
      items.reduce((acc, it) => PEOR(acc, it.estado), 'VERDE' as Estado),
      categoriasSinMapeo.length > 0 ? 'AMARILLO' : 'VERDE',
    );
    const faltantes = items.filter((it) => !it.configurada);

    const resumenPartes: string[] = [];
    resumenPartes.push(faltantes.length === 0
      ? 'Todas las cuentas necesarias están configuradas.'
      : `Faltan ${faltantes.length} cuenta(s) por configurar (${faltantes.filter((f) => f.bloqueante).length} crítica(s)).`);
    if (categoriasSinMapeo.length > 0) {
      resumenPartes.push(`${categoriasSinMapeo.length} categoría(s) sin cuenta contable asignada.`);
    }

    return {
      estado,
      titulo: 'Configuración Contable',
      resumen: resumenPartes.join(' '),
      items,
      categoriasSinMapeo,
    };
  }

  // ── Sección B: Integridad de Asientos ────────────────────────────────────────
  private async _seccionIntegridad() {
    const asientos = await prisma.asientoContable.findMany({
      include: { lineas: true },
    });

    const descuadrados = asientos
      .map((a) => ({
        asiento: a,
        validacion: contabilidadEngine.validarAsiento(a.lineas.map((l) => ({ cuentaId: l.cuentaId, debe: Number(l.debe), haber: Number(l.haber) }))),
      }))
      .filter((r) => !r.validacion.valido)
      .map((r) => ({
        id: r.asiento.id,
        numero: r.asiento.numero,
        descripcion: r.asiento.descripcion,
        referencia: r.asiento.referencia,
        mensaje: r.validacion.mensaje,
      }));

    const pendientes = await prisma.asientoPendiente.findMany({
      where: { resuelto: false },
      orderBy: { creadoEn: 'desc' },
    });

    const pendientesFmt = pendientes.map((p) => ({
      id: p.id,
      origenTipo: p.origenTipo,
      origenId: p.origenId,
      motivo: p.motivo,
      cuentasFaltantes: p.cuentasFaltantes,
      creadoEn: p.creadoEn,
    }));

    let estado: Estado = 'VERDE';
    if (descuadrados.length > 0) estado = 'ROJO';
    else if (pendientesFmt.length > 0) estado = 'AMARILLO';

    const partes: string[] = [];
    partes.push(`${asientos.length} asiento(s) contable(s) en total.`);
    if (descuadrados.length > 0) partes.push(`${descuadrados.length} asiento(s) NO cuadran (DEBE ≠ HABER) — revisar urgente.`);
    if (pendientesFmt.length > 0) partes.push(`${pendientesFmt.length} operación(es) sin asiento por configuración incompleta.`);
    if (descuadrados.length === 0 && pendientesFmt.length === 0) partes.push('Todos los asientos cuadran y no hay operaciones pendientes.');

    return {
      estado,
      titulo: 'Integridad de Asientos',
      resumen: partes.join(' '),
      totalAsientos: asientos.length,
      descuadrados,
      pendientes: pendientesFmt,
    };
  }

  // ── Sección C: Verificación de Saldos ────────────────────────────────────────
  private async _seccionSaldos() {
    const cuentas = await prisma.cuentaContable.findMany({
      where: { activa: true },
      orderBy: { codigo: 'asc' },
      include: { lineas: true },
    });

    const items = cuentas
      .filter((c) => c.lineas.length > 0)
      .map((c) => {
        const cuentaRef: CuentaRef = {
          id: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          tipo: c.tipo as any,
          naturaleza: c.naturaleza as any,
        };
        const saldo = contabilidadEngine.calcularSaldo(
          c.lineas.map((l) => ({ debe: Number(l.debe), haber: Number(l.haber) })),
          cuentaRef.naturaleza,
        );
        const diag = contabilidadEngine.diagnosticarSaldo(cuentaRef, saldo);
        return {
          cuentaId: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          tipo: c.tipo,
          saldo,
          esNormal: diag.esNormal,
          mensaje: diag.mensaje,
        };
      });

    const anormales = items.filter((it) => !it.esNormal);
    const estado: Estado = anormales.length > 0 ? 'AMARILLO' : 'VERDE';

    return {
      estado,
      titulo: 'Verificación de Saldos',
      resumen: anormales.length === 0
        ? 'Todas las cuentas con movimientos tienen saldos normales.'
        : `${anormales.length} cuenta(s) con saldo anormal — revisar registros relacionados.`,
      cuentas: items,
    };
  }

  // ── Sección D: Resumen del Período (mes actual) ──────────────────────────────
  private async _seccionResumen() {
    const ahora = new Date();
    const inicioMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    const finMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0, 23, 59, 59);

    const cuentas = await prisma.cuentaContable.findMany({
      where: { activa: true, tipo: { in: ['INGRESO', 'GASTO', 'COSTO'] } },
      include: { lineas: { where: { asiento: { fecha: { gte: inicioMes, lte: finMes } } } } },
    });

    let totalIngresos = 0;
    let totalGastos = 0;
    for (const c of cuentas) {
      const saldo = contabilidadEngine.calcularSaldo(
        c.lineas.map((l) => ({ debe: Number(l.debe), haber: Number(l.haber) })),
        c.naturaleza as any,
      );
      if (c.tipo === 'INGRESO') totalIngresos += saldo;
      else totalGastos += saldo;
    }
    const resultado = totalIngresos - totalGastos;

    // Balance de comprobación general (todo el histórico)
    const todasLasLineas = await prisma.lineaAsiento.findMany();
    const totalDebe = todasLasLineas.reduce((s, l) => s + Number(l.debe), 0);
    const totalHaber = todasLasLineas.reduce((s, l) => s + Number(l.haber), 0);
    const balanceCuadrado = Math.abs(totalDebe - totalHaber) < 0.005;

    const liquidacionesPendientes = await prisma.asientoPendiente.count({
      where: { resuelto: false, origenTipo: { startsWith: 'LIQUIDACION' } },
    });

    let estado: Estado = 'VERDE';
    if (!balanceCuadrado) estado = 'ROJO';
    else if (liquidacionesPendientes > 0) estado = 'AMARILLO';

    return {
      estado,
      titulo: 'Resumen del Período',
      periodo: { desde: inicioMes, hasta: finMes },
      totalIngresos: Math.round(totalIngresos * 100) / 100,
      totalGastos: Math.round(totalGastos * 100) / 100,
      resultado: Math.round(resultado * 100) / 100,
      balanceCuadrado,
      totalDebe: Math.round(totalDebe * 100) / 100,
      totalHaber: Math.round(totalHaber * 100) / 100,
      liquidacionesPendientes,
      resumen: balanceCuadrado
        ? `El libro mayor cuadra (DEBE = HABER = S/ ${totalDebe.toFixed(2)}). Resultado del mes: S/ ${resultado.toFixed(2)}.`
        : `El libro mayor NO cuadra: DEBE S/ ${totalDebe.toFixed(2)} vs HABER S/ ${totalHaber.toFixed(2)}.`,
    };
  }
}

export const contabilidadDiagnostico = new ContabilidadDiagnostico();
