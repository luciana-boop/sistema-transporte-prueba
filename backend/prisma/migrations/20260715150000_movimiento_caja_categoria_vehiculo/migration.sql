-- AlterTable
ALTER TABLE "movimientos_caja" ADD COLUMN     "categoria_egreso" TEXT,
ADD COLUMN     "vehiculo_id" INTEGER;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
