-- ============================================================
-- 054: Fix clinical_notes RLS INSERT policy
-- ============================================================
-- The original INSERT policy (050) only allowed the treating doctor
-- to insert notes. Admins were blocked by RLS even though the API
-- authorised them. Align with prescriptions / followups (053) which
-- use the simpler org-membership check via get_user_org_ids().
-- ============================================================

-- Drop the restrictive INSERT policy
DROP POLICY IF EXISTS "clinical_notes: doctors can insert own" ON clinical_notes;

-- Recreate: any active org member can insert (API still enforces doctor/admin check)
CREATE POLICY "clinical_notes: org members can insert"
  ON clinical_notes FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids())
  );
