-- Rollback 284: quita la RPC de anulación y devuelve el candado de la 214 a
-- su cuerpo original (sin el GUC caja.void_payment_id). Idempotente; no toca datos.

DROP FUNCTION IF EXISTS patient_payment_void(uuid, text);

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

  IF v_status IS DISTINCT FROM 'closed' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
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
