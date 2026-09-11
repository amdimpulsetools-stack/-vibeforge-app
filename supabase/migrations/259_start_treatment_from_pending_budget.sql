-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 259: "Iniciar tratamiento" directo desde un presupuesto pendiente
--
-- Pedido del founder (10-sep-2026): en el panel de Presupuestos, la
-- obstetra tenía que dar primero "Marcar como aceptado", saltar al tab de
-- Aceptados y recién ahí "Iniciar tratamiento". Dos clicks y un cambio de
-- pestaña para una sola decisión real ("la paciente dijo que sí y
-- empezamos"). El paso intermedio se elimina: desde Pendientes se decide
-- "Iniciar tratamiento" o "Marcar rechazado", y el presupuesto pasa
-- directo a «En curso».
--
-- El bloqueo NO estaba en la UI sino aquí: treatment_start_from_budget
-- (mig 245) exigía acceptance_status = 'accepted'. Sin esta migración, el
-- botón nuevo devuelve 23514 y no inicia nada.
--
-- CUERPO VERBATIM de la mig 245 salvo DOS cambios:
--
--   1. La guarda admite ahora 'pending_acceptance' Y 'accepted'. Se
--      mantiene started_at IS NULL (una sola vez) y se actualiza el
--      mensaje. 'accepted' sigue permitido por las filas heredadas: al
--      aplicar esta migración producción tiene 3 presupuestos aceptados y
--      sin iniciar que deben poder arrancar por el mismo camino.
--
--   2. El UPDATE final estampa además accepted_at = COALESCE(accepted_at,
--      now()). Iniciar un tratamiento IMPLICA que el presupuesto fue
--      aceptado: sin este COALESCE, un presupuesto en curso quedaría sin
--      fecha de aceptación y romperían en silencio
--        · get_budget_kpis (mig 246): avg_time_to_acceptance_days filtra
--          por accepted_at IS NOT NULL → el tiempo promedio de aceptación
--          dejaría de contar los presupuestos del flujo nuevo.
--        · /api/reports/fertility: cuenta "aceptados", accepted_amount,
--          median_days_to_accept y el reparto por tier mirando
--          accepted_at dentro del rango → daría CERO aceptados.
--        · fertility-budget-records-section.tsx:343 ("N días desde envío").
--      El COALESCE (y no un now() a secas) protege a las filas heredadas
--      que ya traen su accepted_at real: iniciarlas no reescribe la fecha
--      en que la paciente dijo que sí.
--
--      No se estampa un "accepted_by_user_id": esa columna NO existe en
--      budget_records (migs 136/140/142/167 — hay sent_by_user_id,
--      assigned_by_user_id y started_by_user_id, ninguna de aceptación).
--      Inventarla aquí sería añadir esquema en una migración de flujo, y
--      la autoría ya queda registrada en started_by_user_id, que en el
--      flujo nuevo es exactamente la misma persona y el mismo instante.
--
-- Todo lo demás queda INTACTO: gate de rol (owner/admin/doctor/asesora),
-- gate del addon Pack Fertilidad, guarda de tratamiento duplicado, guarda
-- de cita TRA viva con precio, validación de doctora/asistente de la misma
-- org, título del servicio y "hoy" civil de la org (mig 240).
--
-- Rollback: rollbacks/259_start_treatment_from_pending_budget_rollback.sql

CREATE OR REPLACE FUNCTION treatment_start_from_budget(
  p_budget_id          UUID,
  p_doctor_id          UUID DEFAULT NULL,
  p_assistant_member_id UUID DEFAULT NULL,
  p_started_at         DATE DEFAULT NULL,
  p_notes              TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  b        budget_records%ROWTYPE;
  v_role   TEXT;
  v_title  TEXT;
  v_id     UUID;
  v_addon  BOOLEAN;
  v_today  DATE;
BEGIN
  SELECT * INTO b FROM budget_records WHERE id = p_budget_id;
  IF b.id IS NULL OR b.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_role := treatments_caller_role(b.organization_id);
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','doctor','advisor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM organization_addons
    WHERE organization_id = b.organization_id
      AND addon_key IN ('fertility_basic','fertility_premium') AND enabled = true
  ) INTO v_addon;
  IF NOT v_addon THEN
    RAISE EXCEPTION 'Esta función requiere el addon Pack Fertilidad' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Mig 259 (cambio 1/2): iniciar es LA decisión — ya no hace falta pasar
  -- antes por 'accepted'. 'accepted' sigue aceptándose por las filas
  -- heredadas del flujo anterior. Rechazado, en curso, cerrado o expirado
  -- siguen bloqueados, igual que started_at IS NOT NULL.
  IF b.acceptance_status NOT IN ('pending_acceptance','accepted') OR b.started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Solo presupuestos pendientes o aceptados, y no iniciados, pueden iniciar un tratamiento'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM treatments WHERE budget_record_id = b.id) THEN
    RAISE EXCEPTION 'Este presupuesto ya tiene un tratamiento' USING ERRCODE = 'unique_violation';
  END IF;

  -- Condición bloqueante #4 (COMING-UPDATES → Tratamientos): si la paciente
  -- tiene una CITA de tratamiento viva (servicio con is_bookable=false,
  -- precio > 0, no cancelada) el acordado se duplicaría (cita de S/ 17 000
  -- + tratamiento) y la deuda de citas quedaría fantasma. Primero se migra
  -- con scripts/ops/2026-09-04-migrar-citas-tra-a-tratamientos.sql.
  IF EXISTS (
    SELECT 1
    FROM appointments a
    JOIN services s ON s.id = a.service_id
    WHERE a.patient_id = b.patient_id
      AND a.organization_id = b.organization_id
      AND s.is_bookable = false
      AND a.status <> 'cancelled'
      AND COALESCE(a.price_snapshot, s.base_price, 0) > 0
  ) THEN
    RAISE EXCEPTION 'La paciente tiene una cita de tratamiento agendada con precio. Migra esa cita al módulo Tratamientos antes de iniciar (o déjala en S/ 0).'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Doctora y asistente deben ser de la MISMA org del presupuesto: la FK
  -- sola dejaría colgar un doctor de otra clínica (usuario multi-org).
  IF p_doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM doctors WHERE id = p_doctor_id AND organization_id = b.organization_id
  ) THEN
    RAISE EXCEPTION 'Doctor no encontrado en esta organización' USING ERRCODE = 'check_violation';
  END IF;
  IF p_assistant_member_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE id = p_assistant_member_id AND organization_id = b.organization_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Miembro no encontrado en esta organización' USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(s.name, b.treatment_type) INTO v_title
    FROM services s WHERE s.id = b.service_id;
  IF v_title IS NULL THEN v_title := b.treatment_type; END IF;

  -- "Hoy" civil en la zona de la org (mig 240), no CURRENT_DATE en UTC.
  SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'America/Lima'))::date INTO v_today
    FROM organizations o WHERE o.id = b.organization_id;

  INSERT INTO treatments (
    organization_id, patient_id, budget_record_id, doctor_id, assistant_member_id,
    service_id, treatment_type, title, expected_total, status, started_at, started_by, notes
  ) VALUES (
    b.organization_id, b.patient_id, b.id,
    COALESCE(p_doctor_id, b.assigned_doctor_id), p_assistant_member_id,
    b.service_id, b.treatment_type, v_title,
    COALESCE(b.amount, 0), 'in_progress',
    COALESCE(p_started_at, v_today, CURRENT_DATE), auth.uid(), NULLIF(btrim(COALESCE(p_notes,'')), '')
  ) RETURNING id INTO v_id;

  -- Mig 259 (cambio 2/2): iniciar IMPLICA aceptar. COALESCE para no
  -- reescribir la fecha real de aceptación de las filas heredadas.
  UPDATE budget_records
     SET acceptance_status = 'in_progress',
         accepted_at = COALESCE(accepted_at, now()),
         started_at = now(),
         started_by_user_id = auth.uid()
   WHERE id = b.id;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION treatment_start_from_budget(UUID, UUID, UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION treatment_start_from_budget(UUID, UUID, UUID, DATE, TEXT) TO authenticated;
