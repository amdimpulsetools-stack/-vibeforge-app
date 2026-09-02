-- Rollback de la mig 237. Restaura las policies legacy de la mig 004
-- tal como estaban en producción (SIN "Org members can view org", que
-- tampoco existía en prod) y elimina el trigger guard.
--
-- Ojo: volver a este estado re-introduce el bug de branding (los
-- miembros no-owner dejan de poder leer la fila de su organización).

DROP TRIGGER IF EXISTS trg_organizations_guard ON organizations;
DROP FUNCTION IF EXISTS organizations_guard();

DROP POLICY IF EXISTS org_select_organizations ON organizations;
DROP POLICY IF EXISTS org_update_organizations ON organizations;
DROP POLICY IF EXISTS org_insert_organizations ON organizations;

CREATE POLICY "Org owner can view own org"
  ON organizations FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "Org owner can update own org"
  ON organizations FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "Authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);
