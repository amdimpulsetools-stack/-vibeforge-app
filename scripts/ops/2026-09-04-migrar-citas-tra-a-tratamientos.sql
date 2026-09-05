-- ============================================================
-- OPS — Migrar citas TRA (FIV, ovodonación…) ya agendadas como cita
--       a tratamientos (módulo Tratamientos, migs 242-245).
--
-- NO SE EJECUTA SOLO. Decisión del founder (2026-09-04): las FIV que
-- Vitra ya tiene agendadas como cita de S/ 17 000 NO se migran hoy.
-- Cuando se decida, correr los pasos EN ORDEN, uno por uno, en el SQL
-- Editor de Supabase, leyendo el resultado de cada uno.
--
-- Principio: un cobro vive en UN solo contenedor. Si se crea el
-- tratamiento y los pagos se atan a él, la cita queda a precio 0 (no
-- se borra: la visita ocurrió) para no dejar deuda fantasma en
-- "Deuda pendiente" / "Total facturado" / saldo del paciente.
--
-- Qué NO cambia: `revenue_*` del dashboard (los pagos conservan su
-- payment_date), Caja (turnos cerrados congelados), comprobantes
-- (`einvoices.appointment_id` histórico intacto).
-- ============================================================

-- ── PASO 0 — Inventario (solo lectura) ─────────────────────────────
-- Citas no canceladas cuyo servicio NO se agenda como cita (is_bookable
-- = false, mig 239) y con precio > 0. Clasificar a mano:
--   (a) pagadas al 100 % y antiguas → DEJAR (historia cerrada)
--   (b) con saldo pendiente o pagos recientes → MIGRAR
--   (c) futuras → MIGRAR y decidir si la cita se conserva como
--       "consulta de inicio" a precio 0
SELECT
  a.id                AS appointment_id,
  o.name              AS org,
  a.patient_id,
  a.patient_name,
  a.appointment_date,
  a.status,
  s.name              AS service,
  s.id                AS service_id,
  a.doctor_id,
  COALESCE(a.price_snapshot, s.base_price, 0) AS precio,
  COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp
            WHERE pp.appointment_id = a.id
              AND COALESCE(pp.source,'clinical') = 'clinical'), 0) AS pagado,
  a.einvoice_id,
  (SELECT b.id FROM budget_records b
    WHERE b.patient_id = a.patient_id
      AND b.acceptance_status IN ('accepted','in_progress')
      AND (b.service_id = s.id OR b.appointment_id = a.id)
    ORDER BY b.created_at DESC LIMIT 1) AS budget_candidato
FROM appointments a
JOIN services s ON s.id = a.service_id
JOIN organizations o ON o.id = a.organization_id
WHERE s.is_bookable = false
  AND a.status <> 'cancelled'
  AND COALESCE(a.price_snapshot, s.base_price, 0) > 0
ORDER BY o.name, a.appointment_date DESC;

-- ── PASO 1 — Respaldo (una sola vez) ───────────────────────────────
-- CREATE TABLE IF NOT EXISTS _bkp_tra_2026_09_appointments AS
--   SELECT a.*, now() AS bkp_at FROM appointments a WHERE a.id IN ('<ids del paso 0>');
-- CREATE TABLE IF NOT EXISTS _bkp_tra_2026_09_payments AS
--   SELECT pp.*, now() AS bkp_at FROM patient_payments pp
--   WHERE pp.appointment_id IN ('<ids del paso 0>');

-- ── PASO 2 — Por cada cita a migrar (una transacción por cita) ─────
-- Reemplazar los <…>. Requiere que la org tenga conceptos sembrados
-- (mig 242 los siembra para orgs con addon fertilidad).
/*
BEGIN;

-- 2.1 Tratamiento (sin RPC: el RPC exige un presupuesto 'accepted' y
--     aquí puede no haberlo). Si hay budget candidato y está
--     'accepted', se enlaza y se pasa a in_progress.
WITH t AS (
  INSERT INTO treatments (
    organization_id, patient_id, budget_record_id, doctor_id, service_id,
    treatment_type, title, expected_total, status, started_at, notes
  )
  SELECT
    a.organization_id, a.patient_id,
    NULLIF('<budget_candidato o vacío>', '')::uuid,
    a.doctor_id, a.service_id,
    '<FIV|IIU|INDUCCION|CRIO|OVODONACION|ROPA|TED|DUOSTIM|OTRO>',
    s.name,
    COALESCE(a.price_snapshot, s.base_price, 0),
    'in_progress',
    a.appointment_date,
    '[Migrado desde la cita ' || a.id || ' el ' || to_char(now() AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') || ']'
  FROM appointments a JOIN services s ON s.id = a.service_id
  WHERE a.id = '<appointment_id>'
  RETURNING id, organization_id
)
-- 2.2 Mover los pagos clínicos de la cita al tratamiento (concepto
--     "A cuenta"). Permitido aunque el turno de Caja esté cerrado: el
--     trigger solo protege amount/method/tender/date/shift.
UPDATE patient_payments pp
   SET treatment_id = t.id,
       appointment_id = NULL,
       treatment_concept_id = (SELECT c.id FROM treatment_payment_concepts c
                               WHERE c.organization_id = t.organization_id AND c.key = 'a_cuenta'),
       revenue_bucket = 'general'
  FROM t
 WHERE pp.appointment_id = '<appointment_id>'
   AND COALESCE(pp.source,'clinical') = 'clinical';

-- 2.3 Presupuesto (si lo hay y está accepted) → in_progress
UPDATE budget_records
   SET acceptance_status = 'in_progress', started_at = COALESCE(started_at, now())
 WHERE id = NULLIF('<budget_candidato o vacío>', '')::uuid
   AND acceptance_status = 'accepted';

-- 2.4 Neutralizar la cita: precio 0 (factura 0 en migs 219/231/233/238),
--     status y service_id intactos (la visita ocurrió, el historial se conserva).
UPDATE appointments
   SET price_snapshot = 0,
       discount_amount = 0,
       notes = COALESCE(notes || E'\n', '') || '[Migrado a tratamiento el '
               || to_char(now() AT TIME ZONE 'America/Lima', 'DD/MM/YYYY') || ']'
 WHERE id = '<appointment_id>';

COMMIT;
*/

-- ── PASO 3 — Verificación por paciente ─────────────────────────────
-- Antes y después: total_billed baja en el precio de la cita, total_paid
-- baja en lo movido, pending NUNCA sube. revenue_this_month del dashboard
-- no cambia.
-- SELECT * FROM get_patient_summary('<patient_id>');
-- SELECT t.id, t.expected_total,
--        (SELECT SUM(amount) FROM patient_payments WHERE treatment_id = t.id) AS pagado
--   FROM treatments t WHERE t.patient_id = '<patient_id>';
