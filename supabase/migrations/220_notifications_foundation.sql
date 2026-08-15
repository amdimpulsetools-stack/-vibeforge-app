-- ═══════════════════════════════════════════════════════════════════
-- MIGRACIÓN 220 — Fundación del sistema de avisos
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
--
-- ── (a) EL BUG QUE ESTA MIGRACIÓN CIERRA ──────────────────────────
--
-- NINGUNA RECEPCIONISTA HA RECIBIDO JAMÁS UNA NOTIFICACIÓN.
--
-- La mig 020 expandió los roles de organization_members a su forma
-- canónica: ('owner','admin','receptionist','doctor','member'). La mig
-- 192, al escribir el fan-out de la campanita, resolvió la audiencia
-- 'reception' como:
--
--     om.role IN ('assistant','member') AND NOT om.is_fertility_advisor
--
-- 'assistant' es un rol HEREDADO (pre-020, sigue vivo en filas
-- antiguas). 'receptionist' —el rol canónico, el que asigna la UI de
-- equipo desde hace meses, el único que una clínica nueva puede
-- elegir— NO ESTÁ EN LA LISTA. Consecuencia: toda persona dada de alta
-- como recepcionista queda fuera de la cláusula, no recibe fila, y su
-- campanita lleva vacía desde el día uno. La matriz de Settings enseña
-- la columna "Recepción" encendida por defecto en cuatro eventos —
-- decorativa por completo.
--
-- El error no salta a la vista porque `member` SÍ está: en las orgs
-- viejas (donde recepción era 'member') las notificaciones llegan, y
-- en las nuevas simplemente no llega nada, que es indistinguible de
-- "no ha pasado nada todavía". La mig 215 documenta la equivalencia
-- correcta de los tres roles al abrir caja; la 192 se la perdió.
--
-- Arreglo: la rama pasa a
--
--     om.role IN ('receptionist','assistant','member')
--       AND NOT om.is_fertility_advisor
--
-- El `AND NOT` se conserva íntegro: las columnas de la matriz siguen
-- siendo DISJUNTAS (ver la cabecera de la 192 — quien lleva el flag de
-- asesora se gobierna desde la columna "Asesora", no desde "Recepción").
--
-- ── (b) p_exclude_user_id ─────────────────────────────────────────
-- Nadie necesita una campanita que le anuncie lo que acaba de hacer.
-- Parámetro opcional al final de la firma: excluye un user_id del
-- fan-out. Lo usa caja_close_shift para no avisar al admin de su
-- propio cierre forzado.
--
-- ── (b') p_target_user_id ─────────────────────────────────────────
-- Hay avisos que no se dirigen a un ROL sino a una PERSONA concreta
-- por su papel en el hecho: "tu caja sigue abierta" es para quien la
-- abrió, sea owner o recepcionista. Con p_target_user_id NO NULL el
-- fan-out se reduce a ESE usuario (verificando que sea miembro) y las
-- audiencias/override se ignoran por completo — un aviso dirigido no
-- lo gobierna la matriz de roles, porque el destinatario no se elige
-- por su rol en la organización sino por su rol en el hecho.
--
-- ⚠️ POR QUÉ HAY UN DROP Y NO SOLO UN CREATE OR REPLACE
-- Añadir parámetros —aunque lleven DEFAULT— cambia la SIGNATURA, y en
-- PostgreSQL eso no reemplaza la función: crea una SEGUNDA. Las
-- llamadas existentes de 9 argumentos (lib/live-notifications/notify.ts)
-- casarían con las dos y fallarían con "function is not unique". Por eso
-- la vieja se elimina explícitamente antes de crear la nueva, y por eso
-- hay que reemitir los GRANT/REVOKE (se van con el DROP).
--
-- ── Qué más trae ──────────────────────────────────────────────────
--   (c) ops_notice_log — deduplicación de avisos periódicos.
--   (d) cash_settings  — umbral de aviso + tres interruptores.
--   (e) founder_settings — tres interruptores de módulos.
--   (f) caja_close_shift emite los avisos de control interno DESDE SQL.
--
-- Aditiva e idempotente. Sin backfill.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS notify_org_members(UUID,TEXT,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID,TEXT,UUID,UUID);
--   -- y recrear la versión de 9 parámetros de 192_live_notifications_fanout.sql tal cual.
--   DROP TABLE IF EXISTS ops_notice_log;
--   ALTER TABLE cash_settings
--     DROP COLUMN IF EXISTS difference_alert_threshold,
--     DROP COLUMN IF EXISTS notify_daily_exceptions,
--     DROP COLUMN IF EXISTS notify_weekly_digest,
--     DROP COLUMN IF EXISTS notify_stale_shift;
--   ALTER TABLE cash_settings ALTER COLUMN difference_tolerance SET DEFAULT 0;
--   ALTER TABLE founder_settings
--     DROP COLUMN IF EXISTS notify_module_activation,
--     DROP COLUMN IF EXISTS notify_module_deactivation,
--     DROP COLUMN IF EXISTS notify_module_adoption;
--   -- y recrear caja_close_shift de 215_caja_rpcs.sql tal cual.
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- (a)(b) notify_org_members — rol canónico + exclusión + dirigido
-- ═══════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION notify_org_members(
  p_organization_id   UUID,
  p_event_key         TEXT,
  p_default_audiences TEXT[],
  p_type              TEXT,
  p_title             TEXT,
  p_body              TEXT DEFAULT '',
  p_action_url        TEXT DEFAULT NULL,
  p_doctor_user_id    UUID DEFAULT NULL,
  p_doctor_scope      TEXT DEFAULT 'all',
  p_exclude_user_id   UUID DEFAULT NULL,
  p_target_user_id    UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_override   JSONB;
  v_audiences  TEXT[];
  v_inserted   INTEGER := 0;
BEGIN
  IF p_organization_id IS NULL OR p_event_key IS NULL OR p_title IS NULL THEN
    RAISE EXCEPTION 'notify_org_members: organization_id, event_key y title son obligatorios'
      USING ERRCODE = '22023';
  END IF;

  -- Autorización: si viene con JWT de usuario, tiene que ser miembro de
  -- la org. Sin JWT (service role) se confía en el GRANT — ver el REVOKE
  -- a anon más abajo.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'notify_org_members: el usuario no pertenece a la organización %', p_organization_id
      USING ERRCODE = '42501';
  END IF;

  -- ── Aviso DIRIGIDO ───────────────────────────────────────────────
  -- Atajo deliberado y anterior a toda resolución de audiencias: el
  -- destinatario no se elige por su rol en la organización sino por su
  -- papel en el hecho (quien abrió la caja, quien la dejó abierta). La
  -- matriz de Settings no lo gobierna porque la matriz habla de roles.
  -- Se sigue verificando la membresía: un aviso dirigido no puede
  -- escribirle a alguien de otra clínica.
  IF p_target_user_id IS NOT NULL THEN
    IF p_exclude_user_id IS NOT NULL AND p_target_user_id = p_exclude_user_id THEN
      RETURN 0;
    END IF;

    INSERT INTO notifications (organization_id, user_id, type, title, body, action_url)
    SELECT p_organization_id,
           om.user_id,
           COALESCE(p_type, 'info'),
           p_title,
           COALESCE(p_body, ''),
           p_action_url
      FROM organization_members om
     WHERE om.organization_id = p_organization_id
       AND om.user_id = p_target_user_id;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
  END IF;

  -- Config de la org. `->` devuelve NULL si falta cualquier eslabón, así
  -- que un settings vacío cae directo a los defaults del catálogo. Se
  -- comprueba el tipo para que un override corrupto no apague el evento
  -- en silencio.
  SELECT o.settings->'live_notifications'->p_event_key->'audiences'
    INTO v_override
    FROM organizations o
   WHERE o.id = p_organization_id;

  IF v_override IS NULL OR jsonb_typeof(v_override) <> 'array' THEN
    v_audiences := COALESCE(p_default_audiences, ARRAY[]::TEXT[]);
  ELSE
    SELECT COALESCE(array_agg(a.value), ARRAY[]::TEXT[])
      INTO v_audiences
      FROM jsonb_array_elements_text(v_override) AS a(value);
  END IF;

  -- Evento apagado para esta org: ni una fila.
  IF array_length(v_audiences, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- Fan-out. El LIMIT es un tope de seguridad: una clínica grande no
  -- debe convertir un clic en cientos de filas + cientos de mensajes
  -- Realtime. El ORDER BY hace el recorte DETERMINISTA y prioriza a
  -- quien más falta le hace (dirección primero).
  INSERT INTO notifications (organization_id, user_id, type, title, body, action_url)
  SELECT p_organization_id,
         r.user_id,
         COALESCE(p_type, 'info'),
         p_title,
         COALESCE(p_body, ''),
         p_action_url
    FROM (
      SELECT om.user_id,
             CASE
               WHEN om.role IN ('owner', 'admin') THEN 0
               WHEN om.role = 'doctor'            THEN 1
               ELSE 2
             END AS prio
        FROM organization_members om
       WHERE om.organization_id = p_organization_id
         -- Nadie necesita que le anuncien lo que acaba de hacer.
         AND (p_exclude_user_id IS NULL OR om.user_id <> p_exclude_user_id)
         AND (
              ('owner_admin' = ANY(v_audiences) AND om.role IN ('owner', 'admin'))
           OR ('doctor'      = ANY(v_audiences) AND om.role = 'doctor'
                AND (
                  p_doctor_scope IS DISTINCT FROM 'own'
                  OR (p_doctor_user_id IS NOT NULL AND om.user_id = p_doctor_user_id)
                ))
           OR ('advisor'     = ANY(v_audiences) AND om.is_fertility_advisor)
           -- 'receptionist' es el rol CANÓNICO desde la mig 020; su
           -- ausencia aquí (mig 192) dejó a toda recepción sin una sola
           -- notificación. 'assistant' y 'member' se conservan como
           -- recepción heredada, igual que hace caja_open_shift (215).
           -- Disjunto respecto de 'advisor': ver la nota de la cabecera.
           OR ('reception'   = ANY(v_audiences)
                AND om.role IN ('receptionist', 'assistant', 'member')
                AND NOT om.is_fertility_advisor)
         )
       ORDER BY prio, om.user_id
       LIMIT 10
    ) r;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) IS
  'Único camino de escritura de `notifications`. Resuelve destinatarios (audiencias del catálogo TS + override en organizations.settings->live_notifications) e inserta una fila por usuario, máximo 10. p_doctor_scope=''own'' restringe la audiencia "doctor" al dueño de la cita. p_exclude_user_id saca al actor de su propio aviso. p_target_user_id NO NULL convierte la llamada en un aviso DIRIGIDO a esa persona (audiencias ignoradas, membresía verificada). Devuelve el número de filas creadas. mig 220: la audiencia "reception" incluye por fin el rol canónico ''receptionist''.';

-- El REVOKE a anon es parte de la autorización, no higiene: sin él, la
-- clave pública podría llamar al RPC sin JWT y saltarse el control de
-- membresía por la rama "auth.uid() IS NULL". Se reemite porque el DROP
-- de arriba se llevó los privilegios de la versión anterior.
REVOKE ALL ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID, UUID) TO service_role;

-- ═══════════════════════════════════════════════════════════════════
-- (c) ops_notice_log — el antídoto contra el aviso repetido
-- ═══════════════════════════════════════════════════════════════════
--
-- Los avisos periódicos (crons) no son idempotentes por naturaleza: un
-- cron que corre dos veces —reintento de Vercel, redeploy, ejecución
-- manual— manda el correo dos veces. Y el aviso repetido no es un
-- inconveniente menor: es exactamente lo que enseña al dueño a ignorar
-- la bandeja donde le avisamos de que falta dinero.
--
-- Esta tabla es la constancia de "esto YA se avisó". Se escribe DESPUÉS
-- de enviar; el cron consulta antes.
--
-- Acceso: patrón de cron_runs (mig 204) — RLS habilitada y CERO
-- policies. Con PostgREST eso la deja inaccesible a cualquier usuario
-- autenticado; solo el service_role (que bypassa RLS) la lee y escribe.
-- No lleva policies "por si acaso" a propósito: no hay ninguna pantalla
-- que deba mostrar esto.

CREATE TABLE IF NOT EXISTS ops_notice_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Qué aviso. Mismo vocabulario que el catálogo TS cuando el aviso
  -- tiene evento de campanita ('cash_shift_stale'), o nombre propio
  -- cuando es solo correo ('caja_daily_exceptions', 'caja_weekly_digest').
  notice_key      text NOT NULL,

  -- Sobre QUÉ. text y no uuid porque la clave natural no siempre es una
  -- entidad: para el parte del día es la fecha ('2026-08-15'), para la
  -- semanal el año-semana ('2026-W33'), para un turno rezagado el
  -- shift_id + el día ('<uuid>:2026-08-15') — el mismo turno tiene que
  -- poder avisarse otra vez mañana.
  subject_id      text,

  sent_at         timestamptz NOT NULL DEFAULT now(),
  meta            jsonb
);

-- DECISIÓN — por qué un índice de expresión y no un UNIQUE de tabla:
-- en PostgreSQL, UNIQUE(a,b,c) NO impide dos filas con c IS NULL (NULL
-- nunca es igual a NULL). Con subject_id nullable, un aviso "de org, sin
-- sujeto" se podría duplicar infinitas veces — justo el caso que la
-- tabla existe para impedir. COALESCE(subject_id,'') colapsa NULL y ''
-- al mismo valor y el UNIQUE vuelve a significar lo que dice. La cadena
-- vacía no colisiona con ningún subject_id real: todos los que emitimos
-- son fechas, uuids o compuestos.
CREATE UNIQUE INDEX IF NOT EXISTS ops_notice_log_unique_key
  ON ops_notice_log (organization_id, notice_key, COALESCE(subject_id, ''));

CREATE INDEX IF NOT EXISTS idx_ops_notice_log_org_sent
  ON ops_notice_log (organization_id, sent_at DESC);

ALTER TABLE ops_notice_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ops_notice_log IS
  'Constancia de avisos periódicos ya emitidos (deduplicación de crons). Sin policies: solo service_role, patrón de cron_runs (mig 204).';
COMMENT ON COLUMN ops_notice_log.subject_id IS
  'Clave natural del aviso: fecha, año-semana, o "<uuid>:<fecha>". NULL y '''' son equivalentes — el UNIQUE va sobre COALESCE(subject_id,'''').';

-- ═══════════════════════════════════════════════════════════════════
-- (d) cash_settings — umbral de aviso y tres interruptores
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE cash_settings
  -- DOS UMBRALES DISTINTOS, y la distinción es el corazón del módulo:
  --
  --   difference_tolerance        (214) — por debajo, el cierre NO exige
  --       motivo escrito. Gobierna a QUIEN CIERRA.
  --   difference_alert_threshold  (aquí) — por debajo, al dueño NO se le
  --       avisa. Gobierna a QUIEN DIRIGE.
  --
  -- Sin el segundo, el dueño elige entre enterarse de todos los
  -- redondeos de S/ 0.50 o de ninguno; y una bandeja llena de ruido es
  -- una bandeja que no se lee el día que aparece el aviso que importa.
  -- S/ 20 como default: por encima de cualquier vuelto mal dado, muy
  -- por debajo de lo que a nadie le gustaría no saber.
  ADD COLUMN IF NOT EXISTS difference_alert_threshold numeric(12,2) NOT NULL DEFAULT 20.00,

  -- El parte del día: solo se envía si hubo algo que contar.
  ADD COLUMN IF NOT EXISTS notify_daily_exceptions boolean NOT NULL DEFAULT true,
  -- El resumen del lunes: llega cuadre o no cuadre.
  ADD COLUMN IF NOT EXISTS notify_weekly_digest    boolean NOT NULL DEFAULT true,
  -- Aviso de caja sin cerrar. Único interruptor del canal: apagarlo
  -- calla también la campanita dirigida a quien la dejó abierta.
  ADD COLUMN IF NOT EXISTS notify_stale_shift      boolean NOT NULL DEFAULT true;

DO $$ BEGIN
  ALTER TABLE cash_settings
    ADD CONSTRAINT cash_settings_alert_threshold_chk
    CHECK (difference_alert_threshold >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- La tolerancia por defecto era 0, que en la práctica significa "exige
-- un motivo escrito por cada céntimo": con 0, cualquier diferencia
-- —incluido el sencillo que faltó para un vuelto— bloquea el cierre
-- hasta que alguien escriba una frase. Eso no produce control, produce
-- motivos copiados y pegados que nadie lee. S/ 2.00 es el redondeo real
-- de un mostrador peruano.
--
-- SOLO PARA FILAS FUTURAS. Deliberadamente sin UPDATE de las
-- existentes: una org que ya configuró su tolerancia (aunque sea
-- dejándola en 0 a conciencia) no puede amanecer con otro criterio de
-- arqueo porque nosotros cambiamos de opinión. El default es una
-- sugerencia para quien llega, no una decisión sobre quien ya está.
ALTER TABLE cash_settings ALTER COLUMN difference_tolerance SET DEFAULT 2.00;

COMMENT ON COLUMN cash_settings.difference_alert_threshold IS
  'Diferencia (valor absoluto) a partir de la cual se AVISA a la dirección. Distinto de difference_tolerance, que solo decide si el cierre exige motivo escrito.';
COMMENT ON COLUMN cash_settings.notify_daily_exceptions IS
  'Parte del día por correo. Solo se envía si hubo excepciones: los días que todo cuadra no llega nada.';
COMMENT ON COLUMN cash_settings.notify_weekly_digest IS
  'Resumen semanal de caja por correo, los lunes.';
COMMENT ON COLUMN cash_settings.notify_stale_shift IS
  'Avisos de caja sin cerrar: campanita a quien la abrió y correo al dueño a partir del 2.º día. Apagarlo calla el canal entero.';

-- ═══════════════════════════════════════════════════════════════════
-- (e) founder_settings — interruptores de módulos
-- ═══════════════════════════════════════════════════════════════════
-- Los consume el ciclo de vida de módulos/addons. Viven aquí porque la
-- tabla es singleton y sin policies (mig 205): añadir columnas es la
-- forma barata; una tabla nueva por cada tres booleanos no lo es.

ALTER TABLE founder_settings
  ADD COLUMN IF NOT EXISTS notify_module_activation   boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_module_deactivation boolean NOT NULL DEFAULT true,
  -- Adopción: el aviso que dice "lo activaron y no lo están usando".
  ADD COLUMN IF NOT EXISTS notify_module_adoption     boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN founder_settings.notify_module_activation IS
  'Alerta al founder cuando una organización activa un módulo.';
COMMENT ON COLUMN founder_settings.notify_module_deactivation IS
  'Alerta al founder cuando una organización da de baja un módulo.';
COMMENT ON COLUMN founder_settings.notify_module_adoption IS
  'Alerta al founder con el informe de adopción de módulos (módulo activo sin uso real).';

-- ═══════════════════════════════════════════════════════════════════
-- (f) caja_close_shift — los avisos de control se emiten DESDE SQL
-- ═══════════════════════════════════════════════════════════════════
--
-- ⚠️ ESTO ES LO MÁS IMPORTANTE DE LA MIGRACIÓN, Y ES DELIBERADO.
--
-- Todos los demás avisos del sistema se emiten desde TypeScript, tras
-- la mutación. Estos dos NO PUEDEN. La razón es de diseño de control
-- interno, no de comodidad:
--
--   quien tiene un motivo para que el dueño no se entere del descuadre
--   es EXACTAMENTE la persona que controla el navegador desde el que
--   se cerraría la caja.
--
-- Un aviso emitido desde el cliente —o desde un route handler que el
-- cliente invoca en un segundo paso— se desactiva cerrando la pestaña,
-- cortando el wifi un segundo, o con un DevTools abierto. El cierre
-- quedaría hecho y el aviso no habría salido, sin rastro. Emitido
-- dentro de la MISMA TRANSACCIÓN que escribe el arqueo, la única forma
-- de que no salga el aviso es que no se cierre la caja.
--
-- La contrapartida se paga aquí mismo: cada PERFORM va envuelto en su
-- propio bloque BEGIN/EXCEPTION WHEN OTHERS THEN NULL. UN AVISO QUE
-- FALLA JAMÁS PUEDE TUMBAR EL CIERRE DE CAJA. Si notify_org_members
-- reventara (una org sin miembros, un JSON corrupto en settings, un
-- deadlock), la cajera vería un error al cerrar y se quedaría con el
-- cajón contado y el turno abierto. Prioridad absoluta: primero cerrar,
-- después avisar.
--
-- El resto de la función es la de la 215, íntegra: misma firma, mismas
-- validaciones, mismo FOR UPDATE, mismo cálculo de esperados y
-- congelado. Lo único añadido son los dos bloques del final.

CREATE OR REPLACE FUNCTION caja_close_shift(
  p_shift            uuid,
  p_counted_cash     numeric,
  p_counted_by_method jsonb DEFAULT NULL,
  p_notes            text  DEFAULT NULL,
  p_reason           text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  s            cash_shifts%ROWTYPE;
  v_admin      boolean;
  v_force      boolean;
  v_tol        numeric(12,2);
  v_by_tender  jsonb;
  v_by_method  jsonb;
  v_pay_count  integer;
  v_cash_pay   numeric(12,2);
  v_cash_mov   numeric(12,2);
  v_expected   numeric(12,2);
  v_diff       numeric(12,2);
  v_reason     text;
  -- Solo para los avisos del final.
  v_alert_tol  numeric(12,2);
  v_window     text;
  v_body       text;
BEGIN
  SELECT * INTO s FROM cash_shifts WHERE id = p_shift FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Turno de caja no encontrado.' USING ERRCODE = 'no_data_found';
  END IF;

  -- Dentro del lock: si el otro cierre ganó, aquí ya dice 'closed'.
  IF s.status <> 'open' THEN
    RAISE EXCEPTION 'Esta caja ya fue cerrada.' USING ERRCODE = 'check_violation';
  END IF;

  v_admin := is_org_admin(s.organization_id);
  IF NOT v_admin AND s.opened_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Solo quien abrió la caja o un administrador pueden cerrarla.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Cierre forzado: el admin cierra la caja de otro (se fue sin cerrar).
  -- No es un error, es un hecho que el historial debe mostrar.
  v_force := (s.opened_by IS DISTINCT FROM v_uid);

  IF p_counted_cash IS NULL OR p_counted_cash < 0 THEN
    RAISE EXCEPTION 'El efectivo contado no puede ser negativo.' USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_by_tender
    FROM (
      SELECT coalesce(tender_kind, 'otro') AS k, sum(amount)::numeric(12,2) AS v
        FROM patient_payments WHERE cash_shift_id = p_shift GROUP BY 1
    ) q;

  SELECT coalesce(jsonb_object_agg(k, v), '{}'::jsonb) INTO v_by_method
    FROM (
      SELECT coalesce(nullif(btrim(coalesce(payment_method, '')), ''), '(sin método)') AS k,
             sum(amount)::numeric(12,2) AS v
        FROM patient_payments WHERE cash_shift_id = p_shift GROUP BY 1
    ) q;

  SELECT count(*)::int,
         coalesce(sum(amount) FILTER (WHERE tender_kind = 'efectivo'), 0)::numeric(12,2)
    INTO v_pay_count, v_cash_pay
    FROM patient_payments WHERE cash_shift_id = p_shift;

  -- Los movimientos YA llevan signo: un solo SUM, sin CASE.
  SELECT coalesce(sum(amount) FILTER (WHERE tender_kind = 'efectivo'), 0)::numeric(12,2)
    INTO v_cash_mov
    FROM cash_movements WHERE shift_id = p_shift;

  v_expected := (s.opening_float + v_cash_pay + v_cash_mov)::numeric(12,2);
  v_diff     := (p_counted_cash - v_expected)::numeric(12,2);

  SELECT difference_tolerance, difference_alert_threshold
    INTO v_tol, v_alert_tol
    FROM cash_settings WHERE organization_id = s.organization_id;
  v_tol := coalesce(v_tol, 0);

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');

  IF abs(v_diff) > v_tol AND v_reason IS NULL THEN
    RAISE EXCEPTION
      'La diferencia de S/ % supera la tolerancia (S/ %). Escribe el motivo para poder cerrar.',
      to_char(v_diff, 'FM999999990.00'), to_char(v_tol, 'FM999999990.00')
      USING ERRCODE = 'check_violation';
  END IF;

  -- cash_shift_diff_reason_chk (mig 214) exige firma para CUALQUIER
  -- diferencia ≠ 0. Por debajo de la tolerancia el humano no tiene que
  -- explicar un redondeo de sencillo, así que la firma la pone el
  -- sistema y queda igual de auditable.
  IF v_diff <> 0 AND v_reason IS NULL THEN
    v_reason := 'Diferencia dentro de la tolerancia configurada (S/ '
                || to_char(v_tol, 'FM999999990.00') || ').';
  END IF;

  UPDATE cash_shifts
     SET status             = 'closed',
         closed_at          = now(),
         closed_by          = v_uid,
         force_closed       = v_force,
         counted_cash       = p_counted_cash,
         counted_by_method  = p_counted_by_method,
         expected_cash      = v_expected,
         expected_by_tender = v_by_tender,
         expected_by_method = v_by_method,
         payments_count     = v_pay_count,
         closing_notes      = nullif(btrim(coalesce(p_notes, '')), ''),
         difference_reason  = v_reason
   WHERE id = p_shift;

  -- ── AVISOS (mig 220) ──────────────────────────────────────────
  -- Después del UPDATE, antes del RETURN. Ver la nota larga de la
  -- cabecera de esta sección para el porqué de emitirlos desde aquí.
  --
  -- TONO: el sujeto de la frase es siempre EL TURNO, nunca la persona.
  -- "El turno de las 08:15 cerró con S/ 40 menos de lo esperado", no
  -- "a Ana le falta S/ 40". Faltante y sobrante se redactan idéntico:
  -- ambos son igual de informativos y ninguno es una acusación.

  v_window := to_char(s.opened_at AT TIME ZONE 'America/Lima', 'DD/MM HH24:MI')
              || '–' || to_char(now() AT TIME ZONE 'America/Lima', 'HH24:MI');

  -- 1. Diferencia por encima del umbral de aviso. Se compara contra el
  --    MAYOR de los dos umbrales: por debajo de la tolerancia no hay
  --    incidente, y por debajo del umbral de aviso el dueño pidió no
  --    enterarse.
  IF abs(v_diff) > GREATEST(v_tol, coalesce(v_alert_tol, v_tol)) THEN
    BEGIN
      v_body := 'El turno ' || v_window || ' cerró con S/ '
                || to_char(abs(v_diff), 'FM999999990.00')
                || CASE WHEN v_diff < 0 THEN ' menos' ELSE ' más' END
                || ' de lo esperado (esperado S/ '
                || to_char(v_expected, 'FM999999990.00')
                || ' · contado S/ ' || to_char(p_counted_cash, 'FM999999990.00') || ').'
                || CASE WHEN v_reason IS NOT NULL THEN ' Motivo: ' || v_reason ELSE '' END;

      PERFORM notify_org_members(
        p_organization_id   => s.organization_id,
        p_event_key         => 'cash_shift_difference',
        -- NUNCA recepción: un faltante en la campanita de todo el
        -- equipo es una humillación pública. Ver catalog.ts.
        p_default_audiences => ARRAY['owner_admin']::text[],
        p_type              => 'cash_difference',
        p_title             => 'Caja cerrada con diferencia',
        p_body              => v_body,
        p_action_url        => '/caja',
        p_doctor_user_id    => NULL,
        p_doctor_scope      => 'all',
        -- Si quien cerró es de la dirección, ya lo sabe: acaba de
        -- contar el dinero con el número delante.
        p_exclude_user_id   => v_uid
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- 2. Cierre forzado. Dos avisos distintos con dos textos distintos.
  IF v_force THEN
    -- 2a. A la dirección: es un hecho de control interno.
    BEGIN
      PERFORM notify_org_members(
        p_organization_id   => s.organization_id,
        p_event_key         => 'cash_shift_force_closed',
        p_default_audiences => ARRAY['owner_admin']::text[],
        p_type              => 'cash_difference',
        p_title             => 'Cierre forzado',
        p_body              => 'El turno ' || v_window
                               || ' lo cerró una persona distinta de quien lo abrió. Contado S/ '
                               || to_char(p_counted_cash, 'FM999999990.00')
                               || ' sobre S/ ' || to_char(v_expected, 'FM999999990.00') || ' esperados.',
        p_action_url        => '/caja',
        p_doctor_user_id    => NULL,
        p_doctor_scope      => 'all',
        p_exclude_user_id   => v_uid
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- 2b. A quien abrió el turno. Este aviso NO es opcional y NO lo
    --     gobierna la matriz de roles: alguien contó su dinero y firmó
    --     un arqueo con su nombre encima. Enterarse por el historial
    --     tres días después es peor que no enterarse.
    BEGIN
      PERFORM notify_org_members(
        p_organization_id   => s.organization_id,
        p_event_key         => 'cash_shift_force_closed',
        p_default_audiences => ARRAY[]::text[],
        p_type              => 'cash_difference',
        p_title             => 'Se cerró la caja que abriste',
        p_body              => 'El turno ' || v_window
                               || ' que abriste lo cerró otra persona. Esperado S/ '
                               || to_char(v_expected, 'FM999999990.00')
                               || ' · contado S/ ' || to_char(p_counted_cash, 'FM999999990.00')
                               || CASE WHEN v_diff <> 0
                                       THEN ' · diferencia S/ ' || to_char(v_diff, 'FM999999990.00')
                                       ELSE ' · cuadró exacto' END || '.',
        p_action_url        => '/caja',
        p_doctor_user_id    => NULL,
        p_doctor_scope      => 'all',
        p_exclude_user_id   => NULL,
        p_target_user_id    => s.opened_by
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'shift_id',           p_shift,
    'expected_cash',      v_expected,
    'counted_cash',       p_counted_cash,
    'difference_cash',    v_diff,
    'within_tolerance',   abs(v_diff) <= v_tol,
    'difference_tolerance', v_tol,
    'force_closed',       v_force,
    'payments_count',     v_pay_count,
    'expected_by_tender', v_by_tender,
    'expected_by_method', v_by_method,
    'difference_reason',  v_reason
  );
END $$;

REVOKE ALL ON FUNCTION caja_close_shift(uuid, numeric, jsonb, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION caja_close_shift(uuid, numeric, jsonb, text, text) TO authenticated;

COMMENT ON FUNCTION caja_close_shift(uuid, numeric, jsonb, text, text) IS
  'Caja F3: único punto de escritura del arqueo. FOR UPDATE + verificación de estado dentro del lock; congela esperado y exige motivo sobre la tolerancia. mig 220: emite los avisos de diferencia y cierre forzado DESDE AQUÍ (no desde el cliente, que es de quien hay que poder auditar), cada uno en su propio bloque de excepción para que un aviso caído nunca impida cerrar la caja.';
