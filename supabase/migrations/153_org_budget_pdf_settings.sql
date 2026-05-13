-- ============================================================
-- 153: Per-organization budget PDF settings ("Capa 1")
--
-- Removes the hardcoded "Vitra-ish" boilerplate (90-day vigencia,
-- 60-day post-pago, 10% retention) from the budget PDF generator.
-- Each clinic that activates fertility_basic / fertility_premium
-- gets its own row with neutral defaults that the owner edits
-- from /settings → Presupuestos.
-- ============================================================

CREATE TABLE IF NOT EXISTS org_budget_pdf_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  -- Days the budget is valid for after emission (used by the PDF
  -- header AND by the "Consideraciones" line if the org keeps it).
  vigencia_days   integer NOT NULL DEFAULT 30
                  CHECK (vigencia_days BETWEEN 1 AND 365),
  -- Bullet items rendered in the "Consideraciones" block. Each
  -- string is one bullet. Stored as a JSONB array so the UI can
  -- add/remove/reorder without a sibling table.
  terms           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Free-form footer text rendered above the signature block in
  -- the PDF footer. Optional — empty string means "don't render".
  footer_text     text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_budget_pdf_settings_org
  ON org_budget_pdf_settings(organization_id);

-- Defensive: terms must be a JSON array, not an object/scalar
ALTER TABLE org_budget_pdf_settings
  ADD CONSTRAINT org_budget_pdf_settings_terms_is_array
  CHECK (jsonb_typeof(terms) = 'array');

-- Reuse the existing update_updated_at trigger function
DROP TRIGGER IF EXISTS trg_org_budget_pdf_settings_updated_at
  ON org_budget_pdf_settings;
CREATE TRIGGER trg_org_budget_pdf_settings_updated_at
  BEFORE UPDATE ON org_budget_pdf_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ────────────────────────────────────────────────────────
ALTER TABLE org_budget_pdf_settings ENABLE ROW LEVEL SECURITY;

-- Any org member can read (the PDF generator may be invoked by
-- any role allowed to send budgets — owner/admin/doctor/asesora)
CREATE POLICY "org_budget_pdf_settings_select"
  ON org_budget_pdf_settings
  FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

-- Only owner/admin can write
CREATE POLICY "org_budget_pdf_settings_insert"
  ON org_budget_pdf_settings
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "org_budget_pdf_settings_update"
  ON org_budget_pdf_settings
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT om.organization_id
      FROM organization_members om
      WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- ── Seed RPC ───────────────────────────────────────────────────
-- Called from app/api/addons/[key]/activate/route.ts when an org
-- enables fertility_basic or fertility_premium. Idempotent.
CREATE OR REPLACE FUNCTION seed_budget_pdf_settings_default(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO org_budget_pdf_settings (
    organization_id,
    vigencia_days,
    terms,
    footer_text
  )
  VALUES (
    p_org_id,
    30,
    jsonb_build_array(
      'Vigencia del presupuesto: 30 días desde la fecha de emisión.',
      'Servicios médicos no contemplados en este presupuesto serán cotizados por separado.'
    ),
    ''
  )
  ON CONFLICT (organization_id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION seed_budget_pdf_settings_default(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seed_budget_pdf_settings_default(uuid) TO service_role;

-- ── Backfill ───────────────────────────────────────────────────
-- Existing orgs with fertility enabled get a row that reproduces
-- the previous hardcoded Vitra wording — so this migration is a
-- no-op for them visually. Future activations seeded by the RPC
-- above get neutral defaults instead. Once Vitra (or any current
-- customer) edits their row from /settings → Presupuestos, this
-- legacy text is overwritten with whatever they choose.
INSERT INTO org_budget_pdf_settings (
  organization_id,
  vigencia_days,
  terms,
  footer_text
)
SELECT
  oa.organization_id,
  90,
  jsonb_build_array(
    'Vigencia del presupuesto: 90 días desde la fecha de emisión.',
    'Una vez efectuado el pago, el presupuesto mantiene vigencia por 60 días para iniciar el tratamiento.',
    'En caso de devolución, se aplicará una retención del 10% por gastos administrativos.',
    'Servicios médicos no contemplados en este presupuesto serán cotizados por separado.'
  ),
  ''
FROM organization_addons oa
WHERE oa.addon_key IN ('fertility_basic', 'fertility_premium')
  AND oa.enabled = true
ON CONFLICT (organization_id) DO NOTHING;
