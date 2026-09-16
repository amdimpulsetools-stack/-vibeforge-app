-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 263: Captación — etiqueta propia por anuncio
--
-- Meta solo envía en el webhook el ID y el titular del ANUNCIO, nunca el
-- nombre de la campaña ("1era consulta video 2"): eso vive en el
-- Administrador de anuncios y traerlo exige el permiso ads_read (otro App
-- Review) y conectar la cuenta publicitaria de cada clínica. Decisión del
-- founder (16-sep-2026): la clínica le pone el nombre que quiera a cada
-- anuncio desde Yenda. Tabla mínima por org × ad_id; el RPC de la mig 262
-- la devuelve como `label` en cada fila de `campaigns` (CREATE OR REPLACE
-- con la MISMA firma: sin DROP, cuerpo idéntico salvo la subconsulta).
--
-- RLS: lee cualquier miembro ACTIVO de la org; escribe owner/admin
-- (is_org_admin, mig 235). La API /api/captacion/ad-labels usa el cliente
-- del usuario: la policy es el segundo candado.
-- Verificación: SELECT to_regclass('public.captacion_ad_labels');  → no NULL
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS captacion_ad_labels (
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  ad_id           text NOT NULL,
  label           text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 80),
  updated_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, ad_id)
);

COMMENT ON TABLE captacion_ad_labels IS
  'Captación (mig 263): nombre que la clínica le pone a un anuncio de Meta (ad_id del referral). Meta no envía el nombre de la campaña.';

ALTER TABLE captacion_ad_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "captacion_ad_labels_select" ON captacion_ad_labels
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "captacion_ad_labels_insert" ON captacion_ad_labels
  FOR INSERT TO authenticated
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "captacion_ad_labels_update" ON captacion_ad_labels
  FOR UPDATE TO authenticated
  USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "captacion_ad_labels_delete" ON captacion_ad_labels
  FOR DELETE TO authenticated
  USING (is_org_admin(organization_id));

-- ── captacion_summary: misma firma, + label por anuncio ──────────────
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
        -- Etiqueta propia de la clínica para ese anuncio (mig 263); NULL si
        -- no le puso nombre. La pantalla muestra label ?? headline.
        (SELECT l.label FROM captacion_ad_labels l
          WHERE l.organization_id = p_org_id AND l.ad_id = m.first_referral_ad_id) AS label,
        max(first_referral_source) AS source_type,
        count(*) AS chats,
        count(*) FILTER (WHERE is_new_lead) AS leads,
        count(*) FILTER (WHERE is_new_lead AND agendo) AS agendados,
        count(*) FILTER (WHERE is_new_lead AND asistio) AS asistieron,
        COALESCE(sum(facturado) FILTER (WHERE is_new_lead AND agendo), 0) AS facturado
      FROM matched m
      GROUP BY m.first_referral_ad_id
      ORDER BY (m.first_referral_ad_id IS NULL), count(*) FILTER (WHERE is_new_lead) DESC
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
