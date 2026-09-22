-- 266: Almacén — los doctores también crean y actualizan productos
--
-- Caso de la clínica de la Dra. Patricia (21-sep-2026): Verenisse
-- (obstetra, rol `doctor`) no veía el botón "Producto" y, aunque lo viera,
-- la policy de escritura de inventory_products (mig 209) solo dejaba pasar
-- a owner/admin. Las obstetras se encargan de rellenar y actualizar el
-- almacén, así que la regla queda:
--
--   owner / admin / doctor → crear producto, editar sus datos y cambiar el
--                            precio de venta (con motivo, RPC de la 252).
--   owner / admin          → archivar, eliminar y restaurar (mig 264) y
--                            borrar filas: siguen siendo destructivos.
--   recepción              → como hasta hoy: entradas, salidas y lectura.
--
-- Helper nuevo con el mismo patrón endurecido de la 235 (SECURITY DEFINER,
-- search_path fijo, solo miembros activos).

CREATE OR REPLACE FUNCTION public.is_org_inventory_editor(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role IN ('owner', 'admin', 'doctor')
      AND is_active = true
  )
$$;

REVOKE ALL ON FUNCTION public.is_org_inventory_editor(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_inventory_editor(UUID) TO authenticated;

COMMENT ON FUNCTION public.is_org_inventory_editor(UUID) IS
  'true si el usuario actual es owner, admin o doctor activo de la org: puede crear y editar productos del almacén (mig 266).';

-- ── inventory_products: FOR ALL (admin) → INSERT/UPDATE (editor) + DELETE (admin)
DROP POLICY IF EXISTS "Org admins write inventory_products" ON inventory_products;

CREATE POLICY "Org inventory editors insert inventory_products"
  ON inventory_products FOR INSERT TO authenticated
  WITH CHECK (is_org_inventory_editor(organization_id));

CREATE POLICY "Org inventory editors update inventory_products"
  ON inventory_products FOR UPDATE TO authenticated
  USING (is_org_inventory_editor(organization_id))
  WITH CHECK (is_org_inventory_editor(organization_id));

CREATE POLICY "Org admins delete inventory_products"
  ON inventory_products FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

-- ── RPC de precio de venta (mig 252): misma regla que la policy de UPDATE.
CREATE OR REPLACE FUNCTION public.inventory_set_sale_price(
  p_product uuid,
  p_price   numeric,
  p_reason  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org     uuid;
  v_old     numeric(10,2);
  v_history uuid;
BEGIN
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'El precio de venta debe ser un número mayor o igual a 0.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id, sale_price INTO v_org, v_old
    FROM inventory_products
   WHERE id = p_product
   FOR UPDATE;

  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT is_org_inventory_editor(v_org) THEN
    RAISE EXCEPTION 'Cambiar el precio de venta requiere ser doctor o administrador de la clínica.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Sin cambio real no se escribe nada (el trigger tampoco dispararía).
  IF v_old IS NOT DISTINCT FROM p_price THEN
    RETURN NULL;
  END IF;

  UPDATE inventory_products
     SET sale_price = p_price
   WHERE id = p_product;

  -- La fila que acaba de escribir el trigger es la más reciente de este
  -- producto en esta transacción.
  SELECT id INTO v_history
    FROM inventory_price_history
   WHERE product_id = p_product
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_history IS NOT NULL AND NULLIF(btrim(p_reason), '') IS NOT NULL THEN
    UPDATE inventory_price_history
       SET reason = btrim(p_reason)
     WHERE id = v_history;
  END IF;

  RETURN v_history;
END $$;

REVOKE ALL ON FUNCTION public.inventory_set_sale_price(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_set_sale_price(uuid, numeric, text) TO authenticated;

COMMENT ON FUNCTION public.inventory_set_sale_price(uuid, numeric, text) IS
  'Almacén: cambia el precio de venta de un producto (owner/admin/doctor, mig 266) y estampa el motivo en el historial que escribe el trigger de la mig 209. Devuelve el id de la fila de historial, o NULL si el precio no cambió.';
