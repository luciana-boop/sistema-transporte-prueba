-- Agrega "cuenta_origen_id" a las cajas: cuenta de dinero de la que se retiran
-- los fondos de apertura (la apertura genera un movimiento de salida automático
-- en esa cuenta). Nullable solo por compatibilidad con cajas históricas.
ALTER TABLE "cajas" ADD COLUMN "cuenta_origen_id" INTEGER;

ALTER TABLE "cajas" ADD CONSTRAINT "cajas_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "cuentas_dinero"("id") ON DELETE SET NULL ON UPDATE CASCADE;
