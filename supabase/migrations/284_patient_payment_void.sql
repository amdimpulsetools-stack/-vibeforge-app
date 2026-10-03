-- Pendiente de aplicar en producción (la aplica el founder en el SQL Editor)
--
-- ═══════════════════════════════════════════════════════════════════
-- 284: "Anular pago erróneo" — RPC de administrador con rastro
--
-- Caso real (Dra. Patricia, 01/02-oct-2026): el formulario registró un
-- anticipo de S/175 que nunca se cobró; quedó en un turno de Caja ya
-- cerrado y el candado de la 214 no dejaba borrarlo. La única salida fue
-- SQL a mano. Esta RPC es esa misma operación, pero con reglas, permisos
-- y rastro, para que no vuelva a necesitar SQL.
--
-- Reglas (todas RAISE con mensaje humano):
--   · solo owner/admin de la org del pago (is_org_admin);
--   · solo plata CLÍNICA de citas o de la ficha: no ventas de Farmacia
--     (sale_id), no cobros de tratamiento (treatment_id: su módulo tiene su
--     propio borrado), no pagos en línea (payment_links);
--   · sin comprobante (einvoice_id): con boleta, primero la nota de crédito;
--   · sin devolución en Caja ligada (cash_movements.payment_id);
--   · un pago en EFECTIVO de un turno CERRADO no se anula: el arqueo de
--     efectivo está firmado. Se corrige con un egreso en el turno abierto.
--     Yape/tarjeta/otro sí: no tocan el conteo del cajón;
--   · motivo obligatorio (≥ 5 caracteres).
--
-- Cómo pasa el candado de la 214 sin abrirlo: la RPC fija el GUC
-- `caja.void_payment_id` (local a la transacción) con el id del pago, y
-- caja_protect_closed_shift deja pasar el DELETE solo de ESE id. Nada más
-- cambia en el trigger: UPDATE sigue bloqueado y cualquier otro DELETE
-- también. Mismo patrón que vibeforge.release_hold_id (mig 274).
--
-- Rastro: nota "[Pago anulado]" en la cita (o en la ficha de la paciente si
-- el pago no tenía cita) con monto, fecha, medio, turno, quién y por qué.
-- Dinero: borrar el pago es lo contable (nunca entró). Ingresos del día y
-- "Mis cobros" bajan ese monto; el arqueo de efectivo no cambia porque los
-- de efectivo en turno cerrado no se anulan.
--
-- Aditiva e idempotente. Rollback: rollbacks/284_patient_payment_void_rollback.sql
-- Pruebas: bash supabase/tests/pharmacy/run.sh (50_money_refunds_void_test.sql)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. El candado de la 214 reconoce la anulación autorizada ────────
CREATE OR REPLACE FUNCTION caja_protect_closed_shift()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status text;
BEGIN
  IF OLD.cash_shift_id IS NOT NULL THEN
    SELECT status INTO v_status FROM cash_shifts WHERE id = OLD.cash_shift_id;
  END IF;

  -- Sin turno o con el turno abierto: el pago se edita como siempre.
  IF v_status IS DISTINCT FROM 'closed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Mig 284: anulación autorizada por patient_payment_void (solo ese id,
    -- solo en esta transacción).
    IF current_setting('caja.void_payment_id', true) = OLD.id::text THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION
      'Este pago pertenece a una caja ya cerrada y no se puede eliminar. Registra una devolución o un movimiento de caja en el turno abierto.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.amount         IS DISTINCT FROM OLD.amount
  OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
  OR NEW.tender_kind    IS DISTINCT FROM OLD.tender_kind
  OR NEW.payment_date   IS DISTINCT FROM OLD.payment_date
  OR NEW.cash_shift_id  IS DISTINCT FROM OLD.cash_shift_id THEN
    RAISE EXCEPTION
      'Este pago pertenece a una caja ya cerrada: no se puede cambiar el monto, el método, la fecha ni el turno. Corrige con un movimiento de caja en el turno abierto.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION caja_protect_closed_shift() FROM PUBLIC, anon, authenticated;

-- ── 2. La RPC ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION patient_payment_void(
  p_payment_id uuid,
  p_reason     text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_pay      patient_payments%ROWTYPE;
  v_shift    text;
  v_links    int := 0;
  v_tz       text;
  v_who      text;
  v_stamp    text;
  v_reason   text := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Escribe el motivo de la anulación (mínimo 5 caracteres).'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_pay FROM patient_payments WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pago no encontrado' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT is_org_admin(v_pay.organization_id) THEN
    RAISE EXCEPTION 'Solo dirección (owner/admin) puede anular un pago.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF COALESCE(v_pay.source, 'clinical') <> 'clinical' OR v_pay.sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Es un cobro de Farmacia: se anula desde la venta, no desde aquí.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_pay.treatment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Es un cobro de tratamiento: elimínalo desde la ficha del tratamiento.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_pay.einvoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este pago tiene un comprobante emitido. Anúlalo con una nota de crédito antes.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM cash_movements cm WHERE cm.payment_id = v_pay.id) THEN
    RAISE EXCEPTION 'Este pago ya tiene una devolución registrada en Caja: no se puede anular.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- Pagos en línea (Culqi, mig 229): la tabla puede no existir en bases de prueba.
  IF to_regclass('public.payment_links') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM payment_links WHERE patient_payment_id = $1'
      INTO v_links USING v_pay.id;
    IF v_links > 0 THEN
      RAISE EXCEPTION 'Este pago vino de un link de pago en línea: no se anula a mano.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF v_pay.cash_shift_id IS NOT NULL THEN
    SELECT status INTO v_shift FROM cash_shifts WHERE id = v_pay.cash_shift_id;
    IF v_shift = 'closed' AND COALESCE(v_pay.tender_kind, 'efectivo') = 'efectivo' THEN
      RAISE EXCEPTION 'Es un pago en efectivo de un turno de caja ya cerrado: el arqueo está firmado. Regístralo como egreso en el turno abierto.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Rastro antes de borrar (en hora de la org).
  SELECT COALESCE(NULLIF(btrim(o.timezone), ''), 'America/Lima') INTO v_tz
    FROM organizations o WHERE o.id = v_pay.organization_id;
  -- to_jsonb(u): el nombre si está en los metadatos, si no el correo; y no
  -- depende de que la columna exista (bases de prueba con auth.users mínimo).
  SELECT COALESCE(NULLIF(btrim(to_jsonb(u)->'raw_user_meta_data'->>'full_name'), ''), u.email) INTO v_who
    FROM auth.users u WHERE u.id = v_uid;
  v_stamp := '[Pago anulado]: S/' || trim(to_char(v_pay.amount, 'FM999999990.00'))
          || COALESCE(' ' || NULLIF(btrim(v_pay.payment_method), ''), '')
          || ' del ' || to_char(v_pay.payment_date, 'DD/MM/YYYY')
          || CASE WHEN v_shift = 'closed' THEN ' (turno cerrado)' ELSE '' END
          || ' — motivo: ' || v_reason
          || ' — por ' || COALESCE(v_who, 'admin')
          || ' el ' || to_char(now() AT TIME ZONE COALESCE(v_tz, 'America/Lima'), 'DD/MM/YYYY HH24:MI');

  IF v_pay.appointment_id IS NOT NULL THEN
    UPDATE appointments
       SET notes = COALESCE(notes || E'\n', '') || v_stamp
     WHERE id = v_pay.appointment_id;
  ELSIF v_pay.patient_id IS NOT NULL THEN
    UPDATE patients
       SET notes = COALESCE(notes || E'\n', '') || v_stamp
     WHERE id = v_pay.patient_id;
  END IF;

  -- Pasa el candado de la 214 solo para este id y solo en esta transacción.
  PERFORM set_config('caja.void_payment_id', v_pay.id::text, true);
  DELETE FROM patient_payments WHERE id = v_pay.id;
  PERFORM set_config('caja.void_payment_id', '', true);

  RETURN json_build_object(
    'ok', true,
    'amount', v_pay.amount,
    'appointment_id', v_pay.appointment_id,
    'patient_id', v_pay.patient_id,
    'shift_was_closed', (v_shift = 'closed')
  );
END;
$$;

REVOKE ALL ON FUNCTION patient_payment_void(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION patient_payment_void(uuid, text) TO authenticated;

COMMENT ON FUNCTION patient_payment_void(uuid, text) IS
  'Mig 284: anula (borra con rastro) un pago clínico registrado por error. Solo owner/admin; nunca Farmacia, tratamiento, con comprobante, con devolución, ni efectivo de turno cerrado. Deja nota [Pago anulado] en la cita o la ficha.';
