-- ============================================================
-- 093: Patient Portal — auth tokens, sessions, portal settings
-- ============================================================

-- ── Portal tokens (magic link) ──────────────────────────────
CREATE TABLE IF NOT EXISTS patient_portal_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_tokens_lookup ON patient_portal_tokens (token, expires_at);
CREATE INDEX idx_portal_tokens_cleanup ON patient_portal_tokens (expires_at);

ALTER TABLE patient_portal_tokens ENABLE ROW LEVEL SECURITY;

-- Only service role can manage tokens (API routes use admin client)
-- No RLS policies = no direct access from anon/authenticated

-- ── Portal sessions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_portal_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  email text NOT NULL,
  session_token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now()
);

CREATE INDEX idx_portal_sessions_token ON patient_portal_sessions (session_token, expires_at);
CREATE INDEX idx_portal_sessions_patient ON patient_portal_sessions (patient_id);

ALTER TABLE patient_portal_sessions ENABLE ROW LEVEL SECURITY;

-- ── Add portal columns to patients ─────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS portal_email text,
  ADD COLUMN IF NOT EXISTS portal_phone text,
  ADD COLUMN IF NOT EXISTS portal_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_patients_portal_email
  ON patients (organization_id, portal_email)
  WHERE portal_email IS NOT NULL;

-- ── Extend booking_settings with portal toggles ─────────────
ALTER TABLE booking_settings
  ADD COLUMN IF NOT EXISTS portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS portal_allow_cancel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_allow_reschedule boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_min_cancel_hours integer NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS portal_welcome_message text DEFAULT 'Bienvenido a tu portal de paciente. Aquí puedes ver y gestionar tus citas.';

-- ── Cleanup job helper: delete expired tokens older than 24h ─
CREATE OR REPLACE FUNCTION cleanup_expired_portal_tokens()
RETURNS void AS $$
BEGIN
  DELETE FROM patient_portal_tokens
  WHERE expires_at < now() - interval '24 hours';

  DELETE FROM patient_portal_sessions
  WHERE expires_at < now();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
