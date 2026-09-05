-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- ═══════════════════════════════════════════════════════════════════
-- 245: Módulo TRATAMIENTOS — RPCs con gating de rol (patrón M12, mig 236)
--
--   treatment_start_from_budget  presupuesto aceptado → tratamiento + budget
--                                'in_progress' en UNA transacción.
--   treatment_close              cierra con desenlace; budget → 'completed'.
--   treatment_reopen             deshace un cierre (solo owner/admin).
--   get_treatments_overview      KPIs del período con la fórmula única.
--
-- Roles: iniciar = owner/admin/doctor/asesora (mismo set que
-- /api/budgets/[id]/start); cerrar = owner/admin/doctor; reabrir =
-- owner/admin; KPIs = cualquier miembro activo, pero `honorarium_*` solo
-- para owner/admin/doctor (recepción registra pagos, no ve honorarios).
-- Un doctor ve KPIs solo de SUS tratamientos (doctors.user_id = auth.uid()).
--
-- FÓRMULA ÚNICA (espejo en lib/treatments/money.ts — cambiar JUNTOS):
--   paid_clinic      = Σ patient_payments.amount
--                        WHERE treatment_id = t AND COALESCE(source,'clinical')='clinical'
--   external_covered = Σ treatment_external_payments.amount WHERE treatment_id = t
--   covered          = paid_clinic + external_covered
--   pending          = GREATEST(0, expected_total − covered)
--   honorarium_paid  = Σ paid_clinic FILTER (revenue_bucket = 'honorarium')
-- Todo BRUTO (con IGV, como se cobra). Nada aquí se llama "ingreso" ni
-- "ganancia": son cobros (regla de oro).
-- ═══════════════════════════════════════════════════════════════════

-- ── helper: rol permitido para escribir en el módulo ─────────────────
CREATE OR REPLACE FUNCTION treatments_caller_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN om.role IN ('owner','admin','doctor') THEN om.role
    WHEN om.is_fertility_advisor THEN 'advisor'
    ELSE om.role
  END
  FROM organization_members om
  WHERE om.user_id = auth.uid() AND om.organization_id = p_org_id AND om.is_active = true
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION treatments_caller_role(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION treatments_caller_role(UUID) TO authenticated;

-- ── 1. Iniciar tratamiento desde un presupuesto aceptado ─────────────
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

  SELECT COALESCE(s.name, b.treatment_type) INTO v_title
    FROM services s WHERE s.id = b.service_id;
  IF v_title IS NULL THEN v_title := b.treatment_type; END IF;

  INSERT INTO treatments (
    organization_id, patient_id, budget_record_id, doctor_id, assistant_member_id,
    service_id, treatment_type, title, expected_total, status, started_at, started_by, notes
  ) VALUES (
    b.organization_id, b.patient_id, b.id,
    COALESCE(p_doctor_id, b.assigned_doctor_id), p_assistant_member_id,
    b.service_id, b.treatment_type, v_title,
    COALESCE(b.amount, 0), 'in_progress',
    COALESCE(p_started_at, CURRENT_DATE), auth.uid(), NULLIF(btrim(COALESCE(p_notes,'')), '')
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

-- ── 2. Cerrar tratamiento con desenlace ──────────────────────────────
CREATE OR REPLACE FUNCTION treatment_close(
  p_treatment_id UUID,
  p_status       TEXT,          -- completed | abandoned | cancelled
  p_outcome      TEXT DEFAULT NULL,
  p_reason       TEXT DEFAULT NULL,
  p_closed_at    DATE DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t      treatments%ROWTYPE;
  v_role TEXT;
BEGIN
  SELECT * INTO t FROM treatments WHERE id = p_treatment_id;
  IF t.id IS NULL OR t.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_role := treatments_caller_role(t.organization_id);
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','doctor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF t.status <> 'in_progress' THEN
    RAISE EXCEPTION 'El tratamiento ya está cerrado' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status NOT IN ('completed','abandoned','cancelled') THEN
    RAISE EXCEPTION 'Estado de cierre inválido' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE treatments
     SET status = p_status,
         outcome = COALESCE(p_outcome, CASE p_status WHEN 'abandoned' THEN 'abandoned' ELSE 'other' END),
         outcome_reason = NULLIF(btrim(COALESCE(p_reason,'')), ''),
         closed_at = COALESCE(p_closed_at, CURRENT_DATE),
         closed_by = auth.uid()
   WHERE id = t.id;

  -- El ciclo comercial del presupuesto terminó, cualquiera sea el desenlace.
  IF t.budget_record_id IS NOT NULL THEN
    UPDATE budget_records
       SET acceptance_status = 'completed', completed_at = now()
     WHERE id = t.budget_record_id AND acceptance_status = 'in_progress';
  END IF;
END $$;
REVOKE ALL ON FUNCTION treatment_close(UUID, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION treatment_close(UUID, TEXT, TEXT, TEXT, DATE) TO authenticated;

-- ── 3. Reabrir (solo dirección) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION treatment_reopen(p_treatment_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  t treatments%ROWTYPE;
BEGIN
  SELECT * INTO t FROM treatments WHERE id = p_treatment_id;
  IF t.id IS NULL OR NOT is_org_admin(t.organization_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF t.status = 'in_progress' THEN RETURN; END IF;

  UPDATE treatments
     SET status = 'in_progress', outcome = NULL, outcome_reason = NULL,
         closed_at = NULL, closed_by = NULL
   WHERE id = t.id;

  IF t.budget_record_id IS NOT NULL THEN
    UPDATE budget_records
       SET acceptance_status = 'in_progress', completed_at = NULL
     WHERE id = t.budget_record_id AND acceptance_status = 'completed';
  END IF;
END $$;
REVOKE ALL ON FUNCTION treatment_reopen(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION treatment_reopen(UUID) TO authenticated;

-- ── 4. KPIs del período ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_treatments_overview(
  p_org_id UUID,
  p_from   DATE,
  p_to     DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role      TEXT;
  v_doctor_id UUID;
  v_sees_fees BOOLEAN;
  result      JSON;
BEGIN
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_role := treatments_caller_role(p_org_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Un doctor solo ve sus tratamientos.
  IF v_role = 'doctor' THEN
    SELECT id INTO v_doctor_id FROM doctors
     WHERE organization_id = p_org_id AND user_id = auth.uid() AND is_active = true
     LIMIT 1;
  END IF;
  v_sees_fees := v_role IN ('owner','admin','doctor');

  WITH scope AS (
    SELECT t.* FROM treatments t
    WHERE t.organization_id = p_org_id
      AND (v_doctor_id IS NULL OR t.doctor_id = v_doctor_id)
  ),
  period_pay AS (
    SELECT pp.amount, pp.revenue_bucket
    FROM patient_payments pp
    JOIN scope t ON t.id = pp.treatment_id
    WHERE pp.organization_id = p_org_id
      AND COALESCE(pp.source,'clinical') = 'clinical'
      AND pp.payment_date BETWEEN p_from AND p_to
  ),
  open_balance AS (
    SELECT
      t.id,
      t.expected_total,
      COALESCE((SELECT SUM(pp.amount) FROM patient_payments pp
                WHERE pp.treatment_id = t.id AND COALESCE(pp.source,'clinical') = 'clinical'), 0) AS paid_clinic,
      COALESCE((SELECT SUM(e.amount) FROM treatment_external_payments e
                WHERE e.treatment_id = t.id), 0) AS external_covered
    FROM scope t
    WHERE t.status = 'in_progress'
  )
  SELECT json_build_object(
    'collected_total',     (SELECT COALESCE(SUM(amount), 0) FROM period_pay),
    'honorarium_collected', CASE WHEN v_sees_fees
                              THEN (SELECT COALESCE(SUM(amount), 0) FROM period_pay WHERE revenue_bucket = 'honorarium')
                              ELSE NULL END,
    'third_party_collected', CASE WHEN v_sees_fees
                              THEN (SELECT COALESCE(SUM(amount), 0) FROM period_pay WHERE revenue_bucket = 'third_party')
                              ELSE NULL END,
    'pending_in_progress', (SELECT COALESCE(SUM(GREATEST(0, expected_total - paid_clinic - external_covered)), 0) FROM open_balance),
    'in_progress_count',   (SELECT COUNT(*) FROM open_balance),
    'started_in_period',   (SELECT COUNT(*) FROM scope WHERE started_at BETWEEN p_from AND p_to),
    'closed_in_period',    (SELECT COUNT(*) FROM scope WHERE closed_at BETWEEN p_from AND p_to),
    'sees_fees',           v_sees_fees,
    'doctor_scope_id',     v_doctor_id
  ) INTO result;

  RETURN result;
END $$;
REVOKE ALL ON FUNCTION get_treatments_overview(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_treatments_overview(UUID, DATE, DATE) TO authenticated;

-- ── Verificación sugerida ────────────────────────────────────────────
-- SELECT proname FROM pg_proc WHERE proname IN ('treatments_caller_role','treatment_start_from_budget','treatment_close','treatment_reopen','get_treatments_overview');  → 5 filas
