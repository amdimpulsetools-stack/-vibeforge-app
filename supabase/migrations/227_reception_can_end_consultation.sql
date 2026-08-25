-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 227: toggle "Recepción puede finalizar consultas"
--
-- Hoy la recepcionista NO puede "Finalizar consulta": el endpoint
-- /api/appointments/[id]/live-status devuelve 403 para end/reopen con
-- rol receptionist y el pill de la agenda le oculta esas acciones. En
-- clínicas donde el doctor no toca la agenda, las consultas quedaban
-- "En consulta" para siempre y el pill se veía muerto sin explicación.
--
--   live_status_reception_can_end → toggle por org. On (default) =
--                                   recepción puede marcar "Finalizar
--                                   consulta". Off = comportamiento
--                                   anterior (solo owner/admin/doctor).
--
-- "Reabrir consulta" queda SIEMPRE reservado a owner/admin/doctor,
-- con el toggle encendido o apagado — reabrir resucita la sesión de
-- un doctor y eso no se delega.
--
-- Vive en scheduler_settings junto a sus hermanos live_status y
-- live_status_auto_close (mig 171, mismo precedente). El endpoint
-- live-status lee esta columna para autorizar el "end" de recepción y
-- Settings → Agenda la escribe vía /api/scheduler-settings.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE scheduler_settings
  ADD COLUMN IF NOT EXISTS live_status_reception_can_end BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN scheduler_settings.live_status_reception_can_end IS
  'Toggle: el rol Recepción puede marcar "Finalizar consulta" (default on). Off = solo owner/admin/doctor. Reabrir consulta queda siempre reservado a owner/admin/doctor, independiente de este flag.';
