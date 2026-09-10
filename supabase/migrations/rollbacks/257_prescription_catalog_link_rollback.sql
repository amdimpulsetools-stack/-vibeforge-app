-- Rollback 257. Se pierde el vínculo receta → catálogo de las recetas emitidas
-- mientras la migración estuvo aplicada, y volver a aplicarla NO lo recupera:
-- las recetas ya guardadas quedarían con medication_catalog_id NULL.
--
-- Lo que NO se pierde: la receta en sí. `medication`, `dosage`,
-- `pharmaceutical_form` y `quantity` son columnas propias y siguen intactas —
-- es lo que se imprime en el papel y lo único que la V1 enseña a recepción.
-- Nada de la V1 depende de esta columna, así que el rollback no apaga ninguna
-- pantalla.

ALTER TABLE prescriptions DROP COLUMN IF EXISTS medication_catalog_id;
