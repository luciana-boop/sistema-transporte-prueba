-- CreateTable
CREATE TABLE "guias" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "serie" TEXT,
    "pedido_id" INTEGER,
    "factura_id" INTEGER,
    "cliente_id" INTEGER,
    "cliente_nombre" TEXT,
    "cliente_num_doc" TEXT,
    "remitente_id" INTEGER,
    "usuario_id" INTEGER NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado" TEXT NOT NULL DEFAULT 'EMITIDA',
    "tipo_guia" TEXT NOT NULL DEFAULT 'REMITENTE',
    "motivo_traslado" TEXT NOT NULL DEFAULT '01',
    "modalidad_transporte" TEXT NOT NULL DEFAULT '02',
    "fecha_inicio_traslado" TIMESTAMP(3),
    "ubigeo_origen" TEXT,
    "direccion_partida" TEXT,
    "ubigeo_destino" TEXT,
    "direccion_entrega" TEXT,
    "ruc_transportista" TEXT,
    "razon_social_transportista" TEXT,
    "num_registro_mtc" TEXT,
    "placa_transportista" TEXT,
    "conductor_id" INTEGER,
    "vehiculo_id" INTEGER,
    "conductor_nombre" TEXT,
    "conductor_dni" TEXT,
    "conductor_licencia" TEXT,
    "peso_total" DECIMAL(10,2),
    "observaciones" TEXT,
    "estado_sunat" TEXT,
    "motivo_rechazo_sunat" TEXT,
    "ticket_sunat" TEXT,
    "xml_path" TEXT,
    "pdf_path" TEXT,
    "cdr_path" TEXT,
    "hash_xml" TEXT,
    "anulado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guia_detalles" (
    "id" SERIAL NOT NULL,
    "guia_id" INTEGER NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" DECIMAL(12,3) NOT NULL,
    "unidad_medida" TEXT NOT NULL DEFAULT 'NIU',

    CONSTRAINT "guia_detalles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guia_transportistas_adicionales" (
    "id" SERIAL NOT NULL,
    "guia_id" INTEGER NOT NULL,
    "placa" TEXT NOT NULL,
    "num_registro_mtc" TEXT NOT NULL,

    CONSTRAINT "guia_transportistas_adicionales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guias_numero_key" ON "guias"("numero");

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "pedidos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_factura_id_fkey" FOREIGN KEY ("factura_id") REFERENCES "facturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_remitente_id_fkey" FOREIGN KEY ("remitente_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_conductor_id_fkey" FOREIGN KEY ("conductor_id") REFERENCES "conductores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_vehiculo_id_fkey" FOREIGN KEY ("vehiculo_id") REFERENCES "vehiculos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guia_detalles" ADD CONSTRAINT "guia_detalles_guia_id_fkey" FOREIGN KEY ("guia_id") REFERENCES "guias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guia_transportistas_adicionales" ADD CONSTRAINT "guia_transportistas_adicionales_guia_id_fkey" FOREIGN KEY ("guia_id") REFERENCES "guias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

