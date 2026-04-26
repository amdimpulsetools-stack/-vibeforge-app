-- ============================================================================
-- Migration 111: doctor_offices (consultorios autorizados por doctor)
-- ============================================================================
--
-- Problema: hoy `doctor_schedules.office_id` mezcla dos preguntas distintas:
--   1. ¿En qué consultorios puede atender este doctor?  (atributo del doctor)
--   2. ¿En cuál consultorio específico es este turno?    (atributo del bloque)
--
-- Como resultado, no se puede expresar "la Dra. Ángela atiende en 202 y 203
-- de lunes a viernes 9-13" sin chocar con UNIQUE(doctor_id, day_of_week,
-- start_time): habría dos bloques con la misma combinación.
--
-- Solución: separar la pregunta #1 en su propia tabla `doctor_offices`.
-- - doctor_offices = lista global de consultorios autorizados por doctor.
-- - doctor_schedules.office_id = restricción opcional por turno.
--   · Si NULL → el turno hereda los consultorios autorizados del doctor.
--   · Si NOT NULL → ese turno solo se da en ese consultorio específico.
--
-- Si un doctor no tiene filas en doctor_offices → "Todos los consultorios"
-- (default permisivo, conserva el comportamiento actual).
-- ============================================================================

CREATE TABLE IF NOT EXISTS doctor_offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  office_id UUID NOT NULL REFERENCES offices(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doctor_id, office_id)
);

CREATE INDEX IF NOT EXISTS idx_doctor_offices_doctor ON doctor_offices(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doctor_offices_office ON doctor_offices(office_id);
CREATE INDEX IF NOT EXISTS idx_doctor_offices_org ON doctor_offices(organization_id);

ALTER TABLE doctor_offices ENABLE ROW LEVEL SECURITY;

-- RLS — same access pattern as doctor_schedules: members read, admins write.
CREATE POLICY "org_select_doctor_offices" ON doctor_offices FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids()));

CREATE POLICY "org_insert_doctor_offices" ON doctor_offices FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "org_delete_doctor_offices" ON doctor_offices FOR DELETE
  USING (is_org_admin(organization_id));

-- No UPDATE policy: rows are immutable composites of (doctor_id, office_id).
-- To "edit" the list, delete and re-insert.

COMMENT ON TABLE doctor_offices IS
  'Authorized offices (rooms) per doctor. Empty set → doctor can use any office.';
