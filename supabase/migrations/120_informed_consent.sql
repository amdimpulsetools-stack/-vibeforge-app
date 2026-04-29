-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 120: Informed consent — digital signature MVP
--
-- Peru: Ley 29414 + DS 027-2015-SA require WRITTEN informed consent
-- for any procedure with non-trivial risk. Migration 102 already
-- ships the per-service `requires_consent` flag and a checkbox on the
-- clinical note. This migration adds the actual "captured" artifact:
-- a signed document (PDF/HTML) with patient-typed name or drawn
-- signature, generated server-side.
--
-- Tier 2 (PDF templates, voiding, multi-language) is out of scope —
-- see COMING-UPDATES.md.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS informed_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL CHECK (
    consent_type IN ('general', 'procedimiento', 'tratamiento', 'fotografias')
  ),
  procedure_description TEXT NOT NULL,
  risks_explained TEXT,
  signed_by_patient_name TEXT NOT NULL,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_method TEXT NOT NULL CHECK (signature_method IN ('typed', 'drawn')),
  signature_data TEXT,
  pdf_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_informed_consents_patient
  ON informed_consents(patient_id);
CREATE INDEX IF NOT EXISTS idx_informed_consents_org
  ON informed_consents(organization_id);
CREATE INDEX IF NOT EXISTS idx_informed_consents_appointment
  ON informed_consents(appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE informed_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "informed_consents_select" ON informed_consents
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
CREATE POLICY "informed_consents_insert" ON informed_consents
  FOR INSERT WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
-- No UPDATE / DELETE policies — consents are append-only by design.
-- Voiding is a planned tier-2 column (voided_at + voided_reason),
-- intentionally NOT shipped here.

COMMENT ON TABLE informed_consents IS
  'Append-only registry of digitally-signed informed consents. PDF/HTML artifact lives in storage bucket informed-consents.';

-- ─── Storage bucket for the signed artifact ───────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'informed-consents',
  'informed-consents',
  false,
  10485760,
  ARRAY['application/pdf', 'text/html']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: only members of the org can read/write inside their
-- own org folder. Path convention: <organization_id>/<consent_id>.<ext>.
CREATE POLICY "informed_consents_storage_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'informed-consents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );

CREATE POLICY "informed_consents_storage_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'informed-consents'
    AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
  );
