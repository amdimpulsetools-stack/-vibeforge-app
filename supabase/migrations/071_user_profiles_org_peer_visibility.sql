-- Allow org members to view profiles of users in the same organization
-- Previously only "Users can view own profile" existed (auth.uid() = id)
-- This caused joins with user_profiles to return null for other members

CREATE POLICY "Members can view org peer profiles"
  ON user_profiles FOR SELECT
  USING (
    id IN (
      SELECT om.user_id FROM organization_members om
      WHERE om.organization_id IN (SELECT get_user_org_ids())
    )
  );
