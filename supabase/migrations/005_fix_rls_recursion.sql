-- =============================================
-- FIX: Recursión infinita en RLS policies
-- El problema: organization_members INSERT checks organizations,
-- y organizations SELECT checks organization_members = loop infinito
-- Ejecuta esto en Supabase SQL Editor
-- =============================================

-- 1. Eliminar policies que causan recursión
DROP POLICY IF EXISTS "Org members can view org" ON organizations;
DROP POLICY IF EXISTS "Members can view org members" ON organization_members;
DROP POLICY IF EXISTS "Org owner can add members" ON organization_members;
DROP POLICY IF EXISTS "Org owner can update members" ON organization_members;
DROP POLICY IF EXISTS "Org owner can delete members" ON organization_members;

-- 2. Recrear policies SIN recursión

-- organization_members: los usuarios pueden ver sus propias membresías
CREATE POLICY "Users can view own memberships"
  ON organization_members FOR SELECT
  USING (auth.uid() = user_id);

-- organization_members: el owner de la org puede insertar miembros
-- (usa solo organizations.owner_id, que no recurre a organization_members)
CREATE POLICY "Org owner can add members"
  ON organization_members FOR INSERT
  WITH CHECK (
    auth.uid() = user_id  -- puede insertarse a sí mismo
    OR
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

-- organization_members: el owner puede actualizar miembros
CREATE POLICY "Org owner can update members"
  ON organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_id
        AND organizations.owner_id = auth.uid()
    )
  );

-- organization_members: el owner puede eliminar miembros
CREATE POLICY "Org owner can delete members"
  ON organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM organizations
      WHERE organizations.id = organization_id
        AND organizations.owner_id = auth.uid()
    )
  );
