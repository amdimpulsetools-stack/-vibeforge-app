-- ============================================================
-- 157: Clinical access log (NTS 139 + Ley 29733 compliance)
--
-- Audit trail for every read/write/export of sensitive medical
-- data. Required by Peruvian compliance:
--   - NTS 139-2018-MINSA/2018/DGIESP (norma técnica de
--     telesalud): the EHR system must be able to identify
--     which user accessed which patient's record, when, and
--     from where.
--   - Ley 29733 (Protección de Datos Personales): patients
--     have a right to know who accessed their data.
--
-- Insert-only from the app (no UPDATE/DELETE policies). We
-- never mutate audit rows — corrections happen by inserting a
-- new row. Future cron will archive rows > 5y to cold storage.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.clinical_access_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Patient whose data was accessed. Nullable for org-wide
  -- exports / list actions that don't resolve to one patient.
  patient_id      UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  -- Specific resource within the patient (clinical note id,
  -- prescription id, attachment id, etc). Nullable for list-
  -- type actions where there's no single row id.
  resource_id     UUID,
  resource_type   TEXT NOT NULL CHECK (resource_type IN (
    'patient',           -- patient detail view / antecedents / anthropometry
    'clinical_note',     -- consultation note (SOAP, free-form)
    'prescription',      -- single or batch
    'attachment',        -- files + informed consents (PDF/photo)
    'lab_result',        -- exam_orders + exam_order_items results
    'treatment_plan',    -- multi-session plan + line items
    'medical_history',   -- antecedentes (allergies, conditions)
    'appointment',       -- clinical_followups
    'ai_query',          -- AI assistant queries (even pseudonymized)
    'other'
  )),
  action          TEXT NOT NULL CHECK (action IN (
    'view',              -- GET single resource
    'list',              -- GET collection
    'create',            -- POST
    'update',            -- PATCH/PUT
    'delete',            -- DELETE
    'export',            -- CSV / bulk export
    'print',             -- print-to-PDF rendered server-side
    'download'           -- signed-URL download of an attachment
  )),
  at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address      INET,
  user_agent      TEXT,
  -- Free-form context (filename of download, search query,
  -- count of records in a list, etc). Keep keys flat — we
  -- query it ad-hoc in the admin UI.
  metadata        JSONB DEFAULT '{}'::jsonb
);

-- ── Indices ─────────────────────────────────────────────────
-- The admin UI's "last 24h" / "last week" query lives on
-- (organization_id, at DESC). That's the hot path.
CREATE INDEX IF NOT EXISTS idx_cal_org_at
  ON public.clinical_access_log(organization_id, at DESC);

-- "Show me everything user X did" — used for incident response.
CREATE INDEX IF NOT EXISTS idx_cal_user_at
  ON public.clinical_access_log(user_id, at DESC);

-- "Show me everyone who touched patient X's record" — the
-- right-to-know flow when a patient asks who saw their data.
CREATE INDEX IF NOT EXISTS idx_cal_patient_at
  ON public.clinical_access_log(patient_id, at DESC)
  WHERE patient_id IS NOT NULL;

-- Filtering by resource_type + date range in the admin UI.
CREATE INDEX IF NOT EXISTS idx_cal_org_resource_at
  ON public.clinical_access_log(organization_id, resource_type, at DESC);

-- ── RLS ────────────────────────────────────────────────────
ALTER TABLE public.clinical_access_log ENABLE ROW LEVEL SECURITY;

-- Owner + admin of the org can read. Nobody else — not even
-- the doctor whose own actions generated the row. Doctors
-- seeing their own audit trail would let a malicious actor
-- verify whether their snooping was detected.
CREATE POLICY "owner_admin_read_audit_log"
  ON public.clinical_access_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = clinical_access_log.organization_id
        AND om.role IN ('owner', 'admin')
        AND om.is_active = true
    )
  );

-- INSERTs only via service-role (admin client in the helper).
-- No INSERT policy means anon/authenticated cannot insert
-- directly — keeps the data trustworthy.

COMMENT ON TABLE public.clinical_access_log IS
  'Append-only audit trail for clinical data access. NTS 139 + Ley 29733 compliance. Only owner/admin can read; insert is service-role only via lib/audit/clinical-access.ts.';

COMMENT ON COLUMN public.clinical_access_log.metadata IS
  'Free-form context: filename for downloads, search query for lists, batch count for batch creates, etc.';
