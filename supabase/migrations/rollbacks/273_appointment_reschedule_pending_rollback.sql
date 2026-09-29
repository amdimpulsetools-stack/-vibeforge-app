-- Rollback 273: quita los triggers de "pendiente de reprogramar".
-- Los seguimientos ya creados se conservan (son historia de la bandeja);
-- la columna también, para no perder qué citas se cancelaron así.
-- Borrarla es opcional: ALTER TABLE appointments DROP COLUMN reschedule_pending;

DROP TRIGGER IF EXISTS trg_appointments_reschedule_pending ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_insert ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_reactivate ON appointments;
DROP FUNCTION IF EXISTS create_reschedule_pending_followup();
DROP FUNCTION IF EXISTS close_reschedule_pending_followups();
DROP INDEX IF EXISTS idx_clinical_followups_reschedule_open;
