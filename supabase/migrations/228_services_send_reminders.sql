-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 228: opt-out de recordatorios automáticos por servicio
--
-- Pedido de la clínica: ciertos servicios (procedimientos internos,
-- controles sin aviso) NO deben mandar recordatorios/confirmaciones
-- automáticas al paciente. Hasta ahora no había control: el cron
-- /api/cron/reminders mandaba 24h y 2h a TODA cita (email + WhatsApp)
-- y la confirmación automática salía al crear/confirmar la cita.
--
-- Con send_reminders=false el servicio queda fuera de:
--   - Cron de recordatorios 24h/2h (ambos canales).
--   - Confirmación automática al paciente (reserva en línea y
--     appointment_confirmation[_virtual] vía /api/notifications/send).
-- Los envíos MANUALES del staff (WhatsApp clipboard, reenvíos) no se
-- ven afectados. Citas sin servicio siguen enviando (default true).
--
-- Default true A PROPÓSITO: ninguna organización existente cambia de
-- comportamiento hasta que su admin apague el flag en el catálogo de
-- servicios (Admin → Servicios).
--
-- Additive + idempotente — safe to re-run en una base viva.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS send_reminders BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN services.send_reminders IS
  'false = este servicio no envía recordatorios automáticos (24h/2h) ni confirmaciones al paciente; los envíos manuales no se ven afectados.';
