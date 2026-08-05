-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 182: cimientos de "Seguimientos core" (Fase 1)
--
-- Los seguimientos dejan de ser una función del addon de fertilidad y
-- pasan a ser capacidad de plataforma para TODAS las orgs, sin
-- configuración obligatoria. Ver docs/research/seguimientos-genericos-core.md
-- (sección "Fase 1").
--
-- Esta migración solo pone los cimientos de datos. Todos los defaults
-- reproducen EXACTAMENTE el comportamiento actual: una org sin
-- `services.followup_after_days` y sin la categoría centinela en uso no
-- observa ningún cambio. Vitra y la Dra. Patricia (pilotos activos) no
-- tienen ni una fila tocada.
--
--   1. `clinical_followups.doctor_id` deja de ser NOT NULL — bloqueaba
--      seguimientos sin médico asignado (sesión perdida, administrativos).
--   2. `services.followup_after_days` — default de control por servicio.
--      NULL = sin default (comportamiento actual exacto).
--   3. Categoría canónica centinela `core.next_visit` — "cualquier
--      próxima cita cuenta como cierre". No requiere mapeo de servicios;
--      la consume el trigger de atribución de la mig 183.
--   4. Trigger de sincronización entre las DOS generaciones de estado de
--      `clinical_followups` (`is_resolved` de mig 053 vs `status` de mig
--      128). Al destapar la bandeja para todas las orgs, las dos
--      superficies (historia clínica y bandeja) coexisten y la
--      divergencia se vuelve bug visible.
--
-- Aditiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. clinical_followups.doctor_id nullable ──────────────────────
-- Un seguimiento core puede no tener médico responsable (la cita la
-- atiende recepción, la sesión perdida no tiene doctor asignado, etc.).
-- El guard evita el error si la migración se re-aplica.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clinical_followups'
      AND column_name = 'doctor_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE clinical_followups ALTER COLUMN doctor_id DROP NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN clinical_followups.doctor_id IS
  'Médico responsable del seguimiento. NULL permitido desde mig 182: los seguimientos core pueden no tener médico (atención por recepción, orígenes administrativos).';

-- ── 2. services.followup_after_days ───────────────────────────────
-- Default de control sugerido por servicio. NULL = el servicio no
-- genera seguimiento automático (comportamiento actual de TODAS las
-- filas existentes, incluidas las de los pilotos).
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS followup_after_days INTEGER;

-- Rango razonable: al menos 1 día (0 no tendría sentido — el control
-- sería el mismo día de la cita) y como máximo un año.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'services'::regclass
      AND conname = 'services_followup_after_days_check'
  ) THEN
    ALTER TABLE services
      ADD CONSTRAINT services_followup_after_days_check
      CHECK (
        followup_after_days IS NULL
        OR (followup_after_days > 0 AND followup_after_days <= 365)
      );
  END IF;
END $$;

COMMENT ON COLUMN services.followup_after_days IS
  'Días sugeridos para el control posterior a una cita de este servicio. Al completar la cita se crea un clinical_followups con rule_key=''core.service_followup''. NULL = sin seguimiento automático (default).';

-- ── 3. Categoría canónica centinela ───────────────────────────────
-- `category_key` es UNIQUE global, de ahí el namespace obligatorio.
-- `addon_key='core'` deja explícito que es plataforma y no un vertical:
-- ninguna org necesita una fila en organization_addons para usarla, y
-- ningún mapeo de servicios apunta a ella (el trigger de la mig 183 la
-- resuelve como segunda pasada, sin mapeo).
--
-- sort_order 1000 para no colisionar con el catálogo de fertilidad
-- (10..140, mig 130) ni con futuros verticales.
--
-- DO NOTHING: si la fila ya existe se respeta lo que haya (podría
-- haberla editado el founder); esta migración no pisa datos.
INSERT INTO addon_canonical_categories
  (addon_key, category_key, display_name, description, sort_order)
VALUES
  ('core', 'core.next_visit', 'Próxima cita',
   'Categoría centinela de plataforma: cualquier cita futura del paciente cierra el seguimiento. No requiere mapeo de servicios.',
   1000)
ON CONFLICT (category_key) DO NOTHING;

-- ── 4. Sincronización is_resolved ↔ status ────────────────────────
-- `clinical_followups` arrastra dos generaciones de estado:
--   - `is_resolved`/`resolved_at` (mig 053) — lo que escribe el semáforo
--     de historia clínica.
--   - `status`/`closed_at` (mig 128) — lo que filtra la bandeja central
--     y lo que cierra el trigger de atribución.
-- Mientras las superficies no coexistían la divergencia era invisible.
-- Con la bandeja abierta a todas las orgs, un seguimiento resuelto solo
-- por una de las dos vías seguiría apareciendo (o desapareciendo) en la
-- otra. Este trigger las mantiene alineadas.
--
-- Regla clave para CERO regresión: solo actúa cuando UNA de las dos
-- generaciones cambió y la otra no. Todos los writes actuales que
-- cierran un seguimiento (trigger de atribución mig 129/183, /advance,
-- /close-manual, /close-no-response, /reactivate, los endpoints de
-- presupuestos y el cron pausado) mandan AMBAS, así que para ellos el
-- trigger es un no-op puro y no pisa nada.
--
-- SECURITY INVOKER: no eleva privilegios, confía en RLS.
CREATE OR REPLACE FUNCTION sync_followup_state_generations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_status_changed   BOOLEAN := NEW.status IS DISTINCT FROM OLD.status;
  v_resolved_changed BOOLEAN := NEW.is_resolved IS DISTINCT FROM OLD.is_resolved;
BEGIN
  IF v_status_changed AND NOT v_resolved_changed THEN
    IF NEW.status IN (
      'agendado_via_contacto',
      'agendado_organico_dentro_ventana',
      'desistido_silencioso',
      'vencido',
      'cerrado_manual'
    ) THEN
      NEW.is_resolved := true;
      NEW.resolved_at := COALESCE(NEW.closed_at, now());
    ELSIF NEW.status IN ('pendiente', 'contactado', 'pospuesto') THEN
      NEW.is_resolved := false;
      NEW.resolved_at := NULL;
    END IF;

  ELSIF v_resolved_changed AND NOT v_status_changed THEN
    IF NEW.is_resolved IS TRUE THEN
      -- Resuelto desde el semáforo de historia clínica sin pasar por la
      -- bandeja: el cierre genérico es 'cerrado_manual'.
      NEW.status := 'cerrado_manual';
      NEW.closed_at := COALESCE(NEW.closed_at, NEW.resolved_at, now());
    ELSE
      NEW.status := 'pendiente';
      NEW.closed_at := NULL;
      NEW.closure_reason := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION sync_followup_state_generations() IS
  'Mantiene alineadas las dos generaciones de estado de clinical_followups (is_resolved/resolved_at de mig 053 vs status/closed_at de mig 128). Solo actúa si UNA cambió y la otra no, para no pisar los writes que ya mandan ambas.';

DROP TRIGGER IF EXISTS trg_clinical_followups_state_sync ON clinical_followups;
CREATE TRIGGER trg_clinical_followups_state_sync
  BEFORE UPDATE ON clinical_followups
  FOR EACH ROW
  EXECUTE FUNCTION sync_followup_state_generations();

-- Índice para el guard de duplicados de la ruta core (un solo
-- seguimiento `core.service_followup` abierto por cita completada).
CREATE INDEX IF NOT EXISTS idx_clinical_followups_core_rule_appointment
  ON clinical_followups(organization_id, appointment_id, rule_key)
  WHERE appointment_id IS NOT NULL AND rule_key IS NOT NULL;
