-- DropForeignKey
ALTER TABLE "cuentas_contables" DROP CONSTRAINT "cuentas_contables_padre_id_fkey";

-- DropForeignKey
ALTER TABLE "lineas_asiento" DROP CONSTRAINT "lineas_asiento_asiento_id_fkey";

-- DropForeignKey
ALTER TABLE "lineas_asiento" DROP CONSTRAINT "lineas_asiento_cuenta_id_fkey";

-- DropForeignKey
ALTER TABLE "mapeo_contable" DROP CONSTRAINT "mapeo_contable_cuenta_contable_id_fkey";

-- AlterTable
ALTER TABLE "factura_detalles" ALTER COLUMN "codigo" DROP NOT NULL;

-- DropTable
DROP TABLE "asientos_contables";

-- DropTable
DROP TABLE "asientos_pendientes";

-- DropTable
DROP TABLE "configuracion_contable";

-- DropTable
DROP TABLE "cuentas_contables";

-- DropTable
DROP TABLE "lineas_asiento";

-- DropTable
DROP TABLE "mapeo_contable";

