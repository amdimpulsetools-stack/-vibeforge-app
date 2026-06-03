-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 166: Dermatology before/after photos
--
-- First feature of the `dermatology` specialty addon (already seeded in
-- mig 091). Stores patient photos for the "Antes y Después" gallery.
--
-- Design (per docs/plan-vertical-dermatologia.md §1 + §5 and
-- docs/research/derma-photos-storage-strategy.md):
--   - Individual photos tagged with a `phase` (before/after/progress/
--     final), NOT rigid before/after pairs — far more flexible for the
--     comparator/timeline UX coming in v1.1.
--   - Own domain table `patient_photos` (NOT extending the generic
--     clinical_attachments) because phase/body_zone/is_face_visible are
--     core to the gallery, not optional metadata, and every Tier 2/3
--     feature (comparator, body map, dose heatmap) hangs off this entity.
--   - Dedicated private bucket `clinical-photos` so storage accounting
--     for the (future) per-org quota work (#7) is per-feature clean.
--
-- PERFORMANCE: we store TWO objects per photo — a display image
-- (~1600px WebP, compressed client-side) and a thumbnail (~400px WebP).
-- The gallery loads only thumbnails (~40KB each) so a 100-photo wall
-- scrolls at 60fps on any Supabase plan, WITHOUT depending on Storage
-- image-transformations (a Pro-only feature). The full display image is
-- fetched lazily only when a photo is expanded. Compression happens in a
-- Web Worker on the client, so the main thread never janks.
--
-- Soft delete (deleted_at) for Ley 29733 / audit compliance: a deleted
-- photo row is retained, the storage object is removed by the API.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Private bucket: clinical-photos
--    Bucket-level caps as defense-in-depth (the API also validates).
--    6 MB cap leaves head-room above the ~1.2 MB target display image.
-- ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-photos',
  'clinical-photos',
  false,
  6291456, -- 6 MB
  ARRAY['image/webp', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 2. RLS on storage.objects for clinical-photos
--    Path scheme: {org_id}/{patient_id}/{timestamp}-{kind}.webp
--    First folder = org_id. Members of the org read/write; only org
--    admins delete (the API uses the user client, so this is enforced).
--    Mirrors the budget-pdfs / clinical-files pattern (mig 141).
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'clinical_photos_select'
  ) THEN
    CREATE POLICY clinical_photos_select ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'clinical-photos'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'clinical_photos_insert'
  ) THEN
    CREATE POLICY clinical_photos_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'clinical-photos'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'clinical_photos_update'
  ) THEN
    CREATE POLICY clinical_photos_update ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'clinical-photos'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      )
      WITH CHECK (
        bucket_id = 'clinical-photos'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'clinical_photos_delete'
  ) THEN
    CREATE POLICY clinical_photos_delete ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'clinical-photos'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. Table: patient_photos
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  -- Clinical context (all optional — a post-hoc upload from the drawer
  -- may have none of these).
  appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL,
  service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Storage (both objects live in the clinical-photos bucket)
  storage_path TEXT NOT NULL,        -- display image (~1600px WebP)
  thumbnail_path TEXT NOT NULL,      -- gallery thumb (~400px WebP)
  file_size_bytes INTEGER NOT NULL DEFAULT 0,  -- display image size
  mime_type TEXT NOT NULL DEFAULT 'image/webp',

  -- Dermatology domain
  phase TEXT NOT NULL DEFAULT 'before'
    CHECK (phase IN ('before', 'after', 'progress', 'final')),
  body_zone TEXT,                    -- optional, free text in MVP
  is_face_visible BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,

  -- When the photo was actually taken (editable for post-hoc uploads of
  -- old photos; defaults to upload time).
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  deleted_at TIMESTAMPTZ,            -- soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Gallery query: photos for a patient, newest first, excluding deleted.
CREATE INDEX IF NOT EXISTS idx_patient_photos_patient
  ON patient_photos (patient_id, taken_at DESC)
  WHERE deleted_at IS NULL;

-- Per-org scans (future quota aggregation #7) + org isolation.
CREATE INDEX IF NOT EXISTS idx_patient_photos_org
  ON patient_photos (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_patient_photos_appointment
  ON patient_photos (appointment_id)
  WHERE appointment_id IS NOT NULL AND deleted_at IS NULL;

-- ─────────────────────────────────────────────────────────────────
-- 4. RLS on patient_photos — org-scoped (standard project pattern)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE patient_photos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photos'
      AND policyname = 'patient_photos_select'
  ) THEN
    CREATE POLICY patient_photos_select ON patient_photos FOR SELECT
      USING (organization_id IN (SELECT get_user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photos'
      AND policyname = 'patient_photos_insert'
  ) THEN
    CREATE POLICY patient_photos_insert ON patient_photos FOR INSERT
      WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photos'
      AND policyname = 'patient_photos_update'
  ) THEN
    CREATE POLICY patient_photos_update ON patient_photos FOR UPDATE
      USING (organization_id IN (SELECT get_user_org_ids()))
      WITH CHECK (organization_id IN (SELECT get_user_org_ids()));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'patient_photos'
      AND policyname = 'patient_photos_delete'
  ) THEN
    CREATE POLICY patient_photos_delete ON patient_photos FOR DELETE
      USING (organization_id IN (SELECT get_user_org_ids()));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 5. updated_at trigger
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_patient_photos_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'patient_photos_updated_at'
  ) THEN
    CREATE TRIGGER patient_photos_updated_at
      BEFORE UPDATE ON patient_photos
      FOR EACH ROW EXECUTE FUNCTION trg_patient_photos_updated_at();
  END IF;
END $$;

COMMENT ON TABLE patient_photos IS
  'Dermatology before/after photos for the `dermatology` addon gallery. Org-scoped, soft-deleted. Two storage objects per row (display + thumbnail) in the clinical-photos bucket.';
