/*
  Warnings:

  - The values [PENDIENTE,EN_RUTA,ENTREGADO,FACTURADO] on the enum `EstadoPedido` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `fecha_entrega` on the `pedidos` table. All the data in the column will be lost.
  - You are about to drop the column `peso_carga` on the `pedidos` table. All the data in the column will be lost.
  - Added the required column `correlativo` to the `facturas` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CategoriaDetalle" ADD VALUE 'TOLDO';
ALTER TYPE "CategoriaDetalle" ADD VALUE 'OTROS';

-- AlterEnum
ALTER TYPE "EstadoFactura" ADD VALUE 'PARCIAL';

-- AlterEnum
BEGIN;
CREATE TYPE "EstadoPedido_new" AS ENUM ('ACTIVO', 'ANULADO');
ALTER TABLE "pedidos" ALTER COLUMN "estado" DROP DEFAULT;
ALTER TABLE "pedidos" ALTER COLUMN "estado" TYPE "EstadoPedido_new" USING ("estado"::text::"EstadoPedido_new");
ALTER TYPE "EstadoPedido" RENAME TO "EstadoPedido_old";
ALTER TYPE "EstadoPedido_new" RENAME TO "EstadoPedido";
DROP TYPE "EstadoPedido_old";
ALTER TABLE "pedidos" ALTER COLUMN "estado" SET DEFAULT 'ACTIVO';
COMMIT;

-- AlterTable
ALTER TABLE "conductores" ADD COLUMN     "carreta_preferencia" TEXT,
ADD COLUMN     "tracto_preferencia" TEXT;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "cdr_path" TEXT,
ADD COLUMN     "correlativo" INTEGER NOT NULL,
ADD COLUMN     "detalle" TEXT,
ADD COLUMN     "detraccion" DECIMAL(10,2),
ADD COLUMN     "dias_credito" INTEGER,
ADD COLUMN     "estado_sunat" TEXT,
ADD COLUMN     "guia_referencia" TEXT,
ADD COLUMN     "hash_xml" TEXT,
ADD COLUMN     "monto_detraccion" DECIMAL(10,2),
ADD COLUMN     "pdf_path" TEXT,
ADD COLUMN     "porcentaje_detraccion" DECIMAL(5,2),
ADD COLUMN     "serie" TEXT NOT NULL DEFAULT 'F001',
ADD COLUMN     "tipo_credito" TEXT,
ADD COLUMN     "total_pagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "xml_path" TEXT;

-- AlterTable
ALTER TABLE "pedidos" DROP COLUMN "fecha_entrega",
DROP COLUMN "peso_carga",
ALTER COLUMN "estado" SET DEFAULT 'ACTIVO';

-- CreateTable
CREATE TABLE "configuraciones" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'texto',
    "categoria" TEXT NOT NULL DEFAULT 'general',
    "etiqueta" TEXT NOT NULL,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuraciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "series_facturacion" (
    "id" SERIAL NOT NULL,
    "serie" TEXT NOT NULL,
    "tipo_documento" TEXT NOT NULL DEFAULT 'FACTURA',
    "correlativo_actual" INTEGER NOT NULL DEFAULT 1,
    "correlativo_inicial" INTEGER NOT NULL DEFAULT 1,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "series_facturacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categorias_gasto" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "es_default" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categorias_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tablas_maestras" (
    "id" SERIAL NOT NULL,
    "tipo" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "extra" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tablas_maestras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_alertas" (
    "id" SERIAL NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "dias_anticipacion" INTEGER NOT NULL DEFAULT 30,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT NOT NULL DEFAULT 'yellow',
    "nivel" TEXT NOT NULL DEFAULT 'warning',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_alertas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_vehiculo_config" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_vehiculo_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "configuraciones_clave_key" ON "configuraciones"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "series_facturacion_serie_key" ON "series_facturacion"("serie");

-- CreateIndex
CREATE UNIQUE INDEX "categorias_gasto_codigo_key" ON "categorias_gasto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tablas_maestras_tipo_codigo_key" ON "tablas_maestras"("tipo", "codigo");

-- CreateIndex
CREATE UNIQUE INDEX "configuracion_alertas_clave_key" ON "configuracion_alertas"("clave");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_vehiculo_config_codigo_key" ON "tipos_vehiculo_config"("codigo");
