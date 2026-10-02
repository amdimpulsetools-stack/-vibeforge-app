-- Rollback 282: quita el candado de "una cita viva por paciente y horario".
-- Idempotente. No toca datos.
DROP INDEX IF EXISTS uq_appointments_patient_slot_live;
