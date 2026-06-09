// FILE: src/modules/facturacion/factura-pdf.generator.ts
// Genera el PDF de una factura de forma local (sin OSE/PSE) usando pdfkit.
// Se invoca de forma perezosa cuando una factura no tiene pdfPath en BD,
// reutilizando los parámetros de empresa/PDF guardados en Configuración.

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import { configuracionService } from '../configuracion/configuracion.service';

const DIRECTORIO_FACTURAS = path.join('storage', 'facturas');

function fmt(valor: number | string | null | undefined): string {
  const n = typeof valor === 'string' ? parseFloat(valor) : (valor ?? 0);
  return `S/ ${n.toFixed(2)}`;
}

function fmtFecha(fecha: Date | string | null | undefined): string {
  if (!fecha) return '—';
  return new Date(fecha).toLocaleDateString('es-PE', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/**
 * Genera el PDF de la factura indicada y lo guarda en disco.
 * Devuelve la ruta relativa (a process.cwd()) donde quedó almacenado el archivo.
 */
export async function generarPdfFactura(factura: any): Promise<string> {
  const [
    empresaNombre, empresaRuc, empresaDireccion, empresaTelefono, empresaEmail,
    pieDePagina, textoLegal, colorHex,
  ] = await Promise.all([
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
  const colorClaro = '#f0f4ff';

  const directorioAbsoluto = path.join(process.cwd(), DIRECTORIO_FACTURAS);
  if (!fs.existsSync(directorioAbsoluto)) {
    fs.mkdirSync(directorioAbsoluto, { recursive: true });
  }

  const nombreArchivo = `${factura.numeroFactura}.pdf`;
  const rutaAbsoluta = path.join(directorioAbsoluto, nombreArchivo);
  const rutaRelativa = path.join(DIRECTORIO_FACTURAS, nombreArchivo);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const stream = fs.createWriteStream(rutaAbsoluta);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    const M = 45;          // margen izquierdo
    const ANCHO = 505;     // ancho útil (595 - 2×45)
    const MITAD = M + ANCHO / 2;

    // ── ENCABEZADO ────────────────────────────────────────────────────────────
    // Franja de color de fondo para el encabezado
    doc.rect(M, 40, ANCHO, 80).fill(colorClaro);

    // Lado izquierdo: datos de la empresa
    doc.fillColor(color).font('Helvetica-Bold').fontSize(14)
      .text(empresaNombre || 'Mi Empresa SAC', M + 8, 50, { width: ANCHO / 2 - 12 });
    doc.fillColor('#333333').font('Helvetica').fontSize(8.5)
      .text(empresaDireccion || '', M + 8, doc.y + 1, { width: ANCHO / 2 - 12 })
      .text(`Telf: ${empresaTelefono || ''}`, M + 8, doc.y + 1, { width: ANCHO / 2 - 12 })
      .text(empresaEmail || '', M + 8, doc.y + 1, { width: ANCHO / 2 - 12 });

    // Lado derecho: RUC + FACTURA ELECTRÓNICA + número
    const cajaDerX = MITAD + 4;
    const cajaDerAncho = ANCHO / 2 - 4;
    doc.rect(cajaDerX, 44, cajaDerAncho, 72).stroke(color);
    doc.fillColor('#444444').font('Helvetica').fontSize(8)
      .text(`RUC: ${empresaRuc || ''}`, cajaDerX, 52, { width: cajaDerAncho, align: 'center' });
    doc.fillColor(color).font('Helvetica-Bold').fontSize(10)
      .text('FACTURA ELECTRÓNICA', cajaDerX, doc.y + 3, { width: cajaDerAncho, align: 'center' });
    doc.fillColor('#111111').font('Helvetica-Bold').fontSize(13)
      .text(factura.numeroFactura || '', cajaDerX, doc.y + 4, { width: cajaDerAncho, align: 'center' });

    const yPostHeader = 135;
    doc.y = yPostHeader;

    // ── DATOS DEL CLIENTE ─────────────────────────────────────────────────────
    doc.moveTo(M, doc.y).lineTo(M + ANCHO, doc.y).strokeColor('#cccccc').lineWidth(0.5).stroke();
    doc.moveDown(0.4);

    const yCliente = doc.y;
    const colIzqAncho = ANCHO * 0.55;
    const colDerX = M + colIzqAncho + 8;
    const colDerAncho = ANCHO - colIzqAncho - 8;

    // Cabecera sección cliente
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text('DATOS DEL CLIENTE', M, yCliente);
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text('CONDICIONES', colDerX, yCliente);

    doc.fillColor('#111111').font('Helvetica').fontSize(8.5);
    const yClienteData = yCliente + 13;
    doc.text(`Razón Social: ${factura.cliente?.razonSocial ?? ''}`, M, yClienteData, { width: colIzqAncho });
    doc.text(`RUC/DNI: ${factura.cliente?.ruc ?? ''}`, M, doc.y + 1, { width: colIzqAncho });
    doc.text(`Dirección: ${factura.cliente?.direccion ?? ''}`, M, doc.y + 1, { width: colIzqAncho });

    // Condiciones (derecha)
    const condPago = factura.condicionPago ?? (factura.diasCredito ? `Crédito ${factura.diasCredito} días` : 'Contado');
    doc.fillColor('#111111').font('Helvetica').fontSize(8.5);
    doc.text(`Moneda: Soles (PEN)`, colDerX, yClienteData, { width: colDerAncho });
    doc.text(`Cond. Pago: ${condPago}`, colDerX, doc.y + 1, { width: colDerAncho });
    doc.text(`IGV: ${Number(factura.porcentajeIgv ?? 18)}%`, colDerX, doc.y + 1, { width: colDerAncho });

    // ── INFORMACIÓN DE EMISIÓN ────────────────────────────────────────────────
    const yEmision = Math.max(doc.y, yClienteData + 40) + 8;
    doc.rect(M, yEmision, ANCHO, 18).fill('#f8f8f8').stroke('#e5e7eb');

    const campos = [
      { label: 'Emisión', valor: fmtFecha(factura.fechaEmision) },
      { label: 'Forma de pago', valor: factura.metodoPago ?? '—' },
      { label: 'Pedido', valor: factura.pedidoId ? `#${factura.pedidoId}` : '—' },
      { label: 'Vencimiento', valor: fmtFecha(factura.fechaVencimiento) },
      { label: 'Guía de remisión', valor: factura.guiaRemision ?? '—' },
    ];

    const anchoCampo = ANCHO / campos.length;
    campos.forEach((c, i) => {
      const cx = M + i * anchoCampo;
      doc.fillColor('#888888').font('Helvetica').fontSize(6.5)
        .text(c.label.toUpperCase(), cx + 2, yEmision + 2, { width: anchoCampo - 4, align: 'center' });
      doc.fillColor('#111111').font('Helvetica-Bold').fontSize(7.5)
        .text(c.valor, cx + 2, yEmision + 9, { width: anchoCampo - 4, align: 'center' });
    });

    // ── TABLA DE DETALLE ──────────────────────────────────────────────────────
    // Orden estándar de factura: Código | Descripción | Cant. | Unid. | V. Unitario | Importe
    // Anchos suman exactamente ANCHO (505 px) con padding interno de 4px por lado.
    let y = yEmision + 26;
    const cols = [
      { titulo: 'Código',      ancho: 60,  align: 'left'   as const },
      { titulo: 'Descripción', ancho: 190, align: 'left'   as const },
      { titulo: 'Cant.',       ancho: 45,  align: 'center' as const },
      { titulo: 'Unid.',       ancho: 50,  align: 'center' as const },
      { titulo: 'V. Unitario', ancho: 80,  align: 'right'  as const },
      { titulo: 'Importe',     ancho: 80,  align: 'right'  as const },
    ];
    // total = 60+190+45+50+80+80 = 505 ✓

    // Cabecera de tabla
    doc.rect(M, y, ANCHO, 18).fill(color);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    let x = M;
    for (const col of cols) {
      doc.text(col.titulo, x + 4, y + 5, { width: col.ancho - 8, align: col.align });
      x += col.ancho;
    }
    y += 18;

    doc.font('Helvetica').fontSize(8);
    for (const linea of factura.lineas ?? []) {
      const alturaFila = 17;
      if (y + alturaFila > 750) {
        doc.addPage();
        y = 50;
      }
      doc.fillColor('#111111');
      x = M;
      const valores = [
        linea.codigo ?? '',
        linea.descripcion ?? '',
        linea.cantidad ? Number(linea.cantidad).toFixed(2) : '1.00',
        linea.unidadMedida ?? 'NIU',
        fmt(linea.valorUnitario),
        fmt(linea.importe),
      ];
      valores.forEach((valor, idx) => {
        const col = cols[idx];
        doc.text(String(valor), x + 4, y + 4, { width: col.ancho - 8, align: col.align });
        x += col.ancho;
      });
      doc.moveTo(M, y + alturaFila).lineTo(M + ANCHO, y + alturaFila).strokeColor('#eeeeee').lineWidth(0.5).stroke();
      y += alturaFila;
    }

    // ── RESUMEN INFERIOR ──────────────────────────────────────────────────────
    y += 12;
    if (y > 700) { doc.addPage(); y = 50; }

    const colResIzqAncho = ANCHO * 0.52;
    const colResDerX = M + colResIzqAncho + 8;
    const colResDerAncho = ANCHO - colResIzqAncho - 8;

    // Izquierda: peso y observaciones
    doc.fillColor(color).font('Helvetica-Bold').fontSize(7.5)
      .text('OBSERVACIONES', M, y);
    doc.fillColor('#333333').font('Helvetica').fontSize(8);
    if (factura.peso != null && factura.peso !== undefined) {
      doc.text(`Peso: ${Number(factura.peso).toFixed(2)} kg`, M, doc.y + 2, { width: colResIzqAncho });
    }
    if (factura.observaciones) {
      doc.text(factura.observaciones, M, doc.y + 2, { width: colResIzqAncho });
    } else {
      doc.text('—', M, doc.y + 2, { width: colResIzqAncho });
    }

    // Derecha: totales
    const filaTotales = (etiqueta: string, valor: string, negrita = false, colorValor = '#111111') => {
      doc.fillColor('#555555').font('Helvetica').fontSize(8.5)
        .text(etiqueta, colResDerX, y, { width: colResDerAncho * 0.55, align: 'left' });
      doc.fillColor(colorValor).font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5)
        .text(valor, colResDerX + colResDerAncho * 0.55, y, { width: colResDerAncho * 0.45, align: 'right' });
      y += 14;
    };

    filaTotales('Subtotal:', fmt(factura.subtotal));
    filaTotales(`IGV (${Number(factura.porcentajeIgv ?? 18)}%):`, fmt(factura.igv));
    if (factura.montoDetraccion && Number(factura.montoDetraccion) > 0) {
      filaTotales(`Detracción (${Number(factura.porcentajeDetraccion ?? 0)}%):`, fmt(factura.montoDetraccion), false, '#e05500');
    }
    // Línea separadora antes del total
    doc.moveTo(colResDerX, y - 2).lineTo(colResDerX + colResDerAncho, y - 2).strokeColor(color).lineWidth(1).stroke();
    filaTotales('TOTAL:', fmt(factura.total), true, color);

    // ── PIE DE PÁGINA / ESPACIO PARA QR ───────────────────────────────────────
    const yPie = 755;
    doc.moveTo(M, yPie).lineTo(M + ANCHO, yPie).strokeColor('#cccccc').lineWidth(0.5).stroke();

    // Espacio para QR (izquierda)
    doc.rect(M, yPie + 4, 60, 60).stroke('#cccccc');
    doc.fillColor('#aaaaaa').font('Helvetica').fontSize(6.5)
      .text('QR / SUNAT', M, yPie + 30, { width: 60, align: 'center' });

    // Texto legal (derecha)
    doc.fillColor('#777777').font('Helvetica').fontSize(7)
      .text(textoLegal || 'Documento emitido electrónicamente', M + 68, yPie + 6, { width: ANCHO - 68, align: 'left' });
    doc.text(pieDePagina || '', M + 68, yPie + 17, { width: ANCHO - 68, align: 'left' });
    doc.fillColor('#aaaaaa').fontSize(6.5)
      .text('Representación impresa de la Factura Electrónica. Autorizado mediante Resolución de Superintendencia Nro. 097-2012/SUNAT.',
        M + 68, yPie + 28, { width: ANCHO - 68 });

    doc.end();
  });

  return rutaRelativa.split(path.sep).join('/');
}
