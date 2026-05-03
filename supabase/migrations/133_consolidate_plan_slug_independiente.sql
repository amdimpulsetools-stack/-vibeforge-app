-- ============================================================================
-- Migration 133: consolida slug del plan base a 'independiente'
-- ============================================================================
--
-- Histórico: el repo arrastra dos slugs intercambiables para el plan
-- gratuito/base — 'starter' (de migrations 020-040) y 'independiente'
-- (de migration 003). Migraciones de precios (112, 113) usan 'starter';
-- código de UI usa ambos. Esto causó el bug de precios de mig 132.
--
-- Esta migración consolida a 'independiente' (presente en lib/constants.ts
-- como slug canonical) y agrega CHECK que solo permite los 3 slugs
-- válidos: 'independiente', 'professional', 'enterprise'.
--
-- Idempotente: si no hay filas con slug='starter', el UPDATE es no-op.
-- En tu DB actual la fila ya tiene slug='independiente' → no hay cambio.
--
-- Esta migración SOLO toca la columna `slug` y agrega la constraint.
-- Las relaciones (FK desde organization_subscriptions, etc.) usan plan_id
-- (UUID), no slug, así que el cambio de slug es transparente para las orgs
-- existentes.
-- ============================================================================

UPDATE plans
SET slug = 'independiente'
WHERE slug = 'starter';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'plans_slug_canonical'
  ) THEN
    ALTER TABLE plans
      ADD CONSTRAINT plans_slug_canonical
      CHECK (slug IN ('independiente', 'professional', 'enterprise'));
  END IF;
END $$;

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT slug, name FROM plans ORDER BY slug LOOP
    RAISE NOTICE 'plan slug consolidated: % (%)', r.slug, r.name;
  END LOOP;
END $$;
