-- ============================================================
-- 156: Auth sessions for device-limit enforcement
--
-- Anti account-sharing. Each (user, device) combination gets one
-- row. The limit enforcement (owner=3, admin=2, doctor=2,
-- receptionist=1) lives in TypeScript — we keep the table dumb
-- and store one row per device.
--
-- "Device" is a UUID v4 the client generates and stores in
-- localStorage (mirrored to a cookie for middleware access).
-- localStorage clear → new device row → may trigger the
-- "select one to close" modal. Acceptable UX trade-off.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id       TEXT NOT NULL,
  device_label    TEXT,
  ip_address      INET,
  ip_country      TEXT,
  ip_city         TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  revoked_reason  TEXT CHECK (revoked_reason IN (
    'user_explicit',     -- user clicked "Cerrar sesión" on /account/devices
    'limit_exceeded',    -- closed automatically when login over limit
    'logout_all',        -- "Cerrar todas las sesiones" button
    'recovery_email',    -- recovery link from "perdí acceso a todos"
    'admin_action',      -- founder revoked via admin panel (future)
    'expired_inactive'   -- cron purges sessions inactive > 90d (future)
  )),
  CONSTRAINT auth_sessions_unique_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_lookup
  ON public.auth_sessions(user_id, device_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_last_seen
  ON public.auth_sessions(user_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_inactive_purge
  ON public.auth_sessions(last_seen_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_own_sessions"
  ON public.auth_sessions
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "users_update_own_sessions"
  ON public.auth_sessions
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.auth_sessions IS
  'Per-device session tracking for account-sharing prevention. One row per (user, device). Revocation is soft (revoked_at NOT NULL) so the audit trail survives.';

COMMENT ON COLUMN public.auth_sessions.device_id IS
  'UUID v4 generated client-side and stored in localStorage.yenda_device_id. Mirrored to cookie yenda_device_id for middleware access.';

COMMENT ON COLUMN public.auth_sessions.revoked_reason IS
  'Audit field. Why the session was closed: user_explicit, limit_exceeded, logout_all, recovery_email, admin_action, expired_inactive.';
