-- Documento relacionado (catálogo SUNAT 61) para Guía de Remisión Transportista:
-- referencia a la GRE-Remitente del remitente, o al comprobante de pago que
-- sustenta el traslado cuando el remitente no emite GRE-Remitente.
ALTER TABLE "guias" ADD COLUMN     "doc_rel_tipo" TEXT,
ADD COLUMN     "doc_rel_serie" TEXT,
ADD COLUMN     "doc_rel_numero" TEXT,
ADD COLUMN     "doc_rel_ruc_emisor" TEXT;
