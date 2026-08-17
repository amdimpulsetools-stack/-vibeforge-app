-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 221: flag por-organización "duración editable por cita"
--
-- Hasta ahora la duración de una cita la imponía SIEMPRE el servicio del
-- catálogo: en el modal de citas la "Hora fin" se derivaba de
-- `services.duration_minutes` y el campo estaba deshabilitado. Este flag
-- permite que recepción ajuste esa duración cita por cita (ej. una segunda
-- opinión de 25 min sobre un servicio de 45) escribiendo la hora fin.
--
-- Apagado por defecto A PROPÓSITO: con `false` el modal es byte-idéntico al
-- comportamiento anterior (input deshabilitado, sin badge, sin validación de
-- duración). Ninguna organización existente cambia de comportamiento hasta
-- que su admin lo encienda en Configuración → Agenda.
--
-- QUIÉN LO ENCIENDE vs QUIÉN LO USA:
--   - Encender/apagar el flag = owner/admin. No hace falta política nueva:
--     la RLS de scheduler_settings (mig 068) ya restringe UPDATE e INSERT a
--     role IN ('owner','admin') y deja el SELECT a cualquier miembro activo,
--     así que el toggle hereda ese control gratis (y /api/scheduler-settings
--     revalida el rol en el PUT).
--   - Editar la duración de una cita concreta, con el flag ya encendido =
--     cualquier miembro que agende (recepción incluida). El flag es de
--     organización, no un permiso por rol.
--
-- No toca dinero: `price_snapshot` se sigue calculando igual (precio del
-- servicio o precio personalizado), independiente de los minutos.
-- Idempotente: safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE scheduler_settings
  ADD COLUMN IF NOT EXISTS allow_custom_duration boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN scheduler_settings.allow_custom_duration IS
  'Permite ajustar la duración por cita: con true la "Hora fin" del modal de citas es editable (5–480 min) y la duración del servicio pasa a ser solo el valor por defecto. Default false = byte-idéntico al comportamiento pre-221 (fin derivado del servicio y deshabilitado). Lo enciende owner/admin — la RLS de mig 068 ya limita la escritura de esta tabla a esos roles — pero una vez activo lo usa cualquiera que agende (mig 221).';
