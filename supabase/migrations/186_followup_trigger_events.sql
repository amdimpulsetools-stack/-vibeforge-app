-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 186: vocabulario de `followup_rules.trigger_event` (Fase 2a)
--
-- Ver docs/research/seguimientos-genericos-core.md §5 ("Diferibles":
-- «CHECK de trigger_event (Fase 2, solo al añadir eventos; corregir de
-- paso el abuso de mig 142)»).
--
-- Dos cosas, en este orden:
--
--   1. Abrir el CHECK de mig 127 (cerrado a 3 valores) para admitir los
--      eventos que la Fase 2 introduce.
--   2. Corregir el abuso documentado de la mig 142.
--
-- Aditiva e idempotente. El paso 1 solo AÑADE valores permitidos: toda
-- fila existente sigue siendo válida bajo el CHECK nuevo, así que no hay
-- riesgo de que el ALTER falle por datos.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. CHECK ampliado ─────────────────────────────────────────────
-- Valores previos (mig 127):
--   'appointment_completed'  — en uso (lib/fertility/followup-triggers.ts)
--   'treatment_plan_created' — en uso (regla fertility.budget_pending_acceptance)
--   'plan_status_changed'    — declarado, nunca implementado como
--                              GENERADOR. La mig 188 implementa la
--                              semántica de CIERRE por estado de plan
--                              como trigger de DB, no como regla, así
--                              que el valor se conserva pero sigue sin
--                              filas que lo usen.
--
-- Valores nuevos:
--   'appointment_no_show'      — cita marcada no_show.
--   'treatment_session_missed' — sesión de plan perdida (mig 187 la
--                                implementa como trigger de DB; el valor
--                                queda disponible para cuando el motor
--                                de reglas la modele por org).
--   'budget_accepted'          — presupuesto aceptado. Es el evento que
--                                la regla de mig 142 SIEMPRE quiso decir.
--
-- DROP IF EXISTS + ADD: idempotente y re-aplicable.
ALTER TABLE followup_rules
  DROP CONSTRAINT IF EXISTS followup_rules_trigger_event_check;

ALTER TABLE followup_rules
  ADD CONSTRAINT followup_rules_trigger_event_check
  CHECK (trigger_event IN (
    'appointment_completed',
    'treatment_plan_created',
    'plan_status_changed',
    'appointment_no_show',
    'treatment_session_missed',
    'budget_accepted'
  ));

COMMENT ON CONSTRAINT followup_rules_trigger_event_check ON followup_rules IS
  'Vocabulario de eventos disparadores (mig 127, ampliado en mig 186 con appointment_no_show / treatment_session_missed / budget_accepted).';

-- ── 2. Corrección del abuso de mig 142 ────────────────────────────
--
-- La mig 142 sembró `fertility.budget_accepted_pending_start` con
-- `trigger_event='treatment_plan_created'` y lo dejó documentado como
-- workaround explícito en su propia cabecera:
--
--   «We use `treatment_plan_created` as the trigger event (closest
--    semantic to "downstream of an existing rule"), even though the cron
--    itself is what creates the followup; trigger_event is an enum
--    constraint and any of the 3 allowed values keeps the row valid.»
--
-- Es decir: se eligió un valor falso porque el CHECK no ofrecía el
-- verdadero. Ahora sí lo ofrece.
--
-- ─── AUDITORÍA DE CONSUMIDORES (hecha antes de tocar la fila) ───
-- Se rastreó TODO el código que lee `followup_rules` para comprobar que
-- nadie selecciona esta regla por `trigger_event`:
--
--   · app/api/cron/fertility-followup-contact/route.ts:580-586
--       (bloque "Phase 5 prep") → filtra
--       `.eq("rule_key", "fertility.budget_accepted_pending_start")`.
--       NO menciona trigger_event. No se ve afectado.
--   · app/api/budgets/[id]/start/route.ts:167-177 → cierra el
--       seguimiento filtrando por `rule_key`. NO menciona trigger_event.
--   · lib/fertility/followup-triggers.ts:181-186 → filtra
--       `.eq("trigger_event", "appointment_completed")`. Con
--       'treatment_plan_created' ya NO matcheaba esta regla, y con
--       'budget_accepted' tampoco. Comportamiento idéntico.
--   · lib/fertility/followup-triggers.ts:51-56
--       (maybeCreateBudgetPendingFollowup) → filtra por
--       `rule_key='fertility.budget_pending_acceptance'`, que es OTRA
--       regla (la global de mig 130) y NO se toca aquí.
--   · lib/fertility/seed-fertility-addon.ts:81-99 → clona reglas
--       GLOBALES (`organization_id IS NULL`). La regla de mig 142 es
--       exclusivamente per-org (mig 142:84-103 inserta por cada org con
--       addon, sin fila global), así que el clonado no la ve.
--   · app/(dashboard)/scheduler/follow-ups/followup-card.tsx:1009 →
--       ordena el stepper por prefijo de `rule_key`. Sin trigger_event.
--
-- Conclusión: CERO consumidores filtran esta regla por `trigger_event`.
-- El UPDATE es seguro y no requiere cambios de código acompañantes.
-- (En TypeScript sí se amplía la unión `FollowupRuleRow['trigger_event']`
-- de types/fertility.ts, que es un tipo de lectura, no un filtro.)
--
-- El UPDATE es per-org por construcción: alcanza TODAS las filas con ese
-- rule_key, una por cada org que tenga el addon (mig 142 sembró una por
-- org). El `AND trigger_event <> 'budget_accepted'` lo hace idempotente
-- y además evita reescribir el valor si un admin ya lo corrigió a mano.
UPDATE followup_rules
SET trigger_event = 'budget_accepted'
WHERE rule_key = 'fertility.budget_accepted_pending_start'
  AND trigger_event IS DISTINCT FROM 'budget_accepted';

-- Nota de no-regresión: esta regla NO es un generador reactivo — nada
-- escucha su `trigger_event`. Quien la ejecuta es el cron de
-- app/api/cron/fertility-followup-contact (bloque Phase 5), que la
-- localiza por `rule_key` y usa sus `delay_days` / `max_attempts` /
-- `is_active`. Ninguno de esos tres campos se toca aquí, así que el cron
-- (hoy pausado deliberadamente, y también cuando se reactive) se
-- comporta exactamente igual antes y después de esta migración.
