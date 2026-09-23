-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- ═══════════════════════════════════════════════════════════════════
-- 269: Almacén — corregir el código y el vencimiento de un lote
--
-- Pedido del founder (23-sep-2026): un lote cargado con la fecha de
-- vencimiento equivocada no se podía corregir desde la app. La base ya lo
-- permitía a owner/admin (policy "Org admins update inventory_lots", mig
-- 209), pero ninguna pantalla lo ofrecía: la ventana de lotes es de solo
-- lectura y la fecha solo se escribe al crear el lote.
--
-- Por qué es seguro: el vencimiento y el código NO entran en ninguna
-- cuenta. Stock = SUM(movements.quantity) y el costo va congelado en cada
-- movimiento; corregir estos dos campos no mueve stock, CPP, rentabilidad
-- ni ventas. Solo afectan a Vencimientos, las alertas y el orden FEFO.
--
-- Por qué se audita: un vencimiento es un dato sanitario. "Alargar" un lote
-- vencido tiene que dejar rastro de quién, cuándo, de qué a qué y por qué.
--
-- Qué cambia:
--   1. `inventory_lot_changes`: auditoría append-only (sin policies de
--      escritura; la llena solo el trigger). Lectura: miembros de la org.
--   2. Trigger BEFORE UPDATE en inventory_lots: prohíbe mover un lote de
--      producto o de organización (rompería el saldo de ambos productos).
--   3. Trigger AFTER UPDATE: registra cada cambio de lot_code y
--      expiry_date, venga de donde venga (RPC, PostgREST directo de un
--      admin, SQL). El motivo viaja por `set_config` desde el RPC.
--   4. RPC `inventory_update_lot(p_lot_id, p_lot_code, p_expiry_date,
--      p_reason)`: editor de almacén (mig 267: owner/admin o miembro con
--      can_manage_inventory). Motivo obligatorio (≥ 3 caracteres). Código
--      único por producto (mensaje legible). Recibe los valores NUEVOS
--      completos: p_expiry_date NULL = "sin vencimiento".
--   El costo del lote NO es editable: el costo real vive en los
--   movimientos (unit_cost congelado) y cambiarlo aquí confundiría más de
--   lo que arregla.
--
-- Aditiva e idempotente. Rollback: rollbacks/269_inventory_lot_corrections_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Auditoría ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_lot_changes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lot_id          uuid NOT NULL REFERENCES inventory_lots(id) ON DELETE CASCADE,
  field           text NOT NULL CHECK (field IN ('lot_code', 'expiry_date')),
  old_value       text,
  new_value       text,
  reason          text,
  changed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_lot_changes_lot
  ON inventory_lot_changes (lot_id, changed_at DESC);

ALTER TABLE inventory_lot_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read inventory_lot_changes" ON inventory_lot_changes;
CREATE POLICY "Org members read inventory_lot_changes"
  ON inventory_lot_changes FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));
-- (sin policies de INSERT/UPDATE/DELETE: solo escribe el trigger)

COMMENT ON TABLE inventory_lot_changes IS
  'Almacén (mig 269): historial de correcciones de código y vencimiento de lotes. Append-only; lo llena el trigger inventory_lots_audit sea cual sea el camino del UPDATE.';

-- ── 2. Guardas: un lote no cambia de producto ni de organización ────
CREATE OR REPLACE FUNCTION inventory_lots_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'Un lote no puede cambiar de producto ni de organización.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_lots_guard ON inventory_lots;
CREATE TRIGGER trg_inventory_lots_guard
  BEFORE UPDATE ON inventory_lots
  FOR EACH ROW EXECUTE FUNCTION inventory_lots_guard();

-- ── 3. Auditoría automática ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION inventory_lots_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reason text := NULLIF(btrim(COALESCE(current_setting('yenda.lot_change_reason', true), '')), '');
BEGIN
  IF NEW.lot_code IS DISTINCT FROM OLD.lot_code THEN
    INSERT INTO inventory_lot_changes (organization_id, lot_id, field, old_value, new_value, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, 'lot_code', OLD.lot_code, NEW.lot_code, v_reason, auth.uid());
  END IF;
  IF NEW.expiry_date IS DISTINCT FROM OLD.expiry_date THEN
    INSERT INTO inventory_lot_changes (organization_id, lot_id, field, old_value, new_value, reason, changed_by)
    VALUES (NEW.organization_id, NEW.id, 'expiry_date', OLD.expiry_date::text, NEW.expiry_date::text, v_reason, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_lots_audit ON inventory_lots;
CREATE TRIGGER trg_inventory_lots_audit
  AFTER UPDATE ON inventory_lots
  FOR EACH ROW EXECUTE FUNCTION inventory_lots_audit();

-- ── 4. RPC de corrección ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inventory_update_lot(
  p_lot_id      uuid,
  p_lot_code    text,
  p_expiry_date date,
  p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot    inventory_lots%ROWTYPE;
  v_code   text := btrim(COALESCE(p_lot_code, ''));
  v_reason text := btrim(COALESCE(p_reason, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_lot FROM inventory_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND OR v_lot.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'Lote no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT is_org_inventory_editor(v_lot.organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_code = '' THEN
    RAISE EXCEPTION 'El código de lote no puede quedar vacío.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_code) > 60 THEN
    RAISE EXCEPTION 'El código de lote es demasiado largo (máximo 60).' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Escribe el motivo de la corrección.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_expiry_date IS NOT NULL AND p_expiry_date <= DATE '2000-01-01' THEN
    RAISE EXCEPTION 'Fecha de vencimiento inválida.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_code = v_lot.lot_code AND p_expiry_date IS NOT DISTINCT FROM v_lot.expiry_date THEN
    RAISE EXCEPTION 'No hay cambios que guardar.' USING ERRCODE = 'check_violation';
  END IF;

  IF v_code <> v_lot.lot_code AND EXISTS (
    SELECT 1 FROM inventory_lots
     WHERE product_id = v_lot.product_id AND lot_code = v_code AND id <> v_lot.id
  ) THEN
    RAISE EXCEPTION 'Este producto ya tiene un lote con el código "%".', v_code
      USING ERRCODE = 'unique_violation';
  END IF;

  -- El trigger de auditoría lee el motivo de aquí (solo esta transacción).
  PERFORM set_config('yenda.lot_change_reason', v_reason, true);

  UPDATE inventory_lots
     SET lot_code = v_code,
         expiry_date = p_expiry_date
   WHERE id = v_lot.id
  RETURNING * INTO v_lot;

  RETURN jsonb_build_object(
    'id', v_lot.id,
    'organization_id', v_lot.organization_id,
    'product_id', v_lot.product_id,
    'lot_code', v_lot.lot_code,
    'expiry_date', v_lot.expiry_date,
    'unit_cost', v_lot.unit_cost,
    'supplier', v_lot.supplier,
    'received_at', v_lot.received_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_update_lot(uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_update_lot(uuid, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.inventory_update_lot(uuid, text, date, text) IS
  'Mig 269: corrige código y/o vencimiento de un lote. Editor de almacén (is_org_inventory_editor). Motivo obligatorio; queda en inventory_lot_changes vía trigger. No toca stock ni costos.';
