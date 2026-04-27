-- ============================================================================
-- Migration 112: update plan prices (PEN)
-- ============================================================================
--
-- Pricing change driven by product. Initial seed in migration 020 used round
-- placeholders (S/0 / S/49 / S/149) that never reflected commercial reality
-- and the landing page was already showing different numbers (S/69.90 /
-- S/169.90 / S/569.90). This migration aligns the database with the new
-- commercial pricing approved on 2026-04-26.
--
-- New prices:
--   Independiente (slug=starter)      -> S/129/mo,  S/1290/yr (2 months free)
--   Centro Medico (slug=professional) -> S/349/mo,  S/3490/yr (2 months free)
--   Clinica       (slug=enterprise)   -> S/649/mo,  S/6490/yr (2 months free)
--
-- Existing free-tier organizations are NOT migrated automatically: the owner
-- decides when to convert them. We only change the catalog row; subscriptions
-- that already point to a plan keep their current price until they renew or
-- get manually updated.
--
-- Trial behavior reminder (managed in app code, not in this table):
--   - Independiente: 14-day trial active.
--   - Centro Medico: 14-day trial active.
--   - Clinica:        trial DEACTIVATED for now (handled in
--                     app/(auth)/select-plan/page.tsx and start-trial route).
--
-- Rollback: keep the previous values handy in case we need to revert.
--   starter:      0   / NULL
--   professional: 49  / 490
--   enterprise:   149 / 1490
-- ============================================================================

UPDATE plans
SET price_monthly = 129,
    price_yearly  = 1290
WHERE slug = 'starter';

UPDATE plans
SET price_monthly = 349,
    price_yearly  = 3490
WHERE slug = 'professional';

UPDATE plans
SET price_monthly = 649,
    price_yearly  = 6490
WHERE slug = 'enterprise';

-- Sanity log so we can see the change in the migration history of supabase.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT slug, name, price_monthly, price_yearly FROM plans ORDER BY price_monthly LOOP
    RAISE NOTICE 'plan % (%) -> monthly=% yearly=%', r.slug, r.name, r.price_monthly, r.price_yearly;
  END LOOP;
END $$;
