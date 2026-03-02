-- =============================================
-- ORGANIZACIONES (migración segura - limpia estado previo)
-- Ejecuta esto en Supabase SQL Editor
-- =============================================

-- Limpiar tablas/policies de intentos anteriores
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- =============================================
-- TABLA: organizations
-- =============================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE TRIGGER set_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- TABLA: organization_members
-- =============================================
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'doctor', 'assistant', 'member')),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(organization_id, user_id)
);

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

-- Trigger updated_at
CREATE TRIGGER set_updated_at_org_members
  BEFORE UPDATE ON organization_members
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =============================================
-- POLICIES: organizations (después de crear ambas tablas)
-- =============================================

-- Owner puede ver su organización
CREATE POLICY "Org owner can view own org"
  ON organizations FOR SELECT
  USING (auth.uid() = owner_id);

-- Owner puede actualizar su organización
CREATE POLICY "Org owner can update own org"
  ON organizations FOR UPDATE
  USING (auth.uid() = owner_id);

-- Usuarios autenticados pueden crear organizaciones
CREATE POLICY "Authenticated users can create orgs"
  ON organizations FOR INSERT
  WITH CHECK (auth.uid() = owner_id);

-- Miembros pueden ver la organización
CREATE POLICY "Org members can view org"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organizations.id
        AND organization_members.user_id = auth.uid()
    )
  );

-- =============================================
-- POLICIES: organization_members
-- =============================================

-- Miembros pueden ver otros miembros de su org
CREATE POLICY "Members can view org members"
  ON organization_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members AS om
      WHERE om.organization_id = organization_members.organization_id
        AND om.user_id = auth.uid()
    )
  );

-- Owner puede agregar miembros
CREATE POLICY "Org owner can add members"
  ON organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_members.organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

-- Owner puede actualizar miembros
CREATE POLICY "Org owner can update members"
  ON organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_members.organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

-- Owner puede eliminar miembros
CREATE POLICY "Org owner can delete members"
  ON organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_members.organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

-- =============================================
-- Agregar organization_id a organization_subscriptions
-- =============================================
ALTER TABLE organization_subscriptions
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Limpiar policy si existe de intento anterior
DROP POLICY IF EXISTS "Org members can view org subscriptions" ON organization_subscriptions;

CREATE POLICY "Org members can view org subscriptions"
  ON organization_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM organization_members
      WHERE organization_members.organization_id = organization_subscriptions.organization_id
        AND organization_members.user_id = auth.uid()
    )
  );
