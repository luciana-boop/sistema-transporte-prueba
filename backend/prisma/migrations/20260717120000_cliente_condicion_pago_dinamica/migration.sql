-- Cliente.condicion_pago deja de ser un enum fijo (CONTADO/CREDITO_15/30/60)
-- y pasa a ser texto libre: 'CONTADO' o el código de un registro activo de
-- TablaMaestra tipo='tipo_credito' (Configuración → Tablas Maestras). Esto
-- permite agregar nuevos plazos de crédito (p. ej. 7 días) sin migración.
--
-- Se traducen los valores existentes del enum viejo al nuevo formato de
-- código (días) en el mismo paso, para no perder los datos ya cargados.

ALTER TABLE "clientes" ALTER COLUMN "condicion_pago" DROP DEFAULT;

ALTER TABLE "clientes"
  ALTER COLUMN "condicion_pago" TYPE TEXT
  USING (
    CASE "condicion_pago"::text
      WHEN 'CREDITO_15' THEN '15'
      WHEN 'CREDITO_30' THEN '30'
      WHEN 'CREDITO_60' THEN '60'
      ELSE "condicion_pago"::text
    END
  );

ALTER TABLE "clientes" ALTER COLUMN "condicion_pago" SET DEFAULT 'CONTADO';

DROP TYPE "CondicionPago";
