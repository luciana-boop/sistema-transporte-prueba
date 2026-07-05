// FILE: src/modules/pdf/liquidacion-pdf.generator.ts
// Liquidación de gastos de desplazamiento del conductor — no es un
// comprobante SUNAT (sin QR, sin texto legal), pero comparte la identidad
// visual (color de marca) del resto del sistema. Muestra solo las etapas del
// flujo CREADA→PAGADA→RENDIDA→CERRADA que la liquidación ya alcanzó.
// Portado de MONKSAAS (adaptación single-tenant: sin logo ni empresaId).

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  fmtMoneda as fmt, fmtFecha, NEUTRO,
  obtenerDatosEmisor, obtenerParametrosPdf,
  dibujarEncabezado, dibujarPie, dibujarTarjetaInfo, dibujarEncabezadoTabla,
  dibujarFondoFila, dibujarTarjetaTotales, dibujarFirma,
} from './pdf-shared.helper';

const BASE_DIR = path.join('storage', 'documentos', 'liquidacion');

const CATEGORIA_LABEL: Record<string, string> = {
  PEAJE: 'Peaje',
  BALANZA: 'Balanza',
  VIATICO: 'Viático',
  TOLDO: 'Toldo',
  OTROS: 'Otros',
};

export async function generarPdfLiquidacion(liquidacion: any): Promise<string> {
  const [datosEmisor, parametros] = await Promise.all([
    obtenerDatosEmisor(),
    obtenerParametrosPdf(),
  ]);
  const color = parametros.color;

  const numero = `LIQ-${String(liquidacion.id).padStart(5, '0')}`;

  const dirAbs = path.join(process.cwd(), BASE_DIR);
  if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
  const rutaRel = path.join(BASE_DIR, `${liquidacion.id}.pdf`).split(path.sep).join('/');
  const rutaAbs = path.join(process.cwd(), ...rutaRel.split('/'));

  const estadosConPago = ['PAGADA', 'RENDIDA', 'CERRADA'];
  const estadosConRendicion = ['RENDIDA', 'CERRADA'];

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
      titulo: 'LIQUIDACIÓN DE GASTOS DE DESPLAZAMIENTO',
      numero,
      color,
      colorClaro: parametros.colorClaro,
    });

    // ── Conductor / vehículo (tarjeta) + Estado (texto simple) ───────────────
    const col1W = ANCHO * 0.58;
    const col2X = M + col1W + 14;
    const col2W = ANCHO - col1W - 14;
    const altoConductor = 78;

    dibujarTarjetaInfo(doc, M, y, col1W, altoConductor, 'Conductor y vehículo', [
      `Nombre: ${liquidacion.conductor?.nombre ?? '—'}`,
      `Placa tracto: ${liquidacion.placaTracto ?? '—'}`,
      liquidacion.placaCarreta ? `Placa carreta: ${liquidacion.placaCarreta}` : '',
    ], color);

    doc.fillColor(NEUTRO.gris).font('Helvetica-Bold').fontSize(7).text('ESTADO', col2X, y + 4, { characterSpacing: 0.3 });
    doc.fillColor(color).font('Helvetica-Bold').fontSize(10).text(liquidacion.estado, col2X, doc.y + 4, { width: col2W });
    doc.fillColor(NEUTRO.texto).font('Helvetica').fontSize(8.5)
      .text(`Fecha: ${fmtFecha(liquidacion.fecha)}`, col2X, doc.y + 8, { width: col2W });
    if (liquidacion.guiaReferencia) doc.text(`Guía: ${liquidacion.guiaReferencia}`, col2X, doc.y + 3, { width: col2W });

    y += altoConductor + 14;

    // ── Flujo financiero (tarjeta de totales — solo las etapas alcanzadas) ────
    if (y > 660) { doc.addPage(); y = 50; }
    const filasFlujo: Array<{ label: string; valor: string; destacado?: boolean }> = [
      { label: 'Monto entregado', valor: fmt(liquidacion.montoEntregado) },
    ];
    if (estadosConPago.includes(liquidacion.estado)) {
      filasFlujo.push({ label: `Monto pagado (${fmtFecha(liquidacion.fechaPago)})`, valor: fmt(liquidacion.montoPagado ?? liquidacion.montoEntregado) });
    }
    if (estadosConRendicion.includes(liquidacion.estado)) {
      filasFlujo.push({ label: `Total gastos rendidos (${fmtFecha(liquidacion.fechaRendicion)})`, valor: fmt(liquidacion.totalGastos) });
    }
    if (liquidacion.estado === 'CERRADA') {
      if (Number(liquidacion.devolucion) > 0) filasFlujo.push({ label: `Devolución a caja (${fmtFecha(liquidacion.fechaCierre)})`, valor: fmt(liquidacion.devolucion), destacado: true });
      if (Number(liquidacion.reintegro) > 0) filasFlujo.push({ label: `Reintegro al conductor (${fmtFecha(liquidacion.fechaCierre)})`, valor: fmt(liquidacion.reintegro), destacado: true });
    }
    const yTrasFlujo = dibujarTarjetaTotales(doc, M, y, ANCHO, filasFlujo, color);
    y = yTrasFlujo + 16;

    // ── Detalle de gastos por categoría (solo si ya se rindió) ────────────────
    if (estadosConRendicion.includes(liquidacion.estado) && (liquidacion.detalles?.length ?? 0) > 0) {
      if (y > 660) { doc.addPage(); y = 50; }
      const cols = [
        { titulo: 'Categoría',   ancho: 110, align: 'left'  as const },
        { titulo: 'Descripción', ancho: 295, align: 'left'  as const },
        { titulo: 'Monto',       ancho: 100, align: 'right' as const },
      ];
      y = dibujarEncabezadoTabla(doc, M, y, ANCHO, cols, color);

      doc.font('Helvetica').fontSize(8.5);
      liquidacion.detalles.forEach((det: any, idx: number) => {
        const vals = [CATEGORIA_LABEL[det.categoria] ?? det.categoria, det.descripcion ?? '', fmt(det.monto)];
        // Alto de fila dinámico: descripciones largas envuelven en varias
        // líneas — con una altura fija el texto se salía sobre la fila siguiente.
        const alturaFila = Math.max(19, ...vals.map((v, i) => doc.heightOfString(String(v), { width: cols[i].ancho - 16 }) + 9));
        if (y + alturaFila > 750) { doc.addPage(); y = 50; }
        dibujarFondoFila(doc, M, y, ANCHO, alturaFila, idx);
        let x = M;
        vals.forEach((v, idx2) => {
          doc.fillColor(NEUTRO.texto).text(String(v), x + 8, y + 5, { width: cols[idx2].ancho - 16, align: cols[idx2].align });
          x += cols[idx2].ancho;
        });
        doc.moveTo(M, y + alturaFila).lineTo(M + ANCHO, y + alturaFila).strokeColor(NEUTRO.bordeSuave).lineWidth(0.5).stroke();
        y += alturaFila;
      });
      if (liquidacion.toldo && Number(liquidacion.toldo) > 0) {
        doc.fillColor(NEUTRO.textoSuave).font('Helvetica').fontSize(8.5).text(`Toldo: ${fmt(liquidacion.toldo)}`, M, y + 6, { width: ANCHO });
        y = doc.y;
      }
      y += 12;
    }

    // ── Pedidos asociados ──────────────────────────────────────────────────────
    const pedidos = (liquidacion.pedidos ?? []).map((lp: any) => lp.pedido).filter(Boolean);
    if (pedidos.length > 0) {
      if (y > 690) { doc.addPage(); y = 50; }
      doc.fillColor(color).font('Helvetica-Bold').fontSize(7.5).text('PEDIDOS ASOCIADOS', M, y, { characterSpacing: 0.3 });
      doc.fillColor(NEUTRO.textoSuave).font('Helvetica').fontSize(8.5);
      const texto = pedidos.map((p: any) => `#${p.id} ${p.origen} → ${p.destino} (${p.cliente?.razonSocial ?? ''})`).join('   ·   ');
      doc.text(texto, M, doc.y + 4, { width: ANCHO });
      y = doc.y + 14;
    }

    // ── Observaciones ─────────────────────────────────────────────────────────
    if (y > 700) { doc.addPage(); y = 50; }
    doc.fillColor(color).font('Helvetica-Bold').fontSize(7.5).text('OBSERVACIONES', M, y, { characterSpacing: 0.3 });
    doc.fillColor(NEUTRO.textoSuave).font('Helvetica').fontSize(8.5).text(liquidacion.observaciones || '—', M, doc.y + 4, { width: ANCHO });
    y = doc.y + 30;

    // ── Firmas ──────────────────────────────────────────────────────────────────
    if (y > 710) { doc.addPage(); y = 60; }
    const anchoFirma = ANCHO * 0.4;
    dibujarFirma(doc, M, y, anchoFirma, 'Conductor', liquidacion.conductor?.nombre ?? 'Nombre / DNI');
    dibujarFirma(doc, M + ANCHO - anchoFirma, y, anchoFirma, 'Responsable de Caja', 'Nombre / DNI / Fecha');
    y += 34;

    // ── Pie de página (sin texto SUNAT, sin QR) ────────────────────────────────
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
