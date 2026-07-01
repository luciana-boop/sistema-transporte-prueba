-- DropForeignKey
ALTER TABLE "gastos" DROP CONSTRAINT "gastos_usuario_id_fkey";

-- DropForeignKey
ALTER TABLE "gastos" DROP CONSTRAINT "gastos_vehiculo_id_fkey";

-- DropForeignKey
ALTER TABLE "movimientos_caja" DROP CONSTRAINT "movimientos_caja_pago_id_fkey";

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_cliente_id_fkey";

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_factura_id_fkey";

-- DropForeignKey
ALTER TABLE "pagos" DROP CONSTRAINT "pagos_usuario_id_fkey";

-- AlterTable
ALTER TABLE "movimientos_cuenta_v2" ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "pagos_v2" ADD COLUMN     "anulado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "anulado_en" TIMESTAMP(3),
ADD COLUMN     "motivo_anulacion" TEXT,
ADD COLUMN     "movimiento_cuenta_id" INTEGER;

-- DropTable
DROP TABLE "categorias_gasto";

-- DropTable
DROP TABLE "gastos";

-- DropTable
DROP TABLE "pagos";

-- DropEnum
DROP TYPE "MetodoPago";

-- DropEnum
DROP TYPE "TipoGasto";

-- CreateIndex
CREATE UNIQUE INDEX "pagos_v2_movimiento_cuenta_id_key" ON "pagos_v2"("movimiento_cuenta_id");

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_movimiento_cuenta_id_fkey" FOREIGN KEY ("movimiento_cuenta_id") REFERENCES "movimientos_cuenta_v2"("id") ON DELETE SET NULL ON UPDATE CASCADE;

