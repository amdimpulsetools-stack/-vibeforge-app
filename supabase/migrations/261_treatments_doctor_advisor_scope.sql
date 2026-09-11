-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 261: doctora + asesora de fertilidad ve TODOS los tratamientos
--
-- Caso real (11-sep-2026, clínica de la Dra. Patricia): Verenisse es
-- obstetra (rol `doctor`, con ficha en `doctors`) y además asesora de
-- fertilidad (`is_fertility_advisor = true`). Es quien recibe la noticia
-- del embarazo y hace el seguimiento, y el único tratamiento en curso la
-- tiene asignada como asesora (`assistant_member_id`). Sin embargo NO lo
-- veía: `treatments_caller_role` (mig 245) devuelve 'doctor' antes que
-- 'advisor', y un doctor solo ve los tratamientos donde ÉL es la doctora.
-- La combinación doctora + asesora se quedaba con lo más restrictivo.
--
-- Decisión del founder: una doctora que además es asesora ve e
-- interactúa con TODOS los tratamientos de la clínica (como una asesora
-- sin ficha de médico). Un doctor a secas sigue viendo solo los suyos.
-- Los honorarios siguen visibles para ella: es rol `doctor` y el
-- presupuesto que ella misma arma ya los imprime línea por línea.
--
-- Qué cambia (mínimo):
--   · helper nuevo `treatments_doctor_scoped(p_org_id)`: true solo si el
--     miembro activo es `doctor` Y NO es asesora. Es la ÚNICA condición
--     de alcance por doctora del módulo, en BD y en la API.
--   · `treatment_close` y `get_treatments_overview`: cuerpo VERBATIM de
--     la mig 245 salvo que `v_role = 'doctor'` en la condición de alcance
--     pasa a `treatments_doctor_scoped(...)` (comentado "261:").
--   · `treatments_caller_role`, `treatment_start_from_budget` (259) y
--     `treatment_reopen` no cambian: no filtran por doctora.
-- Sin cambio de tablas ni de policies (la lectura de `treatments` ya
-- era org-wide; el recorte vivía en el RPC y en /api/treatments).
-- Verificación: SELECT proname FROM pg_proc WHERE proname = 'treatments_doctor_scoped';
-- ═══════════════════════════════════════════════════════════════════

-- ── helper: ¿este usuario está acotado a SUS tratamientos? ───────────
-- true  → rol doctor sin bandera de asesora (ve solo los suyos)
-- false → owner/admin/recepción/asesora, o doctor que además es asesora
CREATE OR REPLACE FUNCTION treatments_doctor_scoped(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT om.role = 'doctor' AND NOT COALESCE(om.is_fertility_advisor, false)
    FROM organization_members om
    WHERE om.user_id = auth.uid() AND om.organization_id = p_org_id AND om.is_active = true
    LIMIT 1
  ), false)
$$;
REVOKE ALL ON FUNCTION treatments_doctor_scoped(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION treatments_doctor_scoped(UUID) TO authenticated;

-- ── 2. Cerrar tratamiento con desenlace (cuerpo de la 245, alcance 261) ──
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
  t       treatments%ROWTYPE;
  v_role  TEXT;
  v_today DATE;
BEGIN
  SELECT * INTO t FROM treatments WHERE id = p_treatment_id;
  IF t.id IS NULL OR t.organization_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_role := treatments_caller_role(t.organization_id);
  IF v_role IS NULL OR v_role NOT IN ('owner','admin','doctor') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  -- Un doctor solo cierra SUS tratamientos (o los que no tienen doctora).
  -- 261: si además es asesora de fertilidad, cierra cualquiera (es quien
  -- recibe el desenlace del tratamiento).
  IF treatments_doctor_scoped(t.organization_id) AND t.doctor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM doctors d
    WHERE d.id = t.doctor_id AND d.user_id = auth.uid() AND d.organization_id = t.organization_id
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF t.status <> 'in_progress' THEN
    RAISE EXCEPTION 'El tratamiento ya está cerrado' USING ERRCODE = 'check_violation';
  END IF;
  IF p_status NOT IN ('completed','abandoned','cancelled') THEN
    RAISE EXCEPTION 'Estado de cierre inválido' USING ERRCODE = 'check_violation';
  END IF;

  -- "Hoy" civil en la zona de la org (mig 240), no CURRENT_DATE en UTC.
  SELECT (now() AT TIME ZONE COALESCE(o.timezone, 'America/Lima'))::date INTO v_today
    FROM organizations o WHERE o.id = t.organization_id;

  UPDATE treatments
     SET status = p_status,
         outcome = COALESCE(p_outcome, CASE p_status WHEN 'abandoned' THEN 'abandoned' ELSE 'other' END),
         outcome_reason = NULLIF(btrim(COALESCE(p_reason,'')), ''),
         closed_at = COALESCE(p_closed_at, v_today, CURRENT_DATE),
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

-- ── 4. KPIs del período (cuerpo de la 245, alcance 261) ──────────────
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
  v_scoped    BOOLEAN;
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

  -- Un doctor solo ve sus tratamientos. 261: si además es asesora de
  -- fertilidad ve TODOS (v_scoped = false), como una asesora sin ficha.
  v_scoped := treatments_doctor_scoped(p_org_id);
  IF v_scoped THEN
    SELECT id INTO v_doctor_id FROM doctors
     WHERE organization_id = p_org_id AND user_id = auth.uid() AND is_active = true
     LIMIT 1;
  END IF;
  v_sees_fees := v_role IN ('owner','admin','doctor');

  -- Un doctor SIN ficha en `doctors` (v_doctor_id NULL) no ve nada: con
  -- "v_doctor_id IS NULL OR …" recibía los KPIs de TODA la clínica (el RPC
  -- es callable directo desde supabase-js, no solo vía /api/treatments).
  WITH scope AS (
    SELECT t.* FROM treatments t
    WHERE t.organization_id = p_org_id
      AND (NOT v_scoped OR t.doctor_id = v_doctor_id)
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
