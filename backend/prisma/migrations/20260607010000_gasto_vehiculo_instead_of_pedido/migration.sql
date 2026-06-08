-- Migration: 20260607010000_gasto_vehiculo_instead_of_pedido
-- P5: el gasto ahora se asocia opcionalmente a un vehículo en lugar de un pedido.
-- Se elimina la columna pedido_id (con su FK) y se agrega vehiculo_id (con FK a vehiculos).

ALTER TABLE "gastos" DROP CONSTRAINT IF EXISTS "gastos_pedido_id_fkey";
DROP INDEX IF EXISTS "gastos_pedido_id_idx";
ALTER TABLE "gastos" DROP COLUMN IF EXISTS "pedido_id";

ALTER TABLE "gastos"
  ADD COLUMN IF NOT EXISTS "vehiculo_id" INTEGER
  REFERENCES "vehiculos"("id") ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS "gastos_vehiculo_id_idx"
  ON "gastos"("vehiculo_id");
