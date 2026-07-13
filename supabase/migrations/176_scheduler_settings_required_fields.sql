-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 176: configurable "required fields" for the New Appointment
-- modal (per-org, admin-controlled)
--
-- Adds a SPARSE override map to scheduler_settings (mig 068). Each key is
-- a configurable appointment field (patient_phone, patient_email, origin,
-- …) and the boolean says whether that field is MANDATORY when a
-- receptionist creates a new appointment.
--
-- Retro-compatibility by construction: the column DEFAULTS to '{}'::jsonb.
-- With an empty map EVERY key is absent, and an absent key means "use the
-- code default" — i.e. exactly the fields that were obligatory before this
-- migration (nombre, apellido, fecha, hora, doctor, consultorio, servicio)
-- stay obligatory and everything else stays optional. No existing org
-- changes behavior until an admin flips a switch in Configuración → Agenda.
--
-- The map is SPARSE on purpose: only keys an admin explicitly toggled are
-- stored, so future code-default changes still reach orgs that never
-- customized a given field. Server-side this is UX-only in v1 — the DB
-- NOT NULL constraints on `appointments` remain the hard guarantee.
-- Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE scheduler_settings
  ADD COLUMN IF NOT EXISTS required_fields jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN scheduler_settings.required_fields IS
  'Sparse override map field_key→boolean for the New Appointment modal. A present key set to true makes that configurable field mandatory when scheduling; a present false makes it optional; an ABSENT key falls back to the code default (mig 176). Default ''{}'' = byte-identical to the pre-176 behavior. Whitelisted keys: patient_dni, patient_phone, patient_email, patient_birth_date, patient_location, origin, payment_method, responsible, notes.';
