-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "vehiculo_id" INTEGER;

-- CreateTable
CREATE TABLE "clientes_contactos" (
    "id" SERIAL NOT NULL,
    "cliente_id" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_contactos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clientes_contactos" ADD CONSTRAINT "clientes_contactos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
