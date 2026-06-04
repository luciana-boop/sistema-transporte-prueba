-- CreateTable
CREATE TABLE "monedas" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "simbolo" TEXT NOT NULL,
    "es_por_defecto" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monedas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_pago" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tipos_pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas_dinero" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo_cuenta" TEXT NOT NULL,
    "moneda_id" INTEGER NOT NULL,
    "saldo_inicial" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "saldo_actual" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descripcion" TEXT,
    "banco" TEXT,
    "numero_cuenta" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuentas_dinero_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos_cuenta_v2" (
    "id" SERIAL NOT NULL,
    "cuenta_id" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda_id" INTEGER NOT NULL,
    "tipo_pago_id" INTEGER,
    "concepto" TEXT NOT NULL,
    "referencia" TEXT,
    "cuenta_destino_id" INTEGER,
    "usuario_id" INTEGER NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_cuenta_v2_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagos_v2" (
    "id" SERIAL NOT NULL,
    "factura_id" INTEGER,
    "cliente_id" INTEGER,
    "usuario_id" INTEGER NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "moneda_id" INTEGER NOT NULL,
    "tipo_pago_id" INTEGER,
    "referencia" TEXT,
    "observaciones" TEXT,
    "fecha_pago" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_v2_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "monedas_codigo_key" ON "monedas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_pago_codigo_key" ON "tipos_pago"("codigo");

-- AddForeignKey
ALTER TABLE "cuentas_dinero" ADD CONSTRAINT "cuentas_dinero_moneda_id_fkey" FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_v2" ADD CONSTRAINT "movimientos_cuenta_v2_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas_dinero"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_v2" ADD CONSTRAINT "movimientos_cuenta_v2_moneda_id_fkey" FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_v2" ADD CONSTRAINT "movimientos_cuenta_v2_tipo_pago_id_fkey" FOREIGN KEY ("tipo_pago_id") REFERENCES "tipos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_v2" ADD CONSTRAINT "movimientos_cuenta_v2_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "cuentas_dinero"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos_cuenta_v2" ADD CONSTRAINT "movimientos_cuenta_v2_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_moneda_id_fkey" FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_tipo_pago_id_fkey" FOREIGN KEY ("tipo_pago_id") REFERENCES "tipos_pago"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagos_v2" ADD CONSTRAINT "pagos_v2_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
