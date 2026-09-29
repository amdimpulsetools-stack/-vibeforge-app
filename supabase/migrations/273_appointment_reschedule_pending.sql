-- Pendiente de aplicar en producción
--
-- ═══════════════════════════════════════════════════════════════════
-- 273: Cita cancelada "pendiente de reprogramar" → seguimiento
--
-- Caso real (Vitra, sep-2026): recepción llama a la paciente, le cancela
-- la cita y todavía no hay fecha nueva. La cita cancelada desaparece de
-- la agenda y la paciente se pierde: no había dónde "dejarla" para no
-- olvidar reprogramarla.
--
-- Qué hace:
--   · appointments.reschedule_pending: la marca que pone recepción al
--     cancelar ("La paciente queda pendiente de reprogramar").
--   · Al quedar cancelada + marcada, un trigger crea UN seguimiento en la
--     bandeja existente (clinical_followups, rule_key
--     'core.reschedule_pending', source 'system'). Uno por paciente: si ya
--     tiene uno abierto, no se duplica.
--   · En cuanto la paciente tiene una cita viva nueva (o se reactiva la
--     misma), el seguimiento se cierra solo (cerrado_manual, motivo
--     'reprogramada') y sale de la bandeja.
--
-- Por qué cerrado_manual y no agendado_*: los estados agendado_* alimentan
-- los KPIs de recuperación (tasa, revenue atribuido × LTV del addon de
-- fertilidad). Reprogramar una cita cancelada por la clínica no es
-- "recuperar" a una paciente perdida; no debe inflar esos números. Por lo
-- mismo target_category_canonical queda NULL: la pasada centinela de
-- compute_appointment_attribution (mig 183) no lo toca.
--
-- Dinero y reportes: no cambian. La cita sigue contando como cancelada;
-- el diálogo de devolución (migs 230/233) sigue mandando sobre los pagos.
--
-- SECURITY INVOKER, mismo análisis que mig 187: quien puede actualizar la
-- cita de su org puede insertar/actualizar clinical_followups de esa org
-- (políticas de mig 053, predicado get_user_org_ids()). Los triggers
-- NUNCA bloquean la escritura de la cita (EXCEPTION → WARNING).
--
-- Aditiva e idempotente. Genérica: vale para toda org, no solo fertilidad.
-- Rollback: rollbacks/273_appointment_reschedule_pending_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reschedule_pending boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN appointments.reschedule_pending IS
  'Mig 273: cancelada con la paciente pendiente de reprogramar. Crea un seguimiento core.reschedule_pending.';

-- Bandeja + burbuja de la agenda cuentan los abiertos por org.
CREATE INDEX IF NOT EXISTS idx_clinical_followups_reschedule_open
  ON clinical_followups (organization_id, patient_id)
  WHERE rule_key = 'core.reschedule_pending'
    AND status IN ('pendiente', 'contactado', 'pospuesto');

-- ── 1. Cancelada + marcada → seguimiento ───────────────────────────
CREATE OR REPLACE FUNCTION create_reschedule_pending_followup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_service TEXT;
  v_reason  TEXT;
BEGIN
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Una paciente, un pendiente: dos citas canceladas de la misma paciente
  -- son una sola llamada para reprogramar.
  IF EXISTS (
    SELECT 1 FROM clinical_followups cf
    WHERE cf.organization_id = NEW.organization_id
      AND cf.patient_id = NEW.patient_id
      AND cf.rule_key = 'core.reschedule_pending'
      AND cf.status IN ('pendiente', 'contactado', 'pospuesto')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT s.name INTO v_service FROM services s WHERE s.id = NEW.service_id;

  v_reason := format(
    'Cita del %s%s cancelada — pendiente de reprogramar',
    to_char(NEW.appointment_date, 'DD/MM'),
    CASE WHEN v_service IS NOT NULL AND btrim(v_service) <> ''
         THEN format(' (%s)', v_service) ELSE '' END
  );

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id, appointment_id,
    priority, reason, source, source_type, source_id, rule_key,
    expected_by, follow_up_date, status
  ) VALUES (
    NEW.organization_id, NEW.patient_id, NEW.doctor_id, NEW.id,
    'yellow', v_reason, 'system', 'appointment', NEW.id,
    'core.reschedule_pending',
    now() + interval '7 days', (now() + interval '7 days')::date,
    'pendiente'
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'create_reschedule_pending_followup failed for appointment=%: % / %',
      NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_reschedule_pending ON appointments;
CREATE TRIGGER trg_appointments_reschedule_pending
  AFTER UPDATE ON appointments
  FOR EACH ROW
  WHEN (
    NEW.status = 'cancelled' AND NEW.reschedule_pending
    AND (OLD.status IS DISTINCT FROM 'cancelled' OR NOT OLD.reschedule_pending)
  )
  EXECUTE FUNCTION create_reschedule_pending_followup();

-- ── 2. Cita viva nueva (o la misma reactivada) → se cierra solo ────
CREATE OR REPLACE FUNCTION close_reschedule_pending_followups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE clinical_followups
     SET status         = 'cerrado_manual',
         closure_reason = 'reprogramada',
         closed_at      = now(),
         is_resolved    = true,
         resolved_at    = now(),
         updated_at     = now()
   WHERE organization_id = NEW.organization_id
     AND patient_id = NEW.patient_id
     AND rule_key = 'core.reschedule_pending'
     AND status IN ('pendiente', 'contactado', 'pospuesto');

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'close_reschedule_pending_followups failed for appointment=%: % / %',
      NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_insert ON appointments;
CREATE TRIGGER trg_appointments_reschedule_close_insert
  AFTER INSERT ON appointments
  FOR EACH ROW
  WHEN (NEW.patient_id IS NOT NULL AND NEW.status IN ('scheduled', 'confirmed', 'completed'))
  EXECUTE FUNCTION close_reschedule_pending_followups();

DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_reactivate ON appointments;
CREATE TRIGGER trg_appointments_reschedule_close_reactivate
  AFTER UPDATE ON appointments
  FOR EACH ROW
  WHEN (
    NEW.patient_id IS NOT NULL
    AND OLD.status IN ('cancelled', 'no_show')
    AND NEW.status IN ('scheduled', 'confirmed', 'completed')
  )
  EXECUTE FUNCTION close_reschedule_pending_followups();

COMMENT ON FUNCTION create_reschedule_pending_followup() IS
  'Mig 273: cita cancelada con reschedule_pending → un clinical_followups core.reschedule_pending por paciente. INVOKER; nunca bloquea la cita.';
COMMENT ON FUNCTION close_reschedule_pending_followups() IS
  'Mig 273: la paciente tiene cita viva nueva (o reactivada) → cierra sus core.reschedule_pending abiertos (cerrado_manual/reprogramada). INVOKER; nunca bloquea la cita.';
