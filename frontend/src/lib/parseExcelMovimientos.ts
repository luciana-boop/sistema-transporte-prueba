// FILE: src/lib/parseExcelMovimientos.ts
// Módulo Movimientos: parseo del Excel de movimientos bancarios a importar.
//
// Formato soportado: el extracto/estado de cuenta bancario real del usuario
// (ej. exportado desde banca por internet), que trae:
//   - Filas de metadata antes de la tabla (Cuenta, Moneda, Tipo de Cuenta, etc.)
//     — se detectan y se saltan automáticamente buscando la fila de encabezados.
//   - Encabezados: Fecha | Fecha valuta | Descripción operación | Monto | Saldo |
//     Sucursal - agencia | Operación - Número | Operación - Hora | Usuario | UTC | Referencia2
//   - Fecha en texto dd/mm/aaaa.
//   - Monto en una sola columna con signo (negativo = egreso, positivo = ingreso).
//     No hay columna "Tipo": el tipo se infiere del signo del monto.
//   - Operación - Número se usa como referencia.
//
// También sigue aceptando una plantilla simple manual (Fecha, Descripción,
// Monto, Tipo) por si se arma una hoja a mano sin columna de signo.
//
// Toda la lógica de mapeo de columnas vive en esta única función: si el banco
// cambia el formato de export, solo hay que ajustar aquí.

import * as XLSX from 'xlsx';

export interface FilaMovimientoImportado {
  fila: number;
  fecha: string;
  descripcion: string;
  monto: number;
  tipo: 'INGRESO' | 'EGRESO';
  referencia?: string;
  error?: string;
}

const ALIAS_FECHA = ['fecha'];
const ALIAS_DESCRIPCION = ['descripcion operacion', 'descripcion', 'concepto', 'detalle'];
const ALIAS_MONTO = ['monto', 'importe'];
const ALIAS_TIPO = ['tipo'];
const ALIAS_REFERENCIA = ['operacion numero', 'numero operacion', 'referencia2', 'referencia', 'operacion'];

function normalizarClave(valor: string): string {
  const descompuesta = valor.normalize('NFD');
  let sinTildes = '';
  for (const ch of descompuesta) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // marca diacrítica combinante
    sinTildes += ch;
  }
  return sinTildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function esFilaVacia(fila: unknown[]): boolean {
  return fila.every((c) => c === undefined || c === null || String(c).trim() === '');
}

/** Busca la fila de encabezados (contiene una celda que normaliza a "fecha") entre las primeras filas. */
function detectarEncabezado(filas: unknown[][]): { indice: number; columnas: Map<string, number> } {
  const limite = Math.min(filas.length, 30);
  for (let i = 0; i < limite; i++) {
    const fila = filas[i];
    const columnas = new Map<string, number>();
    fila.forEach((celda, col) => {
      if (typeof celda === 'string' && celda.trim() !== '') {
        columnas.set(normalizarClave(celda), col);
      }
    });
    if (columnas.has('fecha')) return { indice: i, columnas };
  }
  // Fallback: asumir que la primera fila es el encabezado
  const columnas = new Map<string, number>();
  (filas[0] ?? []).forEach((celda, col) => {
    if (typeof celda === 'string') columnas.set(normalizarClave(celda), col);
  });
  return { indice: 0, columnas };
}

function buscarColumna(columnas: Map<string, number>, alias: string[]): number | undefined {
  for (const a of alias) {
    if (columnas.has(a)) return columnas.get(a);
  }
  return undefined;
}

function parsearFecha(valor: unknown): string | null {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    return valor.toISOString().split('T')[0];
  }
  if (typeof valor === 'number') {
    // Fecha serial de Excel
    const fecha = XLSX.SSF.parse_date_code(valor);
    if (!fecha) return null;
    const d = new Date(Date.UTC(fecha.y, fecha.m - 1, fecha.d));
    return d.toISOString().split('T')[0];
  }
  if (typeof valor === 'string') {
    const s = valor.trim();
    // dd/mm/aaaa o dd-mm-aaaa
    const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m1) {
      const [, d, m, y] = m1;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // aaaa-mm-dd
    const m2 = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m2) {
      const [, y, m, d] = m2;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return null;
}

function parsearTipoExplicito(valor: unknown): 'INGRESO' | 'EGRESO' | null {
  if (typeof valor !== 'string') return null;
  const v = normalizarClave(valor);
  if (['ingreso', 'abono', 'credito', 'i'].includes(v)) return 'INGRESO';
  if (['egreso', 'cargo', 'debito', 'e'].includes(v)) return 'EGRESO';
  return null;
}

/** Devuelve el monto con signo (positivo = ingreso, negativo = egreso) o null si no es numérico. */
function parsearMontoConSigno(valor: unknown): number | null {
  if (typeof valor === 'number') return valor;
  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const n = parseFloat(limpio);
    if (!isNaN(n)) return n;
  }
  return null;
}

export async function parseExcelMovimientos(file: File): Promise<FilaMovimientoImportado[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const primeraHoja = workbook.SheetNames[0];
  if (!primeraHoja) return [];

  const filas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[primeraHoja], { header: 1, defval: '', raw: true });
  const { indice: indiceEncabezado, columnas } = detectarEncabezado(filas);

  const colFecha = buscarColumna(columnas, ALIAS_FECHA);
  const colDescripcion = buscarColumna(columnas, ALIAS_DESCRIPCION);
  const colMonto = buscarColumna(columnas, ALIAS_MONTO);
  const colTipo = buscarColumna(columnas, ALIAS_TIPO);
  const colReferencia = buscarColumna(columnas, ALIAS_REFERENCIA);

  const datos = filas.slice(indiceEncabezado + 1).filter((f) => !esFilaVacia(f));

  return datos.map((fila, idx) => {
    const numeroFila = indiceEncabezado + idx + 2; // +1 por encabezado, +1 porque Excel es 1-indexado

    const fechaRaw = colFecha !== undefined ? fila[colFecha] : undefined;
    const descripcionRaw = colDescripcion !== undefined ? fila[colDescripcion] : undefined;
    const montoRaw = colMonto !== undefined ? fila[colMonto] : undefined;
    const tipoRaw = colTipo !== undefined ? fila[colTipo] : undefined;
    const referenciaRaw = colReferencia !== undefined ? fila[colReferencia] : undefined;

    const fecha = parsearFecha(fechaRaw);
    const descripcion = typeof descripcionRaw === 'string' ? descripcionRaw.trim() : String(descripcionRaw ?? '').trim();
    const montoConSigno = parsearMontoConSigno(montoRaw);
    // Si hay columna Tipo explícita se usa esa; si no, se infiere del signo del monto.
    const tipo = parsearTipoExplicito(tipoRaw) ?? (montoConSigno !== null ? (montoConSigno < 0 ? 'EGRESO' : 'INGRESO') : null);
    const referencia = referenciaRaw !== undefined && referenciaRaw !== '' ? String(referenciaRaw).trim() : undefined;

    let error: string | undefined;
    if (!fecha) error = 'Fecha inválida o faltante';
    else if (!descripcion) error = 'Descripción faltante';
    else if (montoConSigno === null || montoConSigno === 0) error = 'Monto inválido';
    else if (!tipo) error = 'Tipo debe ser INGRESO o EGRESO';

    return {
      fila: numeroFila,
      fecha: fecha ?? '',
      descripcion,
      monto: montoConSigno !== null ? Math.abs(montoConSigno) : 0,
      tipo: tipo ?? 'INGRESO',
      referencia,
      error,
    };
  });
}
