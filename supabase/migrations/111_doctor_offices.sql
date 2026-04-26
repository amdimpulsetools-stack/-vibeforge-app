-- ============================================================================
-- Migration 111: doctor_offices (authorized offices per doctor)
-- ============================================================================
--
-- Problem: doctor_schedules.office_id was mixing two distinct questions:
--   1) Which offices is this doctor allowed to use? (doctor attribute)
--   2) Which specific office is this shift held in?  (block attribute)
--
-- That made it impossible to express "Dr. Angela works in rooms 202 and 203
-- Mon-Fri 9-13" without colliding with the UNIQUE(doctor_id, day_of_week,
-- start_time) constraint, since two blocks would share the same key.
--
-- Fix: split question 1 into its own table doctor_offices.
--   - doctor_offices = global list of allowed offices per doctor.
--   - doctor_schedules.office_id stays optional, as a per-shift override.
--     If NULL, the shift inherits the doctor's authorized offices.
--     If NOT NULL, that shift is restricted to that specific office.
--
-- A doctor with NO rows in doctor_offices means "all offices" (default
-- permissive, preserves existing behavior).
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doctor_id, office_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_offices_doctor ON doctor_offices(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_offices_office ON doctor_offices(office_id);
CREATE INDEX IF NOT EXISTS idx_doctor_offices_org ON doctor_offices(organization_id);

ALTER TABLE doctor_offices ENABLE ROW LEVEL SECURITY;

-- RLS: same access pattern as doctor_schedules. Members read, admins write.
DROP POLICY IF EXISTS "org_select_doctor_offices" ON doctor_offices;
CREATE POLICY "org_select_doctor_offices" ON doctor_offices FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "org_insert_doctor_offices" ON doctor_offices;
CREATE POLICY "org_insert_doctor_offices" ON doctor_offices FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_delete_doctor_offices" ON doctor_offices;
CREATE POLICY "org_delete_doctor_offices" ON doctor_offices FOR DELETE
  USING (is_org_admin(organization_id));

-- No UPDATE policy: rows are immutable composites of (doctor_id, office_id).
-- To "edit" the list, delete the row and insert a new one.

COMMENT ON TABLE doctor_offices IS
  'Authorized offices (rooms) per doctor. Empty set means the doctor can use any office in the org.';
