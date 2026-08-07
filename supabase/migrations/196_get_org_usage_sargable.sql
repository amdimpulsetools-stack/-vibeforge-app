-- Pendiente de aplicar en producción (la aplica el orquestador)
--
-- 196: get_org_usage — `monthly_appointments` sargable + índice de apoyo.
--
-- PROBLEMA
-- La versión vigente (063_fix_get_org_usage_addons.sql:23-27) filtra el mes
-- en curso con:
--     DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE)
-- Envolver la columna en una función hace la condición NO sargable: Postgres
-- no puede usar ningún índice sobre `created_at` y se ve obligado a recorrer
-- TODAS las citas históricas de la org para contar las de este mes. Además no
-- existía ningún índice (organization_id, created_at) que lo respaldara.
--
-- Este RPC se llama hoy ~4 veces por carga de /account, así que el coste se
-- multiplica y crece linealmente con el histórico de la clínica.
--
-- SOLUCIÓN
-- Reescribir el predicado como un rango medio-abierto sobre la columna
-- desnuda y crear el índice compuesto. El resultado es EXACTAMENTE el mismo
-- conjunto de filas: [inicio de mes, inicio del mes siguiente).
--
-- El resto del cuerpo se copia sin tocar de 063 — misma firma, mismo JSON de
-- salida, mismo control de acceso. CREATE OR REPLACE conserva los privilegios
-- que fijó la migración 193 (lockdown de la superficie RPC).

CREATE OR REPLACE FUNCTION get_org_usage(org_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Verify caller is a member of this org
  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND organization_id = org_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'members', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND is_active = true),
    'doctors', (SELECT count(*) FROM doctors WHERE organization_id = org_id AND is_active = true),
    'offices', (SELECT count(*) FROM offices WHERE organization_id = org_id AND is_active = true),
    'patients', (SELECT count(*) FROM patients WHERE organization_id = org_id),
    'monthly_appointments', (
      -- Sargable: rango medio-abierto sobre created_at sin envolverlo en
      -- DATE_TRUNC. Equivalente fila a fila al predicado anterior.
      SELECT count(*) FROM appointments
      WHERE organization_id = org_id
        AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
        AND created_at <  DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
    ),
    'admins', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'admin' AND is_active = true),
    'receptionists', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'receptionist' AND is_active = true),
    'doctor_members', (SELECT count(*) FROM organization_members WHERE organization_id = org_id AND role = 'doctor' AND is_active = true),
    'extra_offices', (
      SELECT COALESCE(SUM(quantity), 0) FROM plan_addons
      WHERE organization_id = org_id AND addon_type = 'extra_office' AND is_active = true
    ),
    'extra_members', (
      SELECT COALESCE(SUM(quantity), 0) FROM plan_addons
      WHERE organization_id = org_id AND addon_type = 'extra_member' AND is_active = true
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Índice que hace posible el range scan. Los índices existentes sobre
-- appointments van por (organization_id, appointment_date) — la FECHA DE LA
-- CITA, no la de creación —, así que ninguno sirve para este contador.
CREATE INDEX IF NOT EXISTS idx_appointments_org_created
  ON appointments (organization_id, created_at);
