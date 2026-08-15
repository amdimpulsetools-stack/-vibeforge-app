-- ============================================================
-- Migración 215 — Módulo Caja: los cuatro RPC del turno
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
--
-- La 214 dejó cash_shifts sin policies de INSERT/UPDATE: abrir y cerrar
-- caja no es escribir una fila, es una operación con invariantes que
-- ninguna policy puede expresar (rol autorizado, un solo turno abierto,
-- esperado calculado y congelado, diferencia firmada). Vive aquí.
--
-- Las cuatro funciones son SECURITY DEFINER con search_path fijado y
-- GRANT explícito a authenticated: los defaults se cerraron en la
-- 193(d), así que sin el GRANT el RPC simplemente no existe para el
-- cliente.
--
-- FÓRMULA SAGRADA del arqueo, una sola en todo el módulo:
--
--   efectivo_esperado = opening_float
--                     + Σ patient_payments.amount (turno, tender='efectivo')
--                     + Σ cash_movements.amount   (turno, tender='efectivo')
--
-- Los movimientos ya llevan signo (CHECK cash_mov_sign_chk, mig 214):
-- un SUM, sin CASE. La diferencia SOLO existe sobre efectivo; los
-- medios electrónicos se comparan como conciliación informativa.
-- ============================================================

-- ── 1. Abrir turno ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION caja_open_shift(
  p_org    uuid,
  p_float  numeric,
  p_office uuid DEFAULT NULL,
  p_notes  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_role      text;
  v_scope     text;
  v_scope_key uuid;
  v_id        uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_role
    FROM organization_members
   WHERE organization_id = p_org AND user_id = v_uid;

  IF v_role IS NULL THEN
    RAISE EXCEPTION 'No perteneces a esta organización.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- El médico no abre caja: no cobra. Recepción sí, es su trabajo.
  --
  -- 'assistant' y 'member' entran como recepción heredada: antes de la
  -- mig 020 no existía el rol 'receptionist' y esas filas siguen vivas
  -- (la mig 192 documenta la misma equivalencia para las audiencias de
  -- notificación). Sin ellas, una recepcionista de una org antigua no
  -- podría abrir su propia caja.
  IF v_role NOT IN ('owner','admin','receptionist','assistant','member') THEN
    RAISE EXCEPTION 'Tu rol no puede abrir la caja. Pídeselo a recepción o a un administrador.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_float IS NULL OR p_float < 0 THEN
    RAISE EXCEPTION 'El fondo inicial no puede ser negativo.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT shift_scope INTO v_scope
    FROM cash_settings
   WHERE organization_id = p_org;

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'El módulo Caja no está configurado en esta organización. Un administrador debe activarlo primero.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Con scope 'organization' hay UNA caja por clínica; con 'user', una
  -- por persona. El índice parcial UNIQUE de la 214 hace el resto.
  v_scope_key := CASE WHEN v_scope = 'organization' THEN p_org ELSE v_uid END;

  BEGIN
    INSERT INTO cash_shifts (
      organization_id, office_id, status, opened_by,
      opening_float, opening_notes, scope_key
    ) VALUES (
      p_org, p_office, 'open', v_uid,
      p_float, nullif(btrim(coalesce(p_notes,'')), ''), v_scope_key
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Dos aperturas simultáneas (doble clic, dos pestañas): la segunda
    -- llega aquí con un mensaje que la cajera entiende, no con un
    -- 23505 crudo.
    RAISE EXCEPTION 'Ya hay una caja abierta. Ciérrala antes de abrir una nueva.'
      USING ERRCODE = 'check_violation';
  END;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION caja_open_shift(uuid, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION caja_open_shift(uuid, numeric, uuid, text) TO authenticated;

-- ── 2. Resumen en vivo del turno ────────────────────────────────
-- Alimenta la pestaña Resumen y el paso previo al cierre. El arqueo
-- ciego se aplica AQUÍ y no en la interfaz: un cliente puede pedir el
-- JSON con curl, así que ocultar el esperado en React no oculta nada.
CREATE OR REPLACE FUNCTION caja_shift_summary(
  p_shift           uuid,
  p_reveal_expected boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  s            cash_shifts%ROWTYPE;
  v_admin      boolean;
  v_blind      boolean;
  v_reveal     boolean;
  v_by_tender  jsonb;
  v_by_method  jsonb;
  v_mov_tender jsonb;
  v_pay_count  integer;
  v_mov_count  integer;
  v_pay_total  numeric(12,2);
  v_cash_pay   numeric(12,2);
  v_cash_mov   numeric(12,2);
  v_result     jsonb;
BEGIN
  SELECT * INTO s FROM cash_shifts WHERE id = p_shift;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno de caja no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  v_admin := is_org_admin(s.organization_id);
  IF NOT v_admin AND s.opened_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'No tienes acceso a este turno de caja.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Cobros del turno, por tipo de medio y por método concreto.
  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_by_tender
    FROM (
      SELECT coalesce(tender_kind, 'otro') AS k, sum(amount)::numeric(12,2) AS v
        FROM patient_payments
       WHERE cash_shift_id = p_shift
       GROUP BY 1
    ) q;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_by_method
    FROM (
      SELECT coalesce(nullif(btrim(coalesce(payment_method, '')), ''), '(sin método)') AS k,
             sum(amount)::numeric(12,2) AS v
        FROM patient_payments
       WHERE cash_shift_id = p_shift
       GROUP BY 1
    ) q;

  SELECT count(*)::int,
         coalesce(sum(amount), 0)::numeric(12,2),
         coalesce(sum(amount) FILTER (WHERE tender_kind = 'efectivo'), 0)::numeric(12,2)
    INTO v_pay_count, v_pay_total, v_cash_pay
    FROM patient_payments
   WHERE cash_shift_id = p_shift;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_mov_tender
    FROM (
      SELECT tender_kind AS k, sum(amount)::numeric(12,2) AS v
        FROM cash_movements
       WHERE shift_id = p_shift
       GROUP BY 1
    ) q;

  SELECT count(*)::int,
         coalesce(sum(amount) FILTER (WHERE tender_kind = 'efectivo'), 0)::numeric(12,2)
    INTO v_mov_count, v_cash_mov
    FROM cash_movements
   WHERE shift_id = p_shift;

  v_result := jsonb_build_object(
    'shift_id',            s.id,
    'status',              s.status,
    'opened_at',           s.opened_at,
    'opened_by',           s.opened_by,
    'opening_float',       s.opening_float,
    'payments_total',      v_pay_total,
    'payments_count',      v_pay_count,
    'payments_by_tender',  v_by_tender,
    'payments_by_method',  v_by_method,
    'movements_by_tender', v_mov_tender,
    'movements_count',     v_mov_count,
    'operations_count',    v_pay_count + v_mov_count,
    'blind_count',         false
  );

  SELECT require_blind_count INTO v_blind
    FROM cash_settings
   WHERE organization_id = s.organization_id;

  -- El admin siempre ve el esperado (es quien audita); el resto solo si
  -- el arqueo ciego está apagado, si lo pide explícitamente al cerrar o
  -- si el turno ya está cerrado (ahí el número ya está firmado).
  v_reveal := v_admin
              OR NOT coalesce(v_blind, false)
              OR coalesce(p_reveal_expected, false)
              OR s.status = 'closed';

  IF v_reveal THEN
    v_result := v_result || jsonb_build_object(
      'expected_cash',     (s.opening_float + v_cash_pay + v_cash_mov)::numeric(12,2),
      'cash_payments',     v_cash_pay,
      'cash_movements',    v_cash_mov
    );
  ELSE
    v_result := jsonb_set(v_result, '{blind_count}', 'true'::jsonb);
  END IF;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION caja_shift_summary(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION caja_shift_summary(uuid, boolean) TO authenticated;

-- ── 3. Cerrar turno ─────────────────────────────────────────────
-- El único sitio del sistema donde se escribe un arqueo. Toma el turno
-- con FOR UPDATE antes de mirar su estado: sin el lock, dos cierres
-- concurrentes leerían 'open' los dos y el segundo pisaría el arqueo
-- del primero.
CREATE OR REPLACE FUNCTION caja_close_shift(
  p_shift            uuid,
  p_counted_cash     numeric,
  p_counted_by_method jsonb DEFAULT NULL,
  p_notes            text  DEFAULT NULL,
  p_reason           text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  s            cash_shifts%ROWTYPE;
  v_admin      boolean;
  v_force      boolean;
  v_tol        numeric(12,2);
  v_by_tender  jsonb;
  v_by_method  jsonb;
  v_pay_count  integer;
  v_cash_pay   numeric(12,2);
  v_cash_mov   numeric(12,2);
  v_expected   numeric(12,2);
  v_diff       numeric(12,2);
  v_reason     text;
BEGIN
  SELECT * INTO s FROM cash_shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno de caja no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Dentro del lock: si el otro cierre ganó, aquí ya dice 'closed'.
  IF s.status <> 'open' THEN
    RAISE EXCEPTION 'Esta caja ya fue cerrada.' USING ERRCODE = 'check_violation';
  END IF;

  v_admin := is_org_admin(s.organization_id);
  IF NOT v_admin AND s.opened_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Solo quien abrió la caja o un administrador pueden cerrarla.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Cierre forzado: el admin cierra la caja de otro (se fue sin cerrar).
  -- No es un error, es un hecho que el historial debe mostrar.
  v_force := (s.opened_by IS DISTINCT FROM v_uid);

  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RAISE EXCEPTION 'El efectivo contado no puede ser negativo.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_by_tender
    FROM (
      SELECT coalesce(tender_kind, 'otro') AS k, sum(amount)::numeric(12,2) AS v
        FROM patient_payments WHERE cash_shift_id = p_shift GROUP BY 1
    ) q;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_by_method
    FROM (
      SELECT coalesce(nullif(btrim(coalesce(payment_method, '')), ''), '(sin método)') AS k,
             sum(amount)::numeric(12,2) AS v
        FROM patient_payments WHERE cash_shift_id = p_shift GROUP BY 1
    ) q;

  SELECT count(*)::int,
         coalesce(sum(amount) FILTER (WHERE tender_kind = 'efectivo'), 0)::numeric(12,2)
    INTO v_pay_count, v_cash_pay
    FROM patient_payments WHERE cash_shift_id = p_shift;

  -- Los movimientos YA llevan signo: un solo SUM, sin CASE.
  SELECT coalesce(sum(amount) FILTER (WHERE tender_kind = 'efectivo'), 0)::numeric(12,2)
    INTO v_cash_mov
    FROM cash_movements WHERE shift_id = p_shift;

  v_expected := (s.opening_float + v_cash_pay + v_cash_mov)::numeric(12,2);
  v_diff     := (p_counted_cash - v_expected)::numeric(12,2);

  SELECT difference_tolerance INTO v_tol
    FROM cash_settings WHERE organization_id = s.organization_id;
  v_tol := coalesce(v_tol, 0);

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  IF abs(v_diff) > v_tol AND v_reason IS NULL THEN
    RAISE EXCEPTION
      'La diferencia de S/ % supera la tolerancia (S/ %). Escribe el motivo para poder cerrar.',
      to_char(v_diff, 'FM999999990.00'), to_char(v_tol, 'FM999999990.00')
      USING ERRCODE = 'check_violation';
  END IF;

  -- cash_shift_diff_reason_chk (mig 214) exige firma para CUALQUIER
  -- diferencia ≠ 0. Por debajo de la tolerancia el humano no tiene que
  -- explicar un redondeo de sencillo, así que la firma la pone el
  -- sistema y queda igual de auditable.
  IF v_diff <> 0 AND v_reason IS NULL THEN
    v_reason := 'Diferencia dentro de la tolerancia configurada (S/ '
                || to_char(v_tol, 'FM999999990.00') || ').';
  END IF;

  UPDATE cash_shifts
     SET status             = 'closed',
         closed_at          = now(),
         closed_by          = v_uid,
         force_closed       = v_force,
         counted_cash       = p_counted_cash,
         counted_by_method  = p_counted_by_method,
         expected_cash      = v_expected,
         expected_by_tender = v_by_tender,
         expected_by_method = v_by_method,
         payments_count     = v_pay_count,
         closing_notes      = nullif(btrim(coalesce(p_notes, '')), ''),
         difference_reason  = v_reason
   WHERE id = p_shift;

  RETURN jsonb_build_object(
    'shift_id',           p_shift,
    'expected_cash',      v_expected,
    'counted_cash',       p_counted_cash,
    'difference_cash',    v_diff,
    'within_tolerance',   abs(v_diff) <= v_tol,
    'difference_tolerance', v_tol,
    'force_closed',       v_force,
    'payments_count',     v_pay_count,
    'expected_by_tender', v_by_tender,
    'expected_by_method', v_by_method,
    'difference_reason',  v_reason
  );
END $$;

REVOKE ALL ON FUNCTION caja_close_shift(uuid, numeric, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION caja_close_shift(uuid, numeric, jsonb, text, text) TO authenticated;

-- ── 4. Atribuir un pago huérfano a un turno ─────────────────────
-- Para la bandeja "Fuera de turno": cobros que entraron sin caja
-- abierta. Solo admin, solo hacia un turno ABIERTO — adjuntar a un
-- turno cerrado reescribiría un arqueo ya firmado (y el trigger
-- caja_protect_closed_shift lo rechazaría de todos modos).
CREATE OR REPLACE FUNCTION caja_attach_payment(p_payment uuid, p_shift uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pay_org   uuid;
  v_pay_shift uuid;
  v_shift_org uuid;
  v_status    text;
BEGIN
  SELECT organization_id, cash_shift_id INTO v_pay_org, v_pay_shift
    FROM patient_payments WHERE id = p_payment;
  IF v_pay_org IS NULL THEN
    RAISE EXCEPTION 'Pago no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT is_org_admin(v_pay_org) THEN
    RAISE EXCEPTION 'Solo un administrador puede atribuir un pago a un turno de caja.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_pay_shift IS NOT NULL THEN
    RAISE EXCEPTION 'Este pago ya pertenece a un turno de caja.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT organization_id, status INTO v_shift_org, v_status
    FROM cash_shifts WHERE id = p_shift;
  IF v_shift_org IS NULL THEN
    RAISE EXCEPTION 'Turno de caja no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_shift_org <> v_pay_org THEN
    RAISE EXCEPTION 'El pago y el turno son de organizaciones distintas.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Solo se puede atribuir un pago a una caja abierta.' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE patient_payments SET cash_shift_id = p_shift WHERE id = p_payment;
END $$;

REVOKE ALL ON FUNCTION caja_attach_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION caja_attach_payment(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION caja_open_shift(uuid, numeric, uuid, text) IS
  'Caja F3: abre turno validando rol y módulo activo. La unicidad la garantiza el índice parcial de la mig 214, no un SELECT previo.';
COMMENT ON FUNCTION caja_shift_summary(uuid, boolean) IS
  'Caja F3: totales en vivo del turno. Aplica el arqueo ciego en servidor (omite los campos expected_* para no-admins).';
COMMENT ON FUNCTION caja_close_shift(uuid, numeric, jsonb, text, text) IS
  'Caja F3: único punto de escritura del arqueo. FOR UPDATE + verificación de estado dentro del lock; congela esperado y exige motivo sobre la tolerancia.';
COMMENT ON FUNCTION caja_attach_payment(uuid, uuid) IS
  'Caja F3: atribuye un pago sin turno (bandeja Fuera de turno) a un turno ABIERTO. Solo admin.';
