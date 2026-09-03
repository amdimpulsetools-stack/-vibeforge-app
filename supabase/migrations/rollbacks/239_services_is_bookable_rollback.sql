-- Rollback de la mig 239. Elimina el flag de visibilidad; todos los
-- servicios vuelven a listarse al crear citas (comportamiento previo).
-- Los filtros del cliente usan `is_bookable !== false`, así que sin la
-- columna simplemente no filtran nada.

ALTER TABLE services DROP COLUMN IF EXISTS is_bookable;
