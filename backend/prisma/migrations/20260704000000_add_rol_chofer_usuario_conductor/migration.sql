-- AlterEnum
ALTER TYPE "Rol" ADD VALUE 'CHOFER';

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "conductor_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_conductor_id_key" ON "usuarios"("conductor_id");

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "conductores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

