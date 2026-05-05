-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 136: Fertility budget tracking funnel
--
-- Independent table for tracking budgets sent to patients. Decoupled
-- from treatment_plans because clinics like Vitra use external EHR
-- (Omnia) and never create treatment_plans inside Yenda. The optional
-- treatment_plan_id is reserved for future clinics that DO use the
-- internal HC.
--
-- Append-only by design: no DELETE policy. Status transitions go
-- pending_acceptance → accepted | rejected. Window between sent_at and
-- decision can be 3+ months — this is normal.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS budget_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  treatment_plan_id UUID REFERENCES treatment_plans(id) ON DELETE SET NULL,

  sent_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  treatment_type TEXT NOT NULL CHECK (treatment_type IN (
    'FIV', 'IIU', 'INDUCCION', 'CRIO', 'OVODONACION', 'ROPA', 'OTRO'
  )),
  amount NUMERIC(10,2),
  notes TEXT,

  acceptance_status TEXT NOT NULL DEFAULT 'pending_acceptance'
    CHECK (acceptance_status IN ('pending_acceptance', 'accepted', 'rejected')),
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  followup_id UUID REFERENCES clinical_followups(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_records_org_status_sent
  ON budget_records(organization_id, acceptance_status, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_budget_records_patient
  ON budget_records(patient_id);
CREATE INDEX IF NOT EXISTS idx_budget_records_treatment_plan
  ON budget_records(treatment_plan_id) WHERE treatment_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_budget_records_sent_by
  ON budget_records(sent_by_user_id, sent_at DESC);

ALTER TABLE budget_records ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'budget_records' AND policyname = 'budget_records_select'
  ) THEN
    CREATE POLICY budget_records_select ON budget_records FOR SELECT
      USING (
        organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'budget_records' AND policyname = 'budget_records_insert'
  ) THEN
    CREATE POLICY budget_records_insert ON budget_records FOR INSERT
      WITH CHECK (
        organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'budget_records' AND policyname = 'budget_records_update'
  ) THEN
    CREATE POLICY budget_records_update ON budget_records FOR UPDATE
      USING (
        organization_id IN (
          SELECT organization_id FROM organization_members
          WHERE user_id = auth.uid() AND is_active = true
        )
      );
  END IF;
  -- NO DELETE policy — append-only por auditoría comercial.
END $$;

CREATE OR REPLACE FUNCTION trg_budget_records_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'budget_records_updated_at'
  ) THEN
    CREATE TRIGGER budget_records_updated_at
      BEFORE UPDATE ON budget_records
      FOR EACH ROW EXECUTE FUNCTION trg_budget_records_updated_at();
  END IF;
END $$;

COMMENT ON TABLE budget_records IS
  'Tracking de presupuestos enviados a pacientes en addons fertility. Independiente de treatment_plans por compatibilidad con clínicas que usan EHR externo.';
