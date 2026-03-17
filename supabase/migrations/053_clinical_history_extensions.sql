-- ============================================================
-- 053: Clinical History Extensions
-- Treatment plans, prescriptions, attachments, followups, note versions
-- ============================================================

-- ── 1. Treatment Plans ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS treatment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  diagnosis_code text,
  diagnosis_label text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
  total_sessions integer,
  start_date date,
  estimated_end_date date,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE treatment_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "treatment_plans_select" ON treatment_plans
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_plans_insert" ON treatment_plans
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_plans_update" ON treatment_plans
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_plans_delete" ON treatment_plans
  FOR DELETE USING (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX idx_treatment_plans_org ON treatment_plans(organization_id);
CREATE INDEX idx_treatment_plans_patient ON treatment_plans(patient_id);
CREATE INDEX idx_treatment_plans_doctor ON treatment_plans(doctor_id);

-- Treatment Sessions (individual sessions within a plan)
CREATE TABLE IF NOT EXISTS treatment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_plan_id uuid NOT NULL REFERENCES treatment_plans(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  session_number integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'cancelled')),
  notes text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE treatment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "treatment_sessions_select" ON treatment_sessions
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_sessions_insert" ON treatment_sessions
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_sessions_update" ON treatment_sessions
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "treatment_sessions_delete" ON treatment_sessions
  FOR DELETE USING (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX idx_treatment_sessions_plan ON treatment_sessions(treatment_plan_id);

-- ── 2. Prescriptions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  clinical_note_id uuid REFERENCES clinical_notes(id) ON DELETE SET NULL,
  medication text NOT NULL,
  dosage text,
  frequency text,
  duration text,
  route text, -- oral, IM, IV, tópico, etc.
  instructions text,
  quantity text,
  is_active boolean NOT NULL DEFAULT true,
  start_date date,
  end_date date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prescriptions_select" ON prescriptions
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "prescriptions_insert" ON prescriptions
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "prescriptions_update" ON prescriptions
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "prescriptions_delete" ON prescriptions
  FOR DELETE USING (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX idx_prescriptions_patient ON prescriptions(patient_id);
CREATE INDEX idx_prescriptions_doctor ON prescriptions(doctor_id);
CREATE INDEX idx_prescriptions_appointment ON prescriptions(appointment_id);

-- ── 3. Clinical Attachments ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinical_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  clinical_note_id uuid REFERENCES clinical_notes(id) ON DELETE SET NULL,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  file_name text NOT NULL,
  file_type text NOT NULL, -- MIME type
  file_size integer NOT NULL, -- bytes
  storage_path text NOT NULL, -- Supabase Storage path
  category text DEFAULT 'general' CHECK (category IN ('general', 'lab_result', 'imaging', 'referral', 'consent', 'other')),
  description text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clinical_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_attachments_select" ON clinical_attachments
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "clinical_attachments_insert" ON clinical_attachments
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "clinical_attachments_delete" ON clinical_attachments
  FOR DELETE USING (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX idx_clinical_attachments_patient ON clinical_attachments(patient_id);
CREATE INDEX idx_clinical_attachments_note ON clinical_attachments(clinical_note_id);

-- ── 4. Clinical Followups (Semáforo) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clinical_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  clinical_note_id uuid REFERENCES clinical_notes(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'green' CHECK (priority IN ('red', 'yellow', 'green')),
  reason text NOT NULL,
  follow_up_date date,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE clinical_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_followups_select" ON clinical_followups
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "clinical_followups_insert" ON clinical_followups
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "clinical_followups_update" ON clinical_followups
  FOR UPDATE USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "clinical_followups_delete" ON clinical_followups
  FOR DELETE USING (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX idx_clinical_followups_patient ON clinical_followups(patient_id);
CREATE INDEX idx_clinical_followups_priority ON clinical_followups(priority) WHERE NOT is_resolved;
CREATE INDEX idx_clinical_followups_date ON clinical_followups(follow_up_date) WHERE NOT is_resolved;

-- ── 5. Clinical Note Versions (Audit Trail) ─────────────────────────────────

CREATE TABLE IF NOT EXISTS clinical_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_note_id uuid NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  edited_by uuid NOT NULL REFERENCES auth.users(id),
  version_number integer NOT NULL,
  -- Snapshot of SOAP fields at this version
  subjective text,
  objective text,
  assessment text,
  plan text,
  diagnosis_code text,
  diagnosis_label text,
  vitals jsonb DEFAULT '{}',
  internal_notes text,
  change_summary text, -- Brief description of what changed
  created_at timestamptz DEFAULT now(),
  UNIQUE(clinical_note_id, version_number)
);

ALTER TABLE clinical_note_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_note_versions_select" ON clinical_note_versions
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "clinical_note_versions_insert" ON clinical_note_versions
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE INDEX idx_clinical_note_versions_note ON clinical_note_versions(clinical_note_id);

-- ── Triggers ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_treatment_plans') THEN
    CREATE TRIGGER set_updated_at_treatment_plans BEFORE UPDATE ON treatment_plans
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_prescriptions') THEN
    CREATE TRIGGER set_updated_at_prescriptions BEFORE UPDATE ON prescriptions
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_clinical_followups') THEN
    CREATE TRIGGER set_updated_at_clinical_followups BEFORE UPDATE ON clinical_followups
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
