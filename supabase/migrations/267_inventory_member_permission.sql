-- 267: Almacén — permiso por miembro, concedido solo por el owner
--
-- Corrige el alcance de la 266, que abría la creación y edición de
-- productos a TODOS los doctores de todas las orgs. La regla de negocio
-- (founder, 21-sep-2026) es: owner y admin siempre; el resto de miembros
-- solo si el owner los aprueba uno a uno. Es un permiso, no un rol: sirve
-- igual para una obstetra con rol doctor que para una recepcionista que
-- maneja stock, sin cambiarles el rol.
--
--   organization_members.can_manage_inventory (default false)
--   is_org_inventory_editor(org) = owner/admin, o miembro activo con el
--                                  permiso. Las policies de la 266 y el RPC
--                                  de precio ya apuntan aquí: no se tocan.
--   Solo el owner cambia la columna: se amplía el trigger anti-escalada
--   de la 235 (misma técnica que reserva el rol owner al owner), así un
--   admin no puede concederse el permiso ni concederlo a otros aunque la
--   policy de UPDATE de organization_members sea is_org_admin.

ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS can_manage_inventory boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN organization_members.can_manage_inventory IS
  'Permiso concedido por el owner: crear y editar productos del almacén (precio de venta incluido). Owner y admin lo tienen siempre. Mig 266.';

-- ── Helper: owner/admin, o miembro activo con el permiso ─────────────
CREATE OR REPLACE FUNCTION public.is_org_inventory_editor(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND is_active = true
      AND (role IN ('owner', 'admin') OR can_manage_inventory = true)
  )
$$;

COMMENT ON FUNCTION public.is_org_inventory_editor(UUID) IS
  'true si el usuario actual es owner/admin activo de la org, o un miembro activo con can_manage_inventory: puede crear y editar productos del almacén (mig 267).';

-- ── Trigger anti-escalada (mig 235) + regla del permiso de almacén ────
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

  -- El permiso de almacén lo concede y lo quita solo el owner (mig 267).
  IF NEW.can_manage_inventory IS DISTINCT FROM OLD.can_manage_inventory
     AND v_role IS DISTINCT FROM 'owner'
  THEN
    RAISE EXCEPTION 'Solo el owner de la organización puede conceder o quitar el permiso de almacén.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Un miembro no se reactiva a sí mismo.
  IF NEW.user_id = v_uid AND OLD.is_active = false AND NEW.is_active = true THEN
    RAISE EXCEPTION 'Un miembro desactivado no puede reactivarse a sí mismo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;

COMMENT ON FUNCTION organization_members_guard() IS
  'Seguridad (migs 235/267): congela user_id/organization_id, reserva el rol owner y el permiso de almacén al owner, e impide la auto-reactivación. Exime rutas de sistema (sin auth.uid()).';
