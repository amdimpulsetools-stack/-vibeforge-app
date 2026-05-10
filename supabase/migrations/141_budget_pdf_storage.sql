-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 141: Budget PDF storage (columns + bucket + RLS)
--
-- Phase 4 of the Budget Tiers A/B/C feature for the fertility addon.
-- Adds the storage layer so a budget can be lazily rendered to PDF
-- and persisted in a private Supabase Storage bucket.
--
--   - 3 columns on `budget_records` (path/timestamp/size).
--   - Private bucket `budget-pdfs` (idempotent INSERT).
--   - Org-scoped path RLS using `get_user_org_ids()` / `is_org_admin()`
--     (helpers from mig 013), mirroring the pattern in mig 015a /
--     mig 120 / mig 123.
--
-- Also includes a RETROACTIVE FIX (flagged in
-- docs/research/derma-photos-storage-strategy.md): the `clinical-files`
-- bucket is referenced by `app/api/clinical-attachments/route.ts` but
-- no prior migration ever creates it. We add it here with the same
-- idempotent `ON CONFLICT DO NOTHING` so prod orgs that have been
-- relying on a manually-created bucket keep working, and any fresh
-- environment also gets it on db push.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. budget_records — PDF storage columns
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE budget_records
  ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS pdf_generated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pdf_size_bytes INTEGER;

COMMENT ON COLUMN budget_records.pdf_storage_path IS
  'Path within the budget-pdfs storage bucket: org_id/budget_id.pdf. NULL means the PDF has not been generated yet (or has been invalidated by an edit). Lazy-generated on first download/send.';
COMMENT ON COLUMN budget_records.pdf_generated_at IS
  'Timestamp when the PDF in pdf_storage_path was rendered. Compared against budget_records.updated_at to detect staleness — if updated_at > pdf_generated_at the renderer regenerates.';
COMMENT ON COLUMN budget_records.pdf_size_bytes IS
  'Size in bytes of the rendered PDF. Used for ops/observability and to surface in cleanup logs.';

-- ─────────────────────────────────────────────────────────────────
-- 2. Storage bucket — budget-pdfs (private)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('budget-pdfs', 'budget-pdfs', false)
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────
-- 3. RLS on storage.objects for the budget-pdfs bucket
--
-- Pattern: the first folder of `name` is the org_id (UUID). Any
-- active org member can SELECT/INSERT/UPDATE; only owner/admin can
-- DELETE (cleanup cron uses service-role anyway).
-- ─────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'budget_pdfs_select'
  ) THEN
    CREATE POLICY budget_pdfs_select ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'budget-pdfs'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'budget_pdfs_insert'
  ) THEN
    CREATE POLICY budget_pdfs_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'budget-pdfs'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'budget_pdfs_update'
  ) THEN
    CREATE POLICY budget_pdfs_update ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'budget-pdfs'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      )
      WITH CHECK (
        bucket_id = 'budget-pdfs'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'budget_pdfs_delete'
  ) THEN
    CREATE POLICY budget_pdfs_delete ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'budget-pdfs'
        AND is_org_admin((storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Retroactive fix: clinical-files bucket
--
-- Flagged in docs/research/derma-photos-storage-strategy.md. The
-- bucket is referenced by app/api/clinical-attachments/route.ts but
-- no migration ever created it. Idempotent: if it already exists in
-- prod (manually created), the INSERT is a no-op; new envs (local
-- dev, branch DBs) finally get it.
--
-- Same RLS shape as budget-pdfs: org-scoped path; SELECT/INSERT/
-- UPDATE for any active org member, DELETE only for org admins.
-- File size and mime allowlist intentionally enforced at the
-- application layer in clinical-attachments/route.ts (10MB, image/*,
-- pdf, docx, txt) so we keep the bucket definition simple.
-- ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('clinical-files', 'clinical-files', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'clinical_files_select'
  ) THEN
    CREATE POLICY clinical_files_select ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'clinical-files'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'clinical_files_insert'
  ) THEN
    CREATE POLICY clinical_files_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'clinical-files'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'clinical_files_update'
  ) THEN
    CREATE POLICY clinical_files_update ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'clinical-files'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      )
      WITH CHECK (
        bucket_id = 'clinical-files'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'clinical_files_delete'
  ) THEN
    CREATE POLICY clinical_files_delete ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'clinical-files'
        AND is_org_admin((storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;
