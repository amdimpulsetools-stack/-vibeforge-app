-- TOTP secret for 2FA on founder panel
-- Encrypted with ENCRYPTION_KEY via lib/encryption.ts

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS totp_secret text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS totp_enabled boolean NOT NULL DEFAULT false;
