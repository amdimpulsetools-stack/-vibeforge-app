-- Pendiente de aplicar en producción.
--
-- ═══════════════════════════════════════════════════════════════════
-- 274: Pre-reserva de horario (cita que separa el horario mientras la
--      paciente paga) + plantillas WhatsApp editables de "por
--      reprogramar" y de pre-reserva.
--
-- Caso real: recepción / obstetra separa un horario a una paciente que
-- escribió por WhatsApp mientras ella paga. Hasta hoy la cita se creaba
-- "normal" (salía el correo de confirmación y los recordatorios) o no se
-- creaba (y el horario se lo llevaba otra paciente o la reserva online).
--
-- ── Qué agrega ────────────────────────────────────────────────────
--   appointments
--     · hold_expires_at timestamptz NULL. NULL = cita normal (TODAS las
--       citas de hoy quedan igual). NOT NULL = pre-reserva: vigente si
--       > now(), vencida si <= now(). Es un INSTANTE absoluto (no una
--       fecha civil). La cita ocupa el horario como cualquier otra
--       (status scheduled/confirmed): choques y reserva online la ven.
--       En v1 NO se libera sola al vencer: la agenda la pinta roja y
--       recepción elige [Extender] o [Liberar horario].
--   scheduler_settings
--     · prereserva_color (#RRGGBB, default '#8b5cf6') y
--       prereserva_default_minutes (15..10080, default 120).
--   org_whatsapp_clipboard_templates.kind
--     · + reschedule_notice, reschedule_coordinate, prereserva.
--
-- ── Confirmación automática (trigger en patient_payments) ─────────
-- Un pago CLÍNICO en la cita (INSERT) o un adelanto que llega a la cita
-- (UPDATE OF appointment_id: traslado de la mig 273) pone
-- hold_expires_at = NULL. Plata de farmacia (source='pos') NO confirma:
-- plata clínica y de farmacia nunca se mezclan (CLAUDE.md).
-- El trigger NUNCA bloquea el cobro: EXCEPTION WHEN OTHERS → WARNING.
-- Si falla, la cita queda como pre-reserva y recepción la confirma con
-- [Confirmar sin pago]; el dinero ya quedó registrado.
-- No cambia ningún monto ni fórmula: solo limpia una marca de la cita.
--
-- ── Liberar horario: RPC appointment_release_hold(uuid) ───────────
-- Liberar NO es cancelar: se BORRA la cita, así no infla cancelaciones
-- en ningún reporte ni RPC (tasa de cancelación, bandeja 273, etc.) y
-- no avisa a nadie. Por eso solo se permite si la cita es una
-- pre-reserva sin NADA encima. FK que apuntan a appointments (según las
-- migraciones del repo; no se pudo leer pg_constraint de producción al
-- escribir esta migración — por eso además hay una red dinámica):
--   ON DELETE CASCADE
--     reminder_logs.appointment_id          → se permite (log técnico)
--     clinical_notes.appointment_id         → BLOQUEA (dato clínico)
--   NO ACTION (haría fallar el DELETE)
--     exam_orders.appointment_id            → BLOQUEA con mensaje
--   ON DELETE SET NULL
--     patient_payments.appointment_id       → BLOQUEA (cualquier source)
--     patient_payments.transferred_from_appointment_id (273) → BLOQUEA
--     einvoices.appointment_id (+ appointments.einvoice_id) → BLOQUEA
--     prescriptions, clinical_attachments, informed_consents,
--     patient_photos, inventory_movements, pharmacy_sales → BLOQUEA
--       (SET NULL no borra, pero dejaría huérfano algo clínico / de
--       dinero / de stock: si existe, la cita no era "solo un horario")
--     payment_links (Culqi) pendiente vigente / processing / paid
--       → BLOQUEA (si la paciente paga después, el pago quedaría sin
--       cita). Un link vencido o anulado no bloquea.
--     treatment_sessions                    → se LIBERA la sesión
--       (status 'pending', appointment_id NULL; si ya estaba
--       'completed', BLOQUEA)
--     clinical_followups, whatsapp_message_logs, budget_records,
--     appointments.rescheduled_from_id      → se permite (quedan NULL)
--   Red dinámica: cualquier OTRA FK a appointments con CASCADE /
--   RESTRICT / NO ACTION (p. ej. una tabla de producción que el repo no
--   conoce) bloquea si tiene filas de la cita, nombrando la tabla.
--
-- ── Seguridad ─────────────────────────────────────────────────────
-- Trigger y RPC: SECURITY INVOKER + search_path fijo (mismo análisis
-- que la 273: quien puede cobrar / editar la cita de su org puede
-- confirmarla; la RLS de appointments decide).
-- Excepción de SOLO LECTURA: appointment_hold_release_blocker() es
-- DEFINER, igual que appointment_has_cash_refund (273): la RLS de
-- algunas tablas (recetas, adjuntos, caja…) no deja ver todo a
-- recepción, y lo que ella no ve el ON DELETE CASCADE sí lo borraría.
-- Exige membresía en la org de la cita y devuelve un texto; no escribe.
-- DELETE: en el repo la política org_delete_appointments permite borrar
-- solo a owner/admin (mig 013). Para que recepción pueda liberar SOLO a
-- través de la RPC (con sus validaciones) se agrega la política
-- permisiva org_delete_appointments_prereserva_release: exige
-- pre-reserva viva de su org Y que la RPC haya fijado, dentro de la
-- misma transacción, vibeforge.release_hold_id = id de la cita
-- (set_config local). Por PostgREST un cliente no puede fijar ese GUC
-- (set_config vive en pg_catalog, no en el esquema expuesto), así que
-- un DELETE directo de recepción sigue afectando 0 filas. Admin/owner
-- conservan exactamente lo que tenían.
--
-- ── Qué NO cambia ─────────────────────────────────────────────────
-- Citas con hold_expires_at NULL: nada (el trigger filtra por
-- hold_expires_at IS NOT NULL y actualiza 0 filas). Pagos: nada.
-- Plantillas existentes: nada (el CHECK solo se amplía).
--
-- Aditiva e idempotente. Genérica: vale para toda org.
-- Rollback: rollbacks/274_appointment_prereservation_rollback.sql
-- Pruebas: runuser -u postgres -- bash supabase/tests/agenda/run.sh
-- ═══════════════════════════════════════════════════════════════════

-- Si una lectura larga de la agenda tiene tomada la tabla, fallar rápido
-- (y reintentar) en vez de dejar la agenda esperando detrás del ALTER.
SET lock_timeout = '5s';

-- ── 0. Columnas ────────────────────────────────────────────────────
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;

COMMENT ON COLUMN appointments.hold_expires_at IS
  'Mig 274: pre-reserva. NULL = cita normal; NOT NULL = horario separado hasta este instante (vigente si > now(), vencida si <= now(); no se libera sola). Se limpia al registrar un pago clínico en la cita (trg_patient_payments_confirm_prereserva_*) o con "Confirmar sin pago".';

-- Chip "N pre-reservas vencidas" y la tarjeta: pocas filas, por org.
CREATE INDEX IF NOT EXISTS idx_appointments_hold_expires
  ON appointments (organization_id, hold_expires_at)
  WHERE hold_expires_at IS NOT NULL;

ALTER TABLE scheduler_settings
  ADD COLUMN IF NOT EXISTS prereserva_color text NOT NULL DEFAULT '#8b5cf6',
  ADD COLUMN IF NOT EXISTS prereserva_default_minutes integer NOT NULL DEFAULT 120;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'scheduler_settings_prereserva_color_check'
                    AND conrelid = 'public.scheduler_settings'::regclass) THEN
    ALTER TABLE scheduler_settings ADD CONSTRAINT scheduler_settings_prereserva_color_check
      CHECK (prereserva_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'scheduler_settings_prereserva_minutes_check'
                    AND conrelid = 'public.scheduler_settings'::regclass) THEN
    ALTER TABLE scheduler_settings ADD CONSTRAINT scheduler_settings_prereserva_minutes_check
      CHECK (prereserva_default_minutes BETWEEN 15 AND 10080);
  END IF;
END $$;

COMMENT ON COLUMN scheduler_settings.prereserva_color IS
  'Mig 274: color (#RRGGBB) con el que la agenda pinta las pre-reservas vigentes.';
COMMENT ON COLUMN scheduler_settings.prereserva_default_minutes IS
  'Mig 274: plazo por defecto de una pre-reserva, en minutos (15 min .. 7 días).';

-- ── 1. Plantillas WhatsApp: kinds nuevos ───────────────────────────
-- El CHECK de la mig 139 es inline (nombre automático, normalmente
-- org_whatsapp_clipboard_templates_kind_check). Se busca por la columna,
-- no por el nombre, y se reemplaza por uno con nombre fijo. Solo amplía:
-- toda fila existente sigue siendo válida.
DO $$
DECLARE
  v_con record;
BEGIN
  IF to_regclass('public.org_whatsapp_clipboard_templates') IS NULL THEN
    RETURN;
  END IF;
  FOR v_con IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attname = 'kind'
     WHERE c.conrelid = 'public.org_whatsapp_clipboard_templates'::regclass
       AND c.contype = 'c'
       AND c.conkey = ARRAY[a.attnum]
  LOOP
    EXECUTE format('ALTER TABLE org_whatsapp_clipboard_templates DROP CONSTRAINT %I', v_con.conname);
  END LOOP;
  ALTER TABLE org_whatsapp_clipboard_templates
    ADD CONSTRAINT org_whatsapp_clipboard_templates_kind_check
    CHECK (kind IN (
      'post_appointment',
      'second_consultation_followup',
      'budget_followup',
      'reschedule_notice',
      'reschedule_coordinate',
      'prereserva'
    ));
END $$;

-- ── 2. Confirmación automática al cobrar (AFTER, patient_payments) ─
CREATE OR REPLACE FUNCTION patient_payments_confirm_prereserva()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Solo toca la cita si ES una pre-reserva: para una cita normal
  -- actualiza 0 filas (ni siquiera cambia updated_at).
  UPDATE appointments
     SET hold_expires_at = NULL
   WHERE id = NEW.appointment_id
     AND hold_expires_at IS NOT NULL;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'patient_payments_confirm_prereserva failed for payment=% appointment=%: % / %',
      NEW.id, NEW.appointment_id, SQLSTATE, SQLERRM;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION patient_payments_confirm_prereserva() IS
  'Mig 274: un pago clínico que entra a una cita pre-reservada la confirma (hold_expires_at = NULL). INVOKER; nunca bloquea el cobro.';

DROP TRIGGER IF EXISTS trg_patient_payments_confirm_prereserva_insert ON patient_payments;
CREATE TRIGGER trg_patient_payments_confirm_prereserva_insert
  AFTER INSERT ON patient_payments
  FOR EACH ROW
  WHEN (NEW.appointment_id IS NOT NULL AND COALESCE(NEW.source, 'clinical') = 'clinical')
  EXECUTE FUNCTION patient_payments_confirm_prereserva();

-- Adelanto trasladado a la cita (appointment_transfer_payments, mig 273,
-- o "Aplicar a esta cita").
DROP TRIGGER IF EXISTS trg_patient_payments_confirm_prereserva_move ON patient_payments;
CREATE TRIGGER trg_patient_payments_confirm_prereserva_move
  AFTER UPDATE OF appointment_id ON patient_payments
  FOR EACH ROW
  WHEN (
    NEW.appointment_id IS NOT NULL
    AND NEW.appointment_id IS DISTINCT FROM OLD.appointment_id
    AND COALESCE(NEW.source, 'clinical') = 'clinical'
  )
  EXECUTE FUNCTION patient_payments_confirm_prereserva();

-- ── 2b. Guardia: una pre-reserva solo NACE al crear la cita ────────
-- Sin esto, cualquier miembro con UPDATE sobre appointments (política
-- org_update_appointments) podría marcar una cita NORMAL como
-- pre-reserva y luego "liberarla" con la RPC: un DELETE que hoy solo
-- pueden hacer owner/admin. Además, una cita que sale de
-- scheduled/confirmed (atendida, no asistió, cancelada) deja de ser
-- pre-reserva: no queda "vencida" en rojo sobre una cita atendida.
-- Extender (NOT NULL → NOT NULL) y confirmar (→ NULL) siguen igual.
CREATE OR REPLACE FUNCTION appointments_hold_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.hold_expires_at IS NULL AND NEW.hold_expires_at IS NOT NULL THEN
    RAISE EXCEPTION 'Una cita ya creada no puede volverse pre-reserva.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.hold_expires_at IS NOT NULL
     AND NEW.status NOT IN ('scheduled', 'confirmed') THEN
    NEW.hold_expires_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION appointments_hold_guard() IS
  'Mig 274: hold_expires_at solo se fija al INSERT (nunca NULL → valor por UPDATE) y se limpia si la cita sale de scheduled/confirmed.';

DROP TRIGGER IF EXISTS trg_appointments_hold_guard ON appointments;
CREATE TRIGGER trg_appointments_hold_guard
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  WHEN (OLD.hold_expires_at IS NOT NULL OR NEW.hold_expires_at IS NOT NULL)
  EXECUTE FUNCTION appointments_hold_guard();

-- ── 3. ¿Qué impide liberar la cita? (solo lectura, DEFINER) ────────
-- Devuelve el primer motivo (texto para mostrar tal cual) o NULL.
-- DEFINER solo para ver filas que la RLS le oculta a recepción (y que
-- el DELETE igual tocaría); exige membresía en la org de la cita.
-- Cada chequeo va por SQL dinámico y tolera que la tabla/columna no
-- exista (entornos sin ese módulo).
CREATE OR REPLACE FUNCTION appointment_hold_release_blocker(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org    uuid;
  v_einv   uuid;
  v_hit    boolean;
  v_chk    record;
  v_fk     record;
BEGIN
  SELECT a.organization_id, a.einvoice_id INTO v_org, v_einv
    FROM appointments a
   WHERE a.id = p_appointment_id
     AND a.organization_id IN (SELECT get_user_org_ids());
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Cita no encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_einv IS NOT NULL THEN
    RETURN 'La cita tiene un comprobante electrónico emitido: no se puede liberar el horario. Cancélala si ya no va.';
  END IF;

  FOR v_chk IN
    SELECT * FROM (VALUES
      (1,  'patient_payments',  'appointment_id = $1 OR transferred_from_appointment_id = $1',
           'La cita tiene pagos registrados: no se puede liberar el horario. Anula o traslada el pago primero.'),
      (2,  'patient_payments',  'appointment_id = $1',
           'La cita tiene pagos registrados: no se puede liberar el horario. Anula o traslada el pago primero.'),
      (3,  'clinical_notes',    'appointment_id = $1',
           'La cita ya tiene una nota clínica: no se puede liberar el horario.'),
      (4,  'einvoices',         'appointment_id = $1',
           'La cita tiene un comprobante electrónico emitido: no se puede liberar el horario. Cancélala si ya no va.'),
      (5,  'prescriptions',     'appointment_id = $1',
           'La cita tiene recetas registradas: no se puede liberar el horario.'),
      (6,  'clinical_attachments', 'appointment_id = $1',
           'La cita tiene archivos clínicos adjuntos: no se puede liberar el horario.'),
      (7,  'exam_orders',       'appointment_id = $1',
           'La cita tiene órdenes de exámenes: no se puede liberar el horario.'),
      (8,  'informed_consents', 'appointment_id = $1',
           'La cita tiene consentimientos informados: no se puede liberar el horario.'),
      (9,  'patient_photos',    'appointment_id = $1',
           'La cita tiene fotos clínicas: no se puede liberar el horario.'),
      (10, 'inventory_movements', 'appointment_id = $1',
           'La cita tiene insumos o movimientos de inventario registrados: no se puede liberar el horario.'),
      (11, 'pharmacy_sales',    'appointment_id = $1',
           'La cita tiene ventas de farmacia vinculadas: no se puede liberar el horario.'),
      (12, 'payment_links',     'appointment_id = $1 AND (status IN (''processing'', ''paid'') OR (status = ''pending'' AND expires_at > now()))',
           'La cita tiene un link de pago activo: anúlalo antes de liberar el horario (si la paciente paga después, el pago quedaría sin cita).'),
      (13, 'treatment_sessions', 'appointment_id = $1 AND status = ''completed''',
           'La sesión del plan vinculada a esta cita ya está marcada como realizada: no se puede liberar el horario.')
    ) AS t(ord, tbl, cond, msg)
    ORDER BY ord
  LOOP
    IF to_regclass('public.' || v_chk.tbl) IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %s)', v_chk.tbl, v_chk.cond)
        INTO v_hit USING p_appointment_id;
    EXCEPTION
      -- Columna ausente en este entorno (p. ej. sin la 273): se salta;
      -- el chequeo 2 cubre patient_payments sin transferred_from_*.
      WHEN undefined_column THEN v_hit := false;
    END;
    IF v_hit THEN
      RETURN v_chk.msg;
    END IF;
  END LOOP;

  -- Red dinámica: toda otra FK a appointments cuyo ON DELETE borraría
  -- (CASCADE) o impediría (RESTRICT / NO ACTION) el DELETE.
  FOR v_fk IN
    SELECT c.conrelid::regclass AS rel, a.attname AS col, c.conrelid AS relid
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.appointments'::regclass
       AND array_length(c.conkey, 1) = 1
       AND c.confdeltype IN ('c', 'r', 'a')
       AND c.conrelid <> 'public.appointments'::regclass
       AND c.conrelid IS DISTINCT FROM to_regclass('public.reminder_logs')
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', v_fk.rel, v_fk.col)
      INTO v_hit USING p_appointment_id;
    IF v_hit THEN
      RETURN format('La cita tiene datos vinculados en %s: no se puede liberar el horario.', v_fk.rel);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION appointment_hold_release_blocker(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION appointment_hold_release_blocker(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION appointment_hold_release_blocker(uuid) TO authenticated;

COMMENT ON FUNCTION appointment_hold_release_blocker(uuid) IS
  'Mig 274: primer motivo por el que una pre-reserva NO se puede liberar (pagos, nota clínica, comprobante, recetas, link de pago activo, FK con CASCADE/RESTRICT con filas…) o NULL. Solo lectura; DEFINER para ver lo que la RLS oculta; exige membresía.';

-- ── 4. DELETE de recepción solo vía la RPC ─────────────────────────
DROP POLICY IF EXISTS org_delete_appointments_prereserva_release ON appointments;
CREATE POLICY org_delete_appointments_prereserva_release ON appointments
  FOR DELETE
  TO authenticated
  USING (
    organization_id IN (SELECT get_user_org_ids())
    AND hold_expires_at IS NOT NULL
    AND status IN ('scheduled', 'confirmed')
    AND id::text = current_setting('vibeforge.release_hold_id', true)
  );

-- ── 5. RPC: liberar el horario de una pre-reserva ──────────────────
CREATE OR REPLACE FUNCTION appointment_release_hold(p_appointment_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_appt    appointments%ROWTYPE;
  v_session uuid;
  v_block   text;
  v_deleted int;
BEGIN
  IF p_appointment_id IS NULL THEN
    RAISE EXCEPTION 'Elige la pre-reserva que quieres liberar.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- FOR UPDATE: un pago que entra a la vez espera (y luego falla por FK)
  -- o gana primero (y entonces la cita ya no es pre-reserva).
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cita no encontrada.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_appt.hold_expires_at IS NULL THEN
    RAISE EXCEPTION 'Esta cita ya no es una pre-reserva (ya fue confirmada). Si ya no va, cancélala.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_appt.status NOT IN ('scheduled', 'confirmed') THEN
    RAISE EXCEPTION 'Solo se puede liberar una pre-reserva pendiente: esta cita está %.',
      CASE v_appt.status
        WHEN 'completed' THEN 'atendida'
        WHEN 'cancelled' THEN 'cancelada'
        WHEN 'no_show'   THEN 'marcada como no asistió'
        ELSE v_appt.status END
      USING ERRCODE = 'check_violation';
  END IF;

  -- La paciente ya llegó o está en consulta: no es "solo un horario".
  IF NULLIF(to_jsonb(v_appt) ->> 'arrived_at', '') IS NOT NULL
     OR NULLIF(to_jsonb(v_appt) ->> 'consultation_started_at', '') IS NOT NULL THEN
    RAISE EXCEPTION 'La paciente ya llegó o está en consulta: no se puede liberar el horario.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_block := appointment_hold_release_blocker(p_appointment_id);
  IF v_block IS NOT NULL THEN
    RAISE EXCEPTION '%', v_block USING ERRCODE = 'check_violation';
  END IF;

  -- La sesión del plan vuelve a quedar por agendar (igual que al
  -- cancelar desde la agenda). treatment_session_id vía jsonb: tolera
  -- entornos sin esa columna.
  IF to_regclass('public.treatment_sessions') IS NOT NULL THEN
    v_session := NULLIF(to_jsonb(v_appt) ->> 'treatment_session_id', '')::uuid;
    UPDATE treatment_sessions ts
       SET appointment_id = NULL,
           status = CASE WHEN ts.status IN ('pending', 'missed') THEN 'pending' ELSE ts.status END
     WHERE ts.organization_id = v_appt.organization_id
       AND (ts.appointment_id = p_appointment_id OR ts.id = v_session)
       AND ts.status <> 'completed';
  END IF;

  -- Llave de la política org_delete_appointments_prereserva_release:
  -- local a esta transacción y solo para esta cita.
  PERFORM set_config('vibeforge.release_hold_id', p_appointment_id::text, true);
  DELETE FROM appointments
   WHERE id = p_appointment_id
     AND hold_expires_at IS NOT NULL
     AND status IN ('scheduled', 'confirmed');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  PERFORM set_config('vibeforge.release_hold_id', '', true);

  IF v_deleted = 0 THEN
    RAISE EXCEPTION 'No tienes permiso para liberar este horario.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN json_build_object('released', true, 'appointment_id', p_appointment_id);
END;
$$;

REVOKE ALL ON FUNCTION appointment_release_hold(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION appointment_release_hold(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION appointment_release_hold(uuid) TO authenticated;

COMMENT ON FUNCTION appointment_release_hold(uuid) IS
  'Mig 274: libera el horario de una pre-reserva (la BORRA: no cuenta como cancelación ni avisa). Solo si hold_expires_at NOT NULL, status scheduled/confirmed y sin pagos, nota clínica, comprobantes ni otros datos vinculados; libera la sesión de plan. INVOKER.';

-- ── 6. "Por reprogramar" (mig 273) no se cierra con una pre-reserva ─
-- Una pre-reserva todavía no es "la nueva cita": si se cerrara la
-- tarjeta al crearla y luego se libera el horario (DELETE), la paciente
-- desaparecería de la bandeja. La tarjeta se cierra cuando la
-- pre-reserva se CONFIRMA (pago o "Confirmar sin pago"). Se redefinen
-- solo los WHEN de los triggers de la 273; la función es la misma.
DO $$
BEGIN
  IF to_regprocedure('public.close_reschedule_pending_followups()') IS NULL THEN
    RETURN;  -- entorno sin la 273
  END IF;

  DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_insert ON appointments;
  CREATE TRIGGER trg_appointments_reschedule_close_insert
    AFTER INSERT ON appointments
    FOR EACH ROW
    WHEN (NEW.patient_id IS NOT NULL
          AND NEW.status IN ('scheduled', 'confirmed', 'completed')
          AND NEW.hold_expires_at IS NULL)
    EXECUTE FUNCTION close_reschedule_pending_followups('new');

  DROP TRIGGER IF EXISTS trg_appointments_reschedule_close_link ON appointments;
  CREATE TRIGGER trg_appointments_reschedule_close_link
    AFTER UPDATE OF rescheduled_from_id ON appointments
    FOR EACH ROW
    WHEN (
      NEW.patient_id IS NOT NULL
      AND NEW.rescheduled_from_id IS NOT NULL
      AND NEW.rescheduled_from_id IS DISTINCT FROM OLD.rescheduled_from_id
      AND NEW.status IN ('scheduled', 'confirmed', 'completed')
      AND NEW.hold_expires_at IS NULL
    )
    EXECUTE FUNCTION close_reschedule_pending_followups('new');

  DROP TRIGGER IF EXISTS trg_appointments_hold_confirmed_close ON appointments;
  CREATE TRIGGER trg_appointments_hold_confirmed_close
    AFTER UPDATE OF hold_expires_at ON appointments
    FOR EACH ROW
    WHEN (
      NEW.patient_id IS NOT NULL
      AND OLD.hold_expires_at IS NOT NULL
      AND NEW.hold_expires_at IS NULL
      AND NEW.status IN ('scheduled', 'confirmed', 'completed')
    )
    EXECUTE FUNCTION close_reschedule_pending_followups('new');
END $$;

RESET lock_timeout;
