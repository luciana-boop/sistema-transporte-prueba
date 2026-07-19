// FILE: src/lib/sunatCatalogos.ts
// Catálogos SUNAT compartidos entre el formulario de oficina (/guias) y el
// formulario reducido de chofer (/guias-chofer).

// Catálogo SUNAT 20 — Motivo de traslado (completo, Anexo N.°8)
export const MOTIVOS_TRASLADO = [
  { code: '01', label: '01 - Venta' },
  { code: '02', label: '02 - Compra' },
  { code: '03', label: '03 - Venta con entrega a terceros' },
  { code: '04', label: '04 - Traslado entre establecimientos' },
  { code: '05', label: '05 - Consignación' },
  { code: '06', label: '06 - Devolución' },
  { code: '07', label: '07 - Recojo de bienes transformados' },
  { code: '08', label: '08 - Importación' },
  { code: '09', label: '09 - Exportación' },
  { code: '13', label: '13 - Otros' },
  { code: '14', label: '14 - Venta sujeta a confirmación' },
  { code: '17', label: '17 - Traslado de bienes para transformación' },
  { code: '18', label: '18 - Traslado emisor itinerante' },
  { code: '19', label: '19 - Traslado de mercancía extranjera' },
];

// Catálogo SUNAT 61 (subconjunto) — documento relacionado obligatorio en
// guías de tipo Transportista (ver guias.service.ts DOC_RELACIONADO_DESC).
export const DOCUMENTOS_RELACIONADOS = [
  { code: '09', label: '09 - Guía de Remisión Remitente' },
  { code: '01', label: '01 - Factura' },
  { code: '03', label: '03 - Boleta de Venta' },
];
