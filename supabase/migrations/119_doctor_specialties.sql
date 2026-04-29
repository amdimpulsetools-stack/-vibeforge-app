-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 119: Doctor specialties (multi)
--
-- Stores 1+ specialties per doctor. Used by:
--   - Settings → admin tab (visualization).
--   - Future tabs/addon auto-activation that depend on at least one
--     doctor having a specialty (kept out of scope here).
--
-- The clinic-level primary specialty already lives in
-- `organizations.primary_specialty_id` (migration 076). This is the
-- per-doctor refinement.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS doctor_specialties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  specialty TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (doctor_id, specialty)
);

CREATE INDEX IF NOT EXISTS idx_doctor_specialties_doctor
  ON doctor_specialties(doctor_id);

CREATE INDEX IF NOT EXISTS idx_doctor_specialties_primary
  ON doctor_specialties(doctor_id)
  WHERE is_primary = true;

-- One primary per doctor max
CREATE UNIQUE INDEX IF NOT EXISTS uniq_doctor_specialties_primary
  ON doctor_specialties(doctor_id)
  WHERE is_primary = true;

ALTER TABLE doctor_specialties ENABLE ROW LEVEL SECURITY;

-- Read: every member of the org that owns the doctor.
CREATE POLICY "doctor_specialties_select" ON doctor_specialties
  FOR SELECT USING (
    doctor_id IN (
      SELECT d.id FROM doctors d
      WHERE d.organization_id IN (SELECT get_user_org_ids())
    )
  );

-- Insert / Update / Delete: only owner/admin of the org.
CREATE POLICY "doctor_specialties_insert" ON doctor_specialties
  FOR INSERT WITH CHECK (
    doctor_id IN (
      SELECT d.id FROM doctors d
      WHERE d.organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND om.role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "doctor_specialties_update" ON doctor_specialties
  FOR UPDATE USING (
    doctor_id IN (
      SELECT d.id FROM doctors d
      WHERE d.organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND om.role IN ('owner', 'admin')
      )
    )
  );

CREATE POLICY "doctor_specialties_delete" ON doctor_specialties
  FOR DELETE USING (
    doctor_id IN (
      SELECT d.id FROM doctors d
      WHERE d.organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
          AND om.is_active = true
          AND om.role IN ('owner', 'admin')
      )
    )
  );

COMMENT ON TABLE doctor_specialties IS
  'Per-doctor specialty list. Multi-row per doctor; one row may be flagged is_primary.';
