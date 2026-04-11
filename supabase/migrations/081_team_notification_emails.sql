-- Team notifications: add notification_emails to email_settings
ALTER TABLE email_settings
  ADD COLUMN IF NOT EXISTS notification_emails TEXT;

-- Hide unimplemented team toggles (only daily summary is functional for now)
UPDATE email_templates
SET is_enabled = false
WHERE slug IN ('team_new_appointment', 'team_cancellation');
