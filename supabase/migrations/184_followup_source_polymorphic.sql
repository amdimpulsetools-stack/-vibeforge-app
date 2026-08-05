-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 184: origen polimórfico de los seguimientos (Fase 2a)
--
-- Ver docs/research/seguimientos-genericos-core.md §4 y "Fase 2".
--
-- `clinical_followups` nació (mig 053) con dos FKs de origen fijas —
-- `appointment_id` y `clinical_note_id` — que cubrían las dos únicas
-- superficies de entonces (semáforo de historia clínica y cita). Desde
-- entonces aparecieron tres orígenes más que no tienen dónde guardarse:
--
--   - `treatment_plans`  — el helper de mig 053/142 crea el seguimiento
--     al crear el plan, pero sin referencia al plan. Resultado: si el
--     plan se cancela, el seguimiento queda huérfano y vivo para siempre
--     ("bug D"). La mig 188 lo cierra usando justo estas columnas.
--   - `treatment_sessions` — la sesión perdida es la mejor señal
--     genérica del producto (fisioterapia, odontología, dermatología) y
--     hoy no genera nada. La mig 187 la convierte en seguimiento.
--   - `budget_records` — existe back-link (`budget_records.followup_id`,
--     mig 136) pero no forward-link, así que desde el seguimiento no se
--     sabe de qué presupuesto nació sin escanear la otra tabla.
--
-- Añadir una FK por origen no escala (N columnas casi siempre NULL y una
-- migración por cada origen nuevo). La forma correcta es un par
-- polimórfico `(source_type, source_id)` SIN FK — el precio es no tener
-- integridad referencial declarativa, y se paga a cambio de que añadir
-- un origen nuevo sea añadir un valor al CHECK.
--
-- CERO regresión:
--   - Las columnas `appointment_id` / `clinical_note_id` NO se tocan, NO
--     se deprecan y NO se dejan de escribir. `source_*` se puebla EN
--     PARALELO. Toda query existente sigue funcionando igual.
--   - `source_type` admite NULL (filas creadas por código viejo o por
--     rutas que aún no lo pueblan quedan igual de válidas).
--   - El backfill solo escribe donde `source_type IS NULL`, así que
--     re-aplicar la migración es un no-op y nunca pisa un origen ya
--     asignado (ni el que asigne el server de aquí en adelante).
--
-- Aditiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Columnas ───────────────────────────────────────────────────
ALTER TABLE clinical_followups
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS source_id   UUID;

-- NULL permitido a propósito (ver cabecera). El CHECK solo restringe
-- el vocabulario cuando hay valor.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'clinical_followups'::regclass
      AND conname = 'clinical_followups_source_type_check'
  ) THEN
    ALTER TABLE clinical_followups
      ADD CONSTRAINT clinical_followups_source_type_check
      CHECK (
        source_type IS NULL
        OR source_type IN (
          'appointment',
          'clinical_note',
          'treatment_plan',
          'treatment_session',
          'budget_record',
          'manual'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN clinical_followups.source_type IS
  'Origen polimórfico del seguimiento (mig 184): appointment | clinical_note | treatment_plan | treatment_session | budget_record | manual. NULL = origen desconocido (filas anteriores a la mig sin match en el backfill). Convive con appointment_id/clinical_note_id, que siguen escribiéndose.';

COMMENT ON COLUMN clinical_followups.source_id IS
  'Id de la entidad de origen. SIN FK a propósito: es polimórfico, la tabla depende de source_type. NULL cuando source_type=''manual'' o cuando el origen no se pudo determinar.';

-- ── 2. Índice ─────────────────────────────────────────────────────
-- Parcial porque las filas sin origen resuelto no se consultan por él.
-- El orden (organization_id, source_type, source_id) sirve tanto al
-- guard de idempotencia de la mig 187 (org + tipo + id exacto) como al
-- cierre en lote de la mig 188 (org + tipo + IN (...)).
CREATE INDEX IF NOT EXISTS idx_clinical_followups_source
  ON clinical_followups(organization_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

-- ── 3. Backfill idempotente ───────────────────────────────────────
-- Todos los UPDATE llevan `WHERE source_type IS NULL`, así que:
--   - re-aplicar la migración no cambia ni una fila;
--   - el orden de los bloques ES la prioridad (el primero que asigna
--     gana, los siguientes ya no ven la fila).
--
-- Prioridad: budget_record > appointment > clinical_note > manual.
-- `budget_record` va primero porque es el origen MÁS ESPECÍFICO: un
-- seguimiento de presupuesto puede además tener appointment_id (la cita
-- en la que se entregó el presupuesto), y en ese caso el presupuesto es
-- el que explica por qué existe el seguimiento.

-- 3.a — Presupuesto (back-link de mig 136).
UPDATE clinical_followups cf
SET source_type = 'budget_record',
    source_id   = br.id
FROM budget_records br
WHERE br.followup_id = cf.id
  AND br.organization_id = cf.organization_id
  AND cf.source_type IS NULL;

-- 3.b — Cita.
UPDATE clinical_followups
SET source_type = 'appointment',
    source_id   = appointment_id
WHERE source_type IS NULL
  AND appointment_id IS NOT NULL;

-- 3.c — Nota clínica.
UPDATE clinical_followups
SET source_type = 'clinical_note',
    source_id   = clinical_note_id
WHERE source_type IS NULL
  AND clinical_note_id IS NOT NULL;

-- 3.d — Manual sin ninguna referencia: el semáforo de historia clínica
-- creado a mano. Se marca explícitamente 'manual' con source_id NULL
-- para distinguirlo de "no sabemos" (que queda como source_type NULL).
--
-- Deliberadamente NO tocamos las filas con source IN ('rule','system')
-- que no matchearon arriba: son seguimientos creados por reglas del
-- addon (fertilidad) cuyo origen real (plan de tratamiento) no se puede
-- inferir retroactivamente — no existe la referencia en ninguna parte.
-- Quedan con source_type NULL, que es la respuesta honesta. La mig 188
-- solo actúa hacia adelante justamente por esto.
UPDATE clinical_followups
SET source_type = 'manual',
    source_id   = NULL
WHERE source_type IS NULL
  AND source = 'manual';
