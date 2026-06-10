-- Migration: Agregar tabla factura_detalles
-- Permite múltiples líneas de detalle por factura (cantidad, unidad, código, descripción, valor unitario, importe)
-- Los campos existentes (subtotal, igv, total, detraccion) se mantienen intactos.

CREATE TABLE "factura_detalles" (
    "id"              SERIAL PRIMARY KEY,
    "factura_id"      INTEGER NOT NULL,
    "orden"           INTEGER NOT NULL DEFAULT 0,
    "cantidad"        DECIMAL(10, 3) NOT NULL DEFAULT 1,
    "unidad_medida"   VARCHAR(20) NOT NULL DEFAULT 'NIU',
    "codigo"          VARCHAR(50) NOT NULL,
    "descripcion"     TEXT NOT NULL,
    "valor_unitario"  DECIMAL(10, 2) NOT NULL,
    "importe"         DECIMAL(10, 2) NOT NULL,
    "creado_en"       TIMESTAMP NOT NULL DEFAULT NOW(),

    CONSTRAINT "factura_detalles_factura_id_fkey"
        FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE CASCADE
);

CREATE INDEX "factura_detalles_factura_id_idx" ON "factura_detalles"("factura_id");

-- Agregar campo fecha_emision editable si no existe (ya existe con @default(now()) pero sin restricción de NULL)
-- No se modifica ya que el campo fecha_emision ya existe en facturas.

-- Insertar datos de TablaMaestra para unidades de medida y códigos de facturación
-- Unidades de medida SUNAT
INSERT INTO "tablas_maestras" ("tipo", "codigo", "nombre", "descripcion", "orden", "activo", "creado_en", "actualizado_en")
VALUES
  ('unidad_medida', 'NIU',  'Unidad',     'Unidad genérica (SUNAT: NIU)',  1, true, NOW(), NOW()),
  ('unidad_medida', 'ZZ',   'Servicio',   'Servicio (SUNAT: ZZ)',          2, true, NOW(), NOW()),
  ('unidad_medida', 'KGM',  'Kilogramo',  'Kilogramo (SUNAT: KGM)',        3, true, NOW(), NOW()),
  ('unidad_medida', 'TNE',  'Tonelada',   'Tonelada métrica (SUNAT: TNE)', 4, true, NOW(), NOW()),
  ('unidad_medida', 'MTR',  'Metro',      'Metro (SUNAT: MTR)',            5, true, NOW(), NOW()),
  ('unidad_medida', 'LTR',  'Litro',      'Litro (SUNAT: LTR)',           6, true, NOW(), NOW()),
  ('unidad_medida', 'GLI',  'Galón',      'Galón imperial (SUNAT: GLI)',   7, true, NOW(), NOW()),
  ('unidad_medida', 'HUR',  'Hora',       'Hora (SUNAT: HUR)',             8, true, NOW(), NOW()),
  ('unidad_medida', 'DAY',  'Día',        'Día (SUNAT: DAY)',              9, true, NOW(), NOW()),
  ('unidad_medida', 'MON',  'Mes',        'Mes (SUNAT: MON)',             10, true, NOW(), NOW())
ON CONFLICT ("tipo", "codigo") DO NOTHING;

-- Códigos de facturación (servicios de transporte)
INSERT INTO "tablas_maestras" ("tipo", "codigo", "nombre", "descripcion", "orden", "activo", "creado_en", "actualizado_en")
VALUES
  ('codigo_factura', '00001', 'Servicio de Transporte Nacional',   'Flete nacional de mercadería', 1, true, NOW(), NOW()),
  ('codigo_factura', '00002', 'Transporte Local',                  'Servicio de transporte local',  2, true, NOW(), NOW()),
  ('codigo_factura', '00003', 'Flete Especial',                    'Transporte de carga especial',  3, true, NOW(), NOW()),
  ('codigo_factura', '00004', 'Servicio de Estiba y Desestiba',    'Mano de obra de carga',         4, true, NOW(), NOW()),
  ('codigo_factura', '00005', 'Almacenamiento',                    'Almacenaje de mercadería',      5, true, NOW(), NOW()),
  ('codigo_factura', '00006', 'Seguro de Carga',                   'Prima de seguro de transporte', 6, true, NOW(), NOW()),
  ('codigo_factura', '00007', 'Peaje y Derechos de Tránsito',      'Peajes varios',                7, true, NOW(), NOW()),
  ('codigo_factura', '00008', 'Manipuleo de Carga',                'Servicios de manipuleo',        8, true, NOW(), NOW())
ON CONFLICT ("tipo", "codigo") DO NOTHING;
