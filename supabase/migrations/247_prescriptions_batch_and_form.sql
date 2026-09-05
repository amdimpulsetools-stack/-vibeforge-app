-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- ═══════════════════════════════════════════════════════════════════
-- 247: Recetas — lote de impresión + forma farmacéutica + dosis por toma
--
-- Los atajos "Receta" desde la cita y desde el drawer del paciente
-- crean VARIOS medicamentos de una vez y los imprimen juntos aunque no
-- exista cita (hoy el PDF agrupa "todo lo activo de la cita").
--
--   batch_id            agrupa las filas creadas en un mismo gesto; el
--                       PDF /api/pdf/prescription/batch/[batchId] imprime
--                       ese lote. NULL en las recetas históricas (siguen
--                       imprimiéndose por cita).
--   pharmaceutical_form tableta / cápsula / jarabe / ampolla / …
--   dose_per_take       "1 tableta", "5 ml" — lo que se toma cada vez.
--                       `dosage` sigue siendo la concentración ("500 mg").
--
-- Todo aditivo y nullable: cero cambio de comportamiento para lo existente.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE prescriptions
  ADD COLUMN IF NOT EXISTS batch_id            uuid,
  ADD COLUMN IF NOT EXISTS pharmaceutical_form text,
  ADD COLUMN IF NOT EXISTS dose_per_take       text;

CREATE INDEX IF NOT EXISTS idx_prescriptions_batch
  ON prescriptions (batch_id) WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN prescriptions.batch_id IS
  'Mig 247: lote de impresión (varios medicamentos recetados en un mismo gesto). NULL = receta histórica, se imprime por cita.';
COMMENT ON COLUMN prescriptions.pharmaceutical_form IS
  'Mig 247: forma farmacéutica (tableta, cápsula, jarabe, …). `dosage` conserva la concentración.';
COMMENT ON COLUMN prescriptions.dose_per_take IS
  'Mig 247: cantidad por toma ("1 tableta", "5 ml").';
