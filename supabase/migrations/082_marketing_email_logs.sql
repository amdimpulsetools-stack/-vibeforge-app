-- Log for marketing emails (birthday, follow-up) to prevent duplicates
CREATE TABLE IF NOT EXISTS marketing_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mel_patient_slug ON marketing_email_logs(patient_id, template_slug, sent_at);
CREATE INDEX IF NOT EXISTS idx_mel_org ON marketing_email_logs(organization_id);

ALTER TABLE marketing_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mel_read" ON marketing_email_logs
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
  );
