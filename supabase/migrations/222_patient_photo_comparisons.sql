-- ═══════════════════════════════════════════════════════════════════
-- 222: Curated before/after comparisons for the dermatology addon.
--
-- A comparison pairs two existing patient_photos (before + after) with
-- a title and description, powering the slider cards in the gallery
-- ("Comparativas fotográficas"). Photos remain independent rows — a
-- comparison is only a curated view over them, so deleting a comparison
-- never touches the photos, while deleting a photo cascades away any
-- comparison that referenced it.
--
-- Additive + idempotent — safe to apply on a live database.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patient_photo_comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  before_photo_id UUID NOT NULL REFERENCES patient_photos(id) ON DELETE CASCADE,
  after_photo_id UUID NOT NULL REFERENCES patient_photos(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT photo_comparison_distinct_photos CHECK (before_photo_id <> after_photo_id)
);

CREATE INDEX IF NOT EXISTS idx_photo_comparisons_patient
  ON patient_photo_comparisons (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_photo_comparisons_org
  ON patient_photo_comparisons (organization_id);

ALTER TABLE patient_photo_comparisons ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photo_comparisons'
      AND policyname = 'photo_comparisons_select'
  ) THEN
    CREATE POLICY photo_comparisons_select ON patient_photo_comparisons FOR SELECT
      TO authenticated
      USING (organization_id IN (SELECT get_user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photo_comparisons'
      AND policyname = 'photo_comparisons_insert'
  ) THEN
    CREATE POLICY photo_comparisons_insert ON patient_photo_comparisons FOR INSERT
      TO authenticated
      WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photo_comparisons'
      AND policyname = 'photo_comparisons_update'
  ) THEN
    CREATE POLICY photo_comparisons_update ON patient_photo_comparisons FOR UPDATE
      TO authenticated
      USING (organization_id IN (SELECT get_user_org_ids()))
      WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photo_comparisons'
      AND policyname = 'photo_comparisons_delete'
  ) THEN
    CREATE POLICY photo_comparisons_delete ON patient_photo_comparisons FOR DELETE
      TO authenticated
      USING (organization_id IN (SELECT get_user_org_ids()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'photo_comparisons_updated_at'
  ) THEN
    CREATE TRIGGER photo_comparisons_updated_at
      BEFORE UPDATE ON patient_photo_comparisons
      FOR EACH ROW EXECUTE FUNCTION trg_patient_photos_updated_at();
  END IF;
END $$;

COMMENT ON TABLE patient_photo_comparisons IS
  'Curated before/after pairs over patient_photos for the dermatology comparator cards. Org-scoped; deleting a comparison never deletes photos.';
