// FILE: src/modules/facturacion/factura-pdf.generator.ts
// Genera el PDF de una factura de forma local (sin OSE/PSE) usando pdfkit.
// Se invoca de forma perezosa cuando una factura no tiene pdfPath en BD,
// reutilizando los parámetros de empresa/PDF guardados en Configuración.

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { configuracionService } from '../configuracion/configuracion.service';

const DIRECTORIO_FACTURAS = path.join('storage', 'facturas');

function formatearMoneda(valor: number | string): string {
  const n = typeof valor === 'string' ? parseFloat(valor) : valor;
  return `S/ ${n.toFixed(2)}`;
}

function formatearFecha(fecha: Date): string {
  return new Date(fecha).toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Genera el PDF de la factura indicada y lo guarda en disco.
 * Devuelve la ruta relativa (a process.cwd()) donde quedó almacenado el archivo,
 * lista para ser persistida en `factura.pdfPath`.
 */
export async function generarPdfFactura(factura: any): Promise<string> {
  const [empresaNombre, empresaRuc, empresaDireccion, empresaTelefono, empresaEmail, pieDePagina, textoLegal, colorHex] =
    await Promise.all([
      configuracionService.getParametro('empresa_nombre'),
      configuracionService.getParametro('empresa_ruc'),
      configuracionService.getParametro('empresa_direccion'),
      configuracionService.getParametro('empresa_telefono'),
      configuracionService.getParametro('empresa_email'),
      configuracionService.getParametro('pdf_pie_pagina'),
      configuracionService.getParametro('pdf_texto_legal'),
      configuracionService.getParametro('pdf_color_principal'),
    ]);

  const color = colorHex || '#2563eb';

  const directorioAbsoluto = path.join(process.cwd(), DIRECTORIO_FACTURAS);
  if (!fs.existsSync(directorioAbsoluto)) {
    fs.mkdirSync(directorioAbsoluto, { recursive: true });
  }

  const nombreArchivo = `${factura.numeroFactura}.pdf`;
  const rutaAbsoluta = path.join(directorioAbsoluto, nombreArchivo);
  const rutaRelativa = path.join(DIRECTORIO_FACTURAS, nombreArchivo);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(rutaAbsoluta);
    doc.pipe(stream);

    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    // ── Encabezado: datos de la empresa ────────────────────────────────────
    doc.fillColor(color).fontSize(18).font('Helvetica-Bold').text(empresaNombre || 'Mi Empresa SAC');
    doc.fillColor('#000000').fontSize(9).font('Helvetica');
    doc.text(`RUC: ${empresaRuc || ''}`);
    doc.text(empresaDireccion || '');
    doc.text(`Tel: ${empresaTelefono || ''}   ${empresaEmail || ''}`);

    // ── Recuadro con el número de factura ──────────────────────────────────
    const cajaX = 360;
    const cajaY = 50;
    doc.roundedRect(cajaX, cajaY, 185, 70, 4).stroke(color);
    doc.fillColor(color).fontSize(11).font('Helvetica-Bold')
      .text('FACTURA ELECTRÓNICA', cajaX, cajaY + 12, { width: 185, align: 'center' });
    doc.fontSize(13).text(factura.numeroFactura, cajaX, cajaY + 30, { width: 185, align: 'center' });
    doc.fillColor('#000000').fontSize(9).font('Helvetica')
      .text(`Emisión: ${formatearFecha(factura.fechaEmision)}`, cajaX, cajaY + 50, { width: 185, align: 'center' });

    doc.moveDown(3);

    // ── Datos del cliente ───────────────────────────────────────────────────
    const clienteY = doc.y + 10;
    doc.moveTo(50, clienteY).lineTo(545, clienteY).strokeColor('#cccccc').stroke();
    doc.moveDown(1);
    doc.fillColor(color).fontSize(10).font('Helvetica-Bold').text('CLIENTE');
    doc.fillColor('#000000').fontSize(9).font('Helvetica');
    doc.text(`Razón social: ${factura.cliente?.razonSocial ?? ''}`);
    doc.text(`RUC: ${factura.cliente?.ruc ?? ''}`);
    doc.text(`Dirección: ${factura.cliente?.direccion ?? ''}`);
    doc.text(`Vencimiento: ${formatearFecha(factura.fechaVencimiento)}`);
    if (factura.peso != null) {
      doc.text(`Peso: ${Number(factura.peso).toFixed(2)} kg`);
    }

    doc.moveDown(1);

    // ── Tabla de líneas ─────────────────────────────────────────────────────
    const tablaX = 50;
    let y = doc.y + 5;
    const columnas = [
      { titulo: 'Código',      ancho: 60,  align: 'left' as const },
      { titulo: 'Descripción', ancho: 215, align: 'left' as const },
      { titulo: 'Cant.',       ancho: 50,  align: 'right' as const },
      { titulo: 'Unid.',       ancho: 50,  align: 'center' as const },
      { titulo: 'V. Unit.',    ancho: 75,  align: 'right' as const },
      { titulo: 'Importe',     ancho: 75,  align: 'right' as const },
    ];

    doc.rect(tablaX, y, 495, 20).fill(color);
    doc.fillColor('#ffffff').fontSize(8).font('Helvetica-Bold');
    let x = tablaX;
    for (const col of columnas) {
      doc.text(col.titulo, x + 4, y + 6, { width: col.ancho - 8, align: col.align });
      x += col.ancho;
    }
    y += 20;

    doc.font('Helvetica').fontSize(8);
    for (const linea of factura.lineas ?? []) {
      const alturaFila = 18;
      if (y + alturaFila > 740) {
        doc.addPage();
        y = 50;
      }
      doc.fillColor('#000000');
      x = tablaX;
      const valores = [
        linea.codigo,
        linea.descripcion,
        Number(linea.cantidad).toFixed(2),
        linea.unidadMedida,
        formatearMoneda(linea.valorUnitario),
        formatearMoneda(linea.importe),
      ];
      valores.forEach((valor, idx) => {
        const col = columnas[idx];
        doc.text(String(valor ?? ''), x + 4, y + 5, { width: col.ancho - 8, align: col.align });
        x += col.ancho;
      });
      doc.moveTo(tablaX, y + alturaFila).lineTo(tablaX + 495, y + alturaFila).strokeColor('#eeeeee').stroke();
      y += alturaFila;
    }

    // ── Totales ─────────────────────────────────────────────────────────────
    y += 15;
    if (y > 700) { doc.addPage(); y = 50; }
    const totalesX = 360;
    const filaTotales = (etiqueta: string, valor: string, negrita = false) => {
      doc.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000');
      doc.text(etiqueta, totalesX, y, { width: 110, align: 'left' });
      doc.text(valor, totalesX + 110, y, { width: 75, align: 'right' });
      y += 16;
    };
    filaTotales('Subtotal:', formatearMoneda(factura.subtotal));
    filaTotales(`IGV (${Number(factura.porcentajeIgv)}%):`, formatearMoneda(factura.igv));
    if (factura.montoDetraccion) {
      filaTotales(`Detracción (${Number(factura.porcentajeDetraccion ?? 0)}%):`, formatearMoneda(factura.montoDetraccion));
    }
    filaTotales('TOTAL:', formatearMoneda(factura.total), true);

    // ── Pie de página ───────────────────────────────────────────────────────
    doc.fontSize(8).fillColor('#666666').font('Helvetica');
    doc.text(textoLegal || 'Documento emitido electrónicamente', 50, 760, { width: 495, align: 'center' });
    doc.text(pieDePagina || '', 50, 772, { width: 495, align: 'center' });

    doc.end();
  });

  return rutaRelativa.split(path.sep).join('/');
}
