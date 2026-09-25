-- Stub para las migraciones 270/271: lo que ellas usan de migraciones que
-- este harness no aplica (240 zona horaria, 248 catálogo de recetas, 267
-- permiso de almacén). Copia literal de la función de la 267.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone text;
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS can_manage_inventory boolean NOT NULL DEFAULT false;

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

CREATE TABLE IF NOT EXISTS medication_catalog (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (btrim(name) <> ''),
  concentration         text,
  inventory_product_id  uuid REFERENCES inventory_products(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS medication_catalog_org_name_uniq
  ON medication_catalog (organization_id, lower(btrim(name)), lower(coalesce(btrim(concentration), '')));
CREATE UNIQUE INDEX IF NOT EXISTS medication_catalog_product_uniq
  ON medication_catalog (organization_id, inventory_product_id)
  WHERE inventory_product_id IS NOT NULL;
