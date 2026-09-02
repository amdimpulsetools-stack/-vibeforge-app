-- ============================================================
-- Migración 235 — Seguridad: membresías de organización
--
-- Pendiente de aplicar en producción (la aplica el orquestador).
-- Origen: revisión de seguridad 2026-09-01 (hallazgos C1, A1, A2).
--
-- C1 (CRÍTICO). La mig 005 creó "Org owner can add members" con
--   WITH CHECK (auth.uid() = user_id OR owner_id = auth.uid()).
--   La 013 creó las policies org_* nuevas pero NUNCA eliminó las de la
--   005. Como las policies RLS son permisivas (OR), la de 005 seguía
--   vigente: cualquier usuario autenticado podía insertarse a sí mismo
--   en CUALQUIER organización con role='owner' vía PostgREST.
--   Ningún flujo legítimo dependía de ella: la alta del owner al
--   registrarse la hace handle_new_user (SECURITY DEFINER) y las
--   invitaciones insertan con el service role (accept-invite,
--   register-invited). Se eliminan las 3 policies de escritura de 005.
--
-- A1 (ALTA). org_update_members tenía USING pero no WITH CHECK: un admin
--   podía auto-promoverse a owner, degradar al owner o mover una fila a
--   otra org. Se añade un trigger BEFORE UPDATE (no una policy: WITH
--   CHECK no ve OLD) que congela user_id/organization_id, reserva el
--   rol 'owner' y las filas del owner al propio owner.
--
-- A2 (ALTA). Desactivar a un miembro (is_active=false) solo lo bloqueaba
--   el middleware de páginas: get_user_org_ids / is_org_admin /
--   get_user_org_role ignoraban is_active, así que RLS y /api seguían
--   tratándolo como miembro pleno (y un admin desactivado podía
--   reactivarse solo). Los tres helpers pasan a exigir is_active = true
--   y fijan search_path.
--
-- El trigger exime a las rutas de sistema (service role, triggers de
-- auth): solo actúa cuando hay un usuario autenticado real.
-- ============================================================

-- ── 1. C1: eliminar las policies legacy de la 005 ────────────────
DROP POLICY IF EXISTS "Org owner can add members"    ON organization_members;
DROP POLICY IF EXISTS "Org owner can update members" ON organization_members;
DROP POLICY IF EXISTS "Org owner can delete members" ON organization_members;
-- "Users can view own memberships" (SELECT, auth.uid() = user_id) es
-- inofensiva y la usan pantallas de perfil: se conserva.

-- ── 2. A2: helpers RLS solo cuentan miembros ACTIVOS ─────────────
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
    AND is_active = true
$$;

CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role IN ('owner', 'admin')
      AND is_active = true
  )
$$;

CREATE OR REPLACE FUNCTION get_user_org_role(org_id UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT role FROM organization_members
  WHERE user_id = auth.uid()
    AND organization_id = org_id
    AND is_active = true
  LIMIT 1
$$;

-- ── 3. A1: trigger anti-escalada en organization_members ─────────
CREATE OR REPLACE FUNCTION organization_members_guard()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_role  text;
BEGIN
  -- Rutas de sistema (service role, triggers de auth, migraciones): sin
  -- usuario autenticado no hay a quién limitar.
  IF v_uid IS NULL OR COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  -- Una membresía no cambia de dueño ni de organización: eso es un alta
  -- nueva, no una edición.
  IF NEW.user_id <> OLD.user_id OR NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'No se puede mover una membresía de usuario u organización.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT role INTO v_role
    FROM organization_members
   WHERE user_id = v_uid
     AND organization_id = OLD.organization_id
     AND is_active = true;

  -- El rol 'owner' se concede o se quita solo por un owner, y las filas
  -- del owner solo las toca un owner (un admin no degrada ni desactiva
  -- al dueño de la clínica).
  IF (NEW.role = 'owner' AND OLD.role <> 'owner')
     OR (OLD.role = 'owner' AND (NEW.role <> 'owner' OR NEW.is_active = false))
  THEN
    IF v_role IS DISTINCT FROM 'owner' THEN
      RAISE EXCEPTION 'Solo el owner de la organización puede modificar el rol owner.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Un miembro no se reactiva a sí mismo.
  IF NEW.user_id = v_uid AND OLD.is_active = false AND NEW.is_active = true THEN
    RAISE EXCEPTION 'Un miembro desactivado no puede reactivarse a sí mismo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_organization_members_guard ON organization_members;
CREATE TRIGGER trg_organization_members_guard
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION organization_members_guard();

-- Con la policy de 005 fuera, el INSERT queda solo en manos de
-- org_insert_members (is_org_admin). Un admin tampoco debe poder dar de
-- alta a alguien directamente como owner.
DROP POLICY IF EXISTS org_insert_members ON organization_members;
CREATE POLICY org_insert_members
  ON organization_members FOR INSERT
  WITH CHECK (is_org_admin(organization_id) AND role <> 'owner');

COMMENT ON FUNCTION organization_members_guard() IS
  'Seguridad (mig 235): congela user_id/organization_id, reserva el rol owner al owner e impide la auto-reactivación. Exime rutas de sistema (sin auth.uid()).';
