-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 128: Extiende clinical_followups y appointments para el
-- módulo de Seguimientos Automatizados (atribución honesta).
--
-- clinical_followups (mig 053) maneja hoy un semáforo (priority/
-- is_resolved/follow_up_date). Le agregamos columnas para soportar
-- el flujo automatizado: source, rule_key, target_category_canonical,
-- expected_by, first_contact_at, contact_events, snooze_until,
-- attempt_count, max_attempts, closure_reason, closed_at, status.
--
-- appointments recibe attribution_source, linked_followup_id y
-- attribution_set_at para que el trigger de mig 129 calcule la
-- atribución a la creación de cada cita.
--
-- Ver: docs/spec-followup-module-fertility.md secs. 2.1, 2.3, 4.1.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. clinical_followups ─────────────────────────────────────────
ALTER TABLE clinical_followups
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS rule_key TEXT,
  ADD COLUMN IF NOT EXISTS target_category_canonical TEXT,
  ADD COLUMN IF NOT EXISTS expected_by TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS contact_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS closure_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status TEXT;

-- Backfill status para filas pre-existentes según is_resolved.
-- Solo se ejecuta en filas que aún no tienen status.
UPDATE clinical_followups
SET status = CASE
  WHEN is_resolved IS TRUE THEN 'cerrado_manual'
  ELSE 'pendiente'
END
WHERE status IS NULL;

-- Marcar status como NOT NULL después del backfill.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='clinical_followups'
      AND column_name='status' AND is_nullable='YES'
  ) THEN
    ALTER TABLE clinical_followups
      ALTER COLUMN status SET NOT NULL,
      ALTER COLUMN status SET DEFAULT 'pendiente';
  END IF;
END $$;

-- CHECK de source.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'clinical_followups'::regclass
      AND conname = 'clinical_followups_source_check'
  ) THEN
    ALTER TABLE clinical_followups
      ADD CONSTRAINT clinical_followups_source_check
      CHECK (source IN ('manual','rule','system'));
  END IF;
END $$;

-- CHECK de status (incluye estados nuevos del módulo de seguimientos).
-- 'cerrado_manual' cubre tanto el backfill (filas pre-existentes
-- resueltas) como los cierres manuales explícitos del nuevo módulo.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'clinical_followups'::regclass
      AND conname = 'clinical_followups_status_check'
  ) THEN
    ALTER TABLE clinical_followups
      ADD CONSTRAINT clinical_followups_status_check
      CHECK (status IN (
        'pendiente',
        'contactado',
        'agendado_via_contacto',
        'agendado_organico_dentro_ventana',
        'pospuesto',
        'desistido_silencioso',
        'vencido',
        'cerrado_manual'
      ));
  END IF;
END $$;

-- Índices para el cron y para el trigger de atribución.
CREATE INDEX IF NOT EXISTS idx_clinical_followups_org_status_expected
  ON clinical_followups(organization_id, status, expected_by);
CREATE INDEX IF NOT EXISTS idx_clinical_followups_attribution_lookup
  ON clinical_followups(organization_id, patient_id, target_category_canonical, status);

-- ── 2. appointments ───────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS attribution_source TEXT NOT NULL DEFAULT 'organica',
  ADD COLUMN IF NOT EXISTS linked_followup_id UUID REFERENCES clinical_followups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attribution_set_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'appointments'::regclass
      AND conname = 'appointments_attribution_source_check'
  ) THEN
    ALTER TABLE appointments
      ADD CONSTRAINT appointments_attribution_source_check
      CHECK (attribution_source IN ('recovered_with_contact','agendado_sin_contacto','organica'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_appointments_attribution_kpi
  ON appointments(organization_id, attribution_source, created_at DESC);
