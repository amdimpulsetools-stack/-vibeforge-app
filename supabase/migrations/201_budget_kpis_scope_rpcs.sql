-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 201: /api/budgets — KPIs y scope de doctor a SQL (Lote 2, ítem 2.11).
--
-- PROBLEMA
-- (a) El KPI del funnel traía TODAS las filas de 90 días
--     (select acceptance_status, sent_at, accepted_at) para agregar en JS:
--     payload y trabajo O(n) por request que crece con el histórico.
-- (b) El scope de doctor (rol doctor sin flag de asesora) hacía un fetch SIN
--     LÍMITE de todos sus appointments solo para armar una lista de
--     patient_ids e interpolarla en el `.or(...patient_id.in.(...))` de 9
--     queries PostgREST (listado + 7 counts + KPI). Con miles de citas, la
--     URL/predicado interpolado degrada severamente.
--
-- SOLUCIÓN — tres funciones nuevas (nada existente se toca):
--
-- 1. budget_records_in_caller_scope(): SETOF budget_records con el scope del
--    llamador expresado como EXISTS (sin lista de UUIDs). SECURITY INVOKER a
--    propósito: la RLS de budget_records (mig 136, select por org activa)
--    sigue aplicando por debajo; la función solo RESTRINGE más. PostgREST
--    permite embeds (`patient:patients(...)`, `followup:clinical_followups`)
--    y filtros/order/range sobre funciones que devuelven SETOF de una tabla,
--    así que el route la usa como fuente del listado en lugar de
--    from("budget_records") cuando el caller es doctor restringido.
--    Equivalencia con la lista de patient_ids de antes:
--      sent_by_user_id = auth.uid()
--      OR EXISTS cita de la org con doctor activo vinculado al caller y el
--         mismo patient_id
--    (si el caller no tiene ficha de doctor activa, el EXISTS es falso y el
--    scope colapsa a "solo lo que él envió", igual que el fallback de antes).
--
-- 2. get_budget_bucket_counts(): los 7 conteos de buckets del kanban en UNA
--    pasada con COUNT(*) FILTER (antes: 7 queries head+count). Mismos
--    filtros opcionales que el route (treatment_type, sent_by) y el mismo
--    scope de doctor vía el EXISTS de arriba. El índice
--    idx_budget_records_org_status_sent (mig 136) respalda el barrido.
--
-- 3. get_budget_kpis(): la agregación de 90/30 días con FILTER — mismos
--    números que el JS de antes:
--      · total_sent_30d / accepted_30d / rejected_30d sobre sent_at >= 30d
--        (los rates se siguen calculando en el route con el mismo redondeo)
--      · avg_time_to_acceptance_days = ROUND(AVG(GREATEST(0, accepted_at -
--        sent_at)) / 86400, 1) sobre los accepted de 90d con accepted_at,
--        idéntico al Math.round(x*10)/10 de JS para valores positivos;
--        NULL si no hay filas (el route ya trataba ese caso).
--
-- Las 2 y 3 son SECURITY DEFINER con verificación de membresía activa sobre
-- p_org_id (mismo patrón que get_org_usage); devuelven NULL si el caller no
-- es miembro. GRANT explícito a authenticated (193(d) cerró los defaults).

-- ── 1. Fuente del listado con scope de doctor ──────────────────────────────

CREATE OR REPLACE FUNCTION budget_records_in_caller_scope()
RETURNS SETOF budget_records
LANGUAGE sql SECURITY INVOKER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT br.*
  FROM budget_records br
  WHERE br.sent_by_user_id = auth.uid()
     OR EXISTS (
          SELECT 1
          FROM appointments a
          JOIN doctors d ON d.id = a.doctor_id
          WHERE d.user_id = auth.uid()
            AND d.organization_id = br.organization_id
            AND d.is_active = true
            AND a.organization_id = br.organization_id
            AND a.patient_id = br.patient_id
        )
$$;

REVOKE ALL ON FUNCTION budget_records_in_caller_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION budget_records_in_caller_scope() TO authenticated;

-- ── 2. Conteos de buckets en una pasada ────────────────────────────────────

CREATE OR REPLACE FUNCTION get_budget_bucket_counts(
  p_org_id UUID,
  p_treatment_type TEXT DEFAULT NULL,
  p_sent_by UUID DEFAULT NULL,
  p_restrict_to_caller BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
BEGIN
  -- Solo miembros activos de la org.
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = p_org_id AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'pending', COUNT(*) FILTER (WHERE acceptance_status = 'pending_acceptance'),
    'accepted', COUNT(*) FILTER (WHERE acceptance_status = 'accepted'),
    'rejected', COUNT(*) FILTER (WHERE acceptance_status = 'rejected'),
    'pending_unsent', COUNT(*) FILTER (WHERE acceptance_status = 'pending_acceptance' AND sent_at IS NULL),
    'pending_sent', COUNT(*) FILTER (WHERE acceptance_status = 'pending_acceptance' AND sent_at IS NOT NULL),
    'in_progress', COUNT(*) FILTER (WHERE acceptance_status = 'in_progress'),
    'completed', COUNT(*) FILTER (WHERE acceptance_status = 'completed')
  ) INTO result
  FROM budget_records br
  WHERE br.organization_id = p_org_id
    AND (p_treatment_type IS NULL OR br.treatment_type = p_treatment_type)
    AND (p_sent_by IS NULL OR br.sent_by_user_id = p_sent_by)
    AND (
      NOT p_restrict_to_caller
      OR br.sent_by_user_id = auth.uid()
      OR EXISTS (
           SELECT 1
           FROM appointments a
           JOIN doctors d ON d.id = a.doctor_id
           WHERE d.user_id = auth.uid()
             AND d.organization_id = p_org_id
             AND d.is_active = true
             AND a.organization_id = p_org_id
             AND a.patient_id = br.patient_id
         )
    );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_budget_bucket_counts(UUID, TEXT, UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_budget_bucket_counts(UUID, TEXT, UUID, BOOLEAN) TO authenticated;

-- ── 3. KPIs 90/30 días con agregación FILTER ───────────────────────────────

CREATE OR REPLACE FUNCTION get_budget_kpis(
  p_org_id UUID,
  p_since_30d TIMESTAMPTZ,
  p_since_90d TIMESTAMPTZ,
  p_restrict_to_caller BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
BEGIN
  -- Solo miembros activos de la org.
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = p_org_id AND is_active = true
  ) THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'total_sent_30d', COUNT(*) FILTER (WHERE sent_at >= p_since_30d),
    'accepted_30d', COUNT(*) FILTER (WHERE sent_at >= p_since_30d AND acceptance_status = 'accepted'),
    'rejected_30d', COUNT(*) FILTER (WHERE sent_at >= p_since_30d AND acceptance_status = 'rejected'),
    -- GREATEST(0, ...) replica el Math.max(0, dt) del JS anterior por si
    -- hubiera accepted_at < sent_at por datos corregidos a mano.
    'avg_time_to_acceptance_days', ROUND(
      (AVG(GREATEST(0, EXTRACT(EPOCH FROM (accepted_at - sent_at))))
        FILTER (WHERE acceptance_status = 'accepted' AND accepted_at IS NOT NULL)
      ) / 86400.0, 1)
  ) INTO result
  FROM budget_records br
  WHERE br.organization_id = p_org_id
    -- sent_at NULL (presupuestos sin procesar) queda fuera, igual que con
    -- el gte de PostgREST de antes.
    AND br.sent_at >= p_since_90d
    AND (
      NOT p_restrict_to_caller
      OR br.sent_by_user_id = auth.uid()
      OR EXISTS (
           SELECT 1
           FROM appointments a
           JOIN doctors d ON d.id = a.doctor_id
           WHERE d.user_id = auth.uid()
             AND d.organization_id = p_org_id
             AND d.is_active = true
             AND a.organization_id = p_org_id
             AND a.patient_id = br.patient_id
         )
    );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_budget_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_budget_kpis(UUID, TIMESTAMPTZ, TIMESTAMPTZ, BOOLEAN) TO authenticated;
