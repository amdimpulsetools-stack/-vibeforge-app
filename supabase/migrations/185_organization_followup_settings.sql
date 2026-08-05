-- ═══════════════════════════════════════════════════════════════════
-- MIGRATION 185: ajustes de seguimientos por organización (Fase 2a)
--
-- Ver docs/research/seguimientos-genericos-core.md §4 ("Sesiones
-- perdidas") y "Fase 2".
--
-- ┌──────────────────────────────────────────────────────────────────┐
-- │ LA DECISIÓN DE DISEÑO DE ESTA MIGRACIÓN ES **NO HACER BACKFILL** │
-- └──────────────────────────────────────────────────────────────────┘
--
-- La Fase 2a enciende automatismos nuevos (seguimiento por sesión
-- perdida, mig 187). Vitra y la Dra. Patricia son pilotos EN PRODUCCIÓN
-- con seguimientos vivos y KPIs que se miran; un automatismo nuevo que
-- les empiece a crear filas sin avisar es una regresión de producto
-- aunque no sea un bug de código.
--
-- Por eso la semántica es: **ausencia de fila = todo lo nuevo apagado**.
-- Los triggers leen con `COALESCE(<flag>, false)` sobre un LEFT JOIN,
-- así que una org sin fila no observa NINGÚN cambio. Los DEFAULT de las
-- columnas (true / 3 / true) NO aplican a las orgs existentes: solo se
-- materializan cuando alguien inserta la fila, y quien la inserta es:
--   - el onboarding de orgs NUEVAS (POST /api/onboarding/complete), y
--   - en el futuro, el toggle de Settings cuando una org existente
--     decida sumarse explícitamente.
--
-- Es decir: los defaults describen "cómo queremos que nazca una org
-- nueva", no "qué le pasa a las que ya existen".
--
-- Aditiva e idempotente. SIN backfill (a propósito).
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organization_followup_settings (
  -- PK = FK: como mucho una fila de ajustes por org. Hace el upsert del
  -- onboarding trivialmente idempotente (ON CONFLICT DO NOTHING sobre
  -- la PK) y elimina la clase de bug "dos filas de settings".
  organization_id UUID PRIMARY KEY
    REFERENCES organizations(id) ON DELETE CASCADE,

  -- ── Consumido HOY por la mig 187 ────────────────────────────────
  -- Al pasar una treatment_session a 'missed', ¿crear seguimiento?
  missed_session_followup BOOLEAN NOT NULL DEFAULT true,
  -- Días desde la sesión perdida hasta `expected_by` del seguimiento.
  -- Rango: reagendar el mismo día no tiene sentido operativo (1 mínimo)
  -- y más de un mes ya no es "reagendar" (30 máximo).
  missed_session_delay_days INTEGER NOT NULL DEFAULT 3,

  -- ── Declarados aquí, consumidos MÁS ADELANTE ────────────────────
  -- Se declaran ya para no volver a migrar la tabla cuando se cableen,
  -- y para que el toggle de Settings nazca completo. HOY NINGÚN CÓDIGO
  -- LOS LEE — su valor es inerte:
  --
  --   close_on_any_appointment — futuro interruptor de la pasada
  --     centinela de `compute_appointment_attribution` (mig 183). Hoy
  --     esa pasada corre SIEMPRE (es lo que hace que la bandeja core se
  --     vacíe sola) y cablear el flag aquí implicaría apagarla para las
  --     orgs sin fila, que es exactamente la regresión que evitamos.
  --     Se cableará junto con el toggle de Settings, cuando el flag
  --     pueda leerse como "COALESCE(..., true)" sin ambigüedad.
  --
  --   default_followup_days — futuro default de org para el control
  --     post-cita, por debajo de `services.followup_after_days`
  --     (mig 182). Hoy el fallback es "sin seguimiento"; cablearlo
  --     encendería seguimientos en servicios sin configurar.
  close_on_any_appointment BOOLEAN NOT NULL DEFAULT true,
  default_followup_days INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHECKs en bloques guardados para que la migración se pueda re-aplicar
-- sobre una tabla ya creada (CREATE TABLE IF NOT EXISTS no reevalúa los
-- constraints inline).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'organization_followup_settings'::regclass
      AND conname = 'org_followup_settings_missed_delay_check'
  ) THEN
    ALTER TABLE organization_followup_settings
      ADD CONSTRAINT org_followup_settings_missed_delay_check
      CHECK (missed_session_delay_days >= 1 AND missed_session_delay_days <= 30);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'organization_followup_settings'::regclass
      AND conname = 'org_followup_settings_default_days_check'
  ) THEN
    ALTER TABLE organization_followup_settings
      ADD CONSTRAINT org_followup_settings_default_days_check
      CHECK (
        default_followup_days IS NULL
        OR (default_followup_days >= 1 AND default_followup_days <= 365)
      );
  END IF;
END $$;

-- ── RLS ───────────────────────────────────────────────────────────
-- SELECT: cualquier miembro de la org (el trigger de la mig 187 corre
--   como el usuario que marca la sesión, que puede ser recepción o
--   doctor — necesita poder LEER los ajustes o el COALESCE lo apagaría
--   todo por falta de visibilidad, no por configuración).
-- INSERT/UPDATE: solo owner/admin (`is_org_admin`, mig 013). Es
--   configuración de la clínica, no dato clínico.
-- Sin política de DELETE: los ajustes se apagan poniendo los flags en
--   false, no borrando la fila (borrarla es indistinguible de "org que
--   nunca configuró nada", que es un estado que queremos preservar).
ALTER TABLE organization_followup_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_followup_settings_select" ON organization_followup_settings;
CREATE POLICY "org_followup_settings_select" ON organization_followup_settings
  FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));

DROP POLICY IF EXISTS "org_followup_settings_insert" ON organization_followup_settings;
CREATE POLICY "org_followup_settings_insert" ON organization_followup_settings
  FOR INSERT WITH CHECK (is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_followup_settings_update" ON organization_followup_settings;
CREATE POLICY "org_followup_settings_update" ON organization_followup_settings
  FOR UPDATE USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));

-- ── Grants ────────────────────────────────────────────────────────
-- Supabase configura DEFAULT PRIVILEGES para `authenticated`, así que
-- en producción esto es redundante. Se declara igual (precedente:
-- mig 127:47) porque el modo de fallo si faltara es especialmente malo:
-- el trigger de la mig 187 leería esta tabla, recibiría 42501, lo
-- tragaría su EXCEPTION y el seguimiento no se crearía NUNCA — apagado
-- silencioso indistinguible de "la org no lo activó". Con el GRANT
-- explícito, ese modo de fallo no existe.
--
-- La RLS de arriba sigue siendo la que decide: el GRANT abre la tabla,
-- las políticas acotan las filas (SELECT a miembros, escritura a admins).
--
-- Guardado por si el rol no existe (entornos Postgres no-Supabase, p.ej.
-- una base efímera de verificación).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    GRANT SELECT, INSERT, UPDATE ON organization_followup_settings TO authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT ALL ON organization_followup_settings TO service_role;
  END IF;
END $$;

-- ── updated_at ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS set_updated_at_organization_followup_settings
  ON organization_followup_settings;
CREATE TRIGGER set_updated_at_organization_followup_settings
  BEFORE UPDATE ON organization_followup_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ── Documentación en el catálogo ──────────────────────────────────
COMMENT ON TABLE organization_followup_settings IS
  'Ajustes de seguimientos por organización (mig 185). SIN backfill a propósito: ausencia de fila = todos los automatismos nuevos apagados (los triggers leen con COALESCE(flag,false)). Los DEFAULT describen cómo nace una org nueva (los siembra POST /api/onboarding/complete), no qué le pasa a las existentes.';

COMMENT ON COLUMN organization_followup_settings.missed_session_followup IS
  'CONSUMIDO HOY por el trigger de mig 187: al pasar treatment_sessions.status a ''missed'' crea un clinical_followups con rule_key=''core.missed_session''. Sin fila en esta tabla → COALESCE(...,false) → no crea nada.';

COMMENT ON COLUMN organization_followup_settings.missed_session_delay_days IS
  'CONSUMIDO HOY por el trigger de mig 187: expected_by = now() + N días. Default 3 (rango 1..30).';

COMMENT ON COLUMN organization_followup_settings.close_on_any_appointment IS
  'DECLARADO, AÚN NO CONSUMIDO. Futuro interruptor de la pasada centinela de compute_appointment_attribution (mig 183), que hoy corre siempre para todas las orgs. Se cableará con el toggle de Settings.';

COMMENT ON COLUMN organization_followup_settings.default_followup_days IS
  'DECLARADO, AÚN NO CONSUMIDO. Futuro default de org para el control post-cita, por debajo de services.followup_after_days (mig 182). NULL = sin default de org.';
