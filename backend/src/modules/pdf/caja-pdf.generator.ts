// FILE: src/modules/pdf/caja-pdf.generator.ts
// Reporte de Caja Chica — no es un comprobante SUNAT (sin QR, sin texto legal
// de comprobante electrónico), pero comparte la misma identidad visual (color
// de marca) que el resto de documentos. La fila de firmas (Responsable de
// caja / Revisado por / Aprobado por) replica la plantilla clásica de reporte
// de caja chica. Portado de MONKSAAS (adaptación single-tenant: sin logo ni
// empresaId).

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  fmtMoneda as fmt, fmtFecha, montoEnLetras, NEUTRO,
  obtenerDatosEmisor, obtenerParametrosPdf,
  dibujarEncabezado, dibujarPie, dibujarEncabezadoTabla, dibujarFondoFila,
  dibujarTarjetaTotales, dibujarFirma,
} from './pdf-shared.helper';

const BASE_DIR = path.join('storage', 'documentos', 'caja');

export async function generarPdfReporteCaja(caja: any): Promise<string> {
  const [datosEmisor, parametros] = await Promise.all([
    obtenerDatosEmisor(),
    obtenerParametrosPdf(),
  ]);
  const color = parametros.color;

  const nombreLimpio = typeof caja.nombre === 'string' ? caja.nombre.trim() : '';
  const numero = nombreLimpio || `CAJA-${String(caja.id).padStart(5, '0')}`;

  const dirAbs = path.join(process.cwd(), BASE_DIR);
  if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
  const rutaRel = path.join(BASE_DIR, `${caja.id}.pdf`).split(path.sep).join('/');
  const rutaAbs = path.join(process.cwd(), ...rutaRel.split('/'));

  const movimientos = (caja.movimientos ?? []).filter((m: any) => !m.anulado);

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 45 });
    const stream = fs.createWriteStream(rutaAbs);
    doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    doc.on('error', reject);

    const M = 45;
    const ANCHO = 505;

    // ── Encabezado ──────────────────────────────────────────────────────────
    let y = dibujarEncabezado({
      doc, M, ANCHO,
      logoBuffer: null,
      empresaNombre: datosEmisor.razonSocial,
      empresaRuc: datosEmisor.ruc,
      empresaDireccion: datosEmisor.direccion,
      empresaTelefono: datosEmisor.telefono,
      empresaEmail: datosEmisor.email,
      titulo: 'REPORTE DE CAJA CHICA',
      numero,
      color,
      colorClaro: parametros.colorClaro,
    });

    // ── Datos de cabecera (fila de etiquetas con separadores finos) ───────────
    const campos = [
      { label: 'Responsable', valor: caja.usuario?.nombre ?? '—' },
      { label: 'Fecha', valor: fmtFecha(caja.fecha) },
      { label: 'Estado', valor: caja.estado },
      { label: 'Saldo apertura', valor: fmt(caja.saldoApertura) },
    ];
    const anchoCampo = ANCHO / campos.length;
    campos.forEach((c, i) => {
      const cx = M + i * anchoCampo;
      if (i > 0) doc.moveTo(cx, y).lineTo(cx, y + 24).strokeColor(NEUTRO.bordeSuave).lineWidth(0.5).stroke();
      doc.fillColor(NEUTRO.grisClaro).font('Helvetica').fontSize(6.5)
        .text(c.label.toUpperCase(), cx + (i ? 10 : 0), y, { width: anchoCampo - (i ? 16 : 6), characterSpacing: 0.2 });
      doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(8.5)
        .text(String(c.valor), cx + (i ? 10 : 0), y + 9, { width: anchoCampo - (i ? 16 : 6) });
    });
    y += 36;

    // ── Tabla de movimientos ────────────────────────────────────────────────────
    const cols = [
      { titulo: 'Fecha',      ancho: 60,  align: 'left'   as const },
      { titulo: 'Tipo',       ancho: 45,  align: 'center' as const },
      { titulo: 'Concepto',   ancho: 130, align: 'left'   as const },
      { titulo: 'Referencia', ancho: 90,  align: 'left'   as const },
      { titulo: 'Monto',      ancho: 90,  align: 'right'  as const },
      { titulo: 'Saldo',      ancho: 90,  align: 'right'  as const },
    ];
    y = dibujarEncabezadoTabla(doc, M, y, ANCHO, cols, color);

    doc.font('Helvetica').fontSize(8);
    let saldoAcumulado = Number(caja.saldoApertura) || 0;
    movimientos.forEach((mov: any, idx: number) => {
      saldoAcumulado += mov.tipo === 'INGRESO' ? Number(mov.monto) : -Number(mov.monto);
      const vals = [
        fmtFecha(mov.fecha ?? mov.creadoEn),
        mov.tipo === 'INGRESO' ? 'Ingreso' : 'Egreso',
        mov.concepto ?? '',
        mov.referencia ?? '—',
        `${mov.tipo === 'EGRESO' ? '-' : ''}${fmt(mov.monto)}`,
        fmt(saldoAcumulado),
      ];
      // Alto de fila dinámico: conceptos/referencias largos envuelven en varias
      // líneas — con una altura fija de 18px el texto se salía sobre la fila
      // siguiente en vez de expandir la fila que lo contiene.
      const alturaFila = Math.max(18, ...vals.map((v, i) => doc.heightOfString(String(v), { width: cols[i].ancho - 16 }) + 8));
      if (y + alturaFila > 750) { doc.addPage(); y = 50; }
      dibujarFondoFila(doc, M, y, ANCHO, alturaFila, idx);
      let x = M;
      vals.forEach((v, idx2) => {
        doc.fillColor(idx2 === 4 && mov.tipo === 'EGRESO' ? '#b91c1c' : NEUTRO.texto)
          .text(String(v), x + 8, y + 4, { width: cols[idx2].ancho - 16, align: cols[idx2].align });
        x += cols[idx2].ancho;
      });
      doc.moveTo(M, y + alturaFila).lineTo(M + ANCHO, y + alturaFila).strokeColor(NEUTRO.bordeSuave).lineWidth(0.5).stroke();
      y += alturaFila;
    });

    // ── Resumen ─────────────────────────────────────────────────────────────────
    y += 16;
    if (y > 660) { doc.addPage(); y = 50; }
    const totW = ANCHO * 0.42;
    const totX = M + ANCHO - totW;
    const filasResumen = [
      { label: 'Ingresos totales', valor: fmt(caja.ingresosTotales) },
      { label: 'Egresos totales', valor: fmt(caja.egresosTotales) },
      ...(caja.saldoCierre != null ? [{ label: 'Saldo cierre', valor: fmt(caja.saldoCierre) }] : []),
      { label: 'Saldo calculado', valor: fmt(caja.saldoCalculado), destacado: true },
    ];
    const yTrasTarjeta = dibujarTarjetaTotales(doc, totX, y, totW, filasResumen, color);

    if (caja.observaciones) {
      doc.fillColor(color).font('Helvetica-Bold').fontSize(7.5).text('OBSERVACIONES', M, y, { width: ANCHO - totW - 14, characterSpacing: 0.3 });
      doc.fillColor(NEUTRO.textoSuave).font('Helvetica').fontSize(8.5).text(caja.observaciones, M, doc.y + 4, { width: ANCHO - totW - 14 });
    }
    y = Math.max(doc.y, yTrasTarjeta) + 14;

    // SON: monto en letras (sobre el saldo calculado de la caja)
    if (y > 700) { doc.addPage(); y = 50; }
    doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(8)
      .text(`SON: ${montoEnLetras(Number(caja.saldoCalculado ?? 0))}`, M, y, { width: ANCHO });
    y = doc.y + 36;

    // ── Firmas ──────────────────────────────────────────────────────────────────
    if (y > 700) { doc.addPage(); y = 60; }
    const anchoFirma = ANCHO / 3 - 14;
    dibujarFirma(doc, M, y, anchoFirma, 'Responsable de Caja', 'Nombre / DNI / Fecha');
    dibujarFirma(doc, M + ANCHO / 3, y, anchoFirma, 'Revisado por', 'Nombre / DNI / Fecha');
    dibujarFirma(doc, M + (ANCHO / 3) * 2, y, anchoFirma, 'Aprobado por', 'Nombre / DNI / Fecha');
    y += 34;

    // ── Pie de página (sin texto SUNAT, sin QR — no es un comprobante de pago) ──
    const yPie = Math.max(745, y + 16);
    dibujarPie({
      doc, M, ANCHO, y: yPie,
      textoLegal: parametros.textoLegal,
      pieDePagina: parametros.pieDePagina,
      espacioQR: false,
      mostrarTextoSunat: false,
    });

    doc.end();
  });

  return rutaRel;
}
