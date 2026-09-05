-- Rollback de la mig 246: restaura get_budget_kpis de la 201 verbatim.

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
