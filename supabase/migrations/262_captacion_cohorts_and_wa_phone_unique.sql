-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 262: Captación por cohorte de fechas + un número de WhatsApp por org
--
-- Contexto (15-sep-2026): App Review de Meta aprobado y Tech Provider
-- registrado; el módulo Captación (migs 206/207) va a recibir tráfico
-- real de clínicas. Revisión previa al lanzamiento (agente + founder):
--
-- 1. `whatsapp_config.phone_number_id` no era único. El capturador
--    (lib/whatsapp/capture.ts) resuelve la org por phone_number_id con un
--    Map donde "la última fila gana": si un número quedara en dos orgs
--    (una clínica reconectando en otra org, o el número de prueba del
--    founder en dos), los mensajes de pacientes irían a la org
--    equivocada. Verificado en prod antes de esta mig: UNA sola fila con
--    phone_number_id (DemoClinic) → el índice único entra limpio.
--    Índice PARCIAL sobre activos: una org puede conservar su fila
--    inactiva (desconectada) mientras otra usa el mismo número.
--
-- 2. `captacion_summary` medía una ventana FIJA: conversaciones con
--    último mensaje en 30 días y citas creadas en los 30 días siguientes
--    al primer contacto. Pedido del founder: "cuántos de los que
--    escribieron hace tres meses reservaron una cita", filtrable por
--    fechas. Ahora la función recibe p_from/p_to y trabaja por COHORTE:
--    conversaciones cuyo PRIMER mensaje cae en el rango (fecha civil de
--    la org, `organizations.timezone`, mig 240) y, para cada una,
--    cualquier cita creada DESPUÉS del primer contacto, sin tope de días.
--    Así "1-jun a 30-jun" responde exactamente "de los que escribieron en
--    junio, cuántos agendaron hasta hoy".
--
-- 3. Honestidad de los números (CLAUDE.md, un número una fórmula):
--    · `facturado` solo suma cobros CLÍNICOS (COALESCE(source,'clinical')
--      = 'clinical'): antes metía las ventas de farmacia del POS.
--    · Leads nuevos vs pacientes existentes: con Coexistence el webhook
--      recibe también los chats de pacientes de siempre. Un chat es LEAD
--      si no había paciente con ese teléfono antes del primer contacto
--      (tolerancia de 1 día: recepción a veces crea la ficha durante la
--      llamada, antes de que llegue el WhatsApp). "Agendaron",
--      "asistieron" y "facturado" se cuentan SOLO sobre leads; los
--      existentes se muestran aparte.
--    · Cruce por teléfono (9 dígitos): si varios pacientes comparten
--      celular se toma el creado MÁS RECIENTE (antes: arbitrario).
--    · `sin_responder` desaparece: nada escribe lead_status todavía, así
--      que era siempre igual al total (alerta falsa en la pantalla).
--    · Fila "organic" (ad_id NULL) en `campaigns` para que la tabla sume
--      lo mismo que los KPIs.
--
-- La firma cambia (uuid) → (uuid, date, date): se elimina la vieja. La
-- única llamadora es /api/captacion/summary, que se actualiza junto con
-- esta mig. Sigue siendo SECURITY DEFINER y ejecutable solo por
-- service_role (la API valida sesión, membresía activa y grant).
-- Verificación: SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname = 'captacion_summary';  → (uuid, date, date)
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Un phone_number_id activo por organización ────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_phone_number_id_active_uniq
  ON whatsapp_config (phone_number_id)
  WHERE is_active = true AND phone_number_id IS NOT NULL;

COMMENT ON INDEX whatsapp_config_phone_number_id_active_uniq IS
  'Mig 262: un número de WhatsApp (phone_number_id) solo puede estar ACTIVO en una org; el capturador de Captación resuelve la org por este id.';

-- ── 2. captacion_summary por cohorte de primer contacto ──────────────
DROP FUNCTION IF EXISTS captacion_summary(uuid);

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
