-- 158: MFA recovery codes for owner/admin 2FA opt-in
--
-- Supabase MFA built-in covers TOTP enroll/verify but does NOT
-- ship recovery codes. We add them on top: 10 single-use codes
-- hashed with bcrypt, displayed once at enroll time. Used in the
-- recovery flow (/api/auth/mfa/recover) to bypass the TOTP
-- challenge when the user lost their device — that flow then
-- DELETES all factors, forcing re-enroll.

CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Hot path: "give me this user's unused codes". The partial
-- index keeps the lookup tight even after many regenerations.
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_active
  ON public.mfa_recovery_codes(user_id)
  WHERE used_at IS NULL;

ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Users see only their own codes (for "do I have codes?" status
-- check; the plaintext is never stored, so SELECT alone leaks
-- nothing dangerous). All writes are service-role only via the
-- helper in lib/auth/mfa.ts.
CREATE POLICY "users_view_own_recovery_codes"
  ON public.mfa_recovery_codes
  FOR SELECT
  USING (user_id = auth.uid());

COMMENT ON TABLE public.mfa_recovery_codes IS
  'Bcrypt-hashed single-use recovery codes for the MFA bypass flow. Plaintext only shown once at enroll. Insert/update/delete service-role only via lib/auth/mfa.ts.';
