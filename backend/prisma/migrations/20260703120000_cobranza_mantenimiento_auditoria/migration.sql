-- AlterTable
ALTER TABLE "cajas" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "combustible" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "conductores" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "configuracion_alertas" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "configuraciones" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "cuentas_dinero" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "facturas" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "guias" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "liquidaciones" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "monedas" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "movimientos_caja" ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "movimientos_cuenta_v2" ADD COLUMN     "actualizado_en" TIMESTAMP(3),
ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "categoria_ingreso" TEXT,
ADD COLUMN     "creado_por_id" INTEGER,
ADD COLUMN     "nota_ingreso" TEXT;

-- AlterTable
ALTER TABLE "pagos_v2" ADD COLUMN     "actualizado_en" TIMESTAMP(3),
ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "pedidos" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "series_facturacion" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "tablas_maestras" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "tipos_pago" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "tipos_vehiculo_config" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- AlterTable
ALTER TABLE "vehiculos" ADD COLUMN     "actualizado_por_id" INTEGER,
ADD COLUMN     "creado_por_id" INTEGER;

-- CreateTable
CREATE TABLE "pago_v2_aplicaciones_factura" (
    "id" SERIAL NOT NULL,
    "pago_id" INTEGER NOT NULL,
    "factura_id" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por_id" INTEGER,

    CONSTRAINT "pago_v2_aplicaciones_factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mantenimiento_detalles" (
    "id" SERIAL NOT NULL,
    "movimiento_cuenta_id" INTEGER NOT NULL,
    "vehiculo_id" INTEGER NOT NULL,
    "conductor_id" INTEGER,
    "motivo_codigo" TEXT NOT NULL,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_por_id" INTEGER,
    "actualizado_en" TIMESTAMP(3) NOT NULL,
    "actualizado_por_id" INTEGER,

    CONSTRAINT "mantenimiento_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pago_v2_aplicaciones_factura_pago_id_factura_id_key" ON "pago_v2_aplicaciones_factura"("pago_id", "factura_id");

-- CreateIndex
CREATE UNIQUE INDEX "mantenimiento_detalles_movimiento_cuenta_id_key" ON "mantenimiento_detalles"("movimiento_cuenta_id");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedidos" ADD CONSTRAINT "pedidos_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facturas" ADD CONSTRAINT "facturas_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cajas" ADD CONSTRAINT "cajas_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_caja" ADD CONSTRAINT "movimientos_caja_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conductores" ADD CONSTRAINT "conductores_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conductores" ADD CONSTRAINT "conductores_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehiculos" ADD CONSTRAINT "vehiculos_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidaciones" ADD CONSTRAINT "liquidaciones_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combustible" ADD CONSTRAINT "combustible_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "combustible" ADD CONSTRAINT "combustible_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones" ADD CONSTRAINT "configuraciones_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuraciones" ADD CONSTRAINT "configuraciones_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_facturacion" ADD CONSTRAINT "series_facturacion_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "series_facturacion" ADD CONSTRAINT "series_facturacion_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tablas_maestras" ADD CONSTRAINT "tablas_maestras_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tablas_maestras" ADD CONSTRAINT "tablas_maestras_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_alertas" ADD CONSTRAINT "configuracion_alertas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_alertas" ADD CONSTRAINT "configuracion_alertas_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_vehiculo_config" ADD CONSTRAINT "tipos_vehiculo_config_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_vehiculo_config" ADD CONSTRAINT "tipos_vehiculo_config_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monedas" ADD CONSTRAINT "monedas_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monedas" ADD CONSTRAINT "monedas_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_pago" ADD CONSTRAINT "tipos_pago_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tipos_pago" ADD CONSTRAINT "tipos_pago_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_dinero" ADD CONSTRAINT "cuentas_dinero_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas_dinero" ADD CONSTRAINT "cuentas_dinero_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_v2" ADD CONSTRAINT "movimientos_cuenta_v2_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_v2" ADD CONSTRAINT "movimientos_cuenta_v2_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_v2_aplicaciones_factura" ADD CONSTRAINT "pago_v2_aplicaciones_factura_pago_id_fkey" FOREIGN KEY ("pago_id") REFERENCES "pagos_v2"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_v2_aplicaciones_factura" ADD CONSTRAINT "pago_v2_aplicaciones_factura_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_v2_aplicaciones_factura" ADD CONSTRAINT "pago_v2_aplicaciones_factura_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimiento_detalles" ADD CONSTRAINT "mantenimiento_detalles_movimiento_cuenta_id_fkey" FOREIGN KEY ("movimiento_cuenta_id") REFERENCES "movimientos_cuenta_v2"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimiento_detalles" ADD CONSTRAINT "mantenimiento_detalles_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimiento_detalles" ADD CONSTRAINT "mantenimiento_detalles_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "conductores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimiento_detalles" ADD CONSTRAINT "mantenimiento_detalles_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mantenimiento_detalles" ADD CONSTRAINT "mantenimiento_detalles_actualizado_por_id_fkey" FOREIGN KEY ("actualizado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data migration: renombrar categoría de egreso REPUESTOS -> MANTENIMIENTO
UPDATE "movimientos_cuenta_v2" SET "categoria_egreso" = 'MANTENIMIENTO' WHERE "categoria_egreso" = 'REPUESTOS';
