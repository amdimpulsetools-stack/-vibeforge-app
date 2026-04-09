-- ============================================
-- Specialty clinical data (future module storage)
-- ============================================

-- Generic table to store specialty-specific clinical data
-- Each specialty module will use this with different data_type values
CREATE TABLE IF NOT EXISTS specialty_clinical_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  specialty_id UUID NOT NULL REFERENCES specialties(id),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  data_type TEXT NOT NULL,       -- e.g. "growth_chart", "cycle_tracking", "odontogram"
  data JSONB NOT NULL DEFAULT '{}',
  recorded_at TIMESTAMPTZ DEFAULT now(),
  recorded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_scd_patient ON specialty_clinical_data(patient_id);
CREATE INDEX IF NOT EXISTS idx_scd_org_specialty ON specialty_clinical_data(organization_id, specialty_id);
CREATE INDEX IF NOT EXISTS idx_scd_data_type ON specialty_clinical_data(data_type);

ALTER TABLE specialty_clinical_data ENABLE ROW LEVEL SECURITY;

-- Members can read clinical data from their org
CREATE POLICY "scd_read" ON specialty_clinical_data
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
  );

-- Owner/admin/doctors can insert/update clinical data
CREATE POLICY "scd_write" ON specialty_clinical_data
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "scd_update" ON specialty_clinical_data
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

-- Nobody deletes clinical data (for audit/legal compliance)
-- Only founders via service_role can purge if needed
