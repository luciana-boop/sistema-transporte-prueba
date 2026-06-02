-- CreateEnum
CREATE TYPE "TipoVehiculo" AS ENUM ('TRACTO', 'CARRETA');

-- CreateEnum
CREATE TYPE "CategoriaDetalle" AS ENUM ('PEAJE', 'BALANZA', 'VIATICO');

-- CreateTable
CREATE TABLE "conductores" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "licencia" TEXT NOT NULL,
    "vencimiento_licencia" TIMESTAMP(3) NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conductores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehiculos" (
    "id" SERIAL NOT NULL,
    "placa" TEXT NOT NULL,
    "tipo" "TipoVehiculo" NOT NULL,
    "marca" TEXT NOT NULL,
    "modelo" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "soat" TEXT,
    "vencimiento_soat" TIMESTAMP(3),
    "revision_tecnica" TEXT,
    "vencimiento_revision" TIMESTAMP(3),
    "ultimo_mantenimiento" TIMESTAMP(3),
    "proximo_mantenimiento" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'OPERATIVO',
    "observaciones" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehiculos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidaciones" (
    "id" SERIAL NOT NULL,
    "conductor_id" INTEGER NOT NULL,
    "placa_tracto" TEXT NOT NULL,
    "placa_carreta" TEXT,
    "monto_entregado" DECIMAL(10,2) NOT NULL,
    "recibo_anticipo" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "guia_referencia" TEXT,
    "observaciones" TEXT,
    "toldo" DECIMAL(10,2),
    "total_gastos" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "devolucion" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reintegro" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion_detalles" (
    "id" SERIAL NOT NULL,
    "liquidacion_id" INTEGER NOT NULL,
    "categoria" "CategoriaDetalle" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "liquidacion_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "combustible" (
    "id" SERIAL NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "conductor_id" INTEGER,
    "fecha" TIMESTAMP(3) NOT NULL,
    "galones" DECIMAL(10,3) NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "kilometraje" DECIMAL(10,2),
    "grifo" TEXT,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "combustible_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conductores_dni_key" ON "conductores"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "vehiculos_placa_key" ON "vehiculos"("placa");

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "conductores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_detalles" ADD CONSTRAINT "liquidacion_detalles_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "liquidaciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combustible" ADD CONSTRAINT "combustible_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combustible" ADD CONSTRAINT "combustible_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "conductores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
