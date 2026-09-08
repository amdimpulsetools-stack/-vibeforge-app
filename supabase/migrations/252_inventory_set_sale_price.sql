-- 252: Almacén — cambiar el precio de venta de un producto con motivo
--
-- Caso de la clínica de Patricia (7-sep-2026): el laboratorio sube la lista
-- y todavía queda stock. Hoy el precio de venta solo se puede cambiar al
-- registrar una entrada (campo opcional del modal de lote), así que había
-- que inventar una entrada para subir el precio. Y el motivo del cambio no
-- tenía dónde guardarse: el trigger de la mig 209 escribe el historial
-- (old/new/quién/cuándo) pero deja `reason` en NULL, y la tabla no tiene
-- policy de UPDATE para completarlo desde el cliente.
--
-- Este RPC hace las dos cosas en una sola transacción:
--   1. Actualiza inventory_products.sale_price (el trigger escribe la fila
--      del historial, como siempre).
--   2. Estampa el motivo en ESA fila recién creada.
--
-- Solo owner/admin (misma regla que la policy de UPDATE de productos). El
-- costo de compra NO se toca aquí, a propósito: el kardex es append-only y
-- el costo de un lote que ya está en almacén es un hecho, no un ajuste.

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

  IF NOT is_org_admin(v_org) THEN
    RAISE EXCEPTION 'Cambiar el precio de venta requiere permiso de administrador.'
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
  'Almacén: cambia el precio de venta de un producto (owner/admin) y estampa el motivo en el historial que escribe el trigger de la mig 209. Devuelve el id de la fila de historial, o NULL si el precio no cambió.';
