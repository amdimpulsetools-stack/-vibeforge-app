-- Aplicada en producción el 02-oct-2026 (índice verificado en pg_indexes; health/schema ok: true)
--
-- ═══════════════════════════════════════════════════════════════════
-- 282: una paciente nunca tiene DOS citas vivas el mismo día a la misma hora
--
-- Incidente 02-oct-2026 (Dra. Patricia Quispe): tres pares de citas
-- duplicadas en una mañana (Edimelis Chávez, Yusbely Hernández, María
-- Angélica Curi), cada par creado con 3-5 segundos de diferencia. Causa: el
-- formulario creaba la pre-reserva (mig 274), seguía abierto mientras armaba
-- el mensaje de WhatsApp y dejaba "Guardar" activo; el segundo clic creaba
-- una cita idéntica. Efecto: la paciente aparecía con "deuda" por la cita
-- sobrante (S/700 en la ficha de una paciente al día).
--
-- El formulario ya se corrigió (candado de doble envío + consulta previa a
-- la base). Esta migración es la garantía en la base, para cualquier
-- cliente: agenda, reserva online, Google, otra pestaña.
--
-- Qué agrega: índice ÚNICO parcial sobre (patient_id, appointment_date,
-- start_time) para citas con paciente y no canceladas. Las canceladas quedan
-- fuera (cancelar y volver a agendar la misma hora sigue siendo válido);
-- las citas sin ficha de paciente (solo nombre) quedan fuera.
--
-- Verificado el 02-oct-2026 en producción: fuera de los tres pares del
-- incidente no existe NINGUNA paciente con dos citas vivas en el mismo
-- día y hora en toda la base. El índice no rompe ningún caso legítimo.
--
-- ANTES DE APLICAR: la Consulta 0 debe devolver 0 filas. Si devuelve
-- pares, cancelar la cita sobrante de cada par desde la agenda con el
-- desenlace "Error de registro" (sin pagos ligados no interviene Caja).
-- No es una FK: no cambia el conteo de supabase/checks/multi_fk_pairs.sql.
-- La UI atrapa el 23505 con nombre `uq_appointments_patient_slot_live` y
-- muestra un mensaje humano (appointment-form-modal.tsx).
--
-- Aditiva e idempotente. Rollback: rollbacks/282_appointments_patient_slot_unique_rollback.sql
-- ═══════════════════════════════════════════════════════════════════

-- ── Consulta 0 (solo lectura): pares vivos que bloquearían el índice ──
-- SELECT a.organization_id, a.patient_id, a.patient_name, a.appointment_date, a.start_time,
--        COUNT(*) AS citas_vivas, array_agg(a.id ORDER BY a.created_at) AS ids
-- FROM appointments a
-- WHERE a.patient_id IS NOT NULL AND a.status <> 'cancelled'
-- GROUP BY 1, 2, 3, 4, 5
-- HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_appointments_patient_slot_live
  ON appointments (patient_id, appointment_date, start_time)
  WHERE patient_id IS NOT NULL AND status <> 'cancelled';

COMMENT ON INDEX uq_appointments_patient_slot_live IS
  'Mig 282: una paciente no tiene dos citas vivas (no canceladas) el mismo día a la misma hora. Incidente 02-oct-2026 (citas duplicadas por doble envío del formulario).';
