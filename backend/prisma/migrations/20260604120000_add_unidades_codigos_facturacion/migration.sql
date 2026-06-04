-- Migration: 20260604120000_add_unidades_codigos_facturacion
-- Agrega datos iniciales en TablaMaestra para:
--   tipo = 'unidad_medida'   → unidades de medida configurables
--   tipo = 'codigo_factura'  → códigos de facturación con descripción asociada
--
-- El schema NO cambia (TablaMaestra ya existe con los campos necesarios).
-- La columna 'descripcion' de TablaMaestra se usa como descripción asociada al código.

-- ── Unidades de medida ────────────────────────────────────────────────────────
INSERT INTO tablas_maestras (tipo, codigo, nombre, descripcion, activo, orden, creado_en, actualizado_en)
VALUES
  ('unidad_medida', 'UND',   'Unidad',   'Unidad genérica',        true, 1, NOW(), NOW()),
  ('unidad_medida', 'SERV',  'Servicio', 'Servicio prestado',      true, 2, NOW(), NOW()),
  ('unidad_medida', 'VIAJE', 'Viaje',    'Viaje de transporte',    true, 3, NOW(), NOW()),
  ('unidad_medida', 'KG',    'Kilogramo','Peso en kilogramos',     true, 4, NOW(), NOW()),
  ('unidad_medida', 'TON',   'Tonelada', 'Peso en toneladas',      true, 5, NOW(), NOW()),
  ('unidad_medida', 'GLN',   'Galón',    'Volumen en galones',     true, 6, NOW(), NOW())
ON CONFLICT (tipo, codigo) DO NOTHING;

-- ── Códigos de facturación ────────────────────────────────────────────────────
-- El campo 'nombre' almacena el código legible y 'descripcion' la descripción
-- que se autocompleta en el formulario de facturación.
INSERT INTO tablas_maestras (tipo, codigo, nombre, descripcion, activo, orden, creado_en, actualizado_en)
VALUES
  ('codigo_factura', '00001', '00001', 'Servicio de Transporte Nacional', true, 1, NOW(), NOW()),
  ('codigo_factura', '00002', '00002', 'Transporte Local',                true, 2, NOW(), NOW()),
  ('codigo_factura', '00003', '00003', 'Flete Especial',                  true, 3, NOW(), NOW())
ON CONFLICT (tipo, codigo) DO NOTHING;
