-- CreateIndex
CREATE INDEX "cajas_usuario_id_idx" ON "cajas"("usuario_id");

-- CreateIndex
CREATE INDEX "cajas_estado_idx" ON "cajas"("estado");

-- CreateIndex
CREATE INDEX "cajas_fecha_idx" ON "cajas"("fecha");

-- CreateIndex
CREATE INDEX "combustible_vehiculo_id_idx" ON "combustible"("vehiculo_id");

-- CreateIndex
CREATE INDEX "combustible_conductor_id_idx" ON "combustible"("conductor_id");

-- CreateIndex
CREATE INDEX "combustible_liquidacion_id_idx" ON "combustible"("liquidacion_id");

-- CreateIndex
CREATE INDEX "combustible_fecha_idx" ON "combustible"("fecha");

-- CreateIndex
CREATE INDEX "facturas_cliente_id_idx" ON "facturas"("cliente_id");

-- CreateIndex
CREATE INDEX "facturas_pedido_id_idx" ON "facturas"("pedido_id");

-- CreateIndex
CREATE INDEX "facturas_estado_idx" ON "facturas"("estado");

-- CreateIndex
CREATE INDEX "facturas_fecha_emision_idx" ON "facturas"("fecha_emision");

-- CreateIndex
CREATE INDEX "facturas_fecha_vencimiento_idx" ON "facturas"("fecha_vencimiento");

-- CreateIndex
CREATE INDEX "guias_cliente_id_idx" ON "guias"("cliente_id");

-- CreateIndex
CREATE INDEX "guias_pedido_id_idx" ON "guias"("pedido_id");

-- CreateIndex
CREATE INDEX "guias_estado_idx" ON "guias"("estado");

-- CreateIndex
CREATE INDEX "guias_anulado_idx" ON "guias"("anulado");

-- CreateIndex
CREATE INDEX "guias_estado_sunat_anulado_idx" ON "guias"("estado_sunat", "anulado");

-- CreateIndex
CREATE INDEX "liquidacion_pedidos_pedido_id_idx" ON "liquidacion_pedidos"("pedido_id");

-- CreateIndex
CREATE INDEX "liquidaciones_conductor_id_idx" ON "liquidaciones"("conductor_id");

-- CreateIndex
CREATE INDEX "liquidaciones_fecha_idx" ON "liquidaciones"("fecha");

-- CreateIndex
CREATE INDEX "liquidaciones_estado_idx" ON "liquidaciones"("estado");

-- CreateIndex
CREATE INDEX "mantenimiento_detalles_vehiculo_id_idx" ON "mantenimiento_detalles"("vehiculo_id");

-- CreateIndex
CREATE INDEX "mantenimiento_detalles_conductor_id_idx" ON "mantenimiento_detalles"("conductor_id");

-- CreateIndex
CREATE INDEX "movimientos_caja_caja_id_idx" ON "movimientos_caja"("caja_id");

-- CreateIndex
CREATE INDEX "movimientos_caja_vehiculo_id_idx" ON "movimientos_caja"("vehiculo_id");

-- CreateIndex
CREATE INDEX "movimientos_caja_tipo_anulado_fecha_idx" ON "movimientos_caja"("tipo", "anulado", "fecha");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_v2_cuenta_id_idx" ON "movimientos_cuenta_v2"("cuenta_id");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_v2_liquidacion_id_idx" ON "movimientos_cuenta_v2"("liquidacion_id");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_v2_moneda_id_idx" ON "movimientos_cuenta_v2"("moneda_id");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_v2_categoria_egreso_idx" ON "movimientos_cuenta_v2"("categoria_egreso");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_v2_categoria_ingreso_idx" ON "movimientos_cuenta_v2"("categoria_ingreso");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_v2_tipo_anulado_fecha_idx" ON "movimientos_cuenta_v2"("tipo", "anulado", "fecha");

-- CreateIndex
CREATE INDEX "pago_v2_aplicaciones_factura_factura_id_idx" ON "pago_v2_aplicaciones_factura"("factura_id");

-- CreateIndex
CREATE INDEX "pagos_v2_factura_id_idx" ON "pagos_v2"("factura_id");

-- CreateIndex
CREATE INDEX "pagos_v2_cliente_id_idx" ON "pagos_v2"("cliente_id");

-- CreateIndex
CREATE INDEX "pagos_v2_fecha_pago_idx" ON "pagos_v2"("fecha_pago");

-- CreateIndex
CREATE INDEX "pagos_v2_moneda_id_idx" ON "pagos_v2"("moneda_id");

-- CreateIndex
CREATE INDEX "pedidos_cliente_id_idx" ON "pedidos"("cliente_id");

-- CreateIndex
CREATE INDEX "pedidos_vehiculo_id_idx" ON "pedidos"("vehiculo_id");

-- CreateIndex
CREATE INDEX "pedidos_estado_idx" ON "pedidos"("estado");

-- CreateIndex
CREATE INDEX "pedidos_fecha_pedido_idx" ON "pedidos"("fecha_pedido");

-- CreateIndex
CREATE INDEX "pedidos_creado_en_idx" ON "pedidos"("creado_en");

