-- ============================================================
-- 052: Public booking settings per organization
-- ============================================================

-- Settings to control public booking page behavior
CREATE TABLE IF NOT EXISTS booking_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  is_enabled boolean NOT NULL DEFAULT false,
  -- How far ahead can patients book (in days)
  max_advance_days integer NOT NULL DEFAULT 30,
  -- Minimum hours before appointment start for booking
  min_lead_hours integer NOT NULL DEFAULT 2,
  -- Welcome message shown on the booking page
  welcome_message text DEFAULT 'Agenda tu cita en línea de forma rápida y sencilla.',
  -- Whether to require patient email
  require_email boolean NOT NULL DEFAULT true,
  -- Whether to require patient phone
  require_phone boolean NOT NULL DEFAULT true,
  -- Whether to require patient DNI
  require_dni boolean NOT NULL DEFAULT false,
  -- Custom accent color override (null = use org brand)
  accent_color text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;

-- Org members can read/write their own booking settings
CREATE POLICY "booking_settings_select" ON booking_settings
  FOR SELECT USING (
    organization_id IN (SELECT get_user_org_ids())
  );

CREATE POLICY "booking_settings_insert" ON booking_settings
  FOR INSERT WITH CHECK (
    organization_id IN (SELECT get_user_org_ids())
  );

CREATE POLICY "booking_settings_update" ON booking_settings
  FOR UPDATE USING (
    organization_id IN (SELECT get_user_org_ids())
  );

-- Public read policy for the booking page (anon users need to read settings)
CREATE POLICY "booking_settings_public_read" ON booking_settings
  FOR SELECT USING (is_enabled = true);

-- Seed default booking_settings for existing organizations
INSERT INTO booking_settings (organization_id, is_enabled)
SELECT id, false FROM organizations
ON CONFLICT (organization_id) DO NOTHING;
