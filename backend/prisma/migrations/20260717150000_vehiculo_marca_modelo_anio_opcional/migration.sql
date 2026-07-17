-- Marca, modelo y año dejan de ser obligatorios al crear un vehículo.
ALTER TABLE "vehiculos" ALTER COLUMN "marca" DROP NOT NULL,
ALTER COLUMN "modelo" DROP NOT NULL,
ALTER COLUMN "anio" DROP NOT NULL;
