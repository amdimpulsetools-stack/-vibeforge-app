-- Rollback de la mig 259: restaura treatment_start_from_budget de la
-- mig 245 verbatim (guarda estricta acceptance_status = 'accepted' y
-- UPDATE final sin accepted_at).
--
-- ADVERTENCIA — este rollback NO revierte datos, solo la función:
--
--   · Los presupuestos que ya saltaron el paso intermedio quedan como
--     están: acceptance_status = 'in_progress', started_at estampado y
--     accepted_at = el instante del inicio. NO se los devuelve a
--     'pending_acceptance' ni se les borra accepted_at — su tratamiento
--     ya existe en `treatments`, con cobros posiblemente registrados, y
--     deshacer el presupuesto dejaría el tratamiento huérfano.
--   · Ese accepted_at "sintético" es correcto y debe conservarse: es lo
--     que hace que esos presupuestos sigan contando como aceptados en
--     get_budget_kpis (mig 246) y en /api/reports/fertility.
--
-- Después de aplicar este rollback hay que revertir también la UI
-- (budget-card.tsx vuelve a "Marcar aceptado" en pending_acceptance y
-- app/api/budgets/[id]/start/route.ts vuelve a exigir 'accepted'), o el
-- botón "Iniciar tratamiento" de Pendientes devolverá 23514.

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

  IF b.acceptance_status <> 'accepted' OR b.started_at IS NOT NULL THEN
    RAISE EXCEPTION 'Solo presupuestos aceptados y no iniciados pueden iniciar un tratamiento'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM treatments WHERE budget_record_id = b.id) THEN
    RAISE EXCEPTION 'Este presupuesto ya tiene un tratamiento' USING ERRCODE = 'unique_violation';
  END IF;

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

  UPDATE budget_records
     SET acceptance_status = 'in_progress',
         started_at = now(),
         started_by_user_id = auth.uid()
   WHERE id = b.id;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION treatment_start_from_budget(UUID, UUID, UUID, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION treatment_start_from_budget(UUID, UUID, UUID, DATE, TEXT) TO authenticated;
