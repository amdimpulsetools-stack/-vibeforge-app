-- ============================================================================
-- Migration 132: fix Independiente plan price (data drift) + reasonable
-- price floor CHECK constraint.
-- ============================================================================
--
-- Bug encontrado el 2026-05-03 (durante registro de tenant Vitra):
--
-- La fila del plan Independiente quedó con precios placeholder de migration
-- 020 (price_monthly = 3.35, price_yearly = 33.50) porque las migraciones
-- 112 (precios actuales) y 113 (semiannual) usan `WHERE slug = 'starter'`,
-- pero la fila real tiene `slug = 'independiente'` (creada así desde
-- migration 003). El UPDATE no afectó ninguna fila → quedó torcido.
--
-- Esta migración corrige ÚNICAMENTE los datos. La consolidación del slug
-- (eliminar el doble identificador 'starter' / 'independiente' en código)
-- se hace por separado en migration 133 + commit asociado.
--
-- Idempotente: el WHERE incluye un guard `price_monthly < 100` para no
-- pisar fixes manuales que la operación pudo haber hecho antes (el owner
-- ya corrió la query manualmente en Supabase Studio antes de este commit).
--
-- Defensa: agrega CHECK constraint que rechaza precios absurdos en futuros
-- UPDATE/INSERT. Si una clínica tiene plan gratis con price_monthly = 0,
-- el CHECK lo permite. Cualquier otro valor debe ser ≥ 50 PEN, valor
-- mínimo razonable para un SaaS médico de Yenda.
-- ============================================================================

UPDATE plans
SET price_monthly    = 129,
    price_semiannual = 709.50,
    price_yearly     = 1290
WHERE slug IN ('starter', 'independiente')
  AND price_monthly < 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_price_monthly_reasonable'
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_price_monthly_reasonable
      CHECK (price_monthly = 0 OR price_monthly >= 50);
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT slug, name, price_monthly, price_semiannual, price_yearly
           FROM plans
           ORDER BY price_monthly LOOP
    RAISE NOTICE 'plan % (%) -> monthly=% semiannual=% yearly=%',
      r.slug, r.name, r.price_monthly, r.price_semiannual, r.price_yearly;
  END LOOP;
END $$;
