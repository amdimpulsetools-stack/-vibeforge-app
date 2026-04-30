-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 124: Múltiples diagnósticos CIE-10 por nota clínica
--
-- Las notas clínicas hasta ahora soportan UN solo diagnóstico
-- (clinical_notes.diagnosis_code/label). Esto fuerza al doctor a
-- elegir el "más importante" o concatenar texto, lo que rompe
-- analítica y el reporte epidemiológico.
--
-- Esta migración normaliza diagnósticos en una tabla aparte
-- (`clinical_note_diagnoses`) con flag is_primary y position para
-- ordenamiento. Las columnas legacy `clinical_notes.diagnosis_code` y
-- `diagnosis_label` se mantienen como ESPEJO del diagnóstico primario,
-- gestionado por trigger — así prints, exam orders, prescriptions y
-- history views existentes siguen funcionando sin modificación
-- mientras vamos migrando cada lector a la lista completa.
--
-- ⚠️  Backfill: una fila por nota con diagnosis_code IS NOT NULL,
--     marcada is_primary=true, position=0.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS clinical_note_diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinical_note_id UUID NOT NULL REFERENCES clinical_notes(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One primary per note. Partial unique index allows zero or one
-- primary, never two.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_note_diagnoses_primary
  ON clinical_note_diagnoses(clinical_note_id)
  WHERE is_primary = true;

-- Same code can't appear twice in the same note (case-insensitive).
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_note_diagnoses_unique_code
  ON clinical_note_diagnoses(clinical_note_id, lower(code));

CREATE INDEX IF NOT EXISTS idx_clinical_note_diagnoses_note
  ON clinical_note_diagnoses(clinical_note_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_diagnoses_org
  ON clinical_note_diagnoses(organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_note_diagnoses_code
  ON clinical_note_diagnoses(code);

ALTER TABLE clinical_note_diagnoses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_note_diagnoses_select"
  ON clinical_note_diagnoses FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "clinical_note_diagnoses_insert"
  ON clinical_note_diagnoses FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "clinical_note_diagnoses_update"
  ON clinical_note_diagnoses FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "clinical_note_diagnoses_delete"
  ON clinical_note_diagnoses FOR DELETE
  USING (organization_id IN (SELECT get_user_org_ids()));

COMMENT ON TABLE clinical_note_diagnoses IS
  'Diagnósticos CIE-10 asociados a una nota clínica. Una fila por código. is_primary=true marca el diagnóstico principal (espejado a clinical_notes.diagnosis_code/label vía trigger).';

-- ─── Backfill: existing single-diagnosis notes → primary row ──────
INSERT INTO clinical_note_diagnoses
  (clinical_note_id, organization_id, code, label, is_primary, position)
SELECT
  cn.id,
  cn.organization_id,
  cn.diagnosis_code,
  COALESCE(cn.diagnosis_label, cn.diagnosis_code),
  true,
  0
FROM clinical_notes cn
WHERE cn.diagnosis_code IS NOT NULL
  AND cn.diagnosis_code <> ''
ON CONFLICT DO NOTHING;

-- ─── Trigger: keep clinical_notes.diagnosis_code/label mirrored ───
CREATE OR REPLACE FUNCTION sync_primary_diagnosis_to_note()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_note UUID;
  primary_row RECORD;
BEGIN
  -- Determine which note to refresh.
  IF (TG_OP = 'DELETE') THEN
    affected_note := OLD.clinical_note_id;
  ELSE
    affected_note := NEW.clinical_note_id;
  END IF;

  SELECT code, label INTO primary_row
  FROM clinical_note_diagnoses
  WHERE clinical_note_id = affected_note AND is_primary = true
  LIMIT 1;

  IF primary_row IS NULL THEN
    -- No primary left → clear legacy columns on the note.
    UPDATE clinical_notes
    SET diagnosis_code = NULL, diagnosis_label = NULL
    WHERE id = affected_note;
  ELSE
    UPDATE clinical_notes
    SET diagnosis_code = primary_row.code,
        diagnosis_label = primary_row.label
    WHERE id = affected_note
      AND (
        diagnosis_code IS DISTINCT FROM primary_row.code
        OR diagnosis_label IS DISTINCT FROM primary_row.label
      );
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_primary_diagnosis_to_note
  ON clinical_note_diagnoses;

CREATE TRIGGER trg_sync_primary_diagnosis_to_note
AFTER INSERT OR UPDATE OR DELETE ON clinical_note_diagnoses
FOR EACH ROW
EXECUTE FUNCTION sync_primary_diagnosis_to_note();

COMMENT ON FUNCTION sync_primary_diagnosis_to_note() IS
  'Mantiene clinical_notes.diagnosis_code/label como espejo del diagnóstico marcado is_primary=true en clinical_note_diagnoses.';
