-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 197: get_retention_trend — eliminar la subconsulta correlacionada O(n·m).
--
-- PROBLEMA
-- La versión vigente (044_retention_rpcs.sql:225-245) decide si un paciente
-- es "returning" en el mes M con una subconsulta correlacionada:
--
--     COUNT(DISTINCT CASE WHEN a.patient_id IN (
--       SELECT patient_id FROM appointments a2
--       WHERE a2.status IN ('completed','confirmed')
--         AND a2.appointment_date < date_trunc('month', a.appointment_date)
--         AND a2.organization_id IN (SELECT get_user_org_ids())
--     ) THEN a.patient_id END)
--
-- El predicado depende de `a` (del mes de la fila externa), así que Postgres
-- no puede materializarla una sola vez: vuelve a barrer el histórico
-- completo de citas para cada fila del rango. Con volumen la llamada pasa de
-- milisegundos a segundos.
--
-- SOLUCIÓN
-- El mismo patrón que ya usa get_retention_overview en esta misma migración
-- (044:21-30): un CTE con la PRIMERA visita por paciente, calculado una sola
-- vez, y clasificar contra él.
--
--     MIN(appointment_date) < inicio_del_mes   ⟺   existe una cita anterior
--
-- La equivalencia es exacta porque el MIN se toma sobre el MISMO conjunto
-- filtrado (status completed/confirmed, patient_id no nulo, orgs del
-- llamante) que usaba la subconsulta.
--
-- FIRMA Y SALIDA IDÉNTICAS: mismo nombre, mismo parámetro (p_months INT
-- DEFAULT 6), mismo RETURNS JSON y exactamente las mismas cinco claves por
-- mes — el frontend (reports/retention-report.tsx) no cambia. CREATE OR
-- REPLACE conserva los privilegios fijados por la migración 193.

CREATE OR REPLACE FUNCTION get_retention_trend(
  p_months INT DEFAULT 6
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result JSON;
BEGIN
  WITH patient_first_visit AS (
    -- Una pasada sobre el histórico, no una por mes.
    SELECT
      patient_id,
      MIN(appointment_date) AS first_visit
    FROM appointments
    WHERE status IN ('completed', 'confirmed')
      AND patient_id IS NOT NULL
      AND organization_id IN (SELECT get_user_org_ids())
    GROUP BY patient_id
  ),
  monthly_data AS (
    SELECT
      date_trunc('month', a.appointment_date)::DATE AS month,
      COUNT(DISTINCT a.patient_id) AS total_patients,
      COUNT(DISTINCT CASE
        -- "Returning" = su primera visita fue ANTES de este mes.
        WHEN pfv.first_visit < date_trunc('month', a.appointment_date)
        THEN a.patient_id
      END) AS returning_patients
    FROM appointments a
    LEFT JOIN patient_first_visit pfv ON pfv.patient_id = a.patient_id
    WHERE a.status IN ('completed', 'confirmed')
      AND a.patient_id IS NOT NULL
      AND a.appointment_date >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)
      AND a.organization_id IN (SELECT get_user_org_ids())
    GROUP BY date_trunc('month', a.appointment_date)
    ORDER BY month
  )
  SELECT COALESCE(json_agg(json_build_object(
    'month', to_char(month, 'YYYY-MM'),
    'total_patients', total_patients,
    'returning_patients', returning_patients,
    'new_patients', total_patients - returning_patients,
    'retention_rate', CASE
      WHEN total_patients > 0
      THEN ROUND(returning_patients::NUMERIC / total_patients * 100, 1)
      ELSE 0
    END
  )), '[]'::JSON) INTO result
  FROM monthly_data;

  RETURN result;
END;
$$;
