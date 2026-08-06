-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 192: notificaciones en vivo por rol — fan-out por usuario
--
-- ── El problema que cierra ────────────────────────────────────────
-- La campanita (mig 062) nació como broadcast: TODOS los call-sites
-- insertan `user_id = NULL`, que la policy de SELECT interpreta como
-- "visible para toda la org". Eso arrastra tres defectos:
--
--   a) Ruido — el doctor ve los pagos, recepción ve las citas de todos.
--   b) `is_read` es una columna de UNA fila compartida: si el owner
--      marca leída la notificación, se marca para toda la clínica.
--   c) Hueco de RLS — la policy de INSERT de 062 deja que CUALQUIER
--      miembro autenticado inserte notificaciones arbitrarias en su org
--      (el nombre "Service role can insert" es engañoso: el `TO
--      authenticated` la abre a todo el equipo).
--
-- La solución es una sola: dejar de emitir filas broadcast y emitir N
-- filas con `user_id` concreto. Con una fila por destinatario, `is_read`
-- pasa a ser correcto SIN código extra, y el ruido se resuelve eligiendo
-- a quién se le crea fila.
--
-- ── Qué añade ─────────────────────────────────────────────────────
-- 1. Índice (user_id, created_at DESC) — la consulta de la campanita
--    pasa de filtrar por org a filtrar por usuario.
-- 2. RPC `notify_org_members(...)` SECURITY DEFINER: el ÚNICO camino
--    de escritura. Resuelve destinatarios y hace el fan-out.
-- 3. Policies endurecidas: INSERT directo cerrado, SELECT/UPDATE
--    acotados a las filas propias (+ compat legacy).
--
-- ── Reparto de responsabilidades TS ↔ SQL ─────────────────────────
-- El CATÁLOGO de eventos vive en TypeScript
-- (`lib/live-notifications/catalog.ts`): clave, etiqueta, audiencias
-- elegibles y audiencias por defecto. Así se añaden eventos sin migrar.
-- El RPC recibe esos defaults en `p_default_audiences` y es dueño de:
--   · leer el override de la org (`organizations.settings`),
--   · expandir audiencias → user_ids reales,
--   · autorizar al caller,
--   · limitar el fan-out.
-- O sea: TS decide QUÉ eventos existen, SQL decide QUIÉN los recibe.
-- La config nunca viaja desde el cliente — sólo la clave del evento y
-- los defaults del catálogo, que el RPC vuelve a acotar contra la org.
--
-- ── Audiencias (tokens) ───────────────────────────────────────────
--   owner_admin  role IN ('owner','admin')
--   doctor       role = 'doctor'. Si el evento declara alcance 'own'
--                (p_doctor_scope='own') SOLO se notifica al doctor
--                dueño de la cita (p_doctor_user_id), no a todos.
--   advisor      is_fertility_advisor = true (mig 137), sea cual sea
--                su rol — la asesora suele estar dada de alta como
--                'member'.
--   reception    role IN ('assistant','member') Y NO marcada como asesora.
--
-- Ese "Y NO" de `reception` es deliberado y hace las columnas DISJUNTAS.
-- Sin él, la asesora (que es 'member') entraría también por recepción y
-- la columna "Asesora" de la matriz sería decorativa: apagarla no le
-- quitaría nada. Con columnas disjuntas, marcar a alguien como asesora
-- la MUEVE de la columna "Recepción" a la columna "Asesora", y los
-- toggles hacen lo que dicen.
--
-- Consecuencia asumida: si una org marcase el flag de asesora sin tener
-- el addon de fertilidad (cuya UI es la única que lo enciende), esa
-- persona dejaría de recibir los avisos de recepción. Es la razón por la
-- que la matriz oculta la columna cuando el addon está apagado.
--
-- Aun así el UNIQUE(organization_id, user_id) de organization_members
-- garantiza que nadie reciba dos filas del mismo evento.
--
-- ── Override por organización (sparse) ────────────────────────────
--   organizations.settings = {
--     "live_notifications": {
--       "payment_registered": { "audiences": ["owner_admin"] }
--     }
--   }
-- Sólo se guardan las DESVIACIONES respecto del catálogo. Ausencia de
-- clave = usa los defaults. `"audiences": []` = evento apagado para
-- todo el mundo (por eso NO se puede usar COALESCE a secas: hay que
-- distinguir "no configurado" de "configurado a vacío").
--
-- ── Autorización del RPC ──────────────────────────────────────────
-- Los call-sites emiten desde el servidor por dos vías distintas, y el
-- RPC tiene que aceptar ambas:
--   · service role (booking público, portal del paciente): llega SIN
--     JWT de usuario, `auth.uid()` es NULL.
--   · usuario autenticado (route handler /api/live-notifications/emit):
--     `auth.uid()` es el miembro que disparó la acción.
-- Regla: si hay `auth.uid()`, DEBE ser miembro de la org; si no lo hay,
-- se confía en el rol de base de datos, y por eso se REVOCA EXECUTE a
-- `anon` — sin ese REVOKE la clave pública podría llamar al RPC sin JWT
-- y colarse por la rama "sin auth.uid()".
--
-- ── Compatibilidad con el histórico (user_id IS NULL) ─────────────
-- Las filas legacy siguen siendo visibles y marcables por toda la org:
-- la campanita no puede perder el histórico de un día para otro. Su
-- `is_read` sigue siendo compartido — es el defecto (b), y se acepta
-- que muera solo: `cleanup_old_notifications()` (mig 062) borra las
-- leídas a los 30 días, así que el legacy se extingue sin backfill.
-- No se hace backfill porque no hay forma de reconstruir a posteriori
-- a quién le tocaba cada notificación broadcast.
--
-- ── Nota sobre user_id ────────────────────────────────────────────
-- La columna YA existe desde 062 (declarada pero nunca escrita). El
-- ADD COLUMN IF NOT EXISTS queda como red de seguridad idempotente.
--
-- Aditiva e idempotente. Sin backfill.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS notifications_freeze_routing_trg ON notifications;
--   DROP FUNCTION IF EXISTS notifications_freeze_routing();
--   DROP FUNCTION IF EXISTS notify_org_members(UUID,TEXT,TEXT[],TEXT,TEXT,TEXT,TEXT,UUID,TEXT);
--   DROP INDEX IF EXISTS idx_notifications_user_created;
--   DROP POLICY IF EXISTS "notifications_select_own_or_legacy" ON notifications;
--   DROP POLICY IF EXISTS "notifications_update_own_or_legacy" ON notifications;
--   DROP POLICY IF EXISTS "notifications_delete_own_or_legacy_read" ON notifications;
--   -- y recrear las cuatro policies de 062_notifications.sql tal cual.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Columna + índice ────────────────────────────────────────────

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- La campanita ahora consulta "mis notificaciones, más recientes
-- primero". El índice de 062 empieza por organization_id y el de 103
-- por (organization_id, created_at): ninguno sirve para este acceso.
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications (user_id, created_at DESC);

COMMENT ON COLUMN notifications.user_id IS
  'Destinatario concreto. NULL = fila LEGACY (broadcast a toda la org, anterior a mig 192) — visible y marcable por cualquier miembro. Las filas nuevas SIEMPRE llevan user_id: las escribe notify_org_members().';

-- ─── 2. RPC de fan-out ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_org_members(
  p_organization_id   UUID,
  p_event_key         TEXT,
  p_default_audiences TEXT[],
  p_type              TEXT,
  p_title             TEXT,
  p_body              TEXT DEFAULT '',
  p_action_url        TEXT DEFAULT NULL,
  p_doctor_user_id    UUID DEFAULT NULL,
  p_doctor_scope      TEXT DEFAULT 'all'
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
         AND (
              ('owner_admin' = ANY(v_audiences) AND om.role IN ('owner', 'admin'))
           OR ('doctor'      = ANY(v_audiences) AND om.role = 'doctor'
                AND (
                  p_doctor_scope IS DISTINCT FROM 'own'
                  OR (p_doctor_user_id IS NOT NULL AND om.user_id = p_doctor_user_id)
                ))
           OR ('advisor'     = ANY(v_audiences) AND om.is_fertility_advisor)
           -- Disjunto respecto de 'advisor': ver la nota de la cabecera.
           OR ('reception'   = ANY(v_audiences) AND om.role IN ('assistant', 'member')
                AND NOT om.is_fertility_advisor)
         )
       ORDER BY prio, om.user_id
       LIMIT 10
    ) r;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

COMMENT ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT) IS
  'Único camino de escritura de `notifications`. Resuelve destinatarios (audiencias del catálogo TS + override en organizations.settings->live_notifications) e inserta una fila por usuario, máximo 10. p_doctor_scope=''own'' restringe la audiencia "doctor" al dueño de la cita (p_doctor_user_id). Devuelve el número de filas creadas.';

-- El REVOKE a anon es parte de la autorización, no higiene: sin él, la
-- clave pública podría llamar al RPC sin JWT y saltarse el control de
-- membresía por la rama "auth.uid() IS NULL".
REVOKE ALL ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION notify_org_members(UUID, TEXT, TEXT[], TEXT, TEXT, TEXT, TEXT, UUID, TEXT) TO service_role;

-- ─── 3. Policies endurecidas ────────────────────────────────────────
--
-- Se sustituyen las cuatro de 062. Los nombres cambian a un prefijo
-- estable para que este bloque sea reejecutable sin arrastrar la
-- versión antigua.

DROP POLICY IF EXISTS "Users can view own org notifications"   ON notifications;
DROP POLICY IF EXISTS "Users can update own notifications"     ON notifications;
DROP POLICY IF EXISTS "Service role can insert notifications"  ON notifications;
DROP POLICY IF EXISTS "Users can delete own read notifications" ON notifications;

DROP POLICY IF EXISTS "notifications_select_own_or_legacy"      ON notifications;
DROP POLICY IF EXISTS "notifications_update_own_or_legacy"      ON notifications;
DROP POLICY IF EXISTS "notifications_delete_own_or_legacy_read" ON notifications;

-- SELECT: mis filas + el histórico broadcast de mi org.
CREATE POLICY "notifications_select_own_or_legacy"
  ON notifications FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    )
  );

-- UPDATE (marcar leída): mis filas + legacy. El WITH CHECK repite la
-- condición para que un UPDATE no pueda reasignar la fila a otro
-- usuario ni sacarla de su organización.
CREATE POLICY "notifications_update_own_or_legacy"
  ON notifications FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND organization_id IN (
        SELECT om.organization_id FROM organization_members om
        WHERE om.user_id = auth.uid()
      )
    )
  );

-- DELETE: sólo lo ya leído, propio o legacy.
CREATE POLICY "notifications_delete_own_or_legacy_read"
  ON notifications FOR DELETE TO authenticated
  USING (
    is_read = true
    AND (
      user_id = auth.uid()
      OR (
        user_id IS NULL
        AND organization_id IN (
          SELECT om.organization_id FROM organization_members om
          WHERE om.user_id = auth.uid()
        )
      )
    )
  );

-- SIN policy de INSERT para `authenticated`: con RLS activo y ninguna
-- policy permisiva, el INSERT directo desde el cliente queda cerrado.
-- Escriben únicamente notify_org_members() (SECURITY DEFINER, corre como
-- owner de la función) y el service role (bypassa RLS). Ese es el cierre
-- del defecto (c).

-- ─── 4. El UPDATE sólo puede tocar is_read ──────────────────────────
--
-- Las policies por sí solas dejan un hueco pequeño pero real: la rama
-- legacy del USING acepta la fila vieja (user_id IS NULL) y la rama
-- "propia" del WITH CHECK acepta la fila nueva (user_id = auth.uid()),
-- así que un miembro puede APROPIARSE de una notificación broadcast y
-- esconderla del resto del equipo. Una policy no puede impedirlo porque
-- no ve OLD y NEW a la vez; un trigger sí.
--
-- No es escalada de privilegios (esa fila ya la veía, y seguir sin poder
-- crear ninguna), pero el enrutado no es asunto del cliente: lo único
-- que la campanita necesita escribir es `is_read`.
--
-- Sólo aplica a usuarios reales. El service role y el propio RPC
-- (auth.uid() IS NULL) quedan fuera, para no atar futuras tareas de
-- mantenimiento.

CREATE OR REPLACE FUNCTION notifications_freeze_routing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id         IS DISTINCT FROM OLD.user_id
  OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
  OR NEW.type            IS DISTINCT FROM OLD.type
  OR NEW.title           IS DISTINCT FROM OLD.title
  OR NEW.body            IS DISTINCT FROM OLD.body
  OR NEW.action_url      IS DISTINCT FROM OLD.action_url
  OR NEW.created_at      IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'notifications: sólo se puede modificar is_read'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_freeze_routing_trg ON notifications;
CREATE TRIGGER notifications_freeze_routing_trg
  BEFORE UPDATE ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION notifications_freeze_routing();
