-- Migration: 20260605000000_add_nombre_caja
-- Agrega campo nombre (opcional) al modelo Caja.
-- Las cajas existentes quedan con nombre = NULL y se muestran
-- con el formato fallback "Caja – Usuario – Fecha" en el frontend.

ALTER TABLE "cajas" ADD COLUMN IF NOT EXISTS "nombre" TEXT;
