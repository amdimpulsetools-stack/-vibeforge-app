-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 144: Billing grace period + cancellation tracking
--
-- P0 pre-launch hardening for the MercadoPago integration. Closes 3
-- gaps identified in docs/launch-prep/mp-cancellation-grace-audit.md:
--
--  1) `past_due` was kicking users out instantly. We add a new
--     `grace` status that the middleware (mig 067/118) keeps treating
--     as "has access" for 7 days after the first failed payment.
--  2) There was no audit of who cancelled and when. We add
--     `cancelled_at` (already existed in mig 003 — kept idempotent)
--     and `cancelled_by_user_id`.
--  3) Failure counter so the webhook can escalate after MP exhausts
--     its 3 retries + final attempt (=4 failures → past_due).
--
-- Tables touched:
--   - organization_subscriptions: new status literal + 5 columns
--   - billing_events: NEW audit trail (status transitions, emails)
--
-- The RPC `get_user_session_check` (last redefined in mig 118) is
-- redefined here so a subscription in `grace` is treated like
-- `active` for middleware purposes.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Extend status enum with `grace` ────────────────────────────
-- The constraint was named `organization_subscriptions_status_check`
-- in mig 042. Keep idempotent: drop if exists, recreate with the new
-- literal added.
ALTER TABLE organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;

ALTER TABLE organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_status_check
  CHECK (status IN ('pending', 'active', 'trialing', 'past_due', 'grace', 'cancelled', 'expired'));

-- ── 2. New columns ────────────────────────────────────────────────
-- `grace_period_until`: while NOW() < this, status='grace' keeps
--   working. The cron flips it to past_due when it elapses.
-- `last_payment_failure_at`: timestamp of the most recent webhook
--   `payment.rejected`. Used to decorate emails and dashboards.
-- `failure_count`: incremented per rejection. Once >=4 we cut bait
--   (MP retries 3 times + final settlement attempt).
-- `cancelled_by_user_id`: who clicked Cancel in the UI. NULL when
--   cancellation came from MP webhook (paused/cancelled from MP UI)
--   or from the cron auto-cancel after 30d in past_due.
-- `past_due_since`: when we last entered past_due. Cron uses it to
--   know when to terminate permanently (>30d).
ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS grace_period_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_payment_failure_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS past_due_since TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL;

-- `cancelled_at` already existed (mig 003) — left untouched.

-- Indexes to make the daily cron sweep cheap.
CREATE INDEX IF NOT EXISTS idx_org_subs_grace_expiry
  ON organization_subscriptions (grace_period_until)
  WHERE status = 'grace';

CREATE INDEX IF NOT EXISTS idx_org_subs_past_due_since
  ON organization_subscriptions (past_due_since)
  WHERE status = 'past_due';

-- ── 3. billing_events audit table ────────────────────────────────
-- Append-only log so the founder can answer "why did this org get
-- cut off?" without spelunking webhook logs in Vercel.
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES organization_subscriptions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'payment_failed',
    'entered_grace',
    'grace_extended',
    'grace_expired',
    'recovered_to_active',
    'past_due_terminated',
    'cancelled_by_user',
    'cancelled_by_mp',
    'email_sent'
  )),
  -- Optional context (status before/after, email template slug, etc.)
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_org_created
  ON billing_events (organization_id, created_at DESC);

ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;

-- Owners/admins can read their org's events. Inserts come from
-- service-role only (webhook + cron + cancel endpoint use admin client).
DROP POLICY IF EXISTS billing_events_select ON billing_events;
CREATE POLICY billing_events_select ON billing_events
  FOR SELECT
  USING (
    organization_id IN (
      SELECT om.organization_id FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- ── 4. Redefine get_user_session_check to honour `grace` ──────────
-- Same shape as mig 118 — only the subscription predicate changes.
CREATE OR REPLACE FUNCTION get_user_session_check(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH memberships AS (
    SELECT
      m.organization_id,
      m.role,
      m.is_active
    FROM organization_members m
    WHERE m.user_id = p_user_id
  ),
  active_membership AS (
    SELECT *
    FROM memberships
    WHERE is_active = true
    ORDER BY
      CASE role
        WHEN 'owner' THEN 1
        WHEN 'admin' THEN 2
        WHEN 'doctor' THEN 3
        WHEN 'receptionist' THEN 4
        ELSE 5
      END
    LIMIT 1
  ),
  fallback_membership AS (
    SELECT * FROM memberships LIMIT 1
  ),
  picked AS (
    SELECT * FROM active_membership
    UNION ALL
    SELECT * FROM fallback_membership
    WHERE NOT EXISTS (SELECT 1 FROM active_membership)
    LIMIT 1
  )
  SELECT jsonb_build_object(
    'has_whatsapp', EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = p_user_id AND whatsapp_phone IS NOT NULL AND whatsapp_phone <> ''
    ),
    'onboarding_completed', EXISTS (
      SELECT 1 FROM organizations o
      JOIN picked p ON p.organization_id = o.id
      WHERE o.onboarding_completed_at IS NOT NULL
    ),
    'organization_id', (SELECT organization_id FROM picked),
    'role', (SELECT role FROM picked),
    'is_founder', COALESCE(
      (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
      false
    ),
    'membership_count', (SELECT COUNT(*) FROM memberships),
    'all_memberships_inactive', (
      EXISTS (SELECT 1 FROM memberships)
      AND NOT EXISTS (SELECT 1 FROM memberships WHERE is_active = true)
    ),
    'has_active_subscription', (
      COALESCE(
        (SELECT up.is_founder FROM user_profiles up WHERE up.id = p_user_id),
        false
      )
      OR EXISTS (
        SELECT 1 FROM organization_subscriptions os
        JOIN picked p ON p.organization_id = os.organization_id
        WHERE (
          os.status = 'active'
          OR (os.status = 'trialing' AND os.trial_ends_at > now())
          -- NEW: grace period (post-payment-failure courtesy window).
          -- The cron flips this to past_due once grace_period_until <= now(),
          -- so we don't need the bound here — but we double-guard anyway
          -- in case the cron is delayed.
          OR (os.status = 'grace' AND os.grace_period_until > now())
          -- NEW: cancelled-but-still-in-paid-period. The user clicked
          -- Cancel in the UI; we keep access until the period they paid
          -- for ends (mp_next_payment_date). past_due+cancelled is a no.
          OR (
            os.status = 'cancelled'
            AND os.cancelled_at IS NOT NULL
            AND os.mp_next_payment_date IS NOT NULL
            AND os.mp_next_payment_date > now()
          )
        )
      )
    )
  );
$$;

COMMENT ON FUNCTION get_user_session_check(uuid) IS
  'Middleware session probe. Honours `grace` (post-failure courtesy window) and `cancelled` + future mp_next_payment_date (keep access until paid period ends).';

COMMENT ON COLUMN organization_subscriptions.grace_period_until IS
  'While now() < grace_period_until AND status=grace, the user keeps access. Set by webhook on first payment.rejected, cleared on payment.approved.';

COMMENT ON COLUMN organization_subscriptions.failure_count IS
  'Number of consecutive payment failures. Reset to 0 on successful payment. Webhook escalates to past_due when >= 4.';

COMMENT ON COLUMN organization_subscriptions.cancelled_by_user_id IS
  'User who clicked Cancel in /account. NULL when cancellation came from MP webhook or cron auto-termination.';

COMMENT ON TABLE billing_events IS
  'Append-only audit of subscription status transitions. Owners/admins can read their own org via RLS.';
