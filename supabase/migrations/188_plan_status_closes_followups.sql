-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 188: el estado del plan cierra sus seguimientos (Fase 2a)
--
-- Ver docs/research/seguimientos-genericos-core.md §4: «Habilita: plan
-- cancelled/completed → cerrar sus seguimientos con
-- closure_reason='plan_cerrado' (lo que `plan_status_changed` prometía
-- y nunca se implementó)».
--
-- ── El bug que cierra ─────────────────────────────────────────────
-- Un plan de tratamiento que se cancela (el paciente desistió) o se
-- completa (ya no hay nada que perseguir) dejaba sus seguimientos
-- abiertos para siempre: nadie los cerraba, nadie sabía de qué plan
-- venían, y la bandeja acumulaba trabajo que ya no existe. Con el par
-- polimórfico de la mig 184 el vínculo por fin se puede consultar, y
-- este trigger lo usa.
--
-- ── Alcance: SOLO HACIA ADELANTE (limitación conocida) ────────────
-- Los seguimientos creados ANTES de la mig 184 no llevan
-- `source_type='treatment_plan'` y el backfill de esa migración NO
-- pudo inventárselo: la referencia al plan nunca se guardó en ninguna
-- parte, así que no hay forma de reconstruir de qué plan nació cada
-- seguimiento viejo. Este trigger no los alcanza. Se limpian a mano
-- desde la bandeja (cierre manual), como hasta ahora.
-- A partir de la Fase 2a los puntos de creación sí escriben el origen
-- (app/api/treatment-plans/route.ts → ('treatment_plan', plan_id)), y
-- las sesiones perdidas de la mig 187 escriben
-- ('treatment_session', session_id).
--
-- ── SECURITY INVOKER (mismo análisis que la mig 187) ──────────────
-- Quien cambia el estado del plan pasó la política UPDATE de
-- `treatment_plans` (mig 053:32-33), predicado
-- `organization_id IN (SELECT get_user_org_ids())`. La política UPDATE
-- de `clinical_followups` (mig 053:161-162) es exactamente el mismo
-- predicado sobre la misma org, y la SELECT de `treatment_sessions`
-- (mig 053:57-58) también. → INVOKER basta; DEFINER solo añadiría un
-- camino de escritura cross-tenant sin beneficio.
--
-- ── Nunca bloquea el cambio de estado del plan ────────────────────
-- `EXCEPTION WHEN OTHERS` → WARNING. Cancelar un plan es la operación
-- importante. Patrón de mig 129/183/187.
--
-- ── CERO regresión ────────────────────────────────────────────────
-- No hay ninguna org (piloto ni nueva) con seguimientos que lleven
-- `source_type IN ('treatment_plan','treatment_session')` en el momento
-- de aplicar esta migración — la mig 184 no puede producirlos y los
-- puntos de creación que los escriben son de este mismo lote. El
-- trigger arranca, por construcción, sin nada que cerrar.
--
-- Aditiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION close_followups_on_plan_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE clinical_followups cf
  SET status         = 'cerrado_manual',
      closure_reason = 'plan_' || NEW.status,
      closed_at      = now(),
      is_resolved    = true,
      resolved_at    = now()
  WHERE cf.organization_id = NEW.organization_id      -- defense-in-depth
    AND cf.status IN ('pendiente', 'contactado', 'pospuesto')
    AND (
      -- Seguimientos nacidos del plan mismo.
      (cf.source_type = 'treatment_plan' AND cf.source_id = NEW.id)
      OR
      -- Seguimientos nacidos de una sesión de ese plan (mig 187).
      (cf.source_type = 'treatment_session'
       AND cf.source_id IN (
         SELECT ts.id FROM treatment_sessions ts
         WHERE ts.treatment_plan_id = NEW.id
       ))
    );

  -- Nota sobre el trigger de sincronización de estados (mig 182): este
  -- UPDATE manda LAS DOS generaciones a la vez (status + closed_at e
  -- is_resolved + resolved_at), así que
  -- `sync_followup_state_generations()` ve ambas cambiadas y es un
  -- no-op puro — no pisa el closure_reason que acabamos de escribir.
  --
  -- `closure_reason = 'plan_cancelled' | 'plan_completed'` — se
  -- construye desde NEW.status en vez de hardcodearlo para que la
  -- bandeja pueda distinguir «el paciente desistió» de «ya terminó su
  -- tratamiento», que operativamente no son lo mismo.

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'close_followups_on_plan_status_change failed for plan=% org=% status=%: % / %',
      NEW.id, NEW.organization_id, NEW.status, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION close_followups_on_plan_status_change() IS
  'Cierra (status=cerrado_manual, closure_reason=plan_<estado>) los clinical_followups abiertos cuyo origen polimórfico (mig 184) es un treatment_plan que pasa a cancelled/completed, o una treatment_session de ese plan. Solo alcanza seguimientos creados a partir de la Fase 2a: los anteriores no tienen source_type. SECURITY INVOKER.';

-- La transición se filtra en el WHEN: solo entra al plpgsql cuando el
-- estado REALMENTE cambió a uno terminal. Un UPDATE de notas o de
-- fechas sobre un plan ya cancelado no vuelve a disparar el cierre.
DROP TRIGGER IF EXISTS trg_treatment_plans_close_followups ON treatment_plans;
CREATE TRIGGER trg_treatment_plans_close_followups
  AFTER UPDATE ON treatment_plans
  FOR EACH ROW
  WHEN (NEW.status IN ('cancelled', 'completed')
        AND OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION close_followups_on_plan_status_change();
