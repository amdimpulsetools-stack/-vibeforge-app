-- =============================================
-- MIGRATION 104: founder_2fa_sessions (DB-backed)
-- =============================================
-- Replaces the in-memory Map in lib/founder-auth.ts which was broken on
-- Vercel serverless (each lambda has its own memory). Persists 2FA session
-- tokens in the database so every request validates consistently.
--
-- Security F-04 + F-10: this unblocks real cookie verification in founder
-- routes (previously the cookie was set but never checked on server).

CREATE TABLE IF NOT EXISTS founder_2fa_sessions (
  token       TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_founder_2fa_sessions_user
  ON founder_2fa_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_founder_2fa_sessions_expiry
  ON founder_2fa_sessions (expires_at);

-- RLS — only service role / self reads. Founder routes use the admin client
-- to validate (they already bypass RLS intentionally via service role).
-- A user with direct Supabase access must never be able to list or fabricate
-- tokens, so we leave RLS enabled with NO policies — blocks all anon/user
-- access while service role still works.
ALTER TABLE founder_2fa_sessions ENABLE ROW LEVEL SECURITY;
