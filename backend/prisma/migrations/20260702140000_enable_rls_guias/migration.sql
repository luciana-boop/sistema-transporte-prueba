-- Habilita RLS en las tablas del módulo Guías, creadas después de la
-- migración 20260611014500_enable_rls y por eso quedaron sin protección.
-- Mismo patrón: sin políticas — el rol de Prisma (postgres) bypassea RLS
-- (rolbypassrls = true), así que el backend sigue funcionando sin cambios;
-- RLS sin políticas deniega por defecto a los roles que no bypassean RLS
-- (anon, authenticated de PostgREST), cerrando el acceso directo vía la
-- API de Supabase.

ALTER TABLE "guias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guia_detalles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "guia_transportistas_adicionales" ENABLE ROW LEVEL SECURITY;
