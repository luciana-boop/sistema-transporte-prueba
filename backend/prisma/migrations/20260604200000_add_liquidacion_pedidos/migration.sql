-- Migration: 20260604200000_add_liquidacion_pedidos
-- Crea la tabla liquidacion_pedidos que relaciona Liquidacion con Pedido (N:M explícita).
-- Un pedido solo puede pertenecer a UNA liquidación (validación adicional en el service).

CREATE TABLE "liquidacion_pedidos" (
    "id"             SERIAL PRIMARY KEY,
    "liquidacion_id" INTEGER NOT NULL,
    "pedido_id"      INTEGER NOT NULL,
    "creado_en"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidacion_pedidos_liquidacion_id_fkey"
        FOREIGN KEY ("liquidacion_id") REFERENCES "liquidaciones"("id") ON DELETE CASCADE,

    CONSTRAINT "liquidacion_pedidos_pedido_id_fkey"
        FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id"),

    -- No se puede agregar el mismo pedido dos veces a la misma liquidación
    CONSTRAINT "liquidacion_pedidos_liquidacion_id_pedido_id_key"
        UNIQUE ("liquidacion_id", "pedido_id")
);

-- Índices para búsquedas frecuentes
CREATE INDEX "liquidacion_pedidos_liquidacion_id_idx" ON "liquidacion_pedidos"("liquidacion_id");
CREATE INDEX "liquidacion_pedidos_pedido_id_idx"      ON "liquidacion_pedidos"("pedido_id");
