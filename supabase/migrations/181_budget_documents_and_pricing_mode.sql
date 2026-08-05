-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 181: modo de documentos y modo de pricing por org
--
-- Dos flags de presentación sobre el sistema de presupuestos
-- (evaluación de agentes 2026-08-03; lote B+C del plan de escalado):
--
-- 1) `documents_enabled` — false = modo "solo asignación y
--    seguimiento": la org asigna presupuestos, trackea estados y
--    reportes, pero la UI oculta generar/descargar/enviar PDF (el
--    documento lo emiten fuera de Yenda). Palanca de onboarding
--    operada por el founder (sin UI de org por ahora); la API de PDF
--    devuelve 403 y el send solo acepta via='other'.
--
-- 2) `pricing_mode` — 'single' = presupuestos de precio único (perfil
--    clínica chica, p.ej. Dra. Patricia): la UI colapsa los tiers a
--    una sola tarjeta de precio y el PDF omite el rótulo "PAQUETE A".
--    Por debajo se sigue escribiendo tier='A' en budget_records (cero
--    cambios de contrato; includes_text y currency siguen viniendo del
--    tier). 'tiers' = comportamiento actual (Vitra). Texto y no
--    booleano para dejar sitio a futuros modos (p.ej. 'per_phase').
--
-- La tabla org_budget_pdf_settings nació como settings del PDF
-- (mig 153); su alcance se amplía a "settings de presupuestos" — es
-- org-scoped, con RLS funcionando y ya la cargan generador y UI.
--
-- Aditiva e idempotente; defaults = comportamiento actual para todas
-- las orgs existentes.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE org_budget_pdf_settings
  ADD COLUMN IF NOT EXISTS documents_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE org_budget_pdf_settings
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'tiers';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_budget_pdf_settings_pricing_mode_check'
  ) THEN
    ALTER TABLE org_budget_pdf_settings
      ADD CONSTRAINT org_budget_pdf_settings_pricing_mode_check
      CHECK (pricing_mode IN ('tiers', 'single'));
  END IF;
END $$;

COMMENT ON TABLE org_budget_pdf_settings IS
  'Settings de presupuestos por org (nació como settings del PDF en mig 153; mig 181 amplía el alcance): vigencia y textos del PDF, modo de documentos (documents_enabled) y modo de pricing (tiers | single).';

COMMENT ON COLUMN org_budget_pdf_settings.documents_enabled IS
  'false = modo solo asignación/seguimiento: la org trackea presupuestos pero Yenda no genera ni envía el documento (lo emiten fuera). Operado por el founder. Default true = comportamiento completo.';

COMMENT ON COLUMN org_budget_pdf_settings.pricing_mode IS
  '''tiers'' = paquetes A/B/C (Vitra). ''single'' = precio único por tratamiento: la UI colapsa los tiers a una tarjeta y el PDF omite el rótulo de paquete; por debajo se sigue escribiendo tier=''A'' en budget_records.';
