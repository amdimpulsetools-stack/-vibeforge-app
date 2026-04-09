-- ============================================================
-- 054: Add contact tracking fields to clinical_followups
-- Allows receptionists to mark patients as "contacted"
-- ============================================================

ALTER TABLE clinical_followups
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz,
  ADD COLUMN IF NOT EXISTS contacted_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_clinical_followups_contacted
  ON clinical_followups(last_contacted_at)
  WHERE NOT is_resolved AND last_contacted_at IS NOT NULL;
