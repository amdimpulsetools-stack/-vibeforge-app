-- Rollback de la mig 227: elimina el toggle por-org "Recepción puede
-- finalizar consultas". Al desaparecer la columna, el endpoint
-- live-status y el cliente caen en su default (?? true), así que
-- recepción SEGUIRÍA pudiendo finalizar hasta revertir también el
-- código — usar solo si la 227 rompe algo en producción.

ALTER TABLE scheduler_settings
  DROP COLUMN IF EXISTS live_status_reception_can_end;
