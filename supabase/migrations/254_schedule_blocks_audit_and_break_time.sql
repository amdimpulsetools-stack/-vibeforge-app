-- 254: Bloqueos de agenda con autor y desbloqueo auditado + Break Time por org
--
-- Caso (8-sep-2026): la recepcionista bloquea un horario y se va; la doctora
-- necesita desbloquearlo y no puede. Hasta hoy la policy de DELETE (mig 031)
-- exigía owner/admin, la UI mostraba el candado a todos y, como PostgREST
-- devuelve 204 cuando RLS filtra la fila, la app decía "Horario
-- desbloqueado" sin haber hecho nada. `created_by` existía desde la mig 009
-- pero nunca se rellenaba (0 de 37 bloqueos en prod tienen autor) y el
-- desbloqueo era un DELETE físico: sin rastro de quién bloqueó ni quién quitó.
--
-- Decisiones del founder:
--   · Cualquier miembro activo puede desbloquear (el bloqueo es de la agenda,
--     no de la persona). El DELETE físico queda reservado a owner/admin.
--   · Queda registro: el desbloqueo es una MARCA (removed_at/removed_by) y
--     además se escribe en clinical_access_log como "Bloqueo de agenda"
--     (crear / eliminar), visible en Administración → Registro de auditoría.
--   · Break Time pasa del localStorage de cada navegador a la configuración
--     de la org (scheduler_settings.break_time) para que TODO el equipo lo vea
--     igual y el servidor lo aplique en "Compartir horarios" y en la reserva
--     online, que hasta hoy ofrecían las franjas del descanso.

-- ── schedule_blocks: autor + marca de desbloqueo ──────────────────────────
ALTER TABLE schedule_blocks
  ALTER COLUMN created_by SET DEFAULT auth.uid();

ALTER TABLE schedule_blocks
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS removed_at      timestamptz,
  ADD COLUMN IF NOT EXISTS removed_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS removed_by_name text;

COMMENT ON COLUMN schedule_blocks.created_by_name IS
  'Mig 254: nombre visible de quien bloqueó (snapshot, como appointments.edited_by_name).';
COMMENT ON COLUMN schedule_blocks.removed_at IS
  'Mig 254: desbloqueo = marca, no DELETE. NULL = bloqueo vigente. Todos los lectores filtran removed_at IS NULL.';
COMMENT ON COLUMN schedule_blocks.removed_by_name IS
  'Mig 254: nombre visible de quien desbloqueó.';

-- Los lectores (agenda, compartir horarios, reserva online, ocupación) piden
-- siempre "vigentes en un rango de fechas".
CREATE INDEX IF NOT EXISTS idx_schedule_blocks_active_org_date
  ON schedule_blocks (organization_id, block_date)
  WHERE removed_at IS NULL;

-- Policies: SELECT/INSERT/UPDATE de miembros activos se mantienen (mig 013);
-- el desbloqueo viaja por UPDATE. DELETE físico sigue siendo owner/admin
-- (mig 031). Se recrean con las helpers endurecidas de la mig 235 para dejar
-- explícito que es_active manda.
DROP POLICY IF EXISTS "org_update_schedule_blocks" ON schedule_blocks;
CREATE POLICY "org_update_schedule_blocks" ON schedule_blocks
  FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()))
  WITH CHECK (organization_id IN (SELECT get_user_org_ids()));

-- ── clinical_access_log: tipo "Bloqueo de agenda" ─────────────────────────
ALTER TABLE public.clinical_access_log
  DROP CONSTRAINT IF EXISTS clinical_access_log_resource_type_check;
ALTER TABLE public.clinical_access_log
  ADD CONSTRAINT clinical_access_log_resource_type_check CHECK (resource_type IN (
    'patient',
    'clinical_note',
    'prescription',
    'attachment',
    'lab_result',
    'treatment_plan',
    'medical_history',
    'appointment',
    'ai_query',
    'schedule_block',     -- mig 254: bloqueos de agenda (create / delete)
    'other'
  ));

-- ── scheduler_settings: Break Time por org ────────────────────────────────
ALTER TABLE scheduler_settings
  ADD COLUMN IF NOT EXISTS break_time jsonb NOT NULL
    DEFAULT '{"enabled": false, "days": [1,2,3,4,5], "startTime": "13:00", "endTime": "14:00"}'::jsonb;

COMMENT ON COLUMN scheduler_settings.break_time IS
  'Mig 254: descanso diario de la org {enabled, days[0-6], startTime "HH:MM", endTime "HH:MM"}. Antes vivía en localStorage por navegador. Lo aplican la agenda, /api/scheduler/available-slots y /api/book/[slug].';
