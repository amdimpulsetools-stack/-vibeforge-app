-- Pendiente de aplicar en producción (la aplica el fundador desde el SQL Editor)
--
-- 280: Conversaciones — panel de medición (Ajustes → Medición).
--
-- Una sola función, wa_inbox_metrics(org, días), que calcula en la base y
-- en UNA llamada lo que necesita el panel: cuántos chats nuevos terminaron
-- en cita (y con IA vs. sin IA), qué pasó con las sugerencias de Yendy
-- (uso, pulgares, cuánto edita recepción, tokens), intenciones más
-- frecuentes, tiempo de primera respuesta, estado de la base de
-- conocimientos y una serie semanal. Solo lecturas; sin tablas, columnas,
-- índices ni FKs nuevas (usa los índices de las migs 275-279).
--
--   · Solo administración: la función lo exige (is_org_admin) y es
--     SECURITY DEFINER para no pagar la RLS fila por fila (igual que el
--     trigger de la 278). Acotada a p_org; nunca devuelve texto de
--     mensajes, solo cuentas y tiempos.
--   · Costo acotado: tiempo de respuesta sobre los últimos 500 chats con
--     actividad; todo lo demás por índice (org, created_at / ts).
--   · "Con IA" = el chat tuvo al menos una sugerencia USADA (pasó al
--     cuadro de texto). Es correlación, no causa: el panel lo dice.
--
-- Rollback: rollbacks/280_wa_inbox_metrics_rollback.sql
-- Pruebas:  runuser -u postgres -- bash supabase/tests/inbox/run.sh (X1)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wa_inbox_metrics(p_org uuid, p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
SET jit = off          -- consultas cortas: compilar el plan cuesta más que ejecutarlo
AS $$
DECLARE
  v_days   integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 365));
  v_since  timestamptz;
  v_conv   jsonb;
  v_ai     jsonb;
  v_sugg   jsonb;
  v_models jsonb;
  v_intent jsonb;
  v_resp   jsonb;
  v_kb     jsonb;
  v_weekly jsonb;
  v_week0  timestamptz;
BEGIN
  IF p_org IS NULL OR NOT is_org_admin(p_org) THEN
    RAISE EXCEPTION 'Solo administración puede ver la medición' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_since := now() - make_interval(days => v_days);

  -- 1. Chats nuevos en el período y cuántos terminaron en cita.
  SELECT jsonb_build_object(
           'new',       count(*),
           'scheduled', count(*) FILTER (WHERE outcome IN ('scheduled', 'attended')),
           'attended',  count(*) FILTER (WHERE outcome = 'attended'),
           'open',      count(*) FILTER (WHERE inbox_status = 'open'),
           'from_ads',  count(*) FILTER (WHERE first_referral_headline IS NOT NULL))
    INTO v_conv
    FROM wa_conversations
   WHERE organization_id = p_org AND created_at >= v_since;

  -- 2. Con IA (≥ 1 sugerencia usada) vs. sin IA, entre esos chats nuevos.
  SELECT jsonb_build_object(
           'with_ai',    jsonb_build_object('n', count(*) FILTER (WHERE used_ai),
                                            'scheduled', count(*) FILTER (WHERE used_ai AND outcome IN ('scheduled', 'attended'))),
           'without_ai', jsonb_build_object('n', count(*) FILTER (WHERE NOT used_ai),
                                            'scheduled', count(*) FILTER (WHERE NOT used_ai AND outcome IN ('scheduled', 'attended'))))
    INTO v_ai
    FROM (SELECT c.outcome,
                 EXISTS (SELECT 1 FROM wa_ai_suggestions s WHERE s.conversation_id = c.id AND s.used) AS used_ai
            FROM wa_conversations c
           WHERE c.organization_id = p_org AND c.created_at >= v_since) x;

  -- 3. Sugerencias de Yendy en el período (sin las pruebas de Ajustes).
  SELECT jsonb_build_object(
           'generated',   count(*),
           'used',        count(*) FILTER (WHERE used),
           'thumbs_up',   count(*) FILTER (WHERE rating = 1),
           'thumbs_down', count(*) FILTER (WHERE rating = -1),
           'edited',      count(*) FILTER (WHERE used AND final_text IS NOT NULL AND btrim(final_text) <> btrim(COALESCE(draft, ''))),
           'needs_human', count(*) FILTER (WHERE (flags->>'needs_human') = 'true'),
           'alarms',      count(*) FILTER (WHERE (flags->>'alarm') = 'true'),
           'gaps',        count(*) FILTER (WHERE NULLIF(btrim(flags->>'gap'), '') IS NOT NULL),
           'avg_latency_ms', round(avg(latency_ms)),
           'input_tokens',   COALESCE(sum(input_tokens), 0),
           'output_tokens',  COALESCE(sum(output_tokens), 0),
           'cache_read_tokens', COALESCE(sum(cache_read_tokens), 0))
    INTO v_sugg
    FROM wa_ai_suggestions
   WHERE organization_id = p_org AND created_at >= v_since
     AND COALESCE(flags->>'test', 'false') <> 'true';

  SELECT COALESCE(jsonb_agg(jsonb_build_object('model', model, 'n', n, 'input_tokens', it, 'output_tokens', ot, 'cache_read_tokens', ct) ORDER BY n DESC), '[]'::jsonb)
    INTO v_models
    FROM (SELECT model, count(*) n, COALESCE(sum(input_tokens), 0) it, COALESCE(sum(output_tokens), 0) ot, COALESCE(sum(cache_read_tokens), 0) ct
            FROM wa_ai_suggestions
           WHERE organization_id = p_org AND created_at >= v_since
             AND COALESCE(flags->>'test', 'false') <> 'true'
           GROUP BY model) m;

  -- 4. Intenciones más frecuentes (lo que Yendy detectó en cada pedido).
  SELECT COALESCE(jsonb_agg(jsonb_build_object('intent', intent, 'n', n) ORDER BY n DESC), '[]'::jsonb)
    INTO v_intent
    FROM (SELECT flags->>'intent' AS intent, count(*) n
            FROM wa_ai_suggestions
           WHERE organization_id = p_org AND created_at >= v_since
             AND NULLIF(flags->>'intent', '') IS NOT NULL
             AND COALESCE(flags->>'test', 'false') <> 'true'
           GROUP BY 1 ORDER BY n DESC LIMIT 8) i;

  -- 5. Tiempo de primera respuesta: primer entrante del período → primer
  --    saliente posterior, en los últimos 500 chats con actividad.
  WITH convs AS (
    SELECT id FROM wa_conversations
     WHERE organization_id = p_org AND last_message_at >= v_since
     ORDER BY last_message_at DESC LIMIT 500),
  firsts AS (
    SELECT c.id, i.ts AS in_ts, o.ts AS out_ts
      FROM convs c
      JOIN LATERAL (SELECT ts FROM wa_messages m
                     WHERE m.conversation_id = c.id AND m.direction = 'in' AND m.ts >= v_since
                     ORDER BY m.ts ASC LIMIT 1) i ON true
      LEFT JOIN LATERAL (SELECT ts FROM wa_messages m
                     WHERE m.conversation_id = c.id AND m.direction = 'out' AND m.ts > i.ts
                     ORDER BY m.ts ASC LIMIT 1) o ON true)
  SELECT jsonb_build_object(
           'measured',  count(*),
           'answered',  count(out_ts),
           'median_minutes', round((percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (out_ts - in_ts)) / 60.0))::numeric, 1),
           'p90_minutes',    round((percentile_cont(0.9) WITHIN GROUP (ORDER BY extract(epoch FROM (out_ts - in_ts)) / 60.0))::numeric, 1),
           'within_1h', count(*) FILTER (WHERE out_ts IS NOT NULL AND out_ts - in_ts <= interval '1 hour'))
    INTO v_resp
    FROM firsts;

  -- 6. Base de conocimientos: con qué cuenta Yendy hoy.
  SELECT jsonb_build_object(
           'entries',            (SELECT count(*) FROM wa_kb_entries WHERE organization_id = p_org AND is_active),
           'cases',              (SELECT count(*) FROM wa_kb_cases WHERE organization_id = p_org AND is_active),
           'candidates_pending', (SELECT count(*) FROM wa_kb_case_candidates WHERE organization_id = p_org AND status = 'pending'),
           'gaps_open',          (SELECT count(*) FROM wa_kb_gaps WHERE organization_id = p_org AND status = 'open'))
    INTO v_kb;

  -- 7. Serie semanal (hasta 13 semanas): chats nuevos, citas, sugerencias.
  --    Una pasada por tabla agrupando por semana (subconsultas por semana
  --    disparaban el JIT: 300 ms solo en compilar).
  v_week0 := date_trunc('week', GREATEST(v_since, now() - interval '13 weeks'));
  WITH weeks AS (
    SELECT w FROM generate_series(v_week0, date_trunc('week', now()), interval '7 days') w),
  conv AS (
    SELECT date_trunc('week', created_at) wk, count(*) n FROM wa_conversations
     WHERE organization_id = p_org AND created_at >= v_week0 GROUP BY 1),
  sch AS (
    SELECT date_trunc('week', outcome_at) wk, count(*) n FROM wa_conversations
     WHERE organization_id = p_org AND outcome_at >= v_week0 GROUP BY 1),
  sug AS (
    SELECT date_trunc('week', created_at) wk, count(*) n FROM wa_ai_suggestions
     WHERE organization_id = p_org AND created_at >= v_week0
       AND COALESCE(flags->>'test', 'false') <> 'true' GROUP BY 1)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'week',          to_char(weeks.w, 'YYYY-MM-DD'),
           'conversations', COALESCE(conv.n, 0),
           'scheduled',     COALESCE(sch.n, 0),
           'suggestions',   COALESCE(sug.n, 0)) ORDER BY weeks.w), '[]'::jsonb)
    INTO v_weekly
    FROM weeks
    LEFT JOIN conv ON conv.wk = weeks.w
    LEFT JOIN sch  ON sch.wk  = weeks.w
    LEFT JOIN sug  ON sug.wk  = weeks.w;

  RETURN jsonb_build_object(
    'period_days',   v_days,
    'since',         v_since,
    'conversations', v_conv,
    'ai_vs_human',   v_ai,
    'suggestions',   v_sugg,
    'by_model',      v_models,
    'intents',       v_intent,
    'response',      v_resp,
    'kb',            v_kb,
    'weekly',        v_weekly);
END;
$$;

REVOKE ALL ON FUNCTION wa_inbox_metrics(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wa_inbox_metrics(uuid, integer) TO authenticated, service_role;

COMMENT ON FUNCTION wa_inbox_metrics(uuid, integer) IS
  'Mig 280: panel de medición de Conversaciones (solo admin). Cuentas y tiempos; nunca texto de mensajes.';
