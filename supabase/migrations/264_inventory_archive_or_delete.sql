-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 264: Almacén — archivar un producto (o eliminarlo si está virgen)
--
-- Caso real (sep-2026): "Pergoveris 75 UI" quedó creado por la carga masiva
-- sin un solo movimiento y no había forma de sacarlo de la lista desde la
-- app; hubo que borrarlo por SQL. Lo contrario también dolía: un producto
-- que ya rotó y se dejó de vender sigue en la tabla para siempre.
--
-- Decisión del founder (no reabrir):
--   · Un producto CON historial (movimientos, lotes, ventas del POS
--     `pharmacy_sale_items`, comprobantes `einvoice_line_items`) NUNCA se
--     borra: se archiva con la baja lógica que ya existe desde la mig 209
--     (`is_discontinued` + `discontinued_at/by/reason`, CHECK que exige
--     motivo). No se añade `is_active` ni `archived_at`.
--   · Un producto SIN nada de eso se elimina de verdad, dejando auditoría
--     (`inventory_product_deletions`, snapshot completo de la fila).
--   · Archivar NO desvincula el catálogo de medicamentos
--     (`medication_catalog.inventory_product_id`): el vínculo es historia y
--     al restaurar vuelve todo. El chip "Farmacia" se oculta en la UI
--     mientras el producto esté archivado.
--
-- Qué cambia:
--   1. Tabla `inventory_product_deletions` (auditoría del hard delete). RLS:
--      lee owner/admin de la org; NO hay policies de escritura: solo escribe
--      el RPC (SECURITY DEFINER).
--   2. RPC `inventory_archive_or_delete_product(p_product_id, p_reason)`:
--      gateado con is_org_admin (mig 235) → 42501. Cuenta movimientos,
--      lotes, ventas y comprobantes; todo en 0 → auditoría + DELETE
--      (`{action:'deleted'}`); si no → archiva (`{action:'archived', …}`).
--      Motivo obligatorio (≥ 3 caracteres) SOLO al archivar. Si el trigger
--      de la mig 212 bloquea por stock ≠ 0, devuelve un check_violation
--      legible ("Tiene N unidades en stock…"). El FOR UPDATE sobre el
--      producto bloquea, mientras dura la transacción, cualquier INSERT de
--      movimiento que lo referencie (FK → KEY SHARE), así el conteo y el
--      DELETE no pueden cruzarse con una venta.
--   3. RPC `inventory_restore_product(p_product_id)`: vuelve a activo y
--      limpia los campos de baja. Si choca con el índice único parcial de
--      nombre por org (mig 209: se pudo crear otro con el mismo nombre
--      mientras este estaba archivado) → unique_violation legible.
--
-- Lo que NO se toca: las FKs (movimientos y lotes RESTRICT + trigger
-- append-only de la 209; ventas RESTRICT; comprobantes y catálogo SET NULL),
-- la policy "Org admins write inventory_products" FOR ALL, ni el POS
-- (`farmacia/page.tsx` ya excluye `is_discontinued`).
--
-- Verificación:
--   SELECT to_regclass('public.inventory_product_deletions');          → no NULL
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('inventory_archive_or_delete_product','inventory_restore_product'); → 2 filas
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Auditoría del hard delete ────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_product_deletions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Sin FK a propósito: el producto ya no existe cuando se escribe la fila.
  product_id      uuid NOT NULL,
  name            text NOT NULL,
  -- to_jsonb(producto) + price_history + medication_catalog_ids (ver RPC).
  snapshot        jsonb NOT NULL,
  deleted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_deletions_org
  ON inventory_product_deletions (organization_id, deleted_at DESC);

COMMENT ON TABLE inventory_product_deletions IS
  'Almacén (mig 264): auditoría de productos ELIMINADOS de verdad (solo los que no tenían movimientos, lotes, ventas ni comprobantes). Los que sí tienen historial se archivan (is_discontinued) y nunca pasan por aquí. Escribe solo inventory_archive_or_delete_product.';

ALTER TABLE inventory_product_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org admins read inventory_product_deletions" ON inventory_product_deletions;
CREATE POLICY "Org admins read inventory_product_deletions"
  ON inventory_product_deletions FOR SELECT TO authenticated
  USING (is_org_admin(organization_id));
-- (sin policies de INSERT/UPDATE/DELETE: solo escribe el RPC)

-- ── 2. Archivar o eliminar ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventory_archive_or_delete_product(
  p_product_id uuid,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prod      inventory_products%ROWTYPE;
  v_reason    text := NULLIF(btrim(coalesce(p_reason, '')), '');
  v_movements int;
  v_lots      int;
  v_sales     int;
  v_invoices  int;
  v_stock     numeric;
  v_snapshot  jsonb;
BEGIN
  -- FOR UPDATE: además de serializar dos archivados simultáneos, bloquea
  -- los INSERT en tablas que referencian al producto (la FK toma KEY SHARE
  -- sobre esta fila) hasta que termine la transacción.
  SELECT * INTO v_prod
    FROM inventory_products
   WHERE id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT is_org_admin(v_prod.organization_id) THEN
    RAISE EXCEPTION 'Archivar o eliminar un producto requiere permiso de administrador.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_prod.is_discontinued THEN
    RAISE EXCEPTION 'El producto "%" ya está archivado.', v_prod.name
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_movements FROM inventory_movements  WHERE product_id = p_product_id;
  SELECT count(*) INTO v_lots      FROM inventory_lots       WHERE product_id = p_product_id;
  SELECT count(*) INTO v_sales     FROM pharmacy_sale_items  WHERE product_id = p_product_id;
  SELECT count(*) INTO v_invoices  FROM einvoice_line_items  WHERE product_id = p_product_id;

  -- ── Virgen: se elimina de verdad, con auditoría ──
  IF v_movements = 0 AND v_lots = 0 AND v_sales = 0 AND v_invoices = 0 THEN
    v_snapshot := to_jsonb(v_prod)
      || jsonb_build_object(
           'price_history', COALESCE((
             SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at)
               FROM inventory_price_history h
              WHERE h.product_id = p_product_id
           ), '[]'::jsonb),
           -- El SET NULL de la FK deja al catálogo sin vínculo: se anota
           -- qué ítems lo tenían para poder reconstruirlo a mano.
           'medication_catalog_ids', COALESCE((
             SELECT jsonb_agg(c.id)
               FROM medication_catalog c
              WHERE c.inventory_product_id = p_product_id
           ), '[]'::jsonb),
           'delete_reason', v_reason
         );

    INSERT INTO inventory_product_deletions
      (organization_id, product_id, name, snapshot, deleted_by)
    VALUES
      (v_prod.organization_id, v_prod.id, v_prod.name, v_snapshot, auth.uid());

    -- inventory_price_history cae en cascada; medication_catalog queda con
    -- inventory_product_id = NULL (FK SET NULL, mig 248).
    DELETE FROM inventory_products WHERE id = p_product_id;

    RETURN jsonb_build_object(
      'action',     'deleted',
      'product_id', v_prod.id,
      'name',       v_prod.name
    );
  END IF;

  -- ── Con historial: se archiva ──
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo para archivar (mínimo 3 caracteres).'
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    UPDATE inventory_products
       SET is_discontinued     = true,
           discontinued_at     = now(),
           discontinued_by     = auth.uid(),
           discontinued_reason = v_reason
     WHERE id = p_product_id;
  EXCEPTION WHEN check_violation THEN
    -- El trigger de la mig 212 no deja descontinuar con unidades en stock
    -- (quedarían huérfanas del control de vencimientos). Mensaje legible
    -- con el saldo real; cualquier otro check_violation se re-lanza.
    SELECT COALESCE(sum(quantity), 0) INTO v_stock
      FROM inventory_movements
     WHERE product_id = p_product_id;
    IF v_stock <> 0 THEN
      RAISE EXCEPTION 'Tiene % unidades en stock: registra una salida o un ajuste a 0 antes de archivar.',
        rtrim(rtrim(to_char(v_stock, 'FM9999999990.999'), '0'), '.')
        USING ERRCODE = 'check_violation';
    END IF;
    RAISE;
  END;

  RETURN jsonb_build_object(
    'action',          'archived',
    'product_id',      v_prod.id,
    'name',            v_prod.name,
    'discontinued_at', now(),
    'movements',       v_movements,
    'lots',            v_lots,
    'sales',           v_sales,
    'invoices',        v_invoices
  );
END $$;

REVOKE ALL ON FUNCTION public.inventory_archive_or_delete_product(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_archive_or_delete_product(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.inventory_archive_or_delete_product(uuid, text) IS
  'Almacén (mig 264): owner/admin. Sin movimientos, lotes, ventas ni comprobantes → auditoría en inventory_product_deletions + DELETE ({action:deleted}). Con historial → is_discontinued=true con motivo obligatorio ({action:archived, movements, lots, sales, invoices}). Stock ≠ 0 → check_violation legible (trigger mig 212).';

-- ── 3. Restaurar ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventory_restore_product(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prod inventory_products%ROWTYPE;
BEGIN
  SELECT * INTO v_prod
    FROM inventory_products
   WHERE id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT is_org_admin(v_prod.organization_id) THEN
    RAISE EXCEPTION 'Restaurar un producto requiere permiso de administrador.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT v_prod.is_discontinued THEN
    RAISE EXCEPTION 'El producto "%" no está archivado.', v_prod.name
      USING ERRCODE = 'check_violation';
  END IF;

  BEGIN
    UPDATE inventory_products
       SET is_discontinued     = false,
           discontinued_at     = NULL,
           discontinued_by     = NULL,
           discontinued_reason = NULL
     WHERE id = p_product_id;
  EXCEPTION WHEN unique_violation THEN
    -- idx_inventory_products_org_name es parcial (WHERE is_discontinued =
    -- false): mientras este estaba archivado pudo crearse otro activo con
    -- el mismo nombre.
    RAISE EXCEPTION 'Ya existe otro producto activo con ese nombre; renómbralo antes de restaurar.'
      USING ERRCODE = 'unique_violation';
  END;

  RETURN jsonb_build_object(
    'action',     'restored',
    'product_id', v_prod.id,
    'name',       v_prod.name
  );
END $$;

REVOKE ALL ON FUNCTION public.inventory_restore_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_restore_product(uuid) TO authenticated;

COMMENT ON FUNCTION public.inventory_restore_product(uuid) IS
  'Almacén (mig 264): owner/admin. Vuelve a activo un producto archivado y limpia discontinued_*. Nombre activo duplicado → unique_violation legible.';
