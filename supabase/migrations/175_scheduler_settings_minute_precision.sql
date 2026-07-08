-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 175: minute precision for the org schedule window
--
-- Adds ADDITIVE minute offsets to scheduler_settings (mig 068) so
-- clinics can open/close on :15/:30/:45 boundaries (e.g. start 07:15).
-- The offsets DEFAULT 0, so every existing org is byte-identical to
-- before until it explicitly picks a non-zero minute in
-- Configuración → Agenda. The agenda grid (uniform stride) then runs
-- from start_hour:start_minute stepping by the configured interval
-- (e.g. 07:15 → 08:00 → 08:45… at interval 45).
--
-- The open<close invariant now lives at the MINUTE level. The old
-- `end_hour > start_hour` CHECK (mig 068) would reject a valid
-- same-hour window such as 07:15 → 07:45, so it is dropped and
-- replaced by the named `scheduler_settings_window_valid`, which
-- compares total minutes. Idempotent: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE scheduler_settings
  ADD COLUMN IF NOT EXISTS start_minute integer NOT NULL DEFAULT 0
    CHECK (start_minute IN (0, 15, 30, 45)),
  ADD COLUMN IF NOT EXISTS end_minute integer NOT NULL DEFAULT 0
    CHECK (end_minute IN (0, 15, 30, 45));

COMMENT ON TABLE scheduler_settings IS
  'Per-org agenda configuration (one row per organization). The visible schedule window is [start_hour*60 + start_minute, end_hour*60 + end_minute) minutes-since-midnight; the minute offsets (mig 175) are additive and default 0 for whole-hour, backwards-compatible windows.';
COMMENT ON COLUMN scheduler_settings.start_minute IS
  'Additive minute offset (0/15/30/45) on start_hour. The window opens at start_hour*60 + start_minute. Default 0 = backwards-compatible whole-hour start.';
COMMENT ON COLUMN scheduler_settings.end_minute IS
  'Additive minute offset (0/15/30/45) on end_hour. The window closes at end_hour*60 + end_minute. Default 0 = backwards-compatible whole-hour end.';

-- Replace the whole-hour invariant with a minute-level one. The old CHECK
-- from mig 068 is inline+unnamed (Postgres auto-generated its name), so drop
-- it defensively by matching its definition, then add the named constraint.
DO $$
DECLARE
  con text;
BEGIN
  -- Drop any CHECK that compares only the hour columns (the old
  -- `end_hour > start_hour` invariant), whatever its generated name.
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'scheduler_settings'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%end_hour%>%start_hour%'
  LOOP
    EXECUTE format('ALTER TABLE scheduler_settings DROP CONSTRAINT %I', con);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'scheduler_settings'::regclass
      AND conname = 'scheduler_settings_window_valid'
  ) THEN
    ALTER TABLE scheduler_settings
      ADD CONSTRAINT scheduler_settings_window_valid
      CHECK ((end_hour * 60 + end_minute) > (start_hour * 60 + start_minute));
  END IF;
END $$;
