-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 169: org_plugins — per-org plugin registry
--
-- Generic plugin table that orgs use to opt into very-specific
-- features that don't make sense as global product behavior. First
-- consumer is `budget_pdf_vitra` (the Capa 2 HTML budget templates
-- we built for NATURVITRA), but the same table will host future
-- per-org overrides: whatsapp templates, e-invoice formats, etc.
--
-- Design notes:
--   • plugin_key is freeform TEXT, conventionally prefixed by domain
--     (`budget_pdf_*`, `whatsapp_*`, `einvoice_*`). The runtime
--     registry in `lib/plugins/registry.ts` is the source of truth
--     for which keys exist — a row with an unknown key is a no-op.
--   • config is a JSONB blob whose shape is defined by each plugin
--     module. We don't enforce structure at the DB layer so plugins
--     can evolve their config independently (validation happens in
--     the founder install UI + at render time).
--   • Founder-only writes (RLS below). The whole point of a plugin
--     is that it's curated by us — org admins don't see it in their
--     own settings UI. Reads are allowed to any org member so the
--     runtime can check active plugins during normal request flow.
--   • A plugin can be temporarily disabled (`enabled = false`)
--     without losing its config, which is useful for incident
--     response or A/B testing without re-uploading the JSONB.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS org_plugins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL
    REFERENCES organizations(id) ON DELETE CASCADE,
  plugin_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  installed_by_user_id UUID
    REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT org_plugins_unique UNIQUE (organization_id, plugin_key)
);

-- The runtime resolver always filters by (org, enabled), so the
-- compound partial index is the workhorse. The unique constraint
-- above doubles as a lookup index but doesn't help when scanning
-- "all enabled plugins for org X".
CREATE INDEX IF NOT EXISTS idx_org_plugins_org_enabled
  ON org_plugins(organization_id, plugin_key)
  WHERE enabled = true;

-- Touch updated_at on UPDATE — same pattern as other tables in this
-- schema (see mig 136, 137, etc.).
CREATE OR REPLACE FUNCTION touch_org_plugins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS org_plugins_touch_updated_at ON org_plugins;
CREATE TRIGGER org_plugins_touch_updated_at
  BEFORE UPDATE ON org_plugins
  FOR EACH ROW
  EXECUTE FUNCTION touch_org_plugins_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────
-- SELECT is open to any active org member so the runtime can resolve
-- active plugins as part of normal request handling. Writes
-- (INSERT/UPDATE/DELETE) are restricted to founders — plugins are
-- our curated extension surface, not something an org admin can
-- self-install. The founder check uses `user_profiles.is_founder`
-- (mig 090) — same gate the founder dashboard uses.
ALTER TABLE org_plugins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_plugins_select_for_members"
  ON org_plugins
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM organization_members m
      WHERE m.organization_id = org_plugins.organization_id
        AND m.user_id = auth.uid()
        AND m.is_active = true
    )
  );

CREATE POLICY "org_plugins_write_founder_only"
  ON org_plugins
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.is_founder = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles up
      WHERE up.id = auth.uid() AND up.is_founder = true
    )
  );

COMMENT ON TABLE org_plugins IS
  'Per-org opt-in to ultra-specific features (custom budget PDFs, whatsapp templates, etc.). Curated by founders only — not exposed to org admins. The runtime registry in lib/plugins defines which plugin_keys are valid.';
COMMENT ON COLUMN org_plugins.plugin_key IS
  'Registry key, conventionally domain-prefixed (e.g. budget_pdf_vitra, whatsapp_xyz). Unknown keys are no-ops at runtime.';
COMMENT ON COLUMN org_plugins.config IS
  'Plugin-defined JSONB. Shape varies per plugin; validated by the founder install UI + at render time. Editable per-org without re-deploying code.';
COMMENT ON COLUMN org_plugins.enabled IS
  'Toggle to temporarily disable without losing config. Useful during incident response or template iteration.';
