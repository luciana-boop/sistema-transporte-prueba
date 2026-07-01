// FILE: src/lib/parseExcelMovimientos.ts
// Módulo Movimientos: parseo del Excel de movimientos bancarios a importar.
//
// Plantilla soportada hoy (genérica, hasta tener el formato real del banco):
//   Fecha | Descripción | Monto | Tipo
// - Fecha: cualquier formato reconocible por Excel/JS (dd/mm/aaaa, aaaa-mm-dd, o fecha nativa de Excel)
// - Monto: número positivo (el signo lo define la columna Tipo, no el monto)
// - Tipo: INGRESO o EGRESO (también acepta "ingreso"/"egreso" en minúsculas o con tildes)
//
// Toda la lógica de mapeo de columnas vive en esta única función: cuando llegue
// el formato real del banco (columnas propias, cargo/abono separados, etc.) solo
// hay que ajustar aquí, sin tocar el resto del módulo de Movimientos.

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

function normalizarClave(clave: string): string {
  const descompuesta = clave.normalize('NFD');
  let sinTildes = '';
  for (const ch of descompuesta) {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0x0300 && code <= 0x036f) continue; // marca diacrítica combinante
    sinTildes += ch;
  }
  return sinTildes.trim().toLowerCase();
}

function buscarValor(fila: Record<string, unknown>, alias: string[]): unknown {
  const claves = Object.keys(fila);
  for (const a of alias) {
    const key = claves.find((k) => normalizarClave(k) === a);
    if (key !== undefined) return fila[key];
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

function parsearTipo(valor: unknown): 'INGRESO' | 'EGRESO' | null {
  if (typeof valor !== 'string') return null;
  const v = normalizarClave(valor);
  if (['ingreso', 'abono', 'credito', 'i'].includes(v)) return 'INGRESO';
  if (['egreso', 'cargo', 'debito', 'e'].includes(v)) return 'EGRESO';
  return null;
}

function parsearMonto(valor: unknown): number | null {
  if (typeof valor === 'number') return Math.abs(valor);
  if (typeof valor === 'string') {
    const limpio = valor.replace(/[^0-9.,-]/g, '').replace(/,/g, '');
    const n = parseFloat(limpio);
    if (!isNaN(n)) return Math.abs(n);
  }
  return null;
}

export async function parseExcelMovimientos(file: File): Promise<FilaMovimientoImportado[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const primeraHoja = workbook.SheetNames[0];
  if (!primeraHoja) return [];

  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[primeraHoja], { defval: '' });

  return filas.map((fila, idx) => {
    const numeroFila = idx + 2; // fila 1 = encabezados

    const fechaRaw = buscarValor(fila, ['fecha']);
    const descripcionRaw = buscarValor(fila, ['descripcion', 'concepto', 'detalle']);
    const montoRaw = buscarValor(fila, ['monto', 'importe']);
    const tipoRaw = buscarValor(fila, ['tipo']);
    const referenciaRaw = buscarValor(fila, ['referencia', 'operacion', 'n operacion', 'nro operacion']);

    const fecha = parsearFecha(fechaRaw);
    const descripcion = typeof descripcionRaw === 'string' ? descripcionRaw.trim() : String(descripcionRaw ?? '').trim();
    const monto = parsearMonto(montoRaw);
    const tipo = parsearTipo(tipoRaw);
    const referencia = referenciaRaw !== undefined && referenciaRaw !== '' ? String(referenciaRaw).trim() : undefined;

    let error: string | undefined;
    if (!fecha) error = 'Fecha inválida o faltante';
    else if (!descripcion) error = 'Descripción faltante';
    else if (monto === null || monto <= 0) error = 'Monto inválido';
    else if (!tipo) error = 'Tipo debe ser INGRESO o EGRESO';

    return {
      fila: numeroFila,
      fecha: fecha ?? '',
      descripcion,
      monto: monto ?? 0,
      tipo: tipo ?? 'INGRESO',
      referencia,
      error,
    };
  });
}
