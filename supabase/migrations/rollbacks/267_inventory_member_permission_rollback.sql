-- Rollback 267: vuelve al helper de la 266 (todos los doctores) y al
-- trigger de la 235 (sin la regla del permiso de almacén). Reaplicar la
-- sección del trigger de 235_security_members_hardening.sql y luego:

CREATE OR REPLACE FUNCTION public.is_org_inventory_editor(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role IN ('owner', 'admin', 'doctor')
      AND is_active = true
  )
$$;

ALTER TABLE organization_members DROP COLUMN IF EXISTS can_manage_inventory;
