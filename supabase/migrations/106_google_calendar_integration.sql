-- =============================================
-- MIGRATION 106: Google Calendar integration (org-level)
-- =============================================
-- One Google Calendar per organization (not per doctor — keeps the model
-- simple and matches reception-driven workflows where a single "clinic
-- calendar" is the source of truth for the front desk).
--
-- Direction: one-way Yenda → Google. Yenda is source of truth; Google is a
-- read-only mirror used as backup + for visibility on doctors' phones.
--
-- Tokens are stored ENCRYPTED at the application layer (AES-256-GCM via
-- lib/encryption.ts using ENCRYPTION_KEY env). The DB never sees plaintext
-- so a backup/replica leak does not yield usable Google credentials.
--
-- Cancellation behavior: appointments cancelled in Yenda are PATCHed to
-- `status: "cancelled"` on Google (not deleted) — preserves audit trail
-- on the Google side too.

CREATE TABLE IF NOT EXISTS google_calendar_integrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  connected_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Google account that owns the calendar (for display in UI: "Connected as: foo@gmail.com")
  google_account_email TEXT NOT NULL,

  -- Calendar ID inside Google (default 'primary' for the connected account's main calendar).
  -- Future: we could let the user pick a non-primary calendar.
  google_calendar_id   TEXT NOT NULL DEFAULT 'primary',

  -- Encrypted OAuth tokens (AES-256-GCM). NEVER store plaintext.
  -- Format produced by lib/encryption.ts: "iv_b64:authtag_b64:ciphertext_b64"
  access_token_encrypted  TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,

  expires_at           TIMESTAMPTZ NOT NULL,
  scope                TEXT NOT NULL,

  -- Operational state
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at         TIMESTAMPTZ,
  last_sync_error      TEXT,
  last_sync_error_at   TIMESTAMPTZ,

  connected_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gcal_integrations_org
  ON google_calendar_integrations (organization_id);

-- RLS: only members of the org can SEE that the integration exists; only
-- owners/admins can connect/disconnect. Service role bypasses RLS for the
-- background sync code path.
ALTER TABLE google_calendar_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members read gcal integration"
  ON google_calendar_integrations FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "Org admins write gcal integration"
  ON google_calendar_integrations FOR ALL
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- updated_at trigger (uses the existing function from earlier migrations)
CREATE TRIGGER set_updated_at_gcal_integrations
  BEFORE UPDATE ON google_calendar_integrations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- appointments.google_event_id
-- =============================================
-- Stores the Google Calendar event ID returned by the Calendar API on insert.
-- Used to PATCH (move/edit) and cancel the same event on subsequent mutations.
-- NULL means: not synced yet (sync failed, integration disconnected, or
-- appointment created before integration was set up).

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_google_event
  ON appointments (google_event_id)
  WHERE google_event_id IS NOT NULL;
