-- Rollback 273: quita "Por reprogramar" (triggers, funciones, RPC, índices).
--
-- 1. Cierra las tarjetas abiertas (closure_reason 'rollback_273'): sin
--    triggers nadie las cerraría y la burbuja de la agenda / la bandeja
--    las seguirían contando para siempre. Las cerradas se conservan
--    (son historia de la bandeja).
-- 2. Las columnas se CONSERVAN: guardan qué citas se cancelaron cómo y
--    qué pagos se trasladaron (el rastro del dinero no se borra). Los
--    pagos ya trasladados se quedan en su cita nueva: revertir el
--    traslado es mover plata y se hace a mano, cita por cita, leyendo
--    patient_payments.transferred_from_appointment_id.
--    Borrarlas es opcional y DESTRUYE ese rastro:
--      -- ALTER TABLE patient_payments
--      --   DROP COLUMN IF EXISTS transferred_from_appointment_id,
--      --   DROP COLUMN IF EXISTS transferred_at,
--      --   DROP COLUMN IF EXISTS transferred_by;
--      -- ALTER TABLE appointments
--      --   DROP CONSTRAINT IF EXISTS appointments_cancel_outcome_check,
--      --   DROP CONSTRAINT IF EXISTS appointments_cancel_money_check,
--      --   DROP CONSTRAINT IF EXISTS appointments_rescheduled_from_not_self,
--      --   DROP COLUMN IF EXISTS cancel_outcome,
--      --   DROP COLUMN IF EXISTS cancel_money,
--      --   DROP COLUMN IF EXISTS cancelled_at,
--      --   DROP COLUMN IF EXISTS cancelled_by,
--      --   DROP COLUMN IF EXISTS rescheduled_from_id;
--      -- DROP INDEX IF EXISTS idx_appointments_rescheduled_from;
--    Antes de borrarlas, revierte la UI que las lee (si no, degrada en
--    silencio a "sin datos", pero mejor no depender de eso).
-- Idempotente.

UPDATE clinical_followups
   SET status         = 'cerrado_manual',
       closure_reason = 'rollback_273',
       closed_at      = now(),
       is_resolved    = true,
       resolved_at    = now(),
       updated_at     = now()
 WHERE rule_key = 'core.reschedule_pending'
   AND status IN ('pendiente', 'contactado', 'pospuesto');

DROP TRIGGER IF EXISTS trg_appointments_cancel_stamp ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_reschedule_pending ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_insert ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_link ON appointments;
DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_reactivate ON appointments;

DROP FUNCTION IF EXISTS appointment_transfer_payments(uuid, uuid);
DROP FUNCTION IF EXISTS appointment_has_cash_refund(uuid);
DROP FUNCTION IF EXISTS appointments_cancel_stamp();
DROP FUNCTION IF EXISTS create_reschedule_pending_followup();
DROP FUNCTION IF EXISTS close_reschedule_pending_followups();
DROP FUNCTION IF EXISTS reschedule_org_today(uuid);

DROP INDEX IF EXISTS uq_clinical_followups_reschedule_open_source;
DROP INDEX IF EXISTS idx_clinical_followups_reschedule_open;
