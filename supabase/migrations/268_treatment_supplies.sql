-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- ═══════════════════════════════════════════════════════════════════
-- 268: Tratamientos — insumos de la propia farmacia + cierre "Completado"
--
-- Caso real (Dra. Patricia, 22-sep-2026): a una DONANTE de óvulos se le
-- inicia una criopreservación que no paga (S/ 0) y durante la estimulación
-- se le aplican medicamentos del propio almacén sin cobrárselos. Ese dinero
-- se recupera cuando viene la receptora de ovodonación (su presupuesto ya
-- incluye la parte de la donante). Hoy:
--   · Almacén tiene "Aplicación" (reason_code 'uso_en_cita', salida con
--     COGS congelado y sin precio), pero solo vincula PACIENTE: no sabe de
--     qué tratamiento es.
--   · La pestaña Rentabilidad cuenta esas aplicaciones solo como unidades:
--     su costo no se resta de nada. La plata desaparece de todas las vistas.
--   · Una "venta a S/ 0" por el POS sería la herramienta equivocada: exige
--     método de pago, crea un patient_payments de cero y cuenta como venta
--     con 100 % de descuento.
--
-- Qué cambia:
--   1. `inventory_movements.treatment_id` (nullable, FK RESTRICT + índice
--      parcial). Misma técnica que `sale_line_id` (mig 213). RESTRICT y no
--      SET NULL: el kardex es append-only por trigger (mig 209) y un SET
--      NULL en cascada dispararía ese trigger; además un tratamiento con
--      insumos aplicados no debe poder borrarse.
--   2. RPC `treatment_apply_product`: descuenta del kardex DESDE la ficha
--      del tratamiento. Mismo movimiento que la Aplicación de Almacén
--      (salida, 'uso_en_cita', patient_id de la paciente, COGS = CPP
--      vigente calculado en el servidor con `pharmacy_avg_cost`, sin
--      precio de venta) y además `treatment_id`. NO toca patient_payments,
--      Caja ni deuda: no es cobro, no es pago, no es pago a tercero. Es un
--      COSTO del tratamiento, y así se muestra.
--      Permiso: cualquier miembro activo de la org (igual que la policy de
--      INSERT del kardex): recepción aplica, igual que cobra en el POS.
--      Gates: addon fertilidad + módulo Almacén + tratamiento en curso.
--      Stock insuficiente NO bloquea (criterio del POS, mig 217): se
--      aplica y queda el aviso, que es lo que hace visible un descuadre.
--   3. RPC `treatment_undo_supply`: contra-asiento (ajuste +cantidad,
--      `reverses_movement_id`, hereda el costo), jamás DELETE — patrón
--      `undoMovement` de Almacén. Quien puede: editor de almacén (mig 267)
--      o quien registró la aplicación (corregir el propio error).
--   4. `treatments.outcome` admite 'completed': cierre "Completado" sin
--      desenlace clínico (ciclo de donante, ciclos que no buscan embarazo).
--      Antes la UI obligaba a elegir embarazo/sin embarazo/abandono/derivado.
--
-- Dinero del tratamiento (lib/treatments/money.ts, sin cambios): acordado,
-- pagado y pendiente NO se mueven con esto. El costo de insumos es una
-- cifra aparte (Σ cost_total de los movimientos con treatment_id, sin los
-- pares deshechos) y vive al lado, nunca dentro.
--
-- Aditiva e idempotente. Rollback: rollbacks/268_treatment_supplies_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Desenlace 'completed' ─────────────────────────────────────────
-- El CHECK de la 242 es inline (sin nombre explícito): se localiza por su
-- definición y se recrea con nombre para que el rollback sea exacto.
DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c
    FROM pg_constraint
   WHERE conrelid = 'public.treatments'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%pregnancy%';
  IF c IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.treatments DROP CONSTRAINT %I', c);
  END IF;
END $$;

ALTER TABLE treatments ADD CONSTRAINT treatments_outcome_chk
  CHECK (outcome IS NULL OR outcome IN
    ('pregnancy','no_pregnancy','abandoned','transferred','completed','other'));

COMMENT ON COLUMN treatments.outcome IS
  'Desenlace al cerrar. completed (mig 268) = terminó sin desenlace clínico que registrar (p. ej. ciclo de donante).';

-- ── 2. Vínculo kardex → tratamiento ──────────────────────────────────
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS treatment_id uuid REFERENCES treatments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_treatment
  ON inventory_movements (treatment_id) WHERE treatment_id IS NOT NULL;

COMMENT ON COLUMN inventory_movements.treatment_id IS
  'Mig 268: aplicación registrada desde la ficha de un tratamiento (addon fertilidad). Σ cost_total de estas filas (sin pares deshechos) = costo de insumos del tratamiento. Nunca es cobro.';

-- ── 3. Aplicar un producto desde el tratamiento ──────────────────────
CREATE OR REPLACE FUNCTION public.treatment_apply_product(
  p_treatment_id  uuid,
  p_product_id    uuid,
  p_quantity      numeric,
  p_lot_id        uuid DEFAULT NULL,
  p_movement_date date DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t           treatments%ROWTYPE;
  v_prod      inventory_products%ROWTYPE;
  v_uid       uuid := auth.uid();
  v_cost      numeric;
  v_stock     numeric;
  v_lot_stock numeric;
  v_date      date;
  v_mov       uuid;
  v_warnings  text[] := '{}';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO t FROM treatments WHERE id = p_treatment_id;
  IF t.id IS NULL OR t.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Miembro activo de la org, cualquier rol (misma regla que el INSERT del
  -- kardex, mig 209): recepción aplica igual que cobra en Farmacia.
  IF treatments_caller_role(t.organization_id) IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM organization_addons
     WHERE organization_id = t.organization_id
       AND addon_key IN ('fertility_basic','fertility_premium') AND enabled = true
  ) THEN
    RAISE EXCEPTION 'Esta función requiere el addon Pack Fertilidad' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_addons
     WHERE organization_id = t.organization_id AND addon_key = 'almacen' AND enabled = true
  ) THEN
    RAISE EXCEPTION 'El módulo Almacén no está activo en esta organización.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF t.status <> 'in_progress' THEN
    RAISE EXCEPTION 'El tratamiento está cerrado; reábrelo para aplicar insumos.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor que cero.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_prod
    FROM inventory_products
   WHERE id = p_product_id AND organization_id = t.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado en esta organización.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_prod.is_discontinued THEN
    RAISE EXCEPTION 'El producto está archivado.' USING ERRCODE = 'check_violation';
  END IF;
  IF p_lot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_lots WHERE id = p_lot_id AND product_id = p_product_id
  ) THEN
    RAISE EXCEPTION 'El lote no pertenece a este producto.' USING ERRCODE = 'check_violation';
  END IF;

  -- "Hoy" civil en la zona de la org (mig 240), nunca CURRENT_DATE en UTC.
  SELECT COALESCE(p_movement_date, (now() AT TIME ZONE COALESCE(o.timezone, 'America/Lima'))::date)
    INTO v_date
    FROM organizations o WHERE o.id = t.organization_id;

  -- Lock por producto (mismo que el POS): dos aplicaciones simultáneas del
  -- mismo producto se serializan.
  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  -- COGS congelado: CPP vigente calculado en el SERVIDOR con la misma
  -- función que usa el POS. Una sola fórmula, no una copia en el cliente.
  v_cost := pharmacy_avg_cost(p_product_id);

  SELECT COALESCE(sum(quantity), 0) INTO v_stock
    FROM inventory_movements WHERE product_id = p_product_id;
  IF v_stock < p_quantity THEN
    v_warnings := v_warnings || format(
      '%s: stock insuficiente (hay %s, se aplicaron %s).',
      v_prod.name,
      trim(to_char(v_stock, 'FM999999990.999')),
      trim(to_char(p_quantity, 'FM999999990.999'))
    );
  END IF;
  IF p_lot_id IS NOT NULL THEN
    SELECT COALESCE(sum(quantity), 0) INTO v_lot_stock
      FROM inventory_movements WHERE lot_id = p_lot_id;
    IF v_lot_stock < p_quantity THEN
      v_warnings := v_warnings || format(
        '%s: el lote elegido solo tenía %s.',
        v_prod.name,
        trim(to_char(v_lot_stock, 'FM999999990.999'))
      );
    END IF;
  END IF;

  INSERT INTO inventory_movements (
    organization_id, product_id, lot_id,
    movement_type, quantity,
    unit_cost, unit_sale_price,
    movement_date, reason_code, notes,
    patient_id, treatment_id, created_by
  ) VALUES (
    t.organization_id, p_product_id, p_lot_id,
    'salida', -p_quantity,
    v_cost, NULL,                      -- sin precio: no es venta
    v_date, 'uso_en_cita',
    concat_ws(' · ', 'Tratamiento ' || t.title, NULLIF(btrim(COALESCE(p_notes, '')), '')),
    t.patient_id, t.id, v_uid
  )
  RETURNING id INTO v_mov;

  RETURN jsonb_build_object(
    'movement_id', v_mov,
    'unit_cost',   v_cost,
    'cost_total',  CASE WHEN v_cost IS NULL THEN NULL ELSE round(p_quantity * v_cost, 2) END,
    'warnings',    to_jsonb(v_warnings)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.treatment_apply_product(uuid, uuid, numeric, uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.treatment_apply_product(uuid, uuid, numeric, uuid, date, text) TO authenticated;

COMMENT ON FUNCTION public.treatment_apply_product(uuid, uuid, numeric, uuid, date, text) IS
  'Mig 268: aplica un producto del almacén a un tratamiento en curso. Salida uso_en_cita con COGS = CPP vigente (pharmacy_avg_cost), sin precio, con patient_id y treatment_id. Nunca toca patient_payments. Cualquier miembro activo; exige addon fertilidad + Almacén.';

-- ── 4. Deshacer una aplicación: contra-asiento ───────────────────────
CREATE OR REPLACE FUNCTION public.treatment_undo_supply(p_movement_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  m       inventory_movements%ROWTYPE;
  v_uid   uuid := auth.uid();
  v_today date;
  v_rev   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO m FROM inventory_movements WHERE id = p_movement_id;
  IF m.id IS NULL OR m.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF m.treatment_id IS NULL THEN
    RAISE EXCEPTION 'Este movimiento no es una aplicación de tratamiento.' USING ERRCODE = 'check_violation';
  END IF;
  -- Editor de almacén (mig 267) o quien registró la aplicación.
  IF NOT is_org_inventory_editor(m.organization_id) AND m.created_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF EXISTS (SELECT 1 FROM inventory_movements r WHERE r.reverses_movement_id = m.id) THEN
    RAISE EXCEPTION 'Esta aplicación ya fue deshecha.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'America/Lima'))::date INTO v_today
    FROM organizations o WHERE o.id = m.organization_id;

  -- Igual que undoMovement de Almacén: ajuste opuesto, hereda el costo, sin
  -- patient_id ni treatment_id (el par se neta por reverses_movement_id).
  INSERT INTO inventory_movements (
    organization_id, product_id, lot_id,
    movement_type, quantity, unit_cost,
    movement_date, reason_code, notes,
    reverses_movement_id, created_by
  ) VALUES (
    m.organization_id, m.product_id, m.lot_id,
    'ajuste', -m.quantity, m.unit_cost,
    COALESCE(v_today, CURRENT_DATE), 'error_registro',
    'Deshace aplicación #' || left(m.id::text, 8),
    m.id, v_uid
  )
  RETURNING id INTO v_rev;

  RETURN v_rev;
END;
$$;

REVOKE ALL ON FUNCTION public.treatment_undo_supply(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.treatment_undo_supply(uuid) TO authenticated;

COMMENT ON FUNCTION public.treatment_undo_supply(uuid) IS
  'Mig 268: deshace una aplicación de tratamiento con un contra-asiento (ajuste opuesto, reverses_movement_id, costo heredado). Editor de almacén o autor del movimiento.';
