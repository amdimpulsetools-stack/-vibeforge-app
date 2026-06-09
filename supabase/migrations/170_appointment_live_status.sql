-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 170: appointment live status (Part B of visual card status)
--
-- Adds the "Estado de cita en vivo" timestamps to appointments. This
-- is a purely additive feature: the existing `status` lifecycle
-- (scheduled/confirmed/completed/cancelled/no_show) is untouched —
-- live status is a parallel, optional visual-control layer that orgs
-- can enable per-organization from Settings → Agenda (Part F).
--
--   arrived_at                  → reception marks patient arrival
--   consultation_started_at     → reception or doctor starts the visit
--   consultation_ended_at       → manual end, auto-close (next visit
--                                 starts), or EOD sweep
--   consultation_closed_reason  → how it was closed; powers reports
--                                 and the "reopen" undo flow
--
-- Why timestamps and not an enum: the state is derived (which fields
-- are set), so it can never disagree with the data — and the
-- timestamps themselves feed future reports (real waiting time,
-- real consultation duration, doctor punctuality).
--
-- Concurrency design:
--   • `start_consultation()` RPC performs "start mine + auto-close
--     the doctor's other open consultation" atomically in one
--     statement transaction. Two receptionists clicking in parallel
--     tabs can't leave two open rows when auto-close is on.
--   • NO unique partial index on (doctor, open-consultation): when an
--     org disables auto-close (manual mode, Part F sub-toggle), a
--     doctor CAN legitimately have >1 open consultation. The partial
--     index below is for lookup speed only.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consultation_closed_reason TEXT
    CHECK (consultation_closed_reason IN ('manual', 'auto_next_started', 'auto_eod'));

COMMENT ON COLUMN appointments.arrived_at IS
  'Live status: cuándo el paciente llegó a recepción. Lo marca recepción/admin/doctor. NULL = aún no llegó. Independiente del status de la cita.';
COMMENT ON COLUMN appointments.consultation_started_at IS
  'Live status: cuándo el paciente entró a consulta. Lo marca recepción (al llamarlo el doctor) o el doctor. Manual a propósito: computarlo de la hora agendada mentiría cuando hay retrasos.';
COMMENT ON COLUMN appointments.consultation_ended_at IS
  'Live status: cuándo terminó la consulta. Manual, auto (siguiente consulta del mismo doctor inicia) o EOD sweep. Ver consultation_closed_reason.';
COMMENT ON COLUMN appointments.consultation_closed_reason IS
  'manual = cerrada explícitamente · auto_next_started = el trigger de inicio de la siguiente consulta la cerró · auto_eod = el cron de medianoche cerró una consulta huérfana usando end_time como estimación.';

-- Lookup index for "the doctor's open consultation(s)". Small (only
-- in-flight rows live here) and hit by the RPC below + the Part E
-- lean status poll.
CREATE INDEX IF NOT EXISTS idx_appointments_open_consultation
  ON appointments (doctor_id, organization_id)
  WHERE consultation_started_at IS NOT NULL AND consultation_ended_at IS NULL;

-- ── start_consultation RPC ─────────────────────────────────────────
-- Atomic "start this one, optionally close the doctor's other open
-- ones". SECURITY DEFINER so the close touches rows the caller might
-- not own under RLS; access control is enforced inside: the caller
-- must be an active member of the appointment's org with one of the
-- allowed roles (owner/admin/receptionist/doctor).
--
-- p_auto_close mirrors the org's Part-F sub-toggle. The endpoint
-- reads the org config and passes the flag — keeping the function
-- decoupled from where settings live.
CREATE OR REPLACE FUNCTION start_consultation(
  p_appointment_id UUID,
  p_auto_close BOOLEAN DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt appointments%ROWTYPE;
  v_role TEXT;
  v_closed_count INT := 0;
BEGIN
  SELECT * INTO v_appt FROM appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- Caller must be an active member of the appointment's org.
  SELECT m.role INTO v_role
  FROM organization_members m
  WHERE m.user_id = auth.uid()
    AND m.organization_id = v_appt.organization_id
    AND m.is_active = true
  LIMIT 1;
  IF v_role IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF v_appt.consultation_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_started');
  END IF;

  -- Auto-close the doctor's other open consultations (doctor-scoped:
  -- another doctor starting never closes this doctor's session).
  IF p_auto_close THEN
    UPDATE appointments
    SET consultation_ended_at = NOW(),
        consultation_closed_reason = 'auto_next_started'
    WHERE doctor_id = v_appt.doctor_id
      AND organization_id = v_appt.organization_id
      AND id <> v_appt.id
      AND consultation_started_at IS NOT NULL
      AND consultation_ended_at IS NULL;
    GET DIAGNOSTICS v_closed_count = ROW_COUNT;
  END IF;

  UPDATE appointments
  SET consultation_started_at = NOW(),
      -- If reception forgot to mark arrival, starting implies it.
      arrived_at = COALESCE(arrived_at, NOW()),
      -- A fresh start clears any stale end/reason left by a previous
      -- reopen cycle.
      consultation_ended_at = NULL,
      consultation_closed_reason = NULL
  WHERE id = v_appt.id;

  RETURN jsonb_build_object('ok', true, 'auto_closed', v_closed_count);
END;
$$;

-- Members invoke it through the API route; grant to authenticated so
-- the RPC is callable with the user's JWT (RLS-equivalent checks are
-- done inside the function body).
GRANT EXECUTE ON FUNCTION start_consultation(UUID, BOOLEAN) TO authenticated;
