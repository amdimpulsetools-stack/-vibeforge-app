-- =============================================
-- MIGRATION 095: Restore doctors.specialty
-- =============================================
-- Same root cause as migration 094 (organizations.is_active):
-- application code and the PRD assume doctors has a `specialty` text column,
-- but migration 005 (CREATE TABLE doctors) never declared it and no later
-- migration added it. Endpoints that select `doctors(... specialty ...)`
-- via PostgREST get a 400 error which makes the entire upcoming/past
-- appointments query return null — manifesting as an empty "Mis Citas"
-- view in the patient portal even when the patient has appointments.
--
-- Adding the column as nullable text so existing rows are unaffected;
-- staff can populate it from the admin panel afterwards.

ALTER TABLE doctors
  ADD COLUMN IF NOT EXISTS specialty TEXT;
