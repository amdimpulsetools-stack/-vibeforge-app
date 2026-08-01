-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 180: DUO STIM + sincronización de tiers de Vitra
--
-- Acompaña al lote de plantillas DUO STIM / ROPA / OVODON del plugin
-- budget_pdf_vitra y al reparto proporcional del ajuste de honorarios
-- (lib/budget-pdf/honorarios-fold.ts). Decisiones confirmadas por el
-- founder el 2026-08-01.
--
-- 1) Amplía el CHECK de budget_records.treatment_type con 'TED' y
--    'DUOSTIM'. La inferencia unificada (types/fertility.ts) ahora
--    guarda esos valores; antes TED caía en 'OTRO' porque el assign
--    tenía su propia copia de la inferencia sin regla TED.
--
-- 2) Solo para orgs con el plugin budget_pdf_vitra instalado (hoy:
--    Vitra):
--      a. Sube los tiers de "Método ROPA" a los totales de los docx
--         oficiales — donante + receptora (el seed de mig 140 solo
--         sumaba la parte de la donante):
--           A = 18,450 · B = 17,020 · C = 16,260
--      b. Corrige FIV tier A 18,449.98 → 18,450.00 (typo de edición
--         manual en la UI; el desglose de fiv-tiers.ts suma 18,450).
--      c. Crea el servicio "DUO STIM (Acumulación de Embriones)" con
--         tiers A = 31,150 · B = 28,640 · C = 27,340 (docs/Budgets/
--         DUO STIM - {A,B,C}.docx). No se añade al seed general
--         (seed_fertility_services): las orgs nuevas conservan el
--         catálogo estándar de 6 servicios hasta nueva decisión.
--
-- Idempotente: re-ejecutar no duplica servicio ni tiers ni re-toca
-- montos ya correctos. Inerte para orgs sin el plugin.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. CHECK de treatment_type: + TED, + DUOSTIM
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE budget_records
  DROP CONSTRAINT IF EXISTS budget_records_treatment_type_check;

ALTER TABLE budget_records
  ADD CONSTRAINT budget_records_treatment_type_check CHECK (treatment_type IN (
    'FIV', 'IIU', 'INDUCCION', 'CRIO', 'OVODONACION', 'ROPA',
    'TED', 'DUOSTIM', 'OTRO'
  ));

-- ─────────────────────────────────────────────────────────────────
-- 2. Sync de tiers + alta de DUO STIM por org con el plugin
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_org UUID;
  v_category_id UUID;
  v_service_id UUID;
  v_tier TEXT;
  v_amount NUMERIC;
BEGIN
  FOR v_org IN
    SELECT organization_id FROM org_plugins
    WHERE plugin_key = 'budget_pdf_vitra' AND enabled = true
  LOOP
    -- 2a. ROPA → totales docx (donante + receptora)
    UPDATE service_budget_tiers t
      SET amount = v.amount, updated_at = NOW()
    FROM (VALUES ('A', 18450.00), ('B', 17020.00), ('C', 16260.00))
      AS v(tier, amount)
    WHERE v.tier = t.tier
      AND t.is_active = true
      AND t.amount IS DISTINCT FROM v.amount
      AND t.service_id IN (
        SELECT id FROM services
        WHERE organization_id = v_org AND name ILIKE '%ROPA%'
      );

    -- 2b. FIV tier A: 18,449.98 → 18,450.00 (typo puntual)
    UPDATE service_budget_tiers t
      SET amount = 18450.00, updated_at = NOW()
    WHERE t.tier = 'A'
      AND t.is_active = true
      AND t.amount = 18449.98
      AND t.service_id IN (
        SELECT id FROM services
        WHERE organization_id = v_org
          AND (name ILIKE '%FIV%' OR name ILIKE '%Fecundaci%')
          AND name NOT ILIKE '%ovodon%'
      );

    -- 2c. DUO STIM — servicio + tiers (mismo molde que
    --     seed_fertility_services de mig 140)
    SELECT id INTO v_service_id
    FROM services
    WHERE organization_id = v_org
      AND (name ILIKE '%DUO%STIM%' OR name ILIKE '%acumulaci%')
    LIMIT 1;

    IF v_service_id IS NULL THEN
      SELECT id INTO v_category_id
      FROM service_categories
      WHERE organization_id = v_org
        AND name = 'Reproducción Asistida (TRA)';

      INSERT INTO services (
        organization_id, category_id, name,
        base_price, duration_minutes,
        is_active, is_budget_eligible, created_by_addon,
        display_order
      )
      VALUES (
        v_org, v_category_id, 'DUO STIM (Acumulación de Embriones)',
        31150.00, 90,
        true, true, 'fertility_basic',
        70
      )
      RETURNING id INTO v_service_id;
    ELSE
      UPDATE services
        SET is_budget_eligible = true
      WHERE id = v_service_id;
    END IF;

    FOR v_tier, v_amount IN
      SELECT * FROM (
        VALUES ('A', 31150.00), ('B', 28640.00), ('C', 27340.00)
      ) AS x(tier, amount)
    LOOP
      INSERT INTO service_budget_tiers (service_id, tier, amount, currency, is_active)
      VALUES (v_service_id, v_tier, v_amount, 'PEN', true)
      ON CONFLICT DO NOTHING;
    END LOOP;

    v_service_id := NULL;
  END LOOP;
END $$;
