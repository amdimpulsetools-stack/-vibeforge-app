-- Add pre-appointment instructions per service
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS pre_appointment_instructions TEXT;

-- Add Google Maps URL to organizations
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
