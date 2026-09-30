-- Aplicada en producción el 30-sep-2026 (apply_migration; verificada: 5 columnas
-- en appointments, 3 en patient_payments, 5 triggers, 6 funciones, 3 índices,
-- RPC con EXECUTE para authenticated y sin anon).
--
-- ═══════════════════════════════════════════════════════════════════
-- 273: Cita cancelada "Por reprogramar" → una tarjeta por cita en la
--      bandeja de seguimientos, cierre automático al reagendar y
--      traslado del adelanto a la cita nueva.
--
-- Caso real (Vitra, 11-sep-2026): recepción cancela dos citas de la misma
-- paciente (Ecografía y Consulta) y todavía no hay fecha nueva. Las citas
-- canceladas desaparecen de la agenda y la paciente se pierde: no había
-- dónde "dejarla" para no olvidar reprogramarla. Y en la Dra. Patricia
-- (cita 201407ec, 28-ago) el adelanto de S/100 quedó colgado en la cita
-- cancelada mientras la nueva se cobraba completa: get_patient_summary
-- daba facturado 400 / pagado 500, con S/100 que nadie sabía explicar.
--
-- Esta migración REEMPLAZA a la primera versión de la 273 (que nunca se
-- aplicó): `appointments.reschedule_pending` desaparece del diseño.
--
-- ── Qué agrega ────────────────────────────────────────────────────
--   appointments
--     · cancel_outcome  'reprogramar' | 'no_vuelve' | 'error_registro':
--       lo elige recepción al cancelar. Solo 'reprogramar' crea tarjeta.
--     · cancel_money    'a_cuenta' | 'penalidad' | 'devuelto': qué pasó
--       con lo pagado. Penalidad y devuelto NO se trasladan nunca.
--     · cancelled_at / cancelled_by: los estampa la base al entrar a
--       'cancelled' (now(), auth.uid()); se limpian (junto con
--       cancel_outcome/cancel_money) al salir de 'cancelled'.
--     · rescheduled_from_id: la cita nueva apunta a la cancelada que la
--       originó (modo reprogramar de la agenda).
--   patient_payments
--     · transferred_from_appointment_id / transferred_at / transferred_by:
--       rastro del traslado de un adelanto.
--
-- ── Decisiones del fundador (cerradas) ────────────────────────────
--   1. UNA tarjeta POR CITA cancelada (source_id = la cita). Dos citas
--      canceladas de la misma paciente son dos tarjetas: cada una se
--      cierra con SU cita nueva. UNIQUE parcial por source_id.
--   2. Si al cancelar la paciente YA tiene una cita futura viva del mismo
--      servicio (o una cita que ya apunta a esta con rescheduled_from_id),
--      no se crea la tarjeta: no hay nada que reprogramar.
--   3. Se cierra sola cuando (a) se agenda una cita con
--      rescheduled_from_id = la cancelada (aunque cambie el servicio), o
--      (b) la paciente saca una cita viva del MISMO servicio con fecha
--      >= hoy civil de la org. Una cita de otro servicio sin vínculo, una
--      cita retroactiva (fecha pasada) o de otra org NO la cierran.
--      Abiertas → closure_reason 'reprogramada'. Las que ya estaban en
--      "Sin respuesta" (desistido_silencioso/vencido, ≤ 60 días) salen de
--      ahí como 'reprogramada_tarde'. Reactivar la MISMA cita cancelada
--      cierra solo su tarjeta ('reactivada').
--   4. El adelanto pasa a la cita nueva solo con el RPC
--      appointment_transfer_payments (lo llama el modo reprogramar o el
--      botón "Aplicar a esta cita"); nunca un trigger.
--
-- ── Por qué cerrado_manual y no agendado_* ────────────────────────
-- Los estados agendado_* alimentan los KPIs de recuperación (tasa,
-- revenue atribuido × LTV del addon de fertilidad). Reprogramar una cita
-- cancelada no es "recuperar" a una paciente perdida: no debe inflar esos
-- números. Por lo mismo target_category_canonical queda NULL y la pasada
-- centinela de compute_appointment_attribution (mig 183) no la toca.
--
-- ── Por qué follow_up_date y appointment_id van NULL ─────────────
-- get_doctor_dashboard_enhanced / get_doctor_personal_stats y el widget
-- legacy de seguimientos cuentan por follow_up_date / appointment_id.
-- Una cita cancelada por recepción no es un seguimiento clínico vencido
-- del médico: con ambos NULL la tarjeta queda fuera de su inicio SIN
-- tocar esas RPCs. El vínculo con la cita vive en source_id
-- (source_type 'appointment'); la fecha, en expected_by (hoy civil de la
-- org + 2 días, a mediodía en la zona de la org — nunca UTC).
--
-- ── SECURITY INVOKER (triggers y RPC), mismo análisis que mig 187 ─
-- Políticas reales verificadas en producción (pg_policies, 29-sep-2026):
--   appointments       UPDATE/INSERT: organization_id IN get_user_org_ids()
--   clinical_followups INSERT/UPDATE: organization_id IN get_user_org_ids()
--   patient_payments   UPDATE:        organization_id IN get_user_org_ids()
--   einvoices          UPDATE:        organization_id IN get_user_org_ids()
-- Quien puede cancelar/agendar la cita (cualquier miembro, recepción
-- incluida) puede por construcción crear/cerrar la tarjeta y mover los
-- pagos de esa misma org. DEFINER abriría un camino cross-tenant a cambio
-- de nada. La reserva online (app/api/book) usa service role: bypassa RLS
-- y el cierre funciona igual.
-- Única excepción, de SOLO LECTURA: appointment_has_cash_refund() es
-- DEFINER porque la RLS de cash_movements solo deja ver a recepción los
-- movimientos de SU turno; una devolución hecha en la caja de otra
-- persona sería invisible y el adelanto ya devuelto se trasladaría.
-- Chequea membresía y devuelve un booleano; no escribe nada.
--
-- ── Los triggers NUNCA bloquean la cita ───────────────────────────
-- EXCEPTION WHEN OTHERS → RAISE WARNING y RETURN NEW. Cancelar y agendar
-- son la operación importante; la tarjeta es un efecto secundario.
-- trg_clinical_followups_state_sync (sync_followup_state_generations) no
-- interfiere: al cerrar se cambian status E is_resolved a la vez.
-- Orden de triggers en appointments (Postgres ordena por nombre):
--   BEFORE: set_updated_at_appointments, trg_appointments_attribution,
--           trg_appointments_cancel_stamp (nuevo),
--           trg_compute_appointment_insurance.
--   AFTER:  refresh_recurring_*, trg_appointments_reschedule_* (nuevos).
-- Ninguno depende de las columnas nuevas.
--
-- ── Dinero: no se reescribe ninguna fórmula ───────────────────────
-- El RPC de traslado solo cambia patient_payments.appointment_id (más el
-- rastro transferred_* y la nota). Monto, fecha, medio, turno y autor
-- quedan intactos: Caja, Ingresos y "Mis cobros" no cambian, y
-- caja_protect_closed_shift lo permite aun con el turno cerrado.
-- Mueve filas ENTERAS (partir un pago cambiaría amount, que un turno
-- cerrado bloquea); el excedente queda como saldo a favor.
-- Solo plata clínica de la cita: COALESCE(source,'clinical')='clinical',
-- treatment_id NULL, treatment_plan_id NULL (un cobro vive en UN solo
-- contenedor, migs 242-245). Nunca penalidad ni devuelto; nada si la
-- cita tiene una devolución en Caja. get_patient_summary /
-- lib/patient-debt.ts dan los mismos totales antes y después.
-- Reportes: la cita sigue contando como cancelada.
--
-- Aditiva e idempotente. Genérica: vale para toda org.
-- Rollback: rollbacks/273_appointment_reschedule_pending_rollback.sql
-- Pruebas: runuser -u postgres -- bash supabase/tests/agenda/run.sh
-- ═══════════════════════════════════════════════════════════════════

-- ── 0. Columnas ────────────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS cancel_outcome text,
  ADD COLUMN IF NOT EXISTS cancel_money text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES appointments(id) ON DELETE SET NULL;

-- transferred_from_appointment_id va SIN foreign key (incidente 30-sep-2026):
-- una segunda FK patient_payments → appointments vuelve AMBIGUOS para
-- PostgREST todos los embeds `patient_payments(...)` desde appointments (y
-- `appointments(...)` desde patient_payments). La agenda pide
-- `patient_payments(amount)` → error PGRST201 → la grilla quedaba vacía.
-- Es solo rastro del traslado; la integridad la garantiza el RPC.
ALTER TABLE patient_payments
  ADD COLUMN IF NOT EXISTS transferred_from_appointment_id uuid,
  ADD COLUMN IF NOT EXISTS transferred_at timestamptz,
  ADD COLUMN IF NOT EXISTS transferred_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE patient_payments
  DROP CONSTRAINT IF EXISTS patient_payments_transferred_from_appointment_id_fkey;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'appointments_cancel_outcome_check'
                    AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_cancel_outcome_check
      CHECK (cancel_outcome IS NULL OR cancel_outcome IN ('reprogramar', 'no_vuelve', 'error_registro'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'appointments_cancel_money_check'
                    AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_cancel_money_check
      CHECK (cancel_money IS NULL OR cancel_money IN ('a_cuenta', 'penalidad', 'devuelto'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'appointments_rescheduled_from_not_self'
                    AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_rescheduled_from_not_self
      CHECK (rescheduled_from_id IS NULL OR rescheduled_from_id <> id);
  END IF;
END $$;

COMMENT ON COLUMN appointments.cancel_outcome IS
  'Mig 273: qué dijo recepción al cancelar. reprogramar = crea tarjeta core.reschedule_pending; no_vuelve / error_registro = no. Se limpia al salir de cancelled.';
COMMENT ON COLUMN appointments.cancel_money IS
  'Mig 273: qué pasó con lo pagado al cancelar. Solo a_cuenta (o NULL) es trasladable con appointment_transfer_payments.';
COMMENT ON COLUMN appointments.cancelled_at IS
  'Mig 273: cuándo entró a cancelled (lo estampa trg_appointments_cancel_stamp).';
COMMENT ON COLUMN appointments.cancelled_by IS
  'Mig 273: quién la canceló (auth.uid() al entrar a cancelled).';
COMMENT ON COLUMN appointments.rescheduled_from_id IS
  'Mig 273: cita cancelada que esta cita reprograma. Cierra su tarjeta core.reschedule_pending aunque cambie el servicio.';
COMMENT ON COLUMN patient_payments.transferred_from_appointment_id IS
  'Mig 273: cita cancelada de la que se trasladó este pago (appointment_transfer_payments). Monto/fecha/turno intactos.';

-- La cita hija se busca por su madre (sidebar: "Reprogramada al …").
CREATE INDEX IF NOT EXISTS idx_appointments_rescheduled_from
  ON appointments (rescheduled_from_id)
  WHERE rescheduled_from_id IS NOT NULL;

-- ── 1. Índices de la tarjeta ───────────────────────────────────────
-- La primera versión creaba un índice NO único por (org, paciente) con
-- este mismo nombre; se recrea igual (burbuja y cierre por paciente).
CREATE INDEX IF NOT EXISTS idx_clinical_followups_reschedule_open
  ON clinical_followups (organization_id, patient_id)
  WHERE rule_key = 'core.reschedule_pending'
    AND status IN ('pendiente', 'contactado', 'pospuesto');

-- Una tarjeta abierta por cita cancelada. Si dos cancelaciones corren a
-- la vez, la segunda choca aquí (ON CONFLICT DO NOTHING en el trigger).
CREATE UNIQUE INDEX IF NOT EXISTS uq_clinical_followups_reschedule_open_source
  ON clinical_followups (source_id)
  WHERE rule_key = 'core.reschedule_pending'
    AND status IN ('pendiente', 'contactado', 'pospuesto');

-- ── 2. "Hoy" civil de la org ───────────────────────────────────────
-- Vercel y Postgres corren en UTC: a las 20:00 de Lima ya es "mañana" en
-- UTC. Toda fecha de negocio sale de organizations.timezone (CLAUDE.md).
CREATE OR REPLACE FUNCTION reschedule_org_today(p_org uuid)
RETURNS date
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT (now() AT TIME ZONE COALESCE(
            (SELECT NULLIF(btrim(o.timezone), '') FROM organizations o WHERE o.id = p_org),
            'America/Lima'))::date
$$;

COMMENT ON FUNCTION reschedule_org_today(uuid) IS
  'Mig 273: fecha civil de hoy en la zona de la org (default America/Lima).';

-- ── 3. Estampa de cancelación (BEFORE) ─────────────────────────────
CREATE OR REPLACE FUNCTION appointments_cancel_stamp()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Cita creada ya cancelada (importaciones): se estampa igual.
    IF NEW.status = 'cancelled' THEN
      NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
      NEW.cancelled_by := COALESCE(NEW.cancelled_by, auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_at := now();
    NEW.cancelled_by := auth.uid();
  ELSIF OLD.status = 'cancelled' AND NEW.status IS DISTINCT FROM 'cancelled' THEN
    -- Reactivada (o corregida a no_show): ya no es una cancelación.
    NEW.cancelled_at   := NULL;
    NEW.cancelled_by   := NULL;
    NEW.cancel_outcome := NULL;
    NEW.cancel_money   := NULL;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'appointments_cancel_stamp failed for appointment=%: % / %',
      NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_cancel_stamp ON appointments;
CREATE TRIGGER trg_appointments_cancel_stamp
  BEFORE INSERT OR UPDATE OF status ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION appointments_cancel_stamp();

-- ── 4. Cancelada + "Reprogramará" → tarjeta (AFTER UPDATE) ─────────
CREATE OR REPLACE FUNCTION create_reschedule_pending_followup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tz      TEXT;
  v_today   DATE;
  v_service TEXT;
  v_doctor  TEXT;
  v_reason  TEXT;
BEGIN
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(o.timezone), ''), 'America/Lima') INTO v_tz
    FROM organizations o WHERE o.id = NEW.organization_id;
  v_tz    := COALESCE(v_tz, 'America/Lima');
  v_today := (now() AT TIME ZONE v_tz)::date;

  -- Ya tiene cita futura viva del mismo servicio (o una cita que ya
  -- reprograma a esta): no hay nada que reprogramar.
  IF EXISTS (
    SELECT 1 FROM appointments a
     WHERE a.organization_id = NEW.organization_id
       AND a.patient_id = NEW.patient_id
       AND a.id <> NEW.id
       AND a.status IN ('scheduled', 'confirmed', 'completed')
       AND a.appointment_date >= v_today
       AND (a.service_id = NEW.service_id OR a.rescheduled_from_id = NEW.id)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT s.name INTO v_service FROM services s WHERE s.id = NEW.service_id;
  SELECT d.full_name INTO v_doctor FROM doctors d WHERE d.id = NEW.doctor_id;

  -- "Cita del 12/10 10:30 · Ecografía · Dra. Pérez cancelada — pendiente de reprogramar"
  v_reason := 'Cita del ' || to_char(NEW.appointment_date, 'DD/MM')
    || COALESCE(' ' || to_char(NEW.start_time, 'HH24:MI'), '')
    || COALESCE(' · ' || NULLIF(btrim(v_service), ''), '')
    || COALESCE(' · ' || NULLIF(btrim(v_doctor), ''), '')
    || ' cancelada — pendiente de reprogramar';

  INSERT INTO clinical_followups (
    organization_id, patient_id, doctor_id,
    appointment_id, follow_up_date,
    priority, reason, source, source_type, source_id, rule_key,
    expected_by, status, max_attempts, contact_events
  ) VALUES (
    NEW.organization_id, NEW.patient_id, NEW.doctor_id,
    NULL, NULL,  -- a propósito: fuera del inicio del médico (ver encabezado)
    'yellow', v_reason, 'system', 'appointment', NEW.id, 'core.reschedule_pending',
    ((v_today + 2)::timestamp + time '12:00') AT TIME ZONE v_tz,
    'pendiente', 99,
    jsonb_build_array(jsonb_build_object(
      'type', 'created_from_cancel',
      'at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'by_user_id', auth.uid()
    ))
  )
  ON CONFLICT (source_id)
    WHERE rule_key = 'core.reschedule_pending'
      AND status IN ('pendiente', 'contactado', 'pospuesto')
  DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'create_reschedule_pending_followup failed for appointment=%: % / %',
      NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_reschedule_pending ON appointments;
CREATE TRIGGER trg_appointments_reschedule_pending
  AFTER UPDATE ON appointments
  FOR EACH ROW
  WHEN (
    NEW.status = 'cancelled' AND NEW.cancel_outcome = 'reprogramar'
    AND (OLD.status IS DISTINCT FROM 'cancelled'
         OR OLD.cancel_outcome IS DISTINCT FROM 'reprogramar')
  )
  EXECUTE FUNCTION create_reschedule_pending_followup();

-- ── 5. Cierre automático (AFTER INSERT / UPDATE) ──────────────────
-- TG_ARGV[0]:
--   'new'        cita viva nueva (o que gana rescheduled_from_id): cierra
--                la tarjeta de su cita madre y las del mismo servicio.
--   'reactivate' la misma cita cancelada/no_show vuelve a estar viva:
--                cierra SOLO la tarjeta con source_id = NEW.id.
CREATE OR REPLACE FUNCTION close_reschedule_pending_followups()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_at TEXT := to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
  IF NEW.patient_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_ARGV[0] = 'reactivate' THEN
    UPDATE clinical_followups cf
       SET status         = 'cerrado_manual',
           closure_reason = 'reactivada',
           closed_at      = now(),
           is_resolved    = true,
           resolved_at    = now(),
           updated_at     = now(),
           contact_events = COALESCE(cf.contact_events, '[]'::jsonb) || jsonb_build_array(
             jsonb_build_object('type', 'reactivada', 'at', v_at,
                                'appointment_id', NEW.id, 'by_user_id', auth.uid()))
     WHERE cf.organization_id = NEW.organization_id
       AND cf.rule_key = 'core.reschedule_pending'
       AND cf.source_id = NEW.id
       AND cf.status IN ('pendiente', 'contactado', 'pospuesto');
    RETURN NEW;
  END IF;

  -- Una cita retroactiva (registrada con fecha pasada) no es reprogramar.
  IF NEW.appointment_date < reschedule_org_today(NEW.organization_id) THEN
    RETURN NEW;
  END IF;

  UPDATE clinical_followups cf
     SET status         = 'cerrado_manual',
         closure_reason = CASE WHEN cf.status IN ('pendiente', 'contactado', 'pospuesto')
                               THEN 'reprogramada' ELSE 'reprogramada_tarde' END,
         closed_at      = now(),
         is_resolved    = true,
         resolved_at    = now(),
         updated_at     = now(),
         contact_events = COALESCE(cf.contact_events, '[]'::jsonb) || jsonb_build_array(
           jsonb_build_object('type', 'reprogramada', 'at', v_at,
                              'new_appointment_id', NEW.id, 'by_user_id', auth.uid()))
   WHERE cf.organization_id = NEW.organization_id
     AND cf.patient_id = NEW.patient_id
     AND cf.rule_key = 'core.reschedule_pending'
     AND cf.source_id IS DISTINCT FROM NEW.id
     AND (
           cf.status IN ('pendiente', 'contactado', 'pospuesto')
        OR (cf.status IN ('desistido_silencioso', 'vencido')
            AND COALESCE(cf.closed_at, cf.resolved_at, cf.updated_at) >= now() - interval '60 days')
     )
     AND (
           cf.source_id = NEW.rescheduled_from_id
        OR EXISTS (SELECT 1 FROM appointments o
                    WHERE o.id = cf.source_id
                      AND o.service_id = NEW.service_id)
     );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'close_reschedule_pending_followups(%) failed for appointment=%: % / %',
      TG_ARGV[0], NEW.id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_insert ON appointments;
CREATE TRIGGER trg_appointments_reschedule_close_insert
  AFTER INSERT ON appointments
  FOR EACH ROW
  WHEN (NEW.patient_id IS NOT NULL AND NEW.status IN ('scheduled', 'confirmed', 'completed'))
  EXECUTE FUNCTION close_reschedule_pending_followups('new');

-- Si el formulario guarda primero y enlaza después (UPDATE del vínculo).
DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_link ON appointments;
CREATE TRIGGER trg_appointments_reschedule_close_link
  AFTER UPDATE OF rescheduled_from_id ON appointments
  FOR EACH ROW
  WHEN (
    NEW.patient_id IS NOT NULL
    AND NEW.rescheduled_from_id IS NOT NULL
    AND NEW.rescheduled_from_id IS DISTINCT FROM OLD.rescheduled_from_id
    AND NEW.status IN ('scheduled', 'confirmed', 'completed')
  )
  EXECUTE FUNCTION close_reschedule_pending_followups('new');

DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_reactivate ON appointments;
CREATE TRIGGER trg_appointments_reschedule_close_reactivate
  AFTER UPDATE ON appointments
  FOR EACH ROW
  WHEN (
    NEW.patient_id IS NOT NULL
    AND OLD.status IN ('cancelled', 'no_show')
    AND NEW.status IN ('scheduled', 'confirmed', 'completed')
  )
  EXECUTE FUNCTION close_reschedule_pending_followups('reactivate');

-- ── 6. ¿La cita tuvo devolución en Caja? (solo lectura, DEFINER) ───
-- appointment_cancel_refund (mig 230/233) registra la devolución como
-- cash_movements 'devolucion' ligado al ÚLTIMO pago de la cita, aunque
-- devuelva más que ese pago. Por eso, si hay cualquier devolución en la
-- cita, el traslado no mueve NADA (no hay forma segura de saber qué
-- parte quedó a cuenta). DEFINER solo para ver movimientos de otros
-- turnos; exige membresía en la org de la cita.
CREATE OR REPLACE FUNCTION appointment_has_cash_refund(p_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM appointments a
      JOIN patient_payments pp ON pp.appointment_id = a.id
      JOIN cash_movements cm   ON cm.payment_id = pp.id
     WHERE a.id = p_appointment_id
       AND a.organization_id IN (SELECT get_user_org_ids())
       AND cm.organization_id = a.organization_id
       AND cm.movement_type = 'devolucion'
  )
$$;

REVOKE ALL ON FUNCTION appointment_has_cash_refund(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION appointment_has_cash_refund(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION appointment_has_cash_refund(uuid) TO authenticated, service_role;

-- ── 7. RPC: trasladar el adelanto a la cita nueva ─────────────────
CREATE OR REPLACE FUNCTION appointment_transfer_payments(
  p_from_appointment_id uuid,
  p_to_appointment_id   uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from    appointments%ROWTYPE;
  v_to      appointments%ROWTYPE;
  v_tz      TEXT;
  v_count   INT     := 0;
  v_amount  NUMERIC := 0;
  v_einv    INT     := 0;
  v_moved_einv uuid[] := '{}';
  v_amt_txt TEXT;
  v_from_lbl TEXT;
  v_to_lbl   TEXT;
  v_when     TEXT;
BEGIN
  IF p_from_appointment_id IS NULL OR p_to_appointment_id IS NULL
     OR p_from_appointment_id = p_to_appointment_id THEN
    RAISE EXCEPTION 'Elige una cita de origen y una de destino distintas.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- FOR UPDATE: dos clics seguidos no trasladan dos veces.
  SELECT * INTO v_from FROM appointments WHERE id = p_from_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita de origen no encontrada.' USING ERRCODE = 'no_data_found';
  END IF;
  SELECT * INTO v_to FROM appointments WHERE id = p_to_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita de destino no encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_from.organization_id <> v_to.organization_id
     OR v_from.patient_id IS NULL OR v_to.patient_id IS NULL
     OR v_from.patient_id <> v_to.patient_id THEN
    RAISE EXCEPTION 'Las citas no son de la misma paciente.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_from.status <> 'cancelled' THEN
    RAISE EXCEPTION 'La cita de origen no está cancelada.' USING ERRCODE = 'check_violation';
  END IF;
  IF v_from.cancel_money IN ('penalidad', 'devuelto') THEN
    RAISE EXCEPTION 'Lo pagado en la cita cancelada no quedó a cuenta (penalidad o devuelto).'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_to.status NOT IN ('scheduled', 'confirmed', 'completed') THEN
    RAISE EXCEPTION 'La cita de destino no está activa.' USING ERRCODE = 'check_violation';
  END IF;

  -- Devolución en Caja sobre la cita: no se mueve nada (ver §6).
  IF COALESCE(appointment_has_cash_refund(p_from_appointment_id), false) THEN
    RETURN json_build_object('moved_count', 0, 'amount', 0, 'einvoices_moved', 0,
                             'skipped', 'devolucion');
  END IF;

  v_from_lbl := to_char(v_from.appointment_date, 'DD/MM') || COALESCE(' ' || to_char(v_from.start_time, 'HH24:MI'), '');
  v_to_lbl   := to_char(v_to.appointment_date, 'DD/MM')   || COALESCE(' ' || to_char(v_to.start_time, 'HH24:MI'), '');

  -- Filas ENTERAS; solo cambia la cita (y el rastro). Monto, fecha,
  -- medio, turno y autor quedan como se cobraron.
  WITH moved AS (
    UPDATE patient_payments pp
       SET appointment_id                  = p_to_appointment_id,
           transferred_from_appointment_id = p_from_appointment_id,
           transferred_at                  = now(),
           transferred_by                  = auth.uid(),
           notes = COALESCE(NULLIF(btrim(pp.notes), '') || ' · ', '')
                   || '[Adelanto trasladado]: desde la cita del ' || v_from_lbl
     WHERE pp.appointment_id = p_from_appointment_id
       AND pp.organization_id = v_from.organization_id
       AND COALESCE(pp.source, 'clinical') = 'clinical'
       AND pp.treatment_id IS NULL
       AND pp.treatment_plan_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM cash_movements cm
                        WHERE cm.payment_id = pp.id AND cm.movement_type = 'devolucion')
    RETURNING pp.amount
  )
  SELECT count(*), COALESCE(sum(amount), 0) INTO v_count, v_amount FROM moved;

  IF v_count = 0 THEN
    RETURN json_build_object('moved_count', 0, 'amount', 0, 'einvoices_moved', 0);
  END IF;

  -- La boleta viaja solo si es el mismo servicio (con otro servicio el
  -- comprobante ya no describe la cita: nota de crédito + boleta nueva).
  -- Nunca un comprobante de una venta de farmacia.
  IF v_from.service_id = v_to.service_id THEN
    WITH m AS (
      UPDATE einvoices e
         SET appointment_id = p_to_appointment_id
       WHERE e.appointment_id = p_from_appointment_id
         AND e.organization_id = v_from.organization_id
         AND NOT EXISTS (SELECT 1 FROM patient_payments pp
                          WHERE pp.einvoice_id = e.id
                            AND COALESCE(pp.source, 'clinical') <> 'clinical')
      RETURNING e.id
    )
    SELECT count(*), COALESCE(array_agg(id), '{}') INTO v_einv, v_moved_einv FROM m;
  END IF;

  SELECT COALESCE(NULLIF(btrim(o.timezone), ''), 'America/Lima') INTO v_tz
    FROM organizations o WHERE o.id = v_from.organization_id;
  v_when    := to_char(now() AT TIME ZONE COALESCE(v_tz, 'America/Lima'), 'DD/MM/YYYY HH24:MI');
  v_amt_txt := 'S/' || trim(to_char(v_amount, 'FM999999990.00'));

  -- Rastro en ambas citas (mismo formato que "[Devolución]" de la 233).
  -- appointments.einvoice_id es solo el puntero histórico al último
  -- comprobante: acompaña a la boleta si viajó.
  UPDATE appointments
     SET notes = COALESCE(notes || E'\n', '') || '[Adelanto trasladado]: ' || v_amt_txt
                 || ' a la cita del ' || v_to_lbl
                 || CASE WHEN v_einv > 0 THEN ' (con su comprobante)' ELSE '' END
                 || ' — ' || v_when,
         einvoice_id = CASE WHEN einvoice_id = ANY (v_moved_einv) THEN NULL ELSE einvoice_id END
   WHERE id = p_from_appointment_id;

  UPDATE appointments
     SET notes = COALESCE(notes || E'\n', '') || '[Adelanto trasladado]: ' || v_amt_txt
                 || ' desde la cita cancelada del ' || v_from_lbl
                 || CASE WHEN v_einv > 0 THEN ' (con su comprobante)' ELSE '' END
                 || ' — ' || v_when,
         einvoice_id = CASE WHEN einvoice_id IS NULL AND v_from.einvoice_id = ANY (v_moved_einv)
                            THEN v_from.einvoice_id ELSE einvoice_id END
   WHERE id = p_to_appointment_id;

  RETURN json_build_object('moved_count', v_count, 'amount', v_amount, 'einvoices_moved', v_einv);
END;
$$;

REVOKE ALL ON FUNCTION appointment_transfer_payments(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION appointment_transfer_payments(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION appointment_transfer_payments(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION appointments_cancel_stamp() IS
  'Mig 273: estampa cancelled_at/by al entrar a cancelled; limpia cancelled_*/cancel_outcome/cancel_money al salir. Nunca bloquea.';
COMMENT ON FUNCTION create_reschedule_pending_followup() IS
  'Mig 273: cita cancelada con cancel_outcome=reprogramar → una tarjeta core.reschedule_pending POR CITA (source_id), salvo que ya tenga cita futura viva del mismo servicio. INVOKER; nunca bloquea.';
COMMENT ON FUNCTION close_reschedule_pending_followups() IS
  'Mig 273: cierra tarjetas core.reschedule_pending por rescheduled_from_id o mismo servicio (cita viva >= hoy org), o la de la misma cita reactivada. INVOKER; nunca bloquea.';
COMMENT ON FUNCTION appointment_has_cash_refund(uuid) IS
  'Mig 273: ¿la cita tiene una devolución en Caja? Solo lectura, DEFINER para ver turnos ajenos; exige membresía.';
COMMENT ON FUNCTION appointment_transfer_payments(uuid, uuid) IS
  'Mig 273: traslada los pagos clínicos (filas enteras) de una cita cancelada a una cita viva de la misma paciente; la boleta viaja si es el mismo servicio. INVOKER (RLS del usuario). Idempotente.';
