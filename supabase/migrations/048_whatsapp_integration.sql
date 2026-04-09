-- ============================================================================
-- WhatsApp Business API Integration Tables
-- ============================================================================

-- 1. whatsapp_config — WABA configuration per organization
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  waba_id       text,                          -- WhatsApp Business Account ID
  phone_number_id text,                        -- Registered phone number ID in Meta
  access_token  text,                          -- Permanent token from Meta (encrypt at app level)
  webhook_verify_token text,                   -- Token for webhook verification
  business_verified boolean NOT NULL DEFAULT false,
  messaging_tier text NOT NULL DEFAULT '250',  -- 250 / 1K / 10K / 100K per day
  is_active     boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

ALTER TABLE whatsapp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_config: org members can read"
  ON whatsapp_config FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "whatsapp_config: org admins can manage"
  ON whatsapp_config FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
    )
  );

-- 2. whatsapp_templates — Templates submitted to Meta for approval
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_templates (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  local_template_id  uuid REFERENCES email_templates(id) ON DELETE SET NULL,
  meta_template_name text NOT NULL,             -- Name in Meta (lowercase, underscores only)
  meta_template_id   text,                      -- ID returned by Meta after submission
  category           text NOT NULL DEFAULT 'UTILITY' CHECK (category IN ('UTILITY', 'MARKETING', 'AUTHENTICATION')),
  language           text NOT NULL DEFAULT 'es',
  status             text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED')),
  rejection_reason   text,
  header_type        text NOT NULL DEFAULT 'NONE' CHECK (header_type IN ('NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT')),
  header_content     text,                      -- URL or text for header
  body_text          text NOT NULL DEFAULT '',   -- Body with {{1}}, {{2}}, {{3}}...
  footer_text        text,                       -- Small text at bottom
  buttons            jsonb DEFAULT '[]'::jsonb,  -- Array: call-to-action, quick-reply, URL
  variable_mapping   jsonb DEFAULT '{}'::jsonb,  -- Maps {{1}} → paciente_nombre, {{2}} → fecha_cita...
  sample_values      jsonb DEFAULT '{}'::jsonb,  -- Sample values required by Meta for review
  submitted_at       timestamptz,
  reviewed_at        timestamptz,
  last_synced_at     timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_templates: org members can read"
  ON whatsapp_templates FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "whatsapp_templates: org admins can manage"
  ON whatsapp_templates FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
    )
  );

CREATE INDEX idx_wa_templates_org ON whatsapp_templates(organization_id);
CREATE INDEX idx_wa_templates_status ON whatsapp_templates(organization_id, status);

-- 3. whatsapp_message_logs — Log of each message sent
-- ============================================================================

CREATE TABLE IF NOT EXISTS whatsapp_message_logs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id      uuid REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  recipient_phone  text NOT NULL,
  patient_id       uuid REFERENCES patients(id) ON DELETE SET NULL,
  appointment_id   uuid REFERENCES appointments(id) ON DELETE SET NULL,
  wamid            text,                       -- WhatsApp Message ID
  status           text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'read', 'failed')),
  error_code       text,
  error_message    text,
  cost             numeric(10,4),              -- Cost per message (Meta charges per conversation)
  sent_at          timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz,
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE whatsapp_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "whatsapp_message_logs: org members can read"
  ON whatsapp_message_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "whatsapp_message_logs: org admins can insert"
  ON whatsapp_message_logs FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
    )
  );

CREATE INDEX idx_wa_message_logs_org ON whatsapp_message_logs(organization_id);
CREATE INDEX idx_wa_message_logs_appointment ON whatsapp_message_logs(appointment_id);
CREATE INDEX idx_wa_message_logs_wamid ON whatsapp_message_logs(wamid);

-- Updated_at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_whatsapp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER whatsapp_config_updated_at
  BEFORE UPDATE ON whatsapp_config
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();

CREATE TRIGGER whatsapp_templates_updated_at
  BEFORE UPDATE ON whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION update_whatsapp_updated_at();
