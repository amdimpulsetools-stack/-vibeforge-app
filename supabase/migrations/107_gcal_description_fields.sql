-- =============================================
-- MIGRATION 107: Google Calendar event description customization
-- =============================================
-- Lets each org choose which extra fields land in the event description
-- on Google Calendar. The base fields (doctor, office, notes) are always
-- present. Everything else is opt-in.
--
-- Stored as JSONB (instead of TEXT[]) so we can extend later without a
-- migration — e.g. formatting options, field ordering, labels.

ALTER TABLE google_calendar_integrations
  ADD COLUMN IF NOT EXISTS description_fields JSONB NOT NULL DEFAULT
    '{
      "patient_phone": true,
      "patient_email": false,
      "patient_dni": false,
      "patient_age": false,
      "price": false,
      "payment_status": false,
      "payment_method": false,
      "discount": false,
      "appointment_status": false,
      "origin": false,
      "yenda_link": false
    }'::jsonb;

COMMENT ON COLUMN google_calendar_integrations.description_fields IS
  'Map of optional fields to include in the Google Calendar event description. Keys are field slugs; values are boolean. See lib/google-calendar.ts for the full list of supported fields.';
