// FILE: src/modules/cobranza/estado-cuenta-pdf.generator.ts
// Genera al vuelo (sin persistir en disco) el PDF de estado de cuenta de un
// cliente: facturas vencidas y por vencer, cada una con su total, y el total
// general. Reusa las primitivas de dibujo compartidas de pdf-shared.helper.

import PDFDocument from 'pdfkit';
import {
  NEUTRO, fmtMoneda, fmtFecha, obtenerDatosEmisor, obtenerParametrosPdf,
  dibujarEncabezado, dibujarEncabezadoTabla, dibujarFondoFila, dibujarPie,
  type ColumnaTabla,
} from '../pdf/pdf-shared.helper';

interface FacturaEstadoCuenta {
  id: number;
  numeroFactura: string;
  saldoPendiente: number;
  fechaVencimiento: Date | string;
}

interface EstadoCuenta {
  cliente: { id: number; razonSocial: string; ruc: string };
  vencidas: FacturaEstadoCuenta[];
  porVencer: FacturaEstadoCuenta[];
  totalVencidas: number;
  totalPorVencer: number;
  totalGeneral: number;
}

const COLS: ColumnaTabla[] = [
  { titulo: 'N° Factura', ancho: 180, align: 'left' },
  { titulo: 'Vencimiento', ancho: 140, align: 'left' },
  { titulo: 'Saldo pendiente', ancho: 140, align: 'right' },
];

function dibujarTablaFacturas(doc: PDFKit.PDFDocument, x: number, y: number, anchoTotal: number, titulo: string, facturas: FacturaEstadoCuenta[], total: number, color: string): number {
  doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(9).text(titulo, x, y);
  let cy = y + 16;

  if (facturas.length === 0) {
    doc.fillColor(NEUTRO.gris).font('Helvetica').fontSize(8).text('Sin facturas en este grupo.', x, cy);
    return cy + 20;
  }

  cy = dibujarEncabezadoTabla(doc, x, cy, anchoTotal, COLS, color);

  facturas.forEach((f, i) => {
    const filaAlto = 20;
    dibujarFondoFila(doc, x, cy, anchoTotal, filaAlto, i);
    doc.fillColor(NEUTRO.texto).font('Helvetica').fontSize(8.5);
    let cx = x;
    doc.text(f.numeroFactura, cx + 8, cy + 6, { width: COLS[0].ancho - 16 });
    cx += COLS[0].ancho;
    doc.text(fmtFecha(f.fechaVencimiento), cx + 8, cy + 6, { width: COLS[1].ancho - 16 });
    cx += COLS[1].ancho;
    doc.text(fmtMoneda(f.saldoPendiente), cx + 8, cy + 6, { width: COLS[2].ancho - 16, align: 'right' });
    cy += filaAlto;
  });

  doc.moveTo(x, cy).lineTo(x + anchoTotal, cy).strokeColor(NEUTRO.borde).lineWidth(0.5).stroke();
  doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(9)
    .text(`Total ${titulo.toLowerCase()}: ${fmtMoneda(total)}`, x, cy + 8, { width: anchoTotal, align: 'right' });

  return cy + 28;
}

export async function generarPdfEstadoCuenta(estadoCuenta: EstadoCuenta): Promise<Buffer> {
  const emisor = await obtenerDatosEmisor();
  const { color, colorClaro, pieDePagina, textoLegal } = await obtenerParametrosPdf();

  const M = 45;
  const doc = new PDFDocument({ size: 'A4', margin: M });
  const ANCHO = doc.page.width - M * 2;

  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const fin = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  let y = dibujarEncabezado({
    doc, M, ANCHO, logoBuffer: null,
    empresaNombre: emisor.razonSocial, empresaRuc: emisor.ruc,
    empresaDireccion: emisor.direccion, empresaTelefono: emisor.telefono, empresaEmail: emisor.email,
    titulo: 'ESTADO DE CUENTA', numero: estadoCuenta.cliente.razonSocial, color, colorClaro,
  });

  doc.fillColor(NEUTRO.gris).font('Helvetica').fontSize(8)
    .text(`Cliente: ${estadoCuenta.cliente.razonSocial}  ·  RUC: ${estadoCuenta.cliente.ruc}`, M, y);
  y += 20;

  y = dibujarTablaFacturas(doc, M, y, ANCHO, 'Facturas vencidas', estadoCuenta.vencidas, estadoCuenta.totalVencidas, color);
  y = dibujarTablaFacturas(doc, M, y, ANCHO, 'Facturas por vencer', estadoCuenta.porVencer, estadoCuenta.totalPorVencer, color);

  doc.rect(M, y, ANCHO, 26).fill(colorClaro);
  doc.fillColor(color).font('Helvetica-Bold').fontSize(10.5)
    .text(`TOTAL GENERAL: ${fmtMoneda(estadoCuenta.totalGeneral)}`, M, y + 8, { width: ANCHO - 16, align: 'right' });
  y += 40;

  dibujarPie({ doc, M, ANCHO, y, textoLegal, pieDePagina, mostrarTextoSunat: false });

  doc.end();
  return fin;
}
