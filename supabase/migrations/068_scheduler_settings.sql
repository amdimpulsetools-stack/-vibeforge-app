-- Organization-level scheduler configuration
-- Migrates settings from browser localStorage to persistent database storage

CREATE TABLE IF NOT EXISTS scheduler_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  start_hour      integer NOT NULL DEFAULT 8 CHECK (start_hour >= 0 AND start_hour <= 23),
  end_hour        integer NOT NULL DEFAULT 20 CHECK (end_hour >= 1 AND end_hour <= 24),
  intervals       jsonb NOT NULL DEFAULT '[15]',
  time_indicator  boolean NOT NULL DEFAULT true,
  disabled_weekdays jsonb NOT NULL DEFAULT '[0]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id),
  CHECK (end_hour > start_hour)
);

-- Index
CREATE INDEX idx_scheduler_settings_org ON scheduler_settings(organization_id);

-- RLS
ALTER TABLE scheduler_settings ENABLE ROW LEVEL SECURITY;

-- Members can read their org's scheduler settings
CREATE POLICY "Members can view scheduler settings"
  ON scheduler_settings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Only owner/admin can update scheduler settings
CREATE POLICY "Admins can update scheduler settings"
  ON scheduler_settings FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
    )
  );

-- Owner/admin can insert (first-time setup)
CREATE POLICY "Admins can insert scheduler settings"
  ON scheduler_settings FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true AND role IN ('owner', 'admin')
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_scheduler_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scheduler_settings_updated
  BEFORE UPDATE ON scheduler_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_scheduler_settings_timestamp();

-- Seed default settings for existing organizations that don't have them
INSERT INTO scheduler_settings (organization_id)
SELECT id FROM organizations
WHERE id NOT IN (SELECT organization_id FROM scheduler_settings)
ON CONFLICT DO NOTHING;
