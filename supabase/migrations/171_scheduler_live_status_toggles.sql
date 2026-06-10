-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 171: live-status toggles on scheduler_settings (Part F)
--
-- Two per-org switches for the "Estado de cita en vivo" feature:
--
--   live_status            → master toggle. Off = the pills and
--                            actions don't render anywhere; the
--                            agenda behaves exactly as before.
--   live_status_auto_close → sub-toggle. On (default) = starting a
--                            consultation auto-closes the doctor's
--                            previous open one (RPC mig 170). Off =
--                            fully manual close.
--
-- They live on scheduler_settings (one row per org, mig 068) instead
-- of global_variables so all agenda config stays in one place. The
-- /api/appointments/[id]/live-status endpoint reads auto_close from
-- here (updated in this same PR — it briefly read global_variables
-- in the B+C commit before this UI landed; that key was never
-- written by anything, so no data migration is needed).
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE scheduler_settings
  ADD COLUMN IF NOT EXISTS live_status BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS live_status_auto_close BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN scheduler_settings.live_status IS
  'Master toggle del Estado de cita en vivo (mig 170). Off = la agenda no muestra pills ni acciones de llegada/consulta.';
COMMENT ON COLUMN scheduler_settings.live_status_auto_close IS
  'Sub-toggle: iniciar una consulta cierra automáticamente la anterior abierta del mismo doctor. Off = cierre 100% manual.';
