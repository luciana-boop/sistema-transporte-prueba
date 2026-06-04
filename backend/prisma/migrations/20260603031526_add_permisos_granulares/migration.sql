-- CreateTable
CREATE TABLE "permisos_modulos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "modulo_key" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permisos_modulos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos_acciones" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "accion_key" TEXT NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permisos_acciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permisos_modulos_usuario_id_modulo_key_key" ON "permisos_modulos"("usuario_id", "modulo_key");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_acciones_usuario_id_accion_key_key" ON "permisos_acciones"("usuario_id", "accion_key");

-- AddForeignKey
ALTER TABLE "permisos_modulos" ADD CONSTRAINT "permisos_modulos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permisos_acciones" ADD CONSTRAINT "permisos_acciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
