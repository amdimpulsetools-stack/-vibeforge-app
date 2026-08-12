-- ============================================================
-- Módulo Captación — Fase 2: addon oculto + motor de atribución
--
-- El addon `captacion` se registra con is_active = false: NO aparece
-- en el marketplace de módulos de ninguna clínica. Las orgs del
-- founder reciben el grant directo en organization_addons, y
-- /api/addons aprende a incluir addons ocultos cuando la org tiene
-- grant (patrón beta). Así el módulo se desarrolla en producción sin
-- que Patricia ni Vitra vean nada — cuando toque lanzarlo, se voltea
-- is_active a true y se le pone precio.
-- ============================================================

INSERT INTO addons (key, name, description, category, icon, is_premium, min_plan, sort_order, is_active)
VALUES (
  'captacion',
  'Captación',
  'Descubre qué campañas de Meta te traen pacientes reales: leads, citas y soles por cada anuncio.',
  'workflow',
  'megaphone',
  true,
  'independiente',
  90,
  false -- oculto del marketplace mientras se desarrolla
)
ON CONFLICT (key) DO NOTHING;

-- Grant beta a las orgs del founder (por owner + nombre, no por UUID
-- hardcodeado, para que la migración sea legible y re-ejecutable).
INSERT INTO organization_addons (organization_id, addon_key, enabled)
SELECT o.id, 'captacion', true
FROM organizations o
JOIN user_profiles up ON up.id = o.owner_id
WHERE (up.email = 'oscarfiverr@gmail.com' AND o.name = 'Clínica de Oscar Duran')
   OR (up.email = 'amdimpulsetools@gmail.com' AND o.name = 'Centro Médico Amdimpulsetools')
ON CONFLICT (organization_id, addon_key) DO UPDATE SET enabled = true;

-- ============================================================
-- Motor de atribución: campaña → leads → citas → asistencias → soles.
--
-- Cruce por teléfono contra la agenda (nivel "automático" de la spec):
-- se comparan los últimos 9 dígitos (Perú: 51 + 9), lo que absorbe
-- formatos como "+51 987-654-321" vs "51987654321". La cita cuenta si
-- se creó dentro de los 30 días posteriores al primer contacto de la
-- conversación; el facturado suma TODO pago del paciente desde ese
-- primer contacto (proto-LTV: el origen se pega al paciente).
--
-- SECURITY DEFINER y ejecutable SOLO por service_role: la API valida
-- la membresía y el grant del addon antes de llamar; ningún cliente
-- de navegador puede invocarla directo.
-- ============================================================
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
