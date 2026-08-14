-- Rollback de 212_inventory_invariants_f2.sql
--
-- Quita las dos invariantes de inventario. No toca datos: ambas son
-- restricciones, así que revertirlas solo vuelve a permitir las escrituras
-- que bloqueaban.

DROP TRIGGER IF EXISTS trg_inventory_block_discontinue_with_stock ON inventory_products;
DROP FUNCTION IF EXISTS inventory_block_discontinue_with_stock();

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_positive_adjustment_needs_cost;
