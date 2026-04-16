-- =============================================
-- Migration 087: Patient antecedents (allergies, conditions, medications)
--
-- Normalized tables for clinical context that doctors need to see
-- when writing a new clinical note. Replaces the need to navigate
-- away from the note panel to check patient history.
-- =============================================

-- ─── Patient Allergies ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_allergies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  substance TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'moderada'
    CHECK (severity IN ('leve', 'moderada', 'severa')),
  reaction TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  reported_by UUID REFERENCES doctors(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_allergies_patient
  ON patient_allergies(patient_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_patient_allergies_org
  ON patient_allergies(organization_id);

ALTER TABLE patient_allergies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_allergies: org members can read"
  ON patient_allergies FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_allergies: doctors and admins can insert"
  ON patient_allergies FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_allergies: doctors and admins can update"
  ON patient_allergies FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_allergies: admins can delete"
  ON patient_allergies FOR DELETE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- ─── Patient Conditions (chronic, personal history, family history) ─
CREATE TABLE IF NOT EXISTS patient_conditions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  condition_name TEXT NOT NULL,
  icd_code TEXT,
  condition_type TEXT NOT NULL
    CHECK (condition_type IN ('chronic', 'personal', 'family')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved', 'managed')),
  diagnosed_date DATE,
  family_member TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_conditions_patient
  ON patient_conditions(patient_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_patient_conditions_org
  ON patient_conditions(organization_id);

ALTER TABLE patient_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_conditions: org members can read"
  ON patient_conditions FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_conditions: doctors and admins can insert"
  ON patient_conditions FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_conditions: doctors and admins can update"
  ON patient_conditions FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_conditions: admins can delete"
  ON patient_conditions FOR DELETE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- ─── Patient Medications ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_medications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  medication_name TEXT NOT NULL,
  dosage TEXT,
  frequency TEXT,
  route TEXT,
  start_date DATE,
  end_date DATE,
  prescribing_doctor_id UUID REFERENCES doctors(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_medications_patient
  ON patient_medications(patient_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_patient_medications_org
  ON patient_medications(organization_id);

ALTER TABLE patient_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient_medications: org members can read"
  ON patient_medications FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_medications: doctors and admins can insert"
  ON patient_medications FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_medications: doctors and admins can update"
  ON patient_medications FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "patient_medications: admins can delete"
  ON patient_medications FOR DELETE
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );
