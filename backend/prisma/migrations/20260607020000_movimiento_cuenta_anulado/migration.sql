-- P7: anulación lógica de movimientos de cuenta (false = activo, true = anulado)
ALTER TABLE "movimientos_cuenta_v2"
  ADD COLUMN IF NOT EXISTS "anulado" BOOLEAN NOT NULL DEFAULT false;
