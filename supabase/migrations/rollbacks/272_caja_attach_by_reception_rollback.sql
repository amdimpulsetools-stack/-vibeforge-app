-- Rollback 272: vuelve caja_attach_payment a "solo admin" (cuerpo de la 215).
-- Las columnas de rastro se conservan (no se pierde quién atribuyó qué);
-- borrarlas es opcional: ALTER TABLE patient_payments DROP COLUMN cash_attached_by, DROP COLUMN cash_attached_at;

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
