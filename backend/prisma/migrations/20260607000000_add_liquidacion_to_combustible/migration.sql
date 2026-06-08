-- Migration: 20260607000000_add_liquidacion_to_combustible
-- Agrega liquidacion_id a combustible para asociar una carga de combustible
-- a la liquidación del conductor que la generó.
-- Nullable: todos los registros anteriores quedan con NULL.
-- NO modifica ninguna columna existente ni elimina datos.

ALTER TABLE "combustible"
  ADD COLUMN IF NOT EXISTS "liquidacion_id" INTEGER
  REFERENCES "liquidaciones"("id") ON DELETE SET NULL;

-- Índice para búsqueda rápida de cargas de combustible de una liquidación
CREATE INDEX IF NOT EXISTS "combustible_liquidacion_id_idx"
  ON "combustible"("liquidacion_id");
