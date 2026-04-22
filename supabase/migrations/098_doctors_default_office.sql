-- =============================================
-- MIGRATION 098: doctors.default_office_id
-- =============================================
-- Admin-controlled default consultorio per doctor. Removes the
-- office picker from the public /book flow — patients shouldn't
-- be choosing rooms.
--
-- Resolution order at booking time:
--   1. doctor.default_office_id (explicit)
--   2. first office in the org (alphabetical by name)
--
-- Nullable because most single-office clinics don't need to pick,
-- and to keep the column safe to roll back.

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS default_office_id UUID
    REFERENCES offices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doctors_default_office
  ON doctors (default_office_id)
  WHERE default_office_id IS NOT NULL;
