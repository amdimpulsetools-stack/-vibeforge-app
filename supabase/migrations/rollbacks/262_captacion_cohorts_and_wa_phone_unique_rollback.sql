-- Rollback 262: vuelve captacion_summary a la firma (uuid) con el cuerpo
-- exacto de la mig 207 y quita el índice único parcial de phone_number_id.
DROP FUNCTION IF EXISTS captacion_summary(uuid, date, date);

CREATE OR REPLACE FUNCTION captacion_summary(p_org_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH convs AS (
  SELECT
    c.id,
    c.phone_normalized,
    c.display_name,
    c.lead_status,
    c.first_referral_ad_id,
    c.first_referral_headline,
    c.first_referral_at,
    c.created_at,
    c.last_message_at,
    right(c.phone_normalized, 9) AS phone9
  FROM wa_conversations c
  WHERE c.organization_id = p_org_id
    AND c.last_message_at >= now() - interval '30 days'
),
matched AS (
  SELECT
    cv.*,
    p.id AS patient_id,
    p.first_name || ' ' || COALESCE(p.last_name, '') AS patient_name,
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.organization_id = p_org_id
        AND a.patient_id = p.id
        AND a.status <> 'cancelled'
        AND a.created_at >= cv.created_at
        AND a.created_at < cv.created_at + interval '30 days'
    ) AS agendo,
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.organization_id = p_org_id
        AND a.patient_id = p.id
        AND a.status = 'completed'
        AND a.created_at >= cv.created_at
        AND a.created_at < cv.created_at + interval '30 days'
    ) AS asistio,
    COALESCE((
      SELECT sum(pp.amount) FROM patient_payments pp
      WHERE pp.organization_id = p_org_id
        AND pp.patient_id = p.id
        AND pp.created_at >= cv.created_at
    ), 0) AS facturado
  FROM convs cv
  LEFT JOIN LATERAL (
    SELECT p.id, p.first_name, p.last_name
    FROM patients p
    WHERE p.organization_id = p_org_id
      AND length(cv.phone9) = 9
      AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 9) = cv.phone9
    LIMIT 1
  ) p ON true
)
SELECT jsonb_build_object(
  'msgs_30d', (
    SELECT count(*) FROM wa_inbound_messages m
    WHERE m.organization_id = p_org_id
      AND m.received_at >= now() - interval '30 days'
  ),
  'convs_30d', (SELECT count(*) FROM convs),
  'campaigns_30d', (
    SELECT count(DISTINCT first_referral_ad_id) FROM convs
    WHERE first_referral_ad_id IS NOT NULL
  ),
  'sin_responder', (
    SELECT count(*) FROM convs WHERE lead_status = 'nuevo'
  ),
  'agendaron', (SELECT count(*) FROM matched WHERE agendo),
  'asistieron', (SELECT count(*) FROM matched WHERE asistio),
  'facturado_total', (SELECT COALESCE(sum(facturado), 0) FROM matched WHERE agendo),
  'campaigns', COALESCE((
    SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT
        first_referral_ad_id AS ad_id,
        COALESCE(max(first_referral_headline), 'Sin titular') AS headline,
        count(*) AS leads,
        count(*) FILTER (WHERE agendo) AS agendados,
        count(*) FILTER (WHERE asistio) AS asistieron,
        COALESCE(sum(facturado) FILTER (WHERE agendo), 0) AS facturado
      FROM matched
      WHERE first_referral_ad_id IS NOT NULL
      GROUP BY first_referral_ad_id
      ORDER BY count(*) DESC
    ) x
  ), '[]'::jsonb),
  'recientes', COALESCE((
    SELECT jsonb_agg(row_to_json(y)) FROM (
      SELECT
        id, phone_normalized, display_name, lead_status,
        first_referral_headline, last_message_at,
        patient_id, patient_name, agendo
      FROM matched
      ORDER BY last_message_at DESC
      LIMIT 25
    ) y
  ), '[]'::jsonb)
)
$$;

REVOKE ALL ON FUNCTION captacion_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION captacion_summary(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION captacion_summary(uuid) TO service_role;

COMMENT ON FUNCTION captacion_summary(uuid) IS
  'Captación F2: agregado campaña→leads→citas→soles con cruce por teléfono (últimos 9 dígitos) y ventana de 30 días. Solo service_role.';

DROP INDEX IF EXISTS whatsapp_config_phone_number_id_active_uniq;
