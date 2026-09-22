-- Rollback 268: quita los RPC y el vínculo kardex → tratamiento, y vuelve
-- el CHECK de outcome al vocabulario de la 242. Antes de correrlo, los
-- tratamientos cerrados con outcome = 'completed' deben pasar a 'other'
-- (si no, el CHECK nuevo falla).

DROP FUNCTION IF EXISTS public.treatment_undo_supply(uuid);
DROP FUNCTION IF EXISTS public.treatment_apply_product(uuid, uuid, numeric, uuid, date, text);

DROP INDEX IF EXISTS idx_inventory_movements_treatment;
-- La columna se deja si hay filas con valor (historial del kardex); si se
-- quiere quitar de verdad: UPDATE está prohibido por el trigger append-only,
-- así que solo es posible en una base sin aplicaciones registradas.
ALTER TABLE inventory_movements DROP COLUMN IF EXISTS treatment_id;

UPDATE treatments SET outcome = 'other' WHERE outcome = 'completed';
ALTER TABLE treatments DROP CONSTRAINT IF EXISTS treatments_outcome_chk;
ALTER TABLE treatments ADD CONSTRAINT treatments_outcome_check
  CHECK (outcome IS NULL OR outcome IN ('pregnancy','no_pregnancy','abandoned','transferred','other'));
