-- Pendiente de aplicar en producción
--
-- ═══════════════════════════════════════════════════════════════════
-- 272: Caja — recepción también pasa a SU caja los cobros "fuera de turno"
--
-- Caso real (Dra. Patricia, 26-sep-2026): Melissa cobró S/ 200 en efectivo
-- a las 07:36, antes de abrir su caja. El cobro quedó sin turno y ella no
-- tenía cómo meterlo al arqueo: la bandeja "Fuera de turno" vivía en
-- Historial (solo admin) y `caja_attach_payment` (mig 215) rechazaba a
-- cualquiera que no fuera owner/admin. Resultado: su arqueo iba a dar un
-- sobrante de S/ 200 que nadie podía explicar.
--
-- Qué cambia en `caja_attach_payment` (misma firma, mismo GRANT):
--   · owner/admin: igual que antes (cualquier cobro sin turno de la org, a
--     cualquier turno ABIERTO de la org).
--   · recepción (receptionist y los heredados assistant/member, mismos roles
--     que pueden abrir caja en la 215): solo a un turno que ella puede
--     operar — con shift_scope 'user', el que ella abrió; con
--     'organization', la caja de la clínica — y solo cobros de los últimos
--     7 días registrados con el módulo encendido. Un cobro viejo de cuando
--     Caja estaba apagada no se mete en el arqueo de hoy: eso lo decide un
--     admin.
--   · el médico sigue sin tocar la caja (no la abre, no atribuye).
--   · FOR UPDATE sobre pago y turno: no se cruza con un cierre de caja en
--     curso (caja_close_shift bloquea el mismo turno).
--   · Rastro: quién y cuándo pasó el cobro al turno
--     (patient_payments.cash_attached_by / cash_attached_at).
--
-- No cambia el dinero: el cobro ya existía (monto, fecha, medio, autor);
-- solo gana el turno en el que se cuenta. Aditiva e idempotente.
-- Rollback: rollbacks/272_caja_attach_by_reception_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS cash_attached_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cash_attached_at timestamptz;

COMMENT ON COLUMN patient_payments.cash_attached_by IS
  'Mig 272: quién atribuyó este cobro "fuera de turno" a un turno de caja (NULL = lo ató el trigger al registrarse).';

CREATE OR REPLACE FUNCTION caja_attach_payment(p_payment uuid, p_shift uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_pay       patient_payments%ROWTYPE;
  v_shift     cash_shifts%ROWTYPE;
  v_is_admin  boolean;
  v_role      text;
  v_scope     text;
  v_since     timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión no válida.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_pay FROM patient_payments WHERE id = p_payment FOR UPDATE;
  IF NOT FOUND OR v_pay.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'Pago no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  v_is_admin := is_org_admin(v_pay.organization_id);
  IF NOT v_is_admin THEN
    SELECT role INTO v_role
      FROM organization_members
     WHERE organization_id = v_pay.organization_id
       AND user_id = v_uid
       AND is_active = true;
    IF v_role IS NULL OR v_role NOT IN ('receptionist','assistant','member') THEN
      RAISE EXCEPTION 'Tu rol no puede atribuir cobros a la caja.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  IF v_pay.cash_shift_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este pago ya pertenece a un turno de caja.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_shift FROM cash_shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno de caja no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_shift.organization_id <> v_pay.organization_id THEN
    RAISE EXCEPTION 'El pago y el turno son de organizaciones distintas.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_shift.status <> 'open' THEN
    RAISE EXCEPTION 'Solo se puede atribuir un pago a una caja abierta.' USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_is_admin THEN
    SELECT shift_scope INTO v_scope FROM cash_settings WHERE organization_id = v_pay.organization_id;
    IF v_scope IS DISTINCT FROM 'organization' AND v_shift.opened_by <> v_uid THEN
      RAISE EXCEPTION 'Solo puedes pasar cobros a tu propia caja.' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Módulo encendido: desde la última activación del addon (reactivar
    -- actualiza activated_at) y nunca antes de la configuración de Caja.
    SELECT GREATEST(cs.activated_at, oa.activated_at) INTO v_since
      FROM cash_settings cs
      LEFT JOIN organization_addons oa
        ON oa.organization_id = cs.organization_id AND oa.addon_key = 'caja'
     WHERE cs.organization_id = v_pay.organization_id;

    IF v_pay.created_at < COALESCE(v_since, v_pay.created_at)
       OR v_pay.created_at < now() - interval '7 days' THEN
      RAISE EXCEPTION 'Este cobro es anterior al módulo Caja o tiene más de 7 días: pide a un administrador que lo atribuya.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  UPDATE patient_payments
     SET cash_shift_id    = p_shift,
         cash_attached_by = v_uid,
         cash_attached_at = now()
   WHERE id = p_payment;
END $$;

REVOKE ALL ON FUNCTION caja_attach_payment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION caja_attach_payment(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION caja_attach_payment(uuid, uuid) IS
  'Caja (mig 215, ampliada en 272): atribuye un cobro sin turno a un turno ABIERTO. Admin: cualquiera de la org. Recepción: solo a su caja (o la de la clínica si el scope es organization), cobros de los últimos 7 días con el módulo encendido. Deja rastro en cash_attached_by/at.';
