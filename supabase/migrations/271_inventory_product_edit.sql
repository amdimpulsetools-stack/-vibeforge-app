-- Aplicada en producción el 25-sep-2026 (apply_migration; verificada: RPC,
-- tabla con RLS, trigger de auditoría y GRANT solo a authenticated).
--
-- ═══════════════════════════════════════════════════════════════════
-- 271: Almacén — editar un producto (nombre, categoría, presentación,
--      stock mínimo y control de lotes) con historial
--
-- Pedido (25-sep-2026): "se añade un producto y a los días nos damos
-- cuenta [del error en el nombre], y ahora es imposible cambiarlo". No era
-- la base (la policy de UPDATE de la 266 ya lo permite): no existía
-- pantalla de edición, solo "Nuevo producto". Además había un callejón sin
-- salida: restaurar un archivado cuyo nombre ya usa un activo responde
-- "renómbralo antes de restaurar" (mig 264), y no había dónde renombrar.
-- Y "control de lotes" (track_lots) solo se elegía al crear: la clínica no
-- podía encenderlo después para que el POS y los tratamientos descuenten
-- del lote.
--
-- Por qué es seguro renombrar: lo EMITIDO guarda su propia copia del
-- nombre y no cambia (pharmacy_sale_items.description de ventas
-- confirmadas, einvoice_line_items.description — SUNAT —, recetas). Lo
-- VIVO (lista, kardex, POS, tratamientos, rentabilidad) hace join y
-- muestra el nombre nuevo. Aquí se actualizan además dos copias que SÍ
-- deben seguir al producto:
--   · líneas de carritos en 'borrador' (aún no son venta);
--   · la fila del catálogo de recetas importada de este producto
--     (medication_catalog.inventory_product_id) mientras conserve el
--     nombre original (si la médica la renombró a mano, se respeta).
--
-- Fuera a propósito:
--   · afectación IGV: Rentabilidad netea TODAS las ventas pasadas con la
--     afectación vigente; cambiarla reescribiría márgenes históricos.
--   · unidad base: todo el kardex está expresado en ella.
--   · precio de venta: ya tiene su RPC con historial (mig 252).
--
-- Qué cambia:
--   1. `inventory_product_changes`: auditoría append-only (campo, de → a,
--      motivo, quién, cuándo). Lectura: miembros; escribe solo el trigger.
--   2. Trigger AFTER UPDATE en inventory_products que registra cambios de
--      name/category/presentation/min_stock/track_lots venga de donde
--      venga el UPDATE (RPC, PostgREST directo de un editor, SQL). El
--      motivo viaja por set_config desde el RPC.
--   3. RPC `inventory_update_product`: editor de almacén (mig 267);
--      un ARCHIVADO solo lo edita owner/admin (mismo gate que restaurar).
--      Nombre sin espacios dobles, 1–120; no puede chocar con otro
--      producto ACTIVO (el índice único de la 209 ignora mayúsculas y
--      espacios externos; aquí el mensaje es legible).
--
-- Aditiva e idempotente. Rollback: rollbacks/271_inventory_product_edit_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Auditoría ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_product_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES inventory_products(id) ON DELETE CASCADE,
  field           text NOT NULL CHECK (field IN
                    ('name', 'category', 'presentation', 'min_stock', 'track_lots')),
  old_value       text,
  new_value       text,
  reason          text,
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_product_changes_product
  ON inventory_product_changes (product_id, changed_at DESC);

ALTER TABLE inventory_product_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read inventory_product_changes" ON inventory_product_changes;
CREATE POLICY "Org members read inventory_product_changes"
  ON inventory_product_changes FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));
-- (sin policies de INSERT/UPDATE/DELETE: solo escribe el trigger)

COMMENT ON TABLE inventory_product_changes IS
  'Almacén (mig 271): historial de ediciones de producto (nombre, categoría, presentación, stock mínimo, control de lotes). Append-only; lo llena el trigger inventory_products_audit sea cual sea el camino del UPDATE.';

-- ── 2. Auditoría automática ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION inventory_products_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text := NULLIF(btrim(COALESCE(current_setting('yenda.product_change_reason', true), '')), '');
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name THEN
    INSERT INTO inventory_product_changes (organization_id, product_id, field, old_value, new_value, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, 'name', OLD.name, NEW.name, v_reason, auth.uid());
  END IF;
  IF NEW.category IS DISTINCT FROM OLD.category THEN
    INSERT INTO inventory_product_changes (organization_id, product_id, field, old_value, new_value, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, 'category', OLD.category, NEW.category, v_reason, auth.uid());
  END IF;
  IF NEW.presentation IS DISTINCT FROM OLD.presentation THEN
    INSERT INTO inventory_product_changes (organization_id, product_id, field, old_value, new_value, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, 'presentation', OLD.presentation, NEW.presentation, v_reason, auth.uid());
  END IF;
  IF NEW.min_stock IS DISTINCT FROM OLD.min_stock THEN
    INSERT INTO inventory_product_changes (organization_id, product_id, field, old_value, new_value, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, 'min_stock', OLD.min_stock::text, NEW.min_stock::text, v_reason, auth.uid());
  END IF;
  IF NEW.track_lots IS DISTINCT FROM OLD.track_lots THEN
    INSERT INTO inventory_product_changes (organization_id, product_id, field, old_value, new_value, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, 'track_lots', OLD.track_lots::text, NEW.track_lots::text, v_reason, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION inventory_products_audit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inventory_products_audit ON inventory_products;
CREATE TRIGGER trg_inventory_products_audit
  AFTER UPDATE ON inventory_products
  FOR EACH ROW EXECUTE FUNCTION inventory_products_audit();

-- ── 3. RPC de edición ────────────────────────────────────────────────
-- Recibe los valores NUEVOS completos (el modal manda el formulario
-- entero): p_category NULL/'' = sin categoría.
CREATE OR REPLACE FUNCTION public.inventory_update_product(
  p_product_id   uuid,
  p_name         text,
  p_category     text,
  p_presentation text,
  p_min_stock    numeric,
  p_track_lots   boolean,
  p_reason       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prod     inventory_products%ROWTYPE;
  v_old_name text;
  v_name     text := regexp_replace(btrim(COALESCE(p_name, '')), '\s+', ' ', 'g');
  v_category text := NULLIF(regexp_replace(btrim(COALESCE(p_category, '')), '\s+', ' ', 'g'), '');
  v_pres     text := regexp_replace(btrim(COALESCE(p_presentation, '')), '\s+', ' ', 'g');
  v_min      numeric := COALESCE(p_min_stock, 0);
  v_reason   text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_prod FROM inventory_products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND OR v_prod.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT is_org_inventory_editor(v_prod.organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Archivado: solo owner/admin (los mismos que pueden restaurarlo).
  IF v_prod.is_discontinued AND NOT is_org_admin(v_prod.organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'El nombre no puede quedar vacío.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'El nombre es demasiado largo (máximo 120).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_category IS NOT NULL AND length(v_category) > 60 THEN
    RAISE EXCEPTION 'La categoría es demasiado larga (máximo 60).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_pres = '' THEN
    v_pres := 'UND';
  END IF;
  IF length(v_pres) > 40 THEN
    RAISE EXCEPTION 'La presentación es demasiado larga (máximo 40).' USING ERRCODE = 'check_violation';
  END IF;
  IF v_min < 0 THEN
    RAISE EXCEPTION 'El stock mínimo no puede ser negativo.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_track_lots IS NULL THEN
    RAISE EXCEPTION 'Indica si el producto controla lotes.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_name = v_prod.name
     AND v_category IS NOT DISTINCT FROM v_prod.category
     AND v_pres = v_prod.presentation
     AND v_min = v_prod.min_stock
     AND p_track_lots = v_prod.track_lots THEN
    RAISE EXCEPTION 'No hay cambios que guardar.' USING ERRCODE = 'check_violation';
  END IF;

  -- Mismo criterio que el índice único de la 209 (upper + btrim), contra
  -- los ACTIVOS: aplica también al renombrar un archivado, porque es lo que
  -- después le permitirá restaurarse.
  IF upper(v_name) <> upper(btrim(v_prod.name)) AND EXISTS (
    SELECT 1 FROM inventory_products
     WHERE organization_id = v_prod.organization_id
       AND id <> v_prod.id
       AND is_discontinued = false
       AND upper(btrim(name)) = upper(v_name)
  ) THEN
    RAISE EXCEPTION 'Ya existe otro producto activo llamado "%".', v_name
      USING ERRCODE = 'unique_violation';
  END IF;

  -- El trigger de auditoría lee el motivo de aquí (solo esta transacción).
  PERFORM set_config('yenda.product_change_reason', COALESCE(v_reason, ''), true);

  v_old_name := v_prod.name;

  UPDATE inventory_products
     SET name = v_name,
         category = v_category,
         presentation = v_pres,
         min_stock = v_min,
         track_lots = p_track_lots
   WHERE id = v_prod.id
  RETURNING * INTO v_prod;

  IF v_name <> v_old_name THEN
    -- Carritos abiertos: todavía no son venta, deben imprimir el nombre
    -- nuevo. Las ventas confirmadas/anuladas conservan el suyo.
    UPDATE pharmacy_sale_items i
       SET description = v_name
      FROM pharmacy_sales s
     WHERE s.id = i.sale_id
       AND s.status = 'borrador'
       AND i.product_id = v_prod.id
       AND i.description = v_old_name;

    -- Catálogo de recetas importado de este producto, solo si conserva el
    -- nombre original. Si choca con otro medicamento del catálogo (mismo
    -- nombre + concentración), se deja como está: la receta no se rompe.
    BEGIN
      UPDATE medication_catalog
         SET name = v_name
       WHERE organization_id = v_prod.organization_id
         AND inventory_product_id = v_prod.id
         AND lower(btrim(name)) = lower(btrim(v_old_name));
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END IF;

  RETURN to_jsonb(v_prod);
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_update_product(uuid, text, text, text, numeric, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_update_product(uuid, text, text, text, numeric, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.inventory_update_product(uuid, text, text, text, numeric, boolean, text) IS
  'Mig 271: edita nombre, categoría, presentación, stock mínimo y control de lotes de un producto. Editor de almacén (archivados: owner/admin). Nombre único entre activos. Actualiza carritos en borrador y la fila importada del catálogo de recetas; nunca ventas confirmadas, comprobantes ni recetas. Historial en inventory_product_changes vía trigger.';
