-- ============================================================
-- Migración 237 — RLS de organizations: los miembros ven su org
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
-- Origen: bug reportado 2026-09-01 — una recepcionista (miembro
-- no-owner) entra al dashboard y NO ve el nombre, logo ni color
-- (accent_theme) de su organización: la UI cae a los defaults de
-- la app.
--
-- Causa (misma deriva de migraciones que C1 de la revisión de
-- seguridad): en producción la tabla organizations solo tiene las
-- policies legacy de la mig 004 —
--     "Org owner can view own org"     SELECT (auth.uid() = owner_id)
--     "Org owner can update own org"   UPDATE (auth.uid() = owner_id)
--     "Authenticated users can create orgs" INSERT
-- Las policies modernas de la mig 013 (org_select_organizations,
-- etc.) nunca llegaron a prod, y tampoco "Org members can view org"
-- de la propia 004. Resultado: solo el owner puede leer la fila de
-- su org; para cualquier otro miembro el SELECT devuelve vacío y
-- organization-provider / getAccentTheme reciben null.
--
-- Qué hace esta migración:
--   1. Elimina las policies legacy (y las variantes de 013/004 por
--      si existieran en algún entorno).
--   2. SELECT: cualquier miembro ACTIVO de la org (get_user_org_ids,
--      que desde la mig 235 exige is_active = true), y siempre el
--      owner (cinturón por si faltara la fila de membresía).
--   3. UPDATE: owner o admin activo (is_org_admin), con WITH CHECK.
--   4. INSERT: solo como owner de la fila que crea (igual que 004,
--      pero explícito). El alta real la hace handle_new_user
--      (SECURITY DEFINER), esto no la afecta.
--   5. Trigger guard (hallazgo H2 de la revisión): al editar la org
--      desde el cliente se congelan owner_id e is_active — ningún
--      flujo de la app los toca (solo branding/settings); cambios de
--      dueño o de estado son del service role. (`plan` NO se incluye:
--      la columna nunca existió en prod — la 013 era CREATE TABLE IF
--      NOT EXISTS y no la creó; ver precedente en mig 094.)
--   6. Sin policy de DELETE: nadie borra orgs vía PostgREST.
-- ============================================================

-- ── 1. Fuera policies legacy / duplicadas ────────────────────────
DROP POLICY IF EXISTS "Org owner can view own org"          ON organizations;
DROP POLICY IF EXISTS "Org owner can update own org"        ON organizations;
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON organizations;
DROP POLICY IF EXISTS "Org members can view org"            ON organizations;
DROP POLICY IF EXISTS org_select_organizations ON organizations;
DROP POLICY IF EXISTS org_insert_organizations ON organizations;
DROP POLICY IF EXISTS org_update_organizations ON organizations;
DROP POLICY IF EXISTS org_delete_organizations ON organizations;

-- ── 2. SELECT: miembros activos + owner ──────────────────────────
CREATE POLICY org_select_organizations
  ON organizations FOR SELECT
  USING (
    owner_id = auth.uid()
    OR id IN (SELECT get_user_org_ids())
  );

-- ── 3. UPDATE: owner o admin activo ──────────────────────────────
CREATE POLICY org_update_organizations
  ON organizations FOR UPDATE
  USING (owner_id = auth.uid() OR is_org_admin(id))
  WITH CHECK (owner_id = auth.uid() OR is_org_admin(id));

-- ── 4. INSERT: solo a nombre propio ──────────────────────────────
CREATE POLICY org_insert_organizations
  ON organizations FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- ── 5. Guard: columnas sensibles congeladas para usuarios ────────
CREATE OR REPLACE FUNCTION organizations_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Rutas de sistema (service role, migraciones): sin límite.
  IF auth.uid() IS NULL OR COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id  IS DISTINCT FROM OLD.owner_id
     OR NEW.is_active IS DISTINCT FROM OLD.is_active
  THEN
    RAISE EXCEPTION 'owner_id e is_active de la organización no se editan desde la aplicación.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_organizations_guard ON organizations;
CREATE TRIGGER trg_organizations_guard
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION organizations_guard();

COMMENT ON FUNCTION organizations_guard() IS
  'Seguridad (mig 237): congela owner_id/is_active en updates de usuarios autenticados. Exime rutas de sistema (sin auth.uid()).';

-- ── Verificación sugerida (correr después de aplicar) ────────────
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'organizations';
--   → org_select_organizations (SELECT), org_update_organizations (UPDATE),
--     org_insert_organizations (INSERT). Nada más.
