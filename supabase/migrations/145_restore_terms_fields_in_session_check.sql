-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 145: Restore terms-acceptance fields in get_user_session_check
--
-- Mig 144 redefined get_user_session_check to add the new 'grace' and
-- 'cancelled-with-period' subscription branches, but accidentally
-- dropped the `accepted_terms_at` and `accepted_terms_version` fields
-- that mig 123 had added. Without those, the middleware's
-- terms-acceptance gate (lib/supabase/middleware.ts:155-160) reads
-- both as `undefined`, which evaluates `termsOutdated = true` for
-- every session, redirecting users back to /onboarding/accept-terms
-- even after they accept.
--
-- This migration restores both fields by re-defining the function
-- with the same body as mig 144 plus the missing two keys appended
-- to the jsonb_build_object.
-- ═══════════════════════════════════════════════════════════════════

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
          -- Grace period (post-payment-failure courtesy window).
          -- The cron flips this to past_due once grace_period_until <= now(),
          -- so we don't need the bound here — but we double-guard anyway
          -- in case the cron is delayed.
          OR (os.status = 'grace' AND os.grace_period_until > now())
          -- Cancelled-but-still-in-paid-period. The user clicked
          -- Cancel in the UI; we keep access until the period they paid
          -- for ends (mp_next_payment_date).
          OR (
            os.status = 'cancelled'
            AND os.cancelled_at IS NOT NULL
            AND os.mp_next_payment_date IS NOT NULL
            AND os.mp_next_payment_date > now()
          )
        )
      )
    ),
    -- ───────────────────────────────────────────────────────────────
    -- RESTORED in mig 145 (originally added by mig 123, dropped by 144).
    -- The middleware's terms gate compares
    -- `accepted_terms_version` to the current TERMS_VERSION constant
    -- and forces re-acceptance after a bump.
    -- ───────────────────────────────────────────────────────────────
    'accepted_terms_at', (
      SELECT up.accepted_terms_at FROM user_profiles up WHERE up.id = p_user_id
    ),
    'accepted_terms_version', (
      SELECT up.accepted_terms_version FROM user_profiles up WHERE up.id = p_user_id
    )
  );
$$;

COMMENT ON FUNCTION get_user_session_check(uuid) IS
  'Middleware session probe. Returns membership/role/subscription state plus all_memberships_inactive flag, accepted_terms_at/version for the terms-acceptance gate, and the grace/cancelled-with-period branches added in mig 144.';
