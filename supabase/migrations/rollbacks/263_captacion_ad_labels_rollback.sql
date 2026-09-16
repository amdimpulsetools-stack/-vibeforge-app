-- Rollback 263: vuelve captacion_summary al cuerpo exacto de la mig 262 y
-- elimina la tabla de etiquetas.
CREATE OR REPLACE FUNCTION captacion_summary(p_org_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH org AS (
  SELECT COALESCE(o.timezone, 'America/Lima') AS tz
  FROM organizations o WHERE o.id = p_org_id
),
convs AS (
  SELECT
    c.id,
    c.phone_normalized,
    c.display_name,
    c.lead_status,
    c.first_referral_ad_id,
    c.first_referral_headline,
    c.first_referral_source,
    c.first_referral_at,
    c.created_at,
    c.last_message_at,
    right(c.phone_normalized, 9) AS phone9
  FROM wa_conversations c, org
  WHERE c.organization_id = p_org_id
    AND (c.created_at AT TIME ZONE org.tz)::date BETWEEN p_from AND p_to
),
matched AS (
  SELECT
    cv.*,
    p.id AS patient_id,
    p.patient_name,
    -- Lead = no existía paciente con ese teléfono antes del primer
    -- contacto (tolerancia 1 día, ver cabecera).
    (p.id IS NULL OR p.created_at >= cv.created_at - interval '1 day') AS is_new_lead,
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.organization_id = p_org_id
        AND a.patient_id = p.id
        AND a.status <> 'cancelled'
        AND a.created_at >= cv.created_at
    ) AS agendo,
    EXISTS (
      SELECT 1 FROM appointments a
      WHERE a.organization_id = p_org_id
        AND a.patient_id = p.id
        AND a.status = 'completed'
        AND a.created_at >= cv.created_at
    ) AS asistio,
    COALESCE((
      SELECT sum(pp.amount) FROM patient_payments pp
      WHERE pp.organization_id = p_org_id
        AND pp.patient_id = p.id
        AND COALESCE(pp.source, 'clinical') = 'clinical'
        AND pp.created_at >= cv.created_at
    ), 0) AS facturado
  FROM convs cv
  LEFT JOIN LATERAL (
    SELECT p.id,
           p.first_name || ' ' || COALESCE(p.last_name, '') AS patient_name,
           p.created_at
    FROM patients p
    WHERE p.organization_id = p_org_id
      AND length(cv.phone9) = 9
      AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 9) = cv.phone9
    ORDER BY p.created_at DESC
    LIMIT 1
  ) p ON true
),
leads AS (
  SELECT * FROM matched WHERE is_new_lead
)
SELECT jsonb_build_object(
  'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', (SELECT tz FROM org)),
  'msgs', (
    SELECT count(*) FROM wa_inbound_messages m, org
    WHERE m.organization_id = p_org_id
      AND (m.received_at AT TIME ZONE org.tz)::date BETWEEN p_from AND p_to
  ),
  'convs',           (SELECT count(*) FROM matched),
  'leads',           (SELECT count(*) FROM leads),
  'existing',        (SELECT count(*) FROM matched WHERE NOT is_new_lead),
  'campaigns_count', (
    SELECT count(DISTINCT first_referral_ad_id) FROM matched
    WHERE first_referral_ad_id IS NOT NULL
  ),
  'agendaron',       (SELECT count(*) FROM leads WHERE agendo),
  'asistieron',      (SELECT count(*) FROM leads WHERE asistio),
  'facturado_total', (SELECT COALESCE(sum(facturado), 0) FROM leads WHERE agendo),
  'campaigns', COALESCE((
    SELECT jsonb_agg(row_to_json(x)) FROM (
      SELECT
        COALESCE(first_referral_ad_id, 'organic') AS ad_id,
        CASE WHEN first_referral_ad_id IS NULL THEN NULL
             ELSE COALESCE(max(first_referral_headline), 'Sin titular') END AS headline,
        max(first_referral_source) AS source_type,
        count(*) AS chats,
        count(*) FILTER (WHERE is_new_lead) AS leads,
        count(*) FILTER (WHERE is_new_lead AND agendo) AS agendados,
        count(*) FILTER (WHERE is_new_lead AND asistio) AS asistieron,
        COALESCE(sum(facturado) FILTER (WHERE is_new_lead AND agendo), 0) AS facturado
      FROM matched
      GROUP BY first_referral_ad_id
      ORDER BY (first_referral_ad_id IS NULL), count(*) FILTER (WHERE is_new_lead) DESC
    ) x
  ), '[]'::jsonb),
  'recientes', COALESCE((
    SELECT jsonb_agg(row_to_json(y)) FROM (
      SELECT
        id, phone_normalized, display_name, lead_status,
        first_referral_headline, created_at, last_message_at,
        patient_id, patient_name, is_new_lead, agendo
      FROM matched
      ORDER BY created_at DESC
      LIMIT 25
    ) y
  ), '[]'::jsonb)
)
$$;

REVOKE ALL ON FUNCTION captacion_summary(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION captacion_summary(uuid, date, date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION captacion_summary(uuid, date, date) TO service_role;

COMMENT ON FUNCTION captacion_summary(uuid, date, date) IS
  'Captación (mig 262): cohorte por fecha civil del PRIMER mensaje (zona de la org); lead = sin paciente previo; citas/asistencias/facturado clínico posteriores al primer contacto sin tope de días; cruce por últimos 9 dígitos del teléfono. Solo service_role.';

DROP TABLE IF EXISTS captacion_ad_labels;
