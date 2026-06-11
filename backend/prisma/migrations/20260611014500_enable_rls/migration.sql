-- FASE 4: Activar Row Level Security en todas las tablas de public.
-- El rol de Prisma (postgres) tiene rolbypassrls = true, por lo que el
-- backend sigue funcionando sin cambios. Sin políticas, RLS deniega por
-- defecto a roles que no bypassean RLS (anon, authenticated de PostgREST),
-- cerrando el acceso directo vía la API de Supabase.

ALTER TABLE "_prisma_migrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "usuarios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pedidos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "facturas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "factura_detalles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pagos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pagos_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cajas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimientos_caja" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "movimientos_cuenta_v2" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gastos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "log_actividad" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "conductores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "vehiculos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "liquidaciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "liquidacion_detalles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "liquidacion_pedidos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "combustible" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "configuraciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "series_facturacion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categorias_gasto" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tablas_maestras" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "configuracion_alertas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tipos_vehiculo_config" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permisos_modulos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "permisos_acciones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "monedas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tipos_pago" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cuentas_dinero" ENABLE ROW LEVEL SECURITY;
