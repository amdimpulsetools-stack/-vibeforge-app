-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 143: Patient bulk import — audit table, storage bucket,
--                stronger dedup index on patients.
--
-- Pre-launch blocker fix flagged in
-- docs/launch-prep/bulk-import-audit.md.
--
-- Before this migration the bulk import ran entirely client-side:
--   - no atomicity (tab close = corrupt state)
--   - no audit log (Ley 29733 risk)
--   - dedup only on (organization_id, dni) → patients without DNI
--     could be re-imported infinitely
--   - retry path was 1 RPC per duplicate row (explosive)
--
-- This migration adds the persistence layer for the new server-side
-- flow:
--   1. `patient_imports` audit table (one row per CSV upload).
--   2. Private storage bucket `patient-imports` for the original CSV
--      (replay / rollback / forensics).
--   3. Generated `dedup_key` on `patients` + unique index, so patients
--      WITHOUT a DNI also get a stable dedup signal
--      (first_name + last_name + phone lowercased).
--
-- Everything is idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`)
-- so re-applying is a no-op.
-- ═══════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. patient_imports audit table
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS patient_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  imported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  csv_filename TEXT NOT NULL,
  csv_storage_path TEXT,
  total_rows INT NOT NULL DEFAULT 0,
  inserted_rows INT NOT NULL DEFAULT 0,
  skipped_duplicates INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  error_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','processing','completed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_imports_org
  ON patient_imports(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_patient_imports_user
  ON patient_imports(imported_by_user_id);

ALTER TABLE patient_imports ENABLE ROW LEVEL SECURITY;

-- RLS — read for any active org member, write only for owner/admin
-- (mig 013 helpers `get_user_org_ids()` / `is_org_admin()`).
-- All real writes from the API run with service-role and bypass RLS,
-- but these policies keep the table safe if a client ever hits it
-- directly through PostgREST.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'patient_imports' AND policyname = 'pi_select') THEN
    CREATE POLICY pi_select ON patient_imports FOR SELECT TO authenticated
      USING (organization_id IN (SELECT get_user_org_ids()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'patient_imports' AND policyname = 'pi_insert') THEN
    CREATE POLICY pi_insert ON patient_imports FOR INSERT TO authenticated
      WITH CHECK (is_org_admin(organization_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'patient_imports' AND policyname = 'pi_update') THEN
    CREATE POLICY pi_update ON patient_imports FOR UPDATE TO authenticated
      USING (is_org_admin(organization_id))
      WITH CHECK (is_org_admin(organization_id));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'patient_imports' AND policyname = 'pi_delete') THEN
    CREATE POLICY pi_delete ON patient_imports FOR DELETE TO authenticated
      USING (is_org_admin(organization_id));
  END IF;
END $$;

-- updated_at trigger (reuses the global helper from mig 001).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at_patient_imports'
  ) THEN
    CREATE TRIGGER set_updated_at_patient_imports
      BEFORE UPDATE ON patient_imports
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

COMMENT ON TABLE patient_imports IS
  'Auditoría de importaciones masivas de pacientes (Ley 29733). Una fila por subida de CSV. Conserva el archivo original en storage (patient-imports bucket) y los conteos finales. Las API routes de /api/patient-imports/* escriben con service-role.';
COMMENT ON COLUMN patient_imports.status IS
  'uploading → mientras el CSV todavía está subiendo a Storage. processing → procesando filas. completed → terminó (parcial o totalmente OK). failed → error fatal antes de procesar filas.';
COMMENT ON COLUMN patient_imports.error_summary IS
  'Array JSONB con los primeros ~200 errores: [{row, dni, reason, code}]. Lista truncada para no inflar la fila; el detalle completo se reconstruye desde el CSV original + dedup_key.';
COMMENT ON COLUMN patient_imports.csv_storage_path IS
  'Path dentro del bucket patient-imports: {organization_id}/{id}.csv. NULL si la subida nunca terminó.';

-- ─────────────────────────────────────────────────────────────────
-- 2. Storage bucket — patient-imports (private)
-- ─────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('patient-imports', 'patient-imports', false)
ON CONFLICT (id) DO NOTHING;

-- RLS on storage.objects, same path-based pattern as mig 141 (budget-pdfs).
-- First folder of `name` is the org_id. SELECT/INSERT for any org
-- member; UPDATE/DELETE only for admin (cleanup uses service-role).
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'patient_imports_select'
  ) THEN
    CREATE POLICY patient_imports_select ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'patient-imports'
        AND (storage.foldername(name))[1]::uuid IN (SELECT get_user_org_ids())
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'patient_imports_insert'
  ) THEN
    CREATE POLICY patient_imports_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'patient-imports'
        AND is_org_admin((storage.foldername(name))[1]::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'patient_imports_update'
  ) THEN
    CREATE POLICY patient_imports_update ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'patient-imports'
        AND is_org_admin((storage.foldername(name))[1]::uuid)
      )
      WITH CHECK (
        bucket_id = 'patient-imports'
        AND is_org_admin((storage.foldername(name))[1]::uuid)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'patient_imports_delete'
  ) THEN
    CREATE POLICY patient_imports_delete ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'patient-imports'
        AND is_org_admin((storage.foldername(name))[1]::uuid)
      );
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────
-- 3. patients.dedup_key (generated column + unique index)
--
-- Trade-off (documented per task brief): we use a GENERATED ALWAYS
-- STORED column instead of adding a composite UNIQUE on
-- (organization_id, first_name, last_name, phone).
--
-- Why dedup_key:
--   - Single source of truth for "this is the same patient"; the
--     server-side import path queries one column instead of OR-joining
--     four.
--   - Tolerant to case / NULL-vs-empty mismatches.
--   - Backward compatible: legacy rows already in `patients` get a
--     dedup_key auto-computed; the pre-existing UNIQUE(org, dni) is
--     subsumed by the dni branch ('dni:' || dni).
--   - The composite approach would have required dropping
--     patients_org_dni_unique (mig 013:225) and handling NULL phone
--     specially, which is messier.
--
-- Cost: STORED takes a few bytes per row. Acceptable.
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS dedup_key TEXT
    GENERATED ALWAYS AS (
      CASE
        WHEN dni IS NOT NULL AND length(trim(dni)) > 0
          THEN 'dni:' || lower(trim(dni))
        ELSE 'np:'
             || lower(coalesce(trim(first_name), ''))
             || '|'
             || lower(coalesce(trim(last_name),  ''))
             || '|'
             || coalesce(trim(phone), '')
      END
    ) STORED;

COMMENT ON COLUMN patients.dedup_key IS
  'Clave de deduplicación generada. Si hay DNI → "dni:<dni-lower>". Si no → "np:<first_name-lower>|<last_name-lower>|<phone>". STORED para indexar. La importación masiva (POST /api/patient-imports/start) consulta esta columna para detectar duplicados en una sola query antes de insertar.';

-- UNIQUE per org. NOT a CONCURRENTLY index because we are inside a
-- migration transaction; if the table is large in prod this will lock
-- briefly. For Vitra (current footprint ~0 patients in many orgs) this
-- is negligible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_patients_org_dedup_key
  ON patients(organization_id, dedup_key);
