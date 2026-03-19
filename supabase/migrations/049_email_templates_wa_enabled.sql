-- Add wa_enabled flag to email_templates for independent WhatsApp toggle
ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS wa_enabled BOOLEAN NOT NULL DEFAULT false;

-- Enable WA for the two templates the user wants active by default
-- (appointment_confirmation and appointment_reminder_24h)
-- This is a per-org setting, so we update all rows with those slugs.
UPDATE email_templates
SET wa_enabled = true
WHERE slug IN ('appointment_confirmation', 'appointment_reminder_24h');
