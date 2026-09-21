-- Rollback 265: vuelve a la regla "solo owner/admin escriben productos".
DROP POLICY IF EXISTS "Org inventory editors insert inventory_products" ON inventory_products;
DROP POLICY IF EXISTS "Org inventory editors update inventory_products" ON inventory_products;
DROP POLICY IF EXISTS "Org admins delete inventory_products" ON inventory_products;

CREATE POLICY "Org admins write inventory_products"
  ON inventory_products FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- RPC de precio: volver al gate de la 252 (reaplicar esa migración, que
-- redefine la función con is_org_admin).
DROP FUNCTION IF EXISTS public.is_org_inventory_editor(UUID);
