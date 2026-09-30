-- Rollback 274: quita la pre-reserva (trigger de confirmación, guardia,
-- RPC de liberar, helper, política de DELETE), devuelve los triggers de
-- cierre de la 273 a su forma original y devuelve el CHECK de kinds de
-- org_whatsapp_clipboard_templates a los 3 de la mig 139.
--
-- 1. Plantillas: las filas de los kinds nuevos (reschedule_notice,
--    reschedule_coordinate, prereserva) se BORRAN para poder restaurar el
--    CHECK original. Son solo el texto personalizado por la org; los
--    textos por defecto viven en el código (lib/whatsapp-clipboard-config.ts).
--    Si quieres conservarlos, cópialos antes:
--      -- SELECT organization_id, kind, template FROM org_whatsapp_clipboard_templates
--      --  WHERE kind IN ('reschedule_notice','reschedule_coordinate','prereserva');
-- 2. Las columnas se CONSERVAN (appointments.hold_expires_at y las dos de
--    scheduler_settings, con sus CHECK e índice): dicen qué citas eran
--    pre-reservas. Sin el trigger, un pago ya NO confirma una pre-reserva;
--    revierte también la UI que las lee (o confírmalas todas con
--      -- UPDATE appointments SET hold_expires_at = NULL WHERE hold_expires_at IS NOT NULL;
--    ). Borrarlas es opcional:
--      -- DROP INDEX IF EXISTS idx_appointments_hold_expires;
--      -- ALTER TABLE appointments DROP COLUMN IF EXISTS hold_expires_at;
--      -- ALTER TABLE scheduler_settings
--      --   DROP CONSTRAINT IF EXISTS scheduler_settings_prereserva_color_check,
--      --   DROP CONSTRAINT IF EXISTS scheduler_settings_prereserva_minutes_check,
--      --   DROP COLUMN IF EXISTS prereserva_color,
--      --   DROP COLUMN IF EXISTS prereserva_default_minutes;
-- 3. Las citas ya liberadas (borradas) no se recuperan: liberar era borrar
--    un horario sin pagos ni datos clínicos.
-- No depende de la 273 (se puede correr antes o después de su rollback).
-- Idempotente.

DROP TRIGGER IF EXISTS trg_patient_payments_confirm_prereserva_insert ON patient_payments;
DROP TRIGGER IF EXISTS trg_patient_payments_confirm_prereserva_move ON patient_payments;

DROP POLICY IF EXISTS org_delete_appointments_prereserva_release ON appointments;

DROP TRIGGER IF EXISTS trg_appointments_hold_guard ON appointments;
DROP FUNCTION IF EXISTS appointments_hold_guard();

-- "Por reprogramar" (273): vuelven los WHEN originales (sin la condición
-- de pre-reserva) y se quita el cierre al confirmar una pre-reserva.
DROP TRIGGER IF EXISTS trg_appointments_hold_confirmed_close ON appointments;
DO $$
BEGIN
  IF to_regprocedure('public.close_reschedule_pending_followups()') IS NULL THEN
    RETURN;
  END IF;
  DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_insert ON appointments;
  CREATE TRIGGER trg_appointments_reschedule_close_insert
    AFTER INSERT ON appointments
    FOR EACH ROW
    WHEN (NEW.patient_id IS NOT NULL AND NEW.status IN ('scheduled', 'confirmed', 'completed'))
    EXECUTE FUNCTION close_reschedule_pending_followups('new');

  DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_link ON appointments;
  CREATE TRIGGER trg_appointments_reschedule_close_link
    AFTER UPDATE OF rescheduled_from_id ON appointments
    FOR EACH ROW
    WHEN (
      NEW.patient_id IS NOT NULL
      AND NEW.rescheduled_from_id IS NOT NULL
      AND NEW.rescheduled_from_id IS DISTINCT FROM OLD.rescheduled_from_id
      AND NEW.status IN ('scheduled', 'confirmed', 'completed')
    )
    EXECUTE FUNCTION close_reschedule_pending_followups('new');
END $$;

DROP FUNCTION IF EXISTS appointment_release_hold(uuid);
DROP FUNCTION IF EXISTS appointment_hold_release_blocker(uuid);
DROP FUNCTION IF EXISTS patient_payments_confirm_prereserva();

DO $$
DECLARE
  v_con record;
BEGIN
  IF to_regclass('public.org_whatsapp_clipboard_templates') IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM org_whatsapp_clipboard_templates
   WHERE kind IN ('reschedule_notice', 'reschedule_coordinate', 'prereserva');
  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'kind'
     WHERE c.conrelid = 'public.org_whatsapp_clipboard_templates'::regclass
       AND c.contype = 'c'
       AND c.conkey = ARRAY[a.attnum]
  LOOP
    EXECUTE format('ALTER TABLE org_whatsapp_clipboard_templates DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
  ALTER TABLE org_whatsapp_clipboard_templates
    ADD CONSTRAINT org_whatsapp_clipboard_templates_kind_check
    CHECK (kind IN ('post_appointment', 'second_consultation_followup', 'budget_followup'));
END $$;
