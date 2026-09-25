-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- ═══════════════════════════════════════════════════════════════════
-- 270: Almacén — asignar a un lote las unidades que quedaron "sin lote"
--
-- Caso real (Dra. Patricia, 25-sep-2026): Adaptessens mostraba STOCK 18
-- pero la ventana de lotes decía "17 und en 1 lote". La unidad 18 entró el
-- 22-sep con el campo Lote vacío (lot_id NULL) y ninguna pantalla la
-- mostraba ni permitía corregirla. En esa org: 7 productos con 77 und sin
-- lote y 13 con lotes que suman MÁS que el stock real (121 und): ventas del
-- POS e insumos de tratamientos de productos sin control de lotes bajan el
-- stock pero no el lote.
--
-- Identidad que se usa en todo esto (stock y saldos son Σ del kardex):
--   stock = Σ saldos de lotes + "sin lote",  "sin lote" = Σ quantity con
--   lot_id NULL. Positivo = unidades en estante sin lote asignado; negativo
--   = salieron unidades sin decir de qué lote (los lotes quedaron inflados).
--
-- Cómo se corrige sin romper el kardex (append-only, mig 209): un PAR de
-- ajustes que netea a cero. Asignar q und a un lote L:
--     ajuste −q  lot_id NULL   ┐ mismo costo c = CPP vigente
--     ajuste +q  lot_id L      ┘ (pharmacy_avg_cost)
-- Stock intacto (−q + q), CPP intacto (−q·c + q·c en numerador y −q + q
-- en denominador), rentabilidad intacta (ignora ajustes). Lo único que
-- cambia es de qué lote son las unidades. q < 0 hace el camino inverso
-- (descontar de un lote inflado las unidades que salieron sin lote).
--
-- Qué cambia:
--   1. reason_code admite 'asignacion_lote'.
--   2. `inventory_lot_assignments`: auditoría append-only (quién, cuándo,
--      cuánto, a qué lote, por qué). Lectura: miembros de la org; sin
--      policies de escritura (solo el RPC).
--   3. `inventory_movements.lot_assignment_id` (FK RESTRICT) une cada fila
--      del par con su auditoría. CHECK: esa columna existe si y solo si el
--      motivo es 'asignacion_lote', y solo en ajustes.
--   4. Guarda BEFORE INSERT en el kardex: (a) una fila de asignación solo
--      la puede escribir el RPC (marca de transacción); (b) no se puede
--      "deshacer" una sola fila del par con un contra-asiento: descuadraría
--      el stock. La corrección de una asignación es otra asignación.
--   5. RPC `inventory_assign_unlotted`: editor de almacén (mig 267), addon
--      Almacén, motivo obligatorio, lock por producto (igual que el POS).
--
-- Aditiva e idempotente. Rollback: rollbacks/270_inventory_lot_assignment_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Nuevo motivo ──────────────────────────────────────────────────
ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inventory_movements_reason_code_check;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_reason_code_check CHECK (reason_code IN (
    'saldo_inicial','compra','venta','uso_en_cita','uso_interno',
    'conteo_fisico','rotura','vencido','robo_perdida',
    'error_registro','devolucion_paciente','devolucion_proveedor',
    'donacion','muestra_medica','otro',
    'asignacion_lote'));

-- ── 2. Auditoría ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory_lot_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  product_id      uuid NOT NULL REFERENCES inventory_products(id) ON DELETE RESTRICT,
  lot_id          uuid NOT NULL REFERENCES inventory_lots(id) ON DELETE RESTRICT,
  -- > 0: de "sin lote" al lote. < 0: del lote a "sin lote".
  quantity        numeric(12,3) NOT NULL CHECK (quantity <> 0),
  unit_cost       numeric(12,4) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  lot_created     boolean NOT NULL DEFAULT false,
  reason          text NOT NULL CHECK (length(btrim(reason)) >= 3),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_lot_assignments_product
  ON inventory_lot_assignments (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_lot_assignments_lot
  ON inventory_lot_assignments (lot_id);

ALTER TABLE inventory_lot_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members read inventory_lot_assignments" ON inventory_lot_assignments;
CREATE POLICY "Org members read inventory_lot_assignments"
  ON inventory_lot_assignments FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));
-- (sin policies de INSERT/UPDATE/DELETE: solo escribe el RPC)

COMMENT ON TABLE inventory_lot_assignments IS
  'Almacén (mig 270): asignaciones de unidades "sin lote" a un lote (quantity > 0) o de un lote inflado a "sin lote" (quantity < 0). Cada fila tiene su par de ajustes que netea a cero en inventory_movements (lot_assignment_id).';

-- ── 3. Vínculo kardex → asignación ───────────────────────────────────
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS lot_assignment_id uuid
    REFERENCES inventory_lot_assignments(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_inventory_movements_lot_assignment
  ON inventory_movements (lot_assignment_id) WHERE lot_assignment_id IS NOT NULL;

ALTER TABLE inventory_movements
  DROP CONSTRAINT IF EXISTS inv_mov_lot_assignment_chk;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inv_mov_lot_assignment_chk CHECK (
    (lot_assignment_id IS NULL) = (reason_code IS DISTINCT FROM 'asignacion_lote')
    AND (lot_assignment_id IS NULL OR movement_type = 'ajuste')
  );

COMMENT ON COLUMN inventory_movements.lot_assignment_id IS
  'Mig 270: fila de un par de asignación de lote (ajuste −q/+q que netea a cero). No se deshace fila a fila: se corrige con otra asignación.';

-- ── 4. Guarda del kardex ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION inventory_movements_lot_assignment_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.lot_assignment_id IS NOT NULL
     AND NEW.lot_assignment_id::text IS DISTINCT FROM
         NULLIF(current_setting('yenda.lot_assignment_id', true), '') THEN
    RAISE EXCEPTION 'Las asignaciones de lote solo se registran desde "Asignar a lote".'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.reverses_movement_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM inventory_movements
     WHERE id = NEW.reverses_movement_id AND lot_assignment_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Una asignación de lote no se deshace fila por fila (descuadraría el stock). Corrígela con otra asignación.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_movements_lot_assignment_guard ON inventory_movements;
CREATE TRIGGER trg_inventory_movements_lot_assignment_guard
  BEFORE INSERT ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_movements_lot_assignment_guard();

-- ── 5. RPC ───────────────────────────────────────────────────────────
-- p_quantity > 0: pasa unidades de "sin lote" a un lote EXISTENTE
--   (p_lot_id) o a uno NUEVO (p_new_lot_code + p_new_expiry_date).
-- p_quantity < 0: descuenta de un lote existente unidades que salieron
--   sin lote (el lote estaba inflado). Solo lote existente.
CREATE OR REPLACE FUNCTION public.inventory_assign_unlotted(
  p_product_id      uuid,
  p_quantity        numeric,
  p_lot_id          uuid DEFAULT NULL,
  p_new_lot_code    text DEFAULT NULL,
  p_new_expiry_date date DEFAULT NULL,
  p_reason          text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_prod      inventory_products%ROWTYPE;
  v_lot       inventory_lots%ROWTYPE;
  v_qty       numeric := round(COALESCE(p_quantity, 0), 3);
  v_reason    text := btrim(COALESCE(p_reason, ''));
  v_code      text := btrim(COALESCE(p_new_lot_code, ''));
  v_unlotted  numeric;
  v_lot_bal   numeric;
  v_cost      numeric;
  v_today     date;
  v_src_date  date;
  v_src_cost  numeric;
  v_created   boolean := false;
  v_asg       uuid;
  v_out       uuid;
  v_in        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_prod FROM inventory_products WHERE id = p_product_id;
  IF NOT FOUND OR v_prod.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'Producto no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT is_org_inventory_editor(v_prod.organization_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM organization_addons
     WHERE organization_id = v_prod.organization_id AND addon_key = 'almacen' AND enabled = true
  ) THEN
    RAISE EXCEPTION 'El módulo Almacén no está activo en esta organización.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- "Hoy" civil de la org (mig 240), nunca CURRENT_DATE en UTC.
  SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'America/Lima'))::date
    INTO v_today
    FROM organizations o WHERE o.id = v_prod.organization_id;

  IF v_qty = 0 THEN
    RAISE EXCEPTION 'La cantidad no puede ser cero.' USING ERRCODE = 'check_violation';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Escribe el motivo de la asignación.' USING ERRCODE = 'check_violation';
  END IF;
  IF (p_lot_id IS NULL) = (v_code = '') THEN
    RAISE EXCEPTION 'Elige un lote existente o escribe el código de un lote nuevo (uno de los dos).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_qty < 0 AND p_lot_id IS NULL THEN
    RAISE EXCEPTION 'Para descontar unidades hay que elegir un lote existente.' USING ERRCODE = 'check_violation';
  END IF;

  -- Mismo lock por producto que el POS y los tratamientos: nada cambia el
  -- saldo "sin lote" mientras se calcula y se asienta el par.
  PERFORM pg_advisory_xact_lock(hashtext(p_product_id::text));

  SELECT COALESCE(sum(quantity), 0) INTO v_unlotted
    FROM inventory_movements
   WHERE product_id = p_product_id AND lot_id IS NULL;

  IF v_qty > 0 AND v_unlotted < v_qty THEN
    RAISE EXCEPTION 'Solo hay % unidades sin lote para asignar.',
      trim(to_char(greatest(v_unlotted, 0), 'FM999999990.###'))
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_qty < 0 AND v_unlotted > v_qty THEN
    RAISE EXCEPTION 'Solo salieron % unidades sin lote; no se puede descontar más de eso.',
      trim(to_char(greatest(-v_unlotted, 0), 'FM999999990.###'))
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_lot_id IS NOT NULL THEN
    SELECT * INTO v_lot FROM inventory_lots
     WHERE id = p_lot_id AND product_id = p_product_id
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El lote no pertenece a este producto.' USING ERRCODE = 'check_violation';
    END IF;
    IF v_qty < 0 THEN
      SELECT COALESCE(sum(quantity), 0) INTO v_lot_bal
        FROM inventory_movements WHERE lot_id = v_lot.id;
      IF v_lot_bal < -v_qty THEN
        RAISE EXCEPTION 'El lote % solo tiene % unidades.',
          v_lot.lot_code, trim(to_char(greatest(v_lot_bal, 0), 'FM999999990.###'))
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSE
    IF length(v_code) > 60 THEN
      RAISE EXCEPTION 'El código de lote es demasiado largo (máximo 60).' USING ERRCODE = 'check_violation';
    END IF;
    IF upper(v_code) = 'SIN-LOTE' THEN
      RAISE EXCEPTION 'Escribe el código real del lote.' USING ERRCODE = 'check_violation';
    END IF;
    IF p_new_expiry_date IS NOT NULL AND p_new_expiry_date <= DATE '2000-01-01' THEN
      RAISE EXCEPTION 'Fecha de vencimiento inválida.' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM inventory_lots WHERE product_id = p_product_id AND lot_code = v_code) THEN
      RAISE EXCEPTION 'Este producto ya tiene un lote "%": elígelo de la lista.', v_code
        USING ERRCODE = 'unique_violation';
    END IF;

    -- El lote nuevo toma fecha de recepción y costo (sin IGV, tal como se
    -- digitó) de la última entrada que llegó sin lote: son esas unidades.
    SELECT movement_date, unit_cost INTO v_src_date, v_src_cost
      FROM inventory_movements
     WHERE product_id = p_product_id AND lot_id IS NULL
       AND movement_type = 'entrada'
     ORDER BY movement_date DESC, created_at DESC
     LIMIT 1;

    INSERT INTO inventory_lots (
      organization_id, product_id, lot_code, expiry_date, unit_cost,
      received_at, notes, created_by
    ) VALUES (
      v_prod.organization_id, p_product_id, v_code, p_new_expiry_date, v_src_cost,
      COALESCE(v_src_date, v_today), 'Creado al asignar unidades sin lote', v_uid
    )
    RETURNING * INTO v_lot;
    v_created := true;
  END IF;

  -- Mismo costo en las dos filas: el par se cancela en el CPP.
  v_cost := COALESCE(pharmacy_avg_cost(p_product_id), 0);

  INSERT INTO inventory_lot_assignments (
    organization_id, product_id, lot_id, quantity, unit_cost, lot_created, reason, created_by
  ) VALUES (
    v_prod.organization_id, p_product_id, v_lot.id, v_qty, v_cost, v_created, v_reason, v_uid
  )
  RETURNING id INTO v_asg;

  -- Marca para la guarda del kardex (solo esta transacción).
  PERFORM set_config('yenda.lot_assignment_id', v_asg::text, true);

  INSERT INTO inventory_movements (
    organization_id, product_id, lot_id, movement_type, quantity, unit_cost,
    movement_date, reason_code, notes, lot_assignment_id, created_by
  ) VALUES (
    v_prod.organization_id, p_product_id, NULL, 'ajuste', -v_qty, v_cost,
    v_today, 'asignacion_lote',
    CASE WHEN v_qty > 0 THEN 'Sin lote → lote ' || v_lot.lot_code
         ELSE 'Salidas sin lote ← lote ' || v_lot.lot_code END || ' · ' || v_reason,
    v_asg, v_uid
  )
  RETURNING id INTO v_out;

  INSERT INTO inventory_movements (
    organization_id, product_id, lot_id, movement_type, quantity, unit_cost,
    movement_date, reason_code, notes, lot_assignment_id, created_by
  ) VALUES (
    v_prod.organization_id, p_product_id, v_lot.id, 'ajuste', v_qty, v_cost,
    v_today, 'asignacion_lote',
    CASE WHEN v_qty > 0 THEN 'Sin lote → lote ' || v_lot.lot_code
         ELSE 'Salidas sin lote ← lote ' || v_lot.lot_code END || ' · ' || v_reason,
    v_asg, v_uid
  )
  RETURNING id INTO v_in;

  PERFORM set_config('yenda.lot_assignment_id', '', true);

  RETURN jsonb_build_object(
    'assignment_id', v_asg,
    'lot_created', v_created,
    'quantity', v_qty,
    'movement_ids', jsonb_build_array(v_out, v_in),
    'lot', jsonb_build_object(
      'id', v_lot.id,
      'organization_id', v_lot.organization_id,
      'product_id', v_lot.product_id,
      'lot_code', v_lot.lot_code,
      'expiry_date', v_lot.expiry_date,
      'unit_cost', v_lot.unit_cost,
      'supplier', v_lot.supplier,
      'received_at', v_lot.received_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.inventory_assign_unlotted(uuid, numeric, uuid, text, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_assign_unlotted(uuid, numeric, uuid, text, date, text) TO authenticated;

COMMENT ON FUNCTION public.inventory_assign_unlotted(uuid, numeric, uuid, text, date, text) IS
  'Mig 270: asigna unidades "sin lote" a un lote (q > 0, existente o nuevo) o descuenta de un lote inflado las unidades que salieron sin lote (q < 0). Par de ajustes asignacion_lote que netea a cero: no cambia stock, CPP ni rentabilidad. Editor de almacén; motivo obligatorio; auditoría en inventory_lot_assignments.';
