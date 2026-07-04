// FILE: src/lib/sunatCatalogos.ts
// Catálogos SUNAT compartidos entre el formulario de oficina (/guias) y el
// formulario reducido de chofer (/guias-chofer).

// Catálogo SUNAT 20 — Motivo de traslado
export const MOTIVOS_TRASLADO = [
  { code: '01', label: '01 - Venta' },
  { code: '02', label: '02 - Compra' },
  { code: '04', label: '04 - Traslado entre establecimientos' },
  { code: '08', label: '08 - Importación' },
  { code: '09', label: '09 - Exportación' },
  { code: '13', label: '13 - Otros' },
  { code: '14', label: '14 - Venta sujeta a confirmación' },
  { code: '18', label: '18 - Traslado emisor itinerante' },
];

// Catálogo SUNAT 61 (subconjunto) — documento relacionado obligatorio en
// guías de tipo Transportista (ver guias.service.ts DOC_RELACIONADO_DESC).
export const DOCUMENTOS_RELACIONADOS = [
  { code: '09', label: '09 - Guía de Remisión Remitente' },
  { code: '01', label: '01 - Factura' },
  { code: '03', label: '03 - Boleta de Venta' },
];
