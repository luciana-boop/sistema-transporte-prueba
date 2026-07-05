// FILE: src/modules/pdf/pdf-shared.helper.ts
// Primitivas de dibujo compartidas para generadores de PDF, portadas de
// MONKSAAS (paleta, encabezado de comprobante, cajas tituladas, tablas, pie).
// Adaptación single-tenant: los datos del emisor salen de los parámetros de
// Configuración (empresa_*), no de un modelo Empresa; sin logos remotos.

import { configuracionService } from '../configuracion/configuracion.service';

// ─── Paleta neutra (independiente del color de marca configurado) ────────────

export const NEUTRO = {
  texto: '#1f2430',
  textoSuave: '#4b5563',
  gris: '#6b7280',
  grisClaro: '#9ca3af',
  borde: '#e2e4e9',
  bordeSuave: '#edeef2',
  fondoSutil: '#f7f8fa',
  blanco: '#ffffff',
};

// ─── Formato ──────────────────────────────────────────────────────────────────

export function fmtMoneda(v: unknown): string {
  const n = Number(v ?? 0);
  const valor = Number.isFinite(n) ? n : 0;
  return `S/ ${valor.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ─── Monto en letras (SON: ... CON 00/100 SOLES) ─────────────────────────────

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
const ESPECIALES_10_19 = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
const ESPECIALES_20_29 = ['VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const DECENAS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const CENTENAS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

function decenasYUnidades(n: number): string {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return ESPECIALES_10_19[n - 10];
  if (n < 30) return ESPECIALES_20_29[n - 20];
  const d = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? DECENAS[d] : `${DECENAS[d]} Y ${UNIDADES[u]}`;
}

function centenasGrupo(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'CIEN';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c > 0) partes.push(CENTENAS[c]);
  if (resto > 0) partes.push(decenasYUnidades(resto));
  return partes.join(' ');
}

// Apocope de "UNO" -> "UN"/"ÚN" antes de MIL/MILLONES (VEINTIUNO MIL -> VEINTIÚN MIL,
// CIENTO UNO MIL -> CIENTO UN MIL), igual que en cualquier texto legal/cheque en español.
function apocope(texto: string): string {
  if (texto === 'UNO') return 'UN';
  if (texto.endsWith('VEINTIUNO')) return `${texto.slice(0, -3)}ÚN`;
  if (texto.endsWith(' UNO')) return `${texto.slice(0, -3)}UN`;
  return texto;
}

function numeroALetras(n: number): string {
  if (n === 0) return 'CERO';
  if (n < 0) return `MENOS ${numeroALetras(-n)}`;
  if (n > 999_999_999) return String(n); // fuera del rango realista de un comprobante

  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  const partes: string[] = [];
  if (millones > 0) {
    partes.push(millones === 1 ? 'UN MILLÓN' : `${apocope(centenasGrupo(millones))} MILLONES`);
  }
  if (miles > 0) {
    partes.push(miles === 1 ? 'MIL' : `${apocope(centenasGrupo(miles))} MIL`);
  }
  if (resto > 0) {
    partes.push(centenasGrupo(resto));
  }
  return partes.join(' ');
}

// Convierte un monto a su representación en letras para la línea "SON: ..." de
// documentos financieros: "DOSCIENTOS SETENTA Y OCHO CON 00/100 SOLES".
export function montoEnLetras(monto: number): string {
  const valor = Math.abs(Number(monto) || 0);
  let entero = Math.floor(valor);
  let centavos = Math.round((valor - entero) * 100);
  if (centavos === 100) { entero += 1; centavos = 0; }
  return `${numeroALetras(entero)} CON ${String(centavos).padStart(2, '0')}/100 SOLES`;
}

// ─── Datos del emisor (parámetros empresa_* de Configuración) ────────────────

export interface DatosEmisor {
  razonSocial: string;
  ruc: string;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
}

export async function obtenerDatosEmisor(): Promise<DatosEmisor> {
  const [razonSocial, nombre, ruc, direccion, telefono, email] = await Promise.all([
    configuracionService.getParametro('empresa_razon_social'),
    configuracionService.getParametro('empresa_nombre'),
    configuracionService.getParametro('empresa_ruc'),
    configuracionService.getParametro('empresa_direccion'),
    configuracionService.getParametro('empresa_telefono'),
    configuracionService.getParametro('empresa_email'),
  ]);
  return {
    razonSocial: razonSocial || nombre || 'Mi Empresa',
    ruc: ruc ?? '',
    direccion,
    telefono,
    email,
  };
}

// ─── Parámetros de estilo de PDF ──────────────────────────────────────────────

export interface ParametrosPdf {
  color: string;
  colorClaro: string;
  pieDePagina: string;
  textoLegal: string;
}

export async function obtenerParametrosPdf(): Promise<ParametrosPdf> {
  const [colorHex, pieDePagina, textoLegal] = await Promise.all([
    configuracionService.getParametro('pdf_color_principal'),
    configuracionService.getParametro('pdf_pie_pagina'),
    configuracionService.getParametro('pdf_texto_legal'),
  ]);
  return {
    color: colorHex || '#2563eb',
    colorClaro: '#f0f4ff',
    pieDePagina: pieDePagina || '',
    textoLegal: textoLegal || 'Documento emitido electrónicamente',
  };
}

// ─── Banda superior (full-bleed, todas las páginas) ───────────────────────────

export function dibujarBandaSuperior(doc: PDFKit.PDFDocument, color: string): void {
  doc.rect(0, 0, doc.page.width, 5).fill(color);
}

// ─── Encabezado "comprobante oficial" ─────────────────────────────────────────

export interface OpcionesEncabezado {
  doc: PDFKit.PDFDocument;
  M: number;
  ANCHO: number;
  logoBuffer: Buffer | null;
  empresaNombre: string;
  empresaRuc: string;
  empresaDireccion?: string | null;
  empresaTelefono?: string | null;
  empresaEmail?: string | null;
  titulo: string;
  numero: string;
  color: string;
  colorClaro: string;
}

// Logo + datos de empresa a la izquierda; título y número del documento a la
// derecha, sin recuadros — tipografía y una regla fina hacen el trabajo.
// Devuelve el `y` desde el que debe continuar el resto del documento.
export function dibujarEncabezado(opts: OpcionesEncabezado): number {
  const { doc, M, ANCHO, logoBuffer, empresaNombre, empresaRuc, empresaDireccion, empresaTelefono, empresaEmail, titulo, numero, color } = opts;
  const top = 28;

  dibujarBandaSuperior(doc, color);

  let logoAncho = 0;
  if (logoBuffer) {
    try {
      doc.image(logoBuffer, M, top, { fit: [46, 46] });
      logoAncho = 58;
    } catch { /* logo inválido — no debe interrumpir la generación del PDF */ }
  }

  const colIzqAncho = ANCHO * 0.56 - logoAncho;
  doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(15)
    .text(empresaNombre || 'Mi Empresa', M + logoAncho, top, { width: colIzqAncho });
  doc.fillColor(NEUTRO.gris).font('Helvetica').fontSize(8)
    .text(empresaDireccion || '', M + logoAncho, doc.y + 3, { width: colIzqAncho })
    .text([empresaTelefono ? `Telf: ${empresaTelefono}` : '', empresaEmail || ''].filter(Boolean).join('   ·   '), M + logoAncho, doc.y + 2, { width: colIzqAncho });

  // Bloque derecho: RUC pequeño, título en color de marca, número grande.
  const derX = M + ANCHO * 0.55;
  const derAncho = ANCHO * 0.45;
  doc.fillColor(NEUTRO.gris).font('Helvetica').fontSize(8)
    .text(`RUC ${empresaRuc || ''}`, derX, top + 1, { width: derAncho, align: 'right' });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(10.5)
    .text(titulo, derX, doc.y + 6, { width: derAncho, align: 'right' });
  doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(17)
    .text(numero, derX, doc.y + 4, { width: derAncho, align: 'right' });

  const yHeader = Math.max(top + 58, doc.y + 6, top + 70);
  doc.moveTo(M, yHeader).lineTo(M + ANCHO, yHeader).strokeColor(color).lineWidth(1.4).stroke();

  return yHeader + 14;
}

// ─── Tarjeta de información (recuadro con barra de título y líneas) ──────────

export function dibujarTarjetaInfo(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number, h: number,
  titulo: string, lineas: string[], color: string,
): void {
  doc.roundedRect(x, y, w, h, 4).lineWidth(0.75).stroke(NEUTRO.borde);
  doc.rect(x + 1, y + 1, w - 2, 18).fill(NEUTRO.fondoSutil);
  doc.moveTo(x, y + 20).lineTo(x + w, y + 20).strokeColor(NEUTRO.borde).lineWidth(0.5).stroke();
  doc.fillColor(color).font('Helvetica-Bold').fontSize(7.5)
    .text(titulo.toUpperCase(), x + 10, y + 6, { width: w - 20, characterSpacing: 0.3 });

  let ly = y + 28;
  doc.font('Helvetica').fontSize(8.5);
  for (const linea of lineas) {
    if (!linea) continue;
    doc.fillColor(NEUTRO.texto).text(linea, x + 10, ly, { width: w - 20 });
    ly = doc.y + 2;
  }
}

// ─── Tarjeta de totales (recuadro con barra de acento a la izquierda) ────────

export function dibujarTarjetaTotales(
  doc: PDFKit.PDFDocument,
  x: number, y: number, w: number,
  filas: Array<{ label: string; valor: string; destacado?: boolean }>,
  color: string,
): number {
  const altoFila = 17;
  const padding = 12;
  const alto = filas.length * altoFila + padding * 2 - 4;

  doc.roundedRect(x, y, w, alto, 5).fill(NEUTRO.fondoSutil);
  doc.rect(x, y, 3.5, alto).fill(color);

  let fy = y + padding;
  filas.forEach((f) => {
    doc.fillColor(f.destacado ? NEUTRO.texto : NEUTRO.textoSuave)
      .font(f.destacado ? 'Helvetica-Bold' : 'Helvetica').fontSize(f.destacado ? 10.5 : 8.5)
      .text(f.label, x + padding + 4, fy, { width: w - padding * 2 - 4, continued: false });
    doc.fillColor(f.destacado ? color : NEUTRO.texto)
      .font(f.destacado ? 'Helvetica-Bold' : 'Helvetica').fontSize(f.destacado ? 10.5 : 8.5)
      .text(f.valor, x + padding, fy, { width: w - padding * 2, align: 'right' });
    fy += altoFila;
  });

  return y + alto;
}

// ─── Encabezado de tabla ──────────────────────────────────────────────────────

export interface ColumnaTabla {
  titulo: string;
  ancho: number;
  align: 'left' | 'center' | 'right';
}

export function dibujarEncabezadoTabla(doc: PDFKit.PDFDocument, x: number, y: number, anchoTotal: number, cols: ColumnaTabla[], color: string, altura = 22): number {
  doc.rect(x, y, anchoTotal, altura).fill(NEUTRO.fondoSutil);
  doc.fillColor(NEUTRO.textoSuave).font('Helvetica-Bold').fontSize(7.5);
  let cx = x;
  for (const col of cols) {
    doc.text(col.titulo.toUpperCase(), cx + 8, y + altura / 2 - 4, { width: col.ancho - 16, align: col.align, characterSpacing: 0.2 });
    cx += col.ancho;
  }
  doc.moveTo(x, y + altura).lineTo(x + anchoTotal, y + altura).strokeColor(color).lineWidth(1.2).stroke();
  return y + altura;
}

// Fondo zebra opcional para una fila de tabla — llamar ANTES de escribir el texto de la fila.
export function dibujarFondoFila(doc: PDFKit.PDFDocument, x: number, y: number, anchoTotal: number, alto: number, indice: number): void {
  if (indice % 2 === 1) {
    doc.rect(x, y, anchoTotal, alto).fill('#fbfbfc');
  }
}

// ─── Firma (línea + etiqueta) ─────────────────────────────────────────────────

export function dibujarFirma(doc: PDFKit.PDFDocument, x: number, y: number, w: number, etiqueta: string, subEtiqueta?: string): void {
  doc.moveTo(x, y).lineTo(x + w, y).strokeColor(NEUTRO.grisClaro).lineWidth(0.75).stroke();
  doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(7.5).text(etiqueta, x, y + 4, { width: w, align: 'center' });
  if (subEtiqueta) {
    doc.fillColor(NEUTRO.gris).font('Helvetica').fontSize(6.5).text(subEtiqueta, x, doc.y + 1, { width: w, align: 'center' });
  }
}

// ─── Pie de página ────────────────────────────────────────────────────────────

export interface OpcionesPie {
  doc: PDFKit.PDFDocument;
  M: number;
  ANCHO: number;
  y: number;
  textoLegal?: string | null;
  pieDePagina?: string | null;
  // Deja el hueco de 64x64 a la derecha para el QR de SUNAT.
  espacioQR?: boolean;
  qrBuffer?: Buffer | null;
  // false omite el texto "Representación impresa..." (documentos no SUNAT).
  mostrarTextoSunat?: boolean;
  color?: string;
}

export function dibujarPie(opts: OpcionesPie): void {
  const { doc, M, ANCHO, y, textoLegal, pieDePagina, espacioQR = false, qrBuffer, mostrarTextoSunat = true, color } = opts;

  doc.moveTo(M, y).lineTo(M + ANCHO, y).strokeColor(color ?? NEUTRO.bordeSuave).lineWidth(color ? 1 : 0.75).stroke();

  const anchoTexto = espacioQR ? ANCHO - 76 : ANCHO;

  doc.fillColor(NEUTRO.textoSuave).font('Helvetica').fontSize(7.5)
    .text(textoLegal || '', M, y + 8, { width: anchoTexto, align: 'left' });
  doc.fillColor(NEUTRO.gris).text(pieDePagina || '', M, doc.y + 1, { width: anchoTexto, align: 'left' });
  if (mostrarTextoSunat) {
    doc.fillColor(NEUTRO.grisClaro).fontSize(6.5)
      .text('Representación impresa del comprobante electrónico. Consulte su validez en www.sunat.gob.pe',
        M, doc.y + 2, { width: anchoTexto });
  }

  if (espacioQR) {
    const qrX = M + ANCHO - 64;
    let dibujado = false;
    if (qrBuffer) {
      try {
        doc.image(qrBuffer, qrX, y + 6, { width: 64, height: 64 });
        dibujado = true;
      } catch { /* buffer de QR inválido — cae al placeholder */ }
    }
    if (!dibujado) {
      doc.roundedRect(qrX, y + 6, 64, 64, 4).lineWidth(0.75).stroke(NEUTRO.borde);
      doc.fillColor(NEUTRO.grisClaro).font('Helvetica').fontSize(6.5)
        .text('QR SUNAT', qrX, y + 34, { width: 64, align: 'center' });
    }
  }
}

// ─── Caja titulada (usada por Guía de Remisión) ───────────────────────────────

export function dibujarCajaTitulada(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, titulo: string, color: string): number {
  doc.roundedRect(x, y, w, h, 4).lineWidth(0.75).stroke(NEUTRO.borde);
  doc.rect(x + 1, y + 1, w - 2, 18).fill(NEUTRO.fondoSutil);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(7)
    .text(titulo.toUpperCase(), x + 10, y + 6, { width: w - 20, characterSpacing: 0.3 });
  doc.moveTo(x, y + 20).lineTo(x + w, y + 20).strokeColor(NEUTRO.borde).lineWidth(0.5).stroke();
  return y + 26;
}
