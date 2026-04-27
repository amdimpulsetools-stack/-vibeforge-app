-- ============================================================================
-- Migration 113: add semiannual frequency to plans (8.3% off vs monthly)
-- ============================================================================
--
-- Adds a third billing cadence between monthly and yearly:
--   monthly    -> price_monthly        (no discount)
--   semiannual -> price_semiannual     (8.3% off, "half a month free")
--   yearly     -> price_yearly         (16.7% off, "two months free")
--
-- The semiannual upfront charge equals 5.5 monthly payments. Customers
-- save half a month vs paying monthly for 6 months. This sits cleanly
-- between monthly (no commitment) and yearly (highest commitment).
--
-- Values calibrated against current monthly prices set in migration 112:
--   starter:      129 * 5.5 =   709.50  ->  709.50
--   professional: 349 * 5.5 = 1919.50  -> 1919.50
--   enterprise:   649 * 5.5 = 3569.50  -> 3569.50
--
-- Rollback:
--   ALTER TABLE plans DROP COLUMN price_semiannual;
-- ============================================================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS price_semiannual NUMERIC(10,2);

UPDATE plans SET price_semiannual = 709.50  WHERE slug = 'starter';
UPDATE plans SET price_semiannual = 1919.50 WHERE slug = 'professional';
UPDATE plans SET price_semiannual = 3569.50 WHERE slug = 'enterprise';

COMMENT ON COLUMN plans.price_semiannual IS
  'Upfront charge for 6 months (8.3% off, equals 5.5 monthly payments). NULL means semiannual not offered for this plan.';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT slug, name, price_monthly, price_semiannual, price_yearly FROM plans ORDER BY price_monthly LOOP
    RAISE NOTICE 'plan % (%) -> monthly=% semiannual=% yearly=%',
      r.slug, r.name, r.price_monthly, r.price_semiannual, r.price_yearly;
  END LOOP;
END $$;
