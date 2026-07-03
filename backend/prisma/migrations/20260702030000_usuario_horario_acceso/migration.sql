-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "dias_permitidos" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
ADD COLUMN     "hora_fin" TEXT,
ADD COLUMN     "hora_inicio" TEXT,
ADD COLUMN     "restriccion_horario_activa" BOOLEAN NOT NULL DEFAULT false;

