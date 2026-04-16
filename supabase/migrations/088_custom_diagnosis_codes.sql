-- =============================================
-- Migration 088: Custom CIE-10 diagnosis codes per organization
--
-- Allows clinics to extend the static CIE-10 catalog (~160 codes) with
-- specialty-specific or uncommon codes needed by their doctors.
-- The clinical note CIE-10 search merges the global catalog with the
-- org's custom codes.
-- =============================================

CREATE TABLE IF NOT EXISTS custom_diagnosis_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  specialty_id UUID REFERENCES specialties(id) ON DELETE SET NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, code)
);

CREATE INDEX IF NOT EXISTS idx_custom_diagnosis_codes_org
  ON custom_diagnosis_codes(organization_id);
CREATE INDEX IF NOT EXISTS idx_custom_diagnosis_codes_specialty
  ON custom_diagnosis_codes(specialty_id);

ALTER TABLE custom_diagnosis_codes ENABLE ROW LEVEL SECURITY;

-- Org members can read their org's custom codes
CREATE POLICY "custom_diagnosis_codes: org members can read"
  ON custom_diagnosis_codes FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

-- Admins and owners can insert
CREATE POLICY "custom_diagnosis_codes: admins can insert"
  ON custom_diagnosis_codes FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- Admins and owners can update
CREATE POLICY "custom_diagnosis_codes: admins can update"
  ON custom_diagnosis_codes FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- Admins and owners can delete
CREATE POLICY "custom_diagnosis_codes: admins can delete"
  ON custom_diagnosis_codes FOR DELETE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );
