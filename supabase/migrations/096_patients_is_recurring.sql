-- =============================================
-- MIGRATION 096: patients.is_recurring
-- =============================================
-- Boolean flag on patients: true when the patient has >= 2 completed
-- appointments in the same organization. Used for UX (badges in patient
-- list, drawer, scheduler) and segmentation (filters in /patients,
-- marketing campaigns, email template variables).
--
-- Maintained automatically via triggers on appointments.
--
-- Design notes:
-- - This is a "lifetime recurrent" flag: once a patient hits 2 completed
--   appointments they stay flagged, unless status is reverted or appointments
--   are deleted (the trigger handles both cases).
-- - Does NOT replace the dashboard's `recurring_patients_month` metric,
--   which counts within-month multi-visit patients — that is a different
--   concept (operational cadence vs lifetime relationship).
-- - No-shows and cancelled do NOT count; only status='completed'.
-- - Old patients migrated before the scheduler was adopted won't be flagged
--   (they have no appointment history in DB). Staff can flag them later via
--   an admin UI if the need arises.

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;

-- Partial index: only flagged patients, per-org lookups are fast.
CREATE INDEX IF NOT EXISTS idx_patients_is_recurring
  ON patients (organization_id, is_recurring)
  WHERE is_recurring = true;

-- ── Helper ──────────────────────────────────────────────────
-- Recomputes is_recurring for a single patient. SECURITY DEFINER so the
-- trigger can update the row even when the caller's RLS policy wouldn't.
CREATE OR REPLACE FUNCTION refresh_patient_recurring(p_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_patient_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE patients
  SET is_recurring = (
    SELECT COUNT(*) >= 2
    FROM appointments
    WHERE patient_id = p_patient_id
      AND status = 'completed'
  )
  WHERE id = p_patient_id;
END;
$$;

-- ── Trigger function for INSERT/UPDATE ──────────────────────
CREATE OR REPLACE FUNCTION trg_refresh_patient_recurring()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.patient_id IS NOT NULL THEN
    PERFORM refresh_patient_recurring(NEW.patient_id);
  END IF;

  -- If the patient_id changed on UPDATE, refresh the previous one too.
  IF TG_OP = 'UPDATE'
     AND OLD.patient_id IS DISTINCT FROM NEW.patient_id
     AND OLD.patient_id IS NOT NULL THEN
    PERFORM refresh_patient_recurring(OLD.patient_id);
  END IF;

  RETURN NEW;
END;
$$;

-- ── Trigger function for DELETE ─────────────────────────────
CREATE OR REPLACE FUNCTION trg_refresh_patient_recurring_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.patient_id IS NOT NULL THEN
    PERFORM refresh_patient_recurring(OLD.patient_id);
  END IF;
  RETURN OLD;
END;
$$;

-- ── Attach triggers ─────────────────────────────────────────
DROP TRIGGER IF EXISTS refresh_recurring_on_appointment_insert ON appointments;
CREATE TRIGGER refresh_recurring_on_appointment_insert
  AFTER INSERT ON appointments
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION trg_refresh_patient_recurring();

DROP TRIGGER IF EXISTS refresh_recurring_on_appointment_update ON appointments;
CREATE TRIGGER refresh_recurring_on_appointment_update
  AFTER UPDATE OF status, patient_id ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_patient_recurring();

DROP TRIGGER IF EXISTS refresh_recurring_on_appointment_delete ON appointments;
CREATE TRIGGER refresh_recurring_on_appointment_delete
  AFTER DELETE ON appointments
  FOR EACH ROW
  WHEN (OLD.status = 'completed')
  EXECUTE FUNCTION trg_refresh_patient_recurring_delete();

-- ── Backfill ────────────────────────────────────────────────
-- One-shot: mark every patient that already has >= 2 completed appointments.
UPDATE patients
SET is_recurring = true
WHERE id IN (
  SELECT patient_id
  FROM appointments
  WHERE patient_id IS NOT NULL
    AND status = 'completed'
  GROUP BY patient_id
  HAVING COUNT(*) >= 2
);
