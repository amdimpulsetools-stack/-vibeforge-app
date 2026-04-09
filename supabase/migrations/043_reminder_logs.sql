-- =============================================
-- Migration 043: Reminder Logs
-- Tracks sent reminders to avoid duplicates.
-- Used by the cron job that sends 24h and 2h
-- appointment reminders.
-- =============================================

CREATE TABLE IF NOT EXISTS reminder_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  template_slug TEXT NOT NULL,          -- e.g. 'appointment_reminder_24h'
  channel TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'whatsapp')),
  recipient TEXT NOT NULL,              -- email address or phone number
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'skipped')),
  error_message TEXT,
  UNIQUE(appointment_id, template_slug, channel)
);

CREATE INDEX idx_reminder_logs_appointment ON reminder_logs(appointment_id);
CREATE INDEX idx_reminder_logs_sent_at ON reminder_logs(sent_at);

ALTER TABLE reminder_logs ENABLE ROW LEVEL SECURITY;

-- Only service role (cron) writes to this table.
-- Org members can read logs for their org's appointments.
CREATE POLICY "reminder_logs_select" ON reminder_logs FOR SELECT
  USING (
    appointment_id IN (
      SELECT a.id FROM appointments a
      WHERE a.organization_id IN (SELECT get_user_org_ids())
    )
  );
