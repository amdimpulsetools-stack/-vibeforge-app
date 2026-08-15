-- ============================================================
-- Migración 218 — patient_payments.patient_id: CASCADE → SET NULL
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
-- Aprobada por el founder.
--
-- ── El problema ─────────────────────────────────────────────
-- La mig 008 creó la FK inline:
--
--   patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE
--
-- (constraint auto-nombrada `patient_payments_patient_id_fkey`). Borrar
-- un paciente borraba, en silencio, TODO su historial financiero. Eso
-- estuvo mal desde el día uno —la plata entró a la clínica y su registro
-- no es del paciente, es contable— pero desde la mig 214 además es
-- inconsistente:
--
--   `trg_patient_payments_protect_shift` (BEFORE UPDATE OR DELETE)
--   rechaza el DELETE de cualquier pago que pertenezca a un turno de
--   caja ya CERRADO. Como el CASCADE ocurre dentro de la misma
--   transacción, la excepción del trigger tumba el DELETE del PACIENTE
--   entero: hoy, en una org con Caja, un paciente con un solo cobro
--   arqueado simplemente NO SE PUEDE BORRAR, y el mensaje que ve el
--   usuario habla de turnos de caja mientras intentaba borrar una ficha.
--
-- ── La decisión ─────────────────────────────────────────────
-- ON DELETE SET NULL. El paciente se va, el pago se queda anónimo:
--
--   · Es lo contable: el ingreso existió, el arqueo que lo incluyó está
--     firmado, y ningún cierre de caja cambia porque alguien depuró una
--     ficha.
--   · Es lo que hace que borrar pacientes vuelva a funcionar. El SET
--     NULL se ejecuta como un UPDATE de patient_id, y
--     `caja_protect_closed_shift` solo bloquea cambios de amount /
--     payment_method / tender_kind / payment_date / cash_shift_id — el
--     UPDATE pasa, incluso sobre turnos cerrados.
--   · La columna ya es NULLABLE desde la mig 018 (pagos de citas sin
--     ficha de paciente), así que no hay backfill ni datos que migrar:
--     solo cambia lo que ocurre al borrar.
--
-- Nada más cambia: `appointment_id` ya era ON DELETE SET NULL desde la
-- 008, y `organization_id` sigue en CASCADE (borrar la clínica sí borra
-- sus pagos — es el cierre de la cuenta, no la depuración de una ficha).
--
-- Las consultas que agrupan por paciente ya toleran el NULL (el panel de
-- presupuestos filtra `treatment_plan_id` y la ficha filtra por
-- `patient_id = <id>`): un pago huérfano deja de aparecer en fichas y
-- sigue contando en los reportes de la organización, que es justo lo que
-- se busca.
-- ============================================================

ALTER TABLE patient_payments
  DROP CONSTRAINT IF EXISTS patient_payments_patient_id_fkey;

DO $$ BEGIN
  ALTER TABLE patient_payments
    ADD CONSTRAINT patient_payments_patient_id_fkey
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON CONSTRAINT patient_payments_patient_id_fkey ON patient_payments IS
  'ON DELETE SET NULL (mig 218): borrar un paciente anonimiza sus pagos,
   nunca los elimina. El historial financiero es de la organización, y
   con el módulo Caja un pago de un turno cerrado ni siquiera podría
   borrarse (trg_patient_payments_protect_shift).';
