// FILE: src/modules/contabilidad/contabilidad.engine.ts
// Motor contable puro (sin acceso a base de datos).
// Encapsula las reglas de partida doble: qué cuenta va al DEBE y cuál al HABER
// para cada tipo de operación, valida que cada asiento cuadre, y calcula/diagnostica
// saldos de cuentas según su naturaleza.

export type TipoCuenta = 'ACTIVO' | 'PASIVO' | 'PATRIMONIO' | 'INGRESO' | 'GASTO' | 'COSTO';
export type NaturalezaCuenta = 'DEUDORA' | 'ACREEDORA';

export interface CuentaRef {
  id: string;
  codigo: string;
  nombre: string;
  tipo: TipoCuenta;
  naturaleza: NaturalezaCuenta;
}

export interface LineaAsientoInput {
  cuentaId: string;
  cuentaCodigo?: string;
  descripcion?: string;
  debe: number;
  haber: number;
}

export interface AsientoInput {
  fecha: Date;
  descripcion: string;
  referencia?: string;
  origenTipo?: string;
  origenId?: string;
  lineas: LineaAsientoInput[];
}

export interface ValidacionAsiento {
  valido: boolean;
  totalDebe: number;
  totalHaber: number;
  diferencia: number;
  mensaje: string;
}

// Cuentas necesarias para que el motor pueda generar asientos automáticos.
// Si alguna falta, el método correspondiente lanza CuentaFaltanteError con
// el detalle de qué claves de configuración hacen falta.
export interface ConfigContable {
  caja?: CuentaRef;
  cuentasPorCobrar?: CuentaRef;
  anticipoConductores?: CuentaRef;
  cuentasPorPagar?: CuentaRef;
  igvPorPagar?: CuentaRef;
  ingresoFletes?: CuentaRef;
  // Cuentas de gasto, indexadas por "categoría" (PEAJE, BALANZA, VIATICO,
  // TOLDO, OTROS, COMBUSTIBLE, MANTENIMIENTO, etc.)
  gastosPorCategoria: Record<string, CuentaRef | undefined>;
  gastoOtros?: CuentaRef;
}

export interface LiquidacionPagoInput {
  id: number;
  conductorNombre: string;
  montoPagado: number;
  fecha: Date;
}

export interface GastoRendidoInput {
  categoria: string;
  descripcion: string;
  monto: number;
}

export interface LiquidacionRendicionInput {
  id: number;
  conductorNombre: string;
  fecha: Date;
  gastos: GastoRendidoInput[];
}

export interface LiquidacionAjusteInput {
  id: number;
  conductorNombre: string;
  fecha: Date;
  monto: number; // devolución o reintegro, siempre > 0
}

export interface IngresoFacturaInput {
  id: number;
  numeroFactura: string;
  total: number;
  subtotal: number;
  igv: number;
  fecha: Date;
}

const EPS = 0.005;

export class CuentaFaltanteError extends Error {
  claves: string[];

  constructor(claves: string[], mensaje: string) {
    super(mensaje);
    this.name = 'CuentaFaltanteError';
    this.claves = claves;
  }
}

class ContabilidadEngine {
  // ── Validación de partida doble ──────────────────────────────────────────────
  validarAsiento(lineas: LineaAsientoInput[]): ValidacionAsiento {
    const totalDebe = lineas.reduce((s, l) => s + l.debe, 0);
    const totalHaber = lineas.reduce((s, l) => s + l.haber, 0);
    const diferencia = Math.round((totalDebe - totalHaber) * 100) / 100;
    const valido = Math.abs(diferencia) < EPS;
    return {
      valido,
      totalDebe: Math.round(totalDebe * 100) / 100,
      totalHaber: Math.round(totalHaber * 100) / 100,
      diferencia,
      mensaje: valido
        ? 'El asiento cuadra: el total del DEBE es igual al total del HABER.'
        : `El asiento NO cuadra: DEBE ${totalDebe.toFixed(2)} vs HABER ${totalHaber.toFixed(2)} (diferencia ${diferencia.toFixed(2)}).`,
    };
  }

  // ── Asiento 1: Pago de anticipo al conductor ─────────────────────────────────
  // DEBE  Anticipos a Conductores (Activo, aumenta)
  // HABER Caja (Activo, disminuye)
  generarAsientoPago(data: LiquidacionPagoInput, config: ConfigContable): AsientoInput {
    const faltantes: string[] = [];
    if (!config.anticipoConductores) faltantes.push('ANTICIPO_CONDUCTORES');
    if (!config.caja) faltantes.push('CAJA_PRINCIPAL');
    if (faltantes.length > 0) {
      throw new CuentaFaltanteError(
        faltantes,
        `No se puede registrar el pago de anticipo de la liquidación #${data.id}: falta configurar ${faltantes.join(', ')}.`,
      );
    }

    return {
      fecha: data.fecha,
      descripcion: `Anticipo entregado a ${data.conductorNombre} — Liquidación #${data.id}`,
      referencia: `LIQ-${data.id}-PAGO`,
      origenTipo: 'LIQUIDACION_PAGO',
      origenId: String(data.id),
      lineas: [
        { cuentaId: config.anticipoConductores!.id, cuentaCodigo: config.anticipoConductores!.codigo, descripcion: 'Anticipo entregado', debe: data.montoPagado, haber: 0 },
        { cuentaId: config.caja!.id, cuentaCodigo: config.caja!.codigo, descripcion: 'Salida de caja', debe: 0, haber: data.montoPagado },
      ],
    };
  }

  // ── Asiento 2: Rendición de gastos ───────────────────────────────────────────
  // DEBE  Gastos (por categoría)         (Gasto, aumenta)
  // HABER Anticipos a Conductores        (Activo, disminuye)
  generarAsientoRendicion(data: LiquidacionRendicionInput, config: ConfigContable): AsientoInput {
    const faltantes: string[] = [];
    if (!config.anticipoConductores) faltantes.push('ANTICIPO_CONDUCTORES');
    if (!config.gastoOtros) faltantes.push('GASTO_OTROS');

    // Agrupar gastos por cuenta destino (categoría → cuenta configurada, o GASTO_OTROS)
    const totalesPorCuenta = new Map<string, { cuenta: CuentaRef; total: number }>();
    for (const gasto of data.gastos) {
      const cuenta = config.gastosPorCategoria[`LIQUIDACION_GASTO:${gasto.categoria}`] ?? config.gastoOtros;
      if (!cuenta) continue; // ya se reportó como faltante arriba
      const actual = totalesPorCuenta.get(cuenta.id);
      if (actual) {
        actual.total += gasto.monto;
      } else {
        totalesPorCuenta.set(cuenta.id, { cuenta, total: gasto.monto });
      }
    }

    if (faltantes.length > 0) {
      throw new CuentaFaltanteError(
        faltantes,
        `No se puede registrar la rendición de gastos de la liquidación #${data.id}: falta configurar ${faltantes.join(', ')}.`,
      );
    }

    const totalGastos = data.gastos.reduce((s, g) => s + g.monto, 0);

    const lineas: LineaAsientoInput[] = [];
    for (const { cuenta, total } of totalesPorCuenta.values()) {
      lineas.push({ cuentaId: cuenta.id, cuentaCodigo: cuenta.codigo, descripcion: 'Gastos rendidos', debe: total, haber: 0 });
    }
    lineas.push({
      cuentaId: config.anticipoConductores!.id,
      cuentaCodigo: config.anticipoConductores!.codigo,
      descripcion: 'Aplicación de anticipo',
      debe: 0,
      haber: totalGastos,
    });

    return {
      fecha: data.fecha,
      descripcion: `Rendición de gastos — ${data.conductorNombre} — Liquidación #${data.id}`,
      referencia: `LIQ-${data.id}-RENDICION`,
      origenTipo: 'LIQUIDACION_RENDICION',
      origenId: String(data.id),
      lineas,
    };
  }

  // ── Asiento 3: Devolución del conductor (sobró anticipo) ─────────────────────
  // DEBE  Caja (Activo, aumenta — el conductor devuelve dinero)
  // HABER Anticipos a Conductores (Activo, disminuye — se cierra el anticipo)
  generarAsientoDevolucion(data: LiquidacionAjusteInput, config: ConfigContable): AsientoInput {
    const faltantes: string[] = [];
    if (!config.caja) faltantes.push('CAJA_PRINCIPAL');
    if (!config.anticipoConductores) faltantes.push('ANTICIPO_CONDUCTORES');
    if (faltantes.length > 0) {
      throw new CuentaFaltanteError(
        faltantes,
        `No se puede registrar la devolución de la liquidación #${data.id}: falta configurar ${faltantes.join(', ')}.`,
      );
    }

    return {
      fecha: data.fecha,
      descripcion: `Devolución de anticipo — ${data.conductorNombre} — Liquidación #${data.id}`,
      referencia: `LIQ-${data.id}-DEVOLUCION`,
      origenTipo: 'LIQUIDACION_DEVOLUCION',
      origenId: String(data.id),
      lineas: [
        { cuentaId: config.caja!.id, cuentaCodigo: config.caja!.codigo, descripcion: 'Devolución del conductor', debe: data.monto, haber: 0 },
        { cuentaId: config.anticipoConductores!.id, cuentaCodigo: config.anticipoConductores!.codigo, descripcion: 'Cierre de anticipo', debe: 0, haber: data.monto },
      ],
    };
  }

  // ── Asiento 4: Reintegro al conductor (gastó más del anticipo) ───────────────
  // En este sistema el reintegro se paga de inmediato desde caja (EGRESO), por
  // lo que la cuenta de Anticipos —que tras la rendición quedó con saldo
  // acreedor (anormal para un Activo)— se cierra contra esa salida de caja:
  // DEBE  Anticipos a Conductores (Activo, se cierra a 0)
  // HABER Caja (Activo, disminuye — pago adicional al conductor)
  generarAsientoReintegro(data: LiquidacionAjusteInput, config: ConfigContable): AsientoInput {
    const faltantes: string[] = [];
    if (!config.anticipoConductores) faltantes.push('ANTICIPO_CONDUCTORES');
    if (!config.caja) faltantes.push('CAJA_PRINCIPAL');
    if (faltantes.length > 0) {
      throw new CuentaFaltanteError(
        faltantes,
        `No se puede registrar el reintegro de la liquidación #${data.id}: falta configurar ${faltantes.join(', ')}.`,
      );
    }

    return {
      fecha: data.fecha,
      descripcion: `Reintegro adicional al conductor — ${data.conductorNombre} — Liquidación #${data.id}`,
      referencia: `LIQ-${data.id}-REINTEGRO`,
      origenTipo: 'LIQUIDACION_REINTEGRO',
      origenId: String(data.id),
      lineas: [
        { cuentaId: config.anticipoConductores!.id, cuentaCodigo: config.anticipoConductores!.codigo, descripcion: 'Cierre de anticipo', debe: data.monto, haber: 0 },
        { cuentaId: config.caja!.id, cuentaCodigo: config.caja!.codigo, descripcion: 'Pago adicional al conductor', debe: 0, haber: data.monto },
      ],
    };
  }

  // ── Asiento 5: Ingreso por servicio (factura emitida) ────────────────────────
  // DEBE  Cuentas por Cobrar (Activo, aumenta)
  // HABER Ingresos por Fletes (Ingreso, aumenta)
  // HABER IGV por Pagar (Pasivo, aumenta) [si corresponde]
  generarAsientoIngreso(data: IngresoFacturaInput, config: ConfigContable): AsientoInput {
    const faltantes: string[] = [];
    if (!config.cuentasPorCobrar) faltantes.push('CUENTAS_POR_COBRAR');
    if (!config.ingresoFletes) faltantes.push('INGRESO_FLETE');
    if (data.igv > EPS && !config.igvPorPagar) faltantes.push('IGV_POR_PAGAR');
    if (faltantes.length > 0) {
      throw new CuentaFaltanteError(
        faltantes,
        `No se puede registrar el ingreso de la factura ${data.numeroFactura}: falta configurar ${faltantes.join(', ')}.`,
      );
    }

    const lineas: LineaAsientoInput[] = [
      { cuentaId: config.cuentasPorCobrar!.id, cuentaCodigo: config.cuentasPorCobrar!.codigo, descripcion: `Factura ${data.numeroFactura}`, debe: data.total, haber: 0 },
    ];

    if (data.igv > EPS) {
      lineas.push({ cuentaId: config.ingresoFletes!.id, cuentaCodigo: config.ingresoFletes!.codigo, descripcion: `Ingreso neto ${data.numeroFactura}`, debe: 0, haber: data.subtotal });
      lineas.push({ cuentaId: config.igvPorPagar!.id, cuentaCodigo: config.igvPorPagar!.codigo, descripcion: `IGV ${data.numeroFactura}`, debe: 0, haber: data.igv });
    } else {
      lineas.push({ cuentaId: config.ingresoFletes!.id, cuentaCodigo: config.ingresoFletes!.codigo, descripcion: `Ingreso ${data.numeroFactura}`, debe: 0, haber: data.total });
    }

    return {
      fecha: data.fecha,
      descripcion: `Factura emitida ${data.numeroFactura}`,
      referencia: `FACTURA-${data.id}`,
      origenTipo: 'FACTURA',
      origenId: String(data.id),
      lineas,
    };
  }

  // ── Cálculo de saldo según naturaleza de la cuenta ───────────────────────────
  // DEUDORA  → saldo = total DEBE - total HABER (Activos, Gastos, Costos)
  // ACREEDORA→ saldo = total HABER - total DEBE (Pasivos, Patrimonio, Ingresos)
  calcularSaldo(movimientos: { debe: number; haber: number }[], naturaleza: NaturalezaCuenta): number {
    const totalDebe = movimientos.reduce((s, m) => s + m.debe, 0);
    const totalHaber = movimientos.reduce((s, m) => s + m.haber, 0);
    const saldo = naturaleza === 'DEUDORA' ? totalDebe - totalHaber : totalHaber - totalDebe;
    return Math.round(saldo * 100) / 100;
  }

  // ── Diagnóstico de saldo ──────────────────────────────────────────────────────
  // Un saldo "normal" para una cuenta es >= 0 una vez aplicada su naturaleza
  // (calcularSaldo ya invierte el signo para cuentas ACREEDORA). Un saldo
  // negativo indica que la cuenta tiene un saldo "contrario" a su naturaleza,
  // lo cual suele significar un error de registro o un asiento faltante.
  diagnosticarSaldo(cuenta: CuentaRef, saldo: number): { esNormal: boolean; mensaje: string } {
    if (saldo >= -EPS) {
      return { esNormal: true, mensaje: `Saldo normal para una cuenta de ${this._descripcionNaturaleza(cuenta)}.` };
    }

    const formato = saldo.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return {
      esNormal: false,
      mensaje: `Saldo negativo (S/ ${formato}) — anormal para una cuenta de ${this._descripcionNaturaleza(cuenta)}. Puede indicar un asiento faltante o un error de registro.`,
    };
  }

  private _descripcionNaturaleza(cuenta: CuentaRef): string {
    switch (cuenta.tipo) {
      case 'ACTIVO': return 'Activo (saldo deudor esperado)';
      case 'GASTO':
      case 'COSTO': return 'Gasto (saldo deudor esperado)';
      case 'PASIVO': return 'Pasivo (saldo acreedor esperado)';
      case 'PATRIMONIO': return 'Patrimonio (saldo acreedor esperado)';
      case 'INGRESO': return 'Ingreso (saldo acreedor esperado)';
      default: return cuenta.naturaleza === 'DEUDORA' ? 'naturaleza deudora' : 'naturaleza acreedora';
    }
  }
}

export const contabilidadEngine = new ContabilidadEngine();
