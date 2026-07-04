// FILE: src/modules/pdf/guia-pdf.generator.ts
// Generador dedicado para la Guía de Remisión (Remitente y Transportista),
// portado de MONKSAAS con el mismo formato: varias cajas tituladas
// (Destinatario, Datos del traslado, Punto de partida/llegada, Datos del
// transporte) + tabla de mercancías + observaciones + conformidad + pie con
// espacio para QR SUNAT. Adaptación: el campo "Venta" se reemplaza por
// "Pedido" (este sistema no tiene módulo Ventas).

import fs from 'fs';
import path from 'path';
import PDFDocument from 'pdfkit';
import {
  fmtFecha, NEUTRO,
  obtenerDatosEmisor, obtenerParametrosPdf,
  dibujarEncabezado, dibujarPie, dibujarCajaTitulada, dibujarEncabezadoTabla,
  dibujarFondoFila, dibujarFirma,
} from './pdf-shared.helper';

const BASE_DIR = path.join('storage', 'documentos', 'guia');

const MOTIVOS: Record<string, string> = {
  '01': 'VENTA', '02': 'COMPRA', '04': 'TRASLADO ENTRE ESTABLECIMIENTOS', '08': 'IMPORTACIÓN',
  '09': 'EXPORTACIÓN', '13': 'OTROS', '14': 'VENTA SUJETA A CONFIRMACIÓN', '18': 'TRASLADO EMISOR ITINERANTE',
};

export async function generarPdfGuia(guia: any): Promise<string> {
  const [datosEmisor, parametros] = await Promise.all([
    obtenerDatosEmisor(),
    obtenerParametrosPdf(),
  ]);
  const color = parametros.color;

  const esTransportista = guia.tipoGuia === 'TRANSPORTISTA';
  const titulo = `GUÍA DE REMISIÓN ${esTransportista ? 'TRANSPORTISTA' : 'REMITENTE'} ELECTRÓNICA`;

  const dirAbs = path.join(process.cwd(), BASE_DIR);
  if (!fs.existsSync(dirAbs)) fs.mkdirSync(dirAbs, { recursive: true });
  const safeNumero = String(guia.numero ?? guia.id).replace(/[/\\]/g, '-');
  const filename = `${safeNumero}-${guia.id}.pdf`;
  const rutaRel = path.join(BASE_DIR, filename).split(path.sep).join('/');
  const rutaAbs = path.join(process.cwd(), ...rutaRel.split('/'));

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
      titulo,
      numero: guia.numero ?? '',
      color,
      colorClaro: parametros.colorClaro,
    });
    y += 6;

    const filaTexto = (x: number, yy: number, w: number, label: string, valor: string) => {
      doc.fillColor(NEUTRO.grisClaro).font('Helvetica').fontSize(6.5).text(label.toUpperCase(), x, yy, { width: w, characterSpacing: 0.2 });
      doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(8.5).text(valor || '—', x, doc.y + 2, { width: w });
      return doc.y + 4;
    };

    // Cada "fila" de filaTexto (etiqueta + valor) ocupa ~25px; las cajas con dos
    // filas necesitan reservar espacio para ambas — alturas fijas insuficientes
    // aquí antes provocaban que el contenido se superpusiera con la caja siguiente.
    const ALTO_FILA = 25;
    const ALTO_BARRA = 26; // dibujarCajaTitulada: 20px de barra + 6px de margen

    // ── Caja DESTINATARIO ─────────────────────────────────────────────────────
    const filasDest = guia.direccionEntrega ? 2 : 1;
    const altoDest = ALTO_BARRA + ALTO_FILA * filasDest + 6;
    const yDestContenido = dibujarCajaTitulada(doc, M, y, ANCHO, altoDest, 'DESTINATARIO', color);
    const col2 = M + ANCHO / 2;
    filaTexto(M + 8, yDestContenido, ANCHO / 2 - 16, 'Razón Social', guia.cliente?.razonSocial ?? guia.clienteNombre ?? '—');
    doc.fillColor(NEUTRO.grisClaro).font('Helvetica').fontSize(6.5).text('RUC / DNI', col2, yDestContenido, { width: ANCHO / 2 - 16, characterSpacing: 0.2 });
    doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(8.5).text(guia.cliente?.ruc ?? guia.clienteNumDoc ?? '—', col2, doc.y + 2, { width: ANCHO / 2 - 16 });
    if (guia.direccionEntrega) {
      filaTexto(M + 8, yDestContenido + ALTO_FILA, ANCHO - 16, 'Dirección de entrega', guia.direccionEntrega);
    }
    y = y + altoDest + 6;

    // ── Caja REMITENTE (solo Transportista, ya que ni emisor ni destinatario emiten la guía) ──
    if (esTransportista) {
      const altoRem = ALTO_BARRA + ALTO_FILA * 2;
      const yRemContenido = dibujarCajaTitulada(doc, M, y, ANCHO, altoRem, 'REMITENTE', color);
      filaTexto(M + 8, yRemContenido, ANCHO / 2 - 16, 'Razón Social', guia.remitente?.razonSocial ?? '—');
      doc.fillColor(NEUTRO.grisClaro).font('Helvetica').fontSize(6.5).text('RUC', col2, yRemContenido, { width: ANCHO / 2 - 16, characterSpacing: 0.2 });
      doc.fillColor(NEUTRO.texto).font('Helvetica-Bold').fontSize(8.5).text(guia.remitente?.ruc ?? '—', col2, doc.y + 2, { width: ANCHO / 2 - 16 });
      const docRelTxt = guia.docRelTipo
        ? `${guia.docRelTipo} - ${[guia.docRelSerie, guia.docRelNumero].filter(Boolean).join('-')} (RUC ${guia.docRelRucEmisor ?? '—'})`
        : '—';
      filaTexto(M + 8, yRemContenido + ALTO_FILA, ANCHO - 16, 'Documento relacionado', docRelTxt);
      y = y + altoRem + 6;
    }

    // ── Caja DATOS DEL TRASLADO ───────────────────────────────────────────────
    const yTrasladoH = ALTO_BARRA + ALTO_FILA * 2;
    const yTrasladoContenido = dibujarCajaTitulada(doc, M, y, ANCHO, yTrasladoH, 'DATOS DEL TRASLADO', color);
    const motivoCod = guia.motivoTraslado ?? '01';
    const cuartoAncho = ANCHO / 4 - 12;
    filaTexto(M + 8, yTrasladoContenido, cuartoAncho, 'Fecha emisión', fmtFecha(guia.fechaEmision));
    filaTexto(M + 8 + ANCHO / 4, yTrasladoContenido, cuartoAncho, 'Inicio traslado', fmtFecha(guia.fechaInicioTraslado));
    filaTexto(M + 8 + ANCHO / 2, yTrasladoContenido, cuartoAncho, 'Motivo', `${motivoCod} - ${MOTIVOS[motivoCod] ?? motivoCod}`);
    filaTexto(M + 8 + ANCHO * 0.75, yTrasladoContenido, cuartoAncho, 'Modalidad', guia.modalidadTransporte === '01' ? '01 - PÚBLICO' : '02 - PRIVADO');
    filaTexto(M + 8, yTrasladoContenido + ALTO_FILA, cuartoAncho, 'Peso bruto total', guia.pesoTotal ? `${Number(guia.pesoTotal).toFixed(2)} kg` : '—');
    filaTexto(M + 8 + ANCHO / 4, yTrasladoContenido + ALTO_FILA, cuartoAncho, 'Pedido', guia.pedido ? `${guia.pedido.origen} → ${guia.pedido.destino}` : '—');
    filaTexto(M + 8 + ANCHO / 2, yTrasladoContenido + ALTO_FILA, cuartoAncho, 'Factura', guia.factura?.numeroFactura ?? '—');
    y = y + yTrasladoH + 6;

    // ── Caja DATOS DEL PUNTO DE PARTIDA Y LLEGADA ────────────────────────────
    const yPuntosH = ALTO_BARRA + ALTO_FILA;
    const yPuntosContenido = dibujarCajaTitulada(doc, M, y, ANCHO, yPuntosH, 'DATOS DEL PUNTO DE PARTIDA Y LLEGADA', color);
    filaTexto(M + 8, yPuntosContenido, ANCHO / 2 - 16, 'Punto de partida', [guia.ubigeoOrigen, guia.direccionPartida].filter(Boolean).join(' - ') || '—');
    filaTexto(col2, yPuntosContenido, ANCHO / 2 - 16, 'Punto de llegada', [guia.ubigeoDestino, guia.direccionEntrega].filter(Boolean).join(' - ') || '—');
    y = y + yPuntosH + 6;

    // ── Caja DATOS DEL TRANSPORTE ─────────────────────────────────────────────
    const esPublico = guia.modalidadTransporte === '01';
    const filasTransp = esPublico
      ? ((guia.transportistasAdicionales?.length ?? 0) > 0 ? 2 : 1.5)
      : (guia.vehiculoCarreta ? 3 : 2);
    const yTranspH = ALTO_BARRA + ALTO_FILA * filasTransp;
    const yTranspContenido = dibujarCajaTitulada(doc, M, y, ANCHO, yTranspH, 'DATOS DEL TRANSPORTE', color);
    if (esPublico) {
      filaTexto(M + 8, yTranspContenido, ANCHO / 2 - 16, 'Transportista', guia.razonSocialTransportista ?? guia.remitente?.razonSocial ?? '—');
      filaTexto(col2, yTranspContenido, ANCHO / 2 - 16, 'RUC / Reg. MTC', `${guia.rucTransportista ?? '—'} / ${guia.numRegistroMTC ?? '—'}`);
      filaTexto(M + 8, yTranspContenido + ALTO_FILA, ANCHO / 2 - 16, 'Placa', guia.placaTransportista ?? '—');
      if ((guia.transportistasAdicionales?.length ?? 0) > 0) {
        const extra = guia.transportistasAdicionales.map((t: any) => `${t.placa} (MTC ${t.numRegistroMTC})`).join(', ');
        filaTexto(col2, yTranspContenido + ALTO_FILA, ANCHO / 2 - 16, 'Placas adicionales', extra);
      }
    } else {
      const conductorNombre = guia.conductor?.nombre ?? guia.conductorNombre ?? '—';
      const conductorDni = guia.conductor?.dni ?? guia.conductorDni ?? '—';
      const conductorLicencia = guia.conductor?.licencia ?? guia.conductorLicencia ?? '—';
      const vehiculoTxt = guia.vehiculo ? `${guia.vehiculo.placa} ${guia.vehiculo.marca ?? ''} ${guia.vehiculo.modelo ?? ''}`.trim() : (guia.placaTransportista ?? '—');
      filaTexto(M + 8, yTranspContenido, ANCHO / 2 - 16, 'Conductor (DNI)', `${conductorNombre} (${conductorDni})`);
      filaTexto(col2, yTranspContenido, ANCHO / 2 - 16, 'Licencia', conductorLicencia);
      filaTexto(M + 8, yTranspContenido + ALTO_FILA, ANCHO / 2 - 16, 'Vehículo (tracto)', vehiculoTxt);
      if (guia.vehiculoCarreta) {
        const carretaTxt = `${guia.vehiculoCarreta.placa} ${guia.vehiculoCarreta.marca ?? ''} ${guia.vehiculoCarreta.modelo ?? ''}`.trim();
        filaTexto(M + 8, yTranspContenido + ALTO_FILA * 2, ANCHO / 2 - 16, 'Carreta', carretaTxt);
      }
    }
    y = y + yTranspH + 10;

    // ── Tabla ITEM / CANTIDAD / DESCRIPCIÓN ──────────────────────────────────
    if (y > 650) { doc.addPage(); y = 50; }
    const cols = [
      { titulo: 'ITEM',        ancho: 40,  align: 'center' as const },
      { titulo: 'CANTIDAD',    ancho: 90,  align: 'center' as const },
      { titulo: 'DESCRIPCIÓN', ancho: 375, align: 'left'   as const },
    ];
    y = dibujarEncabezadoTabla(doc, M, y, ANCHO, cols, color);

    doc.font('Helvetica').fontSize(8.5);
    (guia.detalles ?? []).forEach((d: any, idx: number) => {
      const alturaFila = 19;
      if (y + alturaFila > 750) { doc.addPage(); y = 50; }
      dibujarFondoFila(doc, M, y, ANCHO, alturaFila, idx);
      let x = M;
      const vals = [String(idx + 1), `${Number(d.cantidad).toFixed(2)} ${d.unidadMedida || 'NIU'}`, d.descripcion ?? ''];
      vals.forEach((v, i) => {
        doc.fillColor(NEUTRO.texto).text(v, x + 8, y + 5, { width: cols[i].ancho - 16, align: cols[i].align });
        x += cols[i].ancho;
      });
      doc.moveTo(M, y + alturaFila).lineTo(M + ANCHO, y + alturaFila).strokeColor(NEUTRO.bordeSuave).lineWidth(0.5).stroke();
      y += alturaFila;
    });
    y += 14;

    // ── Observaciones ─────────────────────────────────────────────────────────
    if (y > 700) { doc.addPage(); y = 50; }
    doc.fillColor(color).font('Helvetica-Bold').fontSize(7.5).text('OBSERVACIONES', M, y, { characterSpacing: 0.3 });
    doc.fillColor(NEUTRO.textoSuave).font('Helvetica').fontSize(8.5).text(guia.observaciones || '—', M, doc.y + 4, { width: ANCHO });
    y = doc.y + 24;

    // ── Conformidad del cliente ────────────────────────────────────────────────
    if (y > 715) { doc.addPage(); y = 50; }
    dibujarFirma(doc, M + ANCHO / 2 - 100, y, 200, 'Conformidad del Cliente');

    // ── Pie de página / espacio QR ────────────────────────────────────────────
    const yPie = Math.max(755, y + 40);
    dibujarPie({
      doc, M, ANCHO, y: yPie,
      textoLegal: parametros.textoLegal,
      pieDePagina: 'Representación impresa de la Guía de Remisión Electrónica.',
      espacioQR: true,
      mostrarTextoSunat: true,
      color,
    });

    doc.end();
  });

  return rutaRel;
}
