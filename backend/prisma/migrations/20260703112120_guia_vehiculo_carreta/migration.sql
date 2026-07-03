-- AlterTable
ALTER TABLE "guias" ADD COLUMN     "vehiculo_carreta_id" INTEGER;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_vehiculo_carreta_id_fkey" FOREIGN KEY ("vehiculo_carreta_id") REFERENCES "vehiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

