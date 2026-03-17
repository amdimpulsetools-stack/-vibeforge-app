-- ============================================================================
-- Clinical Notes (Historia Clínica) — SOAP Format
-- ============================================================================
-- Notas clínicas vinculadas a citas con formato SOAP:
--   S = Subjective (lo que reporta el paciente)
--   O = Objective (hallazgos del examen, signos vitales)
--   A = Assessment (diagnóstico / impresión clínica)
--   P = Plan (tratamiento, indicaciones, seguimiento)
-- ============================================================================

-- 1. clinical_notes — Una nota por cita
-- ============================================================================

CREATE TABLE IF NOT EXISTS clinical_notes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  patient_id      uuid REFERENCES patients(id) ON DELETE SET NULL,
  doctor_id       uuid NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- SOAP fields
  subjective      text NOT NULL DEFAULT '',
  objective       text NOT NULL DEFAULT '',
  assessment      text NOT NULL DEFAULT '',
  plan            text NOT NULL DEFAULT '',

  -- Extras
  diagnosis_code  text,                     -- CIE-10 code (optional)
  diagnosis_label text,                     -- Human-readable diagnosis name
  is_signed       boolean NOT NULL DEFAULT false,
  signed_at       timestamptz,

  -- Vitals (stored as structured JSONB for flexibility)
  vitals          jsonb DEFAULT '{}',
  -- Expected shape: { weight_kg, height_cm, temp_c, bp_systolic, bp_diastolic, heart_rate, resp_rate, spo2 }

  -- Internal notes (not visible to patient in future portal)
  internal_notes  text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One clinical note per appointment
  UNIQUE (appointment_id)
);

ALTER TABLE clinical_notes ENABLE ROW LEVEL SECURITY;

-- ── RLS Policies ────────────────────────────────────────────────────────────

-- Org members can read clinical notes
CREATE POLICY "clinical_notes: org members can read"
  ON clinical_notes FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Doctors can insert notes for their own appointments
CREATE POLICY "clinical_notes: doctors can insert own"
  ON clinical_notes FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND doctor_id IN (
      SELECT id FROM doctors WHERE user_id = auth.uid()
    )
  );

-- Doctors can update their own unsigned notes; admins can update any
CREATE POLICY "clinical_notes: doctor update own or admin"
  ON clinical_notes FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
    AND (
      -- Doctor updating own unsigned note
      (
        doctor_id IN (SELECT id FROM doctors WHERE user_id = auth.uid())
        AND is_signed = false
      )
      -- Or org admin can update any
      OR organization_id IN (
        SELECT organization_id FROM organization_members
        WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
      )
    )
  );

-- Only admins can delete clinical notes
CREATE POLICY "clinical_notes: admin delete"
  ON clinical_notes FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
    )
  );

-- ── Triggers ────────────────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at_clinical_notes
  BEFORE UPDATE ON clinical_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX idx_clinical_notes_org ON clinical_notes(organization_id);
CREATE INDEX idx_clinical_notes_patient ON clinical_notes(patient_id);
CREATE INDEX idx_clinical_notes_doctor ON clinical_notes(doctor_id);
CREATE INDEX idx_clinical_notes_appointment ON clinical_notes(appointment_id);
