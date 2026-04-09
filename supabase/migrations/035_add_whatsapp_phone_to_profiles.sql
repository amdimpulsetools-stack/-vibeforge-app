-- Add whatsapp_phone to user_profiles for onboarding flow
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;

COMMENT ON COLUMN user_profiles.whatsapp_phone IS 'WhatsApp number with country code, e.g. +51987654321';
