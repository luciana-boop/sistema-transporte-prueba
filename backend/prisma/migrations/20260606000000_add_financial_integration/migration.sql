-- Migration: 20260606000000_add_financial_integration
-- Agrega movimiento_cuenta_id a MovimientoCaja para vincular
-- los movimientos de caja con los movimientos de cuenta.
-- También agrega columna pagado_en en liquidaciones para auditoría.
-- NO modifica ninguna columna existente ni elimina datos.

-- Vincular MovimientoCaja con MovimientoCuentaV2
-- Permite trazar el movimiento de caja con el movimiento de cuenta asociado.
-- Nullable: movimientos anteriores y manuales sin cuenta quedan con NULL.
ALTER TABLE "movimientos_caja"
  ADD COLUMN IF NOT EXISTS "movimiento_cuenta_id" INTEGER
  REFERENCES "movimientos_cuenta_v2"("id") ON DELETE SET NULL;

-- Agregar liquidacion_id a MovimientoCuentaV2
-- Permite vincular un egreso de cuenta directamente a su liquidación.
-- Nullable: todos los movimientos anteriores quedan con NULL.
ALTER TABLE "movimientos_cuenta_v2"
  ADD COLUMN IF NOT EXISTS "liquidacion_id" INTEGER
  REFERENCES "liquidaciones"("id") ON DELETE SET NULL;

-- Índice para búsqueda rápida de movimientos de una liquidación
CREATE INDEX IF NOT EXISTS "movimientos_cuenta_v2_liquidacion_id_idx"
  ON "movimientos_cuenta_v2"("liquidacion_id");

-- Índice para búsqueda de movimientos de caja por movimiento de cuenta
CREATE INDEX IF NOT EXISTS "movimientos_caja_movimiento_cuenta_id_idx"
  ON "movimientos_caja"("movimiento_cuenta_id");
