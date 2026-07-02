-- AlterTable
ALTER TABLE "movimientos_cuenta_v2" ADD COLUMN     "categoria_egreso" TEXT;

-- AlterTable
ALTER TABLE "combustible" ADD COLUMN     "movimiento_cuenta_id" INTEGER;

-- AlterTable
ALTER TABLE "cajas" ADD COLUMN     "movimiento_cuenta_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "cajas_movimiento_cuenta_id_key" ON "cajas"("movimiento_cuenta_id");

-- AddForeignKey
ALTER TABLE "combustible" ADD CONSTRAINT "combustible_movimiento_cuenta_id_fkey" FOREIGN KEY ("movimiento_cuenta_id") REFERENCES "movimientos_cuenta_v2"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_movimiento_cuenta_id_fkey" FOREIGN KEY ("movimiento_cuenta_id") REFERENCES "movimientos_cuenta_v2"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: normalizar los vínculos históricos (creados vía referencia string)
-- para usar las nuevas columnas FK directas, y clasificar retroactivamente
-- esos egresos con su categoría.
UPDATE "combustible" c
SET "movimiento_cuenta_id" = mv.id
FROM "movimientos_cuenta_v2" mv
WHERE mv.referencia = 'COMBUSTIBLE-' || c.id
  AND c."movimiento_cuenta_id" IS NULL;

UPDATE "movimientos_cuenta_v2"
SET "categoria_egreso" = 'COMBUSTIBLE'
WHERE referencia LIKE 'COMBUSTIBLE-%'
  AND tipo = 'EGRESO'
  AND "categoria_egreso" IS NULL;

UPDATE "cajas" ca
SET "movimiento_cuenta_id" = mv.id
FROM "movimientos_cuenta_v2" mv
WHERE mv.referencia = 'APERTURA-CAJA-' || ca.id
  AND ca."movimiento_cuenta_id" IS NULL;

UPDATE "movimientos_cuenta_v2"
SET "categoria_egreso" = 'CAJA_CHICA'
WHERE referencia LIKE 'APERTURA-CAJA-%'
  AND tipo = 'EGRESO'
  AND "categoria_egreso" IS NULL;
