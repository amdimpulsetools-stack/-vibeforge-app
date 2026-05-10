-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 140: Budget tiers (A/B/C) + assignment fields
--
-- Foundation for the tier-based budget feature of the fertility addon
-- (Pack Básico / Pack Premium). Idempotent and isolation-safe:
--
--   - Adds `services.is_budget_eligible` (instant in PG≥11, default
--     false). Inert for orgs without the addon.
--   - Creates `service_budget_tiers` with multi-tenant RLS inherited
--     via the `services.organization_id` FK. NO addon-validation
--     trigger: gate lives at the application layer (consistent with
--     mig 127, 130, 136).
--   - Extends `budget_records` with `service_id` (nullable for legacy
--     rows), `tier`, `assigned_at`, `assigned_by_user_id`. Drops
--     NOT NULL on `sent_at`/`sent_by_user_id` because the new flow
--     creates a record at assignment time (before sending).
--
-- `treatment_type` is INTENTIONALLY KEPT as a denormalized snapshot —
-- it is consumed in 9+ UI sites and used as a SQL filter predicate.
-- New reports MUST LEFT JOIN `services` (via `service_id`) to keep
-- legacy rows visible.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. services.is_budget_eligible
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS is_budget_eligible BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN services.is_budget_eligible IS
  'Solo relevante si la org tiene addon fertility_basic|fertility_premium activo. Marca el servicio como elegible para tiers A/B/C en service_budget_tiers. La UI debe gatear la lectura/escritura del flag con hasAnyAddon([fertility_basic, fertility_premium]).';

-- ─────────────────────────────────────────────────────────────────
-- 2. service_budget_tiers
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_budget_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('A', 'B', 'C')),
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PEN',
  includes_text TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial UNIQUE: permite recrear un tier después de soft-delete
-- (is_active=false). Concern A del schema audit §3.
CREATE UNIQUE INDEX IF NOT EXISTS uq_service_budget_tiers_service_tier_active
  ON service_budget_tiers(service_id, tier) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_sbt_service_active
  ON service_budget_tiers(service_id) WHERE is_active = true;

ALTER TABLE service_budget_tiers ENABLE ROW LEVEL SECURITY;

-- RLS: heredada vía service_id → services.organization_id.
-- SELECT: cualquier miembro de la org. INSERT/UPDATE/DELETE: solo
-- owner/admin (via is_org_admin). Mismo shape que mig 136 / 013.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'service_budget_tiers' AND policyname = 'sbt_select') THEN
    CREATE POLICY sbt_select ON service_budget_tiers FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND s.organization_id IN (SELECT get_user_org_ids())
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'service_budget_tiers' AND policyname = 'sbt_insert') THEN
    CREATE POLICY sbt_insert ON service_budget_tiers FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND is_org_admin(s.organization_id)
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'service_budget_tiers' AND policyname = 'sbt_update') THEN
    CREATE POLICY sbt_update ON service_budget_tiers FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND is_org_admin(s.organization_id)
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'service_budget_tiers' AND policyname = 'sbt_delete') THEN
    CREATE POLICY sbt_delete ON service_budget_tiers FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM services s
        WHERE s.id = service_budget_tiers.service_id
          AND is_org_admin(s.organization_id)
      ));
  END IF;
END $$;

-- updated_at trigger reusing the global helper from mig 001.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_service_budget_tiers'
  ) THEN
    CREATE TRIGGER set_updated_at_service_budget_tiers
      BEFORE UPDATE ON service_budget_tiers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

COMMENT ON TABLE service_budget_tiers IS
  'Tiers A/B/C por servicio (paquetes con monto + ítems incluidos) para el addon fertility. Un servicio elegible (services.is_budget_eligible=true) tiene típicamente 3 tiers activos. Soft-delete via is_active=false; la UNIQUE parcial permite recrear el tier tras soft-delete. Sobrevive a la desactivación del addon (auditoría comercial).';

-- ─────────────────────────────────────────────────────────────────
-- 3. budget_records — assignment fields
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE budget_records
  ADD COLUMN IF NOT EXISTS service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier TEXT,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS assigned_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'budget_records_tier_check'
  ) THEN
    ALTER TABLE budget_records
      ADD CONSTRAINT budget_records_tier_check
      CHECK (tier IS NULL OR tier IN ('A', 'B', 'C'));
  END IF;
END $$;

-- New flow: a budget is *assigned* before it is *sent*. The send step
-- happens later (or never, if the patient is contacted off-channel),
-- so sent_at and sent_by_user_id must be nullable.
ALTER TABLE budget_records ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE budget_records ALTER COLUMN sent_by_user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_records_service
  ON budget_records(service_id) WHERE service_id IS NOT NULL;

COMMENT ON COLUMN budget_records.service_id IS
  'FK al servicio asignado (vía tier A/B/C). NULL en filas legacy creadas antes de la migración 140 — los reports DEBEN usar LEFT JOIN para no perder histórico.';
COMMENT ON COLUMN budget_records.tier IS
  'Tier A|B|C asignado. NULL para filas legacy (pre-mig 140) o flujos sin tier. La fuente de verdad del monto es `service_budget_tiers.amount` cuando service_id+tier están seteados; `budget_records.amount` queda como snapshot histórico.';
COMMENT ON COLUMN budget_records.assigned_at IS
  'Momento en que la obstetra/asesora seleccionó el tier para esta paciente. Default NOW() para que filas legacy queden con un valor sensato (igual a created_at).';
COMMENT ON COLUMN budget_records.assigned_by_user_id IS
  'Usuario que ejecutó la asignación de tier. NULL en filas legacy.';
COMMENT ON COLUMN budget_records.treatment_type IS
  'Snapshot denormalizado del tipo de tratamiento. Fuente de verdad: services.name vía service_id (cuando service_id IS NOT NULL). Conservado para reports históricos y backward compat con la UI (filtros por treatment_type, cards, etc.). NO dropear.';

-- ─────────────────────────────────────────────────────────────────
-- 4. Best-effort backfill — Concern B del schema audit §4
-- ─────────────────────────────────────────────────────────────────
-- Para cada budget_record sin service_id, intenta poblarlo desde el
-- servicio cuya `name` matchee el `treatment_type` legacy (mismo org).
-- NO bloquea la migración si no hay match — los reports usan LEFT
-- JOIN, NULL sigue siendo válido.
--
-- Mapping conservador (treatment_type enum → patrones ILIKE):
--   FIV         → 'FIV%' OR 'Fecundación in vitro%'
--   IIU         → 'IIU%' OR 'Inseminación%'
--   INDUCCION   → 'Inducción%'
--   CRIO        → 'Crio%' OR 'Criopreservación%'
--   OVODONACION → 'Ovodonación%' OR 'Ovodon%'
--   ROPA        → 'ROPA%' OR 'Método ROPA%'
--   OTRO        → no se backfilla (ambiguo)
DO $$
DECLARE
  v_pattern TEXT;
  v_treatment TEXT;
BEGIN
  FOR v_treatment, v_pattern IN
    SELECT * FROM (VALUES
      ('FIV',         'FIV%'),
      ('IIU',         'IIU%'),
      ('INDUCCION',   'Inducción%'),
      ('CRIO',        'Crio%'),
      ('OVODONACION', 'Ovodon%'),
      ('ROPA',        '%ROPA%')
    ) AS t(treatment, pattern)
  LOOP
    UPDATE budget_records br
    SET service_id = s.id
    FROM services s
    WHERE br.service_id IS NULL
      AND br.treatment_type = v_treatment
      AND s.organization_id = br.organization_id
      AND s.name ILIKE v_pattern
      AND s.id = (
        -- Prefer the lowest display_order match for determinism.
        SELECT s2.id FROM services s2
        WHERE s2.organization_id = br.organization_id
          AND s2.name ILIKE v_pattern
        ORDER BY s2.display_order NULLS LAST, s2.created_at ASC
        LIMIT 1
      );
  END LOOP;
END $$;

-- NOTE: rows without a match keep service_id = NULL. This is expected
-- and handled at the application layer (reports use LEFT JOIN).

-- ─────────────────────────────────────────────────────────────────
-- 5. services.created_by_addon — addon-managed service marker
-- ─────────────────────────────────────────────────────────────────
-- Marca un servicio como creado automáticamente al activar un addon.
-- Estos servicios pueden EDITARSE y DESACTIVARSE (is_active=false)
-- pero NO ELIMINARSE — si se eliminan se rompe consistencia con
-- budget_records y reportes históricos. Defense in depth: trigger DB
-- + UI gateado.
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS created_by_addon TEXT;

CREATE INDEX IF NOT EXISTS idx_services_created_by_addon
  ON services(created_by_addon) WHERE created_by_addon IS NOT NULL;

COMMENT ON COLUMN services.created_by_addon IS
  'Si el servicio fue creado automáticamente al activar un addon (ej. ''fertility_basic''), guarda esa key. Estos servicios pueden editarse y desactivarse pero NO eliminarse.';

-- DELETE-protection trigger
CREATE OR REPLACE FUNCTION prevent_delete_addon_services()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.created_by_addon IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede eliminar el servicio "%": fue creado por el addon "%". Desactivalo (is_active=false) en su lugar.',
      OLD.name, OLD.created_by_addon
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'protect_addon_services_delete'
  ) THEN
    CREATE TRIGGER protect_addon_services_delete
      BEFORE DELETE ON services
      FOR EACH ROW EXECUTE FUNCTION prevent_delete_addon_services();
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 6. seed_fertility_services(p_org_id) — RPC idempotente
-- ─────────────────────────────────────────────────────────────────
-- Crea/actualiza los 6 servicios TRA estándar + sus 18 tiers (A/B/C)
-- con precios baseline tomados del catálogo de Vitra. Idempotente:
-- si el servicio ya existe (por nombre + org), solo marca el flag
-- is_budget_eligible y created_by_addon. Los tiers se insertan con
-- ON CONFLICT DO NOTHING (la UNIQUE parcial ya filtra duplicados).
--
-- Llamar al activar el addon fertility_basic | fertility_premium en
-- una org. Para Vitra (única org con el addon ya activo al momento
-- de esta migración) se invoca al final del script (sección 7).
--
-- Precios baseline (NUEVO admin de la org puede editarlos en la UI):
--   FIV         A=16260  B=17020  C=16260
--   IIU         A=3750   B=3420   C=3100
--   ROPA        A=13600  B=12520  C=11980
--   CRIO        A=12600  B=11520  C=10980
--   OVODONACION A=32050  B=30750  C=30750
--   TED         A=4500   B=4280   C=4280
CREATE OR REPLACE FUNCTION seed_fertility_services(p_org_id UUID)
RETURNS TABLE(out_service_id UUID, out_service_name TEXT, out_action TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_category_id UUID;
  v_service_id UUID;
  v_action TEXT;
  v_idx INT;
  v_tier_idx INT;
  v_name TEXT;
  v_price NUMERIC;
  v_default_minutes INT;
  v_services TEXT[] := ARRAY[
    'Fecundación In Vitro (FIV)',
    'Inseminación Artificial (IIU)',
    'Método ROPA',
    'Criopreservación de óvulos',
    'Ovodonación + NGS',
    'Transferencia Embrionaria Diferida (TED)'
  ];
  -- Default minutes per service (TED is shorter, FIV/ROPA longer)
  v_minutes INT[] := ARRAY[60, 45, 90, 60, 90, 45];
  -- Tier prices: 6 services × 3 tiers (A/B/C)
  v_prices NUMERIC[][] := ARRAY[
    ARRAY[16260.00, 17020.00, 16260.00],  -- FIV
    ARRAY[3750.00,  3420.00,  3100.00],   -- IIU
    ARRAY[13600.00, 12520.00, 11980.00],  -- ROPA
    ARRAY[12600.00, 11520.00, 10980.00],  -- CRIO
    ARRAY[32050.00, 30750.00, 30750.00],  -- OVODONACION
    ARRAY[4500.00,  4280.00,  4280.00]    -- TED
  ];
  v_tier_letters TEXT[] := ARRAY['A','B','C'];
BEGIN
  -- 1) Asegurar categoría "Reproducción Asistida (TRA)" para la org.
  --    service_categories tiene UNIQUE(organization_id, name) (mig 013).
  SELECT id INTO v_category_id
  FROM service_categories
  WHERE organization_id = p_org_id AND name = 'Reproducción Asistida (TRA)';

  IF v_category_id IS NULL THEN
    INSERT INTO service_categories (organization_id, name, description, is_active, display_order)
    VALUES (
      p_org_id,
      'Reproducción Asistida (TRA)',
      'Tratamientos de reproducción asistida del addon Fertilidad. Servicios protegidos contra eliminación.',
      true,
      90
    )
    RETURNING id INTO v_category_id;
  END IF;

  -- 2) Por cada servicio: upsert manual (no hay UNIQUE en services.name)
  FOR v_idx IN 1..array_length(v_services, 1) LOOP
    v_name := v_services[v_idx];
    v_price := v_prices[v_idx][1];  -- baseline = tier A
    v_default_minutes := v_minutes[v_idx];

    SELECT id INTO v_service_id
    FROM services
    WHERE organization_id = p_org_id AND name = v_name
    LIMIT 1;

    IF v_service_id IS NULL THEN
      INSERT INTO services (
        organization_id, category_id, name,
        base_price, duration_minutes,
        is_active, is_budget_eligible, created_by_addon,
        display_order
      )
      VALUES (
        p_org_id, v_category_id, v_name,
        v_price, v_default_minutes,
        true, true, 'fertility_basic',
        v_idx * 10
      )
      RETURNING id INTO v_service_id;
      v_action := 'created';
    ELSE
      UPDATE services
        SET is_budget_eligible = true,
            created_by_addon   = COALESCE(created_by_addon, 'fertility_basic')
      WHERE id = v_service_id;
      v_action := 'flagged_existing';
    END IF;

    -- 3) Tiers A/B/C — la UNIQUE parcial filtra duplicados activos
    FOR v_tier_idx IN 1..3 LOOP
      INSERT INTO service_budget_tiers (
        service_id, tier, amount, currency, is_active
      )
      VALUES (
        v_service_id,
        v_tier_letters[v_tier_idx],
        v_prices[v_idx][v_tier_idx],
        'PEN',
        true
      )
      ON CONFLICT DO NOTHING;
    END LOOP;

    out_service_id := v_service_id;
    out_service_name := v_name;
    out_action := v_action;
    RETURN NEXT;
  END LOOP;
END $$;

COMMENT ON FUNCTION seed_fertility_services(UUID) IS
  'Sembrado idempotente de los 6 servicios TRA estándar + 18 tiers (A/B/C) para una org. Llamar al activar el addon fertility_basic|fertility_premium. SECURITY DEFINER: bypassa RLS durante seed; el caller debe gatear con app-layer addon check + admin role.';

-- ─────────────────────────────────────────────────────────────────
-- 7. Backfill — sembrar para orgs que YA tienen el addon activo
-- ─────────────────────────────────────────────────────────────────
-- Vitra es la única org con fertility_basic activado al momento de
-- esta migración. Cualquier org futura se siembra al activar el
-- addon (TODO en la API de toggle del addon — Phase 2).
DO $$
DECLARE
  v_org_id UUID;
  v_count INT := 0;
BEGIN
  FOR v_org_id IN
    SELECT DISTINCT oa.organization_id
    FROM organization_addons oa
    WHERE oa.addon_key IN ('fertility_basic', 'fertility_premium')
      AND oa.enabled = true
  LOOP
    PERFORM seed_fertility_services(v_org_id);
    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'seed_fertility_services applied to % orgs', v_count;
END $$;
