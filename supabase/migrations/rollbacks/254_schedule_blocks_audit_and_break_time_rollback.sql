-- Rollback 254. Los bloqueos marcados como quitados (removed_at) volverían a
-- verse vigentes al perder la columna: borrarlos físicamente antes.
DELETE FROM schedule_blocks WHERE removed_at IS NOT NULL;

DROP INDEX IF EXISTS idx_schedule_blocks_active_org_date;

ALTER TABLE schedule_blocks
  DROP COLUMN IF EXISTS removed_by_name,
  DROP COLUMN IF EXISTS removed_by,
  DROP COLUMN IF EXISTS removed_at,
  DROP COLUMN IF EXISTS created_by_name;

ALTER TABLE schedule_blocks
  ALTER COLUMN created_by DROP DEFAULT;

DROP POLICY IF EXISTS "org_update_schedule_blocks" ON schedule_blocks;
CREATE POLICY "org_update_schedule_blocks" ON schedule_blocks
  FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids()));

-- Filas de auditoría del tipo nuevo: se conservan cambiándolas a 'other'
-- (la tabla es append-only por diseño; no se borran).
UPDATE public.clinical_access_log SET resource_type = 'other'
  WHERE resource_type = 'schedule_block';
ALTER TABLE public.clinical_access_log
  DROP CONSTRAINT IF EXISTS clinical_access_log_resource_type_check;
ALTER TABLE public.clinical_access_log
  ADD CONSTRAINT clinical_access_log_resource_type_check CHECK (resource_type IN (
    'patient', 'clinical_note', 'prescription', 'attachment', 'lab_result',
    'treatment_plan', 'medical_history', 'appointment', 'ai_query', 'other'
  ));

ALTER TABLE scheduler_settings DROP COLUMN IF EXISTS break_time;
