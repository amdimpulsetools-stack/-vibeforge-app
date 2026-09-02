-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 236: get_receptionist_dashboard — RPC del dashboard del rol RECEPCIONISTA.
--
-- PRIMER RPC DE DASHBOARD CON GATING DE ROL EXPLÍCITO. Los RPC de dashboard
-- previos (get_admin_dashboard_stats_v3, get_doctor_dashboard_enhanced) se
-- scope-an por get_user_org_ids() pero no verifican el ROL del que llama:
-- cualquier miembro autenticado puede ejecutarlos (hallazgo M12 de
-- docs/security-review-2026-09-01.md). Este RPC estrena el patrón correcto:
-- al inicio se valida (1) que p_org_id sea una org del caller y (2) que su
-- rol en ESA org sea owner/admin/receptionist — un doctor recibe
-- 'forbidden'. Los RPC futuros de dashboard deben copiar este gating.
--
-- Bloques del JSON (todos scope-ados a p_org_id, ya validado):
--   - kpis_today:            conteos de citas de hoy por estado.
--   - tomorrow_unconfirmed:  citas de mañana con status='scheduled', con
--                            LEFT JOIN a patients/doctors/services para
--                            nombre/teléfono/doctor/servicio.
--   - my_payments_today:     pagos registrados HOY por el caller
--                            (created_by = auth.uid(), estampado por el
--                            trigger de la mig 213; los webhooks con
--                            service role quedan NULL y no cuentan).
--                            SOLO plata clínica: COALESCE(source,'clinical')
--                            = 'clinical' (regla de oro, migs 213/219/233).
--                            Cobro en BRUTO (con IGV, como se cobra) — este
--                            bloque es "cobros", nunca ingresos/ganancia.
--   - my_managed_30d:        citas de los últimos 30 días donde el caller
--                            es responsible_user_id (mig 073).
--   - daily_series:          serie diaria de 30 días copiada VERBATIM del
--                            bloque de la mig 200 (misma semántica que ve
--                            el admin: excluye cancelled), con el filtro de
--                            org adaptado a p_org_id (aquí la org llega
--                            como parámetro ya gateado, no como array).
--
-- GRANT explícito (193(d) dejó los default privileges cerrados).

CREATE OR REPLACE FUNCTION get_receptionist_dashboard(
  p_org_id UUID,
  p_today DATE DEFAULT CURRENT_DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
  v_role TEXT;
  v_tomorrow DATE := p_today + 1;
BEGIN
  -- ── Gating: org del caller + rol permitido (patrón M12) ──
  IF p_org_id IS NULL OR p_org_id NOT IN (SELECT get_user_org_ids()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  v_role := get_user_org_role(p_org_id);
  IF v_role IS NULL OR v_role NOT IN ('owner', 'admin', 'receptionist') THEN
    -- doctor (u otro rol futuro) ⇒ fuera.
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT json_build_object(
    -- ── W1: Hoy de un vistazo ──
    'kpis_today', (
      SELECT json_build_object(
        'total', COUNT(*),
        'confirmed', COUNT(*) FILTER (WHERE status = 'confirmed'),
        'unconfirmed', COUNT(*) FILTER (WHERE status = 'scheduled'),
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'no_show', COUNT(*) FILTER (WHERE status = 'no_show')
      )
      FROM appointments
      WHERE organization_id = p_org_id AND appointment_date = p_today
    ),

    -- ── W2: Por confirmar mañana (status='scheduled', orden por hora) ──
    'tomorrow_unconfirmed', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', tu.id,
        'start_time', tu.start_time,
        'patient_name', tu.patient_name,
        'patient_phone', tu.patient_phone,
        'doctor_name', tu.doctor_name,
        'service_name', tu.service_name
      ) ORDER BY tu.start_time ASC, tu.id ASC), '[]'::json)
      FROM (
        SELECT
          a.id,
          a.start_time,
          -- El nombre denormalizado de la cita manda (siempre existe);
          -- la ficha de paciente es fallback para citas viejas sin él.
          COALESCE(
            NULLIF(a.patient_name, ''),
            NULLIF(TRIM(CONCAT(p.first_name, ' ', p.last_name)), '')
          ) AS patient_name,
          COALESCE(NULLIF(a.patient_phone, ''), p.phone) AS patient_phone,
          d.full_name AS doctor_name,
          s.name AS service_name
        FROM appointments a
        LEFT JOIN patients p ON a.patient_id = p.id
        LEFT JOIN doctors d ON a.doctor_id = d.id
        LEFT JOIN services s ON a.service_id = s.id
        WHERE a.organization_id = p_org_id
          AND a.appointment_date = v_tomorrow
          AND a.status = 'scheduled'
      ) tu
    ),

    -- ── W3: Mis cobros de hoy (bruto, solo clínica — jamás POS) ──
    'my_payments_today', (
      SELECT json_build_object(
        'amount_total', COALESCE(SUM(amount), 0),
        'count', COUNT(*)
      )
      FROM patient_payments
      WHERE organization_id = p_org_id
        AND created_by = auth.uid()
        AND payment_date = p_today
        AND COALESCE(source, 'clinical') = 'clinical'
    ),

    -- ── W5 (chip): mis citas gestionadas, últimos 30 días ──
    'my_managed_30d', (
      SELECT json_build_object(
        'completed', COUNT(*) FILTER (WHERE status = 'completed'),
        'no_show', COUNT(*) FILTER (WHERE status = 'no_show'),
        'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled')
      )
      FROM appointments
      WHERE organization_id = p_org_id
        AND responsible_user_id = auth.uid()
        AND appointment_date BETWEEN (p_today - 29) AND p_today
    ),

    -- ── W5 (gráfica): serie diaria de citas (últimos 30 días, sin
    -- canceladas) — copiada VERBATIM de la mig 200 (get_admin_dashboard
    -- _stats_v3.daily_series); único cambio: organization_id = p_org_id
    -- en lugar de = ANY(v_org_ids). Solo se devuelven los días con citas;
    -- el cliente rellena los vacíos con 0 (eachDayOfInterval). ──
    'daily_series', (
      SELECT COALESCE(json_agg(json_build_object(
        'date', ds.date,
        'count', ds.count
      ) ORDER BY ds.date ASC), '[]'::json)
      FROM (
        SELECT appointment_date AS date, COUNT(*) AS count
        FROM appointments
        WHERE organization_id = p_org_id
          AND appointment_date >= (p_today - INTERVAL '29 days')::date
          AND appointment_date <= p_today
          AND status != 'cancelled'
        GROUP BY appointment_date
      ) ds
    )
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_receptionist_dashboard(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_receptionist_dashboard(UUID, DATE) TO authenticated;
