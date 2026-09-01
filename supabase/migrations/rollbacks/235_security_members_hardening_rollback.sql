-- Rollback de la mig 235. Restaura los helpers a su versión previa (013/032,
-- sin filtro is_active), elimina el trigger anti-escalada y devuelve
-- org_insert_members a su forma original.
--
-- NO recrea las policies de la mig 005 ("Org owner can add members" y
-- compañía): eran el hallazgo crítico C1 y ningún flujo las necesita.

DROP TRIGGER IF EXISTS trg_organization_members_guard ON organization_members;
DROP FUNCTION IF EXISTS organization_members_guard();

DROP POLICY IF EXISTS org_insert_members ON organization_members;
CREATE POLICY org_insert_members
  ON organization_members FOR INSERT
  WITH CHECK (is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid()
    AND organization_id = org_id
    AND role IN ('owner', 'admin')
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_user_org_role(org_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM organization_members
  WHERE user_id = auth.uid() AND organization_id = org_id
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
