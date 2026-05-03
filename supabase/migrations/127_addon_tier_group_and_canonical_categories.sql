-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 127: addon tier_group + catálogo canónico + reglas/templates
--
-- Fundamento del módulo "Seguimientos Automatizados" del addon
-- fertility_basic. Agrega:
--   1. addons.tier_group (para el modelo basic/premium mutuamente
--      exclusivos por vertical).
--   2. addon_canonical_categories: catálogo global de categorías
--      canónicas que un addon define (ej. fertility.first_consultation).
--   3. organization_service_canonical_mapping: mapeo per-org entre
--      categoría canónica y servicios del catálogo de la clínica.
--   4. followup_rules: reglas pre-configuradas (NULL org = template
--      global) + reglas custom per-org.
--   5. message_templates: plantillas email (las plantillas WhatsApp
--      reales viven en whatsapp_templates ya que requieren aprobación
--      Meta; followup_rules.whatsapp_template_id apunta a esa tabla).
--
-- Idempotente: usa IF NOT EXISTS y ADD COLUMN IF NOT EXISTS.
-- Ver: docs/spec-followup-module-fertility.md secs. 2.4–2.7.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. addons.tier_group ──────────────────────────────────────────
-- NULL = independent addon. Same value = mutually exclusive tier
-- (ej. fertility_basic y fertility_premium con tier_group='fertility').
ALTER TABLE addons
  ADD COLUMN IF NOT EXISTS tier_group TEXT;

COMMENT ON COLUMN addons.tier_group IS
  'NULL = independent addon. Same value = mutually exclusive tier (basic/premium).';

-- ── 2. addon_canonical_categories ─────────────────────────────────
-- Catálogo global compartido entre orgs. NO tiene RLS — es de lectura
-- pública para cualquier usuario autenticado.
CREATE TABLE IF NOT EXISTS addon_canonical_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  addon_key TEXT NOT NULL,
  category_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_addon_canonical_categories_addon_sort
  ON addon_canonical_categories(addon_key, sort_order);

GRANT SELECT ON addon_canonical_categories TO authenticated;

-- ── 3. organization_service_canonical_mapping ─────────────────────
-- Mapeo per-org. RLS multi-tenant (patrón de organization_addons).
CREATE TABLE IF NOT EXISTS organization_service_canonical_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_key TEXT NOT NULL REFERENCES addon_canonical_categories(category_key) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, category_key, service_id)
);

CREATE INDEX IF NOT EXISTS idx_oscm_org_category
  ON organization_service_canonical_mapping(organization_id, category_key);
CREATE INDEX IF NOT EXISTS idx_oscm_org_service
  ON organization_service_canonical_mapping(organization_id, service_id);

ALTER TABLE organization_service_canonical_mapping ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_service_canonical_mapping' AND policyname='oscm_select') THEN
    CREATE POLICY "oscm_select" ON organization_service_canonical_mapping
      FOR SELECT TO authenticated
      USING (organization_id IN (SELECT get_user_org_ids()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_service_canonical_mapping' AND policyname='oscm_insert') THEN
    CREATE POLICY "oscm_insert" ON organization_service_canonical_mapping
      FOR INSERT TO authenticated
      WITH CHECK (is_org_admin(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_service_canonical_mapping' AND policyname='oscm_update') THEN
    CREATE POLICY "oscm_update" ON organization_service_canonical_mapping
      FOR UPDATE TO authenticated
      USING (is_org_admin(organization_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='organization_service_canonical_mapping' AND policyname='oscm_delete') THEN
    CREATE POLICY "oscm_delete" ON organization_service_canonical_mapping
      FOR DELETE TO authenticated
      USING (is_org_admin(organization_id));
  END IF;
END $$;

-- ── 4. followup_rules ─────────────────────────────────────────────
-- organization_id NULL = regla global del addon (template).
-- whatsapp_template_id apunta a whatsapp_templates (ya existe, requiere
-- aprobación Meta). email_template_key apunta a message_templates.template_key.
CREATE TABLE IF NOT EXISTS followup_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  trigger_category_key TEXT,
  target_category_key TEXT,
  delay_days INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  whatsapp_template_id UUID REFERENCES whatsapp_templates(id) ON DELETE SET NULL,
  email_template_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT followup_rules_trigger_event_check
    CHECK (trigger_event IN ('appointment_completed','treatment_plan_created','plan_status_changed')),
  UNIQUE(organization_id, rule_key)
);

CREATE INDEX IF NOT EXISTS idx_followup_rules_org_addon_active
  ON followup_rules(organization_id, addon_key, is_active);

ALTER TABLE followup_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_rules' AND policyname='followup_rules_select') THEN
    -- SELECT visible si es template global (org NULL) O pertenece a la org del user.
    CREATE POLICY "followup_rules_select" ON followup_rules
      FOR SELECT TO authenticated
      USING (
        organization_id IS NULL
        OR organization_id IN (SELECT get_user_org_ids())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_rules' AND policyname='followup_rules_insert') THEN
    -- Solo admins pueden insertar reglas para su org. NUNCA insert con org NULL desde la app.
    CREATE POLICY "followup_rules_insert" ON followup_rules
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id IS NOT NULL
        AND is_org_admin(organization_id)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_rules' AND policyname='followup_rules_update') THEN
    -- Admin puede ajustar reglas de su org. is_system=true puede ajustarse (delay_days, is_active)
    -- pero el filtro por organization_id IS NOT NULL evita que toque templates globales.
    CREATE POLICY "followup_rules_update" ON followup_rules
      FOR UPDATE TO authenticated
      USING (
        organization_id IS NOT NULL
        AND is_org_admin(organization_id)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='followup_rules' AND policyname='followup_rules_delete') THEN
    -- Admin puede borrar reglas custom de su org pero NO las is_system=true.
    CREATE POLICY "followup_rules_delete" ON followup_rules
      FOR DELETE TO authenticated
      USING (
        organization_id IS NOT NULL
        AND is_org_admin(organization_id)
        AND is_system = false
      );
  END IF;
END $$;

-- ── 5. message_templates ──────────────────────────────────────────
-- Solo email + metadata. Las plantillas WhatsApp reales viven en
-- whatsapp_templates (existente, tabla per-org con aprobación Meta).
-- 'whatsapp_meta_ref' es solo placeholder textual para tracking.
CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL,
  template_key TEXT NOT NULL,
  channel TEXT NOT NULL,
  tone TEXT NOT NULL,
  subject TEXT,
  body TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_templates_channel_check
    CHECK (channel IN ('email','whatsapp_meta_ref')),
  UNIQUE(organization_id, template_key, channel, tone)
);

CREATE INDEX IF NOT EXISTS idx_message_templates_org_addon
  ON message_templates(organization_id, addon_key);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='message_templates_select') THEN
    CREATE POLICY "message_templates_select" ON message_templates
      FOR SELECT TO authenticated
      USING (
        organization_id IS NULL
        OR organization_id IN (SELECT get_user_org_ids())
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='message_templates_insert') THEN
    CREATE POLICY "message_templates_insert" ON message_templates
      FOR INSERT TO authenticated
      WITH CHECK (
        organization_id IS NOT NULL
        AND is_org_admin(organization_id)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='message_templates_update') THEN
    CREATE POLICY "message_templates_update" ON message_templates
      FOR UPDATE TO authenticated
      USING (
        organization_id IS NOT NULL
        AND is_org_admin(organization_id)
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='message_templates' AND policyname='message_templates_delete') THEN
    CREATE POLICY "message_templates_delete" ON message_templates
      FOR DELETE TO authenticated
      USING (
        organization_id IS NOT NULL
        AND is_org_admin(organization_id)
        AND is_system = false
      );
  END IF;
END $$;
