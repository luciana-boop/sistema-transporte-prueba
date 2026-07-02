-- AlterTable
ALTER TABLE "cajas" ADD COLUMN     "movimiento_cierre_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "cajas_movimiento_cierre_id_key" ON "cajas"("movimiento_cierre_id");

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_movimiento_cierre_id_fkey" FOREIGN KEY ("movimiento_cierre_id") REFERENCES "movimientos_cuenta_v2"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: vincular las devoluciones de saldo históricas (identificadas hasta
-- ahora por referencia = 'CIERRE-CAJA-{id}') a la nueva FK directa.
UPDATE "cajas" ca
SET "movimiento_cierre_id" = mv.id
FROM "movimientos_cuenta_v2" mv
WHERE mv.referencia = 'CIERRE-CAJA-' || ca.id
  AND ca."movimiento_cierre_id" IS NULL;
